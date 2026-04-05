import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import GlobalHeader from '../components/GlobalHeader';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db, functions } from '../firebase/config';
import { recordProductAction } from '../services/productActionService';

// ─── Constants ────────────────────────────────────────────────────────────────

const CARD_WIDTH    = 140;
const CARD_GAP      = 8;
const SNAP_INTERVAL = CARD_WIDTH + CARD_GAP;

// ─── Dummy data ───────────────────────────────────────────────────────────────

const SHORTCUTS = [
  { emoji: '🔥', label: '오늘의 특가' },
  { emoji: '🍼', label: '기저귀·분유' },
  { emoji: '💬', label: '커뮤니티' },
  { emoji: '🎁', label: '이벤트' },
  { emoji: '⭐', label: '베스트' },
];

const MOCK_TRACKED = [
  {
    id: 'pt1', emoji: '🧷', bg: '#fef9c3',
    brand: '하기스', name: '네이처메이드 기저귀 신생아 100매',
    currentPrice: 28900, originalPrice: 52900,
    lowestPrice: 30000, averagePrice: 41000, highestPrice: 55000,
  },
  {
    id: 'pt2', emoji: '🍼', bg: '#ede9fe',
    brand: '헤겐', name: '와이드넥 젖병 세트 4개입',
    currentPrice: 34900, originalPrice: 46000,
    lowestPrice: 36000, averagePrice: 42000, highestPrice: 50000,
  },
];

const MOCK_UGC = [
  { id: 'u1', emoji: '🛁', bg: '#bfdbfe', user: '별이맘', caption: '이거 대박이에요 진짜!', tag: '아기욕조' },
  { id: 'u2', emoji: '🧸', bg: '#fbcfe8', user: '콩이맘', caption: '14개월 최애템 공유', tag: '봉제인형' },
  { id: 'u3', emoji: '🥣', bg: '#bbf7d0', user: '하나맘', caption: '이유식 스타터 세트 후기', tag: '이유식용기' },
  { id: 'u4', emoji: '👟', bg: '#fde68a', user: '솔이맘', caption: '첫걸음마 신발 사이즈 팁', tag: '걸음마신발' },
  { id: 'u5', emoji: '🌡️', bg: '#ddd6fe', user: '하늘맘', caption: '체온계 비교 후기 총정리', tag: '체온계' },
];

const MOCK_TIME_SALE = [
  { id: 'ts1', emoji: '🧷', bg: '#fef9c3', brand: '하기스',     name: '네이처메이드 기저귀 신생아\n100매 초슬림',      discount: 45, price: 28900, originalPrice: 52900, stock: 12, isRocket: true  },
  { id: 'ts2', emoji: '🥛', bg: '#f0fdf4', brand: '매일유업',   name: '앱솔루트 분유 스텝2\n800g × 2캔',              discount: 36, price: 39800, originalPrice: 62000, stock: 7,  isRocket: true  },
  { id: 'ts3', emoji: '🧴', bg: '#fce7f3', brand: '피죤',       name: '베이비 세탁세제\n3L 대용량',                   discount: 30, price: 8900,  originalPrice: 12800, stock: 23, isRocket: false },
  { id: 'ts4', emoji: '🫧', bg: '#e0f2fe', brand: '프리미엄베베', name: '순한 아기 로션\n400ml 무향',                 discount: 35, price: 13900, originalPrice: 21400, stock: 5,  isRocket: true  },
];

const WISH_GRID = [
  { id: 'w1', emoji: '🎵', bg: '#fce7f3', name: '오볼 링 딸랑이',     price: 12900, discount: 20 },
  { id: 'w2', emoji: '🛁', bg: '#e0f2fe', name: '에어텁 아기 욕조',   price: 29900, discount: 30 },
  { id: 'w3', emoji: '🧸', bg: '#fef9c3', name: '라이언 봉제인형 L',  price: 18900, discount: 15 },
  { id: 'w4', emoji: '📚', bg: '#f0fdf4', name: '보드북 세트 5종',    price: 14900, discount: 25 },
];

const TAG_COLOR = { 질문: '#eff6ff', 꿀팁: '#f0fdf4', 후기: '#fef9c3' };
const TAG_TEXT  = { 질문: '#2563eb', 꿀팁: '#16a34a', 후기: '#b45309' };

const MOCK_COMMUNITY = [
  { id: 'c1', tag: '질문', text: '67개월 아이 영양제 추천해주세요', views: '1.2k' },
  { id: 'c2', tag: '꿀팁', text: '기저귀 발진 잡는 법 총정리',     views: '3.4k' },
  { id: 'c3', tag: '후기', text: '노리플레이 블록 써보니 진짜 좋네요', views: '856' },
];

