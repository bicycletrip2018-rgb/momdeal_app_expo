import { resolveAgingPriceDisplay } from './priceDisplay';

// Returns items that match a curation filter. Each box shows ONLY items that
// actually satisfy its criterion — never an all-items fallback, since a
// folder full of everything defeats the point of curating.
//
// Shared by TrackingListScreen.js (관심상품 tab curation dashboard) and
// CurationDetailScreen.js (the "전체보기" drill-down for one category) — keep
// this the single source of truth rather than letting the two screens drift
// out of sync with their own copies.
//
// peerCounts/purchaseCounts are precomputed maps ({productGroupId: count})
// from saveService.getPeerPopularityMap / getPurchaseFrequencyMap — both
// require async Firestore aggregation this (synchronous) filter can't do
// inline, so the caller fetches them once and passes them in.
export function applyCurationFilter(items, curationId, peerCounts, purchaseCounts, isWowMember) {
  if (curationId === 'lowest') {
    // "역대 최저가" = currently at (or below) the lowest price we've ever
    // recorded for this item — NOT "dropped a lot since the last check"
    // (a big one-off drop doesn't mean the item is actually at its
    // historical floor).
    return items.filter((i) =>
      i.currentPrice != null && i.lowestPrice != null && i.currentPrice <= i.lowestPrice
    );
  }
  if (curationId === 'timing') {
    // "구매 타이밍" = meaningfully discounted right now vs its own weighted-
    // average price, but not already flagged under 역대 최저가 — a "this is
    // a genuinely good moment, though not a historical record" signal.
    return items.filter((i) => {
      const discountPct = resolveAgingPriceDisplay(i, isWowMember).discountPct;
      if (discountPct == null || discountPct < 10) return false;
      const isAllTimeLow = i.currentPrice != null && i.lowestPrice != null && i.currentPrice <= i.lowestPrice;
      return !isAllTimeLow;
    });
  }
  if (curationId === 'peers') {
    // "또래 추천" = other users in my same child-stage segment have also
    // saved this product. Requires ≥2 peers (not just one coincidental
    // save) to count as a real signal.
    return items.filter((i) => (peerCounts?.[i.productId] ?? 0) >= 2);
  }
  if (curationId === 'frequent') {
    // "자주 산 상품" = I have 2+ *approved* (verified) purchases of this
    // exact product — a real repeat-buy pattern, not a single purchase.
    return items.filter((i) => (purchaseCounts?.[i.productId] ?? 0) >= 2);
  }
  return items;
}
