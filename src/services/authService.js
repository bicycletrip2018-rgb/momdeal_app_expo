import {
  login,
  getProfile,
  logout as kakaoLogout,
} from '@react-native-seoul/kakao-login';
import {
  signInWithCredential,
  OAuthProvider,
  signOut,
} from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, setDoc, collection, writeBatch, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase/config';

const ASYNC_TRACKED_KEY = 'tracked_products';

// ─── Lazy Login (B안) — migrate anonymous tracking data after sign-in ─────────

async function migrateAnonymousTrackedProducts(uid) {
  try {
    const raw = await AsyncStorage.getItem(ASYNC_TRACKED_KEY);
    if (!raw) return;
    const products = JSON.parse(raw);
    if (!Array.isArray(products) || products.length === 0) return;

    const batch = writeBatch(db);
    products.forEach((product) => {
      const ref = doc(collection(db, 'users', uid, 'trackedProducts'));
      batch.set(ref, {
        ...product,
        migratedAt: serverTimestamp(),
        source: 'anonymous_migration',
      });
    });
    await batch.commit();
    await AsyncStorage.removeItem(ASYNC_TRACKED_KEY);
  } catch (_) {
    // migration is best-effort; never block login on failure
  }
}

// ─── Kakao Login ──────────────────────────────────────────────────────────────

export async function loginWithKakao() {
  const token = await login();

  const profile = await getProfile();

  const providerId = 'oidc.kakao';
  const provider = new OAuthProvider(providerId);
  const credential = provider.credential({
    idToken: token.idToken,
    accessToken: token.accessToken,
  });

  const { user } = await signInWithCredential(auth, credential);

  await setDoc(
    doc(db, 'users', user.uid),
    {
      kakaoId: profile.id,
      nickname: profile.nickname,
      profileImageUrl: profile.profileImageUrl ?? null,
      lastLoginAt: serverTimestamp(),
    },
    { merge: true },
  );

  await migrateAnonymousTrackedProducts(user.uid);

  return user;
}

// ─── Logout ───────────────────────────────────────────────────────────────────

export async function logoutAll() {
  await Promise.allSettled([kakaoLogout(), signOut(auth)]);
}
