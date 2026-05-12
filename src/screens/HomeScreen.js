import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { DeepLinkContext } from '../contexts/DeepLinkContext';
import { useNotification } from '../context/NotificationContext';
import { FontAwesome5 } from '@expo/vector-icons';
import { Package, Eye, Tag, Flame, Trophy, MessageCircle, Sparkles, LayoutGrid } from 'lucide-react-native';
import {
  Animated,
  ActivityIndicator,
  Alert,
  AppState,
  Dimensions,
  FlatList,
  Image,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import GlobalHeader from '../components/GlobalHeader';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db, functions } from '../firebase/config';
import { recordProductAction } from '../services/productActionService';
import { COLORS } from '../constants/theme';
import { useTracking } from '../context/TrackingContext';

// ─── Constants ────────────────────────────────────────────────────────────────

const CARD_WIDTH    = 140;
const CARD_GAP      = 8;
const SNAP_INTERVAL = CARD_WIDTH + CARD_GAP;

// ─── Dummy data ───────────────────────────────────────────────────────────────

// Stage-based quick menus (Section 2)
const STAGE_MENUS = {
  newborn: [
    { icon: 'baby',     color: '#6366f1', bg: '#ede9fe', label: '기저귀/물티슈', nav: (n) => n.navigate('Category') },
    { icon: 'tint',     color: '#3b82f6', bg: '#dbeafe', label: '분유/수유',     nav: (n) => n.navigate('Category') },
    { icon: 'bed',      color: '#10b981', bg: '#d1fae5', label: '수면/침구',     nav: (n) => n.navigate('Category') },
    { icon: 'trophy',   color: '#d97706', bg: '#fef3c7', label: '또래랭킹',     nav: (n) => n.navigate('랭킹') },
    { icon: 'gift',     color: '#8b5cf6', bg: '#f3e8ff', label: '무료체험단',   nav: (n) => n.navigate('TrialGuide') },
  ],
  infant: [
    { icon: 'baby',     color: '#6366f1', bg: '#ede9fe', label: '기저귀/물티슈', nav: (n) => n.navigate('Category') },
    { icon: 'tint',     color: '#3b82f6', bg: '#dbeafe', label: '분유/수유',     nav: (n) => n.navigate('Category') },
    { icon: 'utensils', color: '#10b981', bg: '#d1fae5', label: '이유식준비',   nav: (n) => n.navigate('Category') },
    { icon: 'trophy',   color: '#d97706', bg: '#fef3c7', label: '또래랭킹',     nav: (n) => n.navigate('랭킹') },
    { icon: 'gift',     color: '#8b5cf6', bg: '#f3e8ff', label: '무료체험단',   nav: (n) => n.navigate('TrialGuide') },
  ],
  toddler: [
    { icon: 'running',  color: '#ef4444', bg: '#fee2e2', label: '걸음마/신발', nav: (n) => n.navigate('Category') },
    { icon: 'book',     color: '#6366f1', bg: '#ede9fe', label: '교육/도서',   nav: (n) => n.navigate('Category') },
    { icon: 'utensils', color: '#10b981', bg: '#d1fae5', label: '이유식/식기', nav: (n) => n.navigate('Category') },
    { icon: 'trophy',   color: '#d97706', bg: '#fef3c7', label: '또래랭킹',   nav: (n) => n.navigate('랭킹') },
    { icon: 'gift',     color: '#8b5cf6', bg: '#f3e8ff', label: '무료체험단', nav: (n) => n.navigate('TrialGuide') },
  ],
  preschool: [
    { icon: 'book',     color: '#6366f1', bg: '#ede9fe', label: '교육/도서',   nav: (n) => n.navigate('Category') },
    { icon: 'running',  color: '#ef4444', bg: '#fee2e2', label: '신발/의류',   nav: (n) => n.navigate('Category') },
    { icon: 'comments', color: '#3b82f6', bg: '#dbeafe', label: '맘톡',        nav: (n) => n.navigate('커뮤니티') },
    { icon: 'trophy',   color: '#d97706', bg: '#fef3c7', label: '또래랭킹',   nav: (n) => n.navigate('랭킹') },
    { icon: 'gift',     color: '#8b5cf6', bg: '#f3e8ff', label: '무료체험단', nav: (n) => n.navigate('TrialGuide') },
  ],
};
const DEFAULT_MENUS = [
  { icon: 'chart-line', color: '#ef4444', bg: '#fee2e2', label: '역대 최저가', nav: (n) => n.navigate('Search', { initialQuery: '', filter: 'max_discount' }) },
  { icon: 'baby',       color: '#6366f1', bg: '#ede9fe', label: '기저귀·분유', nav: (n) => n.navigate('Category') },
  { icon: 'comments',   color: '#3b82f6', bg: '#dbeafe', label: '실시간 맘톡', nav: (n) => n.navigate('커뮤니티') },
  { icon: 'gift',       color: '#8b5cf6', bg: '#f3e8ff', label: '무료 체험단', nav: (n) => n.navigate('TrialGuide') },
  { icon: 'trophy',     color: '#d97706', bg: '#fef3c7', label: '또래 랭킹',  nav: (n) => n.navigate('랭킹') },
];

const MOCK_TRACKED = []; /* temporarily cleared for PM empty-state review */
const _MOCK_TRACKED_BACKUP = [
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
  { id: 'u1', image: 'https://via.placeholder.com/150/e2e8f0/64748b?text=Baby+Bath', title: '슈너글 아기욕조',      author: '별이맘', review: '이거 대박이에요 진짜! 허리 안 아픔',      tag: '아기욕조'  },
  { id: 'u2', image: 'https://via.placeholder.com/150/e2e8f0/64748b?text=Jellycat',  title: '젤리캣 버니 L',       author: '콩이맘', review: '애착인형으로 최고. 벌써 두 개째',        tag: '봉제인형'  },
  { id: 'u3', image: 'https://via.placeholder.com/150/e2e8f0/64748b?text=Baby+Food', title: '로코유 이유식 식판',   author: '하나맘', review: '디자인 너무 예쁘고 열탕 소독 편해요',    tag: '이유식용기' },
  { id: 'u4', image: 'https://via.placeholder.com/150/e2e8f0/64748b?text=Shoes',     title: '닥터마틴 첫걸음마화',  author: '솔이맘', review: '첫걸음마 신발 사이즈 팁 공유해요',      tag: '걸음마신발' },
  { id: 'u5', image: 'https://via.placeholder.com/150/e2e8f0/64748b?text=Thermom',   title: '브라운 비접촉 체온계', author: '하늘맘', review: '체온계 비교 후기 총정리',              tag: '체온계'    },
];

const MOCK_TIME_SALE = [
  { id: 'ts1', emoji: '🧷', bg: '#fef9c3', brand: '하기스',     name: '네이처메이드 기저귀 신생아\n100매 초슬림',      discount: 45, price: 28900, originalPrice: 52900, stock: 12, isRocket: true  },
  { id: 'ts2', emoji: '🥛', bg: '#f0fdf4', brand: '매일유업',   name: '앱솔루트 분유 스텝2\n800g × 2캔',              discount: 36, price: 39800, originalPrice: 62000, stock: 7,  isRocket: true  },
  { id: 'ts3', emoji: '🧴', bg: '#fce7f3', brand: '피죤',       name: '베이비 세탁세제\n3L 대용량',                   discount: 30, price: 8900,  originalPrice: 12800, stock: 23, isRocket: false },
  { id: 'ts4', emoji: '🫧', bg: '#e0f2fe', brand: '프리미엄베베', name: '순한 아기 로션\n400ml 무향',                 discount: 35, price: 13900, originalPrice: 21400, stock: 5,  isRocket: true  },
];

