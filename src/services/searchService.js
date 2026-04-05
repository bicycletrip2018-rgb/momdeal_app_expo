import { addDoc, collection, getDocs, limit, query, serverTimestamp, where } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { searchCoupangProducts } from './coupangApiService';

// Minimum local results before triggering Coupang fallback
const MIN_LOCAL_RESULTS = 5;

/**
 * Hybrid search:
 *   1. Firestore local — single-field query (status==active) + client-side text filter
 *   2. Coupang fallback — called when local results < MIN_LOCAL_RESULTS
 *
 * Each result has a `source` field: 'local' | 'coupang'.
 * productGroupId is always the primary key (equals Firestore doc ID for local items).
 *
 * @param {string} queryText
 * @returns {Promise<Array>}
 */
export async function searchProducts(queryText) {
  if (!queryText || !queryText.trim()) return [];
  const q = queryText.trim().toLowerCase();

  // Step 1: Firestore — no composite index; single-field status filter, text filter client-side
  const snap = await getDocs(
    query(collection(db, 'products'), where('status', '==', 'active'), limit(50))
  );
  const localResults = snap.docs
    .map((d) => ({ productGroupId: d.id, source: 'local', ...d.data() }))
    .filter((p) => {
      const nameLower = (p.name || '').toLowerCase();
      const cats = Array.isArray(p.categoryTags) ? p.categoryTags : [];
      return (
        nameLower.includes(q) ||
        cats.some((c) => (c || '').toLowerCase().includes(q))
      );
    })
    .slice(0, 20);

  if (localResults.length >= MIN_LOCAL_RESULTS) return localResults;

  // Step 2: Coupang fallback — deduplicate against already-found local items
  const localIds = new Set(localResults.map((p) => p.productGroupId));
  const coupangResults = await searchCoupangProducts(queryText.trim(), 20).catch(() => []);
  const merged = [
    ...localResults,
    ...coupangResults
      .filter((p) => !localIds.has(p.productGroupId))
      .map((p) => ({ ...p, source: 'coupang' })),
  ];

  return merged.slice(0, 20);
}

/**
 * Fire-and-forget: logs a search_query action to user_product_actions.
 * Called without await — never blocks the UI.
 */
export function logSearchQuery(queryText) {
  if (!queryText || !queryText.trim()) return;
  const userId = auth.currentUser?.uid ?? null;
  addDoc(collection(db, 'user_product_actions'), {
    userId,
    actionType: 'search_query',
    query: queryText.trim(),
    createdAt: serverTimestamp(),
  }).catch(() => {});
}
