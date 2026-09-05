import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase/config';
import { invalidatePriceIntelligenceCache } from './priceTrackingService';

// Thin client shim over the submitScrapedProduct Callable Function — the
// actual products/offers/daily_prices/trackedOptions writes moved server-side
// (see functions/index.js) so a scraped price can be independently
// re-verified via Bright Data before it's trusted enough to write. This file
// used to write directly to Firestore with the client's own auth session;
// GlobalMagicNudge.js calls this exact same signature either way, so that
// integration point didn't need to change.
export async function registerProductFromClient(productId, details, uid) {
  console.log('[Registrar] Submitting scraped product for verification:', productId, 'UID:', uid);

  if (!uid) {
    console.error('[Registrar] ERROR: UID is missing! Cannot link product to user.');
  }

  const submit = httpsCallable(functions, 'submitScrapedProduct');
  const { data } = await submit({ productId, details });

  console.log('[Registrar] Server verified and wrote product:', data);

  // The write now happens inside the Cloud Function, entirely outside this
  // client's process — priceTrackingService.js's intelCache has no way to
  // know it just went stale, so without this the 관심상품 list could keep
  // showing the pre-registration price for up to the cache's 60s TTL.
  invalidatePriceIntelligenceCache(data.productGroupId, data.optionId ?? null);

  return data;
}
