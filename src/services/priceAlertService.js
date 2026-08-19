import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { getSavedProducts } from './saveService';
import { getPriceIntelligence } from './priceTrackingService';

// ─── Alert CRUD ───────────────────────────────────────────────────────────────

// Creates a price alert for a product. If one already exists, reactivates it.
// targetType: 'drop' (price falls) | 'goodDeal' (guidance === '지금 구매 추천')
// Returns { alertId, isActive } or null on error.
export async function createPriceAlert(userId, productId, targetType = 'drop') {
  if (!userId || !productId) return null;

  const existing = await getDocs(
    query(
      collection(db, 'price_alerts'),
      where('userId', '==', userId),
      where('productId', '==', productId)
    )
  );

  if (!existing.empty) {
    const alertDoc = existing.docs[0];
    if (!alertDoc.data().isActive) {
      await updateDoc(doc(db, 'price_alerts', alertDoc.id), { isActive: true });
    }
    return { alertId: alertDoc.id, isActive: true };
  }

  const ref = await addDoc(collection(db, 'price_alerts'), {
    userId,
    productId,
    targetType,
    isActive: true,
    createdAt: serverTimestamp(),
  });
  return { alertId: ref.id, isActive: true };
}

// Returns current alert status for a product, or null if no alert exists.
// Shape: { alertId, isActive }
export async function getPriceAlertStatus(userId, productId) {
  if (!userId || !productId) return null;

  const snap = await getDocs(
    query(
      collection(db, 'price_alerts'),
      where('userId', '==', userId),
      where('productId', '==', productId)
    )
  );

  if (snap.empty) return null;
  const d = snap.docs[0];
  return { alertId: d.id, isActive: Boolean(d.data().isActive) };
}

// Toggles isActive. Creates the alert (targetType='drop') if it doesn't exist.
// Returns the new isActive value.
export async function togglePriceAlert(userId, productId) {
  if (!userId || !productId) return false;

  const snap = await getDocs(
    query(
      collection(db, 'price_alerts'),
      where('userId', '==', userId),
      where('productId', '==', productId)
    )
  );

  if (snap.empty) {
    await addDoc(collection(db, 'price_alerts'), {
      userId,
      productId,
      targetType: 'drop',
      isActive: true,
      createdAt: serverTimestamp(),
    });
    return true;
  }

  const alertDoc = snap.docs[0];
  const newIsActive = !alertDoc.data().isActive;
  await updateDoc(doc(db, 'price_alerts', alertDoc.id), { isActive: newIsActive });
  return newIsActive;
}

// ─── Enriched saved products ──────────────────────────────────────────────────

// Loads saved products enriched with price intelligence and alert status.
// Returns:
// [{ savedId, productId, name, image, category, currentPrice, lowestPrice,
//    averagePrice, priceDrop, guidance, isGoodDeal, isAlertActive }]
export async function getSavedProductsWithPriceSignals(userId) {
  const savedRecords = await getSavedProducts(userId);
  if (savedRecords.length === 0) return [];

  // Fetch all alerts for this user in one query, then match by productId below.
  const alertsSnap = await getDocs(
    query(collection(db, 'price_alerts'), where('userId', '==', userId))
  );
  const alertsByProductId = {};
  alertsSnap.docs.forEach((d) => {
    alertsByProductId[d.data().productId] = {
      alertId: d.id,
      isActive: Boolean(d.data().isActive),
    };
  });

  const results = await Promise.all(
    savedRecords.map(async (record) => {
      const pgid = record.productGroupId || record.productId;
      if (!pgid) return null;

      const [productSnap, intel] = await Promise.all([
        getDoc(doc(db, 'products', pgid)),
        getPriceIntelligence(pgid),
      ]);

      if (!productSnap.exists()) {
        return {
          savedId: record.savedId,
          productGroupId: pgid,
          name: '상품 정보 업데이트 중...',
          image: null,
          category: '',
          currentPrice: null,
          lowestPrice: null,
          averagePrice: null,
          priceDrop: 0,
          guidance: null,
          isGoodDeal: false,
          isAlertActive: false,
          isMissing: true,
        };
      }
      const product = productSnap.data();

      const currentPrice =
        intel?.currentPrice ??
        (typeof product.currentPrice === 'number' && product.currentPrice > 0
          ? product.currentPrice
          : null);
      const lowestPrice = intel?.lowest ?? null;
      const averagePrice = intel?.average ?? null;
      const priceDrop = intel?.priceDrop ?? 0;
      const guidance = intel?.guidance ?? null;

      const isGoodDeal =
        guidance === '지금 구매 추천' ||
        (currentPrice !== null && averagePrice !== null && currentPrice <= averagePrice * 0.95);

      const alertEntry = alertsByProductId[pgid];
      const isAlertActive = alertEntry?.isActive ?? false;

      return {
        savedId: record.savedId,
        productGroupId: pgid,
        name: product.name || '',
        image: product.image || null,
        category: product.category || '',
        currentPrice,
        lowestPrice,
        averagePrice,
        priceDrop,
        guidance,
        isGoodDeal,
        isAlertActive,
      };
    })
  );

  return results.filter(Boolean);
}
