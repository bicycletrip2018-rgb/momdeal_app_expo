import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { auth } from '../firebase/config';

const STATIC_ACTIONS = [
  { userId: 'user_B', productGroupId: '9320256369', actionType: 'purchase' },
  { userId: 'user_C', productGroupId: '9320256369', actionType: 'click' },
  { userId: 'user_D', productGroupId: '9344126652', actionType: 'click' },
  { userId: 'user_B', productGroupId: '9320256369', actionType: 'click' },
  { userId: 'user_C', productGroupId: '9320256369', actionType: 'purchase' },
];

export async function seedActions() {
  const currentUid = auth.currentUser?.uid;

  const actions = [
    ...STATIC_ACTIONS,
    ...(currentUid
      ? [{ userId: currentUid, productGroupId: '9320256369', actionType: 'click' }]
      : []),
  ];

  for (const { userId, productGroupId, actionType } of actions) {
    await addDoc(collection(db, 'user_product_actions'), {
      userId,
      productGroupId,
      actionType,
      stage: 'infant',
      createdAt: serverTimestamp(),
    });
    console.log(`[seedActions] OK  ${userId} → ${actionType} → ${productGroupId}`);
  }
  console.log('[seedActions] Done.');
}
