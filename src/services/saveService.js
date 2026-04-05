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

// Returns all saved records for a user.
// Shape: [{ savedId, userId, productId, createdAt }]
export async function getSavedProducts(userId) {
  if (!userId) return [];
  const snap = await getDocs(
    query(collection(db, 'user_saved_products'), where('userId', '==', userId))
  );
  return snap.docs.map((d) => ({ savedId: d.id, ...d.data() }));
}

// Toggles save state for a product.
// Returns true if the product is now saved, false if it was removed.
export async function toggleSavedProduct(userId, productId) {
  if (!userId || !productId) return false;

  const existingSnap = await getDocs(
    query(
      collection(db, 'user_saved_products'),
      where('userId', '==', userId),
      where('productId', '==', productId)
    )
  );

  if (!existingSnap.empty) {
    await deleteDoc(doc(db, 'user_saved_products', existingSnap.docs[0].id));
    return false; // removed
  }

  await addDoc(collection(db, 'user_saved_products'), {
    userId,
    productId,
    createdAt: serverTimestamp(),
  });
  return true; // saved
}
