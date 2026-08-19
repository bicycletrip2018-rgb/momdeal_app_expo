import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { db } from '../firebase/config';

function cleanName(raw) {
  return String(raw || '쿠팡 상품')
    .replace(/\[LIVE서버\]|\[API 브릿지 우회\]/g, '')
    .trim() || '쿠팡 상품';
}

export async function registerProductFromClient(productId, details, uid) {
  console.log('[Registrar] Starting save for productId:', productId, 'UID:', uid);

  if (!uid) {
    console.error('[Registrar] ERROR: UID is missing! Cannot link product to user.');
  }

  const productGroupId = 'coupang_' + productId;
  const docRef   = doc(db, 'products', productGroupId);
  const existing = await getDoc(docRef);
  const isNew    = !existing.exists();

  const name         = cleanName(details.name);
  const price        = details.price;
  const image        = details.image ?? null;
  const wowPrice     = typeof details.wowPrice === 'number' && details.wowPrice > 0 ? details.wowPrice : null;
  const isRocket     = details.isRocket === true;
  const deliveryType = typeof details.deliveryType === 'string' ? details.deliveryType : 'normal';
  const spec         = typeof details.spec === 'string' && details.spec.trim() ? details.spec.trim() : null;

  console.log('[Registrar] Writing product doc:', productGroupId, '| isNew:', isNew, '| price:', price, '| wowPrice:', wowPrice);

  const baseFields = {
    productGroupId,
    market:       'coupang',
    originalId:   productId,
    name,
    currentPrice: price,
    ...(wowPrice != null ? { wowPrice } : {}),
    image,
    isRocket,
    deliveryType,
    ...(spec != null ? { spec } : {}),
    isOutOfStock: false,
    stockStatus:  'in_stock',
    status:       'active',
    updatedAt:    serverTimestamp(),
  };

  if (isNew) {
    await setDoc(docRef, { ...baseFields, createdAt: serverTimestamp() });
  } else {
    await setDoc(docRef, baseFields, { merge: true });
  }

  await addDoc(collection(docRef, 'offers'), {
    price,
    ...(wowPrice != null ? { wowPrice } : {}),
    checkedAt: serverTimestamp(),
    source:    'client_fetch',
  });

  console.log('[Registrar] Product doc and offer written successfully.');

  if (uid) {
    const savedSnap = await getDocs(
      query(
        collection(db, 'user_saved_products'),
        where('userId',         '==', uid),
        where('productGroupId', '==', productGroupId),
      )
    );

    console.log('[Registrar] Existing linkage docs found:', savedSnap.size);

    if (savedSnap.empty) {
      await addDoc(collection(db, 'user_saved_products'), {
        userId:         uid,
        productGroupId: productGroupId,
        userSegment:    'unknown_segment',
        createdAt:      serverTimestamp(),
      });
      console.log('[Registrar] Linkage doc successfully created in user_saved_products for UID:', uid);
    } else {
      console.log('[Registrar] Linkage already exists — skipping duplicate write.');
    }
  }

  return { productGroupId, name, price, wowPrice, image, isNew };
}