const MOCK_GOLDBOX = [
  { id: 'gb1', emoji: '🧷', bg: '#fef9c3', brand: '하기스',    name: '네이처메이드 기저귀\n신생아 100매', discount: 45, price: 28900, originalPrice: 52900 },
  { id: 'gb2', emoji: '🥛', bg: '#f0fdf4', brand: '매일유업',  name: '앱솔루트 분유\n스텝2 800g',       discount: 36, price: 39800, originalPrice: 62000 },
  { id: 'gb3', emoji: '🧴', bg: '#fce7f3', brand: '피죤',      name: '베이비 세탁세제\n3L 대용량',       discount: 30, price: 8900,  originalPrice: 12800 },
  { id: 'gb4', emoji: '🫧', bg: '#e0f2fe', brand: '프리미엄베베', name: '순한 아기 로션\n400ml 무향',    discount: 35, price: 13900, originalPrice: 21400 },
];

const MOCK_REPLENISHMENT = [
  { id: 'r1', emoji: '🧷', bg: '#fef9c3', brand: '탐사',     name: '순한 기저귀\n신생아 100매',  price: 15900, originalPrice: 22000, discount: 28 },
  { id: 'r2', emoji: '🧻', bg: '#ede9fe', brand: '탐사',     name: '베이비 물티슈\n순한 100매×6팩', price: 9900,  originalPrice: 14500, discount: 32 },
  { id: 'r3', emoji: '🧴', bg: '#f0fdf4', brand: '비즈앤젤', name: '아기 로션\n무향 400ml',      price: 7900,  originalPrice: 11800, discount: 33 },
  { id: 'r4', emoji: '🫧', bg: '#fce7f3', brand: '비즈앤젤', name: '아기 세제\n1.8L 대용량',     price: 6900,  originalPrice: 9800,  discount: 30 },
];

const WISH_GRID = [
  { id: 'w1', image: 'https://via.placeholder.com/150', brand: '브이텍',    name: '걸음마 학습기 한영버전',      price: 45000,  discount: 20 },
  { id: 'w2', image: 'https://via.placeholder.com/150', brand: '스토케',    name: '트립트랩 하이체어 네츄럴',    price: 340000, discount: 5  },
  { id: 'w3', image: 'https://via.placeholder.com/150', brand: '타이니러브', name: '수더앤그루브 모빌',          price: 78000,  discount: 15 },
  { id: 'w4', image: 'https://via.placeholder.com/150', brand: '블루래빗',   name: '토이북 전집 세트',           price: 299000, discount: 30 },
];

const TAG_COLOR = { 질문: '#eff6ff', 꿀팁: '#f0fdf4', 후기: '#fef9c3' };
const TAG_TEXT  = { 질문: '#2563eb', 꿀팁: '#16a34a', 후기: '#b45309' };

const MOCK_COMMUNITY = [
  { id: 'c1', tag: '꿀팁', title: '기저귀 발진 잡는 법 총정리 (저도 됐어요)',   snippet: '우리 아이 수면 교육 이렇게 성공했어요 진짜 효과 있었던 방법만 공유드려요...', author: '절약맘_서울',   level: 'Lv.3', levelColor: '#F59E0B', likes: 42, commentCount: 18, imageUrl: 'https://picsum.photos/seed/comm1/200', imageCount: 3, createdAt: new Date(Date.now() - 60 * 60 * 1000)         },
  { id: 'c2', tag: '질문', title: '6개월 아이 이유식 그릇 뭐 쓰세요?',          snippet: '이유식 시작했는데 그릇이 너무 다양해서 뭘 써야 할지 모르겠어요 추천 부탁드려요',  author: '초보맘_강남',   level: 'Lv.1', levelColor: '#6B7280', likes: 12, commentCount: 35, imageUrl: null,                                imageCount: 0, createdAt: new Date(Date.now() - 15 * 60 * 1000)         },
  { id: 'c3', tag: '후기', title: '하기스 vs 팸퍼스 직접 비교해봤어요',         snippet: '두 달 동안 둘 다 써봤는데 솔직히 말씀드릴게요 결론부터 말하면 허벅지 핏이 달라요', author: '두아이맘_경기', level: 'Lv.2', levelColor: '#10B981', likes: 89, commentCount: 45, imageUrl: 'https://picsum.photos/seed/comm3/200', imageCount: 4, createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) },
];

