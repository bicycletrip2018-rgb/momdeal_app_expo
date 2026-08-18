import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { DeepLinkContext } from '../contexts/DeepLinkContext';
import { useNotification } from '../context/NotificationContext';
import { useTutorial } from '../context/TutorialContext';
import { Package, Tag, Flame, Trophy, MessageCircle, Sparkles, LayoutGrid, Clock, Heart, ShoppingCart, Smartphone, Activity, Home, TrendingDown, ChevronRight, Wallet, Users } from 'lucide-react-native';
import {
  ActivityIndicator,
  Dimensions,
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
import AsyncStorage from '@react-native-async-storage/async-storage';
import GlobalHeader from '../components/GlobalHeader';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../firebase/config';
import { recordProductAction } from '../services/productActionService';
import { scrapeRealCoupangImage } from '../utils/scrapeProductImage';
import { fetchGoldboxDeals, fetchBestCategoryProducts, fetchPersonalizedDeals, fetchBabyBestDeals } from '../services/coupangApiService';
import { getPosts } from '../services/communityService';
import { COLORS } from '../constants/theme';
import { useTracking } from '../context/TrackingContext';
import { useUser } from '../context/UserContext';
import { getEffectivePrice } from '../utils/priceDisplay';

// ─── Constants ────────────────────────────────────────────────────────────────

const CARD_WIDTH    = 140;
const CARD_GAP      = 8;
const SNAP_INTERVAL = CARD_WIDTH + CARD_GAP;

const HOME_TUTORIAL_KEY = '@has_seen_home_tutorial';

const POST_CATEGORY_LABEL = { question: '질문', tip: '꿀팁', deal: '특가', free: '자유' };

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

// ─── Timer hooks ─────────────────────────────────────────────────────────────

function useCountdownTo7AM() {
  const getSecsTo7AM = () => {
    const now = new Date();
    const next7am = new Date(now);
    next7am.setHours(7, 0, 0, 0);
    if (now >= next7am) next7am.setDate(next7am.getDate() + 1);
    return Math.max(0, Math.floor((next7am - now) / 1000));
  };
  const [secs, setSecs] = useState(getSecsTo7AM);
  useEffect(() => {
    const id = setInterval(() => setSecs(getSecsTo7AM()), 1000);
    return () => clearInterval(id);
  }, []);
  const h = String(Math.floor(secs / 3600)).padStart(2, '0');
  const m = String(Math.floor((secs % 3600) / 60)).padStart(2, '0');
  const s = String(secs % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

// ─── Birth Check Banner (pregnancy → born transition nudge) ──────────────────

function BirthCheckBanner({ child, onConfirm, onSnooze }) {
  const label = child?.firstName || child?.name || '아이';
  return (
    <View style={styles.birthCheckWrap}>
      <View style={styles.birthCheckCard}>
        <Text style={styles.birthCheckEmoji}>🎉</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.birthCheckTitle}>{label}가 태어났나요?</Text>
          <Text style={styles.birthCheckSub}>축하드려요! 정보를 업데이트하고 신생아 맞춤 혜택을 받아보세요.</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            <TouchableOpacity style={styles.birthCheckSnoozeBtn} onPress={onSnooze} activeOpacity={0.8}>
              <Text style={styles.birthCheckSnoozeBtnText}>아직이에요</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.birthCheckConfirmBtn} onPress={onConfirm} activeOpacity={0.85}>
              <Text style={styles.birthCheckConfirmBtnText}>정보 업데이트</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

// ─── Smart 3-Priority Action Banner ──────────────────────────────────────────

function SmartActionBanner({ child, trackedItems = [], navigation }) {
  const [debugState, setDebugState] = useState(null);

  const qualifiedDrop = trackedItems.find((it) => {
    const avg = it.averagePrice ?? it.originalPrice ?? null;
    if (avg == null || it.currentPrice == null) return false;
    const drop = avg - it.currentPrice;
    const rate = avg > 0 ? drop / avg : 0;
    return drop >= 2000 || rate >= 0.05;
  });
  const totalSaved = trackedItems.reduce((sum, it) => {
    const s = (it.originalPrice ?? 0) - (it.currentPrice ?? 0);
    return sum + (s > 0 ? s : 0);
  }, 0);

  let autoPriority = 'nudge';
  if (qualifiedDrop)       autoPriority = 'price_drop';
  else if (totalSaved > 0) autoPriority = 'savings';

  const priority  = debugState ?? autoPriority;
  const ageMonth  = child?.ageMonth ?? 7;
  const rawEnv    = Array.isArray(child?.parentingEnv) ? child.parentingEnv[0] : (child?.parentingEnv ?? '');
  const envLabel  = (rawEnv && rawEnv !== '기타') ? rawEnv : '';
  const dropName  = qualifiedDrop?.name ?? '다이치 카시트';
  const dropAmt   = qualifiedDrop
    ? Math.round((qualifiedDrop.averagePrice ?? qualifiedDrop.originalPrice ?? 0) - (qualifiedDrop.currentPrice ?? 0))
    : 45000;
  const savedAmt  = totalSaved > 0 ? totalSaved : 12500;

  const amtStr  = dropAmt.toLocaleString('ko-KR');
  const savStr  = savedAmt.toLocaleString('ko-KR');

  return (
    <View style={styles.smartBannerWrap}>
      <TouchableOpacity
        style={[styles.smartBannerCard, { borderLeftColor: priority === 'price_drop' ? '#EF4444' : '#2E6FF2' }]}
        activeOpacity={0.9}
        onPress={
          priority === 'price_drop' || priority === 'savings'
            ? () => navigation.navigate('관심상품')
            : () => navigation.navigate('랭킹')
        }
      >
        <View style={[styles.smartBannerIconWrap, { backgroundColor: priority === 'price_drop' ? '#FEF2F2' : '#EFF6FF' }]}>
          {priority === 'price_drop'
            ? <TrendingDown size={20} color="#EF4444" strokeWidth={2} />
            : priority === 'savings'
              ? <Wallet size={20} color="#2E6FF2" strokeWidth={2} />
              : <Users size={20} color="#2E6FF2" strokeWidth={2} />
          }
        </View>
        <View style={styles.smartBannerBody}>
          {priority === 'price_drop' ? (
            <>
              <Text style={styles.smartBannerContext} numberOfLines={1} ellipsizeMode="tail">
                {'내 관심상품 중 '}
                <Text style={{ fontWeight: '800', color: '#0F172A' }}>'{dropName}'</Text>
              </Text>
              <Text style={styles.smartBannerAction} numberOfLines={1} ellipsizeMode="tail">
                {'어제보다 '}
                <Text style={{ color: '#EF4444' }}>{amtStr}원</Text>
                {' 더 떨어졌어요!'}
              </Text>
            </>
          ) : priority === 'savings' ? (
            <>
              <Text style={styles.smartBannerContext} numberOfLines={1} ellipsizeMode="tail">
                세이브루 관심상품 가격 추적으로
              </Text>
              <Text style={styles.smartBannerAction} numberOfLines={1} ellipsizeMode="tail">
                {'지금 당장 아낄 수 있는 돈 총 '}
                <Text style={{ color: '#2E6FF2' }}>{savStr}원!</Text>
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.smartBannerContext} numberOfLines={1} ellipsizeMode="tail">
                {envLabel ? `생후 ${ageMonth}개월 ${envLabel} 부모들이 저장해둔` : `생후 ${ageMonth}개월 부모들이 저장해둔`}
              </Text>
              <Text style={styles.smartBannerAction} numberOfLines={1} ellipsizeMode="tail">
                필수 아이템 훔쳐보기
              </Text>
            </>
          )}
        </View>
        <ChevronRight size={20} color="#CBD5E1" strokeWidth={2.5} style={{ marginRight: 2 }} />
      </TouchableOpacity>
      {__DEV__ && (
        <View style={styles.debugRow}>
          {[['1','nudge'],['2','price_drop'],['3','savings']].map(([num, key]) => (
            <TouchableOpacity
              key={key}
              style={[styles.debugBtn, debugState === key && styles.debugBtnActive]}
              onPress={() => setDebugState(debugState === key ? null : key)}
            >
              <Text style={[styles.debugBtnText, debugState === key && { color: '#2E6FF2', fontWeight: '700' }]}>
                [{num}]
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

// ─── Section 2: Fixed Quick Menus ────────────────────────────────────────────

const FIXED_MENUS = [
  { Icon: Flame,         label: '오늘의 특가',  nav: (n)          => n.navigate('CurationDetail', { type: 'goldbox', title: '오늘의 특가' }) },
  { Icon: Trophy,        label: '맞춤 랭킹',   nav: (n)          => n.navigate('랭킹') },
  { Icon: MessageCircle, label: '실시간 맘톡', nav: (n)          => n.navigate('커뮤니티') },
  { Icon: Sparkles,      label: '맞춤 추천',   nav: (n, _o, stage) => n.navigate('CurationDetail', { type: 'personalized', title: '맞춤 추천', stage }) },
  { Icon: LayoutGrid,    label: '전체보기',    nav: (n, open)    => open(true) },
];

function Section2QuickMenus({ navigation, onOpenCategorySheet, childStage }) {
  return (
    <View style={styles.shortcutSection}>
      {FIXED_MENUS.map((m) => (
        <TouchableOpacity
          key={m.label}
          style={styles.shortcutItem}
          activeOpacity={0.75}
          onPress={() => { try { m.nav(navigation, onOpenCategorySheet, childStage); } catch (_) {} }}
        >
          <View style={styles.shortcutCircle}>
            <m.Icon size={22} color="#2E6FF2" strokeWidth={2} />
          </View>
          <Text style={styles.shortcutLabel} numberOfLines={1}>{m.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ─── 10c. Unified Horizontal Card (Ranking / Goldbox / Replenishment) ─────────

const RANK_COLORS = ['#FFB800', '#94A3B8', '#CD7F32', '#0F172A', '#0F172A'];

const normalizeImg = (img) => {
  if (!img) return null;
  let s = String(img).trim();
  if (s.startsWith('//')) s = 'https:' + s;
  return s.replace('http://', 'https://');
};

// ─── Section 5: Context-to-Commerce Community Highlights ─────────────────────

function Section5CommunityHighlights({ posts, loading, navigation }) {
  return (
    <View style={styles.communitySection}>
      <View style={styles.communityHeader}>
        <Text style={styles.secTitle}>지금 뜨는 맘톡</Text>
        <TouchableOpacity onPress={() => navigation.navigate('커뮤니티')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.secViewAll}>더보기 ›</Text>
        </TouchableOpacity>
      </View>
      <Text style={{ fontSize: 13, color: '#6B7280', marginTop: 0 }}>지금 또래 엄마들은 무슨 이야기를 하고 있을까요?</Text>
      <View style={{ height: 1, backgroundColor: '#E5E7EB', marginTop: 8, marginBottom: 4 }} />

      {loading ? (
        <ActivityIndicator size="small" color="#2E6FF2" style={{ marginVertical: 16 }} />
      ) : posts.length === 0 ? (
        <Text style={{ fontSize: 13, color: '#94A3B8', textAlign: 'center', paddingVertical: 16 }}>
          아직 등록된 글이 없어요. 첫 글을 남겨보세요!
        </Text>
      ) : (
        posts.map((post) => {
          const imageUrl = post.imageUrls?.[0] ?? null;
          const imageCount = post.imageUrls?.length ?? 0;
          const createdDate = post.createdAt?.toDate ? post.createdAt.toDate() : null;
          return (
            <TouchableOpacity
              key={post.postId}
              style={{ paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' }}
              activeOpacity={0.75}
              onPress={() => navigation.navigate('PostDetail', { postId: post.postId, title: POST_CATEGORY_LABEL[post.category] ?? '게시글' })}
            >
              <View style={{ flexDirection: 'row' }}>
                <View style={{ flex: 1, justifyContent: 'flex-start', marginRight: imageUrl ? 12 : 0 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 4 }} numberOfLines={1}>
                    {post.title} <Text style={{ color: '#2E6FF2', fontSize: 13, fontWeight: '500', marginLeft: 4 }}>({post.commentCount ?? 0})</Text>
                  </Text>
                  <Text style={{ fontSize: 13, color: '#6B7280', marginBottom: 8 }} numberOfLines={1}>{post.content}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
                    <View style={{ backgroundColor: '#F3F4F6', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1, marginRight: 6 }}>
                      <Text style={{ fontSize: 11, color: '#4B5563' }}>{POST_CATEGORY_LABEL[post.category] ?? post.category}</Text>
                    </View>
                    <Text style={{ color: '#9CA3AF', fontSize: 11 }}>{post.nickname}</Text>
                    <Text style={{ color: '#D1D5DB', marginHorizontal: 4 }}>·</Text>
                    <Text style={{ color: '#9CA3AF', fontSize: 11 }}>
                      좋아요 {post.likeCount ?? 0}{createdDate ? ` · ${formatRelativeTime(createdDate)}` : ''}
                    </Text>
                  </View>
                </View>
                {imageUrl && (
                  <View style={{ position: 'relative' }}>
                    <Image source={{ uri: imageUrl }} style={{ width: 64, height: 64, borderRadius: 8, backgroundColor: '#F3F4F6' }} />
                    {imageCount > 1 && (
                      <View style={{ position: 'absolute', bottom: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 4, paddingVertical: 2, borderRadius: 4 }}>
                        <Text style={{ color: '#FFF', fontSize: 10, fontWeight: '700' }}>+{imageCount - 1}</Text>
                      </View>
                    )}
                  </View>
                )}
              </View>
            </TouchableOpacity>
          );
        })
      )}
    </View>
  );
}

function HorizontalCard({ item, index, navigation, showRank = false, onPress }) {
  const [imgErr, setImgErr] = useState(false);
  const [scrapedImg, setScrapedImg] = useState(null);

  const handlePress = onPress ?? (() => {
    const pid = item.productGroupId || item.id;
    if (pid) {
      recordProductAction({ userId: auth.currentUser?.uid, productId: pid, productGroupId: pid, actionType: 'click' });
    }
    navigation.navigate('Detail', { item });
  });
  const { isWowMember } = useUser();
  const origPrice    = item.originalPrice ?? null;
  const effectivePrice = getEffectivePrice(item, isWowMember);
  const currentPrice = effectivePrice.price ?? 0;
  const isWow         = effectivePrice.isWow;
  const apiDiscount  = item.discountRate ?? item.discount ?? null;
  const calcDiscount = (origPrice != null && origPrice > currentPrice)
    ? Math.round(((origPrice - currentPrice) / origPrice) * 100) : null;
  const discount         = apiDiscount ?? calcDiscount;
  const hasFullPriceInfo = discount != null && origPrice != null;
  const rawImgUri = normalizeImg(
    item.productImage || item.image || item.imageUrl ||
    item.thumbnail || item.thumbnailUrl ||
    item.productDetails?.imageUrl || item.vendorItem?.imageUrl || null
  );
  const imgUri = rawImgUri || scrapedImg;

  useEffect(() => {
    if (rawImgUri) return;
    const url = item.productUrl || item.coupangUrl || item.url || null;
    if (!url) return;
    scrapeRealCoupangImage(url).then((img) => { if (img) setScrapedImg(img); });
  }, [rawImgUri, item.productUrl, item.coupangUrl, item.url]);

  return (
    <TouchableOpacity style={styles.hCard} activeOpacity={0.88} onPress={handlePress}>
      <View style={styles.hCardImageWrap}>
        {imgUri && !imgErr ? (
          <Image
              source={{ uri: imgUri }}
              style={styles.hCardImage}
              resizeMode="cover"
              onError={() => setImgErr(true)}
            />
        ) : (
          <View style={[styles.hCardImage, { backgroundColor: '#F1F5F9', borderRadius: 8, justifyContent: 'center', alignItems: 'center' }]}>
            <Package size={28} color="#94A3B8" strokeWidth={1.5} />
          </View>
        )}
        {index != null && (
          <View style={[styles.hCardRankBadge, { backgroundColor: RANK_COLORS[Math.min(index, 4)] }]}>
            <Text style={styles.hCardRankBadgeText}>{index + 1}</Text>
          </View>
        )}
        {showRank && index === 0 && (
          <View style={{ position: 'absolute', top: 8, right: 8, zIndex: 999, backgroundColor: '#EF4444', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
            <Text style={{ fontSize: 10, fontWeight: '700', color: '#fff' }}>최저가</Text>
          </View>
        )}
        {!showRank && hasFullPriceInfo && (
          <View style={styles.hCardDiscountPill}>
            <Text style={styles.hCardDiscountPillText}>-{discount}%</Text>
          </View>
        )}
      </View>
      <View style={{ padding: 8 }}>
        <Text numberOfLines={2} ellipsizeMode="tail" style={{ fontSize: 13, color: '#0F172A', lineHeight: 18, marginBottom: 5 }}>
          {item.brand ? <Text style={{ color: '#94A3B8', fontWeight: 'bold' }}>[{item.brand}] </Text> : null}
          {item.name || '이름 없음'}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap' }}>
          {discount != null && (
            <Text style={{ fontSize: 16, color: '#EF4444', fontWeight: '900', marginRight: 4 }}>{discount}%</Text>
          )}
          <Text style={{ fontSize: 16, color: '#0F172A', fontWeight: '800' }} numberOfLines={1}>
            {isWow && (
              <Text style={{ fontSize: 11, fontWeight: '800', color: '#fff', backgroundColor: '#2E6FF2', borderRadius: 3 }}> WOW </Text>
            )}
            {' '}₩{currentPrice.toLocaleString('ko-KR')}
          </Text>
          {origPrice != null && (
            <Text style={{ fontSize: 11, color: '#94A3B8', textDecorationLine: 'line-through', marginLeft: 4 }}>
              ₩{origPrice.toLocaleString('ko-KR')}
            </Text>
          )}
        </View>
        {item.isRocket && (
          <View style={{ marginTop: 4 }}>
            <Text style={{ fontSize: 11, color: '#2E6FF2', fontWeight: '700' }}>🚀 로켓배송</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
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
  const insets = useSafeAreaInsets();
  const { unreadCount } = useNotification();
  const { setDeepLinkIntent } = useContext(DeepLinkContext);
  const { globalTrackedItems } = useTracking();
  const { setTutorialActive } = useTutorial();
  const [child,            setChild]            = useState(null);
  const [childLoading,     setChildLoading]     = useState(true);
  const [curation,         setCuration]         = useState([]);
  const [curationLoading,  setCurationLoading]  = useState(true);
  const [goldboxAllDeals,  setGoldboxAllDeals]  = useState([]);
  const [peerDeals,        setPeerDeals]        = useState([]);
  const [babyDeals,        setBabyDeals]        = useState([]);
  const [dealsLoading,     setDealsLoading]     = useState(true);
  const [refreshing,       setRefreshing]       = useState(false);
  const goldboxCountdown  = useCountdownTo7AM();
  const fetchingRef       = useRef(false);
  const currentUserRef    = useRef(null);

  // Coach mark tour (0 = hidden)
  const [tutorialStep,  setTutorialStep]  = useState(0);
  useEffect(() => { setTutorialActive(tutorialStep > 0); }, [tutorialStep, setTutorialActive]);

  const [isCategorySheetVisible, setCategorySheetVisible] = useState(false);
  const [communityPosts,  setCommunityPosts]  = useState([]);
  const [communityLoading, setCommunityLoading] = useState(true);
  const [birthCheckSnoozedUntil, setBirthCheckSnoozedUntil] = useState(0);

  // Start coach mark tour only the first time a user reaches Home — otherwise
  // it replays on every cold app restart.
  useEffect(() => {
    AsyncStorage.getItem(HOME_TUTORIAL_KEY).then((val) => {
      if (!val) setTutorialStep(1);
    }).catch(() => {});
  }, []);

  const dismissTutorial = useCallback(() => {
    setTutorialStep(0);
    AsyncStorage.setItem(HOME_TUTORIAL_KEY, 'true').catch(() => {});
  }, []);

  // Clipboard detection handled globally by GlobalMagicNudge in App.js

  // Auth + initial child load
  useEffect(() => {
    setChildLoading(true);
    const unsub = onAuthStateChanged(auth, async (user) => {
      currentUserRef.current = user ?? null;
      if (!user) { setChild(null); setChildLoading(false); return; }
      try {
        const snap = await getDocs(query(collection(db, 'children'), where('userId', '==', user.uid)));
        if (snap.docs[0]) setChild({ id: snap.docs[0].id, ...snap.docs[0].data() });
      } catch { /* non-blocking */ }
      finally { setChildLoading(false); }
    });
    return () => unsub();
  }, []);

  // Re-fetch child on focus so MyPage age/profile changes are reflected immediately
  useFocusEffect(useCallback(() => {
    const user = currentUserRef.current;
    if (!user) return;
    getDocs(query(collection(db, 'children'), where('userId', '==', user.uid)))
      .then((snap) => { if (snap.docs[0]) setChild({ id: snap.docs[0].id, ...snap.docs[0].data() }); })
      .catch(() => {});
  }, []));

  // "출산하셨나요?" nudge — see SAVEROO_ALGORITHM_SPEC.md §5.3/§7. A `pregnancy`
  // child whose dueDate has passed almost certainly means the baby arrived and
  // the profile is now stale (wrong stage → wrong matching/recommendations).
  // Snooze is per-child and stored locally; re-prompts after 14 days since
  // nearly all pregnancies do eventually convert to a birth.
  useEffect(() => {
    if (!child?.id) return;
    AsyncStorage.getItem(`@birth_check_snoozed_${child.id}`)
      .then((val) => setBirthCheckSnoozedUntil(val ? Number(val) : 0))
      .catch(() => {});
  }, [child?.id]);

  const dueDateMs = child?.dueDate?.toDate ? child.dueDate.toDate().getTime() : (child?.dueDate ? new Date(child.dueDate).getTime() : null);
  const birthCheckDue = Boolean(
    child?.type === 'pregnancy' && dueDateMs && dueDateMs <= Date.now() && Date.now() >= birthCheckSnoozedUntil
  );

  const snoozeBirthCheck = useCallback(() => {
    if (!child?.id) return;
    const until = Date.now() + 14 * 24 * 60 * 60 * 1000;
    setBirthCheckSnoozedUntil(until);
    AsyncStorage.setItem(`@birth_check_snoozed_${child.id}`, String(until)).catch(() => {});
  }, [child?.id]);

  const confirmBirth = useCallback(() => {
    if (!child) return;
    navigation.navigate('ChildAdd', {
      childId: child.id,
      child: {
        ...child,
        birthDate: null,
        dueDate: child.dueDate?.toDate?.()?.toISOString?.() ?? child.dueDate ?? null,
      },
    });
  }, [child, navigation]);

  const loadCuration = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setCurationLoading(true);
    try {
      const data = await fetchPersonalizedDeals(child);
      if (data && data.length > 0) {
        setCuration(data.slice(0, 10));
      } else {
        const fallback = await fetchBabyBestDeals(10).catch(() => []);
        setCuration(fallback.slice(0, 10));
      }
    } catch {
      try {
        const fallback = await fetchBabyBestDeals(10).catch(() => []);
        setCuration(fallback.slice(0, 10));
      } catch {
        setCuration([]);
      }
    } finally {
      setCurationLoading(false);
      fetchingRef.current = false;
    }
  }, [child]);

  useEffect(() => { loadCuration(); }, [loadCuration]);

  const loadDeals = useCallback(async () => {
    setDealsLoading(true);
    try {
      const [goldbox, peer, baby] = await Promise.all([
        fetchGoldboxDeals().catch(() => []),
        fetchBestCategoryProducts(1014, 10).catch(() => []),
        fetchBabyBestDeals(10).catch(() => []),
      ]);
      setGoldboxAllDeals(goldbox);
      setPeerDeals(peer);
      setBabyDeals(baby);
    } finally {
      setDealsLoading(false);
    }
  }, []);

  useEffect(() => { loadDeals(); }, [loadDeals]);

  const loadCommunityPosts = useCallback(async () => {
    setCommunityLoading(true);
    try {
      const posts = await getPosts(null, 3);
      setCommunityPosts(posts);
    } catch {
      setCommunityPosts([]);
    } finally {
      setCommunityLoading(false);
    }
  }, []);

  useEffect(() => { loadCommunityPosts(); }, [loadCommunityPosts]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadCuration(), loadDeals(), loadCommunityPosts()]);
    setRefreshing(false);
  }, [loadCuration, loadDeals, loadCommunityPosts]);

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
        {/* ── 출산 확인 넛지 (임신 dueDate 경과 시) ── */}
        {birthCheckDue && (
          <BirthCheckBanner child={child} onConfirm={confirmBirth} onSnooze={snoozeBirthCheck} />
        )}

        {/* ── Section 1: Smart Action Banner ── */}
        <SmartActionBanner
          child={child}
          trackedItems={globalTrackedItems}
          navigation={navigation}
        />

        {/* ── Section 2: Fixed Quick Menus ── */}
        <Section2QuickMenus navigation={navigation} onOpenCategorySheet={setCategorySheetVisible} childStage={child?.stage} />
        <View style={styles.sectionDivider} />

        {/* ── Section 3: 맞춤 특가 (동적 타이틀) ── */}
        <View style={styles.section}>
          <View style={styles.secHeader}>
            <View style={styles.secHeaderTop}>
              <Text style={styles.secTitle}>
                {child ? '내 아이 맞춤 특가 상품' : '출산 맞춤 특가 상품'}
              </Text>
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
            <Text style={styles.secSub}>
              {child
                ? '내 아이와 유사 환경의 부모가 자주 찾는 특가 상품'
                : '출산을 준비하는 부모가 자주 찾는 특가 상품'}
            </Text>
          </View>
          {curationLoading ? (
            <View style={styles.curationLoading}>
              <ActivityIndicator size="small" color="#2E6FF2" />
              <Text style={styles.curationLoadingText}>불러오는 중...</Text>
            </View>
          ) : curation.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 24 }}>
              <Text style={[styles.emptyText, { color: '#94A3B8' }]}>데이터 준비중</Text>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
              {curation.slice(0, 5).map((item, index) => (
                <HorizontalCard
                  key={`${item.productId || item.productGroupId || 'item'}-${index}`}
                  item={item}
                  index={index}
                  navigation={navigation}
                  showRank
                />
              ))}
            </ScrollView>
          )}
        </View>
        <View style={styles.sectionDivider} />

        {/* ── Section 3b: 유아동 베스트 상품 ── */}
        <View style={styles.section}>
          <View style={styles.secHeader}>
            <View style={styles.secHeaderTop}>
              <Text style={styles.secTitle}>유아동 베스트 상품</Text>
              <TouchableOpacity
                onPress={() => navigation.navigate('CurationDetail', { type: 'mamtem', title: '유아동 베스트 상품' })}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.secViewAll}>전체 ›</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.secSub}>우리아이 또래 부모들이 가장 많이 찾는 제품</Text>
          </View>
          {dealsLoading ? (
            <View style={styles.curationLoading}>
              <ActivityIndicator size="small" color="#2E6FF2" />
              <Text style={styles.curationLoadingText}>불러오는 중...</Text>
            </View>
          ) : babyDeals.length === 0 ? (
            <Text style={styles.emptyText}>상품 정보를 불러올 수 없습니다</Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
              {babyDeals.slice(0, 10).map((item, idx) => (
                <HorizontalCard
                  key={`${item.productId || item.productGroupId || 'item'}-${idx}`}
                  item={{ ...item, price: item.price ?? item.currentPrice }}
                  index={idx}
                  navigation={navigation}
                  onPress={() => navigation.navigate('Detail', { item })}
                />
              ))}
            </ScrollView>
          )}
        </View>
        <View style={styles.sectionDivider} />

        {/* ── Section 3c: 오늘의 특가 (Goldbox + 7AM 카운트다운) ── */}
        <View style={styles.section}>
          <View style={styles.secHeader}>
            <View style={styles.secHeaderTop}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
                <Text style={styles.secTitle} numberOfLines={1}>오늘의 특가</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FEF2F2', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 12 }}>
                  <Clock size={16} color="#EF4444" />
                  <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#EF4444', fontVariant: ['tabular-nums'] }}>{goldboxCountdown}</Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => navigation.navigate('CurationDetail', { type: 'goldbox', title: '오늘의 특가' })}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.secViewAll}>전체 ›</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.secSub}>매일 아침 업데이트되는 오늘 할인 상품</Text>
          </View>
          {dealsLoading ? (
            <View style={styles.curationLoading}>
              <ActivityIndicator size="small" color="#2E6FF2" />
              <Text style={styles.curationLoadingText}>불러오는 중...</Text>
            </View>
          ) : goldboxAllDeals.length === 0 ? (
            <Text style={styles.emptyText}>상품 정보를 불러올 수 없습니다</Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
              {goldboxAllDeals.map((item, idx) => (
                <HorizontalCard
                  key={`${item.id || item.productGroupId || 'item'}-${idx}`}
                  item={item}
                  index={idx}
                  navigation={navigation}
                  onPress={() => navigation.navigate('Detail', { item })}
                />
              ))}
            </ScrollView>
          )}
        </View>
        <View style={styles.sectionDivider} />

        {/* ── Section 4: 할인 할 때 사야하는 생필품 ── */}
        <View style={styles.section}>
          <View style={styles.secHeader}>
            <View style={styles.secHeaderTop}>
              <Text style={styles.secTitle}>할인 할 때 사야하는 생필품</Text>
              <TouchableOpacity
                onPress={() => navigation.navigate('CurationDetail', { type: 'pl_deals', title: '할인 할 때 사야하는 생필품' })}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.secViewAll}>전체 ›</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.secSub}>가격 내려갔을 때 미리 담아야하는 상품</Text>
          </View>
          {dealsLoading ? (
            <View style={styles.curationLoading}>
              <ActivityIndicator size="small" color="#2E6FF2" />
              <Text style={styles.curationLoadingText}>불러오는 중...</Text>
            </View>
          ) : peerDeals.length === 0 ? (
            <Text style={styles.emptyText}>상품 정보를 불러올 수 없습니다</Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 4 }}>
              {peerDeals.map((item, idx) => (
                <HorizontalCard
                  key={`${item.id || item.productGroupId || 'item'}-${idx}`}
                  item={item}
                  index={idx}
                  navigation={navigation}
                  onPress={() => navigation.navigate('Detail', { item })}
                />
              ))}
            </ScrollView>
          )}
        </View>
        <View style={styles.sectionDivider} />

        {/* ── Section 5: Context-to-Commerce Community Highlights ── */}
        <Section5CommunityHighlights navigation={navigation} posts={communityPosts} loading={communityLoading} />

        {/* Coupang disclaimer */}
        <Text style={styles.disclaimer}>
          이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.
        </Text>
      </ScrollView>

      {/* ── Coach Mark Tutorial Overlay ── */}
      <CoachMarkOverlay
        step={tutorialStep}
        onNext={() => setTutorialStep((s) => s + 1)}
        onFinish={dismissTutorial}
        onSkip={dismissTutorial}
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
        <View style={[styles.catSheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.catSheetHandle} />
          <Text style={styles.catSheetTitle}>카테고리</Text>
          {[
            { label: '출산·유아동', Icon: Heart,        id: '1011' },
            { label: '식품',        Icon: ShoppingCart,  id: '1012' },
            { label: '생활용품',    Icon: Package,       id: '1014' },
            { label: '패션의류',    Icon: Tag,           id: '1001' },
            { label: '뷰티',        Icon: Sparkles,      id: '1005' },
            { label: '가전디지털',  Icon: Smartphone,    id: '1002' },
            { label: '스포츠·레저', Icon: Activity,      id: '1009' },
            { label: '홈·인테리어', Icon: Home,          id: '1010' },
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
              <View style={styles.catSheetRowIconWrap}>
                <cat.Icon size={18} color="#6B7280" strokeWidth={1.8} />
              </View>
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

  // ── Smart Action Banner (fintech card) ─────────────────────────────────────
  // ── Birth check banner ─────────────────────────────────────────────────────
  birthCheckWrap: { marginHorizontal: 16, marginTop: 12, marginBottom: 4 },
  birthCheckCard: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: '#FFF7ED', borderRadius: 16, borderWidth: 1, borderColor: '#FED7AA',
    padding: 16,
  },
  birthCheckEmoji: { fontSize: 24, marginRight: 12 },
  birthCheckTitle: { fontSize: 16, fontWeight: '800', color: '#0F172A', marginBottom: 4 },
  birthCheckSub:   { fontSize: 13, color: '#78716C', lineHeight: 18 },
  birthCheckSnoozeBtn: {
    paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10,
    borderWidth: 1, borderColor: '#E7E5E4', backgroundColor: '#FFFFFF',
  },
  birthCheckSnoozeBtnText: { fontSize: 13, fontWeight: '700', color: '#78716C' },
  birthCheckConfirmBtn: {
    flex: 1, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10,
    backgroundColor: '#2E6FF2', alignItems: 'center',
  },
  birthCheckConfirmBtnText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },

  smartBannerWrap: { marginHorizontal: 16, marginTop: 12, marginBottom: 4 },
  smartBannerCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFFFFF', borderRadius: 16,
    minHeight: 84, paddingVertical: 16, paddingHorizontal: 16,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.10, shadowRadius: 12 },
      android: { elevation: 4 },
    }),
  },
  smartBannerIconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  smartBannerBody:     { flex: 1, marginHorizontal: 12, justifyContent: 'center' },
  smartBannerContext:  { fontSize: 13, fontWeight: '500', color: '#64748B', marginBottom: 2 },
  smartBannerAction:   { fontSize: 17, fontWeight: '800', color: '#0F172A' },
  debugRow:            { flexDirection: 'row', gap: 3, justifyContent: 'flex-end', marginTop: 3, marginRight: 2 },
  debugBtn:            { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3, backgroundColor: '#F1F5F9' },
  debugBtnActive:      { backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE' },
  debugBtnText:        { fontSize: 9, color: '#94A3B8', fontWeight: '600' },


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
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center',
    marginBottom: 6,
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
  productCardInner: { borderRadius: 12 },
  cardImageContainer: { width: CARD_WIDTH, height: 140, position: 'relative' },
  cardImage: { width: CARD_WIDTH, height: 140 },
  cardImageFallback: { backgroundColor: '#e2e8f0' },
  cardRankBadge: {
    position: 'absolute', top: 8, left: 8, zIndex: 1,
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
  hCardRocketBadge: { fontSize: 10, fontWeight: '700', color: '#2563EB', marginTop: 4 },
  hCardFreeBadge:   { fontSize: 10, fontWeight: '700', color: '#64748b', marginTop: 4 },
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
    paddingHorizontal: 20, paddingBottom: 24,
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
  catSheetRowIconWrap: { width: 28, alignItems: 'center', marginRight: 12 },
  catSheetRowLabel: { flex: 1, fontSize: 15, fontWeight: '500', color: '#1F2937' },
  catSheetRowArrow: { fontSize: 18, color: '#9CA3AF' },
});
