import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { collection, doc, getDoc, getDocs, orderBy, query, where } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../firebase/config';
import { getRecommendedProducts, buildRecommendationReasons, getFloatingWindowProducts } from '../services/recommendationService';
import { recordProductAction, incrementOptionStat } from '../services/productActionService';
import { getTrendingProducts, getRecentlyAddedProducts } from '../services/trendingService';
import { updateSelectedChild } from '../services/firestore/userRepository';
import { getSavedProducts, toggleSavedProduct } from '../services/saveService';
import { createPriceAlert } from '../services/priceAlertService';
import { searchCoupangProducts } from '../services/coupangApiService';

// Peer-matched section trust copy — cycles by index for floating-window carousel items.
const PEER_TRUST_COPIES = [
  '성장이 비슷한 또래 부모들이 많이 찾은 상품이에요',
  '비슷한 개월 수 아이를 둔 부모님들이 자주 선택해요',
  '또래 부모들이 이 시기에 가장 많이 담은 제품이에요',
  '우리 아이 단계에 딱 맞는 또래 추천 상품이에요',
];

// Trust-based recommendation copy — shown when internal scoring has no reason string.
// Also used as the sole reason for Coupang-sourced products (no scoreBreakdown).
const TRUST_COPIES = [
  '비슷한 개월 수 엄마들이 가장 많이 선택했어요',
  '최근 24시간, 구매가 빠르게 늘고 있어요',
  '요즘 엄마들 사이에서 선택이 몰리는 제품이에요',
  '지금 이 시기에 많이 찾는 필수템이에요',
  '비슷한 아이 키우는 엄마들이 먼저 담았어요',
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ title }) {
  return <Text style={styles.sectionTitle}>{title}</Text>;
}

function EmptyCard({ message }) {
  return (
    <View style={styles.emptyCard}>
      <Text style={styles.emptyText}>{message}</Text>
    </View>
  );
}

// Interactive bar — shown when multiple children exist
function ChildSelectorBar({ child, onPress }) {
  if (!child) return null;
  const name = child.name || '아이';
  const age = typeof child.ageMonth === 'number' ? `${child.ageMonth}개월` : null;
  const label = age ? `${name} (${age})` : name;
  return (
    <TouchableOpacity style={styles.selectorBar} onPress={onPress} activeOpacity={0.8}>
      <Text style={styles.selectorBarText}>👶 {label}에게 맞는 상품이에요</Text>
      <Text style={styles.selectorBarChevron}>▼</Text>
    </TouchableOpacity>
  );
}

// Static label — shown when only one child
function ChildMessage({ child }) {
  if (!child) return null;
  const name = child.name || '아이';
  const age = typeof child.ageMonth === 'number' ? `${child.ageMonth}개월` : null;
  const label = age ? `${name} (${age})` : name;
  return (
    <View style={styles.childMessage}>
      <Text style={styles.childMessageText}>👶 {label}에게 맞는 상품이에요</Text>
    </View>
  );
}

// Bottom-sheet modal listing all children
function ChildSelectorModal({ visible, childList, selectedChildId, onSelect, onClose }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalOverlay} onPress={onClose} activeOpacity={1}>
        <View style={styles.modalSheet}>
          <Text style={styles.modalTitle}>아이 선택</Text>
          {childList.map((c) => {
            const isSelected = c.id === selectedChildId;
            const age = typeof c.ageMonth === 'number' ? `${c.ageMonth}개월` : null;
            const label = age ? `${c.name || '아이'} (${age})` : c.name || '아이';
            return (
              <TouchableOpacity
                key={c.id}
                style={[styles.modalItem, isSelected && styles.modalItemSelected]}
                onPress={() => onSelect(c.id)}
                activeOpacity={0.8}
              >
                <Text style={[styles.modalItemText, isSelected && styles.modalItemTextSelected]}>
                  {label}
                </Text>
                {isSelected ? <Text style={styles.modalItemCheck}>✓</Text> : null}
              </TouchableOpacity>
            );
          })}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

