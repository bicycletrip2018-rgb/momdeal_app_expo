import {
  addDoc,
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { auth, db } from '../../firebase/config';
import { buildChildComputedFields, deriveCategoryTags } from '../../domain/child/childStageUtils';

const normalizeNumberOrNull = (value) => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeChildPayload = (child) => {
  const type = child?.type === 'pregnancy' ? 'pregnancy' : 'child';
  const birthDate = type === 'child' ? child?.birthDate || null : null;
  const computed = buildChildComputedFields({ type, birthDate });
  const feedingType = type === 'child' ? child?.feedingType || 'unknown' : 'unknown';

  return {
    userId: child?.userId || '',
    name: child?.name?.trim() || '',
    gender: child?.gender || 'unknown',
    birthDate,
    birthOrder: normalizeNumberOrNull(child?.birthOrder),
    type,
    pregnancyWeek: type === 'pregnancy' ? normalizeNumberOrNull(child?.pregnancyWeek) : null,
    dueDate: type === 'pregnancy' ? child?.dueDate || null : null,
    feedingType,
    ageMonth: computed.ageMonth,
    stage: computed.stage,
    categoryTags: deriveCategoryTags({ stage: computed.stage, feedingType }),
    weight: normalizeNumberOrNull(child?.weight),
    height: normalizeNumberOrNull(child?.height),
    // concerns: parenting concern tags; default to [] for backwards-compat with existing docs
    concerns: Array.isArray(child?.concerns) ? child.concerns : [],
    // Extended personalisation fields (optional, additive)
    concernNote:       child?.concernNote?.trim()                                    || '',
    region:            child?.region?.trim()                                          || null,
    familyComposition: Array.isArray(child?.familyComposition) ? child.familyComposition : [],
  };
};

export async function createChild(child) {
  const fallbackUserId = auth.currentUser?.uid;
  const payload = normalizeChildPayload({
    ...child,
    userId: child?.userId || fallbackUserId || '',
  });

  if (!payload.userId) {
    console.log('createChild skipped: missing userId/auth uid');
    throw new Error('USER_ID_REQUIRED');
  }

  const docRef = await addDoc(collection(db, 'children'), {
    ...payload,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return { id: docRef.id };
}

export async function getChildrenByUserId(userId) {
  const fallbackUserId = auth.currentUser?.uid;
  const targetUserId = userId || fallbackUserId || '';

  if (!targetUserId) {
    console.log('getChildrenByUserId skipped: missing userId/auth uid');
    return [];
  }

  const snap = await getDocs(
    query(collection(db, 'children'), where('userId', '==', targetUserId))
  );

  return snap.docs.map((docSnapshot) => ({
    id: docSnapshot.id,
    ...docSnapshot.data(),
  }));
}

export async function updateChild(childId, updates) {
  if (!childId) {
    throw new Error('CHILD_ID_REQUIRED');
  }

  const type = updates?.type === 'pregnancy' ? 'pregnancy' : updates?.type === 'child' ? 'child' : null;
  const birthDate = Object.prototype.hasOwnProperty.call(updates || {}, 'birthDate')
    ? updates.birthDate
    : undefined;

  const computed =
    type !== null || birthDate !== undefined
      ? buildChildComputedFields({
          type: type || 'child',
          birthDate: birthDate === undefined ? null : birthDate,
        })
      : null;

  const categoryTags = computed
    ? deriveCategoryTags({
        stage: computed.stage,
        feedingType: updates?.feedingType || 'unknown',
      })
    : undefined;

  const payload = {
    ...(updates || {}),
    ...(computed || {}),
    ...(categoryTags !== undefined ? { categoryTags } : {}),
    updatedAt: serverTimestamp(),
  };

  await setDoc(doc(db, 'children', childId), payload, { merge: true });
}
