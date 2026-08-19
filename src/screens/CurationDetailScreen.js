import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Package, TrendingDown, List, LayoutGrid, ChevronUp, ChevronDown } from 'lucide-react-native';
import { useTracking } from '../context/TrackingContext';
import { TrackingCard } from '../components/TrackingCard';
import {
  fetchGoldboxDeals,
  fetchBestCategoryProducts,
  fetchPersonalizedDeals,
} from '../services/coupangApiService';
import { auth } from '../firebase/config';
import { useUser } from '../context/UserContext';
import { resolveAgingPriceDisplay } from '../utils/priceDisplay';
import { applyCurationFilter } from '../utils/curationFilters';
import { getCurrentUserSegment, getPeerPopularityMap, getPurchaseFrequencyMap } from '../services/saveService';

// ─── Constants ────────────────────────────────────────────────────────────────

const SORT_OPTIONS = ['할인율순', '낮은가격순', '판매량순'];

const CURATION_DESCRIPTIONS = {
  timing:   '구매 적기가 다가온 상품들을 모았어요! 지금이 바로 살 때입니다.',
  lowest:   '과거 가격 대비 하락 폭이 가장 큰 꿀템 모음입니다!',
  peers:    '비슷한 또래 아이를 키우는 맘들이 가장 많이 관심 가진 상품이에요.',
  frequent: '자주 재구매하는 소모품 중심으로 모아봤어요.',
};

// ─── Product Card (2-col grid) ────────────────────────────────────────────────

const CARD_WIDTH = (Dimensions.get('window').width - 32 - 8) / 2;

const RANK_BADGE_COLORS = ['#FBBF24', '#9CA3AF', '#B45309'];

const normalizeImg = (img) => {
  if (!img) return null;
  let s = String(img).trim();
  if (s.startsWith('//')) s = 'https:' + s;
  return s.replace('http://', 'https://');
};

