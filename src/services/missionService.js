import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase/config';

// ─── Mission definitions ───────────────────────────────────────────────────────
// Single source of truth for mission IDs, labels, actionTypes, and completion
// thresholds. BenefitsScreen reads this to render rows and check completion.
//
// actionType values are aligned with CLAUDE.md standardised action types:
//   product_view   — ProductDetail opened
//   ranking_visit  — RankingScreen visited
//   post_view      — PostDetailScreen opened

export const MISSION_DEFS = [
  {
    id: 'view_products',
    label: '아이와 또래 부모가 최근 7일 가장 많이 산 제품 보기',
    actionType: 'product_view',
    required: 3,
    countDistinct: true,   // count unique productGroupIds, not raw events
    hint: (done) => `상품 ${3 - Math.min(done, 3)}개 더 보면 완료`,
    navTarget: '홈',
  },
  {
    id: 'view_ranking',
    label: '랭킹 탭에서 인기 상품 확인하기',
    actionType: 'ranking_visit',
    required: 1,
    countDistinct: false,
    hint: () => '랭킹 탭을 방문하면 완료',
    navTarget: '랭킹',
  },
  {
    id: 'view_community',
    label: '커뮤니티 새 글 2개 읽기',
    actionType: 'post_view',
    required: 2,           // spec: 2회 이상
    countDistinct: false,
    hint: (done) => `글 ${2 - Math.min(done, 2)}개 더 보면 완료`,
    navTarget: '커뮤니티',
  },
];

// ─── checkMissionStatus ────────────────────────────────────────────────────────
//
// Fetches today's action logs for userId and returns mission progress counters.
// Uses a single query on user_product_actions (indexed by userId), then applies
// a client-side date filter for today — avoids the composite index requirement
// that a server-side createdAt filter would need.
//
// Returns: { view_products: number, view_ranking: number, view_community: number }

export async function checkMissionStatus(userId) {
  if (!userId) {
    return { view_products: 0, view_ranking: 0, view_community: 0 };
  }

  const todayMs = new Date().setHours(0, 0, 0, 0);

  const snap = await getDocs(
    query(collection(db, 'user_product_actions'), where('userId', '==', userId))
  );

  const viewedProducts = new Set();
  let view_ranking = 0;
  let view_community = 0;

  snap.docs.forEach((d) => {
    const { actionType, productGroupId, productId, createdAt } = d.data();
    const ts = createdAt?.toMillis?.() ?? 0;
    if (ts < todayMs) return; // today's actions only

    if (actionType === 'product_view') {
      const pid = productGroupId || productId;
      if (pid) viewedProducts.add(pid);
    }
    if (actionType === 'ranking_visit') view_ranking += 1;
    if (actionType === 'post_view') view_community += 1;
  });

  return {
    view_products: viewedProducts.size,
    view_ranking,
    view_community,
  };
}

// ─── allMissionsComplete ───────────────────────────────────────────────────────
// Convenience helper — returns true when every mission has reached its threshold.

export function allMissionsComplete(progress) {
  return MISSION_DEFS.every((m) => (progress[m.id] ?? 0) >= m.required);
}
