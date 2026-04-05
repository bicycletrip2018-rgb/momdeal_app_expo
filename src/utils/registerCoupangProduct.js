import {
  collection,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { fetchCoupangProductMetadata } from '../services/productMetadataService';
import { generateProductTags } from '../services/productTagService';
import { recordPrice } from '../services/priceTrackingService';
import { checkPriceAlerts } from '../services/priceAlertService';

const PRODUCT_GROUP_ID_REGEX = /\/v[mp]\/products\/(\d+)/i;
const ITEM_ID_REGEX = /[?&]itemId=(\d+)/i;

const extractProductGroupId = (url) => {
  if (typeof url !== 'string') return '';
  return url.trim().match(PRODUCT_GROUP_ID_REGEX)?.[1] || '';
};

const extractItemId = (url) => {
  if (typeof url !== 'string') return '';
  return url.trim().match(ITEM_ID_REGEX)?.[1] || '';
};

const buildCanonicalUrl = (productGroupId) =>
  `https://m.coupang.com/vm/products/${productGroupId}`;

// ─── Validation ───────────────────────────────────────────────────────────────

const VALID_SELLER_TYPES   = new Set(['coupang', 'seller', 'unknown']);
const VALID_DELIVERY_TYPES = new Set(['rocket', 'normal', 'fresh', 'global', 'unknown']);

// Validates the inline-array payload (options/offers/optionStats) before writing.
// Returns { valid: boolean, errors: string[] }.
// Does NOT validate the product document itself — productGroupId is checked upstream.
const validateInlinePayload = ({ productGroupId, optionId, offerId, offers, optionStats }) => {
  const errors = [];

  if (typeof productGroupId !== 'string' || !productGroupId.trim()) {
    errors.push('productGroupId must be a non-empty string');
  }
  if (optionId !== null && (typeof optionId !== 'string' || !optionId.trim())) {
    errors.push(`optionId must be a non-empty string, got: ${optionId}`);
  }
  if (offerId !== null && (typeof offerId !== 'string' || !offerId.trim())) {
    errors.push(`offerId must be a non-empty string, got: ${offerId}`);
  }

  (offers || []).forEach((offer) => {
    const tag = offer.offerId || '(no offerId)';
    if (typeof offer.price !== 'number' || offer.price < 0) {
      errors.push(`offers[${tag}].price must be number >= 0, got: ${offer.price}`);
    }
    if (typeof offer.affiliateUrl !== 'string' || !offer.affiliateUrl.trim()) {
      errors.push(`offers[${tag}].affiliateUrl must be a non-empty string`);
    }
    if (!VALID_SELLER_TYPES.has(offer.sellerType)) {
      errors.push(`offers[${tag}].sellerType "${offer.sellerType}" not in [${[...VALID_SELLER_TYPES]}]`);
    }
    if (!VALID_DELIVERY_TYPES.has(offer.deliveryType)) {
      errors.push(`offers[${tag}].deliveryType "${offer.deliveryType}" not in [${[...VALID_DELIVERY_TYPES]}]`);
    }
  });

  Object.entries(optionStats || {}).forEach(([optId, stats]) => {
    for (const field of ['clickCount', 'conversionCount', 'trackingCount', 'reviewCount']) {
      if (typeof stats[field] !== 'number' || stats[field] < 0) {
        errors.push(`optionStats[${optId}].${field} must be number >= 0, got: ${stats[field]}`);
      }
    }
  });

  return { valid: errors.length === 0, errors };
};

// Derives a stable, item-independent key from a Korean option name.
// Merges entries that differ only by itemId but represent the same logical option.
//
// Extraction rules:
//   단계  → "stage{N}"   e.g. "3단계"      → "stage3"
//   매     → "{N}"        e.g. "56매"       → "56"
//   팩     → "p{N}"       e.g. "2팩"        → "p2"
//
// Examples:
//   "3단계 56매"       → "stage3_56"
//   "3단계 112매"      → "stage3_112"
//   "3단계 56매 2팩"   → "stage3_56_p2"
//   "56매"             → "56"
//   (unrecognised)     → null
export const normalizeOptionKey = (name) => {
  if (typeof name !== 'string' || !name.trim()) return null;

  const stageMatch = name.match(/(\d+)\s*단계/);
  const qtyMatch   = name.match(/(\d+)\s*매/);
  const packMatch  = name.match(/(\d+)\s*팩/);

  const stage = stageMatch ? `stage${stageMatch[1]}` : null;
  const qty   = qtyMatch   ? qtyMatch[1]              : null;
  const pack  = packMatch  ? `p${packMatch[1]}`        : null;

  const parts = [stage, qty, pack].filter(Boolean);
  return parts.length > 0 ? parts.join('_') : null;
};

export async function registerCoupangProduct(inputUrl) {
  let url = typeof inputUrl === 'string' ? inputUrl.trim() : '';

  if (url.includes('link.coupang.com')) {
    try {
      const response = await fetch(url, { redirect: 'follow' });
      url = response.url || url;
    } catch (error) {
      console.log('Short URL resolution failed:', error);
      return { ok: false, errorMessage: '링크 처리 중 오류가 발생했습니다. 다시 시도해 주세요.' };
    }
  }

  const productGroupId = extractProductGroupId(url);

  if (!productGroupId) {
    return { ok: false, errorMessage: '쿠팡 상품 링크를 다시 확인해 주세요.' };
  }

  const itemId = extractItemId(url);

  // ── 1. Product document ────────────────────────────────────────────────────
  const productRef  = doc(db, 'products', productGroupId);
  const productSnap = await getDoc(productRef);

  if (!productSnap.exists()) {
    await setDoc(productRef, {
      productGroupId,
      name: 'unknown',
      brand: '',
      category: '',
      currentPrice: 0,
      status: 'active',
      source: 'coupang',
      tags: [],
      stageTags: [],
      problemTags: [],
      categoryTags: [],
      ageMinMonth: null,
      ageMaxMonth: null,
      options: [],
      offers: [],
      optionStats: {},
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } else {
    await updateDoc(productRef, { updatedAt: serverTimestamp() });
  }

  // ── 2. Metadata (fetched early so optionKey can be derived before arrays) ──
  const existingData  = productSnap.exists() ? productSnap.data() : {};
  let name            = existingData.name         || 'unknown';
  let currentPrice    = typeof existingData.currentPrice === 'number' ? existingData.currentPrice : 0;
  let image           = existingData.image        || '';

  let metaOptionName  = null;
  let metaPrice       = null;
  let metaSellerType  = 'unknown';
  let metaDelivery    = 'unknown';
  let metaIsRocket    = false;
  let metaIsOutOfStock = false;

  try {
    const metadata = await fetchCoupangProductMetadata(productGroupId, itemId);

    if (metadata.name && metadata.name !== '쿠팡 상품' && metadata.name !== 'unknown' && !metadata.name.includes('Access Denied')) {
      name = metadata.name;
    }
    if (typeof metadata.price === 'number' && metadata.price > 0) {
      currentPrice = metadata.price;
      metaPrice    = metadata.price;
    }
    if (metadata.image)          image           = metadata.image;
    if (metadata.optionName)     metaOptionName  = metadata.optionName;
    if (metadata.sellerType)     metaSellerType  = metadata.sellerType;
    if (metadata.deliveryType)   metaDelivery    = metadata.deliveryType;
    metaIsRocket    = metadata.isRocket    ?? false;
    metaIsOutOfStock = metadata.isOutOfStock ?? false;
  } catch (error) {
    console.log('metadata extraction failed', error);
  }

  // ── 3. Resolve optionId via normalisation ──────────────────────────────────
  // optionKey is derived from the human-readable option name so that different
  // itemIds that represent the same logical variant share one optionId.
  // Falls back to opt_{itemId} if normalisation yields nothing.
  const optionKey = normalizeOptionKey(metaOptionName);
  const optionId  = optionKey ?? (itemId ? `opt_${itemId}` : null);
  const offerId   = itemId ? `${productGroupId}_${itemId}` : null;

  // ── 4. Inline arrays ───────────────────────────────────────────────────────
  const existingOptions     = Array.isArray(existingData.options)  ? existingData.options  : [];
  const existingOffers      = Array.isArray(existingData.offers)   ? existingData.offers   : [];
  const existingOptionStats = existingData.optionStats ?? {};

  let pendingOptions     = existingOptions;
  let pendingOffers      = existingOffers;
  let pendingOptionStats = existingOptionStats;

  if (optionId && offerId) {
    // options[]: add if optionId not yet present; use real name if available
    const optionExists = existingOptions.some((o) => o.optionId === optionId);
    pendingOptions = optionExists
      ? existingOptions
      : [...existingOptions, { optionId, name: metaOptionName || 'unknown' }];

    // offers[]: replace entry with same offerId, or append with full metadata
    const offerEntry = {
      offerId,
      optionId,
      price:        metaPrice ?? 0,
      affiliateUrl: url,
      sellerType:   metaSellerType,
      deliveryType: metaDelivery,
      isRocket:     metaIsRocket,
      score:        0,
    };
    const offerExists = existingOffers.some((o) => o.offerId === offerId);
    pendingOffers = offerExists
      ? existingOffers.map((o) => (o.offerId === offerId ? { ...o, ...offerEntry } : o))
      : [...existingOffers, offerEntry];

    // optionStats: initialise for new optionKey; accumulate if already exists
    pendingOptionStats = optionExists
      ? existingOptionStats
      : {
          ...existingOptionStats,
          [optionId]: {
            clickCount:      0,
            conversionCount: 0,
            trackingCount:   1,
            reviewCount:     0,
            lastUpdatedAt:   serverTimestamp(),
          },
        };
  }

  // ── 5. Price-history subcollection ─────────────────────────────────────────
  const offerDocRef         = doc(collection(db, 'products', productGroupId, 'offers'));
  const subcollectionOfferId = offerId ?? offerDocRef.id;

  await setDoc(offerDocRef, {
    offerId:     subcollectionOfferId,
    productGroupId,
    checkedAt:   serverTimestamp(),
    mallName:    'coupang',
    price:       metaPrice ?? 0,
    isOutOfStock: metaIsOutOfStock,
    url:         buildCanonicalUrl(productGroupId) || url,
  });

  // ── 6. Single write: inline arrays + product fields ────────────────────────
  // Validate before merging inline arrays into the write payload.
  // Invalid inline data is skipped; product-level fields still write.
  let inlineArrayFields = {};
  if (optionId && offerId) {
    const { valid, errors } = validateInlinePayload({
      productGroupId,
      optionId,
      offerId,
      offers:       pendingOffers,
      optionStats:  pendingOptionStats,
    });
    if (valid) {
      inlineArrayFields = { options: pendingOptions, offers: pendingOffers, optionStats: pendingOptionStats };
    } else {
      console.log('[Validation] Skipping inline array write for', productGroupId, '—', errors);
    }
  }

  await updateDoc(productRef, {
    ...inlineArrayFields,
    name,
    currentPrice,
    image,
    updatedAt: serverTimestamp(),
  });

  // ── 7. Tags ────────────────────────────────────────────────────────────────
  const tags = generateProductTags({
    name,
    category: existingData.category || '',
  });

  await updateDoc(productRef, {
    stageTags:    Array.isArray(tags?.stageTags)    ? tags.stageTags    : [],
    problemTags:  Array.isArray(tags?.problemTags)  ? tags.problemTags  : [],
    categoryTags: Array.isArray(tags?.categoryTags) ? tags.categoryTags : [],
    updatedAt:    serverTimestamp(),
  });

  recordPrice(productGroupId, currentPrice, 'coupang').catch(() => {});
  checkPriceAlerts(productGroupId).catch(() => {});

  return { ok: true, productGroupId };
}
