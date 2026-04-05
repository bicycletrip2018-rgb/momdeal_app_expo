import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import GlobalHeader from '../components/GlobalHeader';
import { globalFavorites } from '../utils/favoriteStore';
import { fetchAffiliateAndNavigate } from '../utils/fetchProductData';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { recordProductAction } from '../services/productActionService';

// ─── Stage display labels ─────────────────────────────────────────────────────

const STAGE_LABELS = {
  pregnancy:    '임신중',
  newborn:      '신생아',
  early_infant: '초기영아',
  infant:       '영아',
  toddler:      '걸음마기',
  early_child:  '유아',
  child:        '아동',
};

// ─── Top tabs ─────────────────────────────────────────────────────────────────

const TOP_TABS = [
  { key: 'rising',   label: '🚀 급상승' },
  { key: 'category', label: '🗂️ 카테고리별' },
  { key: 'interest', label: '❤️ 관심' },
  { key: 'new',      label: '✨ 신제품' },
  { key: 'brand',    label: '🏢 브랜드' },
];

// ─── Category filters (Coupang macro categories) ─────────────────────────────

const CATEGORY_FILTERS = [
  { key: 'all',       label: '전체' },
  { key: 'baby',      label: '출산/유아동' },
  { key: 'food',      label: '식품' },
  { key: 'living',    label: '생활용품' },
  { key: 'beauty',    label: '뷰티' },
  { key: 'fashion',   label: '패션의류/잡화' },
  { key: 'home',      label: '홈인테리어' },
  { key: 'digital',   label: '가전디지털' },
  { key: 'hobby',     label: '완구/취미' },
  { key: 'pet',       label: '반려동물용품' },
];

// Custom-ranking reason templates
const CUSTOM_REASONS = [
  (c) => `${c.ageLabel} ${c.genderLabel} 부모들이 많이 샀어요`,
  (_) => `또래 맘들이 재구매하는 상품`,
  (c) => `${c.ageLabel} 필수 육아템`,
  (_) => `이 시기 엄마들의 1순위 선택`,
  (_) => `워킹맘도 강력 추천하는 상품`,
];

// ─── Ranked dummy products (20 items) ────────────────────────────────────────

