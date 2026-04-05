import { AppState } from 'react-native';
import {
  addDoc,
  collection,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../firebase/config';

// ─── Constants ────────────────────────────────────────────────────────────────

// Minimum time (ms) a user must spend on the external purchase page
// for the click to count as a "good click" (engaged session).
const RETURN_WINDOW_MS = 10_000; // 10 seconds

// After this timeout the click log is auto-resolved.
// If the user is still on the external page at 60 s, mark stayedLongEnough=true.
const AUTO_RESOLVE_MS = 60_000;

// ─── logProductClick ──────────────────────────────────────────────────────────
//
// Writes a product_click_logs entry and tracks whether the user spent at least
// RETURN_WINDOW_MS on the external purchase page before returning to the app.
//
// IMPORTANT: call this BEFORE Linking.openURL so the AppState listener is
// registered before the app transitions to background.
//
// Collection: product_click_logs
// Schema:
//   userId           : string | null
//   productId        : string
//   clickedAt        : Timestamp
//   priceAtClick     : number | null   — displayed price at click time
//   guidance         : string | null   — price guidance label at click time
//   isGoodDeal       : boolean         — guidance === '지금 구매 추천'
//   deeplinkUrl      : string | null   — affiliate deep link URL that was opened
//   trackingId       : string | null   — {userId}_{productId}_{epoch} for conversion attribution
//   stayedLongEnough : boolean | null  — null until resolved; then:
//                        true  = user spent ≥ 10 s on external page ("good click")
//                        false = user bounced back quickly or URL never opened
//
// "good click" = stayedLongEnough === true
//
export function logProductClick({
  userId,
  productId,
  priceAtClick,
  guidance,
  isGoodDeal,
  deeplinkUrl = null,
  trackingId = null,
}) {
  if (!productId) return;

  let docRef = null;
  let backgroundedAt = null;
  let resolved = false;
  // If AppState resolves before the addDoc promise returns, stash the value here.
  let pendingUpdate = undefined;

  // ── Firestore write (async, non-blocking) ──────────────────────────────────
  addDoc(collection(db, 'product_click_logs'), {
    userId: userId ?? null,
    productId,
    clickedAt: serverTimestamp(),
    priceAtClick: typeof priceAtClick === 'number' ? priceAtClick : null,
    guidance: guidance ?? null,
    isGoodDeal: Boolean(isGoodDeal),
    deeplinkUrl: deeplinkUrl ?? null,
    trackingId: trackingId ?? null,
    stayedLongEnough: null,
  })
    .then((ref) => {
      docRef = ref;
      // Flush any stayedLongEnough value that arrived before the write completed
      if (pendingUpdate !== undefined) {
        updateDoc(docRef, { stayedLongEnough: pendingUpdate }).catch(() => {});
      }
    })
    .catch(() => {});

  // ── Shared resolver ────────────────────────────────────────────────────────
  const resolve = (stayedLongEnough) => {
    if (resolved) return;
    resolved = true;
    try { subscription.remove(); } catch (_) {}
    if (docRef) {
      updateDoc(docRef, { stayedLongEnough }).catch(() => {});
    } else {
      // Doc write still in-flight; stash so the .then() block above can flush it
      pendingUpdate = stayedLongEnough;
    }
  };

  // ── AppState listener (synchronous setup) ─────────────────────────────────
  // Must be registered before Linking.openURL so no transition event is missed.
  const subscription = AppState.addEventListener('change', (nextState) => {
    if ((nextState === 'background' || nextState === 'inactive') && backgroundedAt === null) {
      // App went to background — user is now on the external purchase page
      backgroundedAt = Date.now();
    } else if (nextState === 'active' && backgroundedAt !== null) {
      // User returned to the app — measure how long they were on the external page
      const timeOnExternalPage = Date.now() - backgroundedAt;
      resolve(timeOnExternalPage >= RETURN_WINDOW_MS);
    }
  });

  // ── Auto-resolve after AUTO_RESOLVE_MS ────────────────────────────────────
  // If they went background: still there after 60 s → stayedLongEnough = true
  // If they never went background: URL failed to open  → stayedLongEnough = false
  setTimeout(() => {
    resolve(backgroundedAt !== null);
  }, AUTO_RESOLVE_MS);
}

// ─── computeConversionRate ────────────────────────────────────────────────────
//
// Returns the "good click" conversion rate for a product.
// Only resolved log entries (stayedLongEnough !== null) are counted.
//
// Returns { total: number, goodClicks: number, rate: number (0–1) }
//
export async function computeConversionRate(productId) {
  if (!productId) return { total: 0, goodClicks: 0, rate: 0 };
  try {
    const snap = await getDocs(
      query(collection(db, 'product_click_logs'), where('productId', '==', productId))
    );
    let total = 0;
    let goodClicks = 0;
    snap.docs.forEach((d) => {
      const { stayedLongEnough } = d.data();
      if (stayedLongEnough !== null && stayedLongEnough !== undefined) {
        total += 1;
        if (stayedLongEnough === true) goodClicks += 1;
      }
    });
    return { total, goodClicks, rate: total > 0 ? goodClicks / total : 0 };
  } catch (_) {
    return { total: 0, goodClicks: 0, rate: 0 };
  }
}
