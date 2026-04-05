import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  Timestamp,
  where,
} from 'firebase/firestore';
import { db } from '../firebase/config';

export async function getTrendingProducts(limitCount = 10) {
  const sevenDaysAgo = Timestamp.fromDate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));

  const actionsSnap = await getDocs(
    query(
      collection(db, 'user_product_actions'),
      where('actionType', '==', 'click'),
      where('createdAt', '>=', sevenDaysAgo)
    )
  );

  const countByProductId = {};
  actionsSnap.docs.forEach((docSnapshot) => {
    const productId = docSnapshot.data()?.productId;
    if (productId) {
      countByProductId[productId] = (countByProductId[productId] || 0) + 1;
    }
  });

  const sortedProductIds = Object.entries(countByProductId)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limitCount)
    .map(([productId]) => productId);

  if (sortedProductIds.length === 0) {
    return [];
  }

  const productsSnap = await getDocs(
    query(collection(db, 'products'), where('status', '==', 'active'))
  );

  const productMap = {};
  productsSnap.docs.forEach((docSnapshot) => {
    productMap[docSnapshot.id] = { productId: docSnapshot.id, ...docSnapshot.data() };
  });

  return sortedProductIds
    .filter((productId) => productMap[productId])
    .map((productId) => productMap[productId]);
}

export async function getRecentlyAddedProducts(limitCount = 10) {
  try {
    const snap = await getDocs(
      query(
        collection(db, 'products'),
        where('status', '==', 'active'),
        orderBy('createdAt', 'desc'),
        limit(limitCount)
      )
    );
    return snap.docs.map((docSnapshot) => ({
      productId: docSnapshot.id,
      ...docSnapshot.data(),
    }));
  } catch (error) {
    // Composite index may not exist yet — fall back to unordered fetch
    console.log('getRecentlyAddedProducts fallback (no index):', error.message);
    const snap = await getDocs(
      query(collection(db, 'products'), where('status', '==', 'active'))
    );
    return snap.docs
      .map((docSnapshot) => ({ productId: docSnapshot.id, ...docSnapshot.data() }))
      .sort((a, b) => {
        const aMs = a.createdAt?.toMillis?.() ?? 0;
        const bMs = b.createdAt?.toMillis?.() ?? 0;
        return bMs - aMs;
      })
      .slice(0, limitCount);
  }
}
