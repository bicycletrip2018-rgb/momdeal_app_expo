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
import { getRecentReviews } from '../services/communityService';
import { recordProductAction } from '../services/productActionService';
import { getBulkLikeData, toggleLike } from '../services/reviewLikeService';

// ─── ReviewCard ───────────────────────────────────────────────────────────────
//
// Card layout:
//   [Product row]    — image + name + category + chevron (tappable → ProductDetail)
//   [divider]
//   [Rating row]     — star string + "구매 인증" badge
//   [Content]        — review text (3 lines max)
//   [Date]
//   [action divider]
//   [Action row]     — ♥ N 좋아요 | 💬 댓글 (placeholder)
//
// Verified reviews: green card border + subtle background tint.
// Outer card is View (not TouchableOpacity) — inner buttons are sibling TouchableOpacity
// elements to satisfy the no-nested-touchable rule.

function ReviewCard({ item, onProductPress, liked, likeCount, onLike }) {
  const product = item?.product;
  const productName = product?.name || '상품';
  const productImage = product?.image || null;
  const category = product?.category || '';
  const rating = typeof item?.rating === 'number' ? item.rating : 0;
  const content = item?.content || '';
  const isVerified = Boolean(item?.verifiedPurchase);
  const dateStr = item?.createdAt?.toDate
    ? item.createdAt.toDate().toLocaleDateString('ko-KR')
    : '';

  const stars = [1, 2, 3, 4, 5].map((s) => (s <= rating ? '★' : '☆')).join('');

  return (
    <View style={[styles.card, isVerified && styles.cardVerified]}>

      {/* Product header row — tappable */}
      <TouchableOpacity
        style={styles.productRow}
        onPress={onProductPress}
        activeOpacity={0.8}
      >
        <View style={styles.productThumb}>
          {productImage ? (
            <Image source={{ uri: productImage }} style={styles.productImage} resizeMode="cover" />
          ) : (
            <View style={styles.productImageFallback}>
              <Text style={styles.productImageFallbackIcon}>🛍️</Text>
            </View>
          )}
        </View>
        <View style={styles.productInfo}>
          <Text style={styles.productName} numberOfLines={1}>{productName}</Text>
          {category ? (
            <View style={styles.categoryBadge}>
              <Text style={styles.categoryBadgeText}>{category}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.chevron}>›</Text>
      </TouchableOpacity>

      <View style={styles.divider} />

      {/* Rating + verified badge */}
      <View style={styles.ratingRow}>
        <Text style={styles.stars}>{stars}</Text>
        {isVerified ? (
          <View style={styles.verifiedBadge}>
            <Text style={styles.verifiedText}>✓ 구매 인증</Text>
          </View>
        ) : null}
      </View>

      {/* Review content */}
      {content ? (
        <Text style={styles.reviewContent} numberOfLines={3}>{content}</Text>
      ) : (
        <Text style={styles.reviewContentEmpty}>내용 없음</Text>
      )}

      {/* Date */}
      {dateStr ? <Text style={styles.reviewDate}>{dateStr}</Text> : null}

      <View style={styles.actionDivider} />

      {/* Action row — like button (stateful) + comment button (placeholder) */}
      <View style={styles.actionRow}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={onLike}
          activeOpacity={0.7}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <Text style={[styles.actionButtonText, liked && styles.actionButtonLiked]}>
            ♥{likeCount > 0 ? ` ${likeCount}` : ''} 좋아요
          </Text>
        </TouchableOpacity>

        <View style={styles.actionSeparator} />

        {/* 댓글: UI only — no backend yet */}
        <TouchableOpacity
          style={styles.actionButton}
          activeOpacity={0.7}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <Text style={styles.actionButtonText}>💬 댓글</Text>
        </TouchableOpacity>
      </View>

    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function CommunityFeedScreen({ navigation }) {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // likes: { [reviewId]: { liked: boolean, count: number } }
  // Backed by Firestore review_likes collection; optimistic updates applied locally.
  const [likes, setLikes] = useState({});

  const loadData = useCallback(async () => {
    try {
      const uid = auth.currentUser?.uid;
      const data = await getRecentReviews(20);
      setReviews(data);

      if (data.length > 0) {
        const reviewIds = data.map((r) => r.reviewId);
        const bulkLikes = await getBulkLikeData(uid, reviewIds);
        setLikes(bulkLikes);
      }
    } catch (error) {
      console.log('CommunityFeedScreen load error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Refresh when returning to this tab (a new review may have been written)
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (!loading) loadData();
    });
    return unsubscribe;
  }, [navigation, loading, loadData]);

  const handleProductPress = (productId, productName) => {
    recordProductAction({
      userId: auth.currentUser?.uid,
      productId,
      actionType: 'click',
    });
    navigation.navigate('ProductDetail', { productId, productName });
  };

  // Optimistic like toggle backed by Firestore.
  // Applies UI update immediately; rolls back on error.
  const handleLike = async (reviewId) => {
    const uid = auth.currentUser?.uid;
    if (!uid || !reviewId) return;

    const prev = likes[reviewId] || { liked: false, count: 0 };
    const optimistic = {
      liked: !prev.liked,
      count: prev.liked ? prev.count - 1 : prev.count + 1,
    };

    // Immediate UI update
    setLikes((current) => ({ ...current, [reviewId]: optimistic }));

    try {
      await toggleLike(uid, reviewId);
    } catch (error) {
      // Rollback to pre-tap state
      setLikes((current) => ({ ...current, [reviewId]: prev }));
      console.log('CommunityFeedScreen handleLike error:', error);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
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
        reviews.length === 0 && styles.scrollContentEmpty,
      ]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
    >
      <Text style={styles.sectionTitle}>최근 리뷰</Text>

      {reviews.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>아직 리뷰가 없습니다</Text>
          <Text style={styles.emptySubText}>상품을 구매하고 첫 리뷰를 남겨 보세요!</Text>
        </View>
      ) : (
        reviews.map((review) => {
          const likeState = likes[review.reviewId] || { liked: false, count: 0 };
          return (
            <ReviewCard
              key={review.reviewId}
              item={review}
              liked={likeState.liked}
              likeCount={likeState.count}
              onLike={() => handleLike(review.reviewId)}
              onProductPress={() =>
                handleProductPress(review.productId, review.product?.name || '상품')
              }
            />
          );
        })
      )}
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

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
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0f172a',
    marginTop: 8,
    marginBottom: 4,
  },
  // ─── Card ────────────────────────────────────────────────────────────────────
  card: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e4e7ed',
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  // Verified reviews: green border + subtle background tint
  cardVerified: {
    borderColor: '#86efac',
    backgroundColor: '#f9fffe',
  },
  // ─── Product header row ───────────────────────────────────────────────────────
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  productThumb: {
    width: 40,
    height: 40,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: '#f1f5f9',
    flexShrink: 0,
  },
  productImage: {
    width: 40,
    height: 40,
  },
  productImageFallback: {
    width: 40,
    height: 40,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  productImageFallbackIcon: {
    fontSize: 18,
  },
  productInfo: {
    flex: 1,
    gap: 3,
  },
  productName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
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
  chevron: {
    fontSize: 20,
    color: '#cbd5e1',
    paddingLeft: 4,
  },
  // ─── Dividers ─────────────────────────────────────────────────────────────────
  divider: {
    height: 1,
    backgroundColor: '#f1f5f9',
    marginHorizontal: -12,
  },
  actionDivider: {
    height: 1,
    backgroundColor: '#f1f5f9',
    marginHorizontal: -12,
    marginTop: 2,
  },
  // ─── Rating row ───────────────────────────────────────────────────────────────
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stars: {
    fontSize: 15,
    color: '#f59e0b',
    letterSpacing: 2,
  },
  verifiedBadge: {
    backgroundColor: '#f0fdf4',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  verifiedText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#15803d',
  },
  // ─── Review content ───────────────────────────────────────────────────────────
  reviewContent: {
    fontSize: 14,
    color: '#334155',
    lineHeight: 20,
  },
  reviewContentEmpty: {
    fontSize: 13,
    color: '#94a3b8',
  },
  reviewDate: {
    fontSize: 12,
    color: '#94a3b8',
  },
  // ─── Action row (like + comment) ─────────────────────────────────────────────
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 2,
  },
  actionButton: {
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94a3b8',
  },
  actionButtonLiked: {
    color: '#f43f5e',
  },
  actionSeparator: {
    width: 1,
    height: 14,
    backgroundColor: '#e2e8f0',
    marginHorizontal: 10,
  },
  // ─── Empty state ──────────────────────────────────────────────────────────────
  emptyCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 48,
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
});
