import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { getChildrenByUserId } from './firestore/childrenRepository';

// ─── RULE-12: Sliding Window Segment Derivation ───────────────────────────────
//
// Maps a child's birthDate Timestamp → a queryable segment string.
// Format: "{stage}_{YYYY}-{MM}"  e.g. "early_infant_2025-01"
//
// Window sizes per stage (spec §5.3):
//   pregnancy    → no birthDate; caller should pass type='pregnancy'
//   newborn      0–1 mo    ±7 days      bucket: birth YYYY-MM
//   early_infant 1–6 mo    ±15 days     bucket: birth YYYY-MM
//   infant       6–12 mo   ±1 month     bucket: birth YYYY-MM
//   toddler      12–36 mo  ±2 months    bucket: birth YYYY-MM
//   early_child  36–60 mo  ±6 months    bucket: birth YYYY-QQ  (quarterly)
//   child        60+ mo    ±1.5 yr      bucket: birth YYYY-HH  (half-year)

export function deriveSegmentFromBirthDate(birthDate, userType) {
  if (userType === 'pregnancy' || userType === 'planning') return `${userType}_segment`;
  if (!birthDate) return 'unknown_segment';

  const birth = birthDate.toDate ? birthDate.toDate() : new Date(birthDate);
  if (isNaN(birth.getTime())) return 'unknown_segment';

  const now       = new Date();
  const ageMs     = now - birth;
  const ageDays   = ageMs / (1000 * 60 * 60 * 24);
  const ageMonths = ageDays / 30.4375;

  const yyyy = birth.getFullYear();
  const mm   = String(birth.getMonth() + 1).padStart(2, '0');

  let stage;
  let bucket;

  if (ageMonths < 1) {
    stage  = 'newborn';
    bucket = `${yyyy}-${mm}`;
  } else if (ageMonths < 6) {
    stage  = 'early_infant';
    bucket = `${yyyy}-${mm}`;
  } else if (ageMonths < 12) {
    stage  = 'infant';
    bucket = `${yyyy}-${mm}`;
  } else if (ageMonths < 36) {
    stage  = 'toddler';
    bucket = `${yyyy}-${mm}`;
  } else if (ageMonths < 60) {
    // ±6 months → quarterly bucket (Q1-Q4)
    const quarter = Math.ceil((birth.getMonth() + 1) / 3);
    stage  = 'early_child';
    bucket = `${yyyy}-Q${quarter}`;
  } else {
    // ±1.5 year → half-year bucket
    const half = birth.getMonth() < 6 ? 'H1' : 'H2';
    stage  = 'child';
    bucket = `${yyyy}-${half}`;
  }

  return `${stage}_${bucket}`;
}

// ─── getCurrentUserSegment ─────────────────────────────────────────────────────
//
// Single source of truth for "which segment is this user in right now" —
// mirrors the selectedChildId → children[0] fallback pattern used in
// DetailScreen.js's peer-count query, so every write path (save button,
// share-registration, etc.) derives the segment the same way instead of
// each screen re-implementing (or skipping) the lookup.

export async function getCurrentUserSegment(userId) {
  if (!userId) return 'unknown_segment';
  try {
    const userSnap = await getDoc(doc(db, 'users', userId));
    const selectedChildId = userSnap.exists() ? userSnap.data().selectedChildId ?? null : null;
    const children = await getChildrenByUserId(userId);
    const child = (selectedChildId ? children.find((c) => c.id === selectedChildId) : null) ?? children[0] ?? null;
    if (!child) return 'unknown_segment';
    return deriveSegmentFromBirthDate(child.birthDate, child.type);
  } catch (_) {
    return 'unknown_segment';
  }
}

// ─── getPeerPopularityMap ───────────────────────────────────────────────────────
//
// Counts how many users in the given segment have saved each product — feeds
// the "또래 추천" curation box. 'unknown_segment' never counts as a real peer
// group (it's the "no child profile yet" bucket, not a comparable cohort),
// so it always returns empty rather than a meaningless match.
//
// Reads the segment_popularity counter (one doc per segment×product,
// maintained by the onSavedProductCreate/Delete Cloud Functions) instead of
// scanning every user_saved_products doc in the segment on every call — a
// segment's popularity data doesn't grow with total saves, just distinct
// products, so this stays cheap as the user base grows. Trade-off: the count
// includes the requesting user's own save (no per-user exclusion in a
// pre-aggregated counter) — negligible at the ≥2 threshold curationFilters.js
// applies.

export async function getPeerPopularityMap(userSegment) {
  if (!userSegment || userSegment === 'unknown_segment') return {};
  const snap = await getDocs(
    query(collection(db, 'segment_popularity'), where('segment', '==', userSegment))
  );
  const counts = {};
  snap.docs.forEach((d) => {
    const data = d.data();
    if (!data.productGroupId) return;
    counts[data.productGroupId] = data.count ?? 0;
  });
  return counts;
}

// ─── getPurchaseFrequencyMap ─────────────────────────────────────────────────────
//
// Counts this user's own *approved* reward_claims per product — feeds "자주
// 산 상품". Only approved claims count as a real purchase; 'pending'/rejected
// claims aren't verified yet and shouldn't be presented as purchase history.

export async function getPurchaseFrequencyMap(userId) {
  if (!userId) return {};
  const snap = await getDocs(
    query(
      collection(db, 'reward_claims'),
      where('userId', '==', userId),
      where('status', '==', 'approved'),
    )
  );
  const counts = {};
  snap.docs.forEach((d) => {
    const data = d.data();
    if (!data.productGroupId) return;
    counts[data.productGroupId] = (counts[data.productGroupId] || 0) + 1;
  });
  return counts;
}

// ─── getSavedProducts ─────────────────────────────────────────────────────────

export async function getSavedProducts(userId) {
  if (!userId) return [];
  const snap = await getDocs(
    query(collection(db, 'user_saved_products'), where('userId', '==', userId))
  );
  return snap.docs.map((d) => ({ savedId: d.id, ...d.data() }));
}

// ─── toggleSavedProduct ───────────────────────────────────────────────────────
//
// Saves or unsaves a product, writing userSegment for peer-count queries.
// Returns true if now saved, false if removed.
//
// @param {string}  userId
// @param {string}  productGroupId

export async function toggleSavedProduct(userId, productGroupId) {
  if (!userId || !productGroupId) return false;

  const existing = await getDocs(
    query(
      collection(db, 'user_saved_products'),
      where('userId', '==', userId),
      where('productGroupId', '==', productGroupId)
    )
  );

  if (!existing.empty) {
    await deleteDoc(doc(db, 'user_saved_products', existing.docs[0].id));
    return false;
  }

  const userSegment = await getCurrentUserSegment(userId);

  await addDoc(collection(db, 'user_saved_products'), {
    userId,
    productGroupId,
    userSegment,
    createdAt: serverTimestamp(),
  });

  // Price-drop alerts default to ON at save time — saving a product implies
  // wanting to know when its price drops, and the toggle should read as "on"
  // immediately rather than silently defaulting to off until the user finds
  // and flips it themselves. price_alerts.productId stores a productGroupId
  // value (naming kept consistent with the rest of that collection).
  await addDoc(collection(db, 'price_alerts'), {
    userId,
    productId: productGroupId,
    targetType: 'drop',
    isActive: true,
    createdAt: serverTimestamp(),
  });

  return true;
}
