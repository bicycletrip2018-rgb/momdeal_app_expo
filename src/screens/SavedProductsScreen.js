import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { auth } from '../firebase/config';
import { toggleSavedProduct } from '../services/saveService';
import { getSavedProductsWithPriceSignals } from '../services/priceAlertService';
import { recordProductAction } from '../services/productActionService';

function SavedCard({ item, onRemove, onPress }) {
  const image = item?.image || null;
  const category = item?.category || '';
  const currentPrice = typeof item?.currentPrice === 'number' ? item.currentPrice : null;
  const lowestPrice = typeof item?.lowestPrice === 'number' ? item.lowestPrice : null;
  const priceDrop = typeof item?.priceDrop === 'number' ? item.priceDrop : 0;
  const guidance = item?.guidance || null;
  const isGoodDeal = Boolean(item?.isGoodDeal);

  const guidanceBadgeStyle =
    guidance === '지금 구매 추천'
      ? styles.guidanceBadgeGreen
      : guidance === '최근 최고가 근처'
        ? styles.guidanceBadgeRed
        : styles.guidanceBadgeOrange;

  const guidanceTextStyle =
    guidance === '지금 구매 추천'
      ? styles.guidanceTextGreen
      : guidance === '최근 최고가 근처'
        ? styles.guidanceTextRed
        : styles.guidanceTextOrange;

  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.cardPressArea}
        activeOpacity={0.85}
        onPress={onPress}
      >
        {/* Thumbnail */}
        <View style={styles.imagePlaceholder}>
          {image ? (
            <Image source={{ uri: image }} style={styles.image} resizeMode="cover" />
          ) : (
            <View style={styles.imageFallback}>
              <Text style={styles.imageFallbackIcon}>🛍️</Text>
            </View>
          )}
        </View>

        {/* Info */}
        <View style={styles.cardInfo}>
          <Text style={styles.cardName} numberOfLines={2}>{item.name || '이름 없음'}</Text>

          {/* Price drop + guidance badges */}
          {(priceDrop > 0 || guidance) ? (
            <View style={styles.badgeRow}>
              {priceDrop > 0 ? (
                <View style={styles.priceDropBadge}>
                  <Text style={styles.priceDropText}>
                    🔥 ₩{priceDrop.toLocaleString('ko-KR')} 하락
                  </Text>
                </View>
              ) : null}
              {guidance ? (
                <View style={guidanceBadgeStyle}>
                  <Text style={guidanceTextStyle}>{guidance}</Text>
                </View>
              ) : null}
            </View>
          ) : null}

          {/* Good deal chip */}
          {isGoodDeal ? (
            <View style={styles.goodDealChip}>
              <Text style={styles.goodDealText}>지금 살만한 가격</Text>
            </View>
          ) : null}

          {/* Category */}
          {category ? (
            <View style={styles.categoryBadge}>
              <Text style={styles.categoryBadgeText}>{category}</Text>
            </View>
          ) : null}

          {/* Price row: current + lowest */}
          <View style={styles.priceRow}>
            <Text style={styles.cardPrice}>
              {currentPrice !== null && currentPrice > 0
                ? `₩${currentPrice.toLocaleString('ko-KR')}`
                : '가격 정보 없음'}
            </Text>
            {lowestPrice !== null && currentPrice !== null && lowestPrice < currentPrice ? (
              <Text style={styles.lowestPriceText}>
                최저 ₩{lowestPrice.toLocaleString('ko-KR')}
              </Text>
            ) : null}
          </View>

          {/* Alert status indicator */}
          {typeof item?.isAlertActive === 'boolean' ? (
            <Text style={styles.alertIndicatorText}>
              {item.isAlertActive ? '🔔 알림 ON' : '🔕 알림 OFF'}
            </Text>
          ) : null}
        </View>
      </TouchableOpacity>

      {/* Bookmark remove button */}
      <TouchableOpacity
        style={styles.bookmarkButton}
        onPress={onRemove}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        activeOpacity={0.6}
      >
        <Text style={styles.bookmarkIcon}>★</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function SavedProductsScreen({ navigation }) {
  const [savedItems, setSavedItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadSaved = useCallback(async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      setLoading(false);
      return;
    }

    try {
      const items = await getSavedProductsWithPriceSignals(uid);
      setSavedItems(items);
    } catch (error) {
      console.log('SavedProductsScreen load error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadSaved();
  }, [loadSaved]);

  // Refresh when navigating back to this tab
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (!loading) loadSaved();
    });
    return unsubscribe;
  }, [navigation, loading, loadSaved]);

  const handleRemove = async (productId) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    // Optimistic remove
    setSavedItems((prev) => prev.filter((item) => item.productId !== productId));

    try {
      await toggleSavedProduct(uid, productId);
    } catch (error) {
      console.log('SavedProductsScreen remove error:', error);
      loadSaved(); // re-fetch to restore correct state
    }
  };

  const handleProductPress = (productId, productName) => {
    recordProductAction({
      userId: auth.currentUser?.uid,
      productId,
      actionType: 'click',
    });
    navigation.navigate('ProductDetail', { productId, productName });
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadSaved();
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="small" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.scrollContent,
        savedItems.length === 0 && styles.scrollContentEmpty,
      ]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
    >
      {savedItems.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>저장한 상품이 없습니다</Text>
          <Text style={styles.emptySubText}>상품 카드의 ☆ 버튼으로 저장해 보세요</Text>
        </View>
      ) : (
        savedItems.map((item) => (
          <SavedCard
            key={item.savedId}
            item={item}
            onRemove={() => handleRemove(item.productId)}
            onPress={() => handleProductPress(item.productId, item.name)}
          />
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f7fb',
  },
  scrollContent: {
    padding: 12,
    paddingBottom: 32,
    gap: 8,
  },
  scrollContentEmpty: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f7fb',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#64748b',
  },
  emptySubText: {
    fontSize: 13,
    color: '#94a3b8',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e4e7ed',
    borderRadius: 10,
    padding: 12,
  },
  cardPressArea: {
    flex: 1,
    flexDirection: 'row',
    gap: 12,
  },
  imagePlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#f1f5f9',
    flexShrink: 0,
  },
  image: {
    width: 72,
    height: 72,
  },
  imageFallback: {
    width: 72,
    height: 72,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageFallbackIcon: {
    fontSize: 26,
  },
  cardInfo: {
    flex: 1,
    justifyContent: 'center',
    gap: 4,
  },
  cardName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
    lineHeight: 19,
  },
  categoryBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#eff6ff',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  categoryBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#2563eb',
  },
  cardPrice: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  bookmarkButton: {
    paddingLeft: 8,
    alignSelf: 'center',
  },
  bookmarkIcon: {
    fontSize: 22,
    color: '#f59e0b',
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 2,
  },
  priceDropBadge: {
    backgroundColor: '#f0fdf4',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  priceDropText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#15803d',
  },
  guidanceBadgeGreen: {
    backgroundColor: '#f0fdf4',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  guidanceBadgeOrange: {
    backgroundColor: '#fff7ed',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  guidanceBadgeRed: {
    backgroundColor: '#fef2f2',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  guidanceTextGreen: {
    fontSize: 11,
    fontWeight: '700',
    color: '#15803d',
  },
  guidanceTextOrange: {
    fontSize: 11,
    fontWeight: '700',
    color: '#c2410c',
  },
  guidanceTextRed: {
    fontSize: 11,
    fontWeight: '700',
    color: '#b91c1c',
  },
  goodDealChip: {
    alignSelf: 'flex-start',
    backgroundColor: '#dcfce7',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 2,
  },
  goodDealText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#15803d',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    gap: 6,
  },
  lowestPriceText: {
    fontSize: 11,
    color: '#64748b',
  },
  alertIndicatorText: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 1,
  },
});
