import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  FlatList,
  Image,
  Keyboard,
  ScrollView,
  StyleSheet,
  Pressable,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import { Info, Link } from 'lucide-react-native';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase/config';
import { logSearchQuery, searchProducts } from '../services/searchService';
import { useTracking } from '../context/TrackingContext';

// ─── AsyncStorage helpers ─────────────────────────────────────────────────────

const RECENT_KEY  = 'momdeal_recent_searches';
const MAX_RECENT  = 10;

async function loadRecent() {
  try {
    const raw = await AsyncStorage.getItem(RECENT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

async function saveRecent(queries) {
  try { await AsyncStorage.setItem(RECENT_KEY, JSON.stringify(queries)); } catch {}
}

async function addRecentQuery(q) {
  const prev = await loadRecent();
  const next = [q, ...prev.filter((s) => s !== q)].slice(0, MAX_RECENT);
  await saveRecent(next);
  return next;
}

// ─── Static mock data ─────────────────────────────────────────────────────────

// Seed shown when AsyncStorage is empty or to fill empty slots
const RECENT_SEARCHES = ['팸퍼스 기저귀', '에디슨 젖병', '아기 물티슈', '브라운 체온계'];

const TRENDING_KEYWORDS = [
  { id: 't1',  rank: 1,  keyword: '팸퍼스 기저귀 특대형',   trend: 'up'   },
  { id: 't2',  rank: 2,  keyword: '하기스 네이처메이드',     trend: 'new'  },
  { id: 't3',  rank: 3,  keyword: '에디슨 실리콘 젖병',      trend: 'up'   },
  { id: 't4',  rank: 4,  keyword: '아이클레어 아기 로션',    trend: 'down' },
  { id: 't5',  rank: 5,  keyword: '아기 안전 게이트',        trend: 'up'   },
  { id: 't6',  rank: 6,  keyword: '유아 카시트 신생아용',    trend: 'new'  },
  { id: 't7',  rank: 7,  keyword: '몬테소리 원목 장난감',    trend: 'same' },
  { id: 't8',  rank: 8,  keyword: '피죤 아기 섬유유연제',    trend: 'down' },
  { id: 't9',  rank: 9,  keyword: '비접촉 귀 체온계',        trend: 'up'   },
  { id: 't10', rank: 10, keyword: '레고 듀플로 동물원',      trend: 'down' },
];

const MOCK_SEARCH_RESULTS = [
  {
    id: 'sr1',
    productGroupId: 'sr1',
    name: '팸퍼스 하이드로케어 기저귀 특대형 5단계 88매',
    image: 'https://picsum.photos/seed/saveroo1/200/200',
    originalPrice: 46900,
    currentPrice:  31900,
    discountRate:  32,
    reviewCount:   2843,
    rating: 4.8,
    source: 'coupang',
    coupangUrl: 'https://coupa.ng/blE0dT',
  },
  {
    id: 'sr2',
    productGroupId: 'sr2',
    name: '에디슨 실리콘 젖병 240ml + 160ml 세트 신생아용',
    image: 'https://picsum.photos/seed/saveroo2/200/200',
    originalPrice: 22000,
    currentPrice:  14900,
    discountRate:  32,
    reviewCount:   1204,
    rating: 4.6,
    source: 'coupang',
    coupangUrl: 'https://coupa.ng/bkJF3s',
  },
  {
    id: 'sr3',
    productGroupId: 'sr3',
    name: '아이클레어 유기농 아기 로션 200ml 무향 민감성',
    image: 'https://picsum.photos/seed/saveroo3/200/200',
    originalPrice: 18900,
    currentPrice:  12500,
    discountRate:  34,
    reviewCount:    876,
    rating: 4.5,
    source: 'local',
    coupangUrl: 'https://coupa.ng/bmR7tY',
  },
  {
    id: 'sr4',
    productGroupId: 'sr4',
    name: '몬테소리 원목 블록 52pcs 유아 교구 장난감 세트',
    image: 'https://picsum.photos/seed/saveroo4/200/200',
    originalPrice: 35900,
    currentPrice:  23900,
    discountRate:  33,
    reviewCount:    512,
    rating: 4.7,
    source: 'coupang',
    coupangUrl: 'https://coupa.ng/bqA2mK',
  },
  {
    id: 'sr5',
    productGroupId: 'sr5',
    name: '비접촉 귀 체온계 이마 겸용 1초 측정 영유아용',
    image: 'https://picsum.photos/seed/saveroo5/200/200',
    originalPrice: 29900,
    currentPrice:  19500,
    discountRate:  35,
    reviewCount:   3201,
    rating: 4.9,
    source: 'local',
    coupangUrl: 'https://coupa.ng/brC4nL',
  },
];

const FILTER_CHIPS = [
  { id: 'peers',    label: '아이 또래 인기' },
  { id: 'discount', label: '할인율' },
  { id: 'lowest',   label: '낮은 가격순' },
];

const TOTAL_PRODUCT_COUNT = 124;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function trendMeta(trend) {
  switch (trend) {
    case 'up':   return { icon: '▴', color: '#ef4444' };
    case 'down': return { icon: '▾', color: '#3b82f6' };
    case 'new':  return { icon: '-', color: '#cbd5e1' };
    default:     return { icon: '-', color: '#cbd5e1' };
  }
}

function rankStyle(rank) {
  if (rank <= 3) return { color: '#2E6FF2', fontWeight: '900' };
  return { color: '#94a3b8', fontWeight: 'bold' };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SearchHeader({ inputRef, searchQuery, onChange, onSubmit, onClear, onBack }) {
  return (
    <SafeAreaView edges={['top']} style={styles.safeHeader}>
      <View style={styles.searchBarRow}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>

        <View style={styles.searchBar}>
          <Text style={styles.searchBarIcon}>🔍</Text>
          <TextInput
            ref={inputRef}
            style={styles.searchInput}
            placeholder="브랜드, 상품명, 카테고리로 검색"
            placeholderTextColor="#b0b8c8"
            value={searchQuery}
            onChangeText={onChange}
            onSubmitEditing={onSubmit}
            returnKeyType="search"
            autoFocus={false}
            autoCorrect={false}
            autoCapitalize="none"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={onClear} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <View style={styles.clearBtn}>
                <Text style={styles.clearBtnText}>✕</Text>
              </View>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

// ── Discovery View ────────────────────────────────────────────────────────────

function DiscoveryView({ recentList, onSelectKeyword, onDeleteRecent, onClearAll }) {
  return (
    <ScrollView
      style={styles.discoveryScroll}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {/* Section 1: 최근 검색어 */}
      {recentList.length > 0 && (
        <View style={styles.discoverySection}>
          <View style={styles.discoverySectionHeader}>
            <Text style={styles.discoverySectionTitle}>최근 검색어</Text>
            <TouchableOpacity
              onPress={onClearAll}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.clearAllText}>전체 삭제</Text>
            </TouchableOpacity>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.pillsRow}
          >
            {recentList.map((q) => (
              <TouchableOpacity
                key={q}
                style={styles.recentPill}
                onPress={() => onSelectKeyword(q)}
                onLongPress={() => onDeleteRecent(q)}
                activeOpacity={0.75}
              >
                <Text style={styles.recentPillText}>{q}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Section 2: 실시간 급상승 맘템 */}
      <View style={styles.discoverySection}>
        <View style={styles.discoverySectionHeader}>
          <Text style={styles.discoverySectionTitle}>지금 많이 찾는 검색어</Text>
        </View>
        {TRENDING_KEYWORDS.map((item) => {
          const tm = trendMeta(item.trend);
          const rs = rankStyle(item.rank);
          return (
            <TouchableOpacity
              key={item.id}
              style={styles.trendingRow}
              onPress={() => onSelectKeyword(item.keyword)}
              activeOpacity={0.7}
            >
              <Text style={[styles.trendingRank, { color: rs.color, fontWeight: rs.fontWeight }]}>
                {item.rank}
              </Text>
              <Text style={styles.trendingKeyword}>{item.keyword}</Text>
              <Text style={[styles.trendingTrendIcon, { color: tm.color }]}>{tm.icon}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// ── Community dummy posts ─────────────────────────────────────────────────────

const COMMUNITY_POSTS = [
  { id: 1, category: '질문', title: '아기방 홈카메라 안테나 방향 어떻게 두시나요?',          author: '초보맘_강남',    tier: '일반맘',  commentCount: 12, viewCount:  340, likeCount:  5, isLiked: false, createdAt: new Date() },
  { id: 2, category: '꿀팁', title: '수신율 대박인 홈카메라 외장 안테나 확장기 추천',        author: '장비병아빠',      tier: '성실맘',  commentCount: 45, viewCount: 1205, likeCount: 89, isLiked: true,  createdAt: new Date(Date.now() - 3600000) },
  { id: 3, category: '후기', title: '맘카페 국민 안테나 달아봤습니다 ㅋㅋ 신세계네요',      author: '쌍둥이맘_부산',  tier: '열심맘',  commentCount:  8, viewCount:  215, likeCount: 15, isLiked: false, createdAt: new Date(Date.now() - 86400000) },
  { id: 4, category: '핫딜', title: '홈카메라 전용 안테나 역대급 할인이요!! 당장 쟁이세요', author: '핫딜요정',        tier: '우수맘',  commentCount: 22, viewCount:  890, likeCount: 42, isLiked: false, createdAt: new Date(Date.now() - 7200000) },
];

// ── Commerce Result Card ──────────────────────────────────────────────────────

const INTEGRATED_BADGES = [
  { label: '🏆 또래인기 1위', color: '#d97706', bg: '#fef3c7' },
  { label: '📉 역대 최저가', color: '#2563eb', bg: '#dbeafe' },
  { label: '🔥 가격 급락',  color: '#dc2626', bg: '#fee2e2' },
];

// ── Community Posts — Time Decay (Gravity) Ranking ───────────────────────────

const DUMMY_COMMUNITY_POSTS = [
  { id: 'c1', board: '핫딜제보', title: '맘님들 팸퍼스 특대형 역대 최저가 떴어요! 당장 쟁이세요.', author: '익명의 세이브루맘', commentCount: 12, viewCount: 340, likeCount: 32, createdAt: new Date() },
  { id: 'c2', board: '후기',    title: '에디슨 젖병 써보신 분 후기 좀요',                          author: '절약맘_서울',       commentCount:  8, viewCount: 215, likeCount: 15, createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000) },
  { id: 'c3', board: '질문',    title: '아이클레어 로션 민감성 피부에 괜찮나요?',                    author: '두아이맘_경기',      commentCount:  5, viewCount: 178, likeCount:  9, createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000) },
  { id: 'c4', board: '꿀팁',    title: '기저귀 할인 시즌 미리 쟁여두는 꿀팁 정리',                  author: '준맘_부산',          commentCount: 20, viewCount: 510, likeCount: 41, createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000) },
  { id: 'c5', board: '후기',    title: '하기스 네이처메이드 신생아용 한 달 써본 솔직 후기',           author: '첫아이맘',           commentCount: 17, viewCount: 430, likeCount: 28, createdAt: new Date(Date.now() - 26 * 60 * 60 * 1000) },
];

const PRODUCT_MOCK = [
  { id: 'pm01', name: '팸퍼스 기저귀 신생아용 100매',       currentPrice: 29800, originalPrice: 45000, discountRate: 35, peerScore: 98 },
  { id: 'pm02', name: '하기스 네이처메이드 2단계 156매',     currentPrice: 32000, originalPrice: 48000, discountRate: 33, peerScore: 95 },
  { id: 'pm03', name: '에디슨 실리콘 젖병 240ml 세트',       currentPrice: 15000, originalPrice: 20000, discountRate: 25, peerScore: 88 },
  { id: 'pm04', name: '매일유업 앱솔루트 분유 스텝2 800g',   currentPrice: 39800, originalPrice: 62000, discountRate: 36, peerScore: 92 },
  { id: 'pm05', name: '피죤 베이비 세탁세제 3L 대용량',      currentPrice:  8900, originalPrice: 12800, discountRate: 30, peerScore: 77 },
  { id: 'pm06', name: '팸퍼스 하이드로케어 특대형 88매',     currentPrice: 30500, originalPrice: 46900, discountRate: 35, peerScore: 91 },
  { id: 'pm07', name: '하기스 맥스드라이 3단계 100매',       currentPrice: 27900, originalPrice: 39900, discountRate: 30, peerScore: 83 },
  { id: 'pm08', name: '젤리캣 바쉬풀 버니 미디엄',           currentPrice: 35900, originalPrice: 44900, discountRate: 20, peerScore: 71 },
  { id: 'pm09', name: '비즈앤젤 아기 로션 무향 400ml',       currentPrice:  7900, originalPrice: 11800, discountRate: 33, peerScore: 68 },
  { id: 'pm10', name: '스토케 트립트랩 하이체어 네츄럴',     currentPrice: 340000, originalPrice: 389000, discountRate: 13, peerScore: 55 },
  { id: 'pm11', name: '탐사 순한 기저귀 신생아 100매',       currentPrice: 15900, originalPrice: 22000, discountRate: 28, peerScore: 80 },
  { id: 'pm12', name: '브이텍 걸음마 학습기 한영버전',       currentPrice: 45000, originalPrice: 56000, discountRate: 20, peerScore: 62 },
  { id: 'pm13', name: '타이니러브 수더앤그루브 모빌',        currentPrice: 78000, originalPrice: 92000, discountRate: 15, peerScore: 59 },
  { id: 'pm14', name: '브라운 비접촉 체온계 IRT6520',        currentPrice: 49900, originalPrice: 69900, discountRate: 29, peerScore: 74 },
  { id: 'pm15', name: '피셔프라이스 바운서 신생아용',        currentPrice: 89000, originalPrice: 119000, discountRate: 25, peerScore: 66 },
  { id: 'pm16', name: '에르고베이비 오리지널 포대기',        currentPrice: 148000, originalPrice: 189000, discountRate: 22, peerScore: 70 },
  { id: 'pm17', name: '치코 내추럴필링 젖병 250ml',          currentPrice: 12900, originalPrice: 17900, discountRate: 28, peerScore: 73 },
  { id: 'pm18', name: '유피아 유모차 듀얼 라이트',           currentPrice: 299000, originalPrice: 389000, discountRate: 23, peerScore: 60 },
  { id: 'pm19', name: '아벤트 전동 유축기 싱글',             currentPrice: 89000, originalPrice: 129000, discountRate: 31, peerScore: 78 },
  { id: 'pm20', name: '닥터마틴 첫걸음마화 12cm',            currentPrice: 39900, originalPrice: 55000, discountRate: 27, peerScore: 57 },
  { id: 'pm21', name: '로코유 이유식 식판 5구',               currentPrice: 18900, originalPrice: 26000, discountRate: 27, peerScore: 65 },
  { id: 'pm22', name: '헤겐 와이드넥 젖병 세트 4개입',       currentPrice: 34900, originalPrice: 45900, discountRate: 24, peerScore: 82 },
  { id: 'pm23', name: '베이비뵨 바운서 발란스 소프트',       currentPrice: 179000, originalPrice: 229000, discountRate: 22, peerScore: 63 },
  { id: 'pm24', name: '블루래빗 토이북 전집 세트',           currentPrice: 199000, originalPrice: 299000, discountRate: 33, peerScore: 58 },
  { id: 'pm25', name: '이든앤이본 아기 침대 범퍼',           currentPrice: 39000, originalPrice: 52000, discountRate: 25, peerScore: 54 },
];

function tierMeta(tier) {
  if (tier === '일반맘') return { color: '#6B7280', label: 'Lv.1 일반맘' };
  if (tier === '성실맘') return { color: '#10B981', label: 'Lv.2 성실맘' };
  if (tier === '열심맘') return { color: '#F59E0B', label: 'Lv.3 열심맘' };
  return                        { color: '#2E6FF2', label: 'Lv.4 우수맘' };
}

function calculatePostScore(post) {
  const ageInHours = (Date.now() - post.createdAt.getTime()) / (1000 * 60 * 60);
  const baseScore  = (post.likeCount * 4) + (post.commentCount * 3) + (post.viewCount * 2);
  return baseScore / Math.pow(ageInHours + 2, 1.5);
}

function formatPostDate(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (isToday) {
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }
  const yyyy = date.getFullYear();
  const mo   = String(date.getMonth() + 1).padStart(2, '0');
  const dd   = String(date.getDate()).padStart(2, '0');
  return `${yyyy}.${mo}.${dd}`;
}

function ResultCard({ item, isTracked, onTrack, badge, navigation }) {
  const hasValidImage   = typeof item.image === 'string' && item.image.startsWith('http');
  const hasDiscount     = typeof item.discountRate === 'number' && item.discountRate > 0;
  const hasOrigPrice    = typeof item.originalPrice === 'number' && item.originalPrice > (item.currentPrice ?? 0);
  const hasCurrentPrice = typeof item.currentPrice === 'number' && item.currentPrice > 0;
  const hasReview       = typeof item.reviewCount === 'number' && item.reviewCount > 0;
  const hasRating       = typeof item.rating === 'number';

  const handleDetailPress = () => {
    navigation.navigate('Detail', { item });
  };

  const handleTrackPress = () => {
    onTrack(item);
  };

  return (
    <View style={styles.resultCard}>
      {/* Left: tappable image → detail */}
      <TouchableOpacity onPress={handleDetailPress} activeOpacity={0.85} style={styles.resultImageWrap}>
        {hasValidImage ? (
          <Image source={{ uri: item.image }} style={styles.resultImage} resizeMode="cover" />
        ) : (
          <View style={styles.resultImage} />
        )}
      </TouchableOpacity>

      {/* Right: tappable body → detail; track button is isolated */}
      <TouchableOpacity style={styles.resultBody} onPress={handleDetailPress} activeOpacity={0.85}>
        {badge && (
          <Text style={{ color: badge.color, fontSize: 11, fontWeight: 'bold', backgroundColor: badge.bg, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, alignSelf: 'flex-start', marginBottom: 4, overflow: 'hidden' }}>
            {badge.label}
          </Text>
        )}
        <Text style={styles.resultName} numberOfLines={2}>
          {item.name || '상품명 없음'}
        </Text>

        {/* RULE-9.4 Price Block */}
        <View style={{ marginTop: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
            <Text style={{ color: '#2E6FF2', fontWeight: '800', fontSize: 14, marginRight: 6 }}>
              ▼ {item.discountRate || 0}%
            </Text>
            <Text style={{ fontWeight: '800', fontSize: 16, color: '#111827' }}>
              ₩{(item.currentPrice ?? 0).toLocaleString('ko-KR')}
            </Text>
          </View>
          <Text style={{ textDecorationLine: 'line-through', color: '#94A3B8', fontSize: 12 }}>
            ₩{(item.originalPrice ?? 0).toLocaleString('ko-KR')}
          </Text>
        </View>

        {/* Review row */}
        {hasReview ? (
          <Text style={styles.reviewCount}>
            {hasRating ? `⭐ ${item.rating}  ` : ''}리뷰 {item.reviewCount.toLocaleString()}개
          </Text>
        ) : (
          <View style={styles.reviewCountPlaceholder} />
        )}
      </TouchableOpacity>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function SearchScreen({ navigation }) {
  const [searchQuery,    setSearchQuery]    = useState('');
  const [isSearching,    setIsSearching]    = useState(false);
  const [activeFilter,   setActiveFilter]   = useState('peers');
  const [showSortInfo,       setShowSortInfo]       = useState(false);
  const [activeTab,          setActiveTab]          = useState('통합');
  const [communityCategory,  setCommunityCategory]  = useState('전체');
  const [recentList,     setRecentList]     = useState(RECENT_SEARCHES);
  const [results,        setResults]        = useState([]);
  const [loading,        setLoading]        = useState(false);
  const [visibleCount,   setVisibleCount]   = useState(10);
  const { globalTrackedItems, addTrackedItem, removeTrackedItem } = useTracking();
  const [toastMessage, setToastMessage] = useState(null);

  const toastTimerRef = useRef(null);

  const showToast = useCallback((msg) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMessage(msg);
    toastTimerRef.current = setTimeout(() => setToastMessage(null), 2500);
  }, []);

  const inputRef = useRef(null);

  // Load persisted recent searches and merge with seeds
  useEffect(() => {
    loadRecent().then((stored) => {
      if (stored.length > 0) {
        setRecentList(stored);
      }
    });
    setTimeout(() => inputRef.current?.focus(), 150);
  }, []);

  // Android hardware back button — collapse results before exiting screen
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (isSearching) {
        setIsSearching(false);
        setSearchQuery('');
        Keyboard.dismiss();
        return true; // consumed — do not exit screen
      }
      return false; // let navigation handle it
    });
    return () => sub.remove();
  }, [isSearching]);

  const handleSearch = useCallback(async (q) => {
    const query = (q ?? searchQuery).trim();
    if (!query) return;

    Keyboard.dismiss();
    setIsSearching(true);
    setLoading(true);
    setResults([]);
    setActiveTab('통합');

    logSearchQuery(query);
    const updated = await addRecentQuery(query);
    setRecentList(updated);

    try {
      const found = await searchProducts(query);
      // Fall back to mock data when Firestore returns nothing (MVP / emulator)
      setResults(found.length > 0 ? found : MOCK_SEARCH_RESULTS);
    } catch {
      setResults(MOCK_SEARCH_RESULTS);
    } finally {
      setLoading(false);
    }
  }, [searchQuery]);

  const handleSelectKeyword = useCallback((q) => {
    setSearchQuery(q);
    handleSearch(q);
  }, [handleSearch]);

  const handleDeleteRecent = useCallback(async (q) => {
    const prev = await loadRecent();
    const next = prev.filter((s) => s !== q);
    await saveRecent(next);
    setRecentList(next.length > 0 ? next : RECENT_SEARCHES);
  }, []);

  const handleClearAll = useCallback(async () => {
    await saveRecent([]);
    setRecentList(RECENT_SEARCHES);
  }, []);

  const handleClearInput = useCallback(() => {
    setSearchQuery('');
    inputRef.current?.focus();
  }, []);

  const handleTrack = useCallback((item) => {
    const isTracked = globalTrackedItems.some((t) => t.productId === item.id);
    if (isTracked) {
      // Silent untrack — UI switches instantly, no alert
      removeTrackedItem(item.id);
    } else {
      addTrackedItem(item);
      showToast('최저가 알림 시작! 관심상품 탭에서 확인하세요');
      // Background-register Coupang items not yet in Firestore
      if (item.source === 'coupang' && item.coupangUrl) {
        const registerFn = httpsCallable(functions, 'registerProductFromUrl');
        registerFn({ url: item.coupangUrl }).catch(() => {});
      }
    }
  }, [globalTrackedItems, addTrackedItem, removeTrackedItem, showToast]);

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>

      {/* ── Fixed search header (SafeAreaView handles notch) ── */}
      <SearchHeader
        inputRef={inputRef}
        searchQuery={searchQuery}
        onChange={setSearchQuery}
        onSubmit={() => handleSearch()}
        onClear={handleClearInput}
        onBack={() => {
          if (isSearching) {
            setIsSearching(false);
            setSearchQuery('');
            Keyboard.dismiss();
          } else {
            navigation.goBack();
          }
        }}
      />

      {/* ── Loading ── */}
      {loading && (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#2E6FF2" />
          <Text style={styles.loadingText}>검색 중...</Text>
        </View>
      )}

      {/* ── Discovery View: isSearching === false ── */}
      {!isSearching && !loading && (
        <DiscoveryView
          recentList={recentList}
          onSelectKeyword={handleSelectKeyword}
          onDeleteRecent={handleDeleteRecent}
          onClearAll={handleClearAll}
        />
      )}

      {/* ── Results View: isSearching === true ── */}
      {isSearching && !loading && (
        <View style={styles.resultsContainer}>

          {/* 2. Tab Bar */}
          <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: '#e2e8f0' }}>
            {['통합', '상품', '커뮤니티'].map((tab) => (
              <TouchableOpacity
                key={tab}
                onPress={() => setActiveTab(tab)}
                style={{ flex: 1, paddingVertical: 10, alignItems: 'center', borderBottomWidth: activeTab === tab ? 2 : 0, borderColor: '#0f172a' }}
                activeOpacity={0.8}
              >
                <Text style={{ fontSize: 15, fontWeight: activeTab === tab ? 'bold' : 'normal', color: activeTab === tab ? '#0f172a' : '#64748b' }}>
                  {tab}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* 3. Render Content Based on Tab */}
          <View style={{ flex: 1 }}>

            {/* 통합 tab */}
            {activeTab === '통합' && (
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                {/* Product Section */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 }}>
                  <Text style={{ fontSize: 18, fontWeight: '700', color: '#0f172a' }}>상품 검색 결과 <Text style={{ color: '#2E6FF2', fontSize: 14, fontWeight: '700' }}>{TOTAL_PRODUCT_COUNT}개</Text></Text>
                  <TouchableOpacity onPress={() => setActiveTab('상품')}>
                    <Text style={{ fontSize: 14, color: '#6B7280', fontWeight: '600' }}>전체보기 ›</Text>
                  </TouchableOpacity>
                </View>
                {[
                  { id: '1', name: '팸퍼스 기저귀 신생아용 100매',     currentPrice: 29800, originalPrice: 45000, discountRate: 35 },
                  { id: '2', name: '하기스 네이처메이드 2단계 156매',   currentPrice: 32000, originalPrice: 48000, discountRate: 33 },
                  { id: '3', name: '에디슨 실리콘 젖병 240ml',          currentPrice: 15000, originalPrice: 20000, discountRate: 25 },
                ].map((item) => {
                  const nameParts   = item.name.split(' ');
                  const brand       = nameParts[0];
                  const productName = nameParts.slice(1).join(' ');
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={{ flexDirection: 'row', paddingVertical: 16, paddingHorizontal: 16, borderBottomWidth: 1, borderColor: '#F3F4F6' }}
                      activeOpacity={0.85}
                      onPress={() => navigation.navigate('Detail', { item })}
                    >
                      <View style={{ width: 80, height: 80, backgroundColor: '#F3F4F6', borderRadius: 8, marginRight: 16, flexShrink: 0 }} />
                      <View style={{ flex: 1, justifyContent: 'center' }}>
                        <Text style={{ fontSize: 14, marginBottom: 4 }} numberOfLines={2}>
                          <Text style={{ color: '#9CA3AF', fontWeight: '700' }}>[{brand}] </Text>
                          <Text style={{ color: '#111827', fontWeight: '500' }}>{productName}</Text>
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
                          <Text style={{ color: '#2E6FF2', fontWeight: '800', fontSize: 14, marginRight: 6 }}>▼ {item.discountRate}%</Text>
                          <Text style={{ fontWeight: '800', fontSize: 16, color: '#111827' }}>₩{item.currentPrice.toLocaleString('ko-KR')}</Text>
                        </View>
                        <Text style={{ textDecorationLine: 'line-through', color: '#94A3B8', fontSize: 12 }}>₩{item.originalPrice.toLocaleString('ko-KR')}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
                {TOTAL_PRODUCT_COUNT > 3 ? (
                  <TouchableOpacity
                    style={{ paddingVertical: 14, alignItems: 'center', borderBottomWidth: 1, borderColor: '#F3F4F6' }}
                    onPress={() => setActiveTab('상품')}
                    activeOpacity={0.8}
                  >
                    <Text style={{ color: '#6B7280', fontSize: 14, fontWeight: '600' }}>상품 검색 결과 {TOTAL_PRODUCT_COUNT}개 더보기 ›</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    onPress={() => navigation.navigate('관심상품')}
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f8fafc', marginHorizontal: 16, marginTop: 8, marginBottom: 0, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0' }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                      <Link size={18} color="#6B7280" style={{ marginRight: 8 }} />
                      <View>
                        <Text style={{ fontSize: 14, fontWeight: '600', color: '#1e293b' }}>원하는 상품이 없나요?</Text>
                        <Text style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>링크를 추가해 가격을 추적해보세요</Text>
                      </View>
                    </View>
                    <View style={{ backgroundColor: '#fff', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: '#cbd5e1' }}>
                      <Text style={{ fontSize: 12, color: '#2E6FF2', fontWeight: '700' }}>추가하기</Text>
                    </View>
                  </TouchableOpacity>
                )}

                {/* Section divider between products and community */}
                <View style={{ height: 8, backgroundColor: '#F3F4F6', width: '100%', marginTop: 8, marginBottom: 0 }} />

                {/* Community Section */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 20, paddingBottom: 8, marginTop: 0 }}>
                  <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#0f172a' }}>커뮤니티 인기글 <Text style={{ color: '#3b82f6', fontSize: 14, fontWeight: 'bold' }}>89건</Text></Text>
                  <TouchableOpacity onPress={() => setActiveTab('커뮤니티')} activeOpacity={0.8}>
                    <Text style={{ fontSize: 14, color: '#64748b' }}>전체보기 {'>'}</Text>
                  </TouchableOpacity>
                </View>
                {[...DUMMY_COMMUNITY_POSTS]
                  .sort((a, b) => calculatePostScore(b) - calculatePostScore(a))
                  .slice(0, 3)
                  .map((post, i, arr) => (
                    <View
                      key={post.id}
                      style={{ paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#f1f5f9', marginBottom: i === arr.length - 1 ? 16 : 0 }}
                    >
                      <Text style={{ fontSize: 12, color: '#3b82f6', fontWeight: 'bold', marginBottom: 4 }}>{post.board}</Text>
                      <Text style={{ fontSize: 15, color: '#1e293b', fontWeight: '500', marginBottom: 4, lineHeight: 22 }}>{post.title}</Text>
                      <Text style={{ fontSize: 12, color: '#94a3b8' }}>
                        {`${post.author} · 댓글 ${post.commentCount} · 조회 ${post.viewCount} · 좋아요 ${post.likeCount} · ${formatPostDate(post.createdAt)}`}
                      </Text>
                    </View>
                  ))
                }
              </ScrollView>
            )}

            {/* 상품 tab */}
            {activeTab === '상품' && (
              <View style={{ flex: 1 }}>
                {/* Filter chips */}
                <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderColor: '#F3F4F6', gap: 8 }}>
                  {FILTER_CHIPS.map((chip) => {
                    const isActive = activeFilter === chip.id;
                    return (
                      <TouchableOpacity
                        key={chip.id}
                        style={{ paddingVertical: 6, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: isActive ? '#2E6FF2' : '#e2e8f0', backgroundColor: isActive ? '#EFF6FF' : '#fff' }}
                        onPress={() => setActiveFilter(chip.id)}
                        activeOpacity={0.8}
                      >
                        <Text style={{ fontSize: 13, fontWeight: isActive ? '700' : '400', color: isActive ? '#2E6FF2' : '#475569' }}>{chip.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {/* USP Info Box — peers only */}
                {activeFilter === 'peers' && (
                  <View style={{ backgroundColor: '#EFF6FF', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 6, flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginTop: 12, marginBottom: 4 }}>
                    <Info size={14} color="#2E6FF2" style={{ marginRight: 6 }} />
                    <Text style={{ color: '#2E6FF2', fontSize: 12, fontWeight: '600', flex: 1 }}>회원님과 비슷한 육아 환경의 또래 부모님들이 많이 찾은 순서예요.</Text>
                  </View>
                )}
                {/* Count row */}
                <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 }}>
                  <Text style={{ fontSize: 13, color: '#94a3b8' }}>총 {PRODUCT_MOCK.length}개</Text>
                </View>
                <FlatList
                  data={[...PRODUCT_MOCK].sort((a, b) => {
                    if (activeFilter === 'discount') return b.discountRate - a.discountRate;
                    if (activeFilter === 'lowest')   return a.currentPrice - b.currentPrice;
                    if (activeFilter === 'peers')    return b.peerScore - a.peerScore;
                    return 0;
                  }).slice(0, visibleCount)}
                  keyExtractor={(item) => item.id}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  onEndReached={() => setVisibleCount((prev) => prev + 10)}
                  onEndReachedThreshold={0.3}
                  renderItem={({ item }) => {
                    const nameParts   = item.name.split(' ');
                    const brand       = nameParts[0];
                    const productName = nameParts.slice(1).join(' ');
                    return (
                      <TouchableOpacity
                        style={{ flexDirection: 'row', paddingVertical: 16, paddingHorizontal: 16, borderBottomWidth: 1, borderColor: '#F3F4F6' }}
                        activeOpacity={0.85}
                        onPress={() => navigation.navigate('Detail', { item })}
                      >
                        <View style={{ width: 80, height: 80, backgroundColor: '#F3F4F6', borderRadius: 8, marginRight: 16, flexShrink: 0 }} />
                        <View style={{ flex: 1, justifyContent: 'center' }}>
                          <Text style={{ fontSize: 14, marginBottom: 4 }} numberOfLines={2}>
                            <Text style={{ color: '#9CA3AF', fontWeight: '700' }}>[{brand}] </Text>
                            <Text style={{ color: '#111827', fontWeight: '500' }}>{productName}</Text>
                          </Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
                            <Text style={{ color: '#2E6FF2', fontWeight: '800', fontSize: 14, marginRight: 6 }}>▼ {item.discountRate}%</Text>
                            <Text style={{ fontWeight: '800', fontSize: 16, color: '#111827' }}>₩{item.currentPrice.toLocaleString('ko-KR')}</Text>
                          </View>
                          <Text style={{ textDecorationLine: 'line-through', color: '#94A3B8', fontSize: 12 }}>₩{item.originalPrice.toLocaleString('ko-KR')}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  }}
                  ListFooterComponent={
                    visibleCount < PRODUCT_MOCK.length
                      ? <ActivityIndicator color="#2E6FF2" style={{ paddingVertical: 20 }} />
                      : <View style={{ height: 24 }} />
                  }
                />
              </View>
            )}

            {/* 커뮤니티 tab */}
            {activeTab === '커뮤니티' && (() => {
              const filteredPosts = communityCategory === '전체'
                ? COMMUNITY_POSTS
                : COMMUNITY_POSTS.filter((p) => p.category === communityCategory);
              return (
                <View style={{ flex: 1, backgroundColor: '#fff' }}>

                  {/* Horizontal Categories */}
                  <View style={{ paddingVertical: 12, borderBottomWidth: 1, borderColor: '#f1f5f9' }}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16 }}>
                      {['전체', '질문', '꿀팁', '핫딜', '후기', '자유'].map((cat) => {
                        const isActive = communityCategory === cat;
                        return (
                          <TouchableOpacity
                            key={cat}
                            style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: isActive ? '#0f172a' : '#e2e8f0', backgroundColor: isActive ? '#0f172a' : '#fff', marginRight: 8 }}
                            activeOpacity={0.8}
                            onPress={() => setCommunityCategory(cat)}
                          >
                            <Text style={{ color: isActive ? '#fff' : '#64748b', fontWeight: isActive ? 'bold' : 'normal', fontSize: 14 }}>
                              {cat}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>

                  {filteredPosts.length === 0 ? (
                    <View style={{ flex: 1, alignItems: 'center', marginTop: 80 }}>
                      <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#1e293b' }}>
                        해당 키워드에 대한 게시글이 없습니다.
                      </Text>
                      <Text style={{ fontSize: 14, color: '#94a3b8', marginTop: 8 }}>
                        다른 키워드로 검색하거나 직접 질문을 남겨보세요.
                      </Text>
                      <TouchableOpacity
                        style={{ marginTop: 24, paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8, borderWidth: 1, borderColor: '#3b82f6' }}
                        activeOpacity={0.85}
                        onPress={() => { try { navigation.navigate('CommunityWrite'); } catch (_) {} }}
                      >
                        <Text style={{ color: '#3b82f6', fontWeight: 'bold' }}>+ 새 글 작성하기</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <FlatList
                      data={filteredPosts}
                      keyExtractor={(item) => String(item.id)}
                      showsVerticalScrollIndicator={false}
                      keyboardShouldPersistTaps="handled"
                      renderItem={({ item }) => (
                        <TouchableOpacity
                          activeOpacity={0.85}
                          onPress={() => { try { navigation.navigate('CommunityPost', { postId: item.id }); } catch (_) {} }}
                          style={{ paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }}
                        >
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            {/* Left column */}
                            <View style={{ flex: 1, paddingRight: 12 }}>
                              {communityCategory === '전체' && (
                                <View style={{ alignSelf: 'flex-start', backgroundColor: '#F3F4F6', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, marginBottom: 4 }}>
                                  <Text style={{ fontSize: 11, fontWeight: '600', color: '#4B5563' }}>{item.category}</Text>
                                </View>
                              )}
                              <Text style={{ fontSize: 15, fontWeight: '600', color: '#1e293b', lineHeight: 22 }} numberOfLines={2}>{item.title}</Text>
                              <Text style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                                <Text style={{ fontWeight: '700', color: tierMeta(item.tier).color }}>{tierMeta(item.tier).label}</Text>
                                {' '}
                                <Text style={{ color: '#6B7280' }}>{item.author}</Text>
                                {` · ${formatPostDate(item.createdAt)} · 조회 ${item.viewCount}`}
                              </Text>
                            </View>
                            {/* Right column — engagement box */}
                            <View style={{ backgroundColor: '#f1f5f9', borderRadius: 8, padding: 8, alignItems: 'center', minWidth: 50 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <FontAwesome5 name="comment" size={11} color="#475569" />
                                <Text style={{ fontSize: 12, color: '#475569', marginLeft: 4 }}>{item.commentCount}</Text>
                              </View>
                              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                                <FontAwesome5 name="heart" size={11} color="#ef4444" />
                                <Text style={{ fontSize: 12, color: '#ef4444', marginLeft: 4 }}>{item.likeCount}</Text>
                              </View>
                            </View>
                          </View>
                        </TouchableOpacity>
                      )}
                    />
                  )}

                </View>
              );
            })()}

          </View>
        </View>
      )}

      {/* ── Toast notification ── */}
      {toastMessage && (
        <View style={styles.toastContainer}>
          <Text style={styles.toastText}>{toastMessage}</Text>
        </View>
      )}


    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },

  // ── Search header ──
  safeHeader: { backgroundColor: '#fff' },
  searchBarRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 6, gap: 8,
  },
  backBtn: { padding: 10 },
  backIcon: { fontSize: 28, color: '#334155', lineHeight: 32, fontWeight: '300' },
  searchBar: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#f1f5f9', borderRadius: 12,
    paddingHorizontal: 12, height: 44, gap: 6,
  },
  searchBarIcon: { fontSize: 15 },
  searchInput:   { flex: 1, fontSize: 15, color: '#0f172a', padding: 0 },
  clearBtn: {
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: '#cbd5e1',
    alignItems: 'center', justifyContent: 'center',
  },
  clearBtnText: { fontSize: 9, color: '#fff', fontWeight: '900', lineHeight: 11 },

  // ── Discovery ──
  discoveryScroll: { flex: 1 },
  discoverySection: { paddingTop: 22, paddingBottom: 4 },
  discoverySectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, marginBottom: 12,
  },
  discoverySectionTitle: { fontSize: 15, fontWeight: 'bold', color: '#1e293b' },
  updateMeta:   { fontSize: 11, color: '#94a3b8' },
  clearAllText: { fontSize: 12, color: '#94a3b8', fontWeight: '600' },

  // Recent pills
  pillsRow: { paddingHorizontal: 16, gap: 8 },
  recentPill: {
    borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    paddingHorizontal: 12, paddingVertical: 6,
  },
  recentPillText: { fontSize: 13, color: '#475569' },

  // Trending rows
  trendingRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f8fafc',
  },
  trendingRank:      { fontSize: 14, fontWeight: 'bold', width: 28 },
  trendingKeyword:   { flex: 1, fontSize: 14, color: '#1e293b', marginLeft: 12 },
  trendingTrendIcon: { fontSize: 16, width: 24, textAlign: 'right' },

  // ── Results ──
  resultsContainer: { flex: 1 },
  filterRow: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 16, gap: 4,
    borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  filterTab:           { paddingHorizontal: 8, paddingTop: 10, paddingBottom: 8, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  filterTabActive:     { borderBottomColor: '#3b82f6' },
  filterTabText:       { fontSize: 14, fontWeight: '400', color: '#64748b' },
  filterTabTextActive: { fontWeight: 'bold', color: '#3b82f6' },
  filterSep:           { fontSize: 13, color: '#e2e8f0', paddingHorizontal: 2 },

  resultCount: {
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 2,
    fontSize: 15, fontWeight: '700', color: '#1e293b',
  },
  listContent: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 40 },

  // Commerce card
  resultCard: {
    flexDirection: 'row', gap: 12,
    paddingVertical: 10, marginBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f1f5f9',
  },
  resultImageWrap: { width: 65, height: 65, position: 'relative', flexShrink: 0 },
  resultImage: {
    width: 65, height: 65,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
  },
  resultImagePlaceholder: { justifyContent: 'center', alignItems: 'center' },

  resultBody: { flex: 1, justifyContent: 'center' },
  resultName: {
    fontSize: 14, fontWeight: '500', color: '#1e293b',
    lineHeight: 20, marginBottom: 4,
  },

  priceRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: 5, flexWrap: 'wrap', marginBottom: 4,
  },
  origPrice: {
    fontSize: 12, color: '#94a3b8',
    textDecorationLine: 'line-through',
  },
  currentPrice: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  discountTag: {
    backgroundColor: '#fef2f2', borderRadius: 4,
    paddingHorizontal: 5, paddingVertical: 1,
  },
  discountTagText: { fontSize: 11, fontWeight: '800', color: '#ef4444' },

  reviewCount: { fontSize: 11, color: '#94a3b8', marginBottom: 4 },
  reviewCountPlaceholder: { height: 16, marginBottom: 8 }, // same height as reviewCount line

  trackBtn: {
    alignSelf: 'flex-start',
    backgroundColor: '#eff6ff', borderRadius: 8,
    paddingHorizontal: 6, paddingVertical: 2,
    borderWidth: 1, borderColor: '#bfdbfe',
  },
  trackBtnTracked:     { backgroundColor: '#f1f5f9', borderColor: '#e2e8f0' },
  trackBtnText:        { fontSize: 12, fontWeight: '700', color: '#1d4ed8' },
  trackBtnTextTracked: { color: '#94a3b8' },

  // ── Loading ──
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, fontSize: 14, color: '#94a3b8' },

  // ── Toast ──
  toastContainer: {
    position: 'absolute', bottom: 40, alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingHorizontal: 20, paddingVertical: 10, borderRadius: 24,
    zIndex: 999,
  },
  toastText: { color: '#fff', fontSize: 14, fontWeight: '600' },

  // ── Empty state ──
  emptyState: { alignItems: 'center', paddingTop: 80 },
  emptyStateIcon: { fontSize: 44, marginBottom: 12 },
  emptyStateText: { fontSize: 16, fontWeight: '700', color: '#334155', marginBottom: 6 },
  emptyStateSub:  { fontSize: 13, color: '#94a3b8' },
});
