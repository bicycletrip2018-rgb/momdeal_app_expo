import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { signOut } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { collection, doc, getDoc, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { auth, db, functions } from '../firebase/config';
import { getChildrenByUserId } from '../services/firestore/childrenRepository';
import {
  getOrCreateNickname,
  updateNickname,
  updateSelectedChild,
} from '../services/firestore/userRepository';
import { getSavedProductsWithPriceSignals } from '../services/priceAlertService';
import { deriveUserGamificationV2, TIER_LIST_V2, TITLE_LIST_V2 } from '../utils/gamification';
import { toggleSavedProduct } from '../services/saveService';
import { recordProductAction } from '../services/productActionService';
import { useTracking } from '../context/TrackingContext';

// ─── Helpers ────────────────────────────────────────────────────────────────

const genderLabel = (g) => (g === 'female' ? '여아' : g === 'male' ? '남아' : '');

const formatAgeMonth = (child) => {
  if (child?.type === 'pregnancy') {
    return typeof child?.pregnancyWeek === 'number' ? `임신 ${child.pregnancyWeek}주` : '임신';
  }
  return typeof child?.ageMonth === 'number' ? `${child.ageMonth}개월` : '-';
};

// ─── Price tracking helpers ──────────────────────────────────────────────────

// Rec items use real Unsplash images (no emojis)
// coupangUrl: Coupang Partners short links (coupa.ng universal links).
// Universal Links — iOS opens the native app if installed, else web. Android same via App Links.
// Replace each coupa.ng path with the actual Partners-generated short link for production.
const MOCK_INFANT_ITEMS = [
  { id: 'inf1', name: '하기스 네이처메이드 기저귀 특대형',
    image: 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=280&q=80',
    origPrice: 42900, currentPrice: 31900,
    coupangUrl: 'https://coupa.ng/blE0dT' },
  { id: 'inf2', name: '에디슨 실리콘 젖병 세트 240ml',
    image: 'https://images.unsplash.com/photo-1584466977773-e625c37cdd50?w=280&q=80',
    origPrice: 18000, currentPrice: 13500,
    coupangUrl: 'https://coupa.ng/bkJF3s' },
  { id: 'inf3', name: '코코넛 유기농 아기 로션 200ml',
    image: 'https://images.unsplash.com/photo-1608248597279-f99d160bfcbc?w=280&q=80',
    origPrice: 15900, currentPrice: 11900,
    coupangUrl: 'https://coupa.ng/bmR7tY' },
  { id: 'inf4', name: '피죤 아기 섬유유연제 2.5L',
    image: 'https://images.unsplash.com/photo-1582735689369-4fe89db7114c?w=280&q=80',
    origPrice: 14900, currentPrice: 10900,
    coupangUrl: 'https://coupa.ng/bpX9wZ' },
];

const MOCK_TODDLER_ITEMS = [
  { id: 'tod1', name: '몬테소리 원목 블록 50pcs',
    image: 'https://images.unsplash.com/photo-1558060370-d644479cb6f7?w=280&q=80',
    origPrice: 32900, currentPrice: 22900,
    coupangUrl: 'https://coupa.ng/bqA2mK' },
  { id: 'tod2', name: '멜리사 앤 더그 퍼즐 세트',
    image: 'https://images.unsplash.com/photo-1619532550766-12c325d9516a?w=280&q=80',
    origPrice: 28000, currentPrice: 19500,
    coupangUrl: 'https://coupa.ng/brC4nL' },
  { id: 'tod3', name: '아기 안전문 게이트 80cm',
    image: 'https://images.unsplash.com/photo-1576201836106-db1758fd1c97?w=280&q=80',
    origPrice: 45000, currentPrice: 31900,
    coupangUrl: 'https://coupa.ng/bsDmPo' },
  { id: 'tod4', name: '유아 치발기 치아발육기 세트',
    image: 'https://images.unsplash.com/photo-1591382696684-38c427c7547a?w=280&q=80',
    origPrice: 12900, currentPrice: 8900,
    coupangUrl: 'https://coupa.ng/btF6qR' },
];

const MOCK_KIDS_ITEMS = [
  { id: 'kid1', name: '레고 듀플로 동물원 세트',
    image: 'https://images.unsplash.com/photo-1587654780291-39c9404d746b?w=280&q=80',
    origPrice: 54900, currentPrice: 38900,
    coupangUrl: 'https://coupa.ng/buG8rS' },
  { id: 'kid2', name: '킨더조이 어린이 가방 14L',
    image: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=280&q=80',
    origPrice: 24900, currentPrice: 16900,
    coupangUrl: 'https://coupa.ng/bvH0sT' },
  { id: 'kid3', name: '어린이 칫솔 5단계 4개입',
    image: 'https://images.unsplash.com/photo-1559305616-3f99cd43e353?w=280&q=80',
    origPrice: 9900,  currentPrice: 6900,
    coupangUrl: 'https://coupa.ng/bwI1tU' },
  { id: 'kid4', name: '퍼실 실내건조 고농축 세탁세제 3L',
    image: 'https://images.unsplash.com/photo-1582735689369-4fe89db7114c?w=280&q=80',
    origPrice: 24900, currentPrice: 16900,
    coupangUrl: 'https://coupa.ng/bxJ3uV' },
];

function getRecommendedItems(ageMonth) {
  if (!ageMonth || ageMonth < 12) return MOCK_INFANT_ITEMS;
  if (ageMonth < 36)              return MOCK_TODDLER_ITEMS;
  return MOCK_KIDS_ITEMS;
}

function getStatusBadge(item) {
  const current = item.currentPrice ?? 0;
  const drop    = item.priceDrop   ?? 0;
  if (current <= 0) return { label: '⏸️ 변동 없음', bg: '#f8fafc', text: '#94a3b8' };
  const orig    = current + drop;
  const dropPct = orig > 0 ? (drop / orig) * 100 : 0;
  if (dropPct > 30) return { label: '🔥 역대 최저가!', bg: '#fef2f2', text: '#dc2626' };
  if (drop > 0)     return { label: '📉 하락 중',      bg: '#eff6ff', text: '#2563eb' };
  return                   { label: '⏸️ 변동 없음',    bg: '#f8fafc', text: '#94a3b8' };
}

// ─── Sub-components ─────────────────────────────────────────────────────────

// ─── Tracking add card (Polcent-style) ───────────────────────────────────────

function AddSquareCard({ onPress }) {
  return (
    <TouchableOpacity style={styles.trackingAddSquareCard} onPress={onPress} activeOpacity={0.75}>
      <Text style={styles.trackingAddSquarePlus}>+</Text>
      <Text style={styles.trackingAddSquareLabel}>추가</Text>
    </TouchableOpacity>
  );
}

function MenuItem({ icon, label, value, onPress, danger = false }) {
  return (
    <TouchableOpacity style={styles.menuItem} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.menuItemLeft}>
        <Text style={styles.menuItemIcon}>{icon}</Text>
        <Text style={[styles.menuItemLabel, danger && styles.menuItemLabelDanger]}>{label}</Text>
      </View>
      <View style={styles.menuItemRight}>
        {value ? <Text style={styles.menuItemValue}>{value}</Text> : null}
        <Text style={styles.menuItemChevron}>›</Text>
      </View>
    </TouchableOpacity>
  );
}

function MenuSectionHeader({ title }) {
  return (
    <View style={styles.menuSectionHeader}>
      <Text style={styles.menuSectionTitle}>{title}</Text>
    </View>
  );
}

// ─── Child badge helper ──────────────────────────────────────────────────────

const FEEDING_KO = { breast: '모유', formula: '분유', mixed: '혼합', solids: '이유식' };

function buildChildBadges(child) {
  const b = [];
  // Age
  if (child.type === 'pregnancy') {
    b.push({ label: `임신 ${child.pregnancyWeek || '?'}주`, bg: '#fdf2f8', text: '#db2777' });
  } else if (typeof child.ageMonth === 'number') {
    b.push({ label: `${child.ageMonth}개월`, bg: '#eff6ff', text: '#1d4ed8' });
  }
  // Gender
  const gl = genderLabel(child.gender);
  if (gl) b.push({ label: gl, bg: '#fce7f3', text: '#be185d' });
  // Height / Weight
  if (child.height) b.push({ label: `${child.height}cm`, bg: '#f0fdf4', text: '#166534' });
  if (child.weight) b.push({ label: `${child.weight}kg`, bg: '#f0fdf4', text: '#166534' });
  // Skin type
  if (child.skinType) b.push({ label: child.skinType, bg: '#fdf4ff', text: '#a21caf' });
  // Feeding (infant-relevant)
  const fk = FEEDING_KO[child.feedingType];
  if (fk) b.push({ label: fk, bg: '#fff7ed', text: '#9a3412' });
  return b;
}

// ─── Child dropdown trigger ───────────────────────────────────────────────────

function childEmoji(child) {
  return child.type === 'pregnancy' ? '🤰'
    : child.gender === 'female' ? '👧'
    : child.gender === 'male'   ? '👦' : '👶';
}

function ChildDropdownTrigger({ child, onPress }) {
  return (
    <TouchableOpacity style={styles.childDropBtn} onPress={onPress} activeOpacity={0.8}>
      <Text style={styles.childDropEmoji}>{childEmoji(child)}</Text>
      <Text style={styles.childDropName} numberOfLines={1}>{child.name}</Text>
      <Text style={styles.childDropCaret}>▾</Text>
    </TouchableOpacity>
  );
}

