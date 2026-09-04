import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  FlatList,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import { db, auth } from '../firebase/config';
import { Ionicons } from '@expo/vector-icons';
import { useTracking } from '../context/TrackingContext';
import * as IntentLauncher from 'expo-intent-launcher';
import { removeSavedProductById, getCurrentUserSegment, getPeerPopularityMap, getPurchaseFrequencyMap } from '../services/saveService';
import { getPriceIntelligence } from '../services/priceTrackingService';
import { togglePriceAlert } from '../services/priceAlertService';
import { setExpectingCoupangReturn } from '../utils/coupangIntentFlag';
import { TrackingCard } from '../components/TrackingCard';
import { COLORS } from '../constants/theme';
import { useUser } from '../context/UserContext';
import { resolveAgingPriceDisplay } from '../utils/priceDisplay';
import { applyCurationFilter } from '../utils/curationFilters';

// ─── Curation categories ──────────────────────────────────────────────────────

const CURATION_CATEGORIES = [
  { id: 'timing',   label: '구매 타이밍', icon: 'alarm-outline',   color: '#6366f1' },
  { id: 'lowest',   label: '역대 최저가', icon: 'flame-outline',   color: '#ef4444' },
  { id: 'peers',    label: '또래 추천',   icon: 'people-outline',  color: '#f59e0b' },
  { id: 'frequent', label: '자주 산 상품', icon: 'cart-outline',   color: '#10b981' },
];

const SORT_OPTIONS = ['최신순', '할인율순', '오래된순', '낮은가격순', '즐겨찾기순'];

// ─── Filter (관심상품 필터) ────────────────────────────────────────────────────
// Only dimensions backed by real, currently-collected data — no 카테고리
// (products don't carry a category field) and no 쇼핑몰 (single-source: 쿠팡
// 공식 파트너스 API only). Faking either would repeat the exact
// "looks like it works but does nothing" problem already fixed elsewhere.

const DEFAULT_FILTERS = { deliveryType: 'all', excludeOutOfStock: false, priceRange: null };

const DELIVERY_FILTER_OPTIONS = [
  { value: 'all',          label: '전체' },
  { value: 'rocket',       label: '🚀 로켓배송' },
  { value: 'fresh',        label: '🌿 로켓프레시' },
  { value: 'rocketSeller', label: '🚀 판매자로켓' },
  { value: 'normal',       label: '📦 판매자배송' },
];

// [min, max] — max:null means "이상" (no upper bound)
const PRICE_FILTER_OPTIONS = [
  { label: '전체',       range: null },
  { label: '1만원 이하',  range: [0, 10000] },
  { label: '1~3만원',    range: [10000, 30000] },
  { label: '3~5만원',    range: [30000, 50000] },
  { label: '5만원 이상',  range: [50000, null] },
];

function applyProductFilters(items, filters) {
  let arr = items;
  if (filters.deliveryType !== 'all') {
    arr = arr.filter((i) => i.deliveryType === filters.deliveryType);
  }
  if (filters.excludeOutOfStock) {
    arr = arr.filter((i) => !i.isOutOfStock);
  }
  if (filters.priceRange) {
    const [min, max] = filters.priceRange;
    arr = arr.filter((i) => {
      const p = i.currentPrice ?? 0;
      return p >= min && (max == null || p <= max);
    });
  }
  return arr;
}

function isSameRange(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  return a[0] === b[0] && a[1] === b[1];
}


// ─── Curation card ────────────────────────────────────────────────────────────

// images: up to 4 URIs from globalTrackedItems (may be empty)
function CurationCard({ category, images, count, onPress }) {
  return (
    <TouchableOpacity style={styles.curationCardWrap} onPress={onPress} activeOpacity={0.75}>
      {/* Folder container */}
      <View style={styles.curationCard}>
        {/* Count badge top-right */}
        <View style={styles.curationBadge}>
          <Text style={styles.curationBadgeText}>{count}</Text>
        </View>

        {/* 2×2 product image grid (folder UI) */}
        <View style={styles.curationImageGrid}>
          {images.length === 0 ? (
            <View style={styles.curationImageFallback}>
              <Ionicons name={category.icon} size={20} color={category.color} />
            </View>
          ) : (
            images.map((uri, idx) => (
              uri
                ? <Image key={idx} source={{ uri }} style={styles.curationImageCell} resizeMode="cover" />
                : <View key={idx} style={[styles.curationImageCell, { backgroundColor: '#e2e8f0' }]} />
            ))
          )}
        </View>
      </View>

      {/* Label sits below the folder, outside the bg container */}
      <Text style={styles.curationLabel} numberOfLines={1}>{category.label}</Text>
    </TouchableOpacity>
  );
}

// ─── Zoom & Highlight animation demo ─────────────────────────────────────────

function TutorialVideo() {
  return (
    <Image
      source={require('../../assets/tutorial.gif')}
      style={{ width: 240, height: 240, alignSelf: 'center', resizeMode: 'contain', marginTop: 12, marginBottom: 12 }}
    />
  );
}

