import { doc, getDoc, increment, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';

const NICK_ADJ  = ['포근한', '사랑스런', '귀여운', '씩씩한', '따뜻한', '해맑은', '반짝이는', '즐거운', '행복한', '건강한'];
const NICK_NOUN = ['토끼', '곰돌이', '호랑이', '코끼리', '판다', '사슴', '펭귄', '강아지', '고양이', '다람쥐'];

function generateNickname() {
  const adj  = NICK_ADJ[Math.floor(Math.random() * NICK_ADJ.length)];
  const noun = NICK_NOUN[Math.floor(Math.random() * NICK_NOUN.length)];
  const num  = Math.floor(Math.random() * 900) + 100;
  return `${adj} ${noun} ${num}`;
}

export async function createOrUpdateUserProfile({
  userId,
  email,
  provider,
  role,
}) {
  if (!userId) {
    throw new Error('userId is required');
  }

  const userRef = doc(db, 'users', userId);
  const userSnap = await getDoc(userRef);
  const safeRole = role || 'user';
  const safeEmail = typeof email === 'string' ? email : '';
  const safeProvider = typeof provider === 'string' ? provider : 'unknown';

  if (!userSnap.exists()) {
    await setDoc(userRef, {
      email: safeEmail,
      provider: safeProvider,
      role: safeRole,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
    });
    return { created: true };
  }

  const prev = userSnap.data() || {};
  await setDoc(
    userRef,
    {
      email: safeEmail || prev.email || '',
      provider: safeProvider || prev.provider || 'unknown',
      role: prev.role || safeRole || 'user',
      updatedAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
    },
    { merge: true }
  );

  return { created: false };
}

export async function updateSelectedChild(userId, childId) {
  if (!userId) return;
  await updateDoc(doc(db, 'users', userId), { selectedChildId: childId });
}

export async function getUserProfile(userId) {
  if (!userId) return null;
  const snap = await getDoc(doc(db, 'users', userId));
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    userId,
    nickname: data.nickname || null,
    postCount: data.postCount || 0,
    commentCount: data.commentCount || 0,
    profileImage: data.profileImage || null,
  };
}

export async function getOrCreateNickname(userId) {
  if (!userId) return '익명';
  const snap = await getDoc(doc(db, 'users', userId));
  const existing = snap.exists() ? snap.data().nickname : null;
  if (existing) return existing;
  const generated = generateNickname();
  updateDoc(doc(db, 'users', userId), { nickname: generated }).catch(() => {});
  return generated;
}

export async function updateNickname(userId, nickname) {
  if (!userId || !nickname?.trim()) return;
  await updateDoc(doc(db, 'users', userId), { nickname: nickname.trim() });
}

export async function incrementPostCount(userId) {
  if (!userId) return;
  await updateDoc(doc(db, 'users', userId), { postCount: increment(1) });
}

export async function incrementCommentCount(userId) {
  if (!userId) return;
  await updateDoc(doc(db, 'users', userId), { commentCount: increment(1) });
}
