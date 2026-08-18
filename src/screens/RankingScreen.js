import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { DeepLinkContext } from '../contexts/DeepLinkContext';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { Info } from 'lucide-react-native';
import GlobalHeader from '../components/GlobalHeader';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { recordProductAction } from '../services/productActionService';
import { fetchBestCategoryProducts, searchCoupangProducts } from '../services/coupangApiService';
import { useUser } from '../context/UserContext';
import { getEffectivePrice } from '../utils/priceDisplay';

// ─── All categories (bottom sheet) ───────────────────────────────────────────
// Real Coupang categoryId for the 3 primary (cohort tab) categories; the rest
// are fetched via keyword search since their category IDs aren't confirmed.

const ALL_CATEGORIES = [
  { key: 'baby',    label: '출산/유아동', categoryId: 1011 },
  { key: 'food',    label: '식품/분유',   categoryId: 1012 },
  { key: 'living',  label: '생활용품',    categoryId: 1014 },
  { key: 'beauty',  label: '뷰티',        keyword: '뷰티' },
  { key: 'fashion', label: '패션의류',    keyword: '아동 패션의류' },
  { key: 'home',    label: '홈인테리어',  keyword: '홈인테리어' },
  { key: 'digital', label: '가전디지털',  keyword: '가전디지털' },
  { key: 'hobby',   label: '완구/취미',   keyword: '완구 취미' },
];

const CATEGORY_BY_KEY = Object.fromEntries(ALL_CATEGORIES.map((c) => [c.key, c]));

async function fetchRankedProducts(categoryKey, limit = 30) {
  const cfg = CATEGORY_BY_KEY[categoryKey];
  if (!cfg) return [];
  if (cfg.categoryId) return fetchBestCategoryProducts(cfg.categoryId, limit);
  return searchCoupangProducts(cfg.keyword, limit);
}

// ─── Cohort-based dynamic category tabs ──────────────────────────────────────

const COHORT_CATEGORIES = {
  pregnancy:    [{ key: 'living', label: '임산부 위생' },  { key: 'food', label: '임산부 식품' },  { key: 'baby', label: '신생아 준비' }],
  newborn:      [{ key: 'living', label: '기저귀/위생' },  { key: 'food', label: '분유/이유식' },  { key: 'baby', label: '신생아용품' }],
  early_infant: [{ key: 'living', label: '육아필수품' },   { key: 'food', label: '수유/분유' },    { key: 'baby', label: '초기영아용품' }],
  infant:       [{ key: 'living', label: '안전용품' },     { key: 'food', label: '이유식/분유' },  { key: 'baby', label: '영아용품' }],
  toddler:      [{ key: 'living', label: '안전용품' },     { key: 'food', label: '유아 간식' },    { key: 'baby', label: '걸음마 용품' }],
  early_child:  [{ key: 'living', label: '생활용품' },     { key: 'food', label: '아동 식품' },    { key: 'baby', label: '유아 완구' }],
  child:        [{ key: 'living', label: '생활용품' },     { key: 'food', label: '아동 식품' },    { key: 'baby', label: '아동 용품' }],
  default:      [{ key: 'living', label: '생활용품' },     { key: 'food', label: '식품/분유' },    { key: 'baby', label: '출산/유아동' }],
};

function getCohortCategories(child) {
  if (!child?.stage) return COHORT_CATEGORIES.default;
  return COHORT_CATEGORIES[child.stage] ?? COHORT_CATEGORIES.default;
}

function resolveTabLabel(cat, child) {
  if (cat.key === 'food' && child?.ageMonth != null) {
    return child.ageMonth < 12 ? cat.label : '식품/간식';
  }
  return cat.label;
}

// ─── Sub-component: RankItem ──────────────────────────────────────────────────