const RANKED_PRODUCTS = [
  { id: 'r1',  category: 'baby',    brand: '하기스',        name: '네이처메이드 기저귀 신생아용 100매 초슬림 풀박스',        rating: 4.9, reviewCount: 2140,  price: 28900,  original: 52900,  discount: 45, isRocket: true,  emoji: '🧷', bg: '#fef9c3', customReasonIdx: 0, rankChange: 'NEW' },
  { id: 'r2',  category: 'baby',    brand: '헤겐',          name: '와이드넥 PP 젖병 세트 160ml + 240ml 4개입 신생아',       rating: 4.8, reviewCount: 1893,  price: 34900,  original: 46000,  discount: 24, isRocket: true,  emoji: '🍼', bg: '#ede9fe', customReasonIdx: 2, rankChange: +12 },
  { id: 'r3',  category: 'baby',    brand: '마미포코',      name: '팬티형 기저귀 M사이즈 58매 × 2팩 점보 세트',            rating: 4.7, reviewCount: 3271,  price: 39900,  original: 54000,  discount: 26, isRocket: true,  emoji: '🧷', bg: '#fef9c3', customReasonIdx: 1, rankChange: +5  },
  { id: 'r4',  category: 'beauty',  brand: '프리미엄베베',  name: '순한 아기 로션 400ml + 바디워시 세트 무향 저자극',       rating: 4.8, reviewCount: 1024,  price: 22900,  original: 35000,  discount: 35, isRocket: false, emoji: '🧴', bg: '#fce7f3', customReasonIdx: 3, rankChange: -2  },
  { id: 'r5',  category: 'baby',    brand: '스토케',        name: '스쿠트5 바운서 스트롤러 신생아부터 사용 가능',           rating: 4.9, reviewCount: 875,   price: 249000, original: 320000, discount: 22, isRocket: false, emoji: '🛒', bg: '#ecfdf5', customReasonIdx: 4, rankChange: +8  },
  { id: 'r6',  category: 'baby',    brand: '매일유업',      name: '앱솔루트 분유 스텝2 800g × 2캔 DHA 강화 패키지',       rating: 4.7, reviewCount: 2104,  price: 58900,  original: 76000,  discount: 22, isRocket: true,  emoji: '🥛', bg: '#f0fdf4', customReasonIdx: 0, rankChange: -3  },
  { id: 'r7',  category: 'baby',    brand: '팸퍼스',        name: '하이비 프리미엄 기저귀 L사이즈 56매',                   rating: 4.7, reviewCount: 1743,  price: 26900,  original: 38000,  discount: 29, isRocket: true,  emoji: '🧷', bg: '#fef9c3', customReasonIdx: 2, rankChange: +3  },
  { id: 'r8',  category: 'baby',    brand: '루미',          name: '이유식 용기 세트 100ml × 8개 BPA Free 이유식 보관',     rating: 4.5, reviewCount: 632,   price: 18900,  original: 28000,  discount: 32, isRocket: false, emoji: '🥣', bg: '#e0f2fe', customReasonIdx: 1, rankChange: 'NEW' },
  { id: 'r9',  category: 'beauty',  brand: '세타필 베이비', name: '신생아 전용 데일리 로션 400ml 무향 저자극 SPF 50',      rating: 4.9, reviewCount: 1456,  price: 31900,  original: 42000,  discount: 24, isRocket: true,  emoji: '🧴', bg: '#fce7f3', customReasonIdx: 3, rankChange: +6  },
  { id: 'r10', category: 'baby',    brand: '다이치',        name: '듀얼핏 360 회전형 카시트 신생아~4세 ISOFIX',            rating: 4.8, reviewCount: 2231,  price: 319000, original: 429000, discount: 26, isRocket: false, emoji: '🚗', bg: '#fef9c3', customReasonIdx: 4, rankChange: -1  },
  { id: 'r11', category: 'hobby',   brand: '피셔프라이스',  name: '소리나는 멀티활동 점퍼루 4-in-1 성장형 바운서',         rating: 4.9, reviewCount: 987,   price: 159000, original: 199000, discount: 20, isRocket: true,  emoji: '🪀', bg: '#ecfdf5', customReasonIdx: 0, rankChange: +15 },
  { id: 'r12', category: 'hobby',   brand: '레고 듀플로',   name: '클래식 기본 벽돌 세트 38피스 (1.5~5세)',               rating: 4.8, reviewCount: 3012,  price: 27900,  original: 38000,  discount: 26, isRocket: true,  emoji: '🧱', bg: '#fef9c3', customReasonIdx: 2, rankChange: +2  },
  { id: 'r13', category: 'beauty',  brand: '아토팜',        name: '어린이 미네랄 선크림 SPF50+ PA++++ 70ml',              rating: 4.6, reviewCount: 891,   price: 19900,  original: 27000,  discount: 26, isRocket: false, emoji: '☀️', bg: '#fefce8', customReasonIdx: 1, rankChange: -4  },
  { id: 'r14', category: 'food',    brand: '아이배냇',      name: '유기농 쌀과자 딸기맛 15봉 멀티팩 무첨가',              rating: 4.7, reviewCount: 1124,  price: 15800,  original: 23600,  discount: 33, isRocket: true,  emoji: '🍘', bg: '#fff7ed', customReasonIdx: 2, rankChange: +9  },
  { id: 'r15', category: 'living',  brand: '퍼실',          name: '베이비 세탁세제 3L 유아 피부 전용 무형광',             rating: 4.8, reviewCount: 2456,  price: 13200,  original: 18900,  discount: 30, isRocket: true,  emoji: '🫧', bg: '#f0f9ff', customReasonIdx: 3, rankChange: +1  },
  { id: 'r16', category: 'fashion', brand: '아이더',        name: '유아 경량 패딩 조끼 12~36개월 3색상',                 rating: 4.5, reviewCount: 678,   price: 29900,  original: 49000,  discount: 39, isRocket: false, emoji: '🧥', bg: '#fdf4ff', customReasonIdx: 0, rankChange: -5  },
  { id: 'r17', category: 'home',    brand: '드리미',        name: '유아 안전 계단 게이트 압박식 확장형 75~120cm',         rating: 4.7, reviewCount: 1345,  price: 38900,  original: 59000,  discount: 34, isRocket: true,  emoji: '🚧', bg: '#f0fdf4', customReasonIdx: 4, rankChange: +4  },
  { id: 'r18', category: 'digital', brand: '샤오미',        name: '유아 스마트 모니터 카메라 양방향 음성 야간투시',        rating: 4.6, reviewCount: 891,   price: 49900,  original: 79000,  discount: 37, isRocket: true,  emoji: '📷', bg: '#eff6ff', customReasonIdx: 1, rankChange: 'NEW' },
  { id: 'r19', category: 'pet',     brand: '보이체',        name: '소형견 전용 오리 저키 간식 200g 무방부제',             rating: 4.8, reviewCount: 2103,  price: 12900,  original: 19800,  discount: 35, isRocket: true,  emoji: '🦴', bg: '#fff7ed', customReasonIdx: 3, rankChange: +7  },
  { id: 'r20', category: 'food',    brand: '베이비본죽',    name: '이유식 중기 완료기 세트 10팩 냉동 보관',               rating: 4.9, reviewCount: 1567,  price: 38900,  original: 54000,  discount: 28, isRocket: false, emoji: '🍲', bg: '#fef9c3', customReasonIdx: 2, rankChange: -2  },
];

