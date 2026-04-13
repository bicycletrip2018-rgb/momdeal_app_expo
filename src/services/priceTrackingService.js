import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { db } from '../firebase/config';

// ─── Daily Price Helpers ──────────────────────────────────────────────────────

// Returns today's date string in YYYY-MM-DD (UTC).
function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

// Updates (or creates) the daily max/min record for a product under
// products/{productId}/daily_prices/{YYYY-MM-DD}.
// Called automatically by recordPrice whenever a valid price is observed.
async function _updateDailyPrice(productId, price) {
  const dateKey = todayKey();
  const ref = doc(db, 'products', productId, 'daily_prices', dateKey);
  // Use setDoc with merge so we only overwrite max/min if the new price beats them.
  // Firestore doesn't support conditional field updates in a single write without
  // a transaction, so we fetch first then write — acceptable for low-frequency calls.
  const { getDoc } = await import('firebase/firestore');
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const existing = snap.data();
    const newMax = Math.max(existing.maxPrice, price);
    const newMin = Math.min(existing.minPrice, price);
    if (newMax !== existing.maxPrice || newMin !== existing.minPrice) {
      await setDoc(ref, { maxPrice: newMax, minPrice: newMin, date: dateKey }, { merge: true });
    }
  } else {
    await setDoc(ref, { maxPrice: price, minPrice: price, date: dateKey });
  }
}

// ─── Marketing Average (Tech Spec V7) ────────────────────────────────────────

// Fetches daily_prices subcollection records for the past `days` days and
// computes the marketing average price:
//   Σ (dailyMax + dailyMin) / 2  ÷  number_of_valid_days
//
// Returns { marketingAverage, validDays, dailyPrices } or null if no data.
export async function getMarketingAverage(productId, days = 60) {
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

  const dailyPrices = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
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

// Records a price observation for a product.
// Also updates the daily max/min record for today.
// Does nothing if price is missing or 0.
export async function recordPrice(productId, price, source) {
  if (!productId || typeof price !== 'number' || price <= 0) return;

  await Promise.all([
    addDoc(collection(db, 'product_price_history'), {
      productId,
      price,
      source: source || 'unknown',
      checkedAt: serverTimestamp(),
    }),
    _updateDailyPrice(productId, price),
  ]);
}

// Returns all price history records for a product, newest first.
// Shape: [{ historyId, productId, price, source, checkedAt }]
export async function getPriceHistory(productId) {
  if (!productId) return [];
  const snap = await getDocs(
    query(
      collection(db, 'product_price_history'),
      where('productId', '==', productId),
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

// Returns full price intelligence for ProductDetail — last 30 records.
// Includes stats (lowest/highest/average), percentile, guidance text,
// graph data (oldest-first array for rendering), and change since last check.
// Returns null if fewer than 1 valid price record exists.
export async function getPriceIntelligence(productId) {
  if (!productId) return null;

  const snap = await getDocs(
    query(
      collection(db, 'product_price_history'),
      where('productId', '==', productId),
      orderBy('checkedAt', 'desc'),
      limit(30)
    )
  );
  if (snap.empty) return null;

  const prices = snap.docs
    .map((d) => d.data().price)
    .filter((p) => typeof p === 'number' && p > 0);
  if (prices.length === 0) return null;

  // prices[0] = most recent (newest-first)
  const currentPrice = prices[0];
  const lastPrice = prices.length >= 2 ? prices[1] : null;
  const lowest = Math.min(...prices);
  const highest = Math.max(...prices);
  const average = Math.round(prices.reduce((s, p) => s + p, 0) / prices.length);

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
  try {
    const mktData = await getMarketingAverage(productId, 60);
    if (mktData) {
      marketingAverage = mktData.marketingAverage;
      marketingDiscountPct = calcMarketingDiscountPct(mktData.marketingAverage, currentPrice);
    }
  } catch (_) { /* non-fatal */ }

  return {
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
  };
}
