import { Share } from 'react-native';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';

// Bridge URL handled by the handleShareLink Cloud Function.
// Non-app users are immediately redirected to the affiliate link.
const SHARE_BASE_URL =
  'https://us-central1-momdeal-494c4.cloudfunctions.net/handleShareLink';

/**
 * Returns the shareable bridge URL for a product.
 * Format: https://…/handleShareLink?p={productGroupId}
 */
export function generateShareLink(productGroupId) {
  return `${SHARE_BASE_URL}?p=${encodeURIComponent(productGroupId)}`;
}

function buildShareMessage(productName, priceVerdict) {
  const name = productName || '상품';
  if (priceVerdict === 'BEST_TIME') {
    return `🔥 [세이브루] 이거 지금 역대급 가격이에요! ${name} 확인해보세요.`;
  }
  return `${name} 가격 추적 중! 지금 세이브루에서 확인하세요.`;
}

/**
 * Triggers the native share sheet and logs a product_share action.
 *
 * @param {Object} params
 * @param {string} params.productGroupId  — Firestore document ID (identity rule)
 * @param {string} [params.productName]
 * @param {string} [params.priceVerdict]  — 'BEST_TIME' | 'GOOD_TIME' | 'WAIT' | null
 * @param {string} [params.userId]
 */
export async function shareProduct({ productGroupId, productName, priceVerdict, userId }) {
  if (!productGroupId) return;

  const link = generateShareLink(productGroupId);
  const message = buildShareMessage(productName, priceVerdict);

  try {
    const result = await Share.share({
      title: '[세이브루] 육아템 가격 추적',
      message: `${message}\n${link}`,
      url: link, // iOS only — shown separately below the message
    });

    if (result.action === Share.sharedAction) {
      addDoc(collection(db, 'user_product_actions'), {
        userId: userId || null,
        productGroupId,
        productId: productGroupId,
        actionType: 'product_share',
        priceVerdict: priceVerdict || null,
        createdAt: serverTimestamp(),
      }).catch(() => {});
    }
  } catch (_) {
    // Share sheet dismissed or error — silent
  }
}