const PAGE_SIZE = 20; // cap before "load more"

// ─── Sub-component: PersonalizationTag ───────────────────────────────────────

function PersonalizationTag({ item, child }) {
  if (!child) return null;
  const ageLabel    = `${child.ageMonth}개월`;
  const genderLabel = child.gender === 'female' ? '여아' : '남아';
  const reason = CUSTOM_REASONS[item.customReasonIdx % CUSTOM_REASONS.length]({ ageLabel, genderLabel });
  return (
    <View style={styles.customTag}>
      <Text style={styles.customTagText}>✨ {reason}</Text>
    </View>
  );
}

// ─── Sub-component: RankBadge ─────────────────────────────────────────────────

function RankChangeBadge({ rankChange }) {
  if (rankChange === 'NEW') {
    return <Text style={styles.rankChangeNew}>NEW</Text>;
  }
  if (typeof rankChange === 'number' && rankChange > 0) {
    return <Text style={styles.rankChangeUp}>▲ {rankChange}</Text>;
  }
  if (typeof rankChange === 'number' && rankChange < 0) {
    return <Text style={styles.rankChangeDown}>▼ {Math.abs(rankChange)}</Text>;
  }
  return null;
}

function RankBadge({ rank }) {
  const medalColors = { 1: '#fbbf24', 2: '#94a3b8', 3: '#b45309' };
  const medal = medalColors[rank];
  return (
    <View style={styles.rankBox}>
      {medal ? (
        <View style={[styles.medalCircle, { backgroundColor: medal }]}>
          <Text style={styles.medalText}>{rank}</Text>
        </View>
      ) : (
        <Text style={styles.rankNumDefault}>{rank}</Text>
      )}
      <View style={styles.rankDash} />
    </View>
  );
}

// ─── Sub-component: RankItem ──────────────────────────────────────────────────

