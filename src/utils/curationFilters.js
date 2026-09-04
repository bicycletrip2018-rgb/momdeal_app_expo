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

// Minimum peers (excluding myself) required for "또래 추천" to mean anything.
export const MIN_PEERS_FOR_RECOMMENDATION = 2;

// Minimum distinct tracked days before "역대 최저가" can be claimed. With
// fewer days of daily_prices history, lowestPrice == currentPrice trivially
// (a single observation is its own min), so every freshly-registered item
// would otherwise qualify by default — a folder that shows everything isn't
// curating anything. Mirrors the existing 7-day blind-mode gate elsewhere.
export const MIN_TRACKED_DAYS_FOR_LOWEST = 3;

export function applyCurationFilter(items, curationId, peerCounts, purchaseCounts, isWowMember) {
  if (curationId === 'lowest') {
    // "역대 최저가" = currently at (or below) the lowest price we've ever
    // recorded for this item — NOT "dropped a lot since the last check"
    // (a big one-off drop doesn't mean the item is actually at its
    // historical floor) — AND backed by enough real history to mean
    // anything (see MIN_TRACKED_DAYS_FOR_LOWEST above).
    return items.filter((i) =>
      i.currentPrice != null && i.lowestPrice != null && i.currentPrice <= i.lowestPrice &&
      (i.priceTrackedDays ?? 0) >= MIN_TRACKED_DAYS_FOR_LOWEST
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
    // "또래 추천" = OTHER users in my same child-stage segment have also
    // saved this product. segment_popularity's count includes my own save
    // (it's a pre-aggregated per-segment counter, not per-user), and every
    // item reaching this filter is already something I saved — so subtract
    // 1 to get the actual peer count before comparing against the
    // ≥2-peers threshold. Without this, "count >= 2" only ever meant
    // "me + one other coincidental save", which isn't a real signal.
    return items.filter((i) => Math.max(0, (peerCounts?.[i.productId] ?? 0) - 1) >= MIN_PEERS_FOR_RECOMMENDATION);
  }
  if (curationId === 'frequent') {
    // "자주 산 상품" = I have 2+ *approved* (verified) purchases of this
    // exact product — a real repeat-buy pattern, not a single purchase.
    return items.filter((i) => (purchaseCounts?.[i.productId] ?? 0) >= 2);
  }
  return items;
}