function RankItem({ item, rank, navigation }) {
  const { isWowMember } = useUser();
  const medalColors = { 1: '#FBBF24', 2: '#94A3B8', 3: '#B45309' };
  const medalBg = medalColors[rank];
  const discountPct = item.discountRate ?? item.discount ?? null;
  const { price: displayPrice, isWow } = getEffectivePrice(item, isWowMember);

  return (
    <TouchableOpacity
      style={styles.rankItem}
      onPress={() => {
        recordProductAction({
          userId: auth.currentUser?.uid,
          productId: item.id,
          productGroupId: item.productGroupId,
          actionType: 'click',
        });
        navigation.navigate('Detail', { item, from: 'Ranking' });
      }}
      activeOpacity={0.85}
    >
      {/* Thumbnail with rank badge overlay */}
      <View style={styles.thumbWrap}>
        {item.image ? (
          <Image source={{ uri: item.image }} style={styles.thumbImage} resizeMode="cover" />
        ) : (
          <View style={styles.thumbPlaceholder}>
            <Ionicons name="cube-outline" size={28} color="#94A3B8" />
          </View>
        )}
        <View style={[styles.rankOverlay, medalBg ? { backgroundColor: medalBg } : styles.rankOverlayDefault]}>
          <Text style={styles.rankOverlayText}>{rank}</Text>
        </View>
      </View>

      {/* Right: text info */}
      <View style={styles.itemInfo}>
        <Text numberOfLines={2} style={{ fontSize: 13, fontWeight: '600', color: '#111827', lineHeight: 18, marginBottom: 4 }}>
          {item.name}
        </Text>

        {/* Price row: ▼ % + current price + delivery tag inline */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {discountPct > 0 && (
            <Text style={{ fontSize: 13, fontWeight: '800', color: '#2E6FF2' }}>
              ▼ {discountPct}%
            </Text>
          )}
          <Text style={{ fontSize: 16, fontWeight: '800', color: '#111827' }}>
            {isWow && (
              <Text style={{ fontSize: 11, fontWeight: '800', color: '#fff', backgroundColor: '#2E6FF2', borderRadius: 3 }}> WOW </Text>
            )}
            {' '}₩{(displayPrice ?? 0).toLocaleString('ko-KR')}
          </Text>
          {item.isRocket && (
            <Text style={{ fontSize: 10, color: '#2E6FF2', fontWeight: '700', borderWidth: 1, borderColor: '#BFDBFE', borderRadius: 3, paddingHorizontal: 4, paddingVertical: 1 }}>로켓배송</Text>
          )}
        </View>

        {/* Original price strikethrough */}
        {item.originalPrice > 0 && item.originalPrice !== item.currentPrice && (
          <Text style={{ fontSize: 11, color: '#94A3B8', textDecorationLine: 'line-through', marginTop: 2 }}>
            정가 ₩{item.originalPrice.toLocaleString('ko-KR')}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function RankingScreen({ navigation, route }) {
  const { deepLinkIntent, setDeepLinkIntent } = useContext(DeepLinkContext);
  const [activeCategory,     setActiveCategory]     = useState('living');
  const [isCustomRanking,    setIsCustomRanking]     = useState(false);
  const [child,              setChild]              = useState(null);
  const [refreshing,         setRefreshing]         = useState(false);
  const [showCriteriaModal,  setShowCriteriaModal]  = useState(false);
  const [showCategorySheet,  setShowCategorySheet]  = useState(false);
  const [showCoachMark,      setShowCoachMark]      = useState(false);
  // No real peer-cohort ranking pipeline exists yet — this stays honestly false
  // until one is built, and the UI below reflects that instead of faking it.
  const hasEnoughPeerData = false;
  const [items,              setItems]              = useState([]);
  const [itemsLoading,       setItemsLoading]       = useState(true);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    getDocs(query(collection(db, 'children'), where('userId', '==', uid)))
      .then((snap) => { if (!snap.empty) setChild(snap.docs[0].data()); })
      .catch(() => {});
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (deepLinkIntent) {
        if (deepLinkIntent.targetTab) {
          const VALID_CATEGORY_KEYS = ['living', 'food', 'baby'];
          setActiveCategory(
            VALID_CATEGORY_KEYS.includes(deepLinkIntent.targetTab)
              ? deepLinkIntent.targetTab
              : 'living'
          );
        }
        if (deepLinkIntent.enableCustom !== undefined) setIsCustomRanking(deepLinkIntent.enableCustom);
        setDeepLinkIntent(null);
      }
    }, [deepLinkIntent])
  );

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (uid) recordProductAction({ userId: uid, actionType: 'ranking_visit' }).catch(() => {});
  }, []);

  useEffect(() => {
    AsyncStorage.getItem('@has_seen_ranking_tooltip')
      .then((val) => { if (!val) setShowCoachMark(true); })
      .catch(() => {});
  }, []);

  const dismissCoachMark = useCallback(() => {
    setShowCoachMark(false);
    AsyncStorage.setItem('@has_seen_ranking_tooltip', 'true').catch(() => {});
  }, []);

  const loadItems = useCallback(() => {
    setItemsLoading(true);
    fetchRankedProducts(activeCategory, 30)
      .then((result) => setItems(result))
      .catch(() => setItems([]))
      .finally(() => setItemsLoading(false));
  }, [activeCategory]);

  useEffect(() => { loadItems(); }, [loadItems]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadItems();
    setRefreshing(false);
  }, [loadItems]);

  const dynamicCategories = useMemo(() => getCohortCategories(child), [child]);
  const activeCategoryName = useMemo(
    () => CATEGORY_BY_KEY[activeCategory]?.label ?? dynamicCategories.find((c) => c.key === activeCategory)?.label ?? activeCategory,
    [dynamicCategories, activeCategory]
  );

  // "또래 맞춤" has no real peer-cohort data source yet, so it always falls back
  // to the same full ranking the banner below promises — no fabricated filter.
  const filtered = items;

  const ListHeader = useCallback(() => (
    <View>
      {/* 랭킹 기준 + 전체/또래맞춤 toggle row */}
      <View style={styles.criteriaRow}>
        <TouchableOpacity
          onPress={() => setShowCriteriaModal(true)}
          activeOpacity={0.7}
          style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F1F5F9', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}
        >
          <Info size={14} color="#64748B" />
          <Text style={{ fontSize: 12, color: '#475569', marginLeft: 4, fontWeight: '600' }}>랭킹 기준</Text>
        </TouchableOpacity>

        <View>
          {showCoachMark && (
            <TouchableOpacity style={styles.coachMarkAbsolute} activeOpacity={0.85} onPress={dismissCoachMark}>
              <View style={styles.coachMark}>
                <Text style={styles.coachMarkText}>내 아이와 비슷한 또래 및 육아 환경에 맞춰 랭킹을 추천해 드려요.</Text>
                <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', marginLeft: 6, lineHeight: 16 }}>×</Text>
              </View>
              <View style={styles.coachMarkArrow} />
            </TouchableOpacity>
          )}
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
              <Text style={[styles.pillToggleBtnText, isCustomRanking && styles.pillToggleBtnTextActive]}>또래 맞춤</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Peer Match data-insufficiency warning */}
      {isCustomRanking && !hasEnoughPeerData && (
        <View style={styles.peerDataWarning}>
          <View style={{ marginRight: 8 }}>
            <Info size={16} color="#94a3b8" />
          </View>
          <Text style={styles.peerDataWarningText}>
            아직 또래 맘들의 데이터가 모이고 있어요! 우선 쿠팡 전체 랭킹을 보여드릴게요.
          </Text>
        </View>
      )}
    </View>
  ), [isCustomRanking, showCoachMark, dismissCoachMark]);

  return (
    <View style={styles.container}>

      {/* Global header */}
      <GlobalHeader tabName="Ranking" placeholder="어떤 상품의 랭킹이 궁금하신가요?" navigation={navigation} />

      {/* Main category tabs */}
      <View style={styles.categoryTabBar}>
        {/* All categories nudge */}
        <TouchableOpacity style={styles.allCatsBtn} onPress={() => setShowCategorySheet(true)} activeOpacity={0.8}>
          <Text style={styles.allCatsBtnText} numberOfLines={1}>전체 카테고리</Text>
          <Ionicons name="chevron-down-outline" size={10} color="#6B7280" />
        </TouchableOpacity>
        <View style={styles.categoryTabDivider} />
        {/* Cohort-based dynamic tabs */}
        {dynamicCategories.map((cat) => {
          const active = activeCategory === cat.key;
          return (
            <TouchableOpacity
              key={cat.key}
              style={[styles.categoryTab, active && styles.categoryTabActive]}
              onPress={() => setActiveCategory(cat.key)}
              activeOpacity={0.8}
            >
              <Text style={[styles.categoryTabText, active && styles.categoryTabTextActive]}>
                {resolveTabLabel(cat, child)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Ranking criteria modal */}
      <Modal visible={showCriteriaModal} transparent animationType="fade" onRequestClose={() => setShowCriteriaModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowCriteriaModal(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>세이브루 랭킹 기준</Text>
            <View style={styles.modalRow}>
              <Text style={styles.modalRowLabel}>[전체] 랭킹</Text>
              <Text style={styles.modalRowDesc}>
                쿠팡 판매 데이터를 바탕으로 선정한 베스트 상품
              </Text>
            </View>
            <View style={[styles.modalRow, { marginBottom: 0 }]}>
              <Text style={styles.modalRowLabel}>[또래 맞춤] 랭킹</Text>
              <Text style={styles.modalRowDesc}>
                내 아이와 비슷한 또래 부모님들이 실제 가장 많이 선택하고 인정한 상품 (육아 환경 + 관심사 반영, 준비 중)
              </Text>
            </View>
            <TouchableOpacity style={styles.modalBtn} onPress={() => setShowCriteriaModal(false)}>
              <Text style={styles.modalBtnText}>확인</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Category bottom sheet */}
      <Modal visible={showCategorySheet} transparent animationType="slide" onRequestClose={() => setShowCategorySheet(false)}>
        <Pressable style={styles.sheetOverlay} onPress={() => setShowCategorySheet(false)}>
          <Pressable style={styles.sheetCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>전체 카테고리</Text>
            {ALL_CATEGORIES.map((cat) => {
              const active = activeCategory === cat.key;
              return (
                <TouchableOpacity
                  key={cat.key}
                  style={styles.sheetItem}
                  onPress={() => { setActiveCategory(cat.key); setShowCategorySheet(false); }}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.sheetItemText, active && styles.sheetItemTextActive]}>{cat.label}</Text>
                  {active && <Ionicons name="checkmark" size={16} color="#2E6FF2" />}
                </TouchableOpacity>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Ranked vertical feed */}
      {itemsLoading && items.length === 0 ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#2E6FF2" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item, index) => item.id || item.productGroupId || String(index)}
          renderItem={({ item, index }) => (
            <RankItem
              item={item}
              rank={index + 1}
              navigation={navigation}
            />
          )}
          ListHeaderComponent={ListHeader}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Ionicons name="search-outline" size={36} color="#CBD5E1" />
              <Text style={styles.emptyText}>[{activeCategoryName}] 카테고리 상품이 없어요</Text>
              <Text style={styles.emptySub}>다른 카테고리를 선택해보세요</Text>
            </View>
          }
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={['#2E6FF2']}
              tintColor="#2E6FF2"
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#F8FAFC' },
  listContent: { paddingBottom: 24 },
  loadingBox:  { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // ── Category tabs ──────────────────────────────────────────────────────────
  categoryTabBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1, borderBottomColor: '#E4E7ED',
    marginBottom: 0,
  },
  categoryTab: {
    flex: 1, alignItems: 'center',
    paddingTop: 10, paddingBottom: 8,
    borderBottomWidth: 0,
  },
  categoryTabActive: { borderBottomWidth: 2, borderBottomColor: '#111827', paddingBottom: 6 },
  categoryTabText:   { fontSize: 14, fontWeight: '600', color: '#94A3B8' },
  categoryTabTextActive: { fontSize: 14, fontWeight: '700', color: '#111827' },

  allCatsBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 10, paddingVertical: 10, gap: 3, minWidth: 70,
  },
  allCatsBtnText: { fontSize: 11, fontWeight: '700', color: '#6B7280' },
  categoryTabDivider: { width: 1, backgroundColor: '#E4E7ED', marginVertical: 8 },

  // ── Peer data warning ─────────────────────────────────────────────────────
  peerDataWarning: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#f8fafc',
    paddingHorizontal: 12, paddingVertical: 10,
    marginHorizontal: 16, marginTop: 12,
    borderRadius: 8,
  },
  peerDataWarningText: {
    flex: 1, fontSize: 13, fontWeight: '500', color: '#64748b', lineHeight: 18,
  },

  // ── Criteria row ───────────────────────────────────────────────────────────
  criteriaRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F1F5F9',
  },
  coachMarkAbsolute: {
    position: 'absolute',
    zIndex: 50,
    top: -48,
    right: 0,
    alignItems: 'center',
    width: 226,
  },
  coachMark: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#2E6FF2', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 7,
    width: '100%',
  },
  coachMarkText: { fontSize: 12, color: '#FFFFFF', fontWeight: '600', flex: 1, lineHeight: 17 },
  coachMarkArrow: {
    width: 0, height: 0,
    borderLeftWidth: 6, borderLeftColor: 'transparent',
    borderRightWidth: 6, borderRightColor: 'transparent',
    borderTopWidth: 6, borderTopColor: '#2E6FF2',
    alignSelf: 'flex-end', marginRight: 18,
  },

  pillToggle: {
    flexDirection: 'row', backgroundColor: '#F3F4F6', borderRadius: 20, padding: 2,
  },
  pillToggleBtn: {
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 18,
  },
  pillToggleBtnActive: { backgroundColor: '#2E6FF2' },
  pillToggleBtnText:   { fontSize: 12, fontWeight: '600', color: '#6B7280' },
  pillToggleBtnTextActive: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },

  // ── Rank item ──────────────────────────────────────────────────────────────
  rankItem: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
    paddingVertical: 12, paddingHorizontal: 16,
  },

  thumbWrap: {
    width: 72, height: 72, marginRight: 14, flexShrink: 0, position: 'relative',
  },
  thumbImage: {
    width: 72, height: 72, borderRadius: 8, backgroundColor: '#F1F5F9',
  },
  thumbPlaceholder: {
    width: 72, height: 72, borderRadius: 8,
    backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center',
  },
  rankOverlay: {
    position: 'absolute', top: 0, left: 0,
    width: 20, height: 20, borderRadius: 4,
    alignItems: 'center', justifyContent: 'center',
  },
  rankOverlayDefault: { backgroundColor: '#64748B' },
  rankOverlayText:    { fontSize: 11, fontWeight: '800', color: '#FFFFFF' },

  itemInfo:  { flex: 1 },

  // ── Criteria modal ─────────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32,
  },
  modalCard: {
    backgroundColor: '#FFFFFF', borderRadius: 16, padding: 24, width: '100%',
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12 },
      android: { elevation: 8 },
    }),
  },
  modalTitle:    { fontSize: 18, fontWeight: '800', color: '#111827', marginBottom: 16 },
  modalRow:      { marginBottom: 12 },
  modalRowLabel: { fontSize: 13, fontWeight: '700', color: '#2E6FF2', marginBottom: 3 },
  modalRowDesc:  { fontSize: 13, color: '#4B5563', lineHeight: 20 },
  modalBtn: {
    marginTop: 20, backgroundColor: '#2E6FF2',
    paddingVertical: 14, borderRadius: 12, alignItems: 'center',
  },
  modalBtnText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },

  // ── Category bottom sheet ──────────────────────────────────────────────────
  sheetOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end',
  },
  sheetCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 24, paddingTop: 12, paddingBottom: 40,
  },
  sheetHandle: {
    width: 36, height: 4, backgroundColor: '#E4E7ED',
    borderRadius: 2, alignSelf: 'center', marginBottom: 16,
  },
  sheetTitle:          { fontSize: 17, fontWeight: '800', color: '#111827', marginBottom: 8 },
  sheetItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F1F5F9',
  },
  sheetItemText:       { fontSize: 15, fontWeight: '500', color: '#374151' },
  sheetItemTextActive: { fontWeight: '700', color: '#2E6FF2' },

  // ── Empty state ────────────────────────────────────────────────────────────
  emptyBox: { alignItems: 'center', paddingTop: 60, paddingBottom: 40, gap: 10 },
  emptyText: { fontSize: 15, fontWeight: '700', color: '#334155' },
  emptySub:  { fontSize: 13, color: '#94A3B8' },
});
