// ─── Gamification Taxonomy ────────────────────────────────────────────────────
// Single source of truth for tiers, badges, and mock gamification helpers.
// Imported by CommunityListScreen, PostDetailScreen, and MyPageScreen.

// Activity Tiers — earned by accumulated activity points (postCount*3 + commentCount)
export const TIER_LIST = [
  { minPts: 0,   label: '🥚 알콩맘',           bg: '#fefce8', text: '#a16207' },
  { minPts: 10,  label: '🌱 새싹맘',           bg: '#f0fdf4', text: '#15803d' },
  { minPts: 25,  label: '🌿 잎새맘',           bg: '#dcfce7', text: '#16a34a' },
  { minPts: 50,  label: '🍒 열매맘',           bg: '#fce7f3', text: '#be185d' },
  { minPts: 100, label: '🌳 세이브루 앰배서더', bg: '#f5f3ff', text: '#7c3aed' },
];

// Achievement Badges — identity titles shown next to the tier
export const BADGE_LIST = [
  { id: 'deal',   label: '🔥 핫딜 요정',   bg: '#fef3c7', text: '#b45309' },
  { id: 'hunter', label: '💸 최저가 헌터',  bg: '#ecfdf5', text: '#065f46' },
  { id: 'review', label: '📸 꼼꼼 리뷰어', bg: '#eff6ff', text: '#1d4ed8' },
  { id: 'fact',   label: '⭐ 팩트 폭격기', bg: '#fffbeb', text: '#92400e' },
  { id: 'heart',  label: '👼 공감 요정',   bg: '#fce7f3', text: '#9d174d' },
];

// ─── String hash ─────────────────────────────────────────────────────────────
// Stable, collision-resistant integer derived from any string.
// Uses the same djb2-style polynomial that is fast and uniform enough for display.

