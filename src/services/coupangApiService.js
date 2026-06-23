import { httpsCallable, connectFunctionsEmulator } from 'firebase/functions';
import { functions } from '../firebase/config';
if (__DEV__) {
  connectFunctionsEmulator(functions, '192.168.0.83', 5001);
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

const RAW_BRIDGE_GOLDBOX = [
  { id: 'bg1', name: '하기스 네이처메이드 기저귀 신생아 100매', currentPrice: 28900, originalPrice: 52900, discount: 45, isRocket: true  },
  { id: 'bg2', name: '매일유업 앱솔루트 분유 스텝2 800g',       currentPrice: 39800, originalPrice: 62000, discount: 36, isRocket: true  },
  { id: 'bg3', name: '피죤 아기 세탁세제 3L 대용량 무향',       currentPrice: 8900,  originalPrice: 12800, discount: 30, isRocket: false },
  { id: 'bg4', name: '프리미엄베베 순한 아기 로션 400ml 무향',  currentPrice: 13900, originalPrice: 21400, discount: 35, isRocket: true  },
];

// Strict peer-deal schema: name, currentPrice, originalPrice, discountRate, image
// Also includes `discount` alias so HorizontalCard (item.discount) renders the pill.
const BRIDGE_PEER_FALLBACK = [
  { productGroupId: 'bp1', name: '유한킴벌리 하기스 물티슈 100매×10팩', currentPrice: 18900, originalPrice: 26000, discountRate: 27, discount: 27, image: 'https://via.placeholder.com/150', isRocket: true  },
  { productGroupId: 'bp2', name: '탐사 순한 아기 기저귀 신생아 100매',   currentPrice: 15900, originalPrice: 22000, discountRate: 28, discount: 28, image: 'https://via.placeholder.com/150', isRocket: true  },
  { productGroupId: 'bp3', name: '피죤 베이비 세탁세제 2.5L 무향',       currentPrice: 10900, originalPrice: 15800, discountRate: 31, discount: 31, image: 'https://via.placeholder.com/150', isRocket: false },
  { productGroupId: 'bp4', name: '비즈앤젤 아기 로션 400ml 무향',        currentPrice: 7900,  originalPrice: 11800, discountRate: 33, discount: 33, image: 'https://via.placeholder.com/150', isRocket: true  },
];

const BRIDGE_GOLDBOX_FALLBACK = RAW_BRIDGE_GOLDBOX.map((r) => toHCardItem(r, r.id));

export async function fetchGoldboxDeals(limit = 10) {
  try {
    const fn  = httpsCallable(functions, 'getGoldboxDeals');
    const res = await fn({ limit });
    const arr = Array.isArray(res.data) ? res.data : (res.data?.products ?? []);
    const mapped = arr.map((item, i) => toHCardItem(item, `g${i}`));
    return mapped.length > 0 ? mapped : BRIDGE_GOLDBOX_FALLBACK;
  } catch (e) {
    console.warn('[fetchGoldboxDeals] bridge fallback:', e?.message ?? e);
    return BRIDGE_GOLDBOX_FALLBACK;
  }
}

export async function fetchPeerBestDeals({ categoryId = 1014, limit = 10 } = {}) {
  try {
    const fn  = httpsCallable(functions, 'getBestCategoryProducts');
    const res = await fn({ categoryId, limit });
    const arr = res.data?.products ?? [];
    const mapped = arr.map((item, i) => ({
      productGroupId: String(item.productId || item.id || `p${i}`),
      name:          String(item.name || item.productName || '쿠팡 상품'),
      currentPrice:  Number(item.currentPrice ?? item.productPrice ?? item.price ?? 0),
      originalPrice: item.originalPrice != null ? Number(item.originalPrice) : null,
      discountRate:  item.discountRate  != null ? Number(item.discountRate)  : (item.discount != null ? Number(item.discount) : null),
      discount:      item.discountRate  != null ? Number(item.discountRate)  : (item.discount != null ? Number(item.discount) : null),
      image:         normalizeImage(extractImageDeep(item) || '') || '',
      isRocket:      item.isRocket === true,
    }));
    return mapped.length > 0 ? mapped : BRIDGE_PEER_FALLBACK;
  } catch (e) {
    console.warn('[fetchPeerBestDeals] bridge fallback:', e?.message ?? e);
    return BRIDGE_PEER_FALLBACK;
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

const PL_DEALS_FALLBACK = [
  { id: 'pl1', name: '코멧 탐사 아기 물티슈 캡형 100매 × 10팩', currentPrice: 18900, originalPrice: 26000, discountRate: 27, discount: 27, isRocket: true  },
  { id: 'pl2', name: '탐사 기저귀 밴드형 대형 60매',              currentPrice: 15900, originalPrice: 22000, discountRate: 28, discount: 28, isRocket: true  },
  { id: 'pl3', name: '피죤 아기 순한 세탁세제 3L 무향',            currentPrice: 8900,  originalPrice: 12800, discountRate: 30, discount: 30, isRocket: false },
  { id: 'pl4', name: '하기스 물티슈 리필형 100매 × 6팩',           currentPrice: 12900, originalPrice: 18000, discountRate: 28, discount: 28, isRocket: true  },
];

export async function fetchPLDeals() {
  try {
    const results = await searchCoupangProducts('탐사 기저귀');
    return results.length > 0 ? results : PL_DEALS_FALLBACK.map((r) => toHCardItem(r, r.id));
  } catch {
    return PL_DEALS_FALLBACK.map((r) => toHCardItem(r, r.id));
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