// ─── Timer hook ───────────────────────────────────────────────────────────────

function useTimer(initialSeconds) {
  const [secs, setSecs] = useState(initialSeconds);
  useEffect(() => {
    const id = setInterval(() => setSecs((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, []);
  const h = String(Math.floor(secs / 3600)).padStart(2, '0');
  const m = String(Math.floor((secs % 3600) / 60)).padStart(2, '0');
  const s = String(secs % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

// ─── 2. Hero Section ──────────────────────────────────────────────────────────

function HeroSection({ child, childLoading }) {
  const name     = child?.name     || null;
  const ageMonth = child?.ageMonth ?? null;

  return (
    <View style={styles.hero}>
      <View style={styles.heroInner}>
        {childLoading ? (
          <View style={styles.heroSkeleton}>
            <ActivityIndicator size="small" color="rgba(255,255,255,0.7)" />
            <Text style={styles.heroSkeletonText}>맞춤 정보 불러오는 중...</Text>
          </View>
        ) : (
          <>
            <Text style={styles.heroGreeting}>
              {name ? `☀️ ${name} 맘님, 안녕하세요!` : '☀️ 안녕하세요!'}
            </Text>
            <Text style={styles.heroSub}>
              {name && ageMonth !== null
                ? `${ageMonth}개월 맞춤 핫딜 큐레이션`
                : '오늘의 베스트 육아 상품을 확인해보세요'}
            </Text>
          </>
        )}
        <View style={styles.heroCtaRow}>
          <View style={styles.heroPill}>
            <Text style={styles.heroPillText}>📦 지금 바로 확인하기</Text>
          </View>
        </View>
      </View>
      <View style={styles.heroCircle1} />
      <View style={styles.heroCircle2} />
    </View>
  );
}

// ─── 3. Shortcuts ─────────────────────────────────────────────────────────────

function ShortcutRow() {
  return (
    <View style={styles.shortcutSection}>
      {SHORTCUTS.map((s) => (
        <TouchableOpacity key={s.label} style={styles.shortcutItem} activeOpacity={0.75}>
          <View style={styles.shortcutCircle}>
            <Text style={styles.shortcutEmoji}>{s.emoji}</Text>
          </View>
          <Text style={styles.shortcutLabel} numberOfLines={1}>{s.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ─── 4. Onboarding Nudge Banner ───────────────────────────────────────────────

function OnboardingNudge({ navigation }) {
  return (
    <TouchableOpacity
      style={styles.nudgeBanner}
      activeOpacity={0.88}
      onPress={() => navigation.navigate('ChildStack')}
    >
      <View style={styles.nudgeLeft}>
        <Text style={styles.nudgeEmoji}>🎁</Text>
      </View>
      <View style={styles.nudgeBody}>
        <Text style={styles.nudgeText}>
          노을이의 맞춤 핫딜을 보려면{'\n'}
          <Text style={styles.nudgeTextBold}>10초 만에 정보를 완성하세요!</Text>
        </Text>
      </View>
      <View style={styles.nudgeCta}>
        <Text style={styles.nudgeCtaText}>시작 →</Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── 5. Price Tracking Widget ─────────────────────────────────────────────────

function InsightBadge({ topText, bottomText, badgeBg, badgeColor }) {
  return (
    <View style={styles.insightWrap}>
      <Text style={styles.insightTopText}>{topText}</Text>
      <View style={[styles.insightBadge, { backgroundColor: badgeBg }]}>
        <Text style={[styles.insightBadgeText, { color: badgeColor }]}>{bottomText}</Text>
      </View>
    </View>
  );
}

function PriceTrackingWidget({ navigation }) {
  // Sort: items at/below lowestPrice first, then by descending discount vs averagePrice
  const sortedTracked = React.useMemo(() => {
    return [...MOCK_TRACKED].sort((a, b) => {
      const aHit = a.currentPrice <= a.lowestPrice ? 1 : 0;
      const bHit = b.currentPrice <= b.lowestPrice ? 1 : 0;
      if (aHit !== bHit) return bHit - aHit; // hit items first
      const pctA = (a.averagePrice - a.currentPrice) / a.averagePrice;
      const pctB = (b.averagePrice - b.currentPrice) / b.averagePrice;
      return pctB - pctA; // highest discount first
    });
  }, []);

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>📉 나의 가격 추적 현황</Text>
        <TouchableOpacity
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          onPress={() => navigation.navigate('관심상품')}
        >
          <Text style={styles.sectionViewAll}>전체보기 ›</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.sectionSub}>가격이 떨어지면 즉시 알림을 드려요</Text>

      {sortedTracked.map((item) => {
        const diffPct = Math.round(Math.abs(1 - item.currentPrice / item.averagePrice) * 100);
        let topText, bottomText, badgeBg, badgeColor;

        if (item.currentPrice <= item.lowestPrice) {
          bottomText = '🔥 역대 최저가 도달'; badgeBg = '#fef2f2'; badgeColor = '#ef4444';
        } else if (item.currentPrice < item.averagePrice) {
          bottomText = '📉 평균가 하락';      badgeBg = '#eff6ff'; badgeColor = '#3b82f6';
        } else if (item.currentPrice === item.averagePrice) {
          bottomText = '➖ 평균가 유지';      badgeBg = '#f1f5f9'; badgeColor = '#64748b';
        } else if (item.currentPrice >= item.highestPrice) {
          bottomText = '🚨 역대 최고가';      badgeBg = '#475569'; badgeColor = '#ffffff';
        } else {
          bottomText = '📈 평균가 이상';      badgeBg = '#f1f5f9'; badgeColor = '#64748b';
        }

        const aboveAvg  = item.currentPrice > item.averagePrice;
        const belowAvg  = item.currentPrice < item.averagePrice;

        return (
          <TouchableOpacity
            key={item.id} style={styles.trackCard} activeOpacity={0.88}
            onPress={() => navigation.navigate('Detail', { item })}
          >
            {/* Thumb */}
            <View style={[styles.trackThumb, { backgroundColor: item.bg }]}>
              <Text style={styles.trackEmoji}>{item.emoji}</Text>
            </View>

            {/* Info */}
            <View style={styles.trackInfo}>
              <Text style={styles.trackBrand}>{item.brand}</Text>
              <Text style={styles.trackName} numberOfLines={1}>{item.name}</Text>
              <View style={styles.trackPriceRow}>
                <Text style={styles.trackPrice}>₩{item.currentPrice.toLocaleString('ko-KR')}</Text>
                {belowAvg && (
                  <Text style={{ color: '#3b82f6', fontWeight: 'bold', marginLeft: 6, fontSize: 14 }}>▼ {diffPct}%</Text>
                )}
                {aboveAvg && (
                  <Text style={{ color: '#ef4444', fontWeight: 'bold', marginLeft: 6, fontSize: 14 }}>▲ {diffPct}%</Text>
                )}
              </View>
              <Text style={styles.trackOriginal}>정가 ₩{item.originalPrice.toLocaleString('ko-KR')}</Text>
            </View>

            {/* Qualitative state badge (no numbers) */}
            <InsightBadge
              topText=""
              bottomText={bottomText}
              badgeBg={badgeBg}
              badgeColor={badgeColor}
            />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── 6. UGC Gallery (Ohouse Style) ───────────────────────────────────────────

function UGCGallery({ navigation }) {
  return (
    <View style={styles.ugcSection}>
      <View style={[styles.sectionHeaderRow, styles.sectionPadH]}>
        <Text style={styles.sectionTitle}>지금 맘카페에서 난리 난 육아템 📸</Text>
        <TouchableOpacity
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          onPress={() => navigation.navigate('커뮤니티')}
        >
          <Text style={styles.sectionViewAll}>더보기 ›</Text>
        </TouchableOpacity>
      </View>
      <Text style={[styles.sectionSub, styles.sectionPadH]}>
        실제 맘들의 육아 현장 후기
      </Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.ugcList}
      >
        {MOCK_UGC.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={styles.ugcCard}
            activeOpacity={0.88}
            onPress={() => navigation.navigate('Detail', { item })}
          >
            {/* Large "photo" area */}
            <View style={[styles.ugcPhoto, { backgroundColor: item.bg }]}>
              <Text style={styles.ugcPhotoEmoji}>{item.emoji}</Text>

              {/* Bottom overlay: user + caption */}
              <View style={styles.ugcOverlay}>
                <Text style={styles.ugcUser}>{item.user}</Text>
                <Text style={styles.ugcCaption} numberOfLines={1}>{item.caption}</Text>
              </View>

              {/* Bottom-right: shoppable tag */}
              <View style={styles.ugcTagBtn}>
                <Text style={styles.ugcTagBtnText}>+ {item.tag}</Text>
              </View>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

// ─── 7. Time Sale Section ─────────────────────────────────────────────────────

function TimeSaleSection({ navigation }) {
  const timeLabel = useTimer(46138); // ~12h 48m 58s

  return (
    <View style={styles.section}>
      <View style={styles.timeSaleHeader}>
        <Text style={styles.sectionTitle}>⏰ 로켓배송 마감 임박 타임세일</Text>
        <View style={styles.timerBadge}>
          <Text style={styles.timerText}>{timeLabel} 남음</Text>
        </View>
      </View>
      <Text style={[styles.sectionSub]}>마감 전 구매 시 당일 배송 보장</Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.timeSaleList}
      >
        {MOCK_TIME_SALE.map((item) => (
          <TouchableOpacity
              key={item.id} style={styles.timeSaleCard} activeOpacity={0.88}
              onPress={() => navigation.navigate('Detail', { item })}
            >
            {/* Image area */}
            <View style={[styles.timeSaleImageWrap, { backgroundColor: item.bg }]}>
              <Text style={styles.timeSaleEmoji}>{item.emoji}</Text>
              {/* Discount pill */}
              <View style={styles.timeSaleDiscountPill}>
                <Text style={styles.timeSaleDiscountPillText}>-{item.discount}%</Text>
              </View>
              {/* Stock urgency strip */}
              <View style={styles.timeSaleStockStrip}>
                <Text style={styles.timeSaleStockText}>⏰ {item.stock}개 남음</Text>
              </View>
            </View>

            {/* Info */}
            <View style={styles.timeSaleInfo}>
              <Text style={styles.timeSaleBrand}>{item.brand}</Text>
              <Text style={styles.timeSaleName} numberOfLines={2}>{item.name}</Text>
              <View style={styles.timeSalePriceRow}>
                <Text style={styles.timeSaleDiscount}>{item.discount}%</Text>
                <Text style={styles.timeSalePrice}>₩{item.price.toLocaleString('ko-KR')}</Text>
              </View>
              <Text style={styles.timeSaleOriginal}>₩{item.originalPrice.toLocaleString('ko-KR')}</Text>
              {item.isRocket && (
                <View style={styles.rocketBadge}>
                  <Text style={styles.rocketBadgeText}>🚀 로켓배송</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

// ─── 8. Personalized 2×2 Grid ─────────────────────────────────────────────────

function PersonalizedGrid({ child, navigation }) {
  const ageMonth = child?.ageMonth ?? 13;
  const gender   = child?.gender === 'female' ? '여아' : '남아';

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle} numberOfLines={2}>
          ✨ {ageMonth}개월 {gender}들이 이번 주{'\n'}가장 많이 담은 위시리스트
        </Text>
        <TouchableOpacity
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          onPress={() => navigation.navigate('랭킹')}
        >
          <Text style={styles.sectionViewAll}>랭킹 보기 ›</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.wishGrid}>
        {WISH_GRID.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={styles.wishCell}
            activeOpacity={0.88}
            onPress={() => recordProductAction({ userId: auth.currentUser?.uid, productId: item.id, productGroupId: item.id, actionType: 'click' })}
          >
            <View style={[styles.wishThumb, { backgroundColor: item.bg }]}>
              <Text style={styles.wishEmoji}>{item.emoji}</Text>
              <View style={styles.wishDiscountPill}>
                <Text style={styles.wishDiscountText}>-{item.discount}%</Text>
              </View>
            </View>
            <Text style={styles.wishName} numberOfLines={2}>{item.name}</Text>
            <Text style={styles.wishPrice}>₩{item.price.toLocaleString('ko-KR')}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

// ─── 9. Community Snippet ─────────────────────────────────────────────────────

function CommunitySnippet({ navigation }) {
  return (
    <View style={styles.communitySection}>
      <TouchableOpacity
        style={styles.communityHeader}
        onPress={() => navigation.navigate('커뮤니티')}
        activeOpacity={0.8}
      >
        <Text style={styles.sectionTitle}>🔥 지금 뜨는 육아톡톡</Text>
        <View style={styles.communityChevronRow}>
          <Text style={styles.sectionViewAll}>더보기</Text>
          <Text style={styles.communityChevron}>›</Text>
        </View>
      </TouchableOpacity>
      {MOCK_COMMUNITY.map((post) => (
        <TouchableOpacity key={post.id} style={styles.communityRow} activeOpacity={0.75}>
          <View style={[styles.communityTag, { backgroundColor: TAG_COLOR[post.tag] }]}>
            <Text style={[styles.communityTagText, { color: TAG_TEXT[post.tag] }]}>{post.tag}</Text>
          </View>
          <Text style={styles.communityPostText} numberOfLines={1}>{post.text}</Text>
          <Text style={styles.communityViews}>👁 {post.views}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ─── 10. Product Card (curation feed) ─────────────────────────────────────────

function ProductCard({ item, index, navigation }) {
  const price =
    typeof item.price === 'number' && item.price > 0
      ? `₩${item.price.toLocaleString('ko-KR')}`
      : '가격 정보 없음';

  return (
    <View style={styles.productCard}>
      <TouchableOpacity
        style={styles.productCardInner}
        activeOpacity={0.88}
        onPress={() => {
          recordProductAction({
            userId: auth.currentUser?.uid,
            productId: item.productId,
            productGroupId: item.productId,
            actionType: 'click',
          });
          navigation.navigate('Detail', { item });
        }}
      >
        <View style={styles.cardImageContainer}>
          {item.image ? (
            <Image source={{ uri: item.image }} style={styles.cardImage} resizeMode="cover" />
          ) : (
            <View style={[styles.cardImage, styles.cardImageFallback]} />
          )}
          <View style={[styles.cardRankBadge, { backgroundColor: index === 0 ? '#fbbf24' : index === 1 ? '#9ca3af' : '#f1f5f9' }]}>
            <Text style={[styles.cardRankText, { color: index <= 1 ? '#fff' : '#94a3b8' }]}>
              {index + 1}
            </Text>
          </View>
          {index < 2 && (
            <View style={styles.lowestPriceBadge}>
              <Text style={styles.lowestPriceText}>🔥 역대 최저가</Text>
            </View>
          )}
          <TouchableOpacity
            style={styles.cardAddBtn}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            onPress={() =>
              recordProductAction({
                userId: auth.currentUser?.uid,
                productId: item.productId,
                productGroupId: item.productId,
                actionType: 'track',
              })
            }
            activeOpacity={0.8}
          >
            <Text style={styles.cardAddBtnText}>+</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.cardInfo}>
          <Text style={styles.cardName} numberOfLines={2}>{item.name || '이름 없음'}</Text>
          <Text style={styles.cardPrice}>{price}</Text>
          {item.isRocket && (
            <View style={styles.cardRocket}>
              <Text style={styles.cardRocketText}>로켓배송</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function HomeScreen({ navigation }) {
  const [child,            setChild]            = useState(null);
  const [childLoading,     setChildLoading]     = useState(true);
  const [curation,         setCuration]         = useState([]);
  const [curationLoading,  setCurationLoading]  = useState(true);
  const [refreshing,       setRefreshing]       = useState(false);
  const fetchingRef = useRef(false);

  // Auth + child load
  useEffect(() => {
    setChildLoading(true);
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { setChild(null); setChildLoading(false); return; }
      try {
        const snap = await getDocs(query(collection(db, 'children'), where('userId', '==', user.uid)));
        if (snap.docs[0]) setChild({ id: snap.docs[0].id, ...snap.docs[0].data() });
      } catch { /* non-blocking */ }
      finally { setChildLoading(false); }
    });
    return () => unsub();
  }, []);

  const loadCuration = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setCurationLoading(true);
    try {
      const fn = httpsCallable(functions, 'getBestCategoryProducts');
      const result = await fn({ categoryId: 1011 });
      setCuration((result?.data?.products ?? []).slice(0, 10));
    } catch {
      setCuration([]);
    } finally {
      setCurationLoading(false);
      fetchingRef.current = false;
    }
  }, []);

  useEffect(() => { loadCuration(); }, [loadCuration]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadCuration();
    setRefreshing(false);
  }, [loadCuration]);

  const showNudge = !childLoading && !child;

  return (
    <View style={styles.root}>
      {/* ── Global header: logo + search + guide modal ── */}
      <GlobalHeader
        tabName="Home"
        placeholder="기저귀 최저가를 검색해보세요"
        navigation={navigation}
      />

      {/* ── Main scrollable feed ── */}
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#1d4ed8']}
            tintColor="#1d4ed8"
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* 1. Hero */}
        <HeroSection child={child} childLoading={childLoading} />

        {/* 2. Shortcuts */}
        <ShortcutRow />

        {/* 3. Onboarding Nudge (only when no child profile) */}
        {showNudge && <OnboardingNudge navigation={navigation} />}

        {/* 4. Price Tracking Widget */}
        <PriceTrackingWidget navigation={navigation} />

        {/* 5. UGC Gallery — Ohouse style */}
        <UGCGallery navigation={navigation} />

        {/* 6. Time Sale */}
        <TimeSaleSection navigation={navigation} />

        {/* 7. Curation — peer-data horizontal scroll */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>
              {child?.name && child?.ageMonth != null
                ? `${child.ageMonth}개월 또래 맘들의 장바구니`
                : '또래 맘들의 실시간 장바구니'}
            </Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('랭킹')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.sectionViewAll}>더보기 ›</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.sectionSub}>출산·유아동 카테고리 인기 상품</Text>

          {curationLoading ? (
            <View style={styles.curationLoading}>
              <ActivityIndicator size="small" color="#1d4ed8" />
              <Text style={styles.curationLoadingText}>불러오는 중...</Text>
            </View>
          ) : (
            <FlatList
              horizontal
              data={curation}
              keyExtractor={(item, idx) => item.productId ? `${item.productId}-${idx}` : String(idx)}
              renderItem={({ item, index }) => (
                <ProductCard item={item} index={index} navigation={navigation} />
              )}
              contentContainerStyle={styles.horizontalList}
              snapToInterval={SNAP_INTERVAL}
              snapToAlignment="start"
              decelerationRate="fast"
              showsHorizontalScrollIndicator={false}
              ListEmptyComponent={
                <Text style={styles.emptyText}>상품 정보를 불러올 수 없습니다</Text>
              }
            />
          )}
        </View>

        {/* 8. Personalized 2×2 Wish Grid */}
        <PersonalizedGrid child={child} navigation={navigation} />

        {/* 9. Community Snippet */}
        <CommunitySnippet navigation={navigation} />

        {/* Coupang disclaimer */}
        <Text style={styles.disclaimer}>
          이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.
        </Text>
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f5f7fb' },
  container: { flex: 1 },
  scrollContent: { paddingBottom: 40 },


  // ── Hero ────────────────────────────────────────────────────────────────────
  hero: {
    margin: 12, height: 160, borderRadius: 18,
    backgroundColor: '#1d4ed8', overflow: 'hidden', justifyContent: 'center',
  },
  heroInner: { padding: 20, zIndex: 1 },
  heroGreeting: { fontSize: 18, fontWeight: '900', color: '#fff', marginBottom: 4 },
  heroSub: { fontSize: 13, color: 'rgba(255,255,255,0.85)', marginBottom: 14, lineHeight: 19 },
  heroCtaRow: { flexDirection: 'row' },
  heroPill: {
    backgroundColor: '#fff', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 7,
  },
  heroPillText: { fontSize: 13, fontWeight: '700', color: '#1d4ed8' },
  heroCircle1: {
    position: 'absolute', right: -20, top: -20,
    width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(255,255,255,0.08)',
  },
  heroCircle2: {
    position: 'absolute', right: 50, bottom: -50,
    width: 110, height: 110, borderRadius: 55, backgroundColor: 'rgba(255,255,255,0.06)',
  },
  heroSkeleton: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  heroSkeletonText: { fontSize: 13, color: 'rgba(255,255,255,0.6)' },

  // ── Shortcuts ───────────────────────────────────────────────────────────────
  shortcutSection: {
    flexDirection: 'row', justifyContent: 'space-around',
    backgroundColor: '#fff', marginBottom: 8,
    paddingVertical: 16, paddingHorizontal: 8,
    borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  shortcutItem: { alignItems: 'center', gap: 6 },
  shortcutCircle: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: '#eff6ff', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#dbeafe',
  },
  shortcutEmoji: { fontSize: 22 },
  shortcutLabel: { fontSize: 11, fontWeight: '600', color: '#475569', maxWidth: 52, textAlign: 'center' },

  // ── Onboarding Nudge ────────────────────────────────────────────────────────
  nudgeBanner: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 12, marginBottom: 8,
    backgroundColor: '#fffbeb',
    borderRadius: 14, borderWidth: 1.5, borderColor: '#fcd34d',
    paddingHorizontal: 14, paddingVertical: 14, gap: 10,
  },
  nudgeLeft:  { width: 40, alignItems: 'center' },
  nudgeEmoji: { fontSize: 28 },
  nudgeBody:  { flex: 1 },
  nudgeText: { fontSize: 13, color: '#78350f', lineHeight: 19 },
  nudgeTextBold: { fontWeight: '800', color: '#b45309' },
  nudgeCta: {
    backgroundColor: '#fbbf24', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  nudgeCtaText: { fontSize: 12, fontWeight: '800', color: '#78350f' },

  // ── Section common ──────────────────────────────────────────────────────────
  section: {
    backgroundColor: '#fff', marginBottom: 8,
    paddingHorizontal: 14, paddingTop: 16, paddingBottom: 14,
  },
  sectionPadH: { paddingHorizontal: 14 },
  sectionHeaderRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    justifyContent: 'space-between', marginBottom: 2,
  },
  sectionTitle:   { fontSize: 16, fontWeight: '800', color: '#0f172a', flex: 1 },
  sectionViewAll: { fontSize: 13, color: '#64748b', fontWeight: '500', flexShrink: 0, paddingLeft: 8, marginTop: 2 },
  sectionSub:     { fontSize: 12, color: '#94a3b8', marginBottom: 12, fontWeight: '500' },

  // ── Price Tracking Widget ───────────────────────────────────────────────────
  trackCard: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#f1f5f9', gap: 10,
  },
  trackThumb: {
    width: 52, height: 52, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  trackEmoji: { fontSize: 26 },
  trackInfo:  { flex: 1, gap: 2 },
  trackBrand: { fontSize: 11, color: '#94a3b8', fontWeight: '600' },
  trackName:  { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  trackPriceRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  trackPrice:    { fontSize: 14, fontWeight: '900', color: '#0f172a' },
  trackOriginal: { fontSize: 11, color: '#cbd5e1', textDecorationLine: 'line-through' },
  lowestBadge: {
    backgroundColor: '#fee2e2', borderRadius: 6,
    paddingHorizontal: 7, paddingVertical: 3,
  },
  lowestBadgeText: { fontSize: 10, fontWeight: '800', color: '#dc2626' },

  // Insight badge (replaces sparkline)
  insightWrap:      { alignItems: 'flex-end', flexShrink: 0 },
  insightTopText:   { fontSize: 12, color: '#64748b' },
  insightBadge:     { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginTop: 4 },
  insightBadgeText: { fontSize: 14, fontWeight: '700' },

  // ── UGC Gallery ─────────────────────────────────────────────────────────────
  ugcSection: {
    backgroundColor: '#fff', marginBottom: 8,
    paddingTop: 16, paddingBottom: 14,
  },
  ugcList: { paddingHorizontal: 14, gap: 10, paddingBottom: 2 },
  ugcCard: {
    borderRadius: 14, overflow: 'hidden',
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 5 },
      android: { elevation: 3 },
    }),
  },
  ugcPhoto: {
    width: 140, height: 180,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: 14, overflow: 'hidden',
  },
  ugcPhotoEmoji: { fontSize: 56 },
  ugcOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 8, paddingVertical: 7,
  },
  ugcUser:    { fontSize: 11, fontWeight: '700', color: '#fff', marginBottom: 1 },
  ugcCaption: { fontSize: 11, color: 'rgba(255,255,255,0.9)' },
  ugcTagBtn: {
    position: 'absolute', bottom: 40, right: 6,
    backgroundColor: '#fff', borderRadius: 8,
    paddingHorizontal: 6, paddingVertical: 4,
    borderWidth: 1, borderColor: '#e2e8f0',
  },
  ugcTagBtnText: { fontSize: 10, fontWeight: '800', color: '#1d4ed8' },

  // ── Time Sale ────────────────────────────────────────────────────────────────
  timeSaleHeader: {
    flexDirection: 'row', alignItems: 'center',
    flexWrap: 'wrap', gap: 8, marginBottom: 2,
  },
  timerBadge: {
    backgroundColor: '#fee2e2', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  timerText: { fontSize: 13, fontWeight: '800', color: '#dc2626' },
  timeSaleList: { gap: 10 },
  timeSaleCard: {
    width: 148, borderRadius: 12, overflow: 'hidden',
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#e4e7ed',
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4 },
      android: { elevation: 2 },
    }),
  },
  timeSaleImageWrap: {
    height: 120, alignItems: 'center', justifyContent: 'center',
    position: 'relative',
  },
  timeSaleEmoji: { fontSize: 46 },
  timeSaleDiscountPill: {
    position: 'absolute', top: 6, left: 6, zIndex: 2,
    backgroundColor: '#ef4444', borderRadius: 6,
    paddingHorizontal: 7, paddingVertical: 3,
  },
  timeSaleDiscountPillText: { fontSize: 12, fontWeight: '900', color: '#fff' },
  timeSaleStockStrip: {
    position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 2,
    backgroundColor: 'rgba(0,0,0,0.5)', paddingVertical: 3, alignItems: 'center',
  },
  timeSaleStockText: { fontSize: 10, fontWeight: '700', color: '#fef9c3' },
  timeSaleInfo:    { padding: 8, gap: 2 },
  timeSaleBrand:   { fontSize: 10, color: '#94a3b8', fontWeight: '600' },
  timeSaleName:    { fontSize: 12, fontWeight: '600', color: '#0f172a', lineHeight: 16 },
  timeSalePriceRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  timeSaleDiscount: { fontSize: 14, fontWeight: '900', color: '#ef4444' },
  timeSalePrice:    { fontSize: 14, fontWeight: '900', color: '#0f172a' },
  timeSaleOriginal: { fontSize: 11, color: '#94a3b8', textDecorationLine: 'line-through' },
  rocketBadge: {
    alignSelf: 'flex-start', backgroundColor: '#eff6ff', borderRadius: 4,
    paddingHorizontal: 5, paddingVertical: 2, marginTop: 4,
  },
  rocketBadgeText: { fontSize: 10, fontWeight: '700', color: '#1d4ed8' },

  // ── 2×2 Wish Grid ────────────────────────────────────────────────────────────
  wishGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4,
  },
  wishCell: {
    width: '47%', backgroundColor: '#f8fafc',
    borderRadius: 12, overflow: 'hidden',
    borderWidth: 1, borderColor: '#e4e7ed',
  },
  wishThumb: {
    height: 100, alignItems: 'center', justifyContent: 'center',
    position: 'relative',
  },
  wishEmoji: { fontSize: 40 },
  wishDiscountPill: {
    position: 'absolute', top: 6, right: 6,
    backgroundColor: '#ef4444', borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  wishDiscountText: { fontSize: 10, fontWeight: '900', color: '#fff' },
  wishName: {
    fontSize: 12, fontWeight: '600', color: '#0f172a',
    paddingHorizontal: 8, paddingTop: 6, lineHeight: 16,
  },
  wishPrice: {
    fontSize: 13, fontWeight: '900', color: '#0f172a',
    paddingHorizontal: 8, paddingBottom: 8, marginTop: 2,
  },

  // ── Curation ─────────────────────────────────────────────────────────────────
  curationLoading: { height: 180, alignItems: 'center', justifyContent: 'center', gap: 8 },
  curationLoadingText: { fontSize: 12, color: '#94a3b8' },
  horizontalList: { paddingHorizontal: 0, gap: CARD_GAP },
  emptyText: { fontSize: 13, color: '#94a3b8', paddingVertical: 40, paddingHorizontal: 16 },

  productCard: {
    width: CARD_WIDTH, backgroundColor: '#fff', borderRadius: 12,
    borderWidth: 1, borderColor: '#e4e7ed',
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.09, shadowRadius: 4 },
      android: { elevation: 2 },
    }),
  },
  productCardInner: { borderRadius: 12, overflow: 'hidden' },
  cardImageContainer: { width: CARD_WIDTH, height: 140, position: 'relative' },
  cardImage: { width: CARD_WIDTH, height: 140 },
  cardImageFallback: { backgroundColor: '#e2e8f0' },
  cardRankBadge: {
    position: 'absolute', top: 6, left: 6, zIndex: 2,
    width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
  },
  cardRankText: { fontSize: 12, fontWeight: '800', lineHeight: 16 },
  cardAddBtn: {
    position: 'absolute', bottom: 6, right: 6, zIndex: 2,
    width: 26, height: 26, borderRadius: 13, backgroundColor: '#1d4ed8',
    alignItems: 'center', justifyContent: 'center',
    ...Platform.select({
      ios:     { shadowColor: '#1d4ed8', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 3 },
      android: { elevation: 4 },
    }),
  },
  cardAddBtnText: { fontSize: 17, color: '#fff', lineHeight: 21, marginTop: -1 },
  lowestPriceBadge: {
    position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 2,
    backgroundColor: 'rgba(220,38,38,0.88)', paddingVertical: 3, alignItems: 'center',
  },
  lowestPriceText: { fontSize: 10, fontWeight: '800', color: '#fff', letterSpacing: 0.3 },
  cardInfo: { padding: 8, gap: 3 },
  cardName:  { fontSize: 12, fontWeight: '600', color: '#0f172a', lineHeight: 16 },
  cardPrice: { fontSize: 13, fontWeight: '800', color: '#0f172a' },
  cardRocket: {
    alignSelf: 'flex-start', backgroundColor: '#eff6ff', borderRadius: 4,
    paddingHorizontal: 5, paddingVertical: 2, marginTop: 2,
  },
  cardRocketText: { fontSize: 10, fontWeight: '700', color: '#1d4ed8' },

  // ── Community Snippet ─────────────────────────────────────────────────────────
  communitySection: {
    backgroundColor: '#fff', marginBottom: 8, paddingHorizontal: 14,
    paddingTop: 16, paddingBottom: 12,
  },
  communityHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12,
  },
  communityChevronRow: { flexDirection: 'row', alignItems: 'center', gap: 1 },
  communityChevron: { fontSize: 17, color: '#94a3b8', lineHeight: 19 },
  communityRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f8fafc',
  },
  communityTag:     { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  communityTagText: { fontSize: 11, fontWeight: '800' },
  communityPostText: { flex: 1, fontSize: 13, color: '#334155', fontWeight: '500' },
  communityViews:    { fontSize: 11, color: '#94a3b8' },

  // ── Disclaimer ────────────────────────────────────────────────────────────────
  disclaimer: {
    fontSize: 10, color: '#cbd5e1', textAlign: 'center',
    paddingHorizontal: 16, paddingTop: 12, lineHeight: 15,
  },
});