function formatRelativeTime(date) {
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / (60 * 1000));
  const diffHr  = Math.floor(diffMs / (60 * 60 * 1000));
  if (diffMin < 60)  return `${diffMin}분 전`;
  if (diffHr  < 24)  return `${diffHr}시간 전`;
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${mo}.${dd}`;
}

// ─── Coach Mark data ──────────────────────────────────────────────────────────

const SCREEN_W = Dimensions.get('window').width;
const TAB_W    = SCREEN_W / 5;

const COACH_MARKS = [
  { tabIndex: 0, tabName: '홈',      text: '맞춤 추천 상품과 핫딜이 매일 업데이트돼요.' },
  { tabIndex: 2, tabName: '커뮤니티', text: '나와 비슷한 환경의 엄마들과 정보를 나눠보세요.' },
  { tabIndex: 3, tabName: '관심상품', text: '가장 중요해요! 원하는 상품을 추가하면 가격이 떨어질 때 알려드려요.', isFinal: true },
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

function useBlinkAnim() {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.4, duration: 600, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1,   duration: 600, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);
  return opacity;
}

// ─── Section 1: Personalized Header & Mini-Dashboard ─────────────────────────

function Section1Header({ child, childLoading, trackedCount, navigation }) {
  const greeting = React.useMemo(() => {
    const name = child?.taemyeong || child?.name;
    if (name) return `${name} 맞춤 핫딜 도착!`;
    if (child) return `우리 아기 맞춤 핫딜 도착!`;
    return `맞춤 핫딜 도착!`;
  }, [child]);

  return (
    <TouchableOpacity
      style={styles.dashWidget}
      activeOpacity={0.9}
      onPress={() => navigation.navigate('관심상품')}
    >
      {/* Right ~80×80 reserved for assets/images/banner_illu.png */}
      {childLoading ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <ActivityIndicator size="small" color="#2E6FF2" />
          <Text style={{ fontSize: 13, color: '#3B82F6' }}>맞춤 정보 불러오는 중...</Text>
        </View>
      ) : (
        <Text style={styles.dashWidgetGreeting}>{greeting}</Text>
      )}
      <Text style={styles.dashWidgetTracking}>
        가격 추적 중인 상품 확인하기 {'>'}
      </Text>
    </TouchableOpacity>
  );
}

// ─── Section 2: Fixed Quick Menus ────────────────────────────────────────────

const FIXED_MENUS = [
  { Icon: Flame,         color: '#EF4444', label: '오늘의 특가',   nav: (n)       => n.navigate('CurationDetail', { type: 'goldbox',       title: '오늘의 특가' }) },
  { Icon: Trophy,        color: '#F59E0B', label: '또래 랭킹',    nav: (n)       => n.navigate('랭킹') },
  { Icon: MessageCircle, color: '#10B981', label: '실시간 맘톡',  nav: (n)       => n.navigate('커뮤니티') },
  { Icon: Sparkles,      color: '#8B5CF6', label: '맞춤 추천',    nav: (n)       => n.navigate('CurationDetail', { type: 'personalized',  title: '맞춤 추천' }) },
  { Icon: LayoutGrid,    color: '#6B7280', label: '전체보기',     nav: (n, open) => open(true) },
];

function Section2QuickMenus({ navigation, onOpenCategorySheet }) {
  return (
    <View style={styles.shortcutSection}>
      {FIXED_MENUS.map((m) => (
        <TouchableOpacity
          key={m.label}
          style={styles.shortcutItem}
          activeOpacity={0.75}
          onPress={() => { try { m.nav(navigation, onOpenCategorySheet); } catch (_) {} }}
        >
          <View style={styles.shortcutCircle}>
            <m.Icon size={24} color={m.color} strokeWidth={1.8} />
          </View>
          <Text style={styles.shortcutLabel} numberOfLines={1}>{m.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ─── 4a. Personalized Greeting Header (when child profile exists) ─────────────

function PersonalizedGreeting({ child }) {
  const childName = child?.taemyeong || child?.name || '아이';
  return (
    <View style={styles.personalGreeting}>
      <Text style={styles.personalGreetingText}>
        맘님, 오늘 {childName} 맞춤 핫딜이{'\n'}도착했어요! 🎁
      </Text>
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

const EMPTY_HOT_ITEMS = [
  { id: 'eh1', brand: '팸퍼스', name: '하이드로케어 기저귀 특대형 88매', currentPrice: 30500, originalPrice: 46900, discountPct: 35, bg: '#fef9c3', emoji: '🧷' },
  { id: 'eh2', brand: '젤리캣', name: '바쉬풀 버니 미디엄 M 사이즈',     currentPrice: 35900, originalPrice: 44900, discountPct: 20, bg: '#fbcfe8', emoji: '🧸' },
];

function PriceTrackingWidget({ navigation, trackedItems = MOCK_TRACKED }) {
  // Sort by largest discount rate (originalPrice → currentPrice) descending
  const sortedTracked = React.useMemo(() => {
    return [...trackedItems].sort((a, b) => {
      const pctA = a.originalPrice > 0 ? (a.originalPrice - a.currentPrice) / a.originalPrice : 0;
      const pctB = b.originalPrice > 0 ? (b.originalPrice - b.currentPrice) / b.originalPrice : 0;
      return pctB - pctA;
    });
  }, [trackedItems]);

  const isEmpty = trackedItems.length === 0;

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>📉 나의 가격 추적 현황</Text>
        <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} onPress={() => navigation.navigate('관심상품')}>
          <Text style={styles.sectionViewAll}>전체보기 ›</Text>
        </TouchableOpacity>
      </View>
      <Text style={[styles.sectionSub, { marginBottom: 2 }]}>가격이 떨어지면 즉시 알림을 드려요</Text>

      {isEmpty ? (
        /* ── Empty State (PM spec) ── */
        <View style={{ backgroundColor: '#f8fafc', borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 2, borderWidth: 1, borderColor: '#e2e8f0' }}>
          <Text style={{ fontSize: 13, color: '#64748b', marginBottom: 10 }}>추적 중인 상품이 없습니다.</Text>
          <TouchableOpacity
            style={{ backgroundColor: '#3b82f6', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8 }}
            activeOpacity={0.85}
            onPress={() => navigation.navigate('관심상품')}
          >
            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>+ 상품 추가하러 가기</Text>
          </TouchableOpacity>
        </View>
      ) : (
        sortedTracked.map((item) => {
          const diffPct = Math.round(Math.abs(1 - item.currentPrice / item.averagePrice) * 100);
          let bottomText, badgeBg, badgeColor;

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

          const aboveAvg = item.currentPrice > item.averagePrice;
          const belowAvg = item.currentPrice < item.averagePrice;

          return (
            <TouchableOpacity key={item.id} style={styles.trackCard} activeOpacity={0.88} onPress={() => navigation.navigate('Detail', { item })}>
              <View style={[styles.trackThumb, { backgroundColor: item.bg }]}>
                <Text style={styles.trackEmoji}>{item.emoji}</Text>
              </View>
              <View style={styles.trackInfo}>
                <Text style={styles.trackBrand}>{item.brand}</Text>
                <Text style={styles.trackName} numberOfLines={1}>{item.name}</Text>
                <View style={styles.trackPriceRow}>
                  <Text style={styles.trackPrice}>₩{item.currentPrice.toLocaleString('ko-KR')}</Text>
                  {belowAvg && <Text style={{ color: '#3b82f6', fontWeight: 'bold', marginLeft: 6, fontSize: 14 }}>▼ {diffPct}%</Text>}
                  {aboveAvg && <Text style={{ color: '#ef4444', fontWeight: 'bold', marginLeft: 6, fontSize: 14 }}>▲ {diffPct}%</Text>}
                </View>
                <Text style={styles.trackOriginal}>정가 ₩{item.originalPrice.toLocaleString('ko-KR')}</Text>
              </View>
              <InsightBadge topText="" bottomText={bottomText} badgeBg={badgeBg} badgeColor={badgeColor} />
            </TouchableOpacity>
          );
        })
      )}
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
            {/* Square image card */}
            <View style={styles.ugcPhoto}>
              <Image source={{ uri: item.image }} style={{ width: 140, height: 140 }} resizeMode="cover" />

              {/* Top-left: category badge */}
              <View style={styles.ugcTagBtn}>
                <Text style={styles.ugcTagBtnText}>+ {item.tag}</Text>
              </View>

              {/* Bottom overlay (40% height dim): author + review */}
              <View style={styles.ugcOverlay}>
                <Text style={styles.ugcUser}>{item.author}</Text>
                <Text style={styles.ugcCaption} numberOfLines={1}>{item.review}</Text>
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
  const blinkOpacity = useBlinkAnim();

  return (
    <View style={styles.section}>
      <View style={styles.timeSaleHeader}>
        <Text style={styles.sectionTitle}>⏰ 로켓배송 마감 임박 타임세일</Text>
        <Animated.View style={[styles.timerBadge, { opacity: blinkOpacity }]}>
          <Text style={styles.timerText}>{timeLabel} 남음</Text>
        </Animated.View>
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
              {/* Stock urgency strip + progress bar */}
              <View style={styles.timeSaleStockStrip}>
                <Text style={styles.timeSaleStockText}>⏰ {item.stock}개 남음</Text>
                <View style={styles.stockBarTrack}>
                  <View style={[styles.stockBarFill, { width: `${Math.min(100, Math.round((item.stock / 30) * 100))}%` }]} />
                </View>
              </View>
            </View>

            {/* Info */}
            <View style={styles.timeSaleInfo}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                <Text style={styles.timeSaleBrand}>{item.brand}</Text>
                {item.isRocket && (
                  <View style={[styles.rocketBadge, { marginLeft: 6, marginTop: 0 }]}>
                    <Text style={styles.rocketBadgeText}>🚀 로켓배송</Text>
                  </View>
                )}
              </View>
              <Text style={styles.timeSaleName} numberOfLines={2}>{item.name}</Text>
              <View style={styles.timeSalePriceRow}>
                <Text style={styles.timeSaleDiscount}>{item.discount}%</Text>
                <Text style={styles.timeSalePrice}>₩{item.price.toLocaleString('ko-KR')}</Text>
              </View>
              <Text style={styles.timeSaleOriginal}>₩{item.originalPrice.toLocaleString('ko-KR')}</Text>
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
          🎁 {ageMonth}개월 맘들이 탐내는 위시템
        </Text>
        <TouchableOpacity
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          onPress={() => navigation.navigate('랭킹')}
        >
          <Text style={styles.sectionViewAll}>랭킹 보기 ›</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.sectionSub}>눈여겨보던 고가 육아템, 역대급 할인 폭으로 득템할 기회✨</Text>

      <View style={styles.wishGrid}>
        {WISH_GRID.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={styles.wishCell}
            activeOpacity={0.88}
            onPress={() => recordProductAction({ userId: auth.currentUser?.uid, productId: item.id, productGroupId: item.id, actionType: 'click' })}
          >
            <View style={styles.wishThumb}>
              <Image source={{ uri: item.image }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
              <View style={styles.wishDiscountPill}>
                <Text style={styles.wishDiscountText}>-{item.discount}%</Text>
              </View>
            </View>
            <View style={{ paddingHorizontal: 8, paddingTop: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                <Text style={styles.wishBrand} numberOfLines={1}>{item.brand}</Text>
                {item.isRocket && (
                  <View style={[styles.rocketBadge, { marginLeft: 6, marginTop: 0 }]}>
                    <Text style={styles.rocketBadgeText}>🚀 로켓배송</Text>
                  </View>
                )}
              </View>
              <Text style={styles.wishName} numberOfLines={2}>{item.name}</Text>
              <View style={{ marginTop: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                  <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#ef4444', marginRight: 4 }}>
                    {item.discount || 15}%
                  </Text>
                  <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#0f172a' }}>
                    ₩{item.price.toLocaleString('ko-KR')}
                  </Text>
                </View>
                <Text style={{ fontSize: 11, color: '#94a3b8', textDecorationLine: 'line-through', marginTop: 2 }}>
                  ₩{(item.originalPrice ?? Math.round(item.price * (1 + (item.discount || 15) / 100))).toLocaleString('ko-KR')}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

// ─── Section 5: Context-to-Commerce Community Highlights ─────────────────────

function Section5CommunityHighlights({ navigation }) {
  return (
    <View style={styles.communitySection}>
      {/* Header */}
      <View style={styles.communityHeader}>
        <Text style={styles.secTitle}>지금 뜨는 맘톡</Text>
        <TouchableOpacity onPress={() => navigation.navigate('커뮤니티')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.secViewAll}>더보기 ›</Text>
        </TouchableOpacity>
      </View>
      <Text style={{ fontSize: 13, color: '#6B7280', marginTop: 0 }}>지금 또래 엄마들은 무슨 이야기를 하고 있을까요?</Text>
      <View style={{ height: 1, backgroundColor: '#E5E7EB', marginTop: 12, marginBottom: 16 }} />

      {/* Rich Cards */}
      {MOCK_COMMUNITY.map((post) => (
        <TouchableOpacity
          key={post.id}
          style={{ paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' }}
          activeOpacity={0.75}
          onPress={() => navigation.navigate('커뮤니티')}
        >
          <View style={{ flexDirection: 'row' }}>
            {/* Left column — content first */}
            <View style={{ flex: 1, justifyContent: 'flex-start', marginRight: post.imageUrl ? 12 : 0 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 4 }} numberOfLines={1}>{post.title} <Text style={{ color: '#2E6FF2', fontSize: 13, fontWeight: '500', marginLeft: 4 }}>({post.commentCount})</Text></Text>
              <Text style={{ fontSize: 13, color: '#6B7280', marginBottom: 8 }} numberOfLines={1}>{post.snippet}</Text>
              {/* Bottom meta row */}
              <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
                <View style={{ backgroundColor: '#F3F4F6', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1, marginRight: 6 }}>
                  <Text style={{ fontSize: 11, color: '#4B5563' }}>{post.tag}</Text>
                </View>
                <Text style={{ color: post.levelColor, fontSize: 11, fontWeight: '700' }}>{post.level}</Text>
                <Text style={{ color: '#9CA3AF', fontSize: 11 }}> {post.author}</Text>
                <Text style={{ color: '#D1D5DB', marginHorizontal: 4 }}>·</Text>
                <Text style={{ color: '#9CA3AF', fontSize: 11 }}>좋아요 {post.likes} · {formatRelativeTime(post.createdAt)}</Text>
              </View>
            </View>

            {/* Right: thumbnail with +N badge */}
            {post.imageUrl && (
              <View style={{ position: 'relative' }}>
                <Image source={{ uri: post.imageUrl }} style={{ width: 64, height: 64, borderRadius: 8, backgroundColor: '#F3F4F6' }} />
                {post.imageCount > 1 && (
                  <View style={{ position: 'absolute', bottom: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 4, paddingVertical: 2, borderRadius: 4 }}>
                    <Text style={{ color: '#FFF', fontSize: 10, fontWeight: '700' }}>+{post.imageCount - 1}</Text>
                  </View>
                )}
              </View>
            )}
          </View>
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
        </View>
        <View style={styles.cardInfo}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
            <Text style={styles.cardBrand} numberOfLines={1}>{item.brand || '브랜드'}</Text>
            {item.isRocket && (
              <View style={[styles.rocketBadge, { marginLeft: 6, marginTop: 0 }]}>
                <Text style={styles.rocketBadgeText}>🚀 로켓배송</Text>
              </View>
            )}
          </View>
          <Text style={styles.cardName} numberOfLines={2}>{item.name || '이름 없음'}</Text>
          <View style={{ marginTop: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
              <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#ef4444', marginRight: 4 }}>
                {item.discount || 15}%
              </Text>
              <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#0f172a' }}>
                ₩{(item.price ?? item.currentPrice ?? 0).toLocaleString('ko-KR')}
              </Text>
            </View>
            <Text style={{ fontSize: 11, color: '#94a3b8', textDecorationLine: 'line-through', marginTop: 2 }}>
              ₩{(item.originalPrice ?? Math.round((item.price ?? item.currentPrice ?? 0) * 1.15)).toLocaleString('ko-KR')}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    </View>
  );
}

// ─── 10a. Hero Card (curation index 0) ───────────────────────────────────────

function HeroCard({ item, navigation }) {
  return (
    <TouchableOpacity
      style={styles.heroCard}
      activeOpacity={0.88}
      onPress={() => {
        recordProductAction({ userId: auth.currentUser?.uid, productId: item.productId, productGroupId: item.productId, actionType: 'click' });
        navigation.navigate('Detail', { item });
      }}
    >
      <View style={styles.heroCardImageWrap}>
        {item.image ? (
          <Image source={{ uri: item.image }} style={styles.heroCardImage} resizeMode="cover" />
        ) : (
          <View style={[styles.heroCardImage, { backgroundColor: '#e2e8f0' }]} />
        )}
        <View style={[styles.cardRankBadge, { backgroundColor: '#fbbf24', position: 'absolute', top: 10, left: 10 }]}>
          <Text style={[styles.cardRankText, { color: '#fff' }]}>1</Text>
        </View>
        <View style={[styles.lowestPriceBadge, { position: 'absolute', bottom: 10, left: 10 }]}>
          <Text style={styles.lowestPriceText}>🔥 역대 최저가</Text>
        </View>
      </View>
      <View style={styles.heroCardInfo}>
        <Text style={styles.cardBrand}>{item.brand || '브랜드'}</Text>
        <Text style={styles.heroCardName} numberOfLines={2}>{item.name || '이름 없음'}</Text>
        <Text style={styles.trustCopyHero}>같은 개월 수 워킹맘들의 84%가 선택했어요</Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 6 }}>
          <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#ef4444', marginRight: 4 }}>
            {item.discount || 15}%
          </Text>
          <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#0f172a' }}>
            ₩{(item.price ?? item.currentPrice ?? 0).toLocaleString('ko-KR')}
          </Text>
        </View>
        <Text style={{ fontSize: 12, color: '#94a3b8', textDecorationLine: 'line-through', marginTop: 2 }}>
          ₩{(item.originalPrice ?? Math.round((item.price ?? item.currentPrice ?? 0) * 1.15)).toLocaleString('ko-KR')}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── 10b. Medium Card (curation index 1 & 2) ─────────────────────────────────

function MediumCard({ item, index, navigation }) {
  return (
    <TouchableOpacity
      style={styles.mediumCard}
      activeOpacity={0.88}
      onPress={() => {
        recordProductAction({ userId: auth.currentUser?.uid, productId: item.productId, productGroupId: item.productId, actionType: 'click' });
        navigation.navigate('Detail', { item });
      }}
    >
      <View style={styles.mediumCardImageWrap}>
        {item.image ? (
          <Image source={{ uri: item.image }} style={styles.mediumCardImage} resizeMode="cover" />
        ) : (
          <View style={[styles.mediumCardImage, { backgroundColor: '#e2e8f0' }]} />
        )}
        <View style={[styles.cardRankBadge, { backgroundColor: '#9ca3af', position: 'absolute', top: 8, left: 8 }]}>
          <Text style={[styles.cardRankText, { color: '#fff' }]}>{index + 1}</Text>
        </View>
      </View>
      <View style={{ padding: 10 }}>
        <Text style={styles.cardBrand}>{item.brand || '브랜드'}</Text>
        <Text style={styles.mediumCardName} numberOfLines={2}>{item.name || '이름 없음'}</Text>
        <Text style={styles.trustCopyMedium}>비슷한 시기에 많이 찾는 필수템이에요</Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 4 }}>
          <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#ef4444', marginRight: 4 }}>
            {item.discount || 15}%
          </Text>
          <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#0f172a' }}>
            ₩{(item.price ?? item.currentPrice ?? 0).toLocaleString('ko-KR')}
          </Text>
        </View>
        <Text style={{ fontSize: 11, color: '#94a3b8', textDecorationLine: 'line-through', marginTop: 2 }}>
          ₩{(item.originalPrice ?? Math.round((item.price ?? item.currentPrice ?? 0) * 1.15)).toLocaleString('ko-KR')}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── 10c. Unified Horizontal Card (Ranking / Goldbox / Replenishment) ─────────

const RANK_COLORS = ['#FFB800', '#94A3B8', '#CD7F32', '#0F172A', '#0F172A'];

function HorizontalCard({ item, index, navigation, showRank = false, showTrustCopy = false, onPress }) {
  const handlePress = onPress ?? (() => {
    if (item.productId) {
      recordProductAction({ userId: auth.currentUser?.uid, productId: item.productId, productGroupId: item.productId, actionType: 'click' });
    }
    navigation.navigate('Detail', { item });
  });
  const discount  = showRank ? (item.discount ?? 15) : item.discount;
  const origPrice = item.originalPrice ?? (showRank ? Math.round((item.price ?? item.currentPrice ?? 0) * 1.15) : null);

  return (
    <TouchableOpacity style={styles.hCard} activeOpacity={0.88} onPress={handlePress}>
      <View style={styles.hCardImageWrap}>
        {item.image ? (
          <Image source={{ uri: item.image }} style={styles.hCardImage} resizeMode="cover" />
        ) : (
          <View style={[styles.hCardImage, { backgroundColor: item.bg ?? '#e2e8f0', alignItems: 'center', justifyContent: 'center' }]}>
            <Package size={40} color="rgba(100,116,139,0.45)" strokeWidth={1.5} />
          </View>
        )}
        {showRank && (
          <View style={[styles.hCardRankBadge, { backgroundColor: RANK_COLORS[Math.min(index, 4)] }]}>
            <Text style={styles.hCardRankBadgeText}>{index + 1}</Text>
          </View>
        )}
        {showRank && index === 0 && (
          <View style={styles.hCardLowestOverlay}>
            <Text style={styles.hCardLowestPillText}>최저가</Text>
          </View>
        )}
        {!showRank && discount != null && (
          <View style={styles.hCardDiscountPill}>
            <Text style={styles.hCardDiscountPillText}>-{discount}%</Text>
          </View>
        )}
      </View>
      <View style={{ padding: 8 }}>
        {showTrustCopy && (
          <Text style={styles.hCardTrustCopy} numberOfLines={1}>또래 워킹맘 84% 선택</Text>
        )}
        <Text numberOfLines={2} style={styles.hCardMergedName}>
          {item.brand ? <Text style={styles.hCardBrandInline}>{item.brand} </Text> : null}
          {item.name || '이름 없음'}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 4 }}>
          {discount != null && (
            <Text style={{ fontSize: 13, fontWeight: '800', color: '#EF4444', marginRight: 3 }}>{discount}%</Text>
          )}
          <Text style={{ fontSize: 13, fontWeight: '800', color: '#0f172a' }} numberOfLines={1}>
            ₩{(item.price ?? item.currentPrice ?? 0).toLocaleString('ko-KR')}
          </Text>
        </View>
        {origPrice != null && (
          <Text style={{ fontSize: 11, color: '#9CA3AF', textDecorationLine: 'line-through', marginTop: 2 }}>
            ₩{origPrice.toLocaleString('ko-KR')}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

// ─── 10d. Replenishment Strip ─────────────────────────────────────────────────

function ReplenishmentStrip({ child, navigation }) {
  const childName = child?.taemyeong || child?.name || '아이';
  return (
    <View style={{ marginTop: 16 }}>
      <Text style={[styles.sectionTitle, { marginBottom: 4 }]}>
        🛒 {childName} 기저귀/분유 떨어질 때 안 됐나요?
      </Text>
      <Text style={[styles.sectionSub, { marginBottom: 10 }]}>소모품 쟁여두기 전에 최저가 체크!</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
        {MOCK_REPLENISHMENT.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={styles.replenishCard}
            activeOpacity={0.85}
            onPress={() => navigation.navigate('관심상품')}
          >
            <View style={[styles.replenishThumb, { backgroundColor: item.bg }]}>
              <Text style={{ fontSize: 30 }}>{item.emoji}</Text>
            </View>
            <View style={{ paddingHorizontal: 8, paddingBottom: 10 }}>
              <Text style={{ fontSize: 11, color: '#64748b', fontWeight: '600' }}>{item.brand}</Text>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#0f172a', lineHeight: 17, marginTop: 2 }} numberOfLines={2}>{item.name}</Text>
              <Text style={{ fontSize: 13, fontWeight: '800', color: '#2E6FF2', marginTop: 4 }}>₩{item.price.toLocaleString('ko-KR')}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

// ─── Coach Mark Overlay ───────────────────────────────────────────────────────

const SPOTLIGHT_SIZE = 60;

const TAB_CENTERS = ['10%', '30%', '50%', '70%', '90%'];
const getTabCenter = (index) => TAB_CENTERS[index] ?? '50%';

function CoachMarkOverlay({ step, onNext, onFinish, onSkip, navigation }) {
  if (step === 0) return null;
  const mark   = COACH_MARKS[step - 1];
  const isLast = mark.isFinal === true;

  const handleTabPress = () => {
    onFinish();
    navigation.navigate('관심상품');
  };

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onSkip}>
      <View style={cm.root}>
        {/* Skip — top right */}
        <TouchableOpacity style={cm.skipBtn} onPress={onSkip} activeOpacity={0.8}>
          <Text style={cm.skipText}>건너뛰기</Text>
        </TouchableOpacity>

        {/* Tooltip card — sits above the spotlight */}
        <View style={cm.card}>
          <Text style={cm.stepDot}>{step} / {COACH_MARKS.length}</Text>
          <Text style={cm.cardText}>{mark.text}</Text>
          <TouchableOpacity style={cm.nextBtn} onPress={isLast ? handleTabPress : onNext} activeOpacity={0.85}>
            <Text style={cm.nextBtnText}>{isLast ? '완료' : '다음'}</Text>
          </TouchableOpacity>
        </View>

        {/* Tab label — floats above the spotlight */}
        <Text style={[cm.tabName, { left: getTabCenter(mark.tabIndex) }]}>
          {mark.tabName}
        </Text>

        {/* Spotlight hole — percentage-based centering */}
        <TouchableOpacity
          style={[cm.ring, { left: getTabCenter(mark.tabIndex), marginLeft: -(SPOTLIGHT_SIZE / 2) }]}
          onPress={isLast ? handleTabPress : undefined}
          activeOpacity={isLast ? 0.7 : 1}
        />
      </View>
    </Modal>
  );
}

const cm = StyleSheet.create({
  root: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, width: Dimensions.get('window').width, backgroundColor: 'rgba(0,0,0,0.72)' },
  skipBtn: {
    position: 'absolute', top: 56, right: 20, zIndex: 10,
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
  },
  skipText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  card: {
    position: 'absolute', bottom: 130, left: 24, right: 24,
    backgroundColor: '#fff', borderRadius: 16, padding: 20,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 16 },
      android: { elevation: 10 },
    }),
  },
  stepDot:     { fontSize: 12, fontWeight: '600', color: '#94a3b8', marginBottom: 8 },
  cardText:    { fontSize: 16, fontWeight: '700', color: '#0f172a', lineHeight: 24, marginBottom: 20 },
  nextBtn:     { backgroundColor: COLORS.primary, paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  nextBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  ring: {
    position: 'absolute',
    bottom: 10,
    width: SPOTLIGHT_SIZE, height: SPOTLIGHT_SIZE, borderRadius: SPOTLIGHT_SIZE / 2,
    backgroundColor: 'rgba(255,255,255,0.3)',
    transform: [{ translateY: 0 }],
  },
  tabName: {
    position: 'absolute',
    bottom: 80,
    marginLeft: -(60),
    width: 120,
    color: '#fff', fontSize: 18, fontWeight: 'bold', textAlign: 'center',
  },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function HomeScreen({ navigation }) {
  const { unreadCount } = useNotification();
  const { setDeepLinkIntent } = useContext(DeepLinkContext);
  const { globalTrackedItems } = useTracking();
  const [child,            setChild]            = useState(null);
  const [childLoading,     setChildLoading]     = useState(true);
  const [curation,         setCuration]         = useState([]);
  const [curationLoading,  setCurationLoading]  = useState(true);
  const [refreshing,       setRefreshing]       = useState(false);
  const fetchingRef = useRef(false);

  // Coach mark tour (0 = hidden)
  const [tutorialStep,  setTutorialStep]  = useState(0);

  // Magic Nudge (clipboard Coupang link detection)
  const [showClipNudge,         setShowClipNudge]         = useState(false);
  const [clipNudgeUrl,          setClipNudgeUrl]          = useState('');
  const [isCategorySheetVisible, setCategorySheetVisible] = useState(false);
  const nudgeAnim = useRef(new Animated.Value(80)).current;

  // Auto-start coach mark tour on first mount
  useEffect(() => {
    setTutorialStep(1);
  }, []);

  // Slide nudge in/out
  useEffect(() => {
    Animated.timing(nudgeAnim, {
      toValue: showClipNudge ? 0 : 80,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [showClipNudge, nudgeAnim]);

  // Detect Coupang link when app returns to foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (nextState) => {
      if (nextState !== 'active') return;
      try {
        const text = await Clipboard.getStringAsync();
        if (text && text.includes('coupang.com') && tutorialStep === 0) {
          setClipNudgeUrl(text);
          setShowClipNudge(true);
          await Clipboard.setStringAsync('');
        }
      } catch {}
    });
    return () => sub.remove();
  }, [tutorialStep]);

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

  return (
    <View style={styles.root}>
      {/* ── Global header: logo + search + guide modal ── */}
      <GlobalHeader
        tabName="Home"
        placeholder="기저귀 최저가를 검색해보세요"
        navigation={navigation}
        unreadCount={unreadCount}
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
        {/* ── Section 1: Personalized Header & Mini-Dashboard ── */}
        <Section1Header
          child={child}
          childLoading={childLoading}
          trackedCount={globalTrackedItems.length}
          navigation={navigation}
        />

        {/* ── Section 2: Fixed Quick Menus ── */}
        <Section2QuickMenus navigation={navigation} onOpenCategorySheet={setCategorySheetVisible} />
        <View style={styles.sectionDivider} />

        {/* ── Section 3: 실시간 또래 베스트 특가 ── */}
        <View style={styles.section}>
          <View style={styles.secHeader}>
            <View style={styles.secHeaderTop}>
              <Text style={styles.secTitle}>실시간 또래 베스트 특가</Text>
              <TouchableOpacity
                onPress={() => {
                  setDeepLinkIntent({ targetTab: 'frequent', enableCustom: true, targetAge: child?.ageMonth ? `${child.ageMonth}개월` : '67개월' });
                  navigation.navigate('랭킹');
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.secViewAll}>전체 ›</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.secSub}>지금 가격이 뚝 떨어진 인기 상품만 모았어요</Text>
          </View>
          {curationLoading ? (
            <View style={styles.curationLoading}>
              <ActivityIndicator size="small" color="#2E6FF2" />
              <Text style={styles.curationLoadingText}>불러오는 중...</Text>
            </View>
          ) : curation.length === 0 ? (
            <Text style={styles.emptyText}>상품 정보를 불러올 수 없습니다</Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
              {curation.slice(0, 5).map((item, index) => (
                <HorizontalCard
                  key={item.productId ? `${item.productId}-${index}` : String(index)}
                  item={item}
                  index={index}
                  navigation={navigation}
                  showRank
                  showTrustCopy
                />
              ))}
            </ScrollView>
          )}
        </View>
        <View style={styles.sectionDivider} />

        {/* ── Section 3b: 오늘의 육아 특가 ── */}
        <View style={styles.section}>
          <View style={styles.secHeader}>
            <View style={styles.secHeaderTop}>
              <Text style={styles.secTitle}>오늘의 육아 특가</Text>
              <TouchableOpacity
                onPress={() => navigation.navigate('CurationDetail', { type: 'goldbox', title: '오늘의 육아 특가' })}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.secViewAll}>전체 ›</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.secSub}>하루 한정, 최대 45% 육아 필수템 특가</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
            {MOCK_GOLDBOX.map((item) => (
              <HorizontalCard
                key={item.id}
                item={item}
                index={0}
                navigation={navigation}
                onPress={() => navigation.navigate('Detail', { item })}
              />
            ))}
          </ScrollView>
        </View>
        <View style={styles.sectionDivider} />

        {/* ── Section 4: 지금 쟁여야 할 생필품 핫딜 ── */}
        <View style={styles.section}>
          <View style={styles.secHeader}>
            <View style={styles.secHeaderTop}>
              <Text style={styles.secTitle}>지금 쟁여야 할 생필품 핫딜</Text>
              <TouchableOpacity
                onPress={() => navigation.navigate('CurationDetail', { type: 'coupangPL', title: '지금 쟁여야 할 생필품 핫딜' })}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.secViewAll}>전체 ›</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.secSub}>기저귀·물티슈, 가격 내려갔을 때 미리 담아두세요</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 4 }}>
            {MOCK_REPLENISHMENT.map((item) => (
              <HorizontalCard
                key={item.id}
                item={item}
                index={0}
                navigation={navigation}
                onPress={() => navigation.navigate('관심상품')}
              />
            ))}
          </ScrollView>
        </View>
        <View style={styles.sectionDivider} />

        {/* ── Section 5: Context-to-Commerce Community Highlights ── */}
        <Section5CommunityHighlights navigation={navigation} />

        {/* Coupang disclaimer */}
        <Text style={styles.disclaimer}>
          이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.
        </Text>
      </ScrollView>

      {/* ── Magic Nudge: clipboard Coupang link detected ── */}
      <Animated.View style={[styles.clipNudge, { transform: [{ translateY: nudgeAnim }] }]}>
        <Text style={styles.clipNudgeText}>복사하신 쿠팡 상품의 최저가를 추적할까요?</Text>
        <View style={styles.clipNudgeActions}>
          <TouchableOpacity
            style={styles.clipNudgeTrackBtn}
            onPress={() => { setShowClipNudge(false); navigation.navigate('관심상품'); }}
            activeOpacity={0.85}
          >
            <Text style={styles.clipNudgeTrackText}>추적하기</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setShowClipNudge(false)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.clipNudgeClose}>✕</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* ── Coach Mark Tutorial Overlay ── */}
      <CoachMarkOverlay
        step={tutorialStep}
        onNext={() => setTutorialStep((s) => s + 1)}
        onFinish={() => setTutorialStep(0)}
        onSkip={() => setTutorialStep(0)}
        navigation={navigation}
      />

      {/* ── Category Bottom Sheet ── */}
      <Modal
        visible={isCategorySheetVisible}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setCategorySheetVisible(false)}
      >
        <TouchableOpacity
          style={styles.catSheetBackdrop}
          activeOpacity={1}
          onPress={() => setCategorySheetVisible(false)}
        />
        <View style={styles.catSheet}>
          <View style={styles.catSheetHandle} />
          <Text style={styles.catSheetTitle}>카테고리</Text>
          {[
            { label: '출산·유아동', icon: '🍼', id: '1011' },
            { label: '식품',        icon: '🥗', id: '1012' },
            { label: '생활용품',    icon: '🧴', id: '1014' },
            { label: '패션의류',    icon: '👗', id: '1001' },
            { label: '뷰티',        icon: '💄', id: '1005' },
            { label: '가전디지털',  icon: '📱', id: '1002' },
            { label: '스포츠·레저', icon: '🏃', id: '1009' },
            { label: '홈·인테리어', icon: '🏠', id: '1010' },
          ].map((cat) => (
            <TouchableOpacity
              key={cat.label}
              style={styles.catSheetRow}
              activeOpacity={0.7}
              onPress={() => {
                setCategorySheetVisible(false);
                navigation.navigate('CategoryDetail', { categoryId: cat.id, categoryName: cat.label });
              }}
            >
              <Text style={styles.catSheetRowIcon}>{cat.icon}</Text>
              <Text style={styles.catSheetRowLabel}>{cat.label}</Text>
              <Text style={styles.catSheetRowArrow}>›</Text>
            </TouchableOpacity>
          ))}
        </View>
      </Modal>
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
    marginHorizontal: 12, marginTop: 4, marginBottom: 4,
    minHeight: 0, height: 'auto', borderRadius: 18,
    backgroundColor: '#1d4ed8', overflow: 'hidden', justifyContent: 'center',
  },
  heroInner: { paddingHorizontal: 20, paddingVertical: 16, zIndex: 1 },
  heroGreeting: { fontSize: 18, fontWeight: '900', color: '#fff', marginBottom: 4 },
  heroSub: { fontSize: 13, color: 'rgba(255,255,255,0.85)', marginBottom: 14, lineHeight: 19 },
  heroCtaRow: { flexDirection: 'row' },
  heroPill: {
    backgroundColor: '#fff', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 5,
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
    backgroundColor: '#fff', marginTop: 0, marginBottom: 0,
    paddingVertical: 16, paddingHorizontal: 8,
    borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  shortcutItem: { alignItems: 'center', gap: 2 },
  shortcutCircle: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center',
    marginBottom: 8,
  },
  shortcutLabel: { fontSize: 12, fontWeight: '600', color: '#374151', maxWidth: 62, textAlign: 'center', letterSpacing: -0.3 },

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
    backgroundColor: '#fff', marginTop: 0, marginBottom: 0,
    paddingHorizontal: 14, paddingTop: 14, paddingBottom: 14,
  },
  sectionPadH: { paddingHorizontal: 14 },
  sectionHeaderRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    justifyContent: 'space-between', marginBottom: 0,
  },
  sectionTitle:   { fontSize: 16, fontWeight: '800', color: '#0f172a', flex: 1 },
  sectionViewAll: { fontSize: 13, color: '#64748b', fontWeight: '500', flexShrink: 0, paddingLeft: 8, marginTop: 2 },
  sectionSub:     { fontSize: 12, color: '#94a3b8', marginBottom: 16, fontWeight: '500' },
  sectionDivider: { height: 8, backgroundColor: '#F3F4F6' },

  // ── Section header v2 (title + view-all aligned, subtitle below) ────────────
  secHeader:    { marginBottom: 16 },
  secHeaderTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  secTitle:     { fontSize: 18, fontWeight: '800', color: '#111827' },
  secSub:       { fontSize: 13, color: '#6B7280' },
  secViewAll:   { fontSize: 13, color: '#6B7280', fontWeight: '600' },

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
  trackEmptyTitle: { fontSize: 15, fontWeight: 'bold', color: '#0f172a', marginTop: 8, marginBottom: 4 },
  trackEmptySub:   { fontSize: 13, color: '#64748b', marginBottom: 12 },
  trackCtaBtn: {
    backgroundColor: '#1d4ed8', borderRadius: 10,
    paddingVertical: 14, alignItems: 'center', marginTop: 12,
  },
  trackCtaBtnText: { fontSize: 14, fontWeight: '800', color: '#fff' },
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
    width: 140, height: 140,
    borderRadius: 14, overflow: 'hidden',
  },
  ugcOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: '40%',
    backgroundColor: 'rgba(0,0,0,0.48)',
    paddingHorizontal: 8, paddingVertical: 7,
    justifyContent: 'flex-end',
  },
  ugcUser:    { fontSize: 11, fontWeight: '700', color: '#fff', marginBottom: 1 },
  ugcCaption: { fontSize: 11, color: 'rgba(255,255,255,0.9)' },
  ugcTagBtn: {
    position: 'absolute', top: 6, left: 6,
    backgroundColor: 'rgba(255,255,255,0.85)', borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 3,
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
  stockBarTrack: {
    width: '90%', height: 3, backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 2, marginTop: 3, overflow: 'hidden',
  },
  stockBarFill: {
    height: 3, backgroundColor: '#ef4444', borderRadius: 2,
  },
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
    height: 110, position: 'relative', overflow: 'hidden',
  },
  wishBrand: { fontSize: 10, fontWeight: '600', color: '#94a3b8' },
  wishDiscountPill: {
    position: 'absolute', top: 6, right: 6,
    backgroundColor: '#ef4444', borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  wishDiscountText: { fontSize: 10, fontWeight: '900', color: '#fff' },
  wishName: {
    fontSize: 12, fontWeight: '600', color: '#0f172a', lineHeight: 16,
  },
  wishPrice: {
    fontSize: 13, fontWeight: '900', color: '#0f172a', marginTop: 2, paddingBottom: 8,
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
  cardBrand: { fontSize: 10, fontWeight: '600', color: '#94a3b8' },
  cardName:  { fontSize: 12, fontWeight: '600', color: '#0f172a', lineHeight: 16 },
  cardPrice: { fontSize: 13, fontWeight: '800', color: '#0f172a' },
  cardRocket: {
    alignSelf: 'flex-start', backgroundColor: '#eff6ff', borderRadius: 4,
    paddingHorizontal: 5, paddingVertical: 2, marginTop: 2,
  },
  cardRocketText: { fontSize: 10, fontWeight: '700', color: '#1d4ed8' },

  // ── Community Snippet ─────────────────────────────────────────────────────────
  communitySection: {
    backgroundColor: '#fff', marginBottom: 24, paddingHorizontal: 14,
    paddingTop: 16, paddingBottom: 12,
  },
  communityHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2,
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

  // ── Magic Nudge ───────────────────────────────────────────────────────────────
  clipNudge: {
    position: 'absolute', bottom: 12, left: 16, right: 16,
    backgroundColor: '#0f172a',
    borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    flexDirection: 'row', alignItems: 'center',
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
      android: { elevation: 8 },
    }),
  },
  clipNudgeText:     { flex: 1, fontSize: 13, fontWeight: '600', color: '#fff', lineHeight: 19, marginRight: 10 },
  clipNudgeActions:  { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  clipNudgeTrackBtn: { backgroundColor: COLORS.primary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  clipNudgeTrackText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  clipNudgeClose:    { fontSize: 16, color: '#94a3b8', fontWeight: '700', lineHeight: 20 },

  // ── Dashboard Widget (Section 1) ─────────────────────────────────────────────
  dashWidget: {
    backgroundColor: '#F0F7FF',
    borderRadius: 20,
    padding: 20,
    marginHorizontal: 12,
    marginTop: 16,
    marginBottom: 12,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10 },
      android: { elevation: 2 },
    }),
  },
  dashWidgetGreeting: {
    fontSize: 22,
    fontWeight: '900',
    color: '#1E3A8A',
    marginBottom: 8,
    lineHeight: 30,
  },
  dashWidgetTracking: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3B82F6',
    opacity: 0.7,
  },

  // ── Hero Card ────────────────────────────────────────────────────────────────
  heroCard: {
    backgroundColor: '#fff', borderRadius: 14,
    overflow: 'hidden', marginBottom: 0,
    borderWidth: 1, borderColor: '#f1f5f9',
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6 },
      android: { elevation: 3 },
    }),
  },
  heroCardImageWrap: { width: '100%', height: 200, position: 'relative' },
  heroCardImage:     { width: '100%', height: '100%' },
  heroCardInfo:      { padding: 14 },
  heroCardName:      { fontSize: 16, fontWeight: '700', color: '#0f172a', lineHeight: 22, marginTop: 2, marginBottom: 4 },

  // ── Medium Card ──────────────────────────────────────────────────────────────
  mediumCard: {
    flex: 1, backgroundColor: '#fff', borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1, borderColor: '#f1f5f9',
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6 },
      android: { elevation: 3 },
    }),
  },
  mediumCardImageWrap: { width: '100%', height: 120, position: 'relative' },
  mediumCardImage:     { width: '100%', height: '100%' },
  mediumCardName:      { fontSize: 13, fontWeight: '600', color: '#0f172a', lineHeight: 18, marginTop: 2, marginBottom: 4 },

  // ── Trust Copy ───────────────────────────────────────────────────────────────
  trustCopyHero:   { fontSize: 12, fontWeight: '700', color: '#2E6FF2', lineHeight: 18 },
  trustCopyMedium: { fontSize: 11, fontWeight: '700', color: '#2E6FF2', lineHeight: 16 },

  // ── Unified Horizontal Card ───────────────────────────────────────────────────
  hCard: {
    width: 140, backgroundColor: '#fff', borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1, borderColor: '#e4e7ed',
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.09, shadowRadius: 4 },
      android: { elevation: 2 },
    }),
  },
  hCardImageWrap: {
    width: 140, height: 140, position: 'relative',
  },
  hCardImage: {
    width: 140, height: 140,
  },
  hCardRankBadge: {
    position: 'absolute', top: 8, left: 8, zIndex: 2,
    width: 26, height: 26, borderRadius: 13, // perfect circle
    alignItems: 'center', justifyContent: 'center',
  },
  hCardRankBadgeText:   { fontSize: 12, fontWeight: '900', color: '#fff' },
  hCardDiscountPill: {
    position: 'absolute', top: 6, left: 6, zIndex: 2,
    backgroundColor: '#ef4444', borderRadius: 6,
    paddingHorizontal: 7, paddingVertical: 3,
  },
  hCardDiscountPillText: { fontSize: 12, fontWeight: '900', color: '#fff' },
  hCardLowestPill: {
    alignSelf: 'flex-start', backgroundColor: '#FEF2F2', borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 4, marginBottom: 4,
  },
  hCardLowestPillText: { fontSize: 10, fontWeight: '700', color: '#EF4444' },
  hCardLowestOverlay: {
    position: 'absolute', top: 8, right: 8, zIndex: 2,
    backgroundColor: '#FEF2F2', borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  hCardTrustCopy:   { fontSize: 11, fontWeight: '700', color: '#2E6FF2', marginBottom: 4 },
  hCardMergedName:  { fontSize: 12, fontWeight: '600', color: '#0f172a', lineHeight: 17, marginTop: 4 },
  hCardBrandInline: { fontSize: 12, color: '#94a3b8', fontWeight: '600' },
  hCardBrand:     { fontSize: 10, fontWeight: '600', color: '#94a3b8' },
  hCardName:      { fontSize: 12, fontWeight: '600', color: '#0f172a', lineHeight: 16, marginTop: 1 },

  // ── Replenishment Strip (legacy fallback) ─────────────────────────────────────
  replenishCard: {
    width: 130, backgroundColor: '#fff', borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1, borderColor: '#f1f5f9',
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 4 },
      android: { elevation: 2 },
    }),
  },
  replenishThumb: {
    width: '100%', height: 90,
    alignItems: 'center', justifyContent: 'center',
  },

  // ── Category Bottom Sheet ──────────────────────────────────────────────────
  catSheetBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
  },
  catSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16,
    height: '65%', paddingHorizontal: 20, paddingBottom: 24,
  },
  catSheetHandle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB',
    alignSelf: 'center', marginTop: 10, marginBottom: 16,
  },
  catSheetTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 12 },
  catSheetRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  catSheetRowIcon:  { fontSize: 20, marginRight: 12 },
  catSheetRowLabel: { flex: 1, fontSize: 15, fontWeight: '500', color: '#1F2937' },
  catSheetRowArrow: { fontSize: 18, color: '#9CA3AF' },
});
