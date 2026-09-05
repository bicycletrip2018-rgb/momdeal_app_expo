import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { db } from '../firebase/config';

// ─── Marketing Average (Tech Spec V7) ────────────────────────────────────────

// Fetches daily_prices subcollection records for the past `days` days and
// computes the marketing average price:
//   Σ (dailyMax + dailyMin) / 2  ÷  number_of_valid_days
//
// Returns { marketingAverage, validDays, dailyPrices } or null if no data.
// optionId: when given, only that option's daily buckets count; when
// omitted, only legacy parent-level buckets (no optionId field) count —
// filtered client-side after a single date-range fetch rather than via a
// second `where('optionId', ...)` clause, which would need a new composite
// index (date range + optionId equality) on top of what's already deployed.
export async function getMarketingAverage(productId, days = 60, optionId = null) {
  if (!productId) return null;

  // Compute cutoff date string (YYYY-MM-DD) without external libs.
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - days);
  const cutoffKey = cutoff.toISOString().slice(0, 10);

  const snap = await getDocs(
    query(
      collection(db, 'products', productId, 'daily_prices'),
      where('date', '>=', cutoffKey),
      orderBy('date', 'desc')
    )
  );

  if (snap.empty) return null;

  const dailyPrices = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((r) => (optionId ? r.optionId === optionId : !r.optionId));

  if (dailyPrices.length === 0) return null;

  const validDays = dailyPrices.length;
  const sum = dailyPrices.reduce((acc, r) => acc + (r.maxPrice + r.minPrice) / 2, 0);
  const marketingAverage = Math.round(sum / validDays);

  return { marketingAverage, validDays, dailyPrices };
}

// Computes the visually optimised discount percentage against the marketing average.
// Returns null if either value is missing.
// Formula: ((avgPrice - currentPrice) / avgPrice) * 100
export function calcMarketingDiscountPct(marketingAverage, currentPrice) {
  if (!marketingAverage || !currentPrice || marketingAverage <= 0) return null;
  const pct = ((marketingAverage - currentPrice) / marketingAverage) * 100;
  return Math.round(pct * 10) / 10; // 1 decimal place
}

// Returns all recorded offers for a product, newest first.
// Shape: [{ historyId, price, source, checkedAt }]
export async function getPriceHistory(productId) {
  if (!productId) return [];
  const snap = await getDocs(
    query(
      collection(db, 'products', productId, 'offers'),
      orderBy('checkedAt', 'desc')
    )
  );
  return snap.docs.map((d) => ({ historyId: d.id, ...d.data() }));
}

// Returns the lowest recorded price for a product, or null if no history exists.
export async function getLowestPrice(productId) {
  const history = await getPriceHistory(productId);
  if (history.length === 0) return null;
  return history.reduce((min, record) => (record.price < min ? record.price : min), history[0].price);
}

// Returns a price change summary for a product.
// history is ordered newest-first, so history[0] = current, history[1] = previous.
// priceDrop > 0 means price fell since last check; priceRise > 0 means it rose.
// Returns null if no price history exists.
export async function getPriceChange(productId) {
  const history = await getPriceHistory(productId);
  if (history.length === 0) return null;

  const currentPrice = history[0].price;
  const lastPrice = history.length >= 2 ? history[1].price : null;
  const lowestPrice = history.reduce(
    (min, record) => (record.price < min ? record.price : min),
    history[0].price
  );

  const diff = lastPrice !== null ? lastPrice - currentPrice : 0;
  const priceDrop = diff > 0 ? diff : 0;
  const priceRise = diff < 0 ? -diff : 0;

  return { currentPrice, lowestPrice, lastPrice, priceDrop, priceRise };
}

// Short-TTL cache for getPriceIntelligence — TrackingListScreen re-enriches
// its ENTIRE tracked list on every user_saved_products snapshot fire, which
// includes changes with nothing to do with price (e.g. toggling a single
// item's 즐겨찾기). Without this, that one toggle re-reads every tracked
// item's price history from Firestore. A 60s TTL is short enough that a
// genuine price change (checked at most every 3h by the scheduler) is never
// meaningfully stale, but long enough to absorb bursts of unrelated writes.
const INTEL_CACHE_TTL_MS = 60_000;
const intelCache = new Map(); // key -> { value, expiresAt }

function intelCacheKey(productId, optionId) {
  return `${productId}::${optionId ?? ''}`;
}