// proof: { totalRating, reviewCount, verifiedCount, clickCount, priceDrop,
//           lowestPrice, averagePrice, guidance, isGoodDeal, isTopClick } | undefined
// isRecommended: true only for the "아이에게 추천" section — enables price signals + action button
// onBuyNow(wantsScrollToPurchase): called from the action button (only when isRecommended)
function ProductCard({ item, onPress, reasons, proof, isSaved, onSave, isRecommended, onBuyNow }) {
  const name = item?.product?.name || item?.name || '이름 없음';
  const category = item?.product?.category || item?.category || '';
  const currentPrice =
    typeof item?.product?.currentPrice === 'number'
      ? item.product.currentPrice
      : typeof item?.currentPrice === 'number'
        ? item.currentPrice
        : null;
  const image = item?.product?.image || item?.image || null;

  const displayReasons = Array.isArray(reasons) ? reasons.slice(0, 1) : [];
  const isTrending = (item?.scoreBreakdown?.trendScore || 0) > 0.3;
  const priceDrop = proof?.priceDrop || 0;
  const lowestPrice = proof?.lowestPrice ?? null;
  const guidance = proof?.guidance ?? null;
  const isGoodDeal = Boolean(proof?.isGoodDeal);

  // "지금 사는 타이밍": price dropped + guidance is best + top 30% peer clicks
  const isTopBuying =
    isRecommended &&
    priceDrop > 0 &&
    guidance === '지금 구매 추천' &&
    Boolean(proof?.isTopClick);

  const guidanceBadgeStyle =
    guidance === '지금 구매 추천'
      ? styles.guidanceBadgeGreen
      : guidance === '최근 최고가 근처'
        ? styles.guidanceBadgeRed
        : styles.guidanceBadgeOrange;

  const guidanceBadgeTextStyle =
    guidance === '지금 구매 추천'
      ? styles.guidanceBadgeTextGreen
      : guidance === '최근 최고가 근처'
        ? styles.guidanceBadgeTextRed
        : styles.guidanceBadgeTextOrange;

  const avgRating =
    proof?.reviewCount > 0
      ? Math.round((proof.totalRating / proof.reviewCount) * 10) / 10
      : null;

  const mainContent = (
    <View style={styles.cardRow}>
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

      {/* Info column */}
      <View style={styles.cardInfo}>
        <View style={styles.nameRow}>
          <Text style={styles.cardName} numberOfLines={2}>{name}</Text>
          <TouchableOpacity
            onPress={onSave}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.6}
          >
            <Text style={isSaved ? styles.bookmarkSaved : styles.bookmark}>
              {isSaved ? '★' : '☆'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Badges: top-buying > flame > price drop > guidance > reasons */}
        {(isTopBuying || isTrending || priceDrop > 0 || (isRecommended && guidance) || displayReasons.length > 0) ? (
          <View style={styles.badgeRow}>
            {isTopBuying ? (
              <View style={styles.topBuyingBadge}>
                <Text style={styles.topBuyingText}>🔥 지금 사는 타이밍</Text>
              </View>
            ) : null}
            {!isTopBuying && isTrending ? (
              <View style={styles.flameBadge}>
                <Text style={styles.flameBadgeText}>🔥 인기 상승</Text>
              </View>
            ) : null}
            {!isTopBuying && priceDrop > 0 ? (
              <View style={styles.priceDropBadge}>
                <Text style={styles.priceDropBadgeText}>
                  📉 가격하락 ₩{priceDrop.toLocaleString('ko-KR')}
                </Text>
              </View>
            ) : null}
            {isRecommended && guidance ? (
              <View style={guidanceBadgeStyle}>
                <Text style={guidanceBadgeTextStyle}>{guidance}</Text>
              </View>
            ) : null}
            {isGoodDeal ? (
              <View style={styles.goodDealBadge}>
                <Text style={styles.goodDealBadgeText}>가성비 높은 상품</Text>
              </View>
            ) : null}
            {displayReasons.map((reason) => (
              <View key={reason} style={styles.reasonBadge}>
                <Text style={styles.reasonText}>{reason}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* Star rating + verified count */}
        {avgRating !== null ? (
          <View style={styles.statsRow}>
            <Text style={styles.ratingText}>⭐ {avgRating} ({proof.reviewCount})</Text>
            {proof.verifiedCount > 0 ? (
              <Text style={styles.verifiedCountText}>
                구매 인증 리뷰 {proof.verifiedCount}개
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* Peer click count */}
        {proof?.clickCount > 0 ? (
          <Text style={styles.peerClickText}>
            또래 부모 {proof.clickCount}명이 클릭
          </Text>
        ) : null}

        {/* Category */}
        {category ? (
          <View style={styles.categoryBadge}>
            <Text style={styles.categoryBadgeText}>{category}</Text>
          </View>
        ) : null}

        {/* Price row — recommended cards show lowest too */}
        {isRecommended ? (
          <View style={styles.priceRow}>
            <Text style={styles.cardPrice}>
              {currentPrice !== null && currentPrice > 0
                ? `₩${currentPrice.toLocaleString('ko-KR')}`
                : '가격 정보 없음'}
            </Text>
            {lowestPrice !== null && currentPrice !== null && lowestPrice < currentPrice ? (
              <Text style={styles.lowestPriceText}>이 상품보다 더 저렴한 옵션 있음</Text>
            ) : null}
          </View>
        ) : (
          <Text style={styles.cardPrice}>
            {currentPrice !== null && currentPrice > 0
              ? `₩${currentPrice.toLocaleString('ko-KR')}`
              : '가격 정보 없음'}
          </Text>
        )}
      </View>
    </View>
  );

  // Non-recommended: simple touchable card (no nested-touchable issues)
  if (!isRecommended) {
    return (
      <TouchableOpacity style={styles.card} activeOpacity={0.85} onPress={onPress}>
        {mainContent}
      </TouchableOpacity>
    );
  }

  // Recommended: View wrapper + pressable content + action button
  return (
    <View style={styles.card}>
      <TouchableOpacity activeOpacity={0.85} onPress={onPress}>
        {mainContent}
      </TouchableOpacity>
      <View style={styles.actionDivider} />
      <TouchableOpacity
        style={[styles.actionButton, isGoodDeal ? styles.actionButtonBuy : styles.actionButtonView]}
        onPress={() => onBuyNow?.(isGoodDeal)}
        activeOpacity={0.85}
      >
        <Text style={[styles.actionButtonText, isGoodDeal ? styles.actionButtonTextBuy : styles.actionButtonTextView]}>
          {isGoodDeal ? '지금 최저가 확인' : '가격 더 보기'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Featured card (first recommendation — large) ────────────────────────────

function FeaturedCard({ item, reason, proof, onPress, onBuyNow }) {
  const name = item?.product?.name || item?.name || '이름 없음';
  const currentPrice =
    typeof item?.product?.currentPrice === 'number'
      ? item.product.currentPrice
      : typeof item?.currentPrice === 'number'
        ? item.currentPrice
        : null;
  const image = item?.product?.image || item?.image || null;
  const guidance = proof?.guidance ?? null;
  const priceDrop = proof?.priceDrop || 0;
  const isGoodDeal = Boolean(proof?.isGoodDeal);
  const urgency =
    guidance === '지금 구매 추천'
      ? '🔥 지금 사는 타이밍'
      : priceDrop > 0
        ? `📉 가격 ₩${priceDrop.toLocaleString('ko-KR')} 하락`
        : null;

  return (
    <View style={styles.featuredCard}>
      <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
        {image ? (
          <Image source={{ uri: image }} style={styles.featuredImage} resizeMode="cover" />
        ) : (
          <View style={styles.featuredImageFallback}>
            <Text style={styles.featuredFallbackIcon}>🛍️</Text>
          </View>
        )}
        <View style={styles.featuredInfo}>
          {urgency ? <Text style={styles.featuredUrgency}>{urgency}</Text> : null}
          <Text style={styles.featuredName} numberOfLines={2}>{name}</Text>
          {reason ? (
            <View style={styles.featuredReasonBadge}>
              <Text style={styles.featuredReasonText}>{reason}</Text>
            </View>
          ) : null}
          <Text style={styles.featuredPrice}>
            {currentPrice !== null && currentPrice > 0
              ? `₩${currentPrice.toLocaleString('ko-KR')}`
              : '가격 정보 없음'}
          </Text>
        </View>
      </TouchableOpacity>
      <View style={styles.featuredDivider} />
      <TouchableOpacity
        style={[styles.featuredCta, isGoodDeal ? styles.featuredCtaBuy : styles.featuredCtaView]}
        onPress={() => onBuyNow?.(isGoodDeal)}
        activeOpacity={0.85}
      >
        <Text style={[styles.featuredCtaText, isGoodDeal ? styles.featuredCtaTextBuy : styles.featuredCtaTextView]}>
          {isGoodDeal ? '지금 최저가 확인' : '가격 더 보기'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Compact card (2nd–3rd recommendations — 2-col grid) ─────────────────────

function CompactCard({ item, reason, proof, onPress, onBuyNow }) {
  const name = item?.product?.name || item?.name || '이름 없음';
  const currentPrice =
    typeof item?.product?.currentPrice === 'number'
      ? item.product.currentPrice
      : typeof item?.currentPrice === 'number'
        ? item.currentPrice
        : null;
  const image = item?.product?.image || item?.image || null;
  const isGoodDeal = Boolean(proof?.isGoodDeal);

  return (
    <View style={styles.compactCard}>
      <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
        {image ? (
          <Image source={{ uri: image }} style={styles.compactImage} resizeMode="cover" />
        ) : (
          <View style={styles.compactImageFallback}>
            <Text style={styles.compactFallbackIcon}>🛍️</Text>
          </View>
        )}
        <View style={styles.compactInfo}>
          <Text style={styles.compactName} numberOfLines={2}>{name}</Text>
          {reason ? <Text style={styles.compactReason} numberOfLines={1}>{reason}</Text> : null}
          <Text style={styles.compactPrice}>
            {currentPrice !== null && currentPrice > 0
              ? `₩${currentPrice.toLocaleString('ko-KR')}`
              : '-'}
          </Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.compactCta, isGoodDeal ? styles.compactCtaBuy : styles.compactCtaView]}
        onPress={() => onBuyNow?.(isGoodDeal)}
        activeOpacity={0.85}
      >
        <Text style={[styles.compactCtaText, isGoodDeal ? styles.compactCtaTextBuy : styles.compactCtaTextView]}>
          {isGoodDeal ? '최저가 확인' : '보기'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── List card (4th+ recommendations — compact row) ──────────────────────────

function ListCard({ item, reason, proof, onPress, onBuyNow }) {
  const name = item?.product?.name || item?.name || '이름 없음';
  const currentPrice =
    typeof item?.product?.currentPrice === 'number'
      ? item.product.currentPrice
      : typeof item?.currentPrice === 'number'
        ? item.currentPrice
        : null;
  const isGoodDeal = Boolean(proof?.isGoodDeal);

  return (
    <View style={styles.listCard}>
      <TouchableOpacity style={styles.listPressArea} onPress={onPress} activeOpacity={0.85}>
        <View style={styles.listInfo}>
          <Text style={styles.listName} numberOfLines={1}>{name}</Text>
          {reason ? <Text style={styles.listReason} numberOfLines={1}>{reason}</Text> : null}
        </View>
        <Text style={styles.listPrice}>
          {currentPrice !== null && currentPrice > 0
            ? `₩${currentPrice.toLocaleString('ko-KR')}`
            : '-'}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.listCta, isGoodDeal ? styles.listCtaBuy : styles.listCtaView]}
        onPress={() => onBuyNow?.(isGoodDeal)}
        activeOpacity={0.85}
      >
        <Text style={[styles.listCtaText, isGoodDeal ? styles.listCtaTextBuy : styles.listCtaTextView]}>
          {isGoodDeal ? '최저가' : '보기'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Peer-match carousel (Section A — horizontal scroll) ─────────────────────
// Items come from getFloatingWindowProducts (±3mo floating age window).
// Logs actionType='product_click' with productGroupId per CLAUDE.md rules.

function PeerMatchCarousel({ items, onItemPress }) {
  if (!items || items.length === 0) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.peerCarouselContent}
    >
      {items.map((item, i) => {
        const name = item?.product?.name || item?.name || '이름 없음';
        const image = item?.product?.image || item?.image || null;
        const price = item?.product?.currentPrice ?? item?.currentPrice ?? null;
        const reason = PEER_TRUST_COPIES[i % PEER_TRUST_COPIES.length];
        return (
          <TouchableOpacity
            key={`peer-${item.productId}`}
            style={styles.peerCard}
            onPress={() => onItemPress(item)}
            activeOpacity={0.85}
          >
            {image ? (
              <Image source={{ uri: image }} style={styles.peerCardImage} resizeMode="cover" />
            ) : (
              <View style={[styles.peerCardImage, styles.peerCardImageFallback]}>
                <Text style={styles.peerCardFallbackIcon}>🛍️</Text>
              </View>
            )}
            <Text style={styles.peerCardName} numberOfLines={2}>{name}</Text>
            <Text style={styles.peerCardReason} numberOfLines={2}>{reason}</Text>
            {price !== null && price > 0 ? (
              <Text style={styles.peerCardPrice}>₩{price.toLocaleString('ko-KR')}</Text>
            ) : (
              <Text style={styles.peerCardPrice}>가격 정보 없음</Text>
            )}
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

// ─── Social proof fetch ───────────────────────────────────────────────────────

// Fetches review stats, click counts, and price drop for a set of productIds.
// Returns { [productId]: { totalRating, reviewCount, verifiedCount, clickCount, priceDrop } }
async function fetchSocialProof(productIds) {
  if (productIds.length === 0) return {};

  // Chunk to respect Firestore 'in' limit of 30
  const chunks = [];
  for (let i = 0; i < productIds.length; i += 30) {
    chunks.push(productIds.slice(i, i + 30));
  }

  const [reviewSnapshots, clickSnapshots, purchaseSnapshots, priceSnapshots] = await Promise.all([
    Promise.all(
      chunks.map((chunk) =>
        getDocs(query(collection(db, 'reviews'), where('productId', 'in', chunk)))
      )
    ),
    Promise.all(
      chunks.map((chunk) =>
        getDocs(
          query(
            collection(db, 'user_product_actions'),
            where('productId', 'in', chunk),
            where('actionType', '==', 'click')
          )
        )
      )
    ),
    Promise.all(
      chunks.map((chunk) =>
        getDocs(
          query(
            collection(db, 'user_product_actions'),
            where('productGroupId', 'in', chunk),
            where('actionType', '==', 'purchase')
          )
        )
      )
    ),
    Promise.all(
      chunks.map((chunk) =>
        getDocs(
          query(
            collection(db, 'product_price_history'),
            where('productId', 'in', chunk),
            orderBy('checkedAt', 'desc')
          )
        )
      )
    ),
  ]);

  const proofMap = {};

  const ensure = (pid) => {
    if (!proofMap[pid]) {
      proofMap[pid] = { totalRating: 0, reviewCount: 0, verifiedCount: 0, clickCount: 0, purchaseCount: 0, priceDrop: 0 };
    }
  };

  reviewSnapshots.forEach((snap) => {
    snap.docs.forEach((docSnapshot) => {
      const { productId, rating, verifiedPurchase } = docSnapshot.data();
      if (!productId) return;
      ensure(productId);
      proofMap[productId].totalRating += typeof rating === 'number' ? rating : 0;
      proofMap[productId].reviewCount += 1;
      if (verifiedPurchase) proofMap[productId].verifiedCount += 1;
    });
  });

  clickSnapshots.forEach((snap) => {
    snap.docs.forEach((docSnapshot) => {
      const productId = docSnapshot.data()?.productId;
      if (!productId) return;
      ensure(productId);
      proofMap[productId].clickCount += 1;
    });
  });

  purchaseSnapshots.forEach((snap) => {
    snap.docs.forEach((docSnapshot) => {
      const productId = docSnapshot.data()?.productGroupId;
      if (!productId) return;
      ensure(productId);
      proofMap[productId].purchaseCount += 1;
    });
  });

  // Group price history by productId (already ordered desc by checkedAt within each chunk)
  const priceHistoryByProduct = {};
  priceSnapshots.forEach((snap) => {
    snap.docs.forEach((docSnapshot) => {
      const { productId, price } = docSnapshot.data();
      if (!productId || typeof price !== 'number') return;
      if (!priceHistoryByProduct[productId]) priceHistoryByProduct[productId] = [];
      priceHistoryByProduct[productId].push(price);
    });
  });

  Object.entries(priceHistoryByProduct).forEach(([pid, prices]) => {
    if (prices.length === 0) return;
    ensure(pid);

    const current = prices[0];

    // Price drop vs previous record
    if (prices.length >= 2) {
      const drop = prices[1] - current;
      if (drop > 0) proofMap[pid].priceDrop = drop;
    }

    // Price intelligence signals for recommended cards
    const lowest = Math.min(...prices);
    const highest = Math.max(...prices);
    const average = Math.round(prices.reduce((s, p) => s + p, 0) / prices.length);
    proofMap[pid].lowestPrice = lowest;
    proofMap[pid].averagePrice = average;

    let guidance = null;
    if (current <= average * 0.95) {
      guidance = '지금 구매 추천';
    } else if (highest > 0 && current >= highest * 0.9) {
      guidance = '최근 최고가 근처';
    } else if (current > average) {
      guidance = '평균보다 높은 가격';
    }
    proofMap[pid].guidance = guidance;
    proofMap[pid].isGoodDeal =
      guidance === '지금 구매 추천' || current <= average * 0.95;
  });

  return proofMap;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function Tab1_ProductList({ navigation }) {
  const [recommendedProducts, setRecommendedProducts] = useState([]);
  const [peerMatchedProducts, setPeerMatchedProducts] = useState([]);
  const [trendingProducts, setTrendingProducts] = useState([]);
  const [recentProducts, setRecentProducts] = useState([]);
  const [socialProof, setSocialProof] = useState({});
  const [savedProductIds, setSavedProductIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [hasChild, setHasChild] = useState(true);
  const [child, setChild] = useState(null);
  const [allChildren, setAllChildren] = useState([]);
  const [selectedChildId, setSelectedChildId] = useState(null);
  const [selectorVisible, setSelectorVisible] = useState(false);
  const [coupangProducts, setCoupangProducts] = useState([]);

  useEffect(() => {
    // Trending and recently added do not require auth — start immediately.
    Promise.all([getTrendingProducts(10), getRecentlyAddedProducts(10)])
      .then(([trendingResult, recentResult]) => {
        setTrendingProducts(trendingResult);
        setRecentProducts(recentResult);
      })
      .catch(() => {});

    // Coupang fallback products — shown when no child is registered.
    // No API key exposed here; routed through Firebase Functions.
    searchCoupangProducts('기저귀', 20).then(setCoupangProducts).catch(() => {});

    // Auth-dependent fetch: onAuthStateChanged fires immediately with the
    // restored session (AsyncStorage persistence) instead of racing against
    // the async restoration that leaves auth.currentUser null on mount.
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      unsubscribe(); // fire once — we don't need to re-fetch on token refresh
      const uid = user?.uid ?? null;
      console.log('[Auth] currentUser.uid:', uid);

      try {
        if (!uid) {
          setHasChild(false);
          return;
        }

        getSavedProducts(uid)
          .then((saved) => setSavedProductIds(new Set(saved.map((s) => s.productId))))
          .catch(() => {});

        const [childrenSnap, userSnap] = await Promise.all([
          getDocs(query(collection(db, 'children'), where('userId', '==', uid))),
          getDoc(doc(db, 'users', uid)),
        ]);
        console.log('[Auth] children query count:', childrenSnap.docs.length);

        if (childrenSnap.docs.length === 0) {
          setHasChild(false);
          return;
        }

        const selChildId = userSnap.exists() ? userSnap.data().selectedChildId ?? null : null;
        const selectedDoc = selChildId
          ? childrenSnap.docs.find((d) => d.id === selChildId) ?? childrenSnap.docs[0]
          : childrenSnap.docs[0];
        const firstChild = selectedDoc ? { id: selectedDoc.id, ...selectedDoc.data() } : null;
        console.log('[Auth] loaded child (selectedChildId:', selChildId, '):', firstChild);

        if (!firstChild) {
          setHasChild(false);
          return;
        }

        const childList = childrenSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setAllChildren(childList);
        setSelectedChildId(selChildId ?? selectedDoc.id);
        setChild(firstChild);
        const [recommendations, floatingItems] = await Promise.all([
          getRecommendedProducts(firstChild),
          getFloatingWindowProducts(firstChild),
        ]);
        const sliced = recommendations.slice(0, 20);
        setRecommendedProducts(sliced);
        setPeerMatchedProducts(floatingItems);

        // Fetch social proof in background — cards render first, then enrich.
        // After loading, mark products in the top 30% of click counts as isTopClick.
        const productIds = sliced.map((r) => r.productId).filter(Boolean);
        fetchSocialProof(productIds)
          .then((proof) => {
            const allClicks = Object.values(proof)
              .map((p) => p.clickCount)
              .filter((c) => c > 0)
              .sort((a, b) => b - a);
            const threshold =
              allClicks.length > 0
                ? allClicks[Math.floor(allClicks.length * 0.3)] ?? 1
                : 1;
            const enriched = {};
            Object.entries(proof).forEach(([pid, p]) => {
              enriched[pid] = {
                ...p,
                isTopClick: p.clickCount > 0 && p.clickCount >= threshold,
              };
            });
            setSocialProof(enriched);
          })
          .catch(() => {});
      } catch (error) {
        console.log('Tab1_ProductList fetchAll error:', error);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleToggleSave = async (productId) => {
    const uid = auth.currentUser?.uid;
    if (!uid || !productId) return;

    const isCurrentlySaved = savedProductIds.has(productId);

    // Optimistic update
    setSavedProductIds((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });

    try {
      await toggleSavedProduct(uid, productId);
      // Auto-create price alert when saving (not when removing)
      if (!isCurrentlySaved) {
        createPriceAlert(uid, productId, 'drop').catch(() => {});
      }
    } catch (error) {
      // Rollback on failure
      setSavedProductIds((prev) => {
        const next = new Set(prev);
        if (next.has(productId)) next.delete(productId);
        else next.add(productId);
        return next;
      });
      console.log('toggleSavedProduct error:', error);
    }
  };

  // Peer-match carousel tap — logs product_click with productGroupId per CLAUDE.md.
  const handlePeerItemPress = (item) => {
    const productGroupId = item.productId;
    const productName = item?.product?.name || item?.name || '';
    const optionId = item.representativeOption?.optionId ?? null;
    recordProductAction({
      userId: auth.currentUser?.uid,
      productId: productGroupId,
      productGroupId,
      actionType: 'product_click',
    });
    if (optionId) {
      incrementOptionStat(productGroupId, optionId, 'clickCount').catch(() => {});
    }
    navigation.navigate('ProductDetail', { productId: productGroupId, productName });
  };

  const handleProductPress = (productId, productName, optionId) => {
    console.log('[optionStats] handleProductPress productId:', productId, '| optionId:', optionId);
    recordProductAction({
      userId: auth.currentUser?.uid,
      productId,
      actionType: 'click',
    });
    if (optionId) {
      incrementOptionStat(productId, optionId, 'clickCount').catch(() => {});
    }
    navigation.navigate('ProductDetail', { productId, productName });
  };

  // Called from recommended card action button.
  // wantsScrollToPurchase=true for "지금 구매하기", false for "가격 더 보기".
  const handleBuyNow = (productId, productName, wantsScrollToPurchase, optionId) => {
    console.log('[optionStats] handleBuyNow productId:', productId, '| optionId:', optionId);
    recordProductAction({
      userId: auth.currentUser?.uid,
      productId,
      actionType: 'click',
    });
    if (optionId) {
      incrementOptionStat(productId, optionId, 'clickCount').catch(() => {});
    }
    navigation.navigate('ProductDetail', {
      productId,
      productName,
      scrollToPurchase: wantsScrollToPurchase || undefined,
    });
  };

  const handleSelectChild = async (childId) => {
    setSelectorVisible(false);
    const newChild = allChildren.find((c) => c.id === childId);
    if (!newChild || childId === selectedChildId) return;

    setSelectedChildId(childId);
    setChild(newChild);
    updateSelectedChild(auth.currentUser?.uid, childId).catch(() => {});

    setLoading(true);
    try {
      const [recs, floatingItems] = await Promise.all([
        getRecommendedProducts(newChild),
        getFloatingWindowProducts(newChild),
      ]);
      const sliced = recs.slice(0, 20);
      setRecommendedProducts(sliced);
      setPeerMatchedProducts(floatingItems);

      const productIds = sliced.map((r) => r.productId).filter(Boolean);
      fetchSocialProof(productIds)
        .then((proof) => {
          const allClicks = Object.values(proof)
            .map((p) => p.clickCount)
            .filter((c) => c > 0)
            .sort((a, b) => b - a);
          const threshold =
            allClicks.length > 0
              ? allClicks[Math.floor(allClicks.length * 0.3)] ?? 1
              : 1;
          const enriched = {};
          Object.entries(proof).forEach(([pid, p]) => {
            enriched[pid] = { ...p, isTopClick: p.clickCount > 0 && p.clickCount >= threshold };
          });
          setSocialProof(enriched);
        })
        .catch(() => {});
    } catch (e) {
      console.log('handleSelectChild error:', e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="small" />
        <Text style={styles.helperText}>불러오는 중...</Text>
      </View>
    );
  }

  const featuredItem = recommendedProducts[0] ?? null;
  const compactItems = recommendedProducts.slice(1, 3);
  const listItems = recommendedProducts.slice(3);

  // idx drives which trust copy to cycle to when internal reasons are absent.
  const getReason = (item, idx = 0) =>
    buildRecommendationReasons(item.scoreBreakdown, {
      purchaseCount: socialProof[item.productId]?.purchaseCount,
      peerCount: item.product?.optionStats?.[item.representativeOption?.optionId]?.trackingCount,
    })[0] ?? TRUST_COPIES[idx % TRUST_COPIES.length];

  const getOnPress = (item) => () =>
    handleProductPress(item.productId, item?.product?.name || item?.name, item.representativeOption?.optionId);

  const getOnBuyNow = (item) => (wantsScroll) =>
    handleBuyNow(item.productId, item?.product?.name || item?.name, wantsScroll, item.representativeOption?.optionId);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      {/* Child selector — interactive if multiple children, static if single */}
      {allChildren.length > 1 ? (
        <>
          <ChildSelectorBar child={child} onPress={() => setSelectorVisible(true)} />
          <ChildSelectorModal
            visible={selectorVisible}
            childList={allChildren}
            selectedChildId={selectedChildId}
            onSelect={handleSelectChild}
            onClose={() => setSelectorVisible(false)}
          />
        </>
      ) : (
        <ChildMessage child={child} />
      )}

      {/* ── Section A: Peer-matched (±3mo floating window) ─────────────────── */}
      {hasChild && child ? (
        <>
          <SectionHeader
            title={`${child.name || '아이'}와 비슷한 친구들이 보고 있는 상품`}
          />
          {peerMatchedProducts.length > 0 ? (
            <PeerMatchCarousel
              items={peerMatchedProducts}
              onItemPress={handlePeerItemPress}
            />
          ) : (
            <EmptyCard message="아직 또래 데이터가 쌓이는 중이에요. 조금만 기다려주세요!" />
          )}
        </>
      ) : null}

      {/* ── Section B: General popular (internal scoring) ────────────────── */}
      <SectionHeader title={hasChild ? '지금 세이브루에서 가장 인기 있는 상품' : '맞춤 추천'} />
      {!hasChild ? (
        // No child registered — show live Coupang products with trust copy as reasons
        coupangProducts.length > 0 ? (
          <>
            <FeaturedCard
              item={coupangProducts[0]}
              reason={TRUST_COPIES[0]}
              onPress={() => handleProductPress(coupangProducts[0].productGroupId, coupangProducts[0].name, null)}
              onBuyNow={() => handleBuyNow(coupangProducts[0].productGroupId, coupangProducts[0].name, false, null)}
            />
            {coupangProducts.slice(1, 3).length > 0 ? (
              <View style={styles.compactRow}>
                {coupangProducts.slice(1, 3).map((item, i) => (
                  <CompactCard
                    key={item.productGroupId}
                    item={item}
                    reason={TRUST_COPIES[(i + 1) % TRUST_COPIES.length]}
                    onPress={() => handleProductPress(item.productGroupId, item.name, null)}
                    onBuyNow={() => handleBuyNow(item.productGroupId, item.name, false, null)}
                  />
                ))}
              </View>
            ) : null}
            {coupangProducts.slice(3).length > 0 ? (
              <>
                <SectionHeader title="더 많은 추천" />
                {coupangProducts.slice(3).map((item, i) => (
                  <ListCard
                    key={item.productGroupId}
                    item={item}
                    reason={TRUST_COPIES[(i + 3) % TRUST_COPIES.length]}
                    onPress={() => handleProductPress(item.productGroupId, item.name, null)}
                    onBuyNow={() => handleBuyNow(item.productGroupId, item.name, false, null)}
                  />
                ))}
              </>
            ) : null}
          </>
        ) : (
          <EmptyCard message="아이 정보를 등록하면 맞춤 추천을 받을 수 있어요" />
        )
      ) : !featuredItem ? (
        <EmptyCard message="추천 상품이 없습니다" />
      ) : (
        <FeaturedCard
          item={featuredItem}
          reason={getReason(featuredItem, 0)}
          proof={socialProof[featuredItem.productId]}
          onPress={getOnPress(featuredItem)}
          onBuyNow={getOnBuyNow(featuredItem)}
        />
      )}

      {/* B. Secondary section — next 2, compact 2-col */}
      {compactItems.length > 0 ? (
        <View style={styles.compactRow}>
          {compactItems.map((item, i) => (
            <CompactCard
              key={`compact-${item.productId}`}
              item={item}
              reason={getReason(item, i + 1)}
              proof={socialProof[item.productId]}
              onPress={getOnPress(item)}
              onBuyNow={getOnBuyNow(item)}
            />
          ))}
        </View>
      ) : null}

      {/* C. List section — remaining products */}
      {listItems.length > 0 ? (
        <>
          <SectionHeader title="더 많은 추천" />
          {listItems.map((item, i) => (
            <ListCard
              key={`list-${item.productId}`}
              item={item}
              reason={getReason(item, i + 3)}
              proof={socialProof[item.productId]}
              onPress={getOnPress(item)}
              onBuyNow={getOnBuyNow(item)}
            />
          ))}
        </>
      ) : null}

      {/* Section 2: Trending */}
      <SectionHeader title="비슷한 부모들의 인기 상품" />
      {trendingProducts.length === 0 ? (
        <EmptyCard message="인기 상품 정보가 없습니다" />
      ) : (
        trendingProducts.map((item, index) => (
          <ProductCard
            key={`trend-${item.productId || index}`}
            item={item}
            isSaved={savedProductIds.has(item.productId)}
            onSave={() => handleToggleSave(item.productId)}
            onPress={() => handleProductPress(item.productId, item.name)}
          />
        ))
      )}

      {/* Section 3: Recently Added */}
      <SectionHeader title="최근 등록된 상품" />
      {recentProducts.length === 0 ? (
        <EmptyCard message="등록된 상품이 없습니다" />
      ) : (
        recentProducts.map((item, index) => (
          <ProductCard
            key={`recent-${item.productId || index}`}
            item={item}
            isSaved={savedProductIds.has(item.productId)}
            onSave={() => handleToggleSave(item.productId)}
            onPress={() => handleProductPress(item.productId, item.name)}
          />
        ))
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
    paddingTop: 12,
    paddingHorizontal: 12,
    paddingBottom: 32,
    gap: 8,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#f5f7fb',
  },
  helperText: {
    color: '#64748b',
    fontSize: 14,
  },
  // ─── Peer-match carousel ─────────────────────────────────────────────────────
  peerCarouselContent: { gap: 10, paddingVertical: 4, paddingHorizontal: 2 },
  peerCard: {
    width: 148, backgroundColor: '#fff', borderRadius: 12,
    borderWidth: 1, borderColor: '#e4e7ed', padding: 10, gap: 6,
  },
  peerCardImage: { width: '100%', height: 96, borderRadius: 8 },
  peerCardImageFallback: { backgroundColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center' },
  peerCardFallbackIcon: { fontSize: 28 },
  peerCardName: { fontSize: 12, fontWeight: '700', color: '#0f172a', lineHeight: 16 },
  peerCardReason: { fontSize: 10, fontWeight: '600', color: '#2563eb', lineHeight: 14 },
  peerCardPrice: { fontSize: 12, fontWeight: '800', color: '#1e293b' },

  // ─── Featured card ───────────────────────────────────────────────────────────
  featuredCard: {
    backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e4e7ed', overflow: 'hidden',
  },
  featuredImage: { width: '100%', height: 200 },
  featuredImageFallback: {
    width: '100%', height: 200, backgroundColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center',
  },
  featuredFallbackIcon: { fontSize: 40 },
  featuredInfo: { padding: 14, gap: 6 },
  featuredUrgency: { fontSize: 12, fontWeight: '700', color: '#c2410c' },
  featuredName: { fontSize: 16, fontWeight: '800', color: '#0f172a', lineHeight: 22 },
  featuredReasonBadge: {
    alignSelf: 'flex-start', backgroundColor: '#fef3c7', borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3,
  },
  featuredReasonText: { fontSize: 11, fontWeight: '700', color: '#92400e' },
  featuredPrice: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  featuredDivider: { height: 1, backgroundColor: '#f1f5f9' },
  featuredCta: { paddingVertical: 13, alignItems: 'center' },
  featuredCtaBuy: { backgroundColor: '#f97316' },
  featuredCtaView: { backgroundColor: '#f8fafc' },
  featuredCtaText: { fontSize: 14, fontWeight: '700' },
  featuredCtaTextBuy: { color: '#fff' },
  featuredCtaTextView: { color: '#64748b' },
  // ─── Compact 2-col cards ─────────────────────────────────────────────────────
  compactRow: { flexDirection: 'row', gap: 8 },
  compactCard: {
    flex: 1, backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#e4e7ed', overflow: 'hidden',
  },
  compactImage: { width: '100%', height: 110 },
  compactImageFallback: {
    width: '100%', height: 110, backgroundColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center',
  },
  compactFallbackIcon: { fontSize: 26 },
  compactInfo: { padding: 8, gap: 3 },
  compactName: { fontSize: 12, fontWeight: '700', color: '#0f172a', lineHeight: 17 },
  compactReason: { fontSize: 10, fontWeight: '600', color: '#92400e' },
  compactPrice: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  compactCta: { paddingVertical: 8, alignItems: 'center' },
  compactCtaBuy: { backgroundColor: '#f97316' },
  compactCtaView: { backgroundColor: '#f8fafc', borderTopWidth: 1, borderTopColor: '#e4e7ed' },
  compactCtaText: { fontSize: 12, fontWeight: '700' },
  compactCtaTextBuy: { color: '#fff' },
  compactCtaTextView: { color: '#64748b' },
  // ─── List cards ──────────────────────────────────────────────────────────────
  listCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    borderRadius: 8, borderWidth: 1, borderColor: '#e4e7ed', paddingVertical: 10, paddingLeft: 12, paddingRight: 8,
  },
  listPressArea: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  listInfo: { flex: 1 },
  listName: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  listReason: { fontSize: 11, color: '#92400e', marginTop: 2 },
  listPrice: { fontSize: 13, fontWeight: '700', color: '#334155', marginLeft: 8, flexShrink: 0 },
  listCta: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6, marginLeft: 8 },
  listCtaBuy: { backgroundColor: '#f97316' },
  listCtaView: { backgroundColor: '#f1f5f9' },
  listCtaText: { fontSize: 11, fontWeight: '700' },
  listCtaTextBuy: { color: '#fff' },
  listCtaTextView: { color: '#64748b' },
  // ─── Child selector bar ──────────────────────────────────────────────────────
  selectorBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#eff6ff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 4,
  },
  selectorBarText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1d4ed8',
  },
  selectorBarChevron: {
    fontSize: 10,
    color: '#3b82f6',
    marginLeft: 8,
  },
  // ─── Child message (single child, non-interactive) ────────────────────────────
  childMessage: {
    backgroundColor: '#eff6ff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 4,
  },
  childMessageText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1d4ed8',
  },
  // ─── Child selector modal ─────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 36,
    gap: 4,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 12,
  },
  modalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 4,
  },
  modalItemSelected: {
    borderColor: '#3b82f6',
    backgroundColor: '#eff6ff',
  },
  modalItemText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#334155',
  },
  modalItemTextSelected: {
    color: '#1d4ed8',
    fontWeight: '700',
  },
  modalItemCheck: {
    fontSize: 15,
    color: '#1d4ed8',
    fontWeight: '700',
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0f172a',
    marginTop: 16,
    marginBottom: 6,
  },
  emptyCard: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e4e7ed',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
  },
  emptyText: {
    color: '#94a3b8',
    fontSize: 14,
  },
  card: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e4e7ed',
    borderRadius: 10,
    padding: 12,
    marginBottom: 2,
  },
  cardRow: {
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
  nameRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  cardName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
    lineHeight: 19,
  },
  bookmark: {
    fontSize: 18,
    color: '#cbd5e1',
  },
  bookmarkSaved: {
    fontSize: 18,
    color: '#f59e0b',
  },
  // Badges row: flame + reason labels
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  flameBadge: {
    backgroundColor: '#fff7ed',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  flameBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#c2410c',
  },
  priceDropBadge: {
    backgroundColor: '#f0fdf4',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  priceDropBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#15803d',
  },
  reasonBadge: {
    backgroundColor: '#fef3c7',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  reasonText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#92400e',
  },
  goodDealBadge: {
    backgroundColor: '#f0fdf4',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  goodDealBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#15803d',
  },
  // Review stats
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  ratingText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  verifiedCountText: {
    fontSize: 11,
    color: '#64748b',
  },
  // Peer interaction
  peerClickText: {
    fontSize: 11,
    color: '#64748b',
  },
  // Category badge
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
  // Price row with lowest price
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
  // "지금 사는 타이밍" — all strong signals badge
  topBuyingBadge: {
    backgroundColor: '#fff7ed',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  topBuyingText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#c2410c',
  },
  // Guidance badges (green / orange / red)
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
  guidanceBadgeTextGreen: { fontSize: 10, fontWeight: '700', color: '#15803d' },
  guidanceBadgeTextOrange: { fontSize: 10, fontWeight: '700', color: '#c2410c' },
  guidanceBadgeTextRed: { fontSize: 10, fontWeight: '700', color: '#b91c1c' },
  // Action button (recommended cards)
  actionDivider: {
    height: 1,
    backgroundColor: '#f1f5f9',
    marginTop: 10,
    marginHorizontal: -12,
  },
  actionButton: {
    marginTop: 8,
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: 'center',
  },
  actionButtonBuy: {
    backgroundColor: '#f97316',
  },
  actionButtonView: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: '700',
  },
  actionButtonTextBuy: {
    color: '#fff',
  },
  actionButtonTextView: {
    color: '#64748b',
  },
});
