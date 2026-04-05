import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { getLowestPrice } from './priceTrackingService';

// Recomputes and writes reviewStats to products/{productGroupId}.
// Called fire-and-forget after every successful review write.
// reviewStats fields:
//   avgRating    — mean of all ratings (1–5)
//   reviewCount  — total number of reviews
//   positiveRate — fraction of reviews with rating >= 4
async function updateReviewStats(productGroupId) {
  if (!productGroupId) return;
  const snap = await getDocs(
    query(collection(db, 'reviews'), where('productGroupId', '==', productGroupId))
  );
  const docs = snap.docs.map((d) => d.data());
  const reviewCount = docs.length;
  if (reviewCount === 0) return;

  const totalRating    = docs.reduce((s, r) => s + (typeof r.rating === 'number' ? r.rating : 0), 0);
  const positiveCount  = docs.filter((r) => typeof r.rating === 'number' && r.rating >= 4).length;

  await updateDoc(doc(db, 'products', productGroupId), {
    'reviewStats.avgRating':    totalRating / reviewCount,
    'reviewStats.reviewCount':  reviewCount,
    'reviewStats.positiveRate': positiveCount / reviewCount,
    updatedAt: serverTimestamp(),
  });
}

// Reviews are keyed by productGroupId (== Firestore products document ID).
// NOTE: legacy documents written before this schema used field name `productId`.
// Those will not appear in this query; re-submitting a review migrates the record.
export async function getReviews(productGroupId) {
  if (!productGroupId) return [];
  const snap = await getDocs(
    query(
      collection(db, 'reviews'),
      where('productGroupId', '==', productGroupId),
      orderBy('createdAt', 'desc')
    )
  );
  return snap.docs.map((d) => ({ reviewId: d.id, ...d.data() }));
}

async function checkVerifiedPurchase(userId, productGroupId) {
  if (!userId || !productGroupId) return false;
  const snap = await getDocs(
    query(
      collection(db, 'user_product_actions'),
      where('userId', '==', userId),
      where('productId', '==', productGroupId),
      where('actionType', '==', 'purchase'),
      limit(1)
    )
  );
  return !snap.empty;
}

export async function submitReview({ userId, productGroupId, rating, content, purchasePrice }) {
  if (!userId || !productGroupId) throw new Error('USER_OR_PRODUCT_MISSING');
  if (!rating || rating < 1 || rating > 5) throw new Error('INVALID_RATING');

  const [verifiedPurchase, lowestPrice] = await Promise.all([
    checkVerifiedPurchase(userId, productGroupId),
    typeof purchasePrice === 'number' && purchasePrice > 0
      ? getLowestPrice(productGroupId)
      : Promise.resolve(null),
  ]);

  // isBestDeal: purchase was within 5% of the historical minimum price
  const isBestDeal =
    typeof purchasePrice === 'number' &&
    purchasePrice > 0 &&
    lowestPrice !== null &&
    purchasePrice <= lowestPrice * 1.05;

  await addDoc(collection(db, 'reviews'), {
    userId,
    productGroupId,
    rating,
    content: content || '',
    images: [],
    likeCount: 0,
    verifiedPurchase,
    ...(typeof purchasePrice === 'number' && purchasePrice > 0 ? { purchasePrice } : {}),
    isBestDeal,
    createdAt: serverTimestamp(),
  });

  // Recompute and persist aggregate — fire-and-forget, does not block the caller
  updateReviewStats(productGroupId).catch(() => {});
}