function RankItem({ item, rank, navigation, isCustom, child }) {
  return (
    <TouchableOpacity
      style={styles.rankItem}
      onPress={() => {
        recordProductAction({ userId: auth.currentUser?.uid, productId: item.id, productGroupId: item.id, actionType: 'click' });
        navigation.navigate('Detail', { item, from: 'Ranking' });
      }}
      activeOpacity={0.85}
    >
      {/* ── Left: rank badge ── */}
      <RankBadge rank={rank} />

      {/* ── Thumbnail ── */}
      <View style={[styles.itemThumb, { backgroundColor: '#ffffff' }]}>
        <Text style={styles.itemEmoji}>{item.emoji}</Text>
      </View>

      {/* ── Right: text info ── */}
      <View style={styles.itemInfo}>
        {isCustom && child && <PersonalizationTag item={item} child={child} />}

        {/* Row 1: Brand + Name inline */}
        <Text numberOfLines={2} style={{ lineHeight: 19 }}>
          <Text style={{ fontSize: 12, fontWeight: '400', color: '#adb5bd' }}>{item.brand} </Text>
          <Text style={{ fontSize: 13, fontWeight: '500', color: '#212529' }}>{item.name}</Text>
        </Text>

        {/* Row 2: Rating */}
        <View style={styles.itemRatingRow}>
          <Text style={styles.itemStars}>⭐</Text>
          <Text style={styles.itemRating}>{item.rating}</Text>
          <Text style={styles.itemReviewCount}>({item.reviewCount.toLocaleString('ko-KR')})</Text>
        </View>

        {/* Row 3: Discount + price */}
        <View style={styles.itemPriceRow}>
          <Text style={styles.itemDiscount}>{item.discount}%</Text>
          <Text style={styles.itemPrice}>{item.price.toLocaleString('ko-KR')}원</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Sub-component: LoadMoreFooter ────────────────────────────────────────────

function LoadMoreFooter({ onPress }) {
  return (
    <TouchableOpacity style={styles.loadMoreBtn} onPress={onPress} activeOpacity={0.85}>
      <Text style={styles.loadMoreText}>랭킹 더보기 ▾</Text>
    </TouchableOpacity>
  );
}

// ─── Sub-component: HeroBanner ────────────────────────────────────────────────

function HeroBanner() {
  return (
    <TouchableOpacity
      style={styles.heroBanner}
      activeOpacity={0.9}
      onPress={() => Alert.alert('오늘의 폭락템', '역대급 폭락템 모아보기 전용 화면으로 이동합니다.')}
    >
      <View style={styles.heroBadge}>
        <Text style={styles.heroBadgeText}>📊 오늘의 쿠팡 가격 동향</Text>
      </View>
      <Text style={styles.heroTitle}>
        {'현재 142개 상품의\n가격이 어제보다 하락했어요.'}
      </Text>
    </TouchableOpacity>
  );
}

// ─── Sub-component: GuidanceBanner ───────────────────────────────────────────

function GuidanceBanner() {
  const [expanded, setExpanded] = useState(false);
  return (
    <View style={styles.guidanceBanner}>
      <TouchableOpacity style={styles.guidanceHeader} onPress={() => setExpanded((v) => !v)} activeOpacity={0.8}>
        <Text style={styles.guidanceTitle}>세이브루 랭킹은 어떻게 선정되나요?</Text>
        <Text style={styles.guidanceArrow}>{expanded ? '▲' : '▼'}</Text>
      </TouchableOpacity>
      {expanded && (
        <View style={styles.guidanceBody}>
          <View style={styles.guidanceCriteriaRow}>
            <Text style={styles.guidanceKeyword}>💸 가격 매력도</Text>
            <Text style={styles.guidanceTextNormal}>최근 24시간 내 가격 하락폭 및 역대 최저가 근접도</Text>
          </View>
          <View style={styles.guidanceCriteriaRow}>
            <Text style={styles.guidanceKeyword}>🔥 오픈런 지수</Text>
            <Text style={styles.guidanceTextNormal}>해당 상품에 '목표가 알림'을 설정하고 대기 중인 유저 수</Text>
          </View>
          <View style={styles.guidanceCriteriaRow}>
            <Text style={styles.guidanceKeyword}>🛒 실시간 판매량</Text>
            <Text style={styles.guidanceTextNormal}>실제 이커머스 플랫폼의 결제 및 검색 트렌드</Text>
          </View>
        </View>
      )}
    </View>
  );
}

// ─── Sub-component: CoupangCtaFooter ─────────────────────────────────────────

function CoupangCtaFooter() {
  return (
    <TouchableOpacity
      style={styles.ctaFooter}
      activeOpacity={0.88}
      onPress={() => Linking.openURL('https://www.coupang.com').catch(() => {})}
    >
      <View style={styles.ctaFooterInner}>
        <Text style={styles.ctaFooterEmoji}>🛍️</Text>
        <View style={styles.ctaFooterText}>
          <Text style={styles.ctaFooterTitle}>쿠팡에서 더 많은 베스트 상품 보기</Text>
          <Text style={styles.ctaFooterSub}>파트너스 활동을 통해 수수료를 받을 수 있습니다</Text>
        </View>
        <Text style={styles.ctaFooterArrow}>›</Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function RankingScreen({ navigation }) {
  const [activeTab,          setActiveTab]          = useState('rising');
  const [selectedCategory,   setSelectedCategory]   = useState('all');
  const [isCustomRanking,    setIsCustomRanking]     = useState(false);
  const [child,              setChild]              = useState(null);
  const [savedIds,           setSavedIds]           = useState(() => new Set(globalFavorites));
  const [refreshing,         setRefreshing]         = useState(false);
  const [showAll,            setShowAll]            = useState(false);
  const [showTooltip,        setShowTooltip]        = useState(false);
  const [showCategorySheet,  setShowCategorySheet]  = useState(false);
  const [toastVisible,       setToastVisible]       = useState(false);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    getDocs(query(collection(db, 'children'), where('userId', '==', uid)))
      .then((snap) => { if (!snap.empty) setChild(snap.docs[0].data()); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (uid) recordProductAction({ userId: uid, actionType: 'ranking_visit' }).catch(() => {});
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 600);
  }, []);

  const handleSave = useCallback((id) => {
    setSavedIds((prev) => {
      const next = new Set(prev);
      const wasNew = !next.has(id);
      if (wasNew) {
        next.add(id);
        globalFavorites.add(id);
        setToastVisible(true);
        setTimeout(() => setToastVisible(false), 2000);
      } else {
        next.delete(id);
        globalFavorites.delete(id);
      }
      return next;
    });
  }, []);

  // Tab + category filter, then cap at PAGE_SIZE unless showAll
  const filtered = useMemo(() => {
    let base = RANKED_PRODUCTS;
    if (activeTab === 'new') {
      base = base.filter((p) => p.rankChange === 'NEW');
    } else if (activeTab === 'interest') {
      base = base.filter((p) => p.rating >= 4.8 && p.reviewCount > 1000);
    } else if (activeTab === 'brand') {
      const seen = new Set();
      base = base.filter((p) => { if (seen.has(p.brand)) return false; seen.add(p.brand); return true; });
    }
    if (selectedCategory !== 'all') {
      base = base.filter((p) => p.category === selectedCategory);
    }
    return showAll ? base : base.slice(0, PAGE_SIZE);
  }, [activeTab, selectedCategory, showAll]);

  const totalCount = useMemo(() => {
    let base = RANKED_PRODUCTS;
    if (activeTab === 'new') {
      base = base.filter((p) => p.rankChange === 'NEW');
    } else if (activeTab === 'interest') {
      base = base.filter((p) => p.rating >= 4.8 && p.reviewCount > 1000);
    } else if (activeTab === 'brand') {
      const seen = new Set();
      base = base.filter((p) => { if (seen.has(p.brand)) return false; seen.add(p.brand); return true; });
    }
    return base.filter((p) => selectedCategory === 'all' || p.category === selectedCategory).length;
  }, [activeTab, selectedCategory]);

  const ListHeader = useCallback(() => (
    <View>
      <HeroBanner />
    </View>
  ), []);

  return (
    <View style={styles.container}>

      {/* ── Global header: logo + search + guide modal ── */}
      <GlobalHeader tabName="Ranking" placeholder="어떤 상품의 랭킹이 궁금하신가요?" />

      {/* ── Top tabs ── */}
      <View style={styles.topTabBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.topTabRow}
          bounces={false}
        >
          {TOP_TABS.map((tab) => {
            const active = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[styles.topTab, active && styles.topTabActive]}
                onPress={() => { setActiveTab(tab.key); setShowAll(false); }}
                activeOpacity={0.8}
              >
                <Text style={[styles.topTabText, active && styles.topTabTextActive]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* ── Filter row ── */}
      <View style={styles.filterRowBar}>
        <TouchableOpacity
          style={styles.categoryDropBtn}
          activeOpacity={0.8}
          onPress={() => setShowCategorySheet(true)}
        >
          <Text style={styles.categoryDropBtnText}>
            {CATEGORY_FILTERS.find((f) => f.key === selectedCategory)?.label || '전체'} ▼
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.rankCriteriaBtn} onPress={() => setShowTooltip(true)} activeOpacity={0.8}>
          <Text style={styles.rankCriteriaBtnText}>랭킹 기준 ?</Text>
        </TouchableOpacity>

        <View style={styles.pillToggle}>
          <TouchableOpacity
            style={[styles.pillToggleBtn, !isCustomRanking && styles.pillToggleBtnActive]}
            onPress={() => setIsCustomRanking(false)}
            activeOpacity={0.8}
          >
            <Text style={[styles.pillToggleBtnText, !isCustomRanking && styles.pillToggleBtnTextActive]}>전체</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.pillToggleBtn, isCustomRanking && styles.pillToggleBtnActive]}
            onPress={() => setIsCustomRanking(true)}
            activeOpacity={0.8}
          >
            <Text style={[styles.pillToggleBtnText, isCustomRanking && styles.pillToggleBtnTextActive]}>
              {child ? `👶 우리 아이(${STAGE_LABELS[child.stage] || child.ageMonth + '개월'}) 맞춤` : '👶 또래 맞춤'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Ranking criteria tooltip ── */}
      <Modal transparent visible={showTooltip} animationType="fade" onRequestClose={() => setShowTooltip(false)}>
        <Pressable style={styles.tooltipOverlay} onPress={() => setShowTooltip(false)}>
          <Pressable style={styles.tooltipCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.tooltipTitle}>랭킹 선정 기준</Text>
            <View style={styles.tooltipRow}>
              <Text style={styles.tooltipKeyword}>📉 최근 최저가 근접도</Text>
              <Text style={styles.tooltipDesc}>현재 가격이 역대 최저가에 얼마나 근접한지를 반영합니다</Text>
            </View>
            <View style={styles.tooltipRow}>
              <Text style={styles.tooltipKeyword}>⏰ 실시간 알림 설정 수</Text>
              <Text style={styles.tooltipDesc}>목표가 알림을 설정하고 대기 중인 유저 수가 많을수록 높게 반영됩니다</Text>
            </View>
            <View style={styles.tooltipRow}>
              <Text style={styles.tooltipKeyword}>🛒 실시간 결제 완료 건</Text>
              <Text style={styles.tooltipDesc}>최근 24시간 내 실제 결제가 완료된 건수를 기준으로 합니다</Text>
            </View>
            <TouchableOpacity style={styles.tooltipClose} onPress={() => setShowTooltip(false)}>
              <Text style={styles.tooltipCloseText}>확인</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Heart toast ── */}
      {toastVisible && (
        <View style={{position: 'absolute', bottom: 90, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.8)', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8, zIndex: 9999}} pointerEvents="none">
          <Text style={{color: '#fff', fontWeight: 'bold'}}>최저가 알림 시작! 관심상품 탭에서 확인하세요</Text>
        </View>
      )}

      {/* ── Ranked vertical feed ── */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <RankItem
            item={item}
            rank={index + 1}
            navigation={navigation}
            isCustom={isCustomRanking}
            child={child}
          />
        )}
        ListHeaderComponent={ListHeader}
        ListFooterComponent={
          <View>
            {!showAll && totalCount > PAGE_SIZE && (
              <LoadMoreFooter onPress={() => setShowAll(true)} />
            )}
            {showAll && (
              <LoadMoreFooter onPress={() => Alert.alert('', '전체 랭킹 100+ 상품을 불러오는 중이에요!')} />
            )}
            <CoupangCtaFooter />
          </View>
        }
        ItemSeparatorComponent={null}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Text style={styles.emptyIcon}>🤔</Text>
            <Text style={styles.emptyText}>해당 카테고리 상품이 없어요</Text>
            <Text style={styles.emptySub}>다른 카테고리를 선택해보세요</Text>
          </View>
        }
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#1d4ed8']}
            tintColor="#1d4ed8"
          />
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#f8fafc' },
  listContent: { paddingBottom: 24 },

  // ── Single-row category filter bar ──────────────────────────────────────────
  filterBar: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e4e7ed',
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4 },
      android: { elevation: 3 },
    }),
  },
  filterRow: { paddingHorizontal: 12, paddingVertical: 9, gap: 7 },
  filterPill: {
    borderRadius: 20, borderWidth: 1, borderColor: '#e2e8f0',
    paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#fff',
  },
  filterPillActive:     { backgroundColor: '#1d4ed8', borderColor: '#1d4ed8' },
  filterPillText:       { fontSize: 13, fontWeight: '600', color: '#64748b' },
  filterPillTextActive: { color: '#fff', fontWeight: '700' },

  // ── Section header ─────────────────────────────────────────────────────────
  rankSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    gap: 8,
  },
  rankSectionLeft:      { flex: 1, gap: 3 },
  rankSectionTitle:     { fontSize: 15, fontWeight: '900', color: '#0f172a' },
  rankSectionSubRow:    { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  rankSectionSub:       { fontSize: 11, color: '#94a3b8', fontWeight: '500' },
  rankSectionTimestamp: { fontSize: 11, color: '#cbd5e1', fontWeight: '400' },

  rankSectionRight: { alignItems: 'flex-end', gap: 5, flexShrink: 0 },

  // Inline mode toggle (compact pills)
  inlineToggle: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    padding: 2,
  },
  inlineToggleBtn: {
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6,
  },
  inlineToggleBtnActive: {
    backgroundColor: '#fff',
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2 },
      android: { elevation: 1 },
    }),
  },
  inlineToggleBtnText:       { fontSize: 11, fontWeight: '700', color: '#94a3b8' },
  inlineToggleBtnTextActive: { color: '#1d4ed8', fontWeight: '800' },

  // LIVE indicator
  liveIndicator: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  liveDot:  { width: 6, height: 6, borderRadius: 3, backgroundColor: '#ef4444' },
  liveText: { fontSize: 10, fontWeight: '800', color: '#ef4444', letterSpacing: 0.5 },

  // ── Rank item ──────────────────────────────────────────────────────────────
  rankItem: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: '#ffffff', borderRadius: 12,
    borderWidth: 1, borderColor: '#f1f5f9',
    paddingVertical: 16, paddingHorizontal: 14, marginBottom: 12, marginHorizontal: 16,
  },
  rankItemFirst: {},

  rankBox:        { width: 24, alignItems: 'center', marginRight: 8, flexShrink: 0 },
  medalCircle:    { width: 22, height: 22, borderRadius: 11, justifyContent: 'center', alignItems: 'center' },
  medalText:      { color: '#fff', fontWeight: 'bold', fontSize: 11 },
  rankDash:       { width: 8, height: 2, backgroundColor: '#cbd5e1', marginTop: 4 },
  rankNumDefault: { fontSize: 14, fontWeight: 'bold', color: '#64748b' },
  rankCrown: {}, rankNum: {}, rankGold: {}, rankSilver: {}, rankBronze: {},

  itemThumb: {
    width: 64, height: 64, borderRadius: 4, marginLeft: 0, marginRight: 12,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    backgroundColor: '#ffffff',
  },
  itemEmoji: { fontSize: 26 },

  itemInfo:  { flex: 1, marginTop: -2 },
  itemBrand: {}, itemName: {},

  customTag: {
    alignSelf: 'flex-start', backgroundColor: '#fef3c7',
    borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, marginBottom: 1,
  },
  customTagText: { fontSize: 9, fontWeight: '700', color: '#b45309' },

  itemRatingRow:   { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  itemStars:       { fontSize: 12 },
  itemRating:      { fontSize: 12, fontWeight: 'bold', color: '#495057', marginLeft: 2 },
  itemReviewCount: { fontSize: 11, color: '#adb5bd', marginLeft: 2 },

  itemPriceRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  itemDiscount: { fontSize: 14, fontWeight: '700', color: '#fa5252', marginRight: 4 },
  itemPrice:    { fontSize: 14, fontWeight: '700', color: '#212529' },
  itemOriginal: { fontSize: 10, color: '#cbd5e1', textDecorationLine: 'line-through' },
  rocketBadge:     {},
  rocketBadgeText: {},
  rocketInline:  { fontSize: 10, fontWeight: '700', color: '#1d4ed8' },

  saveBtn:              { paddingLeft: 8, flexShrink: 0, justifyContent: 'center' },
  saveBtnPill:          { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 4, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#f8fafc' },
  saveBtnPillText:      { color: '#64748b', fontSize: 12, fontWeight: 'bold' },
  saveBtnPillActive:    { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 4, borderWidth: 1, borderColor: '#a7f3d0', backgroundColor: '#ecfdf5' },
  saveBtnPillTextActive:{ color: '#10b981', fontSize: 12, fontWeight: 'bold' },

  itemSep: { height: StyleSheet.hairlineWidth, backgroundColor: '#f1f5f9', marginHorizontal: 10 },

  // ── Load More button ───────────────────────────────────────────────────────
  loadMoreBtn: {
    marginHorizontal: 12, marginTop: 8, marginBottom: 4,
    paddingVertical: 10, borderRadius: 10, alignItems: 'center',
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#1d4ed8',
  },
  loadMoreText: { fontSize: 13, fontWeight: '800', color: '#1d4ed8' },

  // ── Empty state ───────────────────────────────────────────────────────────
  emptyBox: { alignItems: 'center', justifyContent: 'center', paddingTop: 60, paddingBottom: 40, gap: 8 },
  emptyIcon: { fontSize: 36 },
  emptyText: { fontSize: 15, fontWeight: '700', color: '#334155' },
  emptySub:  { fontSize: 13, color: '#94a3b8' },

  // ── Ad banner ──────────────────────────────────────────────────────────────
  adBanner: {
    marginHorizontal: 12, marginTop: 12, marginBottom: 6,
    height: 172, borderRadius: 16, backgroundColor: '#1d4ed8', overflow: 'hidden', justifyContent: 'center',
  },
  adBannerInner: { padding: 20, zIndex: 1 },
  adBadge: {
    alignSelf: 'flex-start', backgroundColor: '#fbbf24', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3, marginBottom: 10,
  },
  adBadgeText:  { fontSize: 11, fontWeight: '800', color: '#78350f', letterSpacing: 0.5 },
  adTitle:      { fontSize: 22, fontWeight: '900', color: '#fff', lineHeight: 28 },
  adSubtitle:   { fontSize: 22, fontWeight: '900', color: '#fbbf24', lineHeight: 28, marginBottom: 8 },
  adDesc:       { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginBottom: 14 },
  adCta:        { alignSelf: 'flex-start', backgroundColor: '#fff', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 7 },
  adCtaText:    { fontSize: 13, fontWeight: '700', color: '#1d4ed8' },
  adCircle1:    { position: 'absolute', right: -30, top: -30, width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(255,255,255,0.08)' },
  adCircle2:    { position: 'absolute', right: 40, bottom: -50, width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.06)' },

  // ── Guidance banner ────────────────────────────────────────────────────────
  guidanceBanner: {
    marginHorizontal: 12, marginBottom: 6, padding: 14,
    backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#e4e7ed',
  },
  guidanceHeader:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  guidanceTitle:      { fontSize: 13, fontWeight: '700', color: '#334155', flex: 1 },
  guidanceArrow:      { fontSize: 16, color: '#1d4ed8', fontWeight: '900', paddingLeft: 6 },
  guidanceBody:       { marginTop: 12, gap: 4 },
  guidanceText:       { fontSize: 13, color: '#334155', lineHeight: 20 },
  guidanceTextNormal: { fontSize: 13, color: '#475569', lineHeight: 20 },
  guidanceKeyword:    { fontSize: 13, fontWeight: '700', color: '#2563eb' },

  // ── Top tabs ───────────────────────────────────────────────────────────────
  topTabBar: {
    backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#e4e7ed',
  },
  topTabRow:  { paddingHorizontal: 4, flexDirection: 'row' },
  topTab: {
    paddingHorizontal: 12, paddingVertical: 8,
    borderBottomWidth: 3, borderBottomColor: 'transparent',
  },
  topTabActive:     { borderBottomColor: '#3b82f6' },
  topTabText:       { fontSize: 13, fontWeight: '500', color: '#94a3b8' },
  topTabTextActive: { fontSize: 13, fontWeight: '800', color: '#0f172a' },

  // ── Filter row ─────────────────────────────────────────────────────────────
  filterRowBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 7, backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f1f5f9',
  },
  categoryDropBtn: {
    backgroundColor: '#475569', borderRadius: 5, paddingHorizontal: 8, paddingVertical: 4,
  },
  categoryDropBtnText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  rankCriteriaBtn:     { paddingHorizontal: 6, paddingVertical: 4 },
  rankCriteriaBtnText: { fontSize: 11, fontWeight: '600', color: '#64748b', textDecorationLine: 'underline' },
  pillToggle: {
    flexDirection: 'row', backgroundColor: '#f1f5f9', borderRadius: 16, padding: 2,
  },
  pillToggleBtn: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 14 },
  pillToggleBtnActive: {
    backgroundColor: '#fff',
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.10, shadowRadius: 2 },
      android: { elevation: 2 },
    }),
  },
  pillToggleBtnText:       { fontSize: 11, fontWeight: '500', color: '#64748b' },
  pillToggleBtnTextActive: { fontSize: 11, fontWeight: '800', color: '#0f172a' },

  // ── Tooltip modal ──────────────────────────────────────────────────────────
  tooltipOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32,
  },
  tooltipCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 20, width: '100%',
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12 },
      android: { elevation: 8 },
    }),
  },
  tooltipTitle:    { fontSize: 14, fontWeight: '800', color: '#0f172a', marginBottom: 12 },
  tooltipRow:      { marginBottom: 8, gap: 2 },
  tooltipKeyword:  { fontSize: 13, fontWeight: '700', color: '#2563eb' },
  tooltipDesc:     { fontSize: 12, color: '#475569', lineHeight: 17 },
  tooltipClose: {
    marginTop: 12, backgroundColor: '#0f172a', borderRadius: 8,
    paddingVertical: 9, alignItems: 'center',
  },
  tooltipCloseText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  // ── Rank change badges ─────────────────────────────────────────────────────
  rankChangeUp:   { fontSize: 10, fontWeight: '700', color: '#ef4444', textAlign: 'center' },
  rankChangeDown: { fontSize: 10, fontWeight: '700', color: '#3b82f6', textAlign: 'center' },
  rankChangeNew:  { fontSize: 10, fontWeight: '700', color: '#f59e0b', textAlign: 'center' },

  // ── Hero banner ────────────────────────────────────────────────────────────
  heroBanner: {
    backgroundColor: '#f0f7ff', borderRadius: 10, padding: 10,
    marginHorizontal: 12, marginTop: 8,
    borderWidth: 1, borderColor: '#bfdbfe',
  },
  heroBadge: {
    alignSelf: 'flex-start', backgroundColor: '#dbeafe', borderRadius: 5,
    paddingHorizontal: 8, paddingVertical: 2, marginBottom: 6,
  },
  heroBadgeText: { fontSize: 11, fontWeight: '700', color: '#1d4ed8' },
  heroTitle: { fontSize: 14, fontWeight: '700', color: '#0f172a', lineHeight: 20 },
  heroCtaBtn:     {},
  heroCtaBtnText: {},

  // ── Guidance criteria row ──────────────────────────────────────────────────
  guidanceCriteriaRow: { marginBottom: 10, gap: 2 },

  // ── Coupang CTA footer ─────────────────────────────────────────────────────
  ctaFooter: {
    marginHorizontal: 12, marginTop: 8, marginBottom: 8, borderRadius: 12,
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#e4e7ed', overflow: 'hidden',
  },
  ctaFooterInner: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  ctaFooterEmoji: { fontSize: 26 },
  ctaFooterText:  { flex: 1, gap: 3 },
  ctaFooterTitle: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  ctaFooterSub:   { fontSize: 11, color: '#94a3b8' },
  ctaFooterArrow: { fontSize: 22, color: '#94a3b8' },
});
