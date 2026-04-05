import { useEffect } from 'react';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { createOrUpdateUserProfile } from '../services/firestore/userRepository';

export default function useAuthSync() {
  useEffect(() => {
    if (!auth.currentUser) {
      signInAnonymously(auth).catch((error) => {
        console.log('Failed to sign in anonymously:', error);
      });
    }

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        return;
      }

      const provider =
        user.providerData?.[0]?.providerId ||
        user.providerId ||
        'unknown';

      try {
        await createOrUpdateUserProfile({
          userId: user.uid,
          email: user.email || '',
          provider,
          role: 'user',
        });
      } catch (error) {
        console.log('Failed to sync user profile:', error);
      }

      // ── Daily streak increment ──────────────────────────────────────────
      // Runs once per calendar day. Writes `streakCount` + `lastActiveDate`
      // to users/{uid}. BenefitsScreen reads streakCount from this field.
      // Schema change: uses `streakCount` (replaces legacy `streak` field).
      try {
        const todayStr = new Date().toISOString().slice(0, 10);
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);
        const data = userSnap.exists() ? userSnap.data() : {};
        const lastDate = data.lastActiveDate ?? null;

        if (lastDate !== todayStr) {
          // Read streakCount first, fall back to legacy `streak` field
          const prevStreak = data.streakCount ?? data.streak ?? 0;
          const daysDiff = lastDate
            ? (new Date(todayStr).getTime() - new Date(lastDate).getTime()) / 86400000
            : 0;
          const newStreak = daysDiff <= 1 && daysDiff >= 0 ? prevStreak + 1 : 1;
          updateDoc(userRef, {
            streakCount: newStreak,
            lastActiveDate: todayStr,
          }).catch(() => {});
        }
      } catch (_) {
        // Non-critical — never block sign-in
      }
    });

    return () => unsubscribe();
  }, []);
}
