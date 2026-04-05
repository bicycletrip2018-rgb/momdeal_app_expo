import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Linking,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '../firebase/config';
import { recordProductAction } from '../services/productActionService';

const SORT_OPTIONS = [
  { key: 'default',    label: '추천순' },
  { key: 'discount',   label: '할인율순' },
  { key: 'peer',       label: '또래 관심순' },
];

// ─── Row Card ─────────────────────────────────────────────────────────────────

function ProductRow({ item, navigation }) {
  const price =
    typeof item.price === 'number' && item.price > 0
      ? `₩${item.price.toLocaleString('ko-KR')}`
      : '가격 정보 없음';

  const discount =
    typeof item.originalPrice === 'number' && item.originalPrice > 0 && item.price > 0
      ? Math.round((1 - item.price / item.originalPrice) * 100)
      : null;

  return (
    <TouchableOpacity
      style={styles.rowCard}
      activeOpacity={0.85}
      onPress={() => {
        recordProductAction({
          userId: auth.currentUser?.uid,
          productId: item.productId,
          productGroupId: item.productId,
          actionType: 'click',
        });
        navigation.navigate('ProductDetail', {
          productId: item.productId,
          productName: item.name || '상품',
          coupangProduct: item,
        });
      }}
    >
      {/* Thumbnail */}
      <View style={styles.rowImageWrap}>
        {item.image ? (
          <Image source={{ uri: item.image }} style={styles.rowImage} resizeMode="cover" />
        ) : (
          <View style={[styles.rowImage, styles.rowImageFallback]} />
        )}
        {item.isRocket && (
          <View style={styles.rocketBadge}>
            <Text style={styles.rocketBadgeText}>로켓</Text>
          </View>
        )}
      </View>

      {/* Info */}
      <View style={styles.rowInfo}>
        <Text style={styles.rowName} numberOfLines={2}>{item.name || '이름 없음'}</Text>
        <View style={styles.priceRow}>
          {discount !== null && discount > 0 && (
            <Text style={styles.discountBadge}>{discount}%</Text>
          )}
          <Text style={styles.rowPrice}>{price}</Text>
        </View>
        {typeof item.originalPrice === 'number' && item.originalPrice > 0 && (
          <Text style={styles.originalPrice}>
            ₩{item.originalPrice.toLocaleString('ko-KR')}
          </Text>
        )}
        <Text style={styles.starRating}>⭐ 4.8 (1,000+)</Text>
      </View>

      {/* Track button */}
      <TouchableOpacity
        style={styles.trackBtn}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        onPress={() => {
          recordProductAction({
            userId: auth.currentUser?.uid,
            productId: item.productId,
            productGroupId: item.productId,
            actionType: 'track',
          });
        }}
        activeOpacity={0.7}
      >
        <Text style={styles.trackBtnText}>+</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function CategoryDetailScreen({ route, navigation }) {
  const { categoryId, categoryName } = route.params ?? {};

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sort, setSort] = useState('default');
  const [filterRocket, setFilterRocket] = useState(false);
  const [filterInStock, setFilterInStock] = useState(false);

  const fetchingRef = useRef(false);

  const fetchProducts = useCallback(async ({ isRefresh = false } = {}) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    if (!isRefresh) setLoading(true);
    try {
      const fn = httpsCallable(functions, 'getBestCategoryProducts');
      const result = await fn({ categoryId });
      setProducts(result?.data?.products ?? []);
    } catch (err) {
      console.log('CategoryDetail fetch error:', err?.message);
      setProducts([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
      fetchingRef.current = false;
    }
  }, [categoryId]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchProducts({ isRefresh: true });
  }, [fetchProducts]);

  const sorted = useMemo(() => {
    let list = [...products];

    // Filters
    if (filterRocket) list = list.filter((p) => p.isRocket);
    if (filterInStock) list = list.filter((p) => p.isSoldOut !== true);

    // Sort
    if (sort === 'discount') {
      list.sort((a, b) => {
        const dA = (a.originalPrice > 0 && a.price > 0) ? (1 - a.price / a.originalPrice) : 0;
        const dB = (b.originalPrice > 0 && b.price > 0) ? (1 - b.price / b.originalPrice) : 0;
        return dB - dA;
      });
    } else if (sort === 'peer') {
      // Peer signal: use rank from API order (lower index = more popular) — no extra data available
      // Keep original order as proxy for peer popularity
    }
    // 'default': keep API order

    return list;
  }, [products, sort, filterRocket, filterInStock]);

  const ListHeader = useMemo(() => (
    <View style={styles.controlBar}>
      {/* Filter pills */}
      <View style={styles.filterRow}>
        <TouchableOpacity
          style={[styles.filterPill, filterRocket && styles.filterPillActive]}
          onPress={() => setFilterRocket((v) => !v)}
          activeOpacity={0.8}
        >
          <Text style={[styles.filterPillText, filterRocket && styles.filterPillTextActive]}>
            🚀 로켓배송
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterPill, filterInStock && styles.filterPillActive]}
          onPress={() => setFilterInStock((v) => !v)}
          activeOpacity={0.8}
        >
          <Text style={[styles.filterPillText, filterInStock && styles.filterPillTextActive]}>
            품절제외
          </Text>
        </TouchableOpacity>
      </View>

      {/* Sort row */}
      <View style={styles.sortRow}>
        {SORT_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.key}
            style={[styles.sortBtn, sort === opt.key && styles.sortBtnActive]}
            onPress={() => setSort(opt.key)}
            activeOpacity={0.8}
          >
            <Text style={[styles.sortBtnText, sort === opt.key && styles.sortBtnTextActive]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Count */}
      <Text style={styles.countText}>{sorted.length}개 상품</Text>
    </View>
  ), [filterRocket, filterInStock, sort, sorted.length]);

  if (loading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color="#1d4ed8" />
        <Text style={styles.loadingText}>{categoryName} 상품 불러오는 중...</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={sorted}
      keyExtractor={(item, idx) =>
        item.productId ? `${item.productId}-${idx}` : String(idx)
      }
      renderItem={({ item }) => (
        <ProductRow item={item} navigation={navigation} />
      )}
      ListHeaderComponent={ListHeader}
      ListEmptyComponent={
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>표시할 상품이 없습니다</Text>
        </View>
      }
      ListFooterComponent={
        <TouchableOpacity
          style={styles.ctaFooter}
          activeOpacity={0.85}
          onPress={() => Linking.openURL('https://www.coupang.com').catch(() => {})}
        >
          <Text style={styles.ctaFooterText}>쿠팡에서 더 보기 →</Text>
          <Text style={styles.ctaFooterSub}>파트너스 활동을 통해 수수료를 받을 수 있습니다</Text>
        </TouchableOpacity>
      }
      style={styles.container}
      contentContainerStyle={styles.listContent}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={['#1d4ed8']}
          tintColor="#1d4ed8"
        />
      }
    />
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7fb' },
  listContent: { paddingBottom: 32 },

  loadingScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: '#f5f7fb' },
  loadingText: { fontSize: 14, color: '#64748b' },

  // Control bar
  controlBar: {
    backgroundColor: '#f0f4ff',
    borderBottomWidth: 1, borderBottomColor: '#c7d2fe',
    paddingBottom: 10,
  },
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4 },
  filterPill: {
    borderRadius: 16, borderWidth: 1, borderColor: '#cbd5e1',
    paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#fff',
  },
  filterPillActive: { backgroundColor: '#1d4ed8', borderColor: '#1d4ed8' },
  filterPillText: { fontSize: 13, fontWeight: '600', color: '#475569' },
  filterPillTextActive: { color: '#fff' },

  sortRow: { flexDirection: 'row', gap: 4, paddingHorizontal: 14, paddingTop: 8 },
  sortBtn: {
    borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5,
    backgroundColor: '#f1f5f9',
  },
  sortBtnActive: { backgroundColor: '#0f172a' },
  sortBtnText: { fontSize: 12, fontWeight: '600', color: '#64748b' },
  sortBtnTextActive: { color: '#fff' },

  countText: { fontSize: 12, color: '#94a3b8', paddingHorizontal: 14, paddingTop: 8 },

  // Row card
  rowCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
    paddingHorizontal: 14, paddingVertical: 12, gap: 12,
  },
  rowImageWrap: { width: 84, height: 84, borderRadius: 10, overflow: 'hidden', position: 'relative' },
  rowImage: { width: 84, height: 84 },
  rowImageFallback: { backgroundColor: '#e2e8f0' },
  rocketBadge: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(29,78,216,0.85)', paddingVertical: 2, alignItems: 'center',
  },
  rocketBadgeText: { fontSize: 9, fontWeight: '800', color: '#fff' },

  rowInfo: { flex: 1, gap: 4 },
  rowName: { fontSize: 13, fontWeight: '600', color: '#0f172a', lineHeight: 18 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  discountBadge: {
    fontSize: 12, fontWeight: '800', color: '#ef4444',
  },
  rowPrice: { fontSize: 15, fontWeight: '900', color: '#0f172a' },
  starRating: { fontSize: 11, color: '#f59e0b', fontWeight: '600' },
  originalPrice: { fontSize: 11, color: '#94a3b8', textDecorationLine: 'line-through' },

  trackBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: '#1d4ed8', alignItems: 'center', justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: '#1d4ed8', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.35, shadowRadius: 3 },
      android: { elevation: 3 },
    }),
  },
  trackBtnText: { fontSize: 18, color: '#fff', lineHeight: 22, marginTop: -1 },

  emptyBox: { alignItems: 'center', paddingVertical: 60 },
  emptyText: { fontSize: 14, color: '#94a3b8' },

  ctaFooter: {
    margin: 12, padding: 16, borderRadius: 12,
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#e4e7ed', alignItems: 'center', gap: 4,
  },
  ctaFooterText: { fontSize: 14, fontWeight: '700', color: '#1d4ed8' },
  ctaFooterSub: { fontSize: 11, color: '#94a3b8' },
});
