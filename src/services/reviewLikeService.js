import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { db } from '../firebase/config';

// ─── Document ID strategy ─────────────────────────────────────────────────────
//
// review_likes documents use a composite ID: `${userId}_${reviewId}`.
// This guarantees one like per user per review at the document level and allows
// toggleLike / getLikeStatus to use getDoc (O(1)) instead of a where-clause
// query on two fields — avoiding the need for a composite Firestore index.
//
// Collection: review_likes
// Schema:
//   userId    : string   — who liked
//   reviewId  : string   — which review
//   createdAt : Timestamp (serverTimestamp)

const likeDocRef = (userId, reviewId) =>
  doc(db, 'review_likes', `${userId}_${reviewId}`);

// ─── toggleLike ───────────────────────────────────────────────────────────────

// Toggles the current user's like on a review.
// Creates the like doc if it does not exist; deletes it if it does.
// Returns the new liked state (true = liked, false = unliked).
// Returns false without throwing on any error.
export async function toggleLike(userId, reviewId) {
  if (!userId || !reviewId) return false;
  try {
    const ref = likeDocRef(userId, reviewId);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await deleteDoc(ref);
      return false;
    }
    await setDoc(ref, { userId, reviewId, createdAt: serverTimestamp() });
    return true;
  } catch (error) {
    console.log('reviewLikeService toggleLike error:', error);
    return false;
  }
}

// ─── getLikeStatus ────────────────────────────────────────────────────────────

// Returns the like status for a single user + review pair.
// Shape: { liked: boolean }
export async function getLikeStatus(userId, reviewId) {
  if (!userId || !reviewId) return { liked: false };
  try {
    const snap = await getDoc(likeDocRef(userId, reviewId));
    return { liked: snap.exists() };
  } catch (error) {
    console.log('reviewLikeService getLikeStatus error:', error);
    return { liked: false };
  }
}

// ─── getLikeCount ─────────────────────────────────────────────────────────────

// Returns the total number of likes for a review.
export async function getLikeCount(reviewId) {
  if (!reviewId) return 0;
  try {
    const snap = await getDocs(
      query(collection(db, 'review_likes'), where('reviewId', '==', reviewId))
    );
    return snap.size;
  } catch (error) {
    console.log('reviewLikeService getLikeCount error:', error);
    return 0;
  }
}

// ─── getBulkLikeData ──────────────────────────────────────────────────────────

// Efficiently loads liked status + like counts for a list of reviews in 2 queries:
//   Query 1: all likes by this user  → determines liked/unliked per review
//   Query 2: all likes for these reviews (chunked ≤ 30) → count per review
//
// Returns { [reviewId]: { liked: boolean, count: number } }
// Falls back to all-false / all-zero on error.
export async function getBulkLikeData(userId, reviewIds) {
  if (!reviewIds || reviewIds.length === 0) return {};

  const chunks = [];
  for (let i = 0; i < reviewIds.length; i += 30) {
    chunks.push(reviewIds.slice(i, i + 30));
  }

  try {
    const allPromises = [
      // Query 1: user's likes (null user → empty result, no query)
      userId
        ? getDocs(query(collection(db, 'review_likes'), where('userId', '==', userId)))
        : Promise.resolve({ docs: [] }),
      // Query 2+: all likes for these reviews, chunked for the 30-item 'in' limit
      ...chunks.map((chunk) =>
        getDocs(query(collection(db, 'review_likes'), where('reviewId', 'in', chunk)))
      ),
    ];

    const [userLikesSnap, ...countSnaps] = await Promise.all(allPromises);

    // Build set of reviewIds liked by this user
    const likedSet = new Set(
      userLikesSnap.docs.map((d) => d.data().reviewId).filter(Boolean)
    );

    // Build count map across all chunks
    const countMap = {};
    countSnaps.forEach((snap) => {
      snap.docs.forEach((d) => {
        const rid = d.data().reviewId;
        if (rid) countMap[rid] = (countMap[rid] || 0) + 1;
      });
    });

    const result = {};
    reviewIds.forEach((rid) => {
      result[rid] = {
        liked: likedSet.has(rid),
        count: countMap[rid] || 0,
      };
    });
    return result;
  } catch (error) {
    console.log('reviewLikeService getBulkLikeData error:', error);
    // Return safe defaults so the feed still renders
    const fallback = {};
    reviewIds.forEach((rid) => { fallback[rid] = { liked: false, count: 0 }; });
    return fallback;
  }
}