function ProductCard({ item, navigation, viewMode = 'grid', rank }) {
  const [imgErr, setImgErr] = useState(false);
  const price      = item.price ?? item.currentPrice ?? 0;
  const origPrice  = item.originalPrice ?? null;
  const apiDiscount = item.discountRate ?? item.discount ?? null;
  const calcDiscount = (origPrice != null && origPrice > price)
    ? Math.round(((origPrice - price) / origPrice) * 100) : null;
  const discount   = apiDiscount ?? calcDiscount;
  const rankBg    = rank != null ? (RANK_BADGE_COLORS[rank] ?? '#E5E7EB') : null;
  const imgUri    = normalizeImg(
    item.productImage || item.image || item.imageUrl ||
    item.thumbnail || item.thumbnailUrl ||
    item.productDetails?.imageUrl || item.vendorItem?.imageUrl || null
  );

  if (viewMode === 'list') {
    return (
      <TouchableOpacity
        style={gbCard.listWrap}
        activeOpacity={0.85}
        onPress={() => navigation?.navigate('Detail', { item })}
      >
        {rankBg != null && (
          <View style={gbCard.listRankCol}>
            <Text style={[gbCard.listRankNum, { color: rankBg === '#E5E7EB' ? '#94a3b8' : rankBg }]}>
              {rank + 1}
            </Text>
          </View>
        )}
        <View style={gbCard.listImgWrap}>
          {imgUri && !imgErr ? (
            <Image
              source={{ uri: imgUri }}
              style={gbCard.listImg}
              resizeMode="cover"
              onError={() => setImgErr(true)}
            />
          ) : (
            <View style={[gbCard.listImg, gbCard.imgFallback]}>
              <Package size={24} color="#94A3B8" strokeWidth={1.5} />
            </View>
          )}
          {item.isRocket && (
            <View style={{ position: 'absolute', top: 4, right: 4, backgroundColor: 'transparent' }}>
              <Text style={{ color: '#2E6FF2', fontSize: 10, fontWeight: '900', textShadowColor: 'rgba(255,255,255,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 }}>🚀로켓</Text>
            </View>
          )}
        </View>
        <View style={[gbCard.body, { flex: 1 }]}>
          <Text numberOfLines={2} ellipsizeMode="tail" style={{ fontSize: 13, color: '#0F172A', lineHeight: 18, marginBottom: 5 }}>
            {item.brand ? <Text style={{ color: '#94A3B8', fontWeight: 'bold' }}>[{item.brand}] </Text> : null}
            {item.name || '쿠팡 상품'}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap' }}>
            {discount != null && (
              <Text style={{ fontSize: 16, color: '#EF4444', fontWeight: '900', marginRight: 4 }}>{discount}%</Text>
            )}
            <Text style={{ fontSize: 16, color: '#0F172A', fontWeight: '800' }} numberOfLines={1}>₩{price.toLocaleString('ko-KR')}</Text>
            {origPrice != null && (
              <Text style={{ fontSize: 11, color: '#94A3B8', textDecorationLine: 'line-through', marginLeft: 4 }}>₩{origPrice.toLocaleString('ko-KR')}</Text>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={gbCard.wrap}
      activeOpacity={0.85}
      onPress={() => navigation?.navigate('Detail', { item })}
    >
      <View style={gbCard.imgWrap}>
        {imgUri && !imgErr ? (
          <Image
            source={{ uri: imgUri }}
            style={gbCard.img}
            resizeMode="cover"
            onError={() => setImgErr(true)}
          />
        ) : (
          <View style={[gbCard.img, gbCard.imgFallback]}>
            <Package size={32} color="#94A3B8" strokeWidth={1.5} />
          </View>
        )}
        {rankBg != null && (
          <View style={[gbCard.rankBadge, { backgroundColor: rankBg }]}>
            <Text style={gbCard.rankBadgeText}>{rank + 1}</Text>
          </View>
        )}
        {discount != null && origPrice != null && (
          <View style={gbCard.discountBadge}>
            <Text style={gbCard.discountBadgeText}>-{discount}%</Text>
          </View>
        )}
        {item.isRocket && (
          <View style={{ position: 'absolute', top: 4, right: 4, backgroundColor: 'transparent' }}>
            <Text style={{ color: '#2E6FF2', fontSize: 12, fontWeight: '900', textShadowColor: 'rgba(255,255,255,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 }}>🚀로켓배송</Text>
          </View>
        )}
      </View>
      <View style={gbCard.body}>
        <Text numberOfLines={2} ellipsizeMode="tail" style={{ fontSize: 13, color: '#0F172A', lineHeight: 18, marginBottom: 5 }}>
          {item.brand ? <Text style={{ color: '#94A3B8', fontWeight: 'bold' }}>[{item.brand}] </Text> : null}
          {item.name || '쿠팡 상품'}
        </Text>
        <View style={gbCard.priceRow}>
          {discount != null && origPrice != null && (
            <Text style={gbCard.discountPct}>{discount}%</Text>
          )}
          <Text style={gbCard.price} numberOfLines={1}>₩{price.toLocaleString('ko-KR')}</Text>
        </View>
        {origPrice != null && (
          <Text style={gbCard.origPrice}>₩{origPrice.toLocaleString('ko-KR')}</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function CurationDetailScreen({ route, navigation }) {
  const { curationId, type, stage } = route.params ?? {};
  const { globalTrackedItems } = useTracking();
  const { isWowMember } = useUser();

  // Same async curation signals as TrackingListScreen's dashboard — see
  // src/utils/curationFilters.js for why these can't be computed inline.
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

  // goldbox / mamtem / pl_deals / personalized all use the product-list layout
  const isProductList = type === 'goldbox' || type === 'mamtem' || type === 'pl_deals' || type === 'personalized';

  // ── Product list state (shared by goldbox / mamtem / pl_deals / personalized) ──
  const [productItems,   setProductItems]   = useState([]);
  const [productLoading, setProductLoading] = useState(isProductList); // start true → spinner shows immediately
  const [activeCategory, setActiveCategory] = useState('전체');

  const loadProducts = useCallback(() => {
    if (!isProductList) return;
    setProductLoading(true);
    const fetch =
      type === 'goldbox'      ? fetchGoldboxDeals(50)
      : type === 'mamtem'     ? fetchBestCategoryProducts(1011, 50)
      : type === 'personalized' ? fetchPersonalizedDeals({ stage })
      : /* pl_deals */           fetchBestCategoryProducts(1014, 50);

    fetch
      .then((items) => { setProductItems(items); setActiveCategory('전체'); })
      .catch(() => setProductItems([]))
      .finally(() => setProductLoading(false));
  }, [isProductList, type, stage]);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  // Category tabs — only extracted for goldbox (has categoryName field)
  const showCategoryTabs = type === 'goldbox';
  const categories = useMemo(() => {
    if (!showCategoryTabs) return [];
    const cats = [...new Set(productItems.map((i) => i.categoryName).filter(Boolean))];
    return cats.length > 0 ? ['전체', ...cats] : [];
  }, [productItems, showCategoryTabs]);

  const displayedItems = useMemo(() => {
    if (!showCategoryTabs || activeCategory === '전체') return productItems;
    return productItems.filter((i) => i.categoryName === activeCategory);
  }, [productItems, activeCategory, showCategoryTabs]);

  // ── Sort / view for product list (goldbox / mamtem / pl_deals) ──────────────
  const [productSortOption,      setProductSortOption]      = useState('판매량순');
  const [isProductSortModalVisible, setIsProductSortModalVisible] = useState(false);
  const [viewMode,               setViewMode]               = useState('grid');
  const flatListRef = useRef(null);

  const sortedDisplayedItems = useMemo(() => {
    const arr = [...displayedItems];
    switch (productSortOption) {
      case '낮은가격순':
        return arr.sort((a, b) => (a.price ?? a.currentPrice ?? 0) - (b.price ?? b.currentPrice ?? 0));
      case '할인율순':
        return arr.sort((a, b) => (b.discountRate ?? b.discount ?? 0) - (a.discountRate ?? a.discount ?? 0));
      default: // '판매량순' — keep API order
        return arr;
    }
  }, [displayedItems, productSortOption]);

  // ── Tracked items state (curationId path) ─────────────────────────────────
  const [sortOption,         setSortOption]         = useState('할인율순');
  const [isSortModalVisible, setIsSortModalVisible] = useState(false);

  const filteredItems = applyCurationFilter(globalTrackedItems, curationId, peerCounts, purchaseCounts, isWowMember);
  const sortedItems = useMemo(() => {
    const arr = [...filteredItems];
    switch (sortOption) {
      case '할인율순':
        // Same weighted-average-vs-current metric the card badge shows —
        // see TrackingListScreen's sort for why this replaced the old
        // priceDrop-based (last-check-only) comparison.
        return arr.sort((a, b) => {
          const pctA = resolveAgingPriceDisplay(a, isWowMember).discountPct ?? 0;
          const pctB = resolveAgingPriceDisplay(b, isWowMember).discountPct ?? 0;
          return pctB - pctA;
        });
      case '낮은가격순':
        return arr.sort((a, b) => (a.currentPrice || 0) - (b.currentPrice || 0));
      case '판매량순':
        return arr.sort((a, b) => (b.reviewCount || b.salesRank || 0) - (a.reviewCount || a.salesRank || 0));
      default:
        return arr;
    }
  }, [filteredItems, sortOption, isWowMember]);

  const description = CURATION_DESCRIPTIONS[curationId] ?? '';

  // ── Product list layout (goldbox / mamtem / pl_deals) ──────────────────────
  if (isProductList) {
    return (
      <SafeAreaView edges={['bottom']} style={styles.container}>
        {/* Scrollable category tab bar — goldbox only */}
        {!productLoading && showCategoryTabs && categories.length > 1 && (
          <View style={styles.catTabBarWrap}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.catTabBarContent}
            >
              {categories.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[styles.catTab, activeCategory === cat && styles.catTabActive]}
                  onPress={() => setActiveCategory(cat)}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.catTabText, activeCategory === cat && styles.catTabTextActive]}>
                    {cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* ControlBar: sort dropdown + list/grid toggle */}
        {!productLoading && (
          <View style={styles.controlBar}>
            <TouchableOpacity
              style={styles.controlSortBtn}
              onPress={() => setIsProductSortModalVisible(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.controlSortText}>{productSortOption}</Text>
              <ChevronDown size={14} color="#334155" strokeWidth={2} />
            </TouchableOpacity>
            <View style={{ flexDirection: 'row', gap: 4 }}>
              <TouchableOpacity
                style={[styles.viewToggleBtn, viewMode === 'list' && styles.viewToggleBtnActive]}
                onPress={() => setViewMode('list')}
                activeOpacity={0.7}
              >
                <List size={18} color={viewMode === 'list' ? '#2E6FF2' : '#94a3b8'} strokeWidth={2} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.viewToggleBtn, viewMode === 'grid' && styles.viewToggleBtnActive]}
                onPress={() => setViewMode('grid')}
                activeOpacity={0.7}
              >
                <LayoutGrid size={18} color={viewMode === 'grid' ? '#2E6FF2' : '#94a3b8'} strokeWidth={2} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {productLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color="#2E6FF2" />
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            key={viewMode}
            data={sortedDisplayedItems}
            numColumns={viewMode === 'grid' ? 2 : 1}
            keyExtractor={(item, index) => `${item.productId || item.productGroupId || 'item'}-${index}`}
            columnWrapperStyle={viewMode === 'grid' ? styles.gridRow : undefined}
            contentContainerStyle={sortedDisplayedItems.length === 0 ? styles.emptyContainer : (viewMode === 'grid' ? styles.gridContent : styles.listContent)}
            showsVerticalScrollIndicator={false}
            extraData={[productSortOption, viewMode]}
            renderItem={({ item, index }) => (
              <ProductCard item={item} navigation={navigation} viewMode={viewMode} rank={index} />
            )}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <TrendingDown size={48} color="#94A3B8" />
                <Text style={styles.emptyTitle}>해당 카테고리의 상품이 없습니다</Text>
              </View>
            }
          />
        )}

        {/* Scroll-to-top FAB */}
        {!productLoading && sortedDisplayedItems.length > 0 && (
          <TouchableOpacity
            style={styles.fab}
            onPress={() => flatListRef.current?.scrollToOffset({ offset: 0, animated: true })}
            activeOpacity={0.85}
          >
            <ChevronUp size={22} color="#334155" strokeWidth={2} />
          </TouchableOpacity>
        )}

        {/* Sort Modal */}
        <Modal
          visible={isProductSortModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setIsProductSortModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <Pressable style={{ flex: 1 }} onPress={() => setIsProductSortModalVisible(false)} />
            <View style={styles.modalSheet}>
              <View style={styles.modalHandle} />
              <Text style={styles.modalTitle}>정렬</Text>
              {SORT_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt}
                  style={[styles.sortOption, opt === productSortOption && styles.sortOptionActive]}
                  onPress={() => { setProductSortOption(opt); setIsProductSortModalVisible(false); }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.sortOptionText, opt === productSortOption && styles.sortOptionTextActive]}>
                    {opt}
                  </Text>
                  {opt === productSortOption && <Ionicons name="checkmark" size={16} color="#3b82f6" />}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    );
  }

  // ── Tracked items layout (curationId path) ─────────────────────────────────
  const ListHeader = (
    <View>
      {description.length > 0 && (
        <View style={styles.infoBanner}>
          <Ionicons name="information-circle-outline" size={16} color="#3b82f6" style={{ marginRight: 6 }} />
          <Text style={styles.infoBannerText}>{description}</Text>
        </View>
      )}
      <View style={styles.controlBar}>
        <TouchableOpacity
          style={styles.controlSortBtn}
          onPress={() => setIsSortModalVisible(true)}
          activeOpacity={0.7}
        >
          <Text style={styles.controlSortText}>{sortOption}</Text>
          <Ionicons name="chevron-down" size={14} color="#334155" />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView edges={['bottom']} style={styles.container}>
      <FlatList
        data={sortedItems}
        keyExtractor={(item, index) => `${item.productId || item.productGroupId || 'item'}-${index}`}
        ListHeaderComponent={ListHeader}
        contentContainerStyle={sortedItems.length === 0 ? styles.emptyContainer : styles.listContent}
        showsVerticalScrollIndicator={false}
        extraData={sortOption}
        renderItem={({ item }) => (
          <TrackingCard
            item={item}
            isEditMode={false}
            isSelected={false}
            viewMode="list"
            onRemove={() => {}}
            onToggleSelect={() => {}}
            onLongPressActivate={() => {}}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <TrendingDown size={48} color="#94A3B8" />
            <Text style={styles.emptyTitle}>해당 조건의 상품이 없습니다</Text>
            <Text style={styles.emptySub}>다른 카테고리를 확인해보세요!</Text>
          </View>
        }
      />

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
                style={[styles.sortOption, opt === sortOption && styles.sortOptionActive]}
                onPress={() => { setSortOption(opt); setIsSortModalVisible(false); }}
                activeOpacity={0.7}
              >
                <Text style={[styles.sortOptionText, opt === sortOption && styles.sortOptionTextActive]}>
                  {opt}
                </Text>
                {opt === sortOption && <Ionicons name="checkmark" size={16} color="#3b82f6" />}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#fff' },
  loadingWrap:    { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent:    { paddingBottom: 40 },
  emptyContainer: { flex: 1, paddingBottom: 40 },

  // Category tab bar
  catTabBarWrap:    { borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  catTabBarContent: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  catTab: {
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1, borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  catTabActive:     { backgroundColor: '#0f172a', borderColor: '#0f172a' },
  catTabText:       { fontSize: 13, fontWeight: '600', color: '#64748b' },
  catTabTextActive: { color: '#fff' },

  // View mode toggle
  viewToggleBtn:       { padding: 6, borderRadius: 8 },
  viewToggleBtnActive: { backgroundColor: '#EFF6FF' },

  // Scroll-to-top FAB
  fab: {
    position: 'absolute', right: 20, bottom: 80,
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.15, shadowRadius: 8 },
      android: { elevation: 6 },
    }),
  },

  // Grid layout
  gridContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 40 },
  gridRow:     { justifyContent: 'space-between', marginBottom: 12 },

  // Info banner
  infoBanner: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: '#eff6ff', paddingHorizontal: 16, paddingVertical: 12,
  },
  infoBannerText: { flex: 1, fontSize: 13, color: '#1d4ed8', lineHeight: 19 },

  // Control bar
  controlBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderColor: '#f1f5f9',
  },
  controlSortBtn:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  controlSortText: { fontSize: 14, fontWeight: '600', color: '#334155' },

  // Empty state
  emptyState: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#334155' },
  emptySub:   { fontSize: 14, color: '#94a3b8', lineHeight: 21 },

  // Sort modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
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
  modalTitle:           { fontSize: 16, fontWeight: '800', color: '#0f172a', marginBottom: 8 },
  sortOption: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f1f5f9',
  },
  sortOptionActive:     {},
  sortOptionText:       { fontSize: 15, fontWeight: '500', color: '#334155' },
  sortOptionTextActive: { fontWeight: '700', color: '#3b82f6' },
});

const gbCard = StyleSheet.create({
  wrap: {
    width: CARD_WIDTH,
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    overflow: 'hidden',
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6 },
      android: { elevation: 2 },
    }),
  },
  imgWrap:      { position: 'relative', width: '100%', aspectRatio: 1 },
  img:          { width: '100%', height: '100%' },
  imgFallback:  { backgroundColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center' },
  rankBadge: {
    position: 'absolute', top: 6, left: 6, zIndex: 3,
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
  },
  rankBadgeText: { fontSize: 11, fontWeight: '900', color: '#fff' },
  discountBadge: {
    position: 'absolute', top: 6, right: 6, zIndex: 2,
    backgroundColor: '#ef4444', borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  discountBadgeText: { fontSize: 11, fontWeight: '900', color: '#fff' },
  body:        { padding: 10 },
  name:        { fontSize: 12, fontWeight: '600', color: '#0f172a', lineHeight: 17, marginBottom: 6 },
  priceRow:    { flexDirection: 'row', alignItems: 'baseline', gap: 4, flexWrap: 'wrap' },
  discountPct: { fontSize: 13, fontWeight: '800', color: '#EF4444' },
  price:       { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  origPrice:   { fontSize: 11, color: '#9CA3AF', textDecorationLine: 'line-through', marginTop: 2 },
  rocketBadge: { fontSize: 10, fontWeight: '700', color: '#2563EB', marginTop: 4 },
  freeBadge:   { fontSize: 10, fontWeight: '700', color: '#64748b', marginTop: 4 },

  // List-mode card
  listWrap: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f1f5f9',
    backgroundColor: '#fff',
  },
  listRankCol:  { width: 28, alignItems: 'center', justifyContent: 'center', marginRight: 4 },
  listRankNum:  { fontSize: 15, fontWeight: '900' },
  listImgWrap:  { width: 80, height: 80, borderRadius: 10, overflow: 'hidden', marginRight: 12, flexShrink: 0 },
  listImg:      { width: '100%', height: '100%' },
});
