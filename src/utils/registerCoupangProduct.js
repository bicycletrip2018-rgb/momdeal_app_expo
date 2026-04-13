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
import CryptoJS from 'crypto-js';

// ─── Coupang Partners API ─────────────────────────────────────────────────────
const ACCESS_KEY = process.env.EXPO_PUBLIC_COUPANG_ACCESS_KEY;
const SECRET_KEY = process.env.EXPO_PUBLIC_COUPANG_SECRET_KEY;

const generateHmac = (method, url, secretKey, accessKey) => {
  const parts = url.split(/\?/);
  const [path, query = ''] = parts;

  const now = new Date();
  const year    = String(now.getUTCFullYear()).slice(-2);
  const month   = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day     = String(now.getUTCDate()).padStart(2, '0');
  const hours   = String(now.getUTCHours()).padStart(2, '0');
  const minutes = String(now.getUTCMinutes()).padStart(2, '0');
  const seconds = String(now.getUTCSeconds()).padStart(2, '0');

  const datetime = `${year}${month}${day}T${hours}${minutes}${seconds}Z`;

  const message = datetime + method + path + query;
  const signature = CryptoJS.HmacSHA256(message, secretKey).toString(CryptoJS.enc.Hex);

  return `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${datetime}, signature=${signature}`;
};

const getPartnersLink = async (originalUrl) => {
  if (!ACCESS_KEY || !SECRET_KEY || ACCESS_KEY.includes('여기에') || ACCESS_KEY === '') {
    console.log('🚨 [Partners] API keys missing in .env');
    return { url: originalUrl, success: false, error: 'API 키가 설정되지 않았습니다 (.env 확인 필요)' };
  }
  try {
    const method = 'POST';
    const domain = 'https://api-gateway.coupang.com';
    const path   = '/v2/providers/affiliate_open_api/apis/openapi/v1/deeplink';
    const authorization = generateHmac(method, path, SECRET_KEY, ACCESS_KEY);

    const response = await fetch(domain + path, {
      method,
      headers: { 'Authorization': authorization, 'Content-Type': 'application/json' },
      body: JSON.stringify({ coupangUrls: [originalUrl] }),
    });
    const data = await response.json();
    if (data.rCode === '0' && data.data?.length > 0) {
      return { url: data.data[0].shortenUrl, success: true, error: null };
    }
    return { url: originalUrl, success: false, error: data.rMessage || JSON.stringify(data) };
  } catch (error) {
    console.error('[Partners] API Error:', error);
    return { url: originalUrl, success: false, error: error.message };
  }
};

const scrapeOgTags = async (url) => {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6)' },
    });
    const html = await res.text();
    const titleMatch = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]*)"[^>]*>/i);
    const imageMatch = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]*)"[^>]*>/i);
    let title = titleMatch ? titleMatch[1] : '쿠팡 상품';
    let image = imageMatch ? imageMatch[1] : '';
    if (image.startsWith('//')) image = 'https:' + image;
    const isRocket = title.includes('로켓') || html.includes('로켓배송');
    return { title, image, isRocket };
  } catch (error) {
    console.log('[OG Scrape] Failed:', error);
    return { title: '쿠팡 상품', image: '', isRocket: false };
  }
};

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

  // ── Hybrid: OG scrape for UI + Partners API for monetized link ──────────────
  const [ogData, monetizedResult] = await Promise.all([
    scrapeOgTags(url),
    getPartnersLink(url),
  ]);
  const monetizedUrl = monetizedResult.url;

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
      name: ogData.title !== '쿠팡 상품' ? ogData.title : 'unknown',
      brand: '',
      category: '',
      currentPrice: 0,
      status: 'active',
      source: 'coupang',
      image: ogData.image || '',
      affiliateUrl: monetizedUrl,
      isRocket: ogData.isRocket,
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
    await updateDoc(productRef, {
      affiliateUrl: monetizedUrl,
      updatedAt: serverTimestamp(),
      ...(ogData.image ? { image: ogData.image } : {}),
    });
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

  return {
    ok: true,
    productGroupId,
    name: ogData.title,
    image: ogData.image,
    isRocket: ogData.isRocket,
    affiliateUrl: monetizedUrl,
    isMonetized: monetizedResult.success,
    apiError: monetizedResult.error,
  };
}
