import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase/config';

// ─── Stage display labels ──────────────────────────────────────────────────────
const STAGE_LABELS = {
  pregnancy:    '임신 중',
  newborn:      '신생아 (0–2m)',
  early_infant: '초기 영아 (3–5m)',
  infant:       '영아 (6–11m)',
  toddler:      '걸음마 (12–23m)',
  early_child:  '유아 (24–36m)',
  child:        '어린이 (3세+)',
};

// ─── getDailyStats ─────────────────────────────────────────────────────────────
// Returns today's action counts.
// Single-field range query on createdAt — no composite index needed.
// { views, purchaseClicks, notificationOpens, ctr }
export async function getDailyStats() {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const snap = await getDocs(
    query(
      collection(db, 'user_product_actions'),
      where('createdAt', '>=', todayStart)
    )
  );

  let views = 0;
  let purchaseClicks = 0;
  let notificationOpens = 0;

  snap.docs.forEach((d) => {
    const { actionType } = d.data();
    if (actionType === 'product_view') views += 1;
    if (actionType === 'product_purchase_click') purchaseClicks += 1;
    if (actionType === 'notification_open') notificationOpens += 1;
  });

  const ctr = views > 0 ? ((purchaseClicks / views) * 100).toFixed(1) : '0.0';
  return { views, purchaseClicks, notificationOpens, ctr };
}

// ─── getTopConvertedProducts ───────────────────────────────────────────────────
// Top 10 products ranked by purchase-intent click count.
// Uses single-field equality query on actionType.
// Returns [{ productGroupId, name, clickCount }]
export async function getTopConvertedProducts() {
  const snap = await getDocs(
    query(
      collection(db, 'user_product_actions'),
      where('actionType', '==', 'product_purchase_click')
    )
  );

  const clicksByProduct = {};
  snap.docs.forEach((d) => {
    const { productGroupId, productId } = d.data();
    const pid = productGroupId || productId;
    if (!pid) return;
    clicksByProduct[pid] = (clicksByProduct[pid] || 0) + 1;
  });

  const top10 = Object.entries(clicksByProduct)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10);

  return Promise.all(
    top10.map(async ([pid, clickCount]) => {
      try {
        const productDoc = await getDoc(doc(db, 'products', pid));
        const name = productDoc.exists() ? productDoc.data().name || pid : pid;
        return { productGroupId: pid, name, clickCount };
      } catch {
        return { productGroupId: pid, name: pid, clickCount };
      }
    })
  );
}

// ─── getStageDistribution ──────────────────────────────────────────────────────
// Breakdown of registered children by stage.
// Returns [{ stage, label, count, pct }] sorted by count desc.
export async function getStageDistribution() {
  const snap = await getDocs(collection(db, 'children'));

  const stageCount = {};
  snap.docs.forEach((d) => {
    const stage = d.data().stage || 'unknown';
    stageCount[stage] = (stageCount[stage] || 0) + 1;
  });

  const total = Object.values(stageCount).reduce((s, n) => s + n, 0);

  return Object.entries(stageCount)
    .sort(([, a], [, b]) => b - a)
    .map(([stage, count]) => ({
      stage,
      label: STAGE_LABELS[stage] || stage,
      count,
      pct: total > 0 ? Math.round((count / total) * 100) : 0,
    }));
}

// ─── getRecentPurchaseIntentList ───────────────────────────────────────────────
// Last N product_purchase_click events with product names.
// Queries by createdAt desc (single-field index) then filters client-side
// to avoid composite index on actionType + createdAt.
export async function getRecentPurchaseIntentList(limitCount = 20) {
  const snap = await getDocs(
    query(
      collection(db, 'user_product_actions'),
      orderBy('createdAt', 'desc'),
      limit(100)           // over-fetch to ensure enough after client-side filter
    )
  );

  const items = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((d) => d.actionType === 'product_purchase_click')
    .slice(0, limitCount);

  // Batch fetch product names (deduplicated)
  const uniquePids = [...new Set(
    items.map((i) => i.productGroupId || i.productId).filter(Boolean)
  )];
  const nameMap = {};
  await Promise.all(
    uniquePids.map(async (pid) => {
      try {
        const productDoc = await getDoc(doc(db, 'products', pid));
        if (productDoc.exists()) nameMap[pid] = productDoc.data().name || pid;
      } catch {}
    })
  );

  return items.map((item) => {
    const pid = item.productGroupId || item.productId;
    return { ...item, productName: pid ? (nameMap[pid] || pid) : '알 수 없음' };
  });
}

// ─── getNotificationStats ──────────────────────────────────────────────────────
// Approximates notification open rate:
//   sent  = total price_drop_event logs (each triggers N notifications)
//   opens = total notification_open actions
// Returns { sent, opened, openRate }
export async function getNotificationStats() {
  const [dropSnap, openSnap] = await Promise.all([
    getDocs(
      query(
        collection(db, 'user_product_actions'),
        where('actionType', '==', 'price_drop_event')
      )
    ),
    getDocs(
      query(
        collection(db, 'user_product_actions'),
        where('actionType', '==', 'notification_open')
      )
    ),
  ]);

  const sent = dropSnap.size;
  const opened = openSnap.size;
  const openRate = sent > 0 ? ((opened / sent) * 100).toFixed(1) : '0.0';
  return { sent, opened, openRate };
}

// ─── computeAndWriteSelectionRates ────────────────────────────────────────────
// Admin utility: computes how many % of the last-30-day active user base
// interacted with each product, then writes `selectionRate` (0–100 integer)
// to each product doc.  ProductDetail reads this field for social proof copy.
//
// Uses a single-field range query on createdAt — no composite index needed.
// Writes are batched (max 500 per Firestore batch; loop if needed).
//
// Returns the number of product docs updated.
export async function computeAndWriteSelectionRates() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const actionsSnap = await getDocs(
    query(
      collection(db, 'user_product_actions'),
      where('createdAt', '>=', thirtyDaysAgo)
    )
  );

  const allUserIds = new Set();
  // Map productGroupId → Set of distinct userIds who clicked/viewed it
  const usersByProduct = {};

  actionsSnap.docs.forEach((d) => {
    const { userId, actionType, productGroupId, productId } = d.data();
    if (userId) allUserIds.add(userId);

    const isRelevant =
      actionType === 'product_purchase_click' ||
      actionType === 'product_view' ||
      actionType === 'product_click';
    if (!isRelevant) return;

    const pid = productGroupId || productId;
    if (!pid || !userId) return;
    if (!usersByProduct[pid]) usersByProduct[pid] = new Set();
    usersByProduct[pid].add(userId);
  });

  const totalUsers = allUserIds.size;
  if (totalUsers === 0) return 0;

  // Batch writes (Firestore max 500 per batch)
  const entries = Object.entries(usersByProduct).filter(([, s]) => s.size > 0);
  const BATCH_LIMIT = 450;
  let writeCount = 0;

  for (let i = 0; i < entries.length; i += BATCH_LIMIT) {
    const chunk = entries.slice(i, i + BATCH_LIMIT);
    const batch = writeBatch(db);
    chunk.forEach(([pid, userSet]) => {
      const rate = Math.max(1, Math.round((userSet.size / totalUsers) * 100));
      batch.update(doc(db, 'products', pid), { selectionRate: rate });
      writeCount += 1;
    });
    await batch.commit();
  }

  return writeCount;
}
