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
import { getCurrentUserSegment } from './saveService';
import { recordPrice } from './priceTrackingService';

function cleanName(raw) {
  return String(raw || '쿠팡 상품')
    .replace(/\[LIVE서버\]|\[API 브릿지 우회\]/g, '')
    // Coupang's <title>/og:title carries a trailing " | 쿠팡" site suffix —
    // meaningless noise once we only compare Coupang prices in-app anyway.
    .replace(/\s*\|\s*쿠팡\s*$/, '')
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
  // Real scraped brand when the page exposed one; otherwise the leading
  // word of the (already-cleaned) name is a decent approximation — Korean
  // Coupang listings are almost always titled "브랜드 상품명...".
  const brand        = (typeof details.brand === 'string' && details.brand.trim())
    ? details.brand.trim()
    : (name.split(' ')[0] || null);
  const vendorItemId = typeof details.vendorItemId === 'string' && details.vendorItemId ? details.vendorItemId : null;
  // optionId starts as a placeholder equal to the raw vendorItemId — the next
  // scheduled price check resolves a human-readable option name via the
  // server's tryV4Api (Coupang v4 PDP API) and normalizes optionId properly
  // (see scheduledPriceUpdate in functions/index.js). Using the raw id now
  // keeps this option distinguishable from other options of the same parent
  // immediately, instead of showing nothing until the first backend refresh.
  const optionId     = vendorItemId;

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
    ...(brand != null ? { brand } : {}),
    isOutOfStock: false,
    stockStatus:  'in_stock',
    status:       'active',
    updatedAt:    serverTimestamp(),
  };

  if (isNew) {
    await setDoc(docRef, { ...baseFields, createdAt: serverTimestamp() });
  } else if (!optionId) {
    // Legacy path — re-sharing the exact same base listing again is a
    // genuine refresh of the parent's representative identity, same as
    // before optionId existed.
    await setDoc(docRef, baseFields, { merge: true });
  } else {
    // Registering ANOTHER option of an already-known parent must NOT
    // overwrite the shared parent doc's name/spec/image/brand with THIS
    // option's values — different quantities/sizes usually have different
    // titles on Coupang (e.g. "...48개입" vs "...72개입"), and every
    // tracked card of this parent reads name/spec from this one doc. Doing
    // so previously made all of a parent's tracked cards flip to whichever
    // option was registered most recently. Each option's own display
    // fields are captured on its own user_saved_products link below
    // instead — only price-adjacent fields are safe to refresh here.
    await setDoc(docRef, {
      currentPrice: price,
      ...(wowPrice != null ? { wowPrice } : {}),
      isRocket,
      deliveryType,
      isOutOfStock: false,
      stockStatus:  'in_stock',
      updatedAt:    serverTimestamp(),
    }, { merge: true });
  }

  // Records the price observation in products/{id}/offers AND today's
  // daily_prices max/min bucket (the 60-day marketing average DetailScreen's
  // chart and the 관심상품 thumbnail discount badges use) in one call.
  // Stamped with optionId when captured so this option's price history
  // never mixes with a different option of the same parent product.
  await recordPrice(
    productGroupId,
    price,
    'client_fetch',
    wowPrice != null ? { wowPrice } : {},
    optionId,
  ).catch(() => {});

  console.log('[Registrar] Product doc and offer written successfully.');

  // Sibling options discovered by click-simulating through the page's own
  // options table (see GlobalMagicNudge.js) — real quantities/prices Coupang
  // actually sells, not guessed. Cached on trackedOptions WITHOUT touching
  // trackingCount, so "다른 옵션 보기" can show the full real option list
  // immediately while the price scheduler still only fans out to options
  // someone has actually chosen to track (trackingCount > 0).
  if (Array.isArray(details.siblingOptions) && details.siblingOptions.length > 0) {
    const siblingWrites = details.siblingOptions
      .filter((o) => o && typeof o.vendorItemId === 'string' && o.vendorItemId && o.vendorItemId !== vendorItemId)
      .map((o) => {
        const sibPrice = typeof o.priceText === 'string'
          ? parseInt(o.priceText.replace(/[^0-9]/g, ''), 10)
          : NaN;
        return setDoc(
          doc(db, 'products', productGroupId, 'trackedOptions', o.vendorItemId),
          {
            optionId:     o.vendorItemId,
            vendorItemId: o.vendorItemId,
            ...(typeof o.label === 'string' && o.label.trim() ? { optionLabel: o.label.trim() } : {}),
            ...(Number.isFinite(sibPrice) && sibPrice > 0 ? { lastPrice: sibPrice } : {}),
          },
          { merge: true },
        );
      });
    await Promise.all(siblingWrites).catch((e) => console.log('[Registrar] sibling option cache failed:', e?.message));
    console.log('[Registrar] Cached sibling options:', siblingWrites.length);
  }

  if (uid) {
    // Dedup on (userId, productGroupId) always, plus optionId when we
    // actually captured one — otherwise a second share of a different
    // option (e.g. the 6-pack after already tracking the 3-pack) would be
    // silently treated as "already saved" and dropped. When optionId is
    // null (no vendorItemId in the URL), this matches today's exact
    // behavior: any existing link for this parent counts as a duplicate.
    const dedupClauses = [
      where('userId',         '==', uid),
      where('productGroupId', '==', productGroupId),
    ];
    if (optionId) dedupClauses.push(where('optionId', '==', optionId));

    const savedSnap = await getDocs(query(collection(db, 'user_saved_products'), ...dedupClauses));

    console.log('[Registrar] Existing linkage docs found:', savedSnap.size);

    // Each option's own scraped name/spec/image/brand — captured here
    // (not on the shared parent doc) so this specific card always shows
    // what THIS option actually is, regardless of which other option of
    // the same parent gets registered later.
    const capturedFields = optionId != null
      ? { optionId, vendorItemId, capturedName: name, capturedSpec: spec, capturedImage: image, capturedBrand: brand }
      : {};

    if (savedSnap.empty) {
      const userSegment = await getCurrentUserSegment(uid);
      await addDoc(collection(db, 'user_saved_products'), {
        userId:         uid,
        productGroupId: productGroupId,
        userSegment,
        ...capturedFields,
        createdAt:      serverTimestamp(),
      });
      console.log('[Registrar] Linkage doc successfully created in user_saved_products for UID:', uid);
    } else if (optionId != null) {
      // Re-sharing an already-tracked option — refresh its own captured
      // display fields (never touches the parent doc or other options).
      await setDoc(doc(db, 'user_saved_products', savedSnap.docs[0].id), capturedFields, { merge: true });
      console.log('[Registrar] Refreshed captured fields for existing option link.');
    } else {
      console.log('[Registrar] Linkage already exists — skipping duplicate write.');
    }
  }

  return { productGroupId, name, price, wowPrice, image, isNew, optionId, vendorItemId };
}
