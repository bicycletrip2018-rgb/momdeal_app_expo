/**
 * coupangService.js — Coupang Partners API integration layer.
 *
 * STATUS: MOCK — all functions return stub data matching real Coupang API shapes.
 * To activate: replace _callCoupangAPI() with signed HMAC-SHA256 requests using
 * credentials stored in functions/.env (COUPANG_ACCESS_KEY, COUPANG_SECRET_KEY).
 *
 * Real API base URL: https://api-gateway.coupang.com
 *
 * ─── Firestore collection written by this service ─────────────────────────────
 * product_click_logs
 *   userId     : string   — MomDeal user who triggered the click (null = anonymous)
 *   productId  : string   — Coupang numeric product ID
 *   clickedAt  : Timestamp (serverTimestamp)
 *   source     : 'recommendation' | 'search' | 'saved' | 'coupang_reco' | 'deeplink'
 *   deeplink   : string | null  — short affiliate URL that was opened
 *   trackingId : string | null  — {userId}_{productId}_{epoch}, links click → conversion
 */
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';

// ─── Constants ────────────────────────────────────────────────────────────────

// Sub-ID embedded in every deep link URL for revenue attribution.
// Update this value when the Coupang Partners account is approved.
const AFFILIATE_SUB_ID = 'momdeal_v1';

// ─── Type documentation ───────────────────────────────────────────────────────

/**
 * CoupangProduct — shape returned by searchProducts / getRecoProducts.
 * Matches the `productData[]` item in the real Coupang Partners API response.
 *
 * @typedef {Object} CoupangProduct
 * @property {string}       productId       — Coupang numeric product ID (as string)
 * @property {string}       productName
 * @property {string}       productUrl      — canonical Coupang product page URL
 * @property {string|null}  productImage    — CDN image URL
 * @property {number}       salePrice       — current price after discount (KRW)
 * @property {number}       originalPrice   — pre-discount price (KRW)
 * @property {string}       brandName
 * @property {string}       categoryName    — top-level Coupang category label
 * @property {boolean}      isRocket        — Rocket delivery eligibility
 * @property {boolean}      isFreeShipping
 * @property {number|null}  reviewRating    — 0.0–5.0
 * @property {number}       reviewCount
 * @property {string}       source          — always 'coupang'
 */

/**
 * DeeplinkResult — shape returned by createDeeplink.
 *
 * @typedef {Object} DeeplinkResult
 * @property {string}      shortenUrl   — short affiliate URL (https://link.coupang.com/a/...)
 * @property {string}      originalUrl  — original Coupang product URL passed in
 * @property {string}      trackingId   — {userId}_{productId}_{epoch} for conversion attribution
 * @property {string|null} userId       — MomDeal user ID
 * @property {string}      productId    — extracted from productUrl
 * @property {string}      createdAt    — ISO-8601 creation timestamp
 */

// ─── Internal API stub ────────────────────────────────────────────────────────

/**
 * Placeholder for future authenticated Coupang API calls.
 * All public functions route through this to make the swap-in point explicit.
 *
 * To implement:
 *   1. Compute HMAC-SHA256 signature over "{method}{path}{datetime}{body}"
 *   2. Add Authorization header:
 *        CEA algorithm=HmacSHA256, access-key=KEY, signed-date=DATE, signature=SIG
 *   3. Replace the throw below with a real fetch() call.
 *
 * @param {string} _method  — 'GET' | 'POST'
 * @param {string} _path    — API path, e.g. '/v2/providers/affiliate_open_api/...'
 * @param {Object} _params  — query params (GET) or request body (POST)
 * @returns {Promise<Object>}
 */
// eslint-disable-next-line no-unused-vars
async function _callCoupangAPI(_method, _path, _params = {}) {
  throw new Error('[coupangService] API not yet integrated — using mock data.');
}

// ─── Mock data helpers ────────────────────────────────────────────────────────

