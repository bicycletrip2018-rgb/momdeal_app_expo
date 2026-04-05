import {
  addDoc,
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import { db } from '../firebase/config';

// Records a price observation for a product.
// Does nothing if price is missing or 0.
export async function recordPrice(productId, price, source) {
  if (!productId || typeof price !== 'number' || price <= 0) return;

  await addDoc(collection(db, 'product_price_history'), {
    productId,
    price,
    source: source || 'unknown',
    checkedAt: serverTimestamp(),
  });
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
  };
}
