import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  documentId,
  getDoc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  doc,
  where,
} from 'firebase/firestore';
import { db } from '../firebase/config';

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

// Returns the most recent reviews across all products, enriched with product data.
// Shape: [{ reviewId, userId, productId, rating, content, verifiedPurchase, createdAt,
//           product: { name, image, category } | null }]
export async function getRecentReviews(limitCount = 20) {
  if (limitCount <= 0) return [];

  const snap = await getDocs(
    query(collection(db, 'reviews'), orderBy('createdAt', 'desc'), limit(limitCount))
  );
  if (snap.empty) return [];

  const reviews = snap.docs.map((d) => ({ reviewId: d.id, ...d.data() }));

  // Batch-fetch unique products in a single round-trip (chunked for Firestore 30-item limit)
  const uniqueProductIds = [...new Set(reviews.map((r) => r.productId).filter(Boolean))];
  const productMap = {};

  await Promise.all(
    chunkArray(uniqueProductIds, 30).map((chunk) =>
      getDocs(query(collection(db, 'products'), where(documentId(), 'in', chunk))).then(
        (pSnap) => pSnap.docs.forEach((d) => { productMap[d.id] = d.data(); })
      )
    )
  );

  return reviews.map((review) => ({
    ...review,
    product: productMap[review.productId] ?? null,
  }));
}

// ─── Posts ────────────────────────────────────────────────────────────────────

export async function getPosts(category = null, limitCount = 30) {
  const constraints = [orderBy('createdAt', 'desc'), limit(limitCount)];
  if (category) constraints.unshift(where('category', '==', category));
  const snap = await getDocs(query(collection(db, 'posts'), ...constraints));
  return snap.docs.map((d) => ({ postId: d.id, ...d.data() }));
}

export async function createPost({
  userId, category, title, content, nickname, isVerified,
  rating, taggedProductId, imageUrls,
}) {
  if (!userId || !title?.trim() || !content?.trim()) throw new Error('INVALID_POST');
  const payload = {
    userId,
    category: category || 'free',
    title: title.trim(),
    content: content.trim(),
    likeCount: 0,
    likedBy: [],
    commentCount: 0,
    nickname: nickname || '',
    isVerified: Boolean(isVerified),
    imageUrls: Array.isArray(imageUrls) ? imageUrls : [],
    createdAt: serverTimestamp(),
  };
  if (rating != null)           payload.rating           = rating;
  if (taggedProductId != null)  payload.taggedProductId  = taggedProductId;
  const ref = await addDoc(collection(db, 'posts'), payload);
  return ref.id;
}

// Toggle like: adds/removes uid from likedBy array and increments/decrements likeCount atomically.
// Returns { liked: boolean, likeCount: number } reflecting the new state.
export async function toggleLikePost(postId, uid) {
  if (!postId || !uid) return null;
  const ref  = doc(db, 'posts', postId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const likedBy   = snap.data().likedBy ?? [];
  const isLiked   = likedBy.includes(uid);
  if (isLiked) {
    await updateDoc(ref, { likedBy: arrayRemove(uid), likeCount: increment(-1) });
    return { liked: false, likeCount: (snap.data().likeCount ?? 1) - 1 };
  } else {
    await updateDoc(ref, { likedBy: arrayUnion(uid),  likeCount: increment(1)  });
    return { liked: true,  likeCount: (snap.data().likeCount ?? 0) + 1 };
  }
}

// ─── Comments ─────────────────────────────────────────────────────────────────

export async function getComments(postId) {
  if (!postId) return [];
  const snap = await getDocs(
    query(collection(db, 'comments'), where('postId', '==', postId), orderBy('createdAt', 'asc'))
  );
  return snap.docs.map((d) => ({ commentId: d.id, ...d.data() }));
}

export async function addComment({ postId, userId, content, nickname }) {
  if (!postId || !userId || !content?.trim()) throw new Error('INVALID_COMMENT');
  await addDoc(collection(db, 'comments'), {
    postId,
    userId,
    content: content.trim(),
    nickname: nickname || '',
    createdAt: serverTimestamp(),
  });
  await updateDoc(doc(db, 'posts', postId), { commentCount: increment(1) });
}

export async function getPostsByUser(userId, limitCount = 20) {
  if (!userId) return [];
  const snap = await getDocs(
    query(collection(db, 'posts'), where('userId', '==', userId), limit(limitCount))
  );
  return snap.docs
    .map((d) => ({ postId: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
}

export async function getCommentsByUser(userId, limitCount = 20) {
  if (!userId) return [];
  const snap = await getDocs(
    query(collection(db, 'comments'), where('userId', '==', userId), limit(limitCount))
  );
  return snap.docs
    .map((d) => ({ commentId: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
}