/**
 * Builds a deterministic mock CoupangProduct from a numeric seed.
 * Prices and ratings are stable across renders for reliable UI development.
 *
 * @param {number} seed
 * @param {Object} [overrides]
 * @returns {CoupangProduct}
 */
function _mockProduct(seed, overrides = {}) {
  const id = String(seed);
  const basePrice = 10000 + (parseInt(id.slice(-4) || '1', 10) % 9) * 5000;
  return {
    productId: id,
    productName: `쿠팡 상품 ${id}`,
    productUrl: `https://www.coupang.com/vp/products/${id}`,
    productImage: null,
    salePrice: Math.round(basePrice * 0.85),
    originalPrice: basePrice,
    brandName: '',
    categoryName: '유아동',
    isRocket: true,
    isFreeShipping: true,
    reviewRating: 4.2,
    reviewCount: 128,
    source: 'coupang',
    ...overrides,
  };
}

// ─── searchProducts ───────────────────────────────────────────────────────────

/**
 * Searches Coupang products by keyword.
 * Returns results sorted by relevance (mock: fixed seed list).
 *
 * Real endpoint: GET /v2/providers/affiliate_open_api/apis/openapi/products/search
 * Real params:   keyword, limit (1–100), subId
 * Real response: { rCode, data: { productData: CoupangProduct[] } }
 *
 * @param {string} keyword
 * @returns {Promise<CoupangProduct[]>}
 */
export async function searchProducts(keyword) {
  if (!keyword) return [];

  // MOCK — swap with:
  // const res = await _callCoupangAPI('GET', '/v2/providers/affiliate_open_api/apis/openapi/products/search', { keyword, subId: AFFILIATE_SUB_ID, limit: 20 });
  // return res.data.productData ?? [];
  const seeds = [112233, 445566, 778899, 101010, 202020];
  return seeds.map((seed, i) =>
    _mockProduct(seed, { productName: `${keyword} 관련 상품 ${i + 1}` })
  );
}

// ─── getRecoProducts ──────────────────────────────────────────────────────────

/**
 * Returns personalized Coupang product recommendations for a user.
 * In production this calls Coupang's best-seller endpoint, filtered by the
 * user's child category profile (derived from `users/{userId}` or `children` collection).
 *
 * Real endpoint: GET /v2/providers/affiliate_open_api/apis/openapi/products/best-sellers
 * Real params:   categoryId (mapped from child categoryTags), subId
 * Real response: { rCode, data: { productData: CoupangProduct[] } }
 *
 * @param {string} userId — MomDeal user ID (for future personalization filtering)
 * @returns {Promise<CoupangProduct[]>}
 */
export async function getRecoProducts(userId) {
  if (!userId) return [];

  // MOCK — swap with:
  // const categoryId = await _resolveCoupangCategoryId(userId);  // map child tags → Coupang category
  // const res = await _callCoupangAPI('GET', '/v2/providers/affiliate_open_api/apis/openapi/products/best-sellers', { categoryId, subId: AFFILIATE_SUB_ID, limit: 10 });
  // return res.data.productData ?? [];
  const seeds = [999001, 999002, 999003];
  return seeds.map((seed) => _mockProduct(seed));
}

// ─── createDeeplink ───────────────────────────────────────────────────────────

/**
 * Generates a trackable affiliate deep link for monetization.
 *
 * The returned trackingId ties this click to a potential Coupang conversion event,
 * enabling revenue attribution per user. Store it in product_click_logs alongside
 * the click event; match it against Coupang's conversion webhook when available.
 *
 * Deep link URL structure (mock):
 *   https://link.coupang.com/a/mock_{productId}?subId={AFFILIATE_SUB_ID}&tracking={trackingId}
 *
 * Real endpoint: POST /v2/providers/affiliate_open_api/apis/openapi/deeplink
 * Real body:     { "coupangUrls": [ productUrl ] }
 * Real response: { rCode, data: [{ shortenUrl, originalUrl, landingUrl }] }
 *
 * @param {string}      productUrl  — canonical Coupang product page URL
 * @param {string|null} userId      — MomDeal user ID for attribution
 * @returns {Promise<DeeplinkResult|null>}
 */
