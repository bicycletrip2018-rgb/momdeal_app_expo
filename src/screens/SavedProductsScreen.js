import React, { useEffect, useState } from 'react';
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
import { onAuthStateChanged } from 'firebase/auth';
import { collection, doc, getDoc, onSnapshot, query, where } from 'firebase/firestore';
import { db, auth } from '../firebase/config';
import { toggleSavedProduct } from '../services/saveService';
import { recordProductAction } from '../services/productActionService';

function SavedCard({ item, onRemove, onPress }) {
  const image        = item?.image || null;
  const currentPrice = typeof item?.currentPrice === 'number' ? item.currentPrice : null;
  const lowestPrice  = typeof item?.lowestPrice  === 'number' ? item.lowestPrice  : null;
  const priceDrop    = typeof item?.priceDrop     === 'number' ? item.priceDrop    : 0;
  const guidance     = item?.guidance || null;
  const isGoodDeal   = Boolean(item?.isGoodDeal);
  const category     = item?.category || '';

  const guidanceBadgeStyle =
    guidance === '지금 구매 추천'   ? styles.guidanceBadgeGreen
    : guidance === '최근 최고가 근처' ? styles.guidanceBadgeRed
    : styles.guidanceBadgeOrange;

  const guidanceTextStyle =
    guidance === '지금 구매 추천'   ? styles.guidanceTextGreen
    : guidance === '최근 최고가 근처' ? styles.guidanceTextRed
    : styles.guidanceTextOrange;

  return (
    <View style={styles.card}>
      <TouchableOpacity style={styles.cardPressArea} activeOpacity={0.85} onPress={onPress}>
        <View style={styles.imagePlaceholder}>
          {image ? (
            <Image source={{ uri: image }} style={styles.image} resizeMode="cover" />
          ) : (
            <View style={styles.imageFallback}>
              <Text style={styles.imageFallbackIcon}>🛍️</Text>
            </View>
          )}
        </View>

        <View style={styles.cardInfo}>
          <Text style={styles.cardName} numberOfLines={2}>{item?.name || '이름 없음'}</Text>

          {(priceDrop > 0 || guidance) ? (
            <View style={styles.badgeRow}>
              {priceDrop > 0 ? (
                <View style={styles.priceDropBadge}>
                  <Text style={styles.priceDropText}>🔥 ₩{priceDrop.toLocaleString('ko-KR')} 하락</Text>
                </View>
              ) : null}
              {guidance ? (
                <View style={guidanceBadgeStyle}>
                  <Text style={guidanceTextStyle}>{guidance}</Text>
                </View>
              ) : null}
            </View>
          ) : null}

          {isGoodDeal ? (
            <View style={styles.goodDealChip}>
              <Text style={styles.goodDealText}>지금 살만한 가격</Text>
            </View>
          ) : null}

          {category ? (
            <View style={styles.categoryBadge}>
              <Text style={styles.categoryBadgeText}>{category}</Text>
            </View>
          ) : null}

          <View style={styles.priceRow}>
            <Text style={styles.cardPrice}>
              {currentPrice !== null && currentPrice > 0
                ? `₩${currentPrice.toLocaleString('ko-KR')}`
                : '가격 정보 없음'}
            </Text>
            {lowestPrice !== null && currentPrice !== null && lowestPrice < currentPrice ? (
              <Text style={styles.lowestPriceText}>최저 ₩{lowestPrice.toLocaleString('ko-KR')}</Text>
            ) : null}
          </View>
        </View>
      </TouchableOpacity>

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
  console.log('[SavedProducts] SCREEN RENDERED');

  const [savedProducts, setSavedProducts] = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);

  useEffect(() => {
    let unsubSnapshot = null;

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      console.log('[SavedProducts] Auth state changed. User:', user?.uid);

      if (unsubSnapshot) {
        unsubSnapshot();
        unsubSnapshot = null;
      }

      if (!user) {
        setSavedProducts([]);
        setLoading(false);
        return;
      }

      const q = query(
        collection(db, 'user_saved_products'),
        where('userId', '==', user.uid),
      );

      unsubSnapshot = onSnapshot(
        q,
        async (snapshot) => {
          console.log('[SavedProducts] Snapshot docs count:', snapshot.size);

          if (snapshot.empty) {
            setSavedProducts([]);
            setLoading(false);
            return;
          }

          try {
            // Include the linkage doc ID as savedId so cards have a stable key
            const linkages = snapshot.docs.map((d) => ({ savedId: d.id, ...d.data() }));
            console.log('[SavedProducts] Linkages mapped. Group IDs:', linkages.map((l) => l.productGroupId));

            const enrichedPromises = linkages.map(async (link) => {
              if (!link.productGroupId) {
                console.error('[SavedProducts] Missing productGroupId in linkage:', link);
                return null;
              }
              const productRef  = doc(db, 'products', link.productGroupId);
              const productSnap = await getDoc(productRef);
              if (productSnap.exists()) {
                return { id: productSnap.id, ...productSnap.data(), ...link };
              } else {
                console.error('[SavedProducts] Product doc not found for ID:', link.productGroupId);
                return null;
              }
            });

            const enrichedResults = await Promise.all(enrichedPromises);
            const validProducts   = enrichedResults.filter((p) => p !== null);
            console.log('[SavedProducts] Final enriched valid products count:', validProducts.length);
            setSavedProducts(validProducts);
          } catch (err) {
            console.error('[SavedProducts] Enrichment error:', err);
          } finally {
            setLoading(false);
            setRefreshing(false);
          }
        },
        (error) => {
          console.error('[SavedProducts] onSnapshot listener error:', error);
          setLoading(false);
        },
      );
    });

    return () => {
      unsubAuth();
      if (unsubSnapshot) unsubSnapshot();
    };
  }, []);

  const handleRefresh = () => {
    // onSnapshot keeps data live; pull-to-refresh just resets the visual state
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 600);
  };

  const handleRemove = async (productGroupId) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    try {
      await toggleSavedProduct(uid, productGroupId);
      // onSnapshot fires automatically
    } catch (e) {
      console.error('[SavedProducts] handleRemove error:', e);
    }
  };

  const handleProductPress = (productGroupId, productName) => {
    recordProductAction({
      userId:     auth.currentUser?.uid,
      productId:  productGroupId,
      actionType: 'click',
    });
    navigation.navigate('ProductDetail', { productId: productGroupId, productName });
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
        savedProducts.length === 0 && styles.scrollContentEmpty,
      ]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
    >
      {savedProducts.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>저장한 상품이 없습니다</Text>
          <Text style={styles.emptySubText}>상품 카드의 ☆ 버튼으로 저장해 보세요</Text>
        </View>
      ) : (
        savedProducts.map((item) => (
          <SavedCard
            key={item.savedId || item.productGroupId}
            item={item}
            onRemove={() => handleRemove(item.productGroupId)}
            onPress={() => handleProductPress(item.productGroupId, item.name)}
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
