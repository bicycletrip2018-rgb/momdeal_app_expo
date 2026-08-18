import { httpsCallable, connectFunctionsEmulator } from 'firebase/functions';
import { functions } from '../firebase/config';

// Opt-in only — this used to fire unconditionally whenever __DEV__ was true,
// which is *every* local/dev-client build (RULE-01 requires --dev-client for
// all local testing). That silently routed every product API call to one
// developer's home LAN IP and made all product data time out for anyone not
// on that exact network. Real Firebase Functions is the correct default;
// set EXPO_PUBLIC_FUNCTIONS_EMULATOR_HOST to opt into a local emulator.
const EMULATOR_HOST = process.env.EXPO_PUBLIC_FUNCTIONS_EMULATOR_HOST;
if (__DEV__ && EMULATOR_HOST) {
  connectFunctionsEmulator(functions, EMULATOR_HOST, 5001);
}

const normalizeImage = (img) => {
  if (!img) return null;
  let safe = String(img).trim();
  if (safe.startsWith('//')) safe = 'https:' + safe;
  return safe.replace(/^http:\/\//i, 'https://');
};
const forceHttps = normalizeImage;

const extractImageDeep = (obj) => {
  if (!obj) return null;
  if (typeof obj === 'object') {
    for (const k of ['image', 'productImage', 'thumbnail', 'thumbnailUrl', 'img', 'imageUrl']) {
      if (typeof obj[k] === 'string' && obj[k].length > 5) return obj[k];
    }
  }
  if (typeof obj === 'string') {
    const lower = obj.toLowerCase();
    if ((lower.includes('coupangcdn.com') || lower.includes('coupang.com')) &&
        (lower.startsWith('http') || lower.startsWith('//'))) return obj;
    return null;
  }
  if (typeof obj === 'object') {
    for (const key of Object.keys(obj)) {
      const found = extractImageDeep(obj[key]);
      if (found) return found;
    }
  }
  return null;
};

// Shared mapper for deal items (goldbox / peer best).
// Handles both camelCase API field names (productName, productPrice, productImage)
// and plain field names (name, price, image) used in some CF response shapes.
const stripDebug = (s) => String(s || '').replace(/\[LIVE서버\]|\[API 브릿지 우회\]/g, '').trim();

const mapDealItem = (item) => {
  const rawName = typeof item.name        === 'string' ? item.name
                : typeof item.productName === 'string' ? item.productName
                : '쿠팡 상품';
  const name = stripDebug(rawName) || '쿠팡 상품';
  const price = typeof item.currentPrice === 'number' ? item.currentPrice
              : typeof item.productPrice === 'number' ? item.productPrice
              : typeof item.price        === 'number' ? item.price
              : null;
  const image = normalizeImage(extractImageDeep(item) || '') || '';
  const affiliateUrl = (typeof item.affiliateUrl === 'string' && item.affiliateUrl) ? item.affiliateUrl
                     : (typeof item.productUrl   === 'string' && item.productUrl)   ? item.productUrl
                     : null;
  return {
    id:            String(item.productId || ''),
    productGroupId: String(item.productId || ''),
    name,
    brand:         typeof item.brand === 'string' ? item.brand : '',
    price,
    currentPrice:  price,
    originalPrice: typeof item.originalPrice === 'number' ? item.originalPrice : null,
    discount:      typeof item.discountRate === 'number' ? item.discountRate
                 : typeof item.discount    === 'number' ? item.discount
                 : null,
    image,
    affiliateUrl,
    impressionUrl: typeof item.impressionUrl === 'string' ? item.impressionUrl : null,
    isRocket:      item.isRocket === true,
  };
};

// Map CF item → internal product shape. Handles both normProduct schema (name/price/image)
// and raw fallback schema (productName/productPrice/productImage).
const mapSearchItem = (item) => ({
  id:            String(item.productId || ''),
  productGroupId: String(item.productId || ''),
  name:          stripDebug(
                   typeof item.name        === 'string' ? item.name
                 : typeof item.productName === 'string' ? item.productName
                 : '쿠팡 상품'
                 ) || '쿠팡 상품',
  currentPrice:  typeof item.price        === 'number' ? item.price
               : typeof item.productPrice === 'number' ? item.productPrice
               : null,
  originalPrice: typeof item.originalPrice === 'number' ? item.originalPrice : null,
  discountRate:  typeof item.discountRate  === 'number' ? item.discountRate  : null,
  discount:      typeof item.discountRate  === 'number' ? item.discountRate  : null,
  image:         normalizeImage(extractImageDeep(item) || '') || '',
  affiliateUrl:  typeof item.affiliateUrl === 'string' ? item.affiliateUrl : null,
  isRocket:      item.isRocket === true,
  isFreeShipping: item.isFreeShipping === true,
});

/**
 * Search Coupang catalog via backend Cloud Function.
 * Returns array of products in internal shape.
 */
export async function searchCoupangProducts(keyword, limit = 20) {
  if (!keyword || !keyword.trim()) return [];
  const fn = httpsCallable(functions, 'searchProducts');
  const result = await fn({ keyword: keyword.trim(), limit });
  return (result.data?.products ?? []).map(mapSearchItem);
}

/**
 * Fetch best-selling products for a Coupang category via backend Cloud Function.
 * @param {number} categoryId — Coupang category ID (e.g. 1011)
 * @param {number} limit — max items to return (default 20)
 */
export async function fetchBestCategoryProducts(categoryId, limit = 20) {
  if (!categoryId) return [];
  const fn = httpsCallable(functions, 'getBestCategoryProducts');
  const result = await fn({ categoryId, limit });
  return (result.data?.products ?? []).map(mapSearchItem);
}

// Single normalizer — BOTH the success path and the catch fallback run through
// this so HorizontalCard always receives an identical schema regardless of source.
const toHCardItem = (raw, fallbackId) => {
  const price = raw.currentPrice != null ? Number(raw.currentPrice)
              : raw.productPrice != null ? Number(raw.productPrice)
              : raw.price        != null ? Number(raw.price)
              : 0;
  return {
    id:            String(raw.id || raw.productId || fallbackId || ''),
    productGroupId: String(raw.id || raw.productId || fallbackId || ''),
    name:          stripDebug(raw.name || raw.productName || '쿠팡 상품') || '쿠팡 상품',
    brand:         String(raw.brand || ''),
    price,
    currentPrice:  price,
    originalPrice: raw.originalPrice != null ? Number(raw.originalPrice) : null,
    discount:      raw.discountRate  != null ? Number(raw.discountRate)
                 : raw.discount     != null ? Number(raw.discount)
                 : null,
    image:          normalizeImage(extractImageDeep(raw) || '') || '',
    affiliateUrl:   raw.affiliateUrl || raw.productUrl || null,
    categoryName:   typeof raw.categoryName === 'string' ? raw.categoryName : null,
    isRocket:       raw.isRocket === true,
    isFreeShipping: raw.isFreeShipping === true,
  };
};

export async function fetchGoldboxDeals(limit = 10) {
  try {
    const fn  = httpsCallable(functions, 'getGoldboxDeals');
    const res = await fn({ limit });
    const arr = Array.isArray(res.data) ? res.data : (res.data?.products ?? []);
    return arr.map((item, i) => toHCardItem(item, `g${i}`));
  } catch (e) {
    console.warn('[fetchGoldboxDeals] failed:', e?.message ?? e);
    return [];
  }
}

export async function fetchPeerBestDeals({ categoryId = 1014, limit = 10 } = {}) {
  try {
    const fn  = httpsCallable(functions, 'getBestCategoryProducts');
    const res = await fn({ categoryId, limit });
    const arr = res.data?.products ?? [];
    return arr.map((item, i) => ({
      productGroupId: String(item.productId || item.id || `p${i}`),
      name:          String(item.name || item.productName || '쿠팡 상품'),
      currentPrice:  Number(item.currentPrice ?? item.productPrice ?? item.price ?? 0),
      originalPrice: item.originalPrice != null ? Number(item.originalPrice) : null,
      discountRate:  item.discountRate  != null ? Number(item.discountRate)  : (item.discount != null ? Number(item.discount) : null),
      discount:      item.discountRate  != null ? Number(item.discountRate)  : (item.discount != null ? Number(item.discount) : null),
      image:         normalizeImage(extractImageDeep(item) || '') || '',
      isRocket:      item.isRocket === true,
    }));
  } catch (e) {
    console.warn('[fetchPeerBestDeals] failed:', e?.message ?? e);
    return [];
  }
}

/**
 * Smart adapter for "출산 맞춤 특가" (Section 1).
 * pregnancy → 1012 (분유/식품), others → 1014 (생활용품). Never 1011.
 * Falls back to '기저귀' keyword search when category fetch returns empty.
 */
export async function fetchPersonalizedDeals(userProfile) {
  const stage      = userProfile?.stage;
  const categoryId = stage === 'pregnancy' ? 1012 : 1014;
  try {
    const result = await fetchBestCategoryProducts(categoryId);
    if (result.length > 0) return result;
    return searchCoupangProducts('기저귀');
  } catch {
    return searchCoupangProducts('기저귀').catch(() => []);
  }
}

/**
 * Baby category best products for "유아동 베스트" (Section 2).
 * Primary: category 1011. Fallback: '기저귀' keyword search.
 */
export async function fetchBabyBestDeals(limit = 10) {
  try {
    const result = await fetchBestCategoryProducts(1011, limit);
    if (result.length > 0) return result;
    return searchCoupangProducts('아기물티슈', limit);
  } catch {
    return searchCoupangProducts('아기물티슈', limit).catch(() => []);
  }
}

export async function fetchPLDeals() {
  try {
    return await searchCoupangProducts('탐사 기저귀');
  } catch {
    return [];
  }
}

/**
 * Get fresh product metadata from Coupang via backend Cloud Function.
 * Returns only the fields to merge into existing product state —
 * { affiliateUrl, currentPrice, image } — caller decides what to apply.
 *
 * @param {string} productGroupId — equals the Firestore document ID (CLAUDE.md rule)
 */
export async function getCoupangProductDetail(productGroupId) {
  const fn = httpsCallable(functions, 'getProductDetail');
  const result = await fn({ productId: productGroupId }); // CF param name stays 'productId'
  const d = result.data;
  return {
    affiliateUrl: typeof d?.affiliateUrl === 'string' && d.affiliateUrl ? d.affiliateUrl : null,
    currentPrice: typeof d?.price === 'number' ? d.price : null,
    image: typeof d?.image === 'string' && d.image ? d.image : null,
  };
}