// Returns full price intelligence for ProductDetail — last 30 records.
// Includes stats (lowest/highest/average), percentile, guidance text,
// graph data (oldest-first array for rendering), and change since last check.
// Returns null if fewer than 1 valid price record exists.
// optionId: when given, only offers for that exact option count (see
// recordPrice) — different options can price very differently, so mixing
// them would make "역대 최저가"/평균 meaningless. Fetches a wider window
// (150 vs 30) before filtering since the raw offers collection interleaves
// every tracked option's checks in one time-ordered stream; this stays
// index-free (single orderBy on checkedAt) rather than adding a composite
// index for optionId+checkedAt.
export async function getPriceIntelligence(productId, optionId = null) {
  if (!productId) return null;

  const cacheKey = intelCacheKey(productId, optionId);
  const cached = intelCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const snap = await getDocs(
    query(
      collection(db, 'products', productId, 'offers'),
      orderBy('checkedAt', 'desc'),
      limit(optionId ? 150 : 30)
    )
  );
  const setCache = (value) => {
    intelCache.set(cacheKey, { value, expiresAt: Date.now() + INTEL_CACHE_TTL_MS });
    return value;
  };

  if (snap.empty) return setCache(null);

  const relevantDocs = snap.docs
    .map((d) => d.data())
    .filter((d) => (optionId ? d.optionId === optionId : !d.optionId))
    .slice(0, 30);

  const prices = relevantDocs
    .map((d) => d.price)
    .filter((p) => typeof p === 'number' && p > 0);
  if (prices.length === 0) return setCache(null);

  // prices[0] = most recent (newest-first)
  const currentPrice = prices[0];
  const lastPrice = prices.length >= 2 ? prices[1] : null;
  const lowest = Math.min(...prices);
  const highest = Math.max(...prices);
  // Recency-weighted average, not a flat mean — a single stale/glitched price
  // sample shouldn't swing the reference price (and downstream drop-alert
  // threshold) as hard as a real multi-day trend does. Linear weight ramp:
  // newest record gets weight n, oldest gets weight 1.
  const n = prices.length;
  const weightedSum = prices.reduce((s, p, i) => s + p * (n - i), 0);
  const weightTotal = (n * (n + 1)) / 2;
  const average = Math.round(weightedSum / weightTotal);

  const range = highest - lowest;
  const percentile = range > 0 ? Math.round(((currentPrice - lowest) / range) * 100) : 50;

  const diff = lastPrice !== null ? lastPrice - currentPrice : 0;
  const priceDrop = diff > 0 ? diff : 0;
  const priceRise = diff < 0 ? -diff : 0;

  // Purchase guidance — check "near highest" before "above average" to avoid overlap
  let guidance = null;
  if (currentPrice <= average * 0.95) {
    guidance = '지금 구매 추천';
  } else if (highest > 0 && currentPrice >= highest * 0.9) {
    guidance = '최근 최고가 근처';
  } else if (currentPrice > average) {
    guidance = '평균보다 높은 가격';
  }

  // Reverse to chronological order (oldest → newest) for graph rendering
  const graphData = [...prices].reverse();

  // Marketing average (Tech Spec V7) — fetched in parallel, non-blocking on failure.
  let marketingAverage = null;
  let marketingDiscountPct = null;
  let priceTrackedDays = 0;
  try {
    const mktData = await getMarketingAverage(productId, 60, optionId);
    if (mktData) {
      marketingAverage = mktData.marketingAverage;
      marketingDiscountPct = calcMarketingDiscountPct(mktData.marketingAverage, currentPrice);
      // Distinct days with a daily_prices record — used to gate claims like
      // "역대 최저가" that only mean something once there's real multi-day
      // history (a single observation trivially equals its own min/max).
      priceTrackedDays = mktData.validDays;
    }
  } catch (_) { /* non-fatal */ }

  return setCache({
    graphData,
    currentPrice,
    lastPrice,
    lowest,
    highest,
    average,
    percentile,
    priceDrop,
    priceRise,
    guidance,
    recordCount: prices.length,
    marketingAverage,
    marketingDiscountPct,
    priceTrackedDays,
  });
}

// Invalidates the cached intelligence for one product/option — call after
// writing a fresh price observation (recordPrice) so the tracked list picks
// it up immediately instead of waiting out the TTL.
export function invalidatePriceIntelligenceCache(productId, optionId = null) {
  intelCache.delete(intelCacheKey(productId, optionId));
}
