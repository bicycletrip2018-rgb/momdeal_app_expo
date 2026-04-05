import { addDoc, collection, doc, increment, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

export async function recordProductAction({ userId, productId, productGroupId, actionType }) {
  if (!userId || !productId) {
    return;
  }

  try {
    await addDoc(collection(db, 'user_product_actions'), {
      userId,
      productId,
      ...(productGroupId ? { productGroupId } : {}),
      actionType,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    console.log('Failed to record product action:', error);
  }
}

export async function recordAbTestAction({ userId, productGroupId, actionType, variant }) {
  if (!userId || !productGroupId) return;
  try {
    await addDoc(collection(db, 'user_product_actions'), {
      userId,
      productGroupId,
      actionType,
      variant,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    console.log('Failed to record ab test action:', error);
  }
}

// Atomically increments a single optionStats counter on the product document.
// field: 'clickCount' | 'conversionCount' | 'trackingCount'
export async function incrementOptionStat(productGroupId, optionId, field) {
  if (!productGroupId || !optionId || !field) return;
  console.log('[optionStats] productGroupId:', productGroupId, '| optionId:', optionId, '| field:', field);
  try {
    await updateDoc(doc(db, 'products', productGroupId), {
      [`optionStats.${optionId}.${field}`]: increment(1),
      [`optionStats.${optionId}.lastUpdatedAt`]: serverTimestamp(),
    });
  } catch (error) {
    console.log('Failed to increment optionStat:', error);
  }
}