function simpleHash(str) {
  let h = 0;
  const s = String(str || 'anon');
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

// ─── Mock gamification ────────────────────────────────────────────────────────
// Deterministically assigns a Tier + Badge to any user key (userId or nickname).
// Live Firestore posts have userId but no badgeId/tierId — this covers that gap.
// Mock posts (no userId) fall back to nickname. Same key → same result, always.

export function getMockGamification(key) {
  const h     = simpleHash(key);
  const tier  = TIER_LIST[h % TIER_LIST.length];
  // Right-shift by 3 before modulo so tier and badge indices diverge for short strings
  const badge = BADGE_LIST[(h >>> 3) % BADGE_LIST.length];
  return { tier, badge };
}

// ─── Own-profile helpers (uses actual activity points) ───────────────────────
// These are used in MyPageScreen where we know the real postCount / commentCount.

export function deriveUserTier(postCount, commentCount) {
  const pts = (postCount || 0) * 3 + (commentCount || 0);
  let tier = TIER_LIST[0];
  for (const t of TIER_LIST) { if (pts >= t.minPts) tier = t; }
  return tier;
}

export function deriveUserBadge(postCount, commentCount) {
  const pts = (postCount || 0) * 3 + (commentCount || 0);
  // Each 20-pt bracket unlocks the next badge; capped at the last entry
  const idx = Math.min(Math.floor(pts / 20), BADGE_LIST.length - 1);
  return BADGE_LIST[idx];
}

// ─── V2 Gamification — Nae-don-nae-san quality system ────────────────────────
// Tiers unlock based on proof-of-purchase review quality, not raw activity pts.
// Criteria are intentionally modest so early users feel progress quickly.

export const TIER_LIST_V2 = [
  {
    id: 'explorer',
    name: '탐색맘',
    emoji: '🔍',
    bg: '#fefce8', text: '#a16207',
    criteria: '회원가입 즉시',
    criteriaDetail: '앱 설치 & 아이 프로필 등록',
    reward: '기본 맞춤 추천 알림',
    rewardDetail: '가격 추적 (최대 5개)',
  },
  {
    id: 'smart',
    name: '스마트맘',
    emoji: '💡',
    bg: '#eff6ff', text: '#1d4ed8',
    criteria: '내돈내산 리뷰 1개 + 추적 상품 5개 이상',
    criteriaDetail: '실구매 인증 리뷰 작성 1회 & 가격 추적 5개 이상',
    reward: '시크릿 딜 접근 🔓',
    rewardDetail: '가격 히스토리 무제한 조회 + 시크릿 특가 알림',
  },
  {
    id: 'pro',
    name: '프로리뷰어',
    emoji: '📸',
    bg: '#f0fdf4', text: '#15803d',
    criteria: '사진 포함 내돈내산 리뷰 3개 + 게시글 3개 이상',
    criteriaDetail: '사진 첨부 실구매 인증 리뷰 3회 & 커뮤니티 게시글 3개 이상',
    reward: '프리미엄 체험단 응모 자격 🎁',
    rewardDetail: '체험단 우선 응모 + 내돈내산 리뷰어 배지 + 추적 상품 무제한',
  },
  {
    id: 'ambassador',
    name: '앰버서더',
    emoji: '👑',
    bg: '#fdf4ff', text: '#7e22ce',
    criteria: '사진 포함 내돈내산 리뷰 10개 + 게시글 10개 이상',
    criteriaDetail: '활발한 커뮤니티 기여 & 10회 이상 구매 인증 리뷰',
    reward: '파트너스 자격 👑',
    rewardDetail: '브랜드 협업 기회 + 수익 쉐어링 + 전용 채널 초대',
  },
];

export const TITLE_LIST_V2 = [
  {
    id: 'pro_reviewer',
    emoji: '📸',
    label: '#내돈내산_마스터',
    bg: '#f0fdf4', text: '#15803d',
    minReviews: 5, minSaved: 0, minPosts: 0,
  },
  {
    id: 'deal_fairy',
    emoji: '🧚‍♀️',
    label: '#핫딜_요정',
    bg: '#fdf4ff', text: '#7e22ce',
    minReviews: 0, minSaved: 20, minPosts: 0,
  },
  {
    id: 'mentor',
    emoji: '💡',
    label: '#육아_멘토',
    bg: '#fffbeb', text: '#b45309',
    minReviews: 0, minSaved: 0, minPosts: 10,
  },
];

// Returns { tier, tierIdx, nextTier, titles, xp, xpMax, progressCopy }
// stats = { reviewCount, postCount, savedCount }
export function deriveUserGamificationV2({ reviewCount = 0, postCount = 0, savedCount = 0 } = {}) {
  const rv = reviewCount || 0;
  const pv = postCount   || 0;
  const sv = savedCount  || 0;

  // Walk up tiers — last one that fully satisfies criteria wins
  let tierIdx = 0;
  for (let i = 0; i < TIER_LIST_V2.length; i++) {
    const t = TIER_LIST_V2[i];
    const minR = t.id === 'smart' ? 1 : t.id === 'pro' ? 3 : t.id === 'ambassador' ? 10 : 0;
    const minP = t.id === 'pro'   ? 3 : t.id === 'ambassador' ? 10 : 0;
    const minS = t.id === 'smart' ? 5 : t.id === 'pro' ? 10 : t.id === 'ambassador' ? 30 : 0;
    if (rv >= minR && pv >= minP && sv >= minS) tierIdx = i;
  }
  const tier     = TIER_LIST_V2[tierIdx];
  const nextTier = TIER_LIST_V2[tierIdx + 1] ?? null;

  // Active titles
  const titles = TITLE_LIST_V2.filter(
    (t) => rv >= t.minReviews && sv >= t.minSaved && pv >= t.minPosts
  );

  // XP progress toward next tier (0-100)
  let xp = 100, xpMax = 100, progressCopy = '최고 등급 앰버서더! 파트너스 혜택을 누려보세요 👑';
  if (nextTier) {
    const minR = nextTier.id === 'smart' ? 1 : nextTier.id === 'pro' ? 3 : 10;
    const minP = nextTier.id === 'pro'   ? 3 : nextTier.id === 'ambassador' ? 10 : 0;
    const minS = nextTier.id === 'smart' ? 5 : nextTier.id === 'pro' ? 10 : 30;

    const rProgress = minR > 0 ? Math.min(rv / minR, 1) : 1;
    const pProgress = minP > 0 ? Math.min(pv / minP, 1) : 1;
    const sProgress = minS > 0 ? Math.min(sv / minS, 1) : 1;
    xp = Math.floor(((rProgress + pProgress + sProgress) / 3) * 100);

    const rLeft = Math.max(minR - rv, 0);
    const pLeft = Math.max(minP - pv, 0);
    const sLeft = Math.max(minS - sv, 0);

    if (rLeft > 0) {
      progressCopy = `내돈내산 리뷰 ${rLeft}개만 더 쓰면 ${nextTier.name} 달성! 🎁`;
    } else if (pLeft > 0) {
      progressCopy = `게시글 ${pLeft}개만 더 작성하면 ${nextTier.name} 달성! ✍️`;
    } else if (sLeft > 0) {
      progressCopy = `상품 ${sLeft}개만 더 추가하면 ${nextTier.name} 달성! 📦`;
    } else {
      progressCopy = `${nextTier.name} 달성까지 거의 다 왔어요! 🔥`;
    }
  }

  return { tier, tierIdx, nextTier, titles, xp, xpMax, progressCopy };
}