export async function createDeeplink(productUrl, userId) {
  if (!productUrl) return null;

  // Extract productId using the same regex as registerCoupangProduct.js
  const match = productUrl.match(/\/(?:vp|vm)\/products\/(\d+)/i);
  const productId = match?.[1] || 'unknown';

  // trackingId format: {userId}_{productId}_{epoch}
  // Epoch ensures uniqueness per click; userId enables per-user attribution.
  const trackingId = `${userId || 'anon'}_${productId}_${Date.now()}`;

  // MOCK — swap with:
  // const res = await _callCoupangAPI('POST', '/v2/providers/affiliate_open_api/apis/openapi/deeplink', { coupangUrls: [productUrl] });
  // const { shortenUrl, originalUrl } = res.data[0];
  // return { shortenUrl, originalUrl, trackingId, userId: userId || null, productId, createdAt: new Date().toISOString() };
  return {
    shortenUrl: `https://link.coupang.com/a/mock_${productId}?subId=${AFFILIATE_SUB_ID}&tracking=${trackingId}`,
    originalUrl: productUrl,
    trackingId,
    userId: userId || null,
    productId,
    createdAt: new Date().toISOString(),
  };
}

// ─── Click logging ────────────────────────────────────────────────────────────

/**
 * Records a product click to Firestore for conversion and revenue tracking.
 * Call fire-and-forget immediately after opening a deep link.
 *
 * Usage:
 *   const link = await createDeeplink(productUrl, uid);
 *   await Linking.openURL(link.shortenUrl);
 *   logProductClick({ userId: uid, productId: link.productId, source: 'recommendation', deeplink: link.shortenUrl, trackingId: link.trackingId }).catch(() => {});
 *
 * @param {Object}      params
 * @param {string|null} params.userId
 * @param {string}      params.productId
 * @param {string}      params.source    — 'recommendation' | 'search' | 'saved' | 'coupang_reco' | 'deeplink'
 * @param {string|null} [params.deeplink]
 * @param {string|null} [params.trackingId]
 */
export async function logProductClick({
  userId,
  productId,
  source,
  deeplink = null,
  trackingId = null,
}) {
  if (!productId || !source) return;
  await addDoc(collection(db, 'product_click_logs'), {
    userId: userId || null,
    productId,
    clickedAt: serverTimestamp(),
    source,
    deeplink,
    trackingId,
  });
}

// ─── Shape adapter ────────────────────────────────────────────────────────────

/**
 * Converts a CoupangProduct into MomDeal's internal product shape
 * (same structure as a Firestore `products` document).
 *
 * Used by mergeInternalAndCoupangRecommendations in recommendationService.js
 * to normalize external items before mixing them into the recommendation feed.
 * Tag fields (stageTags, categoryTags) are left empty — populate via
 * productTagService.generateProductTags({ name, category }) when needed.
 *
 * @param {CoupangProduct} raw
 * @returns {Object} — internal product shape
 */
export function normalizeCoupangProduct(raw) {
  return {
    productId: raw.productId,
    name: raw.productName,
    brand: raw.brandName || '',
    category: raw.categoryName || '',
    currentPrice: raw.salePrice || 0,
    image: raw.productImage || null,
    source: 'coupang',
    stageTags: [],
    categoryTags: [],
    // Coupang-specific fields preserved for UI badges / filtering
    isRocket: raw.isRocket ?? false,
    isFreeShipping: raw.isFreeShipping ?? false,
    reviewRating: raw.reviewRating ?? null,
    reviewCount: raw.reviewCount ?? 0,
    productUrl: raw.productUrl,
  };
}
