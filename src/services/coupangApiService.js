import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase/config';

// Map CF searchProducts item → internal product shape used by list screens
const mapSearchItem = (item) => ({
  id: String(item.productId || ''),
  productGroupId: String(item.productId || ''),
  name: typeof item.name === 'string' ? item.name : '쿠팡 상품',
  currentPrice: typeof item.price === 'number' ? item.price : null,
  image: typeof item.image === 'string' ? item.image : null,
  affiliateUrl: typeof item.affiliateUrl === 'string' ? item.affiliateUrl : null,
  isRocket: item.isRocket === true,
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