// ─── Selected child dashboard card ───────────────────────────────────────────

function ChildDashboardCard({ child, onEdit, onOpenPicker }) {
  const badges = buildChildBadges(child);

  return (
    <View style={styles.childDashCard}>
      {/* Header: dropdown trigger (left) + edit button (right) */}
      <View style={styles.childDashHeader}>
        <ChildDropdownTrigger child={child} onPress={onOpenPicker} />
        <TouchableOpacity
          style={styles.childDashEditBtn}
          onPress={() => onEdit(child)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.childDashEditIcon}>✏️</Text>
        </TouchableOpacity>
      </View>

      {/* Physical attribute badges */}
      {badges.length > 0 ? (
        <View style={styles.childDashBadges}>
          {badges.map((b, i) => (
            <View key={i} style={[styles.childDashBadge, { backgroundColor: b.bg }]}>
              <Text style={[styles.childDashBadgeText, { color: b.text }]}>#{b.label}</Text>
            </View>
          ))}
        </View>
      ) : (
        <TouchableOpacity onPress={() => onEdit(child)} activeOpacity={0.8}>
          <Text style={styles.childDashNoBadgeHint}>
            ✏️ 아이 정보를 더 채우면 맞춤 추천이 더 정교해져요
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Constants ──────────────────────────────────────────────────────────────

const MARKETS = [
  { key: 'coupang', name: '쿠팡',       emoji: '🛒', active: true  },
  { key: 'kurly',   name: '마켓컬리',   emoji: '🟣', active: false },
  { key: 'naver',   name: '네이버쇼핑', emoji: '🟢', active: false },
];

const SKELETON_COUNT = 6;

// ─── Screen ─────────────────────────────────────────────────────────────────

export default function MyPageScreen({ navigation }) {
  const insets = useSafeAreaInsets();

  const { globalTrackedItems, addTrackedItem, removeTrackedItem, setTrackedItems } = useTracking();

  const [children,           setChildren]           = useState([]);
  const [activityStats,      setActivityStats]      = useState({ clickCount: 0, purchaseCount: 0 });
  const [recentProducts,     setRecentProducts]     = useState([]);
  const [purchasedProducts,  setPurchasedProducts]  = useState([]);
  const [mostViewedCategory, setMostViewedCategory] = useState(null);
  const [selectedChildId,    setSelectedChildId]    = useState(null);
  const [nickname,           setNickname]           = useState('');
  const [reviewCount,        setReviewCount]        = useState(0);
  const [postCount,          setPostCount]          = useState(0);
  const [commentCount,       setCommentCount]       = useState(0);
  const [loading,            setLoading]            = useState(true);
  const [refreshing,         setRefreshing]         = useState(false);
  const [urlInput,           setUrlInput]           = useState('');
  const [registering,        setRegistering]        = useState(false);
  const [isAdmin,            setIsAdmin]            = useState(false);
  const [addSheetOpen,       setAddSheetOpen]       = useState(false);
  const [savedFilter,        setSavedFilter]        = useState('all');
  // Guide modal
  const [isGuideOpen,        setIsGuideOpen]        = useState(false);
  // Unified profile settings modal: tabs 'profile' | 'tier' | 'title'
  const [profileSettingsOpen, setProfileSettingsOpen] = useState(false);
  const [profileSettingsTab,  setProfileSettingsTab]  = useState('profile');
  const [nicknameInput,      setNicknameInput]      = useState('');
  const [nicknameSaving,     setNicknameSaving]     = useState(false);
  // Child picker
  const [childPickerOpen,    setChildPickerOpen]    = useState(false);
  // Active title selection
  const [activeTitleId,      setActiveTitleId]      = useState(null);
  // Product action modal (long-press on tracked item)
  const [productActionModal, setProductActionModal] = useState({ visible: false, productId: null, productName: null });

  const loadAll = useCallback(async () => {
    const uid = auth.currentUser?.uid;
    try {
      if (uid) getOrCreateNickname(uid).then(setNickname).catch(() => {});

      const [childList, saved, userSnap, reviewSnap, postSnap, commentSnap] = await Promise.all([
        uid ? getChildrenByUserId(uid) : [],
        uid ? getSavedProductsWithPriceSignals(uid) : [],
        uid ? getDoc(doc(db, 'users', uid)) : Promise.resolve(null),
        uid ? getDocs(query(collection(db, 'reviews'),  where('userId', '==', uid))) : Promise.resolve({ size: 0 }),
        uid ? getDocs(query(collection(db, 'posts'),    where('userId', '==', uid), limit(100))) : Promise.resolve({ size: 0 }),
        uid ? getDocs(query(collection(db, 'comments'), where('userId', '==', uid), limit(100))) : Promise.resolve({ size: 0 }),
      ]);

      setReviewCount(reviewSnap.size);
      setPostCount(postSnap.size ?? 0);
      setCommentCount(commentSnap.size ?? 0);

      if (userSnap?.exists()) {
        const userData = userSnap.data();
        setSelectedChildId(userData.selectedChildId ?? null);
        setIsAdmin(userData.role === 'admin');
      }

      childList.sort((a, b) => {
        const aT = a?.updatedAt?.toDate?.().getTime() ?? 0;
        const bT = b?.updatedAt?.toDate?.().getTime() ?? 0;
        return bT - aT;
      });
      setChildren(childList);
      // MOCK PHASE: do not overwrite context with the (empty) Firestore result.
      // Re-enable once the backend returns real saved_products data.
      // setTrackedItems(saved);
      // const catCount = {};
      // saved.forEach((item) => {
      //   const cat = item.category || '기타';
      //   catCount[cat] = (catCount[cat] || 0) + 1;
      // });
      // const topCat = Object.entries(catCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      // setMostViewedCategory(topCat);

      if (uid) {
        const actionsSnap = await getDocs(
          query(
            collection(db, 'user_product_actions'),
            where('userId', '==', uid),
            orderBy('createdAt', 'desc'),
            limit(50)
          )
        );

        let clickCount = 0;
        let purchaseCount = 0;
        const clickSeen = new Set();
        const purchaseSeen = new Set();
        const clickPids = [];
        const purchasePids = [];

        actionsSnap.docs.forEach((d) => {
          const { actionType, productGroupId, productId } = d.data();
          const pid = productGroupId || productId;
          if (actionType === 'click' || actionType === 'product_view' || actionType === 'product_click') {
            clickCount += 1;
            if (pid && !clickSeen.has(pid)) { clickSeen.add(pid); clickPids.push(pid); }
          }
          if (actionType === 'purchase' || actionType === 'product_purchase_click') {
            purchaseCount += 1;
            if (pid && !purchaseSeen.has(pid)) { purchaseSeen.add(pid); purchasePids.push(pid); }
          }
        });

        setActivityStats({ clickCount, purchaseCount });

        const fetchDocs = (pids) =>
          Promise.all(
            pids.slice(0, 5).map((pid) =>
              getDoc(doc(db, 'products', pid)).then((d) => (d.exists() ? { id: d.id, ...d.data() } : null))
            )
          ).then((docs) => docs.filter(Boolean));

        const [recentDocs, purchaseDocs] = await Promise.all([
          fetchDocs(clickPids),
          fetchDocs(purchasePids),
        ]);
        setRecentProducts(recentDocs);
        setPurchasedProducts(purchaseDocs);
      }
    } catch (error) {
      console.log('MyPageScreen loadAll error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (!loading) loadAll();
    });
    return unsubscribe;
  }, [navigation, loading, loadAll]);

  const handleSelectChild = async (childId) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setSelectedChildId(childId);
    try {
      await updateSelectedChild(uid, childId);
    } catch (error) {
      console.log('MyPageScreen selectChild error:', error);
    }
  };

  const handleRemoveSaved = async (productId) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    removeTrackedItem(productId);
    try {
      await toggleSavedProduct(uid, productId);
    } catch {
      loadAll();
    }
  };

  const handleRegisterUrl = async () => {
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    setRegistering(true);
    try {
      const registerProductFromUrl = httpsCallable(functions, 'registerProductFromUrl');
      const result = await registerProductFromUrl({ url: trimmed });
      setUrlInput('');
      setAddSheetOpen(false);
      const isNew = result?.data?.isNew !== false;
      Alert.alert(
        isNew ? '등록 완료 ✅' : '이미 등록된 상품',
        isNew
          ? '상품이 가격 추적 목록에 추가되었어요!'
          : '이미 추적 중인 상품입니다. 가격 정보를 업데이트했어요.'
      );
    } catch (error) {
      const code = error?.code ?? '';
      let msg;
      if (code.includes('invalid-argument')) {
        msg = error.message || '지원하지 않는 URL입니다. 쿠팡 상품 URL을 붙여넣어 주세요.';
      } else if (code.includes('not-found')) {
        msg = '상품 정보를 찾을 수 없습니다. URL을 다시 확인해주세요.';
      } else {
        msg = '등록에 실패했습니다. 잠시 후 다시 시도해주세요.';
      }
      Alert.alert('등록 실패', msg);
    } finally {
      setRegistering(false);
    }
  };

  const handleProductPress = (productId, productName) => {
    recordProductAction({ userId: auth.currentUser?.uid, productId, actionType: 'click' });
    navigation.navigate('ProductDetail', { productId, productName });
  };

  const handleLogout = () => {
    Alert.alert('로그아웃', '정말 로그아웃 하시겠어요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '로그아웃',
        style: 'destructive',
        onPress: () => signOut(auth).catch(() => {}),
      },
    ]);
  };

  const handleOpenNicknameEdit = () => {
    setNicknameInput(nickname);
    setProfileSettingsTab('tier');
    setProfileSettingsOpen(true);
  };

  const handleUpdateNickname = async () => {
    const trimmed = nicknameInput.trim();
    if (trimmed.length < 2 || trimmed.length > 12) {
      Alert.alert('안내', '닉네임은 2~12자로 입력해 주세요.');
      return;
    }
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setNicknameSaving(true);
    try {
      await updateNickname(uid, trimmed);
      setNickname(trimmed);
      setProfileSettingsOpen(false);
    } catch {
      Alert.alert('오류', '닉네임 저장에 실패했습니다.');
    } finally {
      setNicknameSaving(false);
    }
  };

  const handleInstantTrack = useCallback(async (mockItem) => {
    const uid = auth.currentUser?.uid;
    const already = globalTrackedItems.some((s) => s.productId === mockItem.id);
    if (already) {
      Alert.alert('이미 추적 중', '이미 가격 추적 목록에 있는 상품이에요.');
      return;
    }
    // Optimistic update — include coupangUrl so the tracked card can open the Partners link
    const synthetic = {
      productId: mockItem.id,
      savedId: mockItem.id,
      name: mockItem.name,
      currentPrice: mockItem.currentPrice,
      priceDrop: mockItem.origPrice - mockItem.currentPrice,
      coupangUrl: mockItem.coupangUrl ?? null,
    };
    addTrackedItem(synthetic);
    Alert.alert('추적 시작! 📉', `${mockItem.name}\n가격 추적 목록에 추가되었어요!`);
    if (uid) {
      try {
        await toggleSavedProduct(uid, mockItem.id);
      } catch {
        // Firestore write failed — roll back optimistic item
        removeTrackedItem(mockItem.id);
        Alert.alert('오류', '추적 등록에 실패했습니다. 다시 시도해주세요.');
      }
    }
  }, [globalTrackedItems, addTrackedItem, removeTrackedItem]);

  // Partners Universal Link — coupa.ng short links are registered as Universal Links (iOS)
  // and App Links (Android). The OS routes directly to the native Coupang app if installed,
  // or falls back to the web product page — no custom scheme or intent branching needed.
  const handleOpenCoupang = useCallback(async (url = 'https://coupa.ng/blE0dT') => {
    Alert.alert('쿠팡으로 이동 중...', '잠시만 기다려 주세요 🛒');
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('연결 실패', '기기에서 해당 링크를 열 수 없습니다. (에뮬레이터 환경 등)');
    }
  }, []);

  const navigateToEditChild = (child) => {
    if (!child) return;
    navigation.navigate('ChildAdd', {
      childId: child.id,
      child: {
        ...child,
        birthDate: child.birthDate?.toDate?.()?.toISOString?.() ?? child.birthDate ?? null,
        createdAt: null,
        updatedAt: null,
      },
    });
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="small" />
      </View>
    );
  }

  const selectedChild  = children.find((c) => c.id === selectedChildId) ?? children[0] ?? null;
  const displayName    = nickname || auth.currentUser?.displayName || auth.currentUser?.email || '사용자';
  const avatarInitial  = displayName[0] ?? '?';
  const gamification   = deriveUserGamificationV2({
    reviewCount,
    postCount,
    savedCount: globalTrackedItems.length,
  });
  // Active title: default to first in list; TITLE_LIST_V2 is fully mocked as earned
  const displayedTitle = activeTitleId
    ? TITLE_LIST_V2.find((t) => t.id === activeTitleId) ?? TITLE_LIST_V2[0]
    : TITLE_LIST_V2[0];

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>

      {/* ── Top app bar ── */}
      <View style={styles.appBar}>
        <Text style={styles.appBarTitle}>마이페이지</Text>
        <View style={styles.appBarActions}>
          <TouchableOpacity
            onPress={() => navigation.navigate('Notifications')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.appBarIcon}>🔔</Text>
          </TouchableOpacity>
          <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.appBarIcon}>⚙️</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); loadAll(); }}
          />
        }
      >
        {/* ── Profile header block ── */}
        <View style={styles.profileBlock}>

          {/* ⚙️ 프로필 설정 button — absolute top-right, removed from flow */}
          <TouchableOpacity
            style={styles.profileManageBtn}
            onPress={() => { setNicknameInput(nickname); setProfileSettingsTab('tier'); setProfileSettingsOpen(true); }}
            activeOpacity={0.8}
          >
            <Text style={styles.profileManageBtnText}>⚙️ 프로필 설정</Text>
          </TouchableOpacity>

          {/* ── Main row: avatar | name + badges ── */}
          <View style={styles.profileTopRow}>

            {/* Avatar with 📷 camera overlay */}
            <View style={styles.avatarWrapper}>
              <View style={styles.avatar}>
                <Text style={styles.avatarInitial}>{avatarInitial}</Text>
              </View>
              <View style={styles.avatarCameraIcon}>
                <Text style={styles.avatarCameraText}>📷</Text>
              </View>
            </View>

            {/* Name + badge area — paddingRight leaves room for the absolute button */}
            <View style={[styles.profileNameArea, { paddingRight: 72 }]}>
              <View style={styles.profileNameRow}>
                <Text style={styles.profileName} numberOfLines={1}>{displayName}</Text>
              </View>
              {/* Tier badge + tappable title badge */}
              <View style={styles.profileBadgeRow}>
                <View style={[styles.tierBadgePill, { backgroundColor: gamification.tier.bg }]}>
                  <Text style={[styles.tierBadgePillText, { color: gamification.tier.text }]}>
                    {gamification.tier.emoji} {gamification.tier.name}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.titleBadge, { backgroundColor: displayedTitle.bg }]}
                  onPress={() => { setProfileSettingsTab('title'); setProfileSettingsOpen(true); }}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.titleBadgeText, { color: displayedTitle.text }]}>
                    {displayedTitle.emoji} {displayedTitle.label}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* ── XP progress bar (full width) ── */}
          <View style={styles.xpBarTrack}>
            <View style={[styles.xpBarFill, { width: `${gamification.xp}%` }]} />
          </View>

          {/* ── Progress copy ── */}
          <View style={styles.xpCopyRow}>
            <Text style={styles.xpProgressCopy} numberOfLines={2}>
              {gamification.progressCopy}
            </Text>
          </View>

        </View>

        {/* Child profile card with inline dropdown trigger */}
        {selectedChild ? (
          <ChildDashboardCard
            child={selectedChild}
            onEdit={navigateToEditChild}
            onOpenPicker={() => setChildPickerOpen(true)}
          />
        ) : (
          <TouchableOpacity
            style={styles.childDashEmpty}
            onPress={() => navigation.navigate('ChildAdd')}
            activeOpacity={0.8}
          >
            <Text style={styles.childDashEmptyText}>+ 아이 프로필 등록하기</Text>
          </TouchableOpacity>
        )}

        {/* ── Activity stats — single row, 5 items ── */}
        <View style={styles.statsRow}>
          <TouchableOpacity
            style={styles.statCell}
            onPress={() => Alert.alert('내가 쓴 글', `총 ${postCount}개의 글을 작성했어요.`)}
            activeOpacity={0.7}
          >
            <Text style={styles.statNumber}>{postCount}</Text>
            <Text style={styles.statLabel}>내가 쓴 글</Text>
          </TouchableOpacity>

          <View style={styles.statDivider} />

          <TouchableOpacity
            style={styles.statCell}
            onPress={() => Alert.alert('댓글', `총 ${commentCount}개의 댓글을 작성했어요.`)}
            activeOpacity={0.7}
          >
            <Text style={styles.statNumber}>{commentCount}</Text>
            <Text style={styles.statLabel}>댓글</Text>
          </TouchableOpacity>

          <View style={styles.statDivider} />

          <TouchableOpacity
            style={styles.statCell}
            onPress={() => Alert.alert('저장한 글', '저장한 글 기능을 준비 중입니다.')}
            activeOpacity={0.7}
          >
            <Text style={styles.statNumber}>0</Text>
            <Text style={styles.statLabel}>저장한 글</Text>
          </TouchableOpacity>

          <View style={styles.statDivider} />

          <TouchableOpacity
            style={styles.statCell}
            onPress={() => {
              if (recentProducts.length === 0) Alert.alert('최근 본 상품', '아직 본 상품이 없어요.');
              else handleProductPress(recentProducts[0].id, recentProducts[0].name);
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.statNumber}>{recentProducts.length}</Text>
            <Text style={styles.statLabel}>최근 본 상품</Text>
          </TouchableOpacity>

          <View style={styles.statDivider} />

          <TouchableOpacity
            style={styles.statCell}
            onPress={() => Alert.alert('내 쿠폰함', '쿠폰 기능을 준비 중입니다.')}
            activeOpacity={0.7}
          >
            <Text style={styles.statNumber}>0</Text>
            <Text style={styles.statLabel}>내 쿠폰함</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.sectionDivider} />

        {/* ─── MENU: 계정 설정 ─── */}
        <MenuSectionHeader title="계정 설정" />
        <MenuItem
          icon="🔑"
          label="포인트 적립 신청"
          onPress={() => navigation.navigate('RewardClaim')}
        />
        <MenuItem
          icon="💬"
          label="고객센터"
          onPress={() => Alert.alert('고객센터', '문의사항은 앱 스토어 리뷰 또는 이메일로 연락해주세요.')}
        />
        <MenuItem
          icon="🚪"
          label="로그아웃"
          onPress={handleLogout}
          danger
        />

        {/* ── Admin dashboard ── */}
        {isAdmin ? (
          <TouchableOpacity
            style={styles.adminBtn}
            onPress={() => navigation.navigate('AdminDashboard')}
            activeOpacity={0.85}
          >
            <Text style={styles.adminBtnText}>📊 어드민 대시보드</Text>
          </TouchableOpacity>
        ) : null}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── How-to Guide Modal ── */}
      <Modal
        visible={isGuideOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setIsGuideOpen(false)}
      >
        <TouchableWithoutFeedback onPress={() => setIsGuideOpen(false)}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>
        <View style={[styles.sheet, styles.guideSheet, { paddingBottom: insets.bottom + 24 }]}>
          <View style={styles.sheetHandle} />
          {/* Header */}
          <View style={styles.guideHeader}>
            <Text style={styles.guideTitle}>상품 추가 방법</Text>
            <TouchableOpacity
              onPress={() => setIsGuideOpen(false)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.guideCloseBtn}>✕</Text>
            </TouchableOpacity>
          </View>
          {/* Steps */}
          <View style={styles.guideSteps}>
            <View style={styles.guideStep}>
              <View style={styles.guideStepNum}>
                <Text style={styles.guideStepNumText}>1</Text>
              </View>
              <Text style={styles.guideStepText}>쿠팡 앱에서 원하는 육아템을 찾아요.</Text>
            </View>
            <View style={styles.guideStepConnector} />
            <View style={styles.guideStep}>
              <View style={styles.guideStepNum}>
                <Text style={styles.guideStepNumText}>2</Text>
              </View>
              <Text style={styles.guideStepText}>화면의 '공유하기' 버튼을 눌러요.</Text>
            </View>
            <View style={styles.guideStepConnector} />
            <View style={styles.guideStep}>
              <View style={styles.guideStepNum}>
                <Text style={styles.guideStepNumText}>3</Text>
              </View>
              <Text style={styles.guideStepText}>
                {'\'링크 복사\'를 누르고 세이브루 앱으로\n돌아오면 끝!'}
              </Text>
            </View>
          </View>
          {/* CTA */}
          <TouchableOpacity
            style={styles.guideCta}
            onPress={() => { setIsGuideOpen(false); setAddSheetOpen(true); }}
            activeOpacity={0.85}
          >
            <Text style={styles.guideCtaText}>🔗 바로 추가하기</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* ── Unified Profile Settings Modal (👤 프로필 / 🏅 등급 / 🏷️ 호칭) ── */}
      <Modal
        visible={profileSettingsOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setProfileSettingsOpen(false)}
      >
        <TouchableWithoutFeedback onPress={() => setProfileSettingsOpen(false)}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.sheetWrap}
        >
          <View style={[styles.sheet, styles.unifiedSheet, {
            paddingBottom: insets.bottom + 20,
            paddingTop: Platform.OS === 'android' ? 48 : 60,
            maxHeight: '90%',
          }]}>
            <View style={styles.sheetHandle} />

            {/* Header */}
            <View style={styles.gradeSheetHeader}>
              <Text style={styles.gradeSheetTitle}>프로필 설정</Text>
              <TouchableOpacity
                onPress={() => setProfileSettingsOpen(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.gradeSheetClose}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* ── Always-visible: Nickname Edit ── */}
            <View style={styles.unifiedProfileTab}>
              <Text style={styles.gradeSheetSub}>닉네임</Text>
              <View style={styles.unifiedNicknameRow}>
                <TextInput
                  style={[styles.sheetUrlInput, { flex: 1 }]}
                  value={nicknameInput}
                  onChangeText={setNicknameInput}
                  placeholder="닉네임 입력 (2~12자)"
                  placeholderTextColor="#aaa"
                  maxLength={12}
                  editable={!nicknameSaving}
                  returnKeyType="done"
                  onSubmitEditing={handleUpdateNickname}
                />
                <TouchableOpacity
                  style={[
                    styles.sheetRegisterBtn,
                    (nicknameInput.trim().length < 2 || nicknameSaving) && styles.sheetRegisterBtnDisabled,
                  ]}
                  onPress={handleUpdateNickname}
                  disabled={nicknameInput.trim().length < 2 || nicknameSaving}
                  activeOpacity={0.85}
                >
                  {nicknameSaving
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={styles.sheetRegisterBtnText}>저장</Text>
                  }
                </TouchableOpacity>
              </View>
            </View>

            {/* Divider */}
            <View style={styles.unifiedDivider} />

            {/* Pill-style toggle: 등급 / 호칭 */}
            <View style={styles.unifiedPillRow}>
              {[
                { id: 'tier',  label: '🏅 등급' },
                { id: 'title', label: '🏷️ 호칭' },
              ].map((pill) => (
                <TouchableOpacity
                  key={pill.id}
                  style={[styles.unifiedPill, profileSettingsTab === pill.id && styles.unifiedPillActive]}
                  onPress={() => setProfileSettingsTab(pill.id)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.unifiedPillText, profileSettingsTab === pill.id && styles.unifiedPillTextActive]}>
                    {pill.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* ── 등급 Content ── */}
            {profileSettingsTab === 'tier' && (
              <ScrollView showsVerticalScrollIndicator={false} style={styles.gradeScrollArea}>
                <Text style={[styles.gradeSheetSub, { textAlign: 'center' }]}>
                  {'내돈내산 리뷰 품질 기반 등급제\n진짜 구매 경험이 등급을 올려요 💪'}
                </Text>
                {TIER_LIST_V2.map((tier, idx) => {
                  const isUnlocked = idx <= gamification.tierIdx;
                  const isCurrent  = idx === gamification.tierIdx;
                  return (
                    <View
                      key={tier.id}
                      style={[
                        styles.gradeTierCard,
                        isUnlocked && styles.gradeTierCardUnlocked,
                        isCurrent  && styles.gradeTierCardCurrent,
                      ]}
                    >
                      <View style={styles.gradeTierHeader}>
                        <View style={[styles.gradeTierBadge, { backgroundColor: tier.bg }]}>
                          <Text style={[styles.gradeTierBadgeText, { color: tier.text }]}>
                            {tier.emoji} {tier.name}
                          </Text>
                        </View>
                        <Text style={styles.gradeTierLockIcon}>{isUnlocked ? '🔑' : '🔒'}</Text>
                        {isCurrent && (
                          <View style={styles.gradeTierCurrentTag}>
                            <Text style={styles.gradeTierCurrentTagText}>현재 등급</Text>
                          </View>
                        )}
                      </View>
                      <View style={styles.gradeTierSection}>
                        <Text style={styles.gradeTierSectionLabel}>달성 조건</Text>
                        <Text style={[styles.gradeTierSectionText, !isUnlocked && styles.gradeTierLockedText]}>
                          {tier.criteriaDetail}
                        </Text>
                      </View>
                      <View style={styles.gradeTierSection}>
                        <Text style={styles.gradeTierSectionLabel}>혜택</Text>
                        <Text style={[styles.gradeTierSectionText, !isUnlocked && styles.gradeTierLockedText]}>
                          {isUnlocked ? tier.rewardDetail : tier.rewardDetail.replace(/./g, '•')}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            )}

            {/* ── 호칭 Tab ── */}
            {profileSettingsTab === 'title' && (
              <ScrollView showsVerticalScrollIndicator={false} style={styles.gradeScrollArea}>
                <Text style={styles.gradeSheetSub}>
                  활동 품질에 따라 획득하는 특별 호칭이에요. 탭하여 대표 호칭을 설정하세요 ✨
                </Text>
                {[
                  { id: 'pro_reviewer', emoji: '📸', label: '#내돈내산_마스터', borderColor: '#15803d', bg: '#f0fdf4', text: '#15803d', unlocked: reviewCount >= 5,    hint: `리뷰 ${Math.max(5 - reviewCount, 0)}개 더 작성하면 획득`, criteria: '사진 첨부 실구매 인증 리뷰 5개 이상', reward: '프로필에 배지 표시 + 리뷰 우선 노출' },
                  { id: 'deal_fairy',   emoji: '🧚‍♀️', label: '#핫딜_요정',   borderColor: '#7e22ce', bg: '#fdf4ff', text: '#7e22ce', unlocked: globalTrackedItems.length >= 20, hint: `추적 상품 ${Math.max(20 - globalTrackedItems.length, 0)}개 더 등록하면 획득`, criteria: '가격 추적 상품 20개 이상 등록', reward: '시크릿 딜 알림 우선 수신 + 핫딜 알리미 배지' },
                  { id: 'mentor',       emoji: '💡', label: '#육아_멘토',     borderColor: '#b45309', bg: '#fffbeb', text: '#b45309', unlocked: postCount >= 10,     hint: `게시글 ${Math.max(10 - postCount, 0)}개 더 작성하면 획득`, criteria: '커뮤니티 게시글 10개 이상 작성', reward: '게시글 상단 고정 기회 + 멘토 배지 표시' },
                ].map((t) => {
                  const isActive = (activeTitleId ?? TITLE_LIST_V2[0].id) === t.id;
                  return (
                    <TouchableOpacity
                      key={t.id}
                      style={[
                        styles.gradeTitleCard, { borderLeftColor: t.borderColor },
                        isActive && styles.gradeTitleCardActive,
                      ]}
                      activeOpacity={t.unlocked ? 0.75 : 1}
                      onPress={() => {
                        if (!t.unlocked) return;
                        setActiveTitleId(t.id);
                        Alert.alert('대표 호칭 변경 ✅', '대표 호칭이 변경되었습니다!');
                      }}
                    >
                      <View style={styles.gradeTitleCardHeader}>
                        <View style={[styles.gradeTierBadge, { backgroundColor: t.bg }]}>
                          <Text style={[styles.gradeTierBadgeText, { color: t.text }]}>
                            {t.emoji} {t.label}
                          </Text>
                        </View>
                        <Text style={styles.gradeTierLockIcon}>{t.unlocked ? '🔑' : '🔒'}</Text>
                        {isActive && <View style={styles.gradeTitleActiveTag}><Text style={styles.gradeTitleActiveTagText}>대표 호칭</Text></View>}
                      </View>
                      <View style={styles.gradeTierSection}>
                        <Text style={styles.gradeTierSectionLabel}>획득 조건</Text>
                        <Text style={[styles.gradeTierSectionText, !t.unlocked && styles.gradeTierLockedText]}>
                          {t.criteria}
                        </Text>
                      </View>
                      <View style={styles.gradeTierSection}>
                        <Text style={styles.gradeTierSectionLabel}>{t.unlocked ? '혜택' : '잠금 해제 조건'}</Text>
                        <Text style={[styles.gradeTierSectionText, !t.unlocked && styles.gradeTierLockedText]}>
                          {t.unlocked ? t.reward : t.hint}
                        </Text>
                      </View>
                      {t.unlocked && !isActive && (
                        <Text style={styles.gradeTitleTapHint}>탭하여 대표 호칭으로 설정 →</Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Add Product Bottom Sheet ── */}
      <Modal
        visible={addSheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setAddSheetOpen(false)}
      >
        <TouchableWithoutFeedback onPress={() => setAddSheetOpen(false)}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.sheetWrap}
        >
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>상품 링크로 추가하기</Text>
            <Text style={styles.sheetSub}>가격을 추적하고 싶은 상품의 링크를 붙여넣어 주세요</Text>
            <View style={styles.marketRow}>
              {MARKETS.map((m) => (
                <View key={m.key} style={[styles.marketItem, !m.active && styles.marketItemDisabled]}>
                  <Text style={styles.marketEmoji}>{m.emoji}</Text>
                  <Text style={[styles.marketName, !m.active && styles.marketNameDisabled]}>{m.name}</Text>
                  {!m.active ? <Text style={styles.comingSoon}>준비 중</Text> : null}
                </View>
              ))}
            </View>
            <View style={styles.sheetInputRow}>
              <TextInput
                style={styles.sheetUrlInput}
                value={urlInput}
                onChangeText={setUrlInput}
                placeholder="https://www.coupang.com/..."
                placeholderTextColor="#aaa"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!registering}
              />
              <TouchableOpacity
                style={[styles.sheetRegisterBtn, (!urlInput.trim() || registering) && styles.sheetRegisterBtnDisabled]}
                onPress={handleRegisterUrl}
                disabled={!urlInput.trim() || registering}
                activeOpacity={0.85}
              >
                {registering
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.sheetRegisterBtnText}>등록</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── [REMOVED] Grade Info Modal — merged into UnifiedProfileModal above ── */}
      {false && <Modal
        visible={false}
        transparent
        animationType="slide"
        onRequestClose={() => {}}
      >
        <TouchableWithoutFeedback onPress={() => {}}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>
        <View style={[styles.sheet, styles.gradeSheet, { paddingBottom: insets.bottom + 24 }]}>
          <View style={styles.sheetHandle} />

          {/* Modal header */}
          <View style={styles.gradeSheetHeader}>
            <Text style={styles.gradeSheetTitle}>등급 & 호칭 안내</Text>
            <TouchableOpacity
              onPress={() => setIsGradeInfoOpen(false)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.gradeSheetClose}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Custom tab switcher */}
          <View style={styles.gradeTabRow}>
            <TouchableOpacity
              style={[styles.gradeTab, gradeModalTab === 'tier' && styles.gradeTabActive]}
              onPress={() => setGradeModalTab('tier')}
              activeOpacity={0.8}
            >
              <Text style={[styles.gradeTabText, gradeModalTab === 'tier' && styles.gradeTabTextActive]}>
                🏅 등급
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.gradeTab, gradeModalTab === 'title' && styles.gradeTabActive]}
              onPress={() => setGradeModalTab('title')}
              activeOpacity={0.8}
            >
              <Text style={[styles.gradeTabText, gradeModalTab === 'title' && styles.gradeTabTextActive]}>
                🏷️ 호칭
              </Text>
            </TouchableOpacity>
          </View>

          {/* ── 등급 Tab ── */}
          {gradeModalTab === 'tier' && (
            <ScrollView showsVerticalScrollIndicator={false} style={styles.gradeScrollArea}>
              <Text style={styles.gradeSheetSub}>
                내돈내산 리뷰 품질 기반 등급제 — 진짜 구매 경험이 등급을 올려요 💪
              </Text>
              {TIER_LIST_V2.map((tier, idx) => {
                const isUnlocked = idx <= gamification.tierIdx;
                const isCurrent  = idx === gamification.tierIdx;
                return (
                  <View
                    key={tier.id}
                    style={[
                      styles.gradeTierCard,
                      isUnlocked && styles.gradeTierCardUnlocked,
                      isCurrent  && styles.gradeTierCardCurrent,
                    ]}
                  >
                    <View style={styles.gradeTierHeader}>
                      <View style={[styles.gradeTierBadge, { backgroundColor: tier.bg }]}>
                        <Text style={[styles.gradeTierBadgeText, { color: tier.text }]}>
                          {tier.emoji} {tier.name}
                        </Text>
                      </View>
                      <Text style={styles.gradeTierLockIcon}>{isUnlocked ? '🔑' : '🔒'}</Text>
                      {isCurrent && (
                        <View style={styles.gradeTierCurrentTag}>
                          <Text style={styles.gradeTierCurrentTagText}>현재 등급</Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.gradeTierSection}>
                      <Text style={styles.gradeTierSectionLabel}>달성 조건</Text>
                      <Text style={[styles.gradeTierSectionText, !isUnlocked && styles.gradeTierLockedText]}>
                        {tier.criteriaDetail}
                      </Text>
                    </View>
                    <View style={styles.gradeTierSection}>
                      <Text style={styles.gradeTierSectionLabel}>혜택</Text>
                      <Text style={[styles.gradeTierSectionText, !isUnlocked && styles.gradeTierLockedText]}>
                        {isUnlocked ? tier.rewardDetail : tier.rewardDetail.replace(/./g, '•')}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          )}

          {/* ── 호칭 Tab ── */}
          {gradeModalTab === 'title' && (
            <ScrollView showsVerticalScrollIndicator={false} style={styles.gradeScrollArea}>
              <Text style={styles.gradeSheetSub}>
                활동 품질에 따라 자동으로 획득하는 특별 호칭이에요 ✨
              </Text>

              {/* 📸 내돈내산_마스터 */}
              {(() => {
                const unlocked = reviewCount >= 5;
                const isActive = (activeTitleId ?? TITLE_LIST_V2[0].id) === 'pro_reviewer';
                return (
                  <TouchableOpacity
                    style={[
                      styles.gradeTitleCard, { borderLeftColor: '#15803d' },
                      isActive && styles.gradeTitleCardActive,
                    ]}
                    activeOpacity={unlocked ? 0.75 : 1}
                    onPress={() => {
                      if (!unlocked) return;
                      setActiveTitleId('pro_reviewer');
                      Alert.alert('대표 호칭 변경 ✅', '대표 호칭이 변경되었습니다!');
                    }}
                  >
                    <View style={styles.gradeTitleCardHeader}>
                      <View style={[styles.gradeTierBadge, { backgroundColor: '#f0fdf4' }]}>
                        <Text style={[styles.gradeTierBadgeText, { color: '#15803d' }]}>
                          📸 #내돈내산_마스터
                        </Text>
                      </View>
                      <Text style={styles.gradeTierLockIcon}>{unlocked ? '🔑' : '🔒'}</Text>
                      {isActive && <View style={styles.gradeTitleActiveTag}><Text style={styles.gradeTitleActiveTagText}>대표 호칭</Text></View>}
                    </View>
                    <View style={styles.gradeTierSection}>
                      <Text style={styles.gradeTierSectionLabel}>획득 조건</Text>
                      <Text style={styles.gradeTierSectionText}>
                        사진 첨부 실구매 인증 리뷰 5개 이상 작성{'\n'}
                        — 직접 구매한 제품의 솔직한 리뷰어
                      </Text>
                    </View>
                    <View style={styles.gradeTierSection}>
                      <Text style={styles.gradeTierSectionLabel}>{unlocked ? '혜택' : '잠금 해제 조건'}</Text>
                      <Text style={[styles.gradeTierSectionText, !unlocked && styles.gradeTierLockedText]}>
                        {unlocked ? '프로필에 배지 표시 + 리뷰 우선 노출' : '리뷰 5개 작성 후 자동 획득'}
                      </Text>
                    </View>
                    {unlocked && !isActive && (
                      <Text style={styles.gradeTitleTapHint}>탭하여 대표 호칭으로 설정 →</Text>
                    )}
                  </TouchableOpacity>
                );
              })()}

              {/* 🧚‍♀️ 핫딜_요정 */}
              {(() => {
                const unlocked = globalTrackedItems.length >= 20;
                const isActive = (activeTitleId ?? TITLE_LIST_V2[0].id) === 'deal_fairy';
                return (
                  <TouchableOpacity
                    style={[
                      styles.gradeTitleCard, { borderLeftColor: '#7e22ce' },
                      isActive && styles.gradeTitleCardActive,
                    ]}
                    activeOpacity={unlocked ? 0.75 : 1}
                    onPress={() => {
                      if (!unlocked) return;
                      setActiveTitleId('deal_fairy');
                      Alert.alert('대표 호칭 변경 ✅', '대표 호칭이 변경되었습니다!');
                    }}
                  >
                    <View style={styles.gradeTitleCardHeader}>
                      <View style={[styles.gradeTierBadge, { backgroundColor: '#fdf4ff' }]}>
                        <Text style={[styles.gradeTierBadgeText, { color: '#7e22ce' }]}>
                          🧚‍♀️ #핫딜_요정
                        </Text>
                      </View>
                      <Text style={styles.gradeTierLockIcon}>{unlocked ? '🔑' : '🔒'}</Text>
                      {isActive && <View style={styles.gradeTitleActiveTag}><Text style={styles.gradeTitleActiveTagText}>대표 호칭</Text></View>}
                    </View>
                    <View style={styles.gradeTierSection}>
                      <Text style={styles.gradeTierSectionLabel}>획득 조건</Text>
                      <Text style={styles.gradeTierSectionText}>
                        가격 추적 상품 20개 이상 등록{'\n'}
                        — 최저가를 누구보다 빠르게 찾는 고수
                      </Text>
                    </View>
                    <View style={styles.gradeTierSection}>
                      <Text style={styles.gradeTierSectionLabel}>{unlocked ? '혜택' : '잠금 해제 조건'}</Text>
                      <Text style={[styles.gradeTierSectionText, !unlocked && styles.gradeTierLockedText]}>
                        {unlocked
                          ? '시크릿 딜 알림 우선 수신 + 핫딜 알리미 배지'
                          : `추적 상품 ${20 - globalTrackedItems.length}개 더 등록하면 자동 획득`}
                      </Text>
                    </View>
                    {unlocked && !isActive && (
                      <Text style={styles.gradeTitleTapHint}>탭하여 대표 호칭으로 설정 →</Text>
                    )}
                  </TouchableOpacity>
                );
              })()}

              {/* 💡 육아_멘토 */}
              {(() => {
                const unlocked = postCount >= 10;
                const isActive = (activeTitleId ?? TITLE_LIST_V2[0].id) === 'mentor';
                return (
                  <TouchableOpacity
                    style={[
                      styles.gradeTitleCard, { borderLeftColor: '#b45309' },
                      isActive && styles.gradeTitleCardActive,
                    ]}
                    activeOpacity={unlocked ? 0.75 : 1}
                    onPress={() => {
                      if (!unlocked) return;
                      setActiveTitleId('mentor');
                      Alert.alert('대표 호칭 변경 ✅', '대표 호칭이 변경되었습니다!');
                    }}
                  >
                    <View style={styles.gradeTitleCardHeader}>
                      <View style={[styles.gradeTierBadge, { backgroundColor: '#fffbeb' }]}>
                        <Text style={[styles.gradeTierBadgeText, { color: '#b45309' }]}>
                          💡 #육아_멘토
                        </Text>
                      </View>
                      <Text style={styles.gradeTierLockIcon}>{unlocked ? '🔑' : '🔒'}</Text>
                      {isActive && <View style={styles.gradeTitleActiveTag}><Text style={styles.gradeTitleActiveTagText}>대표 호칭</Text></View>}
                    </View>
                    <View style={styles.gradeTierSection}>
                      <Text style={styles.gradeTierSectionLabel}>획득 조건</Text>
                      <Text style={styles.gradeTierSectionText}>
                        커뮤니티 게시글 10개 이상 작성{'\n'}
                        — 다른 부모들에게 유용한 정보를 공유하는 멘토
                      </Text>
                    </View>
                    <View style={styles.gradeTierSection}>
                      <Text style={styles.gradeTierSectionLabel}>{unlocked ? '혜택' : '잠금 해제 조건'}</Text>
                      <Text style={[styles.gradeTierSectionText, !unlocked && styles.gradeTierLockedText]}>
                        {unlocked
                          ? '게시글 상단 고정 기회 + 멘토 배지 표시'
                          : `게시글 ${10 - postCount}개 더 작성하면 자동 획득`}
                      </Text>
                    </View>
                    {unlocked && !isActive && (
                      <Text style={styles.gradeTitleTapHint}>탭하여 대표 호칭으로 설정 →</Text>
                    )}
                  </TouchableOpacity>
                );
              })()}
            </ScrollView>
          )}
        </View>
      </Modal>}

      {/* ── [REMOVED] Title Picker Modal — merged into UnifiedProfileModal 호칭 tab ── */}

      {/* ── Product Action Modal (long-press on tracked item) ── */}
      <Modal
        visible={productActionModal.visible}
        transparent
        animationType="slide"
        onRequestClose={() => setProductActionModal({ visible: false, productId: null, productName: null })}
      >
        <TouchableWithoutFeedback onPress={() => setProductActionModal({ visible: false, productId: null, productName: null })}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>
        <View style={[styles.sheet, styles.productActionSheet, { paddingBottom: insets.bottom + 20 }]}>
          <View style={styles.sheetHandle} />
          <Text style={styles.productActionTitle} numberOfLines={1}>
            {productActionModal.productName || '상품'}
          </Text>
          <TouchableOpacity
            style={styles.productActionRow}
            onPress={() => {
              setProductActionModal({ visible: false, productId: null, productName: null });
              Alert.alert('알림 끄기', '이 상품의 가격 알림을 껐어요. 🔕');
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.productActionIcon}>🔕</Text>
            <Text style={styles.productActionLabel}>알림 끄기</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.productActionRow}
            onPress={() => {
              const pid = productActionModal.productId;
              setProductActionModal({ visible: false, productId: null, productName: null });
              handleRemoveSaved(pid);
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.productActionIcon}>🗑️</Text>
            <Text style={[styles.productActionLabel, styles.productActionLabelDanger]}>삭제</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.productActionCancelRow}
            onPress={() => setProductActionModal({ visible: false, productId: null, productName: null })}
            activeOpacity={0.8}
          >
            <Text style={styles.productActionCancelText}>취소</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* ── Child Picker Modal ── */}
      <Modal
        visible={childPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setChildPickerOpen(false)}
      >
        <TouchableWithoutFeedback onPress={() => setChildPickerOpen(false)}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>
        <View style={styles.childPickerCard}>
          <Text style={styles.childPickerTitle}>아이 선택</Text>
          {children.map((child) => {
            const isActive = child.id === selectedChild?.id;
            return (
              <TouchableOpacity
                key={child.id}
                style={[styles.childPickerRow, isActive && styles.childPickerRowActive]}
                onPress={() => { handleSelectChild(child.id); setChildPickerOpen(false); }}
                activeOpacity={0.8}
              >
                <Text style={styles.childPickerRowEmoji}>{childEmoji(child)}</Text>
                <Text style={[styles.childPickerRowName, isActive && styles.childPickerRowNameActive]}>
                  {child.name}
                </Text>
                {isActive && <Text style={styles.childPickerCheck}>✓</Text>}
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity
            style={styles.childPickerAddRow}
            onPress={() => { setChildPickerOpen(false); navigation.navigate('ChildAdd'); }}
            activeOpacity={0.8}
          >
            <Text style={styles.childPickerAddText}>+ 새 아이 추가</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7fb' },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // ── Top app bar ──
  appBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  appBarTitle:   { fontSize: 22, fontWeight: '900', color: '#0f172a' },
  appBarActions: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  appBarIcon:    { fontSize: 22 },

  // ── Profile block ──
  profileBlock: {
    backgroundColor: '#fff',
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 18,
    gap: 10,
    position: 'relative',
  },
  profileManageBtn: {
    position: 'absolute', top: 12, right: 16, zIndex: 1,
    borderRadius: 20, borderWidth: 1, borderColor: '#e2e8f0',
    paddingHorizontal: 10, paddingVertical: 4, backgroundColor: '#f8fafc',
  },
  profileManageBtnText: { fontSize: 12, fontWeight: '700', color: '#475569' },

  // Unified profile settings modal
  unifiedSheet: { gap: 0, paddingHorizontal: 0 },
  unifiedProfileTab: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12, gap: 8 },
  unifiedNicknameRow: { flexDirection: 'row', gap: 8 },
  unifiedDivider: { height: 6, backgroundColor: '#f1f5f9', marginVertical: 0 },
  unifiedPillRow: {
    flexDirection: 'row', paddingHorizontal: 20, paddingTop: 14, paddingBottom: 4, gap: 8,
  },
  unifiedPill: {
    flex: 1, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#f1f5f9', alignItems: 'center',
  },
  unifiedPillActive: { backgroundColor: '#0f172a' },
  unifiedPillText: { fontSize: 13, fontWeight: '700', color: '#64748b' },
  unifiedPillTextActive: { color: '#fff' },
  profileTopRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
  },

  // Avatar with camera overlay
  avatarWrapper:    { width: 72, height: 72, flexShrink: 0 },
  avatar: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#dbeafe',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitial:    { fontSize: 30, fontWeight: '900', color: '#1d4ed8' },
  avatarCameraIcon: {
    position: 'absolute', bottom: 0, right: 0,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#e2e8f0',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarCameraText: { fontSize: 11, lineHeight: 14 },

  // Name + badge area
  profileNameArea:  { flex: 1, gap: 5 },
  profileNameRow:   { flexDirection: 'row', alignItems: 'center' },
  profileName:      { fontSize: 20, fontWeight: '900', color: '#0f172a' },
  profileBadgeRow:  { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },

  // Right chevron
  profileEditChevron:     { paddingLeft: 4 },
  profileEditChevronText: { fontSize: 24, color: '#cbd5e1', fontWeight: '300', lineHeight: 28 },

  // Tier badge
  tierBadgePill:     { borderRadius: 20, paddingHorizontal: 9, paddingVertical: 3 },
  tierBadgePillText: { fontSize: 11, fontWeight: '800' },

  // Title badge (shared by header + picker)
  titleBadge:     { borderRadius: 20, paddingHorizontal: 9, paddingVertical: 3 },
  titleBadgeText: { fontSize: 11, fontWeight: '700' },

  // XP bar (standalone full-width)
  xpBarTrack: {
    height: 6, borderRadius: 3, backgroundColor: '#e2e8f0', overflow: 'hidden',
  },
  xpBarFill: {
    height: '100%', borderRadius: 3, backgroundColor: '#2563eb',
  },

  // Copy + grade-info row
  xpCopyRow: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8,
  },
  xpProgressCopy: { flex: 1, fontSize: 11, color: '#64748b', lineHeight: 16 },
  gradeInfoBtn:   { fontSize: 11, fontWeight: '700', color: '#64748b', flexShrink: 0 },
  gradeSettingsBtn: {
    borderRadius: 20, borderWidth: 1, borderColor: '#e2e8f0',
    paddingHorizontal: 8, paddingVertical: 3, backgroundColor: '#f8fafc',
  },
  gradeSettingsBtnText: { fontSize: 11, fontWeight: '700', color: '#475569' },

  // Title picker rows
  titlePickerRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 11, paddingHorizontal: 4,
    borderRadius: 10,
  },
  titlePickerRowActive:  { backgroundColor: '#f8fafc' },
  titlePickerBadge:      { flex: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, alignSelf: 'flex-start' },
  titlePickerCheck:      { fontSize: 16, color: '#2563eb', fontWeight: '900', marginLeft: 8 },

  // ── Grade info modal ──
  gradeSheet: {
    maxHeight: '85%',
    paddingHorizontal: 0,
    paddingTop: 16,
  },
  gradeSheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, marginBottom: 6,
  },
  gradeSheetTitle: { fontSize: 17, fontWeight: '900', color: '#0f172a' },
  gradeSheetClose: { fontSize: 18, color: '#94a3b8' },
  gradeSheetSub: {
    fontSize: 13, color: '#64748b', lineHeight: 18,
    paddingHorizontal: 20, marginBottom: 14,
  },
  gradeScrollArea: { paddingHorizontal: 14, paddingTop: 4 },

  // Custom tab switcher
  gradeTabRow: {
    flexDirection: 'row',
    marginHorizontal: 20, marginBottom: 12,
    borderRadius: 10, backgroundColor: '#f1f5f9',
    padding: 3, gap: 3,
  },
  gradeTab: {
    flex: 1, paddingVertical: 8, borderRadius: 8,
    alignItems: 'center',
  },
  gradeTabActive: {
    backgroundColor: '#fff',
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 3 },
      android: { elevation: 2 },
    }),
  },
  gradeTabText:       { fontSize: 14, fontWeight: '600', color: '#94a3b8' },
  gradeTabTextActive: { color: '#0f172a', fontWeight: '800' },

  // Title cards (호칭 tab)
  gradeTitleCard: {
    borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0',
    borderLeftWidth: 4,
    backgroundColor: '#fff',
    padding: 10, marginBottom: 6, gap: 6,
  },
  gradeTitleCardActive: {
    borderColor: '#2563eb', borderWidth: 2, borderLeftWidth: 4,
    backgroundColor: '#f8fbff',
  },
  gradeTitleCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  gradeTitleActiveTag: {
    backgroundColor: '#2563eb', borderRadius: 20,
    paddingHorizontal: 6, paddingVertical: 2, marginLeft: 'auto',
  },
  gradeTitleActiveTagText: { fontSize: 9, fontWeight: '800', color: '#fff' },
  gradeTitleTapHint: {
    fontSize: 10, color: '#2563eb', fontWeight: '600', marginTop: 1,
  },
  gradeTierCard: {
    borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    padding: 10, marginBottom: 6, gap: 6,
    opacity: 0.7,
  },
  gradeTierCardUnlocked: { backgroundColor: '#fff', opacity: 1 },
  gradeTierCardCurrent: {
    borderColor: '#2563eb', borderWidth: 2,
    ...Platform.select({
      ios:     { shadowColor: '#2563eb', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 },
      android: { elevation: 2 },
    }),
  },
  gradeTierHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  gradeTierBadge: {
    borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3,
  },
  gradeTierBadgeText: { fontSize: 12, fontWeight: '800' },
  gradeTierLockIcon:  { fontSize: 14, marginLeft: 'auto' },
  gradeTierCurrentTag: {
    backgroundColor: '#2563eb', borderRadius: 20,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  gradeTierCurrentTagText: { fontSize: 9, fontWeight: '800', color: '#fff' },
  gradeTierSection:    { gap: 1 },
  gradeTierSectionLabel: { fontSize: 9, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.3 },
  gradeTierSectionText: { fontSize: 12, fontWeight: '500', color: '#334155', lineHeight: 17 },
  gradeTierLockedText:  { color: '#cbd5e1', letterSpacing: 0 },

  // ── Child dropdown trigger ──
  childDropBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#f1f5f9', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 7,
    flex: 1, alignSelf: 'flex-start',
  },
  childDropEmoji: { fontSize: 17 },
  childDropName:  { fontSize: 14, fontWeight: '800', color: '#0f172a', flexShrink: 1 },
  childDropCaret: { fontSize: 11, color: '#64748b', marginLeft: 2 },

  // ── Child dashboard card ──
  childDashCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16, marginTop: 12, marginBottom: 4,
    borderRadius: 16,
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 16,
    borderWidth: 1, borderColor: '#e2e8f0',
    gap: 10,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6 },
      android: { elevation: 2 },
    }),
  },
  childDashHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  childDashEditBtn: {
    backgroundColor: '#f1f5f9', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  childDashEditIcon: { fontSize: 14 },
  childDashBadges: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 6,
  },
  childDashBadge: {
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4,
  },
  childDashBadgeText: { fontSize: 12, fontWeight: '700' },
  childDashNoBadgeHint: {
    fontSize: 13, color: '#94a3b8', fontStyle: 'italic', lineHeight: 20,
  },
  childDashEmpty: {
    marginHorizontal: 16, marginTop: 12, marginBottom: 4,
    borderRadius: 16, borderWidth: 1.5, borderColor: '#e2e8f0', borderStyle: 'dashed',
    paddingVertical: 18, alignItems: 'center',
  },
  childDashEmptyText: { fontSize: 14, fontWeight: '700', color: '#94a3b8' },

  // ── Child picker modal ──
  childPickerCard: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 32,
    gap: 2,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.1, shadowRadius: 12 },
      android: { elevation: 16 },
    }),
  },
  childPickerTitle: {
    fontSize: 13, fontWeight: '800', color: '#94a3b8',
    letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8,
  },
  childPickerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 13, paddingHorizontal: 4,
    borderRadius: 12,
  },
  childPickerRowActive:    { backgroundColor: '#eff6ff' },
  childPickerRowEmoji:     { fontSize: 22 },
  childPickerRowName:      { flex: 1, fontSize: 15, fontWeight: '600', color: '#334155' },
  childPickerRowNameActive: { color: '#1d4ed8', fontWeight: '800' },
  childPickerCheck:        { fontSize: 16, color: '#2563eb', fontWeight: '900' },
  childPickerAddRow: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: 6,
    paddingVertical: 13, paddingHorizontal: 4,
    borderTopWidth: 1, borderTopColor: '#f1f5f9',
  },
  childPickerAddText: { fontSize: 14, fontWeight: '700', color: '#2563eb' },

  // ── Activity stats — single fixed row ──
  statsRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff',
    borderTopWidth: 1, borderTopColor: '#f1f5f9',
    paddingVertical: 12, paddingHorizontal: 4,
  },
  statCell:    { flex: 1, alignItems: 'center', gap: 3, paddingHorizontal: 2 },
  statNumber:  { fontSize: 16, fontWeight: '900', color: '#0f172a' },
  statLabel:   { fontSize: 10, fontWeight: '600', color: '#64748b', textAlign: 'center', lineHeight: 13 },
  statDivider: { width: 1, height: 30, backgroundColor: '#e2e8f0' },

  // ── Section divider ──
  sectionDivider: { height: 8, backgroundColor: '#f1f5f9' },

  // ── Price Tracking Widget ──
  trackingWidget: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  trackingWidgetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12,
  },
  trackingWidgetTitle: { fontSize: 18, fontWeight: '900', color: '#0f172a' },
  trackingSubtitle:    { fontSize: 13, color: '#94a3b8', lineHeight: 18, marginBottom: 12 },

  // Header action buttons
  trackingClipboardBtn: {
    backgroundColor: '#f1f5f9', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  trackingClipboardText: { fontSize: 14, fontWeight: '700', color: '#475569' },
  trackingViewAllBtn: {
    backgroundColor: '#eff6ff', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  trackingViewAllText: { fontSize: 13, fontWeight: '700', color: '#2563eb' },

  // ── Empty state ──
  trackingAddCardFull: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 12, borderWidth: 1.5, borderColor: '#bfdbfe', borderStyle: 'dashed',
    backgroundColor: '#f8fbff',
    paddingVertical: 16, marginBottom: 20,
  },
  trackingAddCardFullPlus:  { fontSize: 24, color: '#60a5fa', lineHeight: 28 },
  trackingAddCardFullLabel: { fontSize: 14, fontWeight: '700', color: '#60a5fa' },
  trackingAddCardFullSub:   { fontSize: 11, color: '#93c5fd', marginTop: 2 },

  trackingEmptyDivider: {
    height: 8, backgroundColor: '#f1f5f9', width: '100%', marginVertical: 24,
  },
  trackingEmptyRecTitle: {
    fontSize: 18, fontWeight: '900', color: '#0f172a', marginBottom: 10,
  },
  // ── Empty state rec cards (horizontal) ──
  trackingRecHScroll: { paddingBottom: 6, gap: 10 },
  trackingRecCard: {
    width: 130,
    borderRadius: 12, backgroundColor: 'transparent',
    overflow: 'visible',
  },
  trackingRecCardImage: {
    width: '100%', height: 120,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
  },
  trackingRecCardBody: {
    paddingTop: 8, paddingHorizontal: 2, flex: 1, gap: 4,
  },
  trackingRecCardName:    { fontSize: 12, fontWeight: '500', color: '#1e293b', lineHeight: 17 },
  trackingRecPriceRow:    { flexDirection: 'row', alignItems: 'center', gap: 4 },
  trackingRecOrig: {
    fontSize: 10, color: '#cbd5e1', textDecorationLine: 'line-through',
  },
  trackingRecDropBadge: {
    backgroundColor: '#fef2f2', borderRadius: 4,
    paddingHorizontal: 4, paddingVertical: 1,
  },
  trackingRecDropText:    { fontSize: 10, fontWeight: '700', color: '#dc2626' },
  trackingRecCurrent:     { fontSize: 13, fontWeight: '800', color: '#0f172a' },
  trackingRecAddBtn: {
    marginTop: 6,
    backgroundColor: '#f1f5f9', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6, alignSelf: 'stretch', alignItems: 'center',
  },
  trackingRecAddText: { fontSize: 11, fontWeight: '600', color: '#374151' },

  // ── Active state: horizontal scroll ──
  trackingHScroll: { paddingBottom: 4, gap: 10 },

  // Polcent-style square add card
  trackingAddSquareCard: {
    width: 140, height: 165,
    borderRadius: 12,
    borderWidth: 1.5, borderColor: '#e2e8f0',
    borderStyle: 'dashed',
    backgroundColor: '#f8fafc',
    alignItems: 'center', justifyContent: 'center',
    gap: 6,
  },
  trackingAddSquarePlus:  { fontSize: 36, color: '#94a3b8', lineHeight: 40 },
  trackingAddSquareLabel: { fontSize: 13, fontWeight: '700', color: '#94a3b8' },

  // Polcent-style stacked commerce card
  trackingItemCard: {
    width: 140,
    borderRadius: 12, backgroundColor: '#fff',
    borderWidth: 1, borderColor: '#f1f5f9',
    marginRight: 12, padding: 0, overflow: 'hidden',
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 6 },
      android: { elevation: 2 },
    }),
  },
  trackingImageWrap: {
    width: 140, height: 140, backgroundColor: '#f1f5f9', overflow: 'hidden',
    marginBottom: 8,
  },
  trackingItemThumb:         { width: '100%', height: '100%' },
  trackingItemThumbFallback: { alignItems: 'center', justifyContent: 'center' },
  trackingSourceBadge: {
    fontSize: 10, fontWeight: '700', color: '#64748b',
    marginBottom: 4, paddingHorizontal: 10,
  },
  trackingItemName: {
    fontSize: 13, fontWeight: '600', color: '#334155',
    lineHeight: 18, marginBottom: 6, paddingHorizontal: 10,
  },

  // Price row: strikethrough + current
  trackingPriceRow:  {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    flexWrap: 'wrap', paddingHorizontal: 10,
  },
  trackingOrigPrice: { fontSize: 11, color: '#cbd5e1', textDecorationLine: 'line-through' },
  trackingItemPrice: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  trackingTrendBadge: {
    fontSize: 12, fontWeight: '800', color: '#3b82f6',
    paddingHorizontal: 10, paddingBottom: 10, marginTop: 2,
  },

  // ── Product action modal (long-press) ──
  productActionSheet: {
    paddingHorizontal: 0,
    gap: 0,
  },
  productActionTitle: {
    fontSize: 14, fontWeight: '700', color: '#64748b',
    paddingHorizontal: 20, paddingTop: 4, paddingBottom: 12,
  },
  productActionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    paddingHorizontal: 20, paddingVertical: 16,
    borderTopWidth: 1, borderTopColor: '#f1f5f9',
  },
  productActionIcon: { fontSize: 22, width: 28, textAlign: 'center' },
  productActionLabel: { fontSize: 16, fontWeight: '600', color: '#1e293b' },
  productActionLabelDanger: { color: '#dc2626' },
  productActionCancelRow: {
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 16,
    marginTop: 4,
    borderTopWidth: 1, borderTopColor: '#f1f5f9',
  },
  productActionCancelText: { fontSize: 16, fontWeight: '700', color: '#94a3b8' },

  // ── How-to guide button ──
  guideButtonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
  },
  guideButton: {
    backgroundColor: '#1f2937',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  guideButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },

  // ── How-to guide modal ──
  guideSheet: {
    gap: 0,
    paddingHorizontal: 24,
  },
  guideHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 24,
  },
  guideTitle:    { fontSize: 17, fontWeight: '900', color: '#0f172a' },
  guideCloseBtn: { fontSize: 18, color: '#94a3b8' },
  guideSteps: { gap: 0 },
  guideStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  guideStepNum: {
    width: 28, height: 28,
    borderRadius: 14,
    backgroundColor: '#2563eb',
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  guideStepNumText: { fontSize: 13, fontWeight: '900', color: '#fff' },
  guideStepText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#1e293b',
    lineHeight: 22,
    paddingBottom: 2,
  },
  guideStepConnector: {
    width: 2,
    height: 18,
    backgroundColor: '#dbeafe',
    marginLeft: 13,
    marginVertical: 3,
  },
  guideCta: {
    marginTop: 28,
    backgroundColor: '#2563eb',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  guideCtaText: { color: '#fff', fontWeight: '800', fontSize: 15 },

  // ── Menu ──
  menuSectionHeader: {
    paddingHorizontal: 16, paddingTop: 18, paddingBottom: 6,
    backgroundColor: '#f5f7fb',
  },
  menuSectionTitle: { fontSize: 12, fontWeight: '800', color: '#94a3b8', letterSpacing: 0.5 },
  menuItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff',
    paddingHorizontal: 16, paddingVertical: 15,
    borderBottomWidth: 1, borderBottomColor: '#f8fafc',
  },
  menuItemLeft:        { flexDirection: 'row', alignItems: 'center', gap: 14 },
  menuItemIcon:        { fontSize: 20, width: 28, textAlign: 'center' },
  menuItemLabel:       { fontSize: 15, fontWeight: '600', color: '#0f172a' },
  menuItemLabelDanger: { color: '#ef4444' },
  menuItemRight:       { flexDirection: 'row', alignItems: 'center', gap: 6 },
  menuItemValue:       { fontSize: 13, color: '#94a3b8', fontWeight: '600' },
  menuItemChevron:     { fontSize: 20, color: '#cbd5e1', fontWeight: '300' },

  // ── Admin ──
  adminBtn: {
    margin: 16, backgroundColor: '#0f172a', borderRadius: 12,
    paddingVertical: 14, alignItems: 'center',
  },
  adminBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },

  // ── Bottom sheets ──
  backdrop:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheetWrap: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 20, paddingTop: 12, gap: 12,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.1, shadowRadius: 12 },
      android: { elevation: 16 },
    }),
  },
  sheetHandle: {
    alignSelf: 'center', width: 36, height: 4,
    borderRadius: 2, backgroundColor: '#cbd5e1', marginBottom: 4,
  },
  sheetTitle:   { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  sheetSub:     { fontSize: 13, color: '#64748b' },
  marketRow:    { flexDirection: 'row', gap: 12 },
  marketItem: {
    flex: 1, alignItems: 'center', gap: 4,
    backgroundColor: '#f8fafc', borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: '#e4e7ed',
  },
  marketItemDisabled: { opacity: 0.45 },
  marketEmoji:        { fontSize: 20 },
  marketName:         { fontSize: 11, fontWeight: '700', color: '#334155' },
  marketNameDisabled: { color: '#94a3b8' },
  comingSoon:         { fontSize: 9, color: '#94a3b8', fontWeight: '600' },
  sheetInputRow:      { flexDirection: 'row', gap: 8, alignItems: 'center' },
  sheetUrlInput: {
    flex: 1, backgroundColor: '#f8fafc', borderRadius: 10,
    borderWidth: 1, borderColor: '#e4e7ed',
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: '#0f172a',
  },
  sheetRegisterBtn: {
    backgroundColor: '#2563eb', borderRadius: 10,
    paddingHorizontal: 16, paddingVertical: 10,
    alignItems: 'center', justifyContent: 'center', minWidth: 56,
  },
  sheetRegisterBtnDisabled: { backgroundColor: '#cbd5e1' },
  sheetRegisterBtnText:     { color: '#fff', fontWeight: '800', fontSize: 14 },
});
