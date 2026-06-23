import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import { db } from '../firebase/config';

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
// @param {object}  [childBirthDate]  Firestore Timestamp | JS Date | null
// @param {string}  [userType]        'child' | 'pregnancy' | 'planning'

export async function toggleSavedProduct(userId, productGroupId, childBirthDate = null, userType = 'child') {
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

  const userSegment = deriveSegmentFromBirthDate(childBirthDate, userType);

  await addDoc(collection(db, 'user_saved_products'), {
    userId,
    productGroupId,
    userSegment,
    createdAt: serverTimestamp(),
  });
  return true;
}