const demoStyles = StyleSheet.create({
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function TrackingListScreen({ navigation }) {
  const { globalTrackedItems, addTrackedItem, removeTrackedItem, updateTrackedItems, setTrackedItems } = useTracking();
  const { isWowMember } = useUser();

  // ─── Firestore real-time listener ────────────────────────────────────────────
  // Populates globalTrackedItems from user_saved_products + products docs.
  // Fires immediately on auth resolution and on every Firestore change thereafter.
  useEffect(() => {
    let unsubSnapshot = null;

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      console.log('[TrackingList] Auth state changed. User:', user?.uid);

      if (unsubSnapshot) { unsubSnapshot(); unsubSnapshot = null; }

      if (!user) {
        setTrackedItems([]);
        return;
      }

      const q = query(
        collection(db, 'user_saved_products'),
        where('userId', '==', user.uid),
      );

      unsubSnapshot = onSnapshot(q, async (snapshot) => {
        console.log('[TrackingList] Snapshot docs count:', snapshot.size);
        if (snapshot.empty) { setTrackedItems([]); return; }

        try {
          // Sort newest-first here (not via Firestore orderBy) — a composite
          // index on (userId, createdAt) doesn't exist yet, and this query
          // already fetches the whole list, so sorting client-side avoids an
          // index-build wait. "최신순"/"오래된순" in the sort menu below both
          // depend on this actually being creation order.
          const linkages = snapshot.docs
            .map((d) => ({ savedId: d.id, ...d.data() }))
            .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
          console.log('[TrackingList] productGroupIds:', linkages.map((l) => l.productGroupId));

          // Batch-fetch this user's price alerts once so per-item lookup is O(1),
          // matching the pattern in priceAlertService.getSavedProductsWithPriceSignals.
          const alertsSnap = await getDocs(
            query(collection(db, 'price_alerts'), where('userId', '==', user.uid))
          );
          const alertActiveByProductId = {};
          alertsSnap.docs.forEach((d) => {
            alertActiveByProductId[d.data().productId] = Boolean(d.data().isActive);
          });

          const enriched = await Promise.all(
            linkages.map(async (link) => {
              if (!link.productGroupId) {
                console.error('[TrackingList] Missing productGroupId:', link);
                return null;
              }
              const [productSnap, intel] = await Promise.all([
                getDoc(doc(db, 'products', link.productGroupId)),
                getPriceIntelligence(link.productGroupId, link.optionId ?? null),
              ]);
              if (!productSnap.exists()) {
                console.error('[TrackingList] Product doc not found:', link.productGroupId);
                return null;
              }
              const p = productSnap.data();
              return {
                productId:        link.productGroupId,
                savedId:          link.savedId,
                originalId:       p.originalId ?? null,
                optionId:         link.optionId ?? null,
                vendorItemId:     link.vendorItemId ?? null,
                name:             p.name         ?? '상품',
                brand:            p.brand        ?? null,
                image:            p.image        ?? null,
                currentPrice:     intel?.currentPrice ?? p.currentPrice ?? 0,
                wowPrice:         p.wowPrice ?? null,
                priceDrop:        intel?.priceDrop ?? 0,
                // averagePrice = fallback for the first ~week before enough
                // daily_prices data exists (see calcDiscountPct's priority
                // order in priceDisplay.js — marketingDiscountPct wins once
                // it's available).
                averagePrice:        intel?.average ?? null,
                marketingAverage:    intel?.marketingAverage ?? null,
                marketingDiscountPct: intel?.marketingDiscountPct ?? null,
                lowestPrice:      intel?.lowest ?? null,
                priceTrackedDays: intel?.priceTrackedDays ?? 0,
                guidance:         intel?.guidance ?? null,
                coupangUrl:       p.affiliateUrl ?? null,
                isOutOfStock:     p.isOutOfStock ?? false,
                // null (not 'normal') when the field was never captured —
                // e.g. products registered before delivery-type extraction
                // existed. 'normal' now means "checked, confirmed non-rocket"
                // and renders an explicit 판매자배송 badge, so defaulting
                // absent data to 'normal' would misreport "확인 안 됨" as
                // "일반배송으로 확인됨".
                deliveryType:     p.deliveryType ?? null,
                spec:             p.spec ?? null,
                targetPrice:      link.targetPrice ?? undefined,
                isPriceAlertOn:   alertActiveByProductId[link.productGroupId] ?? false,
                isRestockAlertOn: link.isRestockAlertOn ?? false,
                isFavorite:       link.isFavorite ?? false,
              };
            })
          );

          const valid = enriched.filter(Boolean);
          console.log('[TrackingList] Enriched valid count:', valid.length);
          setTrackedItems(valid);
        } catch (err) {
          console.error('[TrackingList] Enrichment error:', err);
        }
      }, (err) => {
        console.error('[TrackingList] onSnapshot error:', err);
      });
    });

    return () => { unsubAuth(); if (unsubSnapshot) unsubSnapshot(); };
  }, [setTrackedItems]);

  // ─── Curation signals: peer popularity + purchase frequency ─────────────────
  // Both need async aggregation queries the (synchronous) curation filter
  // can't do inline, so they're fetched once here and passed down as plain
  // maps. Re-fetched whenever the tracked list changes (new/removed item can
  // change which products are even worth counting).
  const [peerCounts,     setPeerCounts]     = useState({});
  const [purchaseCounts, setPurchaseCounts] = useState({});

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid || globalTrackedItems.length === 0) {
      setPeerCounts({});
      setPurchaseCounts({});
      return;
    }
    let cancelled = false;
    (async () => {
      const [segment, purchaseMap] = await Promise.all([
        getCurrentUserSegment(uid),
        getPurchaseFrequencyMap(uid),
      ]);
      const peerMap = await getPeerPopularityMap(segment);
      if (cancelled) return;
      setPeerCounts(peerMap);
      setPurchaseCounts(purchaseMap);
    })();
    return () => { cancelled = true; };
  }, [globalTrackedItems.length]);

  const [isEditMode,        setIsEditMode]        = useState(false);
  const [selectedIds,       setSelectedIds]       = useState([]);
  const [viewMode,          setViewMode]          = useState('list');
  const [showTooltip,       setShowTooltip]       = useState(false);
  const [showOnlyFavorites,  setShowOnlyFavorites]  = useState(false);
  const [sortOption,         setSortOption]         = useState('최신순');
  const [isSortModalVisible,   setIsSortModalVisible]   = useState(false);
  const [isFilterModalVisible, setIsFilterModalVisible] = useState(false);
  const [filters,      setFilters]      = useState(DEFAULT_FILTERS);
  const [draftFilters, setDraftFilters] = useState(DEFAULT_FILTERS);
  const isFilterActive = filters.deliveryType !== 'all' || filters.excludeOutOfStock || filters.priceRange != null;

  const openFilterModal = useCallback(() => {
    setDraftFilters(filters);
    setIsFilterModalVisible(true);
  }, [filters]);

  // Preview count must respect the 즐겨찾기 toggle too — otherwise opening
  // the filter modal while "즐겨찾기만 보기" is on shows a count that
  // ignores it, so "N개 상품 보기" promises more than applying actually shows.
  const draftFilteredCount = useMemo(() => {
    const base = showOnlyFavorites ? globalTrackedItems.filter((i) => i.isFavorite) : globalTrackedItems;
    return applyProductFilters(base, draftFilters).length;
  }, [globalTrackedItems, showOnlyFavorites, draftFilters]);

  // Custom modals (RULE-9.4: no native Alert)
  const [clipConfirmUrl,    setClipConfirmUrl]    = useState(null);   // truthy = show confirm modal
  const [successModal,      setSuccessModal]      = useState(null);   // { title, body }
  const [pendingClipAction, setPendingClipAction] = useState(null);   // async fn to run on confirm

  // Items shown in the FlatList — favorites toggle + 필터 modal both applied.
  const listData = useMemo(() => {
    const base = showOnlyFavorites
      ? globalTrackedItems.filter((i) => i.isFavorite)
      : globalTrackedItems;
    return applyProductFilters(base, filters);
  }, [globalTrackedItems, showOnlyFavorites, filters]);

  // Apply sort on top of the filtered list.
  const sortedData = useMemo(() => {
    const arr = [...listData];
    switch (sortOption) {
      case '오래된순':
        return arr.reverse();
      case '할인율순':
        // Same weighted-average-vs-current metric the card badge shows
        // (resolveAgingPriceDisplay) — sorting by a different metric than
        // what's on screen would make the order look wrong to the user.
        return arr.sort((a, b) => {
          const pctA = resolveAgingPriceDisplay(a, isWowMember).discountPct ?? 0;
          const pctB = resolveAgingPriceDisplay(b, isWowMember).discountPct ?? 0;
          return pctB - pctA;
        });
      case '낮은가격순':
        return arr.sort((a, b) => (a.currentPrice || 0) - (b.currentPrice || 0));
      case '즐겨찾기순':
        return arr.sort((a, b) => (b.isFavorite ? 1 : 0) - (a.isFavorite ? 1 : 0));
      default: // 최신순 — context prepends newest, so insertion order = newest first
        return arr;
    }
  }, [listData, sortOption, isWowMember]);



  // Clipboard auto-detection handled globally by GlobalMagicNudge (intent-flag gated)

  // Dismiss tooltip whenever the screen goes out of focus (tab switch, navigation)
  useFocusEffect(useCallback(() => {
    return () => setShowTooltip(false);
  }, []));

  const exitEditMode = useCallback(() => { setIsEditMode(false); setSelectedIds([]); }, []);

  const toggleSelect = useCallback((id) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]);
  }, []);

  const activateEditMode = useCallback((itemId) => {
    setIsEditMode(true);
    setSelectedIds([itemId]);
  }, []);

  const allSelected = sortedData.length > 0 && selectedIds.length === sortedData.length;

  const handleSelectAll = useCallback(() => {
    // savedId first — always unique per tracked link, unlike productId which
    // repeats when the same parent is tracked under multiple options.
    setSelectedIds(allSelected ? [] : sortedData.map((i) => i.savedId ?? i.productId));
  }, [allSelected, sortedData]);

  const handleDeleteSelected = useCallback(() => {
    Alert.alert(
      '상품 삭제',
      `선택된 상품 ${selectedIds.length}개를 삭제하시겠습니까?`,
      [
        { text: '아니오', style: 'cancel' },
        {
          text: '예', style: 'destructive',
          onPress: async () => {
            // Optimistic local removal — the Firestore onSnapshot listener will
            // reconcile shortly after with the authoritative deleted state.
            selectedIds.forEach((id) => removeTrackedItem(id));
            exitEditMode();
            // Direct delete-by-id (selectedIds are savedId values) — not
            // toggleSavedProduct's query-by-productGroupId, which could
            // delete the WRONG option's link if this parent has more than
            // one tracked option.
            await Promise.all(
              selectedIds.map((savedId) => removeSavedProductById(savedId).catch(() => {}))
            );
          },
        },
      ]
    );
  }, [selectedIds, removeTrackedItem, exitEditMode]);

  // ── Toggle helpers: compute majority state across selected items, then flip ──
  // If majority (≥50%) of selected items have the flag ON, turn all OFF; else ON.
  const handleToggleFlag = useCallback((flag) => {
    if (selectedIds.length === 0) return;
    const selected = globalTrackedItems.filter((i) => selectedIds.includes(i.savedId ?? i.productId));
    const onCount  = selected.filter((i) => i[flag]).length;
    const nextVal  = onCount < selected.length; // flip to ON unless all already ON
    updateTrackedItems(selectedIds, { [flag]: nextVal });

    const uid = auth.currentUser?.uid;
    if (!uid) return;
    if (flag === 'isPriceAlertOn') {
      // togglePriceAlert flips whatever the current server state is — only call
      // it for items that actually need to change to reach nextVal.
      selected
        .filter((i) => Boolean(i.isPriceAlertOn) !== nextVal)
        .forEach((i) => togglePriceAlert(uid, i.productId).catch(() => {}));
    } else if (flag === 'isFavorite' || flag === 'isRestockAlertOn') {
      selected.forEach((i) => {
        if (!i.savedId) return;
        updateDoc(doc(db, 'user_saved_products', i.savedId), { [flag]: nextVal }).catch(() => {});
      });
    }
  }, [selectedIds, globalTrackedItems, updateTrackedItems]);

  // Derive "active" state of each toggle button from selected items for visual feedback
  const selectedItems     = globalTrackedItems.filter((i) => selectedIds.includes(i.savedId ?? i.productId));
  const allPriceAlertOn   = selectedItems.length > 0 && selectedItems.every((i) => i.isPriceAlertOn);
  const allRestockAlertOn = selectedItems.length > 0 && selectedItems.every((i) => i.isRestockAlertOn);
  const allFavorite       = selectedItems.length > 0 && selectedItems.every((i) => i.isFavorite);

  // Header: dynamic title + guide button (normal mode) / 완료 button (edit mode)
  useEffect(() => {
    navigation.setOptions({
      title: globalTrackedItems.length > 0
        ? `관심상품 (총 ${globalTrackedItems.length}개)`
        : '관심상품',
      headerRight: isEditMode
        ? () => (
            <TouchableOpacity
              onPress={exitEditMode}
              style={{ marginRight: 16 }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#ef4444' }}>완료</Text>
            </TouchableOpacity>
          )
        : undefined,
    });
  }, [navigation, isEditMode, exitEditMode, globalTrackedItems.length]);

  // Summary bar + curation dashboard
  const SummaryBar = (
    <View>
      {/* Top row */}
      <View style={styles.summaryBar}>
        {isEditMode ? (
          <TouchableOpacity onPress={handleSelectAll} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.selectAllText}>{allSelected ? '전체 해제' : '전체 선택'}</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.summaryLeft}>
            <Text style={styles.summaryTitle}>지금 사면 좋은 상품</Text>
            <TouchableOpacity
              onPress={() => setShowTooltip(true)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{ marginLeft: 4 }}
            >
              <Ionicons name="information-circle-outline" size={16} color="#94a3b8" />
            </TouchableOpacity>
          </View>
        )}
        <View style={styles.summaryRight} />
      </View>

      {/* Horizontal curation dashboard (folder cards) — always visible */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.curationRow}
      >
        {CURATION_CATEGORIES.map((cat) => {
          const matched = applyCurationFilter(globalTrackedItems, cat.id, peerCounts, purchaseCounts, isWowMember);
          const matchCount = matched.length;
          const previewImages = matched.slice(0, 4).map((i) => i.image ?? null);
          return (
            <CurationCard
              key={cat.id}
              category={cat}
              images={previewImages}
              count={matchCount}
              onPress={isEditMode ? undefined : () => navigation.navigate('CurationDetail', { curationId: cat.id, title: cat.label })}
            />
          );
        })}
      </ScrollView>
      {/* Section divider */}
      <View style={styles.curationDivider} />

      {/* ── Control bar — always visible, directly under the curation
          dashboard. Must render before the empty state below so 필터/정렬
          never appear to "belong" under a "조건에 맞는 상품이 없어요"
          message — the controls are what produced that result, so they
          stay above it, not below. ── */}
      <View style={styles.controlBar}>
        {/* Left: sort order */}
        <TouchableOpacity
          style={styles.controlSortBtn}
          onPress={isEditMode ? undefined : () => setIsSortModalVisible(true)}
          activeOpacity={0.7}
        >
          <Text style={styles.controlSortText}>{sortOption}</Text>
          <Ionicons name="chevron-down" size={14} color="#334155" />
        </TouchableOpacity>

        {/* Right: filter / edit / view toggle / quick-favorite */}
        <View style={styles.controlRight}>
          <TouchableOpacity
            style={styles.controlIconBtn}
            onPress={isEditMode ? undefined : openFilterModal}
            activeOpacity={0.7}
          >
            <Ionicons name="funnel-outline" size={16} color={isFilterActive ? '#3b82f6' : '#64748b'} />
            <Text style={[styles.controlIconText, isFilterActive && { color: '#3b82f6', fontWeight: '700' }]}>필터</Text>
            {isFilterActive && <View style={styles.filterActiveDot} />}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.controlIconBtn}
            onPress={() => setIsEditMode(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="checkbox-outline" size={16} color={isEditMode ? '#3b82f6' : '#64748b'} />
            <Text style={[styles.controlIconText, isEditMode && { color: '#3b82f6' }]}>편집</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setViewMode((v) => v === 'list' ? 'grid2' : v === 'grid2' ? 'grid3' : 'list')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.7}
          >
            <Ionicons
              name={viewMode === 'list' ? 'list-outline' : viewMode === 'grid2' ? 'grid-outline' : 'apps-outline'}
              size={20} color="#64748b"
            />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setShowOnlyFavorites((v) => !v)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.7}
          >
            <Ionicons
              name={showOnlyFavorites ? 'star' : 'star-outline'}
              size={22}
              color={showOnlyFavorites ? '#f59e0b' : '#94a3b8'}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Empty state — shown below the control bar when 즐겨찾기 and/or 필터
          yields nothing (only when the user actually has tracked items —
          the separate zero-state screen already handles a genuinely empty
          list) */}
      {sortedData.length === 0 && globalTrackedItems.length > 0 && (showOnlyFavorites || isFilterActive) && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>📭</Text>
          <Text style={styles.emptySub}>
            {showOnlyFavorites && isFilterActive
              ? '즐겨찾기 + 필터 조건에 맞는 상품이 없어요.'
              : showOnlyFavorites
              ? '즐겨찾기 상품이 없습니다.\n특정 상품을 즐겨찾기로 관리하세요.'
              : '필터 조건에 맞는 상품이 없어요.'}
          </Text>
          <TouchableOpacity
            style={styles.emptyResetBtn}
            onPress={() => { setShowOnlyFavorites(false); setFilters(DEFAULT_FILTERS); }}
            activeOpacity={0.75}
          >
            <Text style={styles.emptyResetText}>조건 초기화</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  const numColumns = viewMode === 'list' ? 1 : viewMode === 'grid2' ? 2 : 3;
  const isEmpty    = globalTrackedItems.length === 0;

  const openCoupang = async () => {
    setExpectingCoupangReturn();
    try {
      // Attempt 1: host-qualified scheme (fixes naked coupang:// ActivityNotFoundException)
      await Linking.openURL('coupang://home');
    } catch (_) {
      if (Platform.OS === 'android') {
        try {
          // Attempt 2: force-launch package via Android IntentLauncher
          await IntentLauncher.startActivityAsync('android.intent.action.MAIN', {
            category: 'android.intent.category.LAUNCHER',
            packageName: 'com.coupang.mobile',
          });
          return;
        } catch (__) {}
      }
      // Attempt 3: Store (native scheme → web store page; web browser fallback forbidden per RULE-02)
      try {
        const storeUrl = Platform.OS === 'android'
          ? 'market://details?id=com.coupang.mobile'
          : 'itms-apps://itunes.apple.com/app/id476266412';
        await Linking.openURL(storeUrl);
      } catch (___) {
        // market:// not available — fall back to web store page (NOT coupang product page — RULE-02)
        const webStoreUrl = Platform.OS === 'android'
          ? 'https://play.google.com/store/apps/details?id=com.coupang.mobile'
          : 'https://apps.apple.com/app/id476266412';
        Linking.openURL(webStoreUrl).catch(() => {});
      }
    }
  };

  // Skeleton add card appended at the end — only when the current view
  // actually has items to append after. sortedData can be empty even when
  // globalTrackedItems isn't (필터/즐겨찾기 조건에 안 맞는 경우), and in
  // that case the dashed "상품 추가하기" card would render as the sole
  // list item sitting right below the empty-state message, which reads as
  // a broken duplicate CTA rather than a natural list continuation.
  const listDataWithAdd = (isEmpty || sortedData.length === 0) ? [] : [...sortedData, { isAddPlaceholder: true }];

  return (
    <SafeAreaView edges={['bottom']} style={styles.container}>

      {/* ── Zero-state: visual guidebook ── */}
      {isEmpty ? (
        <View style={{ flex: 1 }}>
          <View style={[styles.zeroState, { paddingBottom: 100 }]}>
            <Text style={styles.zeroStateTitle}>
              {'관심상품이 텅 비어있어요!\n이렇게 추가해 보세요'}
            </Text>

            <View style={{ width: '100%', paddingHorizontal: 20, marginTop: 8, marginBottom: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                <Text style={{ fontSize: 18, color: '#2F80ED', fontWeight: 'bold', marginRight: 8 }}>1.</Text>
                <Text style={{ fontSize: 16, color: '#333', fontWeight: '600', marginLeft: 8 }}>쿠팡 앱 접속 후 관심 있는 상품 클릭</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ fontSize: 18, color: '#2F80ED', fontWeight: 'bold', marginRight: 8 }}>2.</Text>
                <Text style={{ fontSize: 16, color: '#333', fontWeight: '600', marginLeft: 8 }}>해당 상품 링크(URL) 복사하기 (영상 참고)</Text>
              </View>
            </View>

            {/* Tutorial GIF */}
            <TutorialVideo />

            <View style={{ width: '100%', paddingHorizontal: 20, marginTop: 2, marginBottom: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 18, color: '#2F80ED', fontWeight: 'bold', marginRight: 8 }}>3.</Text>
                <Text style={{ fontSize: 16, color: '#333', fontWeight: '600', marginLeft: 8 }}>세이브루 앱으로 돌아와서 상품 추가!</Text>
              </View>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.zeroStateCta, { position: 'absolute', bottom: 20, width: '90%', alignSelf: 'center', left: '5%' }]}
            activeOpacity={0.85}
            onPress={openCoupang}
          >
            <Text style={styles.zeroStateCtaText}>쿠팡 앱 접속하기</Text>
          </TouchableOpacity>
        </View>
      ) : (
      <FlatList
        key={viewMode}
        data={listDataWithAdd}
        keyExtractor={(item) => item.isAddPlaceholder ? '__add__' : String(item.savedId ?? item.productId)}
        numColumns={numColumns}
        columnWrapperStyle={viewMode !== 'list' ? (viewMode === 'grid3' ? styles.columnWrapperCompact : styles.columnWrapper) : undefined}
        ListHeaderComponent={SummaryBar}
        contentContainerStyle={[
          styles.listContent,
          isEditMode && { paddingBottom: 180 },
        ]}
        showsVerticalScrollIndicator={false}
        extraData={{ isEditMode, selectedIds, viewMode, showOnlyFavorites, sortOption, filters, globalTrackedItems }}
        renderItem={({ item }) => {
          if (item.isAddPlaceholder) {
            if (viewMode === 'grid2') {
              return (
                <TouchableOpacity
                  style={styles.addCard}
                  activeOpacity={0.7}
                  onPress={openCoupang}
                >
                  <Ionicons name="add-circle-outline" size={32} color="#94a3b8" />
                  <Text style={styles.addCardText}>상품 추가</Text>
                </TouchableOpacity>
              );
            }
            if (viewMode === 'grid3') {
              return (
                <TouchableOpacity
                  style={styles.addCardCompact}
                  activeOpacity={0.7}
                  onPress={openCoupang}
                >
                  <Ionicons name="add-circle-outline" size={20} color="#94a3b8" />
                  <Text style={styles.addCardTextCompact}>추가</Text>
                </TouchableOpacity>
              );
            }
            return (
              <TouchableOpacity
                style={styles.addCardList}
                activeOpacity={0.7}
                onPress={openCoupang}
              >
                <Ionicons name="add-circle-outline" size={22} color="#94a3b8" />
                <Text style={styles.addCardText}>상품 추가하기</Text>
              </TouchableOpacity>
            );
          }
          return (
            <TrackingCard
              item={item}
              isEditMode={isEditMode}
              isSelected={selectedIds.includes(item.savedId ?? item.productId)}
              viewMode={viewMode}
              onRemove={removeTrackedItem}
              onToggleSelect={toggleSelect}
              onLongPressActivate={activateEditMode}
              onPress={() => navigation.navigate('Detail', { item })}
            />
          );
        }}
      />
      )}


      {/* ── Tooltip overlay ── */}
      {showTooltip && (
        <Pressable style={styles.tooltipOverlay} onPress={() => setShowTooltip(false)}>
          <View style={styles.tooltipBox}>
            <View style={styles.tooltipArrow} />
            <Text style={styles.tooltipText}>
              {'① 구매 타이밍 — 60일 평균가보다 10%↑ 저렴한 상품\n② 역대 최저가 — 지금까지 최저가를 기록 중인 상품\n③ 또래 추천 — 나 외에 비슷한 또래 맘 2명↑이 담은 상품\n④ 자주 산 상품 — 회원님이 2회↑ 구매하신 상품'}
            </Text>
          </View>
        </Pressable>
      )}

      {/* ── Sort modal ── */}
      <Modal
        visible={isSortModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setIsSortModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={{ flex: 1 }} onPress={() => setIsSortModalVisible(false)} />
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>정렬</Text>
            {SORT_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt}
                style={styles.sortOption}
                onPress={() => { setSortOption(opt); setIsSortModalVisible(false); }}
                activeOpacity={0.7}
              >
                <Text style={styles.sortOptionText}>{opt}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>

      {/* ── Filter modal ── */}
      <Modal
        visible={isFilterModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setIsFilterModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={{ flex: 1 }} onPress={() => setIsFilterModalVisible(false)} />
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>관심상품 필터</Text>
              <TouchableOpacity
                onPress={() => setIsFilterModalVisible(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={22} color="#334155" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
              <Text style={styles.filterSectionTitle}>배송 유형</Text>
              <View style={styles.filterChipRow}>
                {DELIVERY_FILTER_OPTIONS.map((opt) => {
                  const active = draftFilters.deliveryType === opt.value;
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      style={[styles.filterChip, active && styles.filterChipActive]}
                      onPress={() => setDraftFilters((f) => ({ ...f, deliveryType: opt.value }))}
                      activeOpacity={0.75}
                    >
                      <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{opt.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.filterSectionTitle}>상품 상태</Text>
              <View style={styles.filterChipRow}>
                <TouchableOpacity
                  style={[styles.filterChip, draftFilters.excludeOutOfStock && styles.filterChipActive]}
                  onPress={() => setDraftFilters((f) => ({ ...f, excludeOutOfStock: !f.excludeOutOfStock }))}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.filterChipText, draftFilters.excludeOutOfStock && styles.filterChipTextActive]}>
                    품절상품 제외
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.filterSectionTitle}>가격대</Text>
              <View style={styles.filterChipRow}>
                {PRICE_FILTER_OPTIONS.map((opt) => {
                  const active = isSameRange(draftFilters.priceRange, opt.range);
                  return (
                    <TouchableOpacity
                      key={opt.label}
                      style={[styles.filterChip, active && styles.filterChipActive]}
                      onPress={() => setDraftFilters((f) => ({ ...f, priceRange: opt.range }))}
                      activeOpacity={0.75}
                    >
                      <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{opt.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            <View style={styles.filterFooter}>
              <TouchableOpacity
                style={styles.filterResetBtn}
                onPress={() => setDraftFilters(DEFAULT_FILTERS)}
                activeOpacity={0.75}
              >
                <Ionicons name="refresh" size={16} color="#64748b" />
                <Text style={styles.filterResetText}>초기화</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.filterApplyBtn}
                onPress={() => { setFilters(draftFilters); setIsFilterModalVisible(false); }}
                activeOpacity={0.85}
              >
                <Text style={styles.filterApplyText}>{draftFilteredCount}개 상품 보기</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── FAB ── */}
      {!isEditMode && !isEmpty && (
        <TouchableOpacity
          style={styles.fab}
          onPress={openCoupang}
          activeOpacity={0.85}
        >
          <Text style={{ color: '#ffffff', fontWeight: 'bold', fontSize: 15 }}>+ 상품 추가</Text>
        </TouchableOpacity>
      )}

      {/* ── Toggle switchboard action bar (edit mode only) ── */}
      {isEditMode && (
        <View style={styles.floatingBar}>

          {/* Top row: 3 toggle buttons */}
          <View style={styles.toggleRow}>
            <TouchableOpacity
              style={[styles.toggleBtn, allPriceAlertOn && styles.toggleBtnActive]}
              onPress={() => handleToggleFlag('isPriceAlertOn')}
              activeOpacity={0.75}
            >
              <Ionicons
                name={allPriceAlertOn ? 'notifications-off' : 'notifications'}
                size={18} color={allPriceAlertOn ? '#93c5fd' : '#94a3b8'}
              />
              <Text style={[styles.toggleBtnLabel, allPriceAlertOn && styles.toggleBtnLabelActive]}>
                {allPriceAlertOn ? '가격 알림 해제' : '가격 알림'}
              </Text>
            </TouchableOpacity>

            <View style={styles.toggleDivider} />

            <TouchableOpacity
              style={[styles.toggleBtn, allRestockAlertOn && styles.toggleBtnActive]}
              onPress={() => handleToggleFlag('isRestockAlertOn')}
              activeOpacity={0.75}
            >
              <Ionicons
                name="cube"
                size={18} color={allRestockAlertOn ? '#93c5fd' : '#94a3b8'}
              />
              <Text style={[styles.toggleBtnLabel, allRestockAlertOn && styles.toggleBtnLabelActive]}>
                {allRestockAlertOn ? '재입고 알림 해제' : '재입고 알림'}
              </Text>
            </TouchableOpacity>

            <View style={styles.toggleDivider} />

            <TouchableOpacity
              style={[styles.toggleBtn, allFavorite && styles.toggleBtnActive]}
              onPress={() => handleToggleFlag('isFavorite')}
              activeOpacity={0.75}
            >
              <Ionicons
                name={allFavorite ? 'star' : 'star-outline'}
                size={18} color={allFavorite ? '#fbbf24' : '#94a3b8'}
              />
              <Text style={[styles.toggleBtnLabel, allFavorite && styles.toggleBtnLabelActive]}>
                {allFavorite ? '즐겨찾기 해제' : '즐겨찾기'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Thin separator */}
          <View style={styles.barSeparator} />

          {/* Bottom row: 취소 | 삭제 | 확인 */}
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={exitEditMode} activeOpacity={0.8}>
              <Text style={styles.cancelText}>취소</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.deleteBtn, selectedIds.length === 0 && styles.deleteBtnDisabled]}
              onPress={selectedIds.length > 0 ? handleDeleteSelected : undefined}
              activeOpacity={0.85}
            >
              <Text style={styles.deleteText}>삭제</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.confirmBtn} onPress={exitEditMode} activeOpacity={0.85}>
              <Text style={styles.confirmText}>확인</Text>
            </TouchableOpacity>
          </View>

        </View>
      )}
      {/* ── Custom Confirm Modal: Magic Nudge "추적할까요?" ── */}
      <Modal
        visible={!!clipConfirmUrl}
        transparent
        animationType="fade"
        onRequestClose={() => setClipConfirmUrl(null)}
      >
        <View style={styles.alertOverlay}>
          <View style={styles.alertBox}>
            <Text style={styles.alertTitle}>쿠팡 상품을 발견했어요!</Text>
            <Text style={styles.alertBody}>복사하신 상품의 최저가를 추적할까요?</Text>
            <View style={styles.alertBtnRow}>
              <TouchableOpacity
                style={styles.alertBtnCancel}
                onPress={() => { setClipConfirmUrl(null); setPendingClipAction(null); }}
                activeOpacity={0.8}
              >
                <Text style={styles.alertBtnCancelText}>아니오</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.alertBtnConfirm}
                onPress={async () => {
                  setClipConfirmUrl(null);
                  if (pendingClipAction) await pendingClipAction();
                  setPendingClipAction(null);
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.alertBtnConfirmText}>추적하기</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Custom Success/Error Modal ── */}
      <Modal
        visible={!!successModal}
        transparent
        animationType="fade"
        onRequestClose={() => setSuccessModal(null)}
      >
        <View style={styles.alertOverlay}>
          <View style={styles.alertBox}>
            <Text style={styles.alertTitle}>{successModal?.title}</Text>
            <Text style={styles.alertBody}>{successModal?.body}</Text>
            <View style={styles.alertBtnRow}>
              <TouchableOpacity
                style={[styles.alertBtnConfirm, { flex: 1 }]}
                onPress={() => setSuccessModal(null)}
                activeOpacity={0.8}
              >
                <Text style={styles.alertBtnConfirmText}>확인</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#fff' },
  listContent: { paddingBottom: 40 },

  // Zero-state (no items at all)
  zeroState: {
    flexGrow: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 28, paddingVertical: 40,
  },
  zeroStateTitle: {
    fontSize: 20, fontWeight: '800', color: '#0f172a',
    textAlign: 'center', lineHeight: 28, marginBottom: 28,
  },
  zeroStepCard: {
    width: '100%', backgroundColor: '#fff',
    borderRadius: 16, marginBottom: 28,
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12 },
      android: { elevation: 4 },
    }),
  },
  zeroStepRow:   { flexDirection: 'row', alignItems: 'flex-start' },
  zeroStepLeft:  { alignItems: 'center', width: 44, marginRight: 14 },
  zeroStepCircle: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#eff6ff', alignItems: 'center', justifyContent: 'center',
  },
  zeroStepLine:  { width: 2, flexGrow: 1, minHeight: 16, backgroundColor: '#dbeafe', marginVertical: 4 },
  zeroStepRight: { flex: 1, paddingTop: 10, paddingBottom: 20 },
  zeroStepLabel: { fontSize: 11, fontWeight: '800', color: '#3b82f6', letterSpacing: 0.6, marginBottom: 4, textTransform: 'uppercase' },
  zeroStepText:  { fontSize: 14, color: '#334155', lineHeight: 21 },
  zeroStateCta: {
    width: '100%', backgroundColor: COLORS.primary, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
    ...Platform.select({
      ios:     { shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 8 },
      android: { elevation: 4 },
    }),
  },
  zeroStateCtaText: { fontSize: 16, fontWeight: '800', color: '#fff' },

  // Summary bar
  summaryBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f1f5f9',
  },
  summaryLeft:   { flexDirection: 'row', alignItems: 'center' },
  summaryTitle:  { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  selectAllText: { fontSize: 15, fontWeight: '700', color: '#3b82f6' },
  summaryRight:  { flexDirection: 'row', alignItems: 'center' },
  guideBtn:      { backgroundColor: '#f1f5f9', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4 },
  guideBtnText:  { fontSize: 12, fontWeight: '600', color: '#64748b' },

  // Grid
  columnWrapper:        { justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 16, marginTop: 16 },
  columnWrapperCompact: { justifyContent: 'flex-start', gap: 6, paddingHorizontal: 8, marginBottom: 8, marginTop: 8 },

  // Add skeleton card
  addCard: {
    width: '48%', borderRadius: 12,
    borderWidth: 2, borderStyle: 'dashed', borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
    alignItems: 'center', justifyContent: 'center', gap: 8,
    aspectRatio: 0.75,
  },
  addCardList: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 14,
    borderWidth: 2, borderStyle: 'dashed', borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
    marginHorizontal: 16, marginTop: 8, borderRadius: 10,
  },
  addCardText: { fontSize: 14, fontWeight: '600', color: '#64748b' },
  addCardCompact: {
    width: '31%', borderRadius: 8,
    borderWidth: 2, borderStyle: 'dashed', borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
    alignItems: 'center', justifyContent: 'center', gap: 4,
    aspectRatio: 1,
  },
  addCardTextCompact: { fontSize: 11, fontWeight: '600', color: '#94a3b8' },

  // Empty state
  emptyState: { alignItems: 'center', paddingTop: 80 },
  emptyIcon:  { fontSize: 52, marginBottom: 16 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#334155', marginBottom: 8 },
  emptySub:   { fontSize: 14, color: '#94a3b8', textAlign: 'center', paddingHorizontal: 32, lineHeight: 21 },
  emptyResetBtn: {
    marginTop: 14, paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1, borderColor: '#cbd5e1',
  },
  emptyResetText: { fontSize: 13, fontWeight: '700', color: '#475569' },

  // Curation dashboard
  curationRow: {
    paddingHorizontal: 12, paddingVertical: 6, gap: 10, flexDirection: 'row',
  },
  // Outer touchable: column layout so label sits below the folder box
  curationCardWrap: {
    alignItems: 'center', gap: 6,
  },
  // Folder background box
  curationCard: {
    width: 72, height: 72, borderRadius: 16,
    backgroundColor: '#f8fafc',
    padding: 6,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 },
      android: { elevation: 1 },
    }),
  },
  curationLabel: { fontSize: 13, fontWeight: '700', color: '#334155', textAlign: 'center' },

  // 2×2 image grid: 72px box − 6px padding × 2 sides = 60px
  curationImageGrid: {
    width: 60, height: 60,
    flexDirection: 'row', flexWrap: 'wrap',
    justifyContent: 'space-between', alignContent: 'space-between',
    borderRadius: 8, overflow: 'hidden',
    backgroundColor: '#fff',
  },
  curationImageCell:     { width: 28, height: 28, borderRadius: 6 },
  curationImageFallback: { width: 60, height: 60, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },

  // Control bar
  controlBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 8,
    borderBottomWidth: 1, borderColor: '#f1f5f9',
  },
  controlSortBtn:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  controlSortText: { fontSize: 14, fontWeight: '600', color: '#334155' },
  controlRight:    { flexDirection: 'row', gap: 12, alignItems: 'center' },
  controlIconBtn:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  controlIconText: { fontSize: 13, color: '#64748b' },
  filterActiveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#3b82f6' },

  // Divider below curation ScrollView
  curationDivider: { height: 8, backgroundColor: '#f1f5f9', width: '100%', marginBottom: 0 },
  curationBadge: {
    position: 'absolute', top: -4, right: -4,
    zIndex: 10,
    minWidth: 20, height: 20, borderRadius: 10,
    backgroundColor: '#ef4444',
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 4,
    ...Platform.select({ android: { elevation: 5 } }),
  },
  curationBadgeText: { fontSize: 10, fontWeight: '800', color: '#fff' },

  // FAB
  fab: {
    position: 'absolute', right: 20, bottom: 20,
    height: 52, borderRadius: 26,
    paddingHorizontal: 20,
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#3b82f6',
    elevation: 5,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3, shadowRadius: 4,
  },
  fabModalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 24,
  },
  fabModalCard: {
    backgroundColor: '#fff', borderRadius: 16,
    padding: 24, width: '100%',
  },
  fabModalTitle: {
    fontSize: 18, fontWeight: '800', color: '#0f172a',
    marginBottom: 20,
  },

  // ── Bottom sheet modals ──────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1, justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 20, paddingBottom: 36, paddingTop: 12,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.1, shadowRadius: 8 },
      android: { elevation: 10 },
    }),
  },
  modalHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: '#e2e8f0', alignSelf: 'center', marginBottom: 16,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12,
  },
  modalTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a', marginBottom: 8 },
  sortOption: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f1f5f9',
  },
  sortOptionText: { fontSize: 15, fontWeight: '500', color: '#334155' },

  // Filter modal
  filterSectionTitle: { fontSize: 13, fontWeight: '700', color: '#64748b', marginTop: 16, marginBottom: 8 },
  filterChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filterChip: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 18, borderWidth: 1, borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  filterChipActive:     { backgroundColor: '#eff6ff', borderColor: '#3b82f6' },
  filterChipText:       { fontSize: 13, fontWeight: '600', color: '#64748b' },
  filterChipTextActive: { color: '#3b82f6', fontWeight: '800' },
  filterFooter: {
    flexDirection: 'row', gap: 10, marginTop: 20,
  },
  filterResetBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    paddingHorizontal: 16, borderRadius: 12,
    borderWidth: 1, borderColor: '#e2e8f0',
  },
  filterResetText: { fontSize: 14, fontWeight: '700', color: '#64748b' },
  filterApplyBtn: {
    flex: 1, paddingVertical: 15, borderRadius: 12,
    backgroundColor: '#3b82f6', alignItems: 'center',
  },
  filterApplyText: { fontSize: 15, fontWeight: '800', color: '#fff' },

  // Tutorial modal
  tutorialSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 20, paddingBottom: 36, paddingTop: 12,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.1, shadowRadius: 8 },
      android: { elevation: 10 },
    }),
  },
  tutorialStep: {
    flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 24,
  },
  tutorialStepIcon: {
    width: 60, height: 60, borderRadius: 12,
    backgroundColor: '#f1f5f9',
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  tutorialStepText: { flex: 1, fontSize: 14, color: '#334155', lineHeight: 21 },
  tutorialCta: {
    backgroundColor: '#3b82f6', borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
    ...Platform.select({
      ios:     { shadowColor: '#3b82f6', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
      android: { elevation: 4 },
    }),
  },
  tutorialCtaText: { fontSize: 16, fontWeight: '800', color: '#fff' },

  // Tooltip
  tooltipOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 10 },
  tooltipBox: {
    position: 'absolute', top: 45, left: 20, right: 20,
    backgroundColor: '#334155', borderRadius: 8, padding: 12,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 8 },
      android: { elevation: 6 },
    }),
  },
  tooltipArrow: {
    position: 'absolute', top: -8, left: 20,
    width: 0, height: 0,
    borderLeftWidth: 8,   borderLeftColor:   'transparent',
    borderRightWidth: 8,  borderRightColor:  'transparent',
    borderBottomWidth: 8, borderBottomColor: '#334155',
  },
  tooltipText: { fontSize: 13, color: '#fff', lineHeight: 19 },

  // ── Toggle switchboard floating bar ──────────────────────────────────────────
  floatingBar: {
    position: 'absolute', bottom: 16, left: 16, right: 16,
    backgroundColor: '#1e293b', borderRadius: 16,
    padding: 12, gap: 10, flexDirection: 'column',
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.22, shadowRadius: 12 },
      android: { elevation: 8 },
    }),
  },

  // Top row: toggle buttons
  toggleRow:          { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  toggleBtn:          { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 10, gap: 4 },
  toggleBtnActive:    { backgroundColor: 'rgba(59,130,246,0.18)' },

  toggleBtnLabel:     { fontSize: 11, fontWeight: '600', color: '#94a3b8' },
  toggleBtnLabelActive: { color: '#93c5fd' },
  toggleDivider:      { width: 1, height: 36, backgroundColor: '#334155' },

  barSeparator: { height: 1, backgroundColor: '#334155' },

  // Bottom row: action buttons
  actionRow:  { flexDirection: 'row', gap: 8 },
  cancelBtn:  { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: '#334155', alignItems: 'center' },
  cancelText: { fontSize: 14, fontWeight: '700', color: '#94a3b8' },
  deleteBtn:  { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: '#ef4444', alignItems: 'center' },
  deleteBtnDisabled: { backgroundColor: 'rgba(239,68,68,0.35)' },
  deleteText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  confirmBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: '#3b82f6', alignItems: 'center' },
  confirmText:{ fontSize: 14, fontWeight: '700', color: '#fff' },

  // Custom alert modals (RULE-9.4 compliant)
  alertOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32,
  },
  alertBox: {
    width: '100%', backgroundColor: '#FFFFFF',
    borderRadius: 16, padding: 24,
  },
  alertTitle: {
    fontSize: 17, fontWeight: '800', color: '#0f172a',
    marginBottom: 10, lineHeight: 24,
  },
  alertBody: {
    fontSize: 14, color: '#475569', lineHeight: 22, marginBottom: 24,
  },
  alertBtnRow: {
    flexDirection: 'row', gap: 10,
  },
  alertBtnCancel: {
    flex: 1, paddingVertical: 14, borderRadius: 10,
    backgroundColor: '#f1f5f9', alignItems: 'center',
  },
  alertBtnCancelText: {
    fontSize: 15, fontWeight: '600', color: '#475569',
  },
  alertBtnConfirm: {
    flex: 1, paddingVertical: 14, borderRadius: 10,
    backgroundColor: '#2E6FF2', alignItems: 'center',
  },
  alertBtnConfirmText: {
    fontSize: 15, fontWeight: '700', color: '#fff',
  },
});
