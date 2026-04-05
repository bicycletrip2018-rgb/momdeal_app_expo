import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase/config';

export async function fetchCoupangProductMetadata(productId, itemId) {
  if (!productId) {
    throw new Error('PRODUCT_ID_REQUIRED');
  }

  const fn = httpsCallable(functions, 'fetchCoupangProduct');
  const result = await fn({ productId, itemId: itemId || null });

  return {
    name: result.data?.name || 'unknown',
    price: result.data?.price ?? null,
    isOutOfStock: result.data?.isOutOfStock ?? false,
    image: result.data?.image || null,
    optionName: result.data?.optionName || null,
    sellerType: result.data?.sellerType || 'unknown',
    deliveryType: result.data?.deliveryType || 'normal',
    isRocket: result.data?.isRocket ?? false,
  };
}
