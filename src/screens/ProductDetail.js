import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { recordProductAction, incrementOptionStat, recordAbTestAction } from '../services/productActionService';
import { getReviews } from '../services/reviewService';
import { getSavedProducts, toggleSavedProduct } from '../services/saveService';
import { getPriceIntelligence } from '../services/priceTrackingService';
import { getPriceAlertStatus, togglePriceAlert, createPriceAlert } from '../services/priceAlertService';
import { logProductClick } from '../services/analyticsService';
import { createDeeplink } from '../services/coupangService';
import { shareProduct } from '../services/sharingService';
import { getCoupangProductDetail } from '../services/coupangApiService';
import { selectRepresentativeOption, selectRepresentativeOffer, computePriceInsight } from '../services/recommendationService';
import { globalFavorites } from '../utils/favoriteStore';

// Returns a human-readable label for when the price was last verified.
// Uses product.priceLastUpdatedAt written by scheduledPriceUpdate.
function formatPriceTimestamp(timestamp) {
  if (!timestamp) return null;
  const ms = timestamp.toMillis?.() ?? (timestamp.seconds ? timestamp.seconds * 1000 : 0);
  if (!ms) return null;
  const diffH = (Date.now() - ms) / (1000 * 60 * 60);
  if (diffH < 1) return '실시간 최저가 확인됨 (방금 전)';
  if (diffH < 24) return `최근 가격 확인: ${Math.floor(diffH)}시간 전`;
  const d = new Date(ms);
  return `가격 확인일: ${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Simple bar chart — data is oldest-first array of prices.
// Bars colored green (at/below average) or red (above average).
function PriceGraph({ data, lowest, highest, average }) {
  if (!data || data.length < 2) return null;
  const range = highest - lowest;
  const MAX_H = 48;
  return (
    <View style={styles.graphWrap}>
      {data.map((price, i) => {
        const ratio = range > 0 ? (price - lowest) / range : 0.5;
        const barH = Math.max(3, Math.round(ratio * MAX_H));
        return (
          <View
            key={i}
            style={[
              styles.graphBar,
              { height: barH },
              price <= average ? styles.graphBarGreen : styles.graphBarRed,
            ]}
          />
        );
      })}
    </View>
  );
}

// Line graph — replaces the text-based "최근 가격 변동" table.
// snapshots: newest-first array of { price, checkedAt }.
// Renders a connected-dot sparkline with labeled min/max/current points.
function PriceLineGraph({ snapshots }) {
  const { width: screenW } = useWindowDimensions();
  const GRAPH_W = screenW - 48;
  const GRAPH_H = 90;
  const PAD = { top: 20, bottom: 8, left: 8, right: 8 };

  const pts = (Array.isArray(snapshots) ? [...snapshots].reverse() : [])
    .filter((s) => typeof s.price === 'number' && s.price > 0)
    .slice(0, 12);

  if (pts.length < 2) return null;

  const prices = pts.map((s) => s.price);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const range = maxP - minP;
  const innerW = GRAPH_W - PAD.left - PAD.right;
  const innerH = GRAPH_H - PAD.top - PAD.bottom;

  const getX = (i) => PAD.left + (pts.length === 1 ? innerW / 2 : (i / (pts.length - 1)) * innerW);
  const getY = (price) =>
    PAD.top + innerH - (range > 0 ? ((price - minP) / range) * innerH : innerH / 2);

  const minIdx = prices.indexOf(minP);
  const maxIdx = prices.lastIndexOf(maxP);
  const curIdx = pts.length - 1;

  const dots = pts.map((s, i) => ({
    x: getX(i), y: getY(s.price), price: s.price,
    isMin: i === minIdx, isMax: i === maxIdx, isCur: i === curIdx,
  }));

  // Segments: centered + rotated Views
  const segs = dots.slice(0, -1).map((d, i) => {
    const n = dots[i + 1];
    const dx = n.x - d.x, dy = n.y - d.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
    return { cx: (d.x + n.x) / 2 - len / 2, cy: (d.y + n.y) / 2 - 1, len, angle };
  });

  const avg = Math.round(prices.reduce((s, p) => s + p, 0) / prices.length);

  return (
    <View>
      <View style={{ height: GRAPH_H, width: GRAPH_W }}>
        {segs.map((s, i) => (
          <View
            key={`l${i}`}
            style={{
              position: 'absolute', left: s.cx, top: s.cy,
              width: s.len, height: 2, backgroundColor: '#f472b6',
              transform: [{ rotate: `${s.angle}deg` }],
            }}
          />
        ))}
        {dots.map((d, i) => {
          const r = d.isMin || d.isMax || d.isCur ? 5 : 3;
          const col = d.isMin ? '#22c55e' : d.isMax ? '#ef4444' : d.isCur ? '#f472b6' : '#cbd5e1';
          const lbl = d.isMin ? '최저' : d.isMax ? '최고' : d.isCur ? '현재' : null;
          return (
            <React.Fragment key={`d${i}`}>
              <View style={{
                position: 'absolute', left: d.x - r, top: d.y - r,
                width: r * 2, height: r * 2, borderRadius: r, backgroundColor: col, zIndex: 2,
              }} />
              {lbl ? (
                <Text style={{
                  position: 'absolute',
                  left: d.x - 18,
                  top: d.isMin ? d.y + 6 : d.y - 16,
                  width: 36, textAlign: 'center',
                  fontSize: 10, color: col, fontWeight: '700',
                }}>
                  {lbl}
                </Text>
              ) : null}
            </React.Fragment>
          );
        })}
      </View>
      <View style={styles.lineGraphStats}>
        <View style={styles.lineGraphStat}>
          <Text style={[styles.lineGraphStatVal, { color: '#22c55e' }]}>₩{minP.toLocaleString('ko-KR')}</Text>
          <Text style={styles.lineGraphStatLabel}>최저</Text>
        </View>
        <View style={styles.lineGraphStat}>
          <Text style={styles.lineGraphStatVal}>₩{avg.toLocaleString('ko-KR')}</Text>
          <Text style={styles.lineGraphStatLabel}>평균</Text>
        </View>
        <View style={styles.lineGraphStat}>
          <Text style={[styles.lineGraphStatVal, { color: '#ef4444' }]}>₩{maxP.toLocaleString('ko-KR')}</Text>
          <Text style={styles.lineGraphStatLabel}>최고</Text>
        </View>
      </View>
    </View>
  );
}

function Stars({ rating }) {
  return (
    <Text style={styles.stars}>
      {[1, 2, 3, 4, 5].map((s) => (s <= rating ? '★' : '☆')).join('')}
    </Text>
  );
}

export default function ProductDetail({ route, navigation }) {
  const productId = route?.params?.productId ? String(route.params.productId) : '';
  const fallbackName = route?.params?.productName || '상품';
  // Coupang-sourced product passed from RankingScreen (no Firestore doc exists for these)
  const coupangProduct = route?.params?.coupangProduct ?? null;
  // Item object passed directly from RankingScreen / fetchAffiliateAndNavigate
  const routeItem = route?.params?.item ?? null;
  // Item passed from CategoryScreen (dummy items with no Firestore doc)
  const passedItem = route?.params?.item || route?.params?.productData || null;
  // Source screen — used for conditional UX (e.g. auto-activate alert from Ranking)
  const source = route?.params?.source || route?.params?.from || null;

  const [product, setProduct] = useState(null);
  const [offer, setOffer] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [purchaseFeedback, setPurchaseFeedback] = useState(false);
  const [isSaved, setIsSaved] = useState(() => {
    const id = productId || routeItem?.id || '';
    return id ? globalFavorites.has(id) : false;
  });
  const [toastVisible, setToastVisible] = useState(false);
  const [priceIntel, setPriceIntel] = useState(null);
  // Auto-activate price alert when arriving from Ranking (user intent: deal tracking)
  const [alertStatus, setAlertStatus] = useState(() =>
    source === 'Ranking' ? { alertId: null, isActive: true } : null
  );
  const [offerSnapshots, setOfferSnapshots] = useState([]);
  const [weekPriceDrop, setWeekPriceDrop] = useState(0);
  const [trustSignals, setTrustSignals] = useState({ recentBuyers: 0, peerCount: 0, viewingCount: 0, recentHourBuyers: 0, peerPurchaseCount: 0 });
  const [selectedOption, setSelectedOption] = useState(null);
  const [abVariant] = useState(() => (Math.random() < 0.5 ? 'A' : 'B'));
  const [isCategoryTop, setIsCategoryTop] = useState(false);
  const [preConfirm, setPreConfirm] = useState(false);
  const [priceInsight, setPriceInsight] = useState(null);

  // displayItem: Firestore product (most complete) → item passed via navigation → minimal fallback
  const genericMock = { id: productId, name: fallbackName, price: 0, original: 0, discount: 0, rating: 0, reviewCount: 0, isRocket: false, brand: '', emoji: '📦' };
  const displayItem = product || routeItem || genericMock;

  const insets = useSafeAreaInsets();
  const scrollViewRef = useRef(null);
  const purchaseButtonY = useRef(0);
  const scrollToPurchase = route?.params?.scrollToPurchase;

  const fetchData = async () => {
    if (!productId) {
      setLoading(false);
      return;
    }
    try {
      const [productSnap, offersSnap, reviewList, priceChangeData, actionsSnap] = await Promise.all([
        getDoc(doc(db, 'products', productId)),
        getDocs(
          query(
            collection(db, 'products', productId, 'offers'),
            orderBy('checkedAt', 'desc'),
            limit(10)
          )
        ),
        getReviews(productId),
        getPriceIntelligence(productId),
        getDocs(query(collection(db, 'user_product_actions'), where('productId', '==', productId))),
      ]);

      if (productSnap.exists()) {
        const data = productSnap.data();
        setProduct({
          ...data,
          id: productSnap.id,
          productId: data.productId ?? productSnap.id,
        });
        const repOption = selectRepresentativeOption(data);
        if (repOption) setSelectedOption(repOption);

        // Background: fetch fresh affiliateUrl / price / image from Coupang CF.
        getCoupangProductDetail(productSnap.id)
          .then((extra) => {
            setProduct((prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                affiliateUrl: extra.affiliateUrl || prev.affiliateUrl || null,
                currentPrice: extra.currentPrice ?? prev.currentPrice ?? null,
                image: extra.image || prev.image || null,
              };
            });
          })
          .catch(() => {});

        // Background: check if this product is #1 in its category by trendScore
        const cat = data.category;
        if (cat) {
          getDocs(query(collection(db, 'products'), where('category', '==', cat), limit(20)))
            .then((snap) => {
              const top = snap.docs
                .map((d) => ({ id: d.id, score: d.data().trendScore ?? 0 }))
                .sort((a, b) => b.score - a.score)[0];
              setIsCategoryTop(top?.id === productId);
            })
            .catch(() => {});
        }
      } else if (coupangProduct) {
        // No Firestore doc — product came from Coupang ranking; populate from params
        setProduct({
          id: String(coupangProduct.productId),
          productId: String(coupangProduct.productId),
          name: coupangProduct.name || fallbackName,
          currentPrice: coupangProduct.price ?? null,
          image: coupangProduct.image ?? null,
          affiliateUrl: coupangProduct.affiliateUrl ?? null,
          isRocket: coupangProduct.isRocket ?? false,
          status: 'active',
          stageTags: [],
          categoryTags: [],
        });
        if (coupangProduct.price) {
          setOffer({
            price: coupangProduct.price,
            affiliateUrl: coupangProduct.affiliateUrl ?? null,
            sellerType: 'coupang',
            deliveryType: coupangProduct.isRocket ? 'rocket' : 'normal',
            isRocket: coupangProduct.isRocket ?? false,
          });
        }
      } else {
        // No Firestore doc and no coupangProduct — inject rich dummy so graph UI always renders
        const dummyFallback = {
          id: productId || 'unknown',
          productId: productId || 'unknown',
          name: route.params?.productData?.name || route.params?.item?.name || fallbackName || '샘플 기저귀/분유 특대형',
          brand: route.params?.productData?.brand || route.params?.item?.brand || '세이브루 샘플',
          currentPrice: route.params?.productData?.price || route.params?.item?.price || 31900,
          originalPrice: route.params?.productData?.originalPrice || route.params?.item?.originalPrice || 40500,
          discount: route.params?.productData?.discount || route.params?.item?.discount || 21,
          lowestPrice: 23700,
          averagePrice: 32240,
          image: 'https://via.placeholder.com/400',
          history: [
            { date: '10/01', price: 40500 },
            { date: '10/10', price: 32240 },
            { date: '10/20', price: 31900 },
          ],
          isRocket: true,
          unitPrice: route.params?.productData?.unitPrice || route.params?.item?.unitPrice || '장당 362원',
          status: 'active',
          stageTags: [],
          categoryTags: [],
        };
        setProduct(dummyFallback);
        setOffer({
          price: dummyFallback.currentPrice,
          affiliateUrl: null,
          sellerType: 'coupang',
          deliveryType: 'rocket',
          isRocket: true,
        });
      }
      if (!offersSnap.empty) {
        const snapshots = offersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setOffer(snapshots[0]);
        setOfferSnapshots(snapshots);
        setPriceInsight(computePriceInsight(snapshots));

        // Week-ago price: find the offer snapshot closest to 7 days ago
        const sevenDaysAgoMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
        const weekAgoSnap = snapshots.find((s) => {
          const ts = s.checkedAt?.toMillis?.() ?? 0;
          return ts > 0 && ts <= sevenDaysAgoMs;
        });
        if (weekAgoSnap?.price) {
          const latestPrice = snapshots[0].price ?? 0;
          const drop = weekAgoSnap.price - latestPrice;
          setWeekPriceDrop(drop > 0 ? drop : 0);
        }
      }
      setReviews(reviewList);
      setPriceIntel(priceChangeData);

      // Derive trust signals from action log
      const oneDayAgoMs = Date.now() - 24 * 60 * 60 * 1000;
      const oneHourAgoMs = Date.now() - 60 * 60 * 1000;
      let recentBuyers = 0;
      let recentHourBuyers = 0;
      let viewingCount = 0;
      let peerPurchaseCount = 0;
      const peerUserIds = new Set();
      actionsSnap.docs.forEach((d) => {
        const { actionType, createdAt, userId } = d.data();
        if (userId) peerUserIds.add(userId);
        const ts = createdAt?.toMillis?.() ?? 0;
        if (actionType === 'purchase' && ts >= oneDayAgoMs) recentBuyers += 1;
        if (actionType === 'purchase' && ts >= oneHourAgoMs) recentHourBuyers += 1;
        if (actionType === 'click' && ts >= oneHourAgoMs) viewingCount += 1;
        // Standardised purchase action — count for peer CTA badge
        if (
          (actionType === 'product_purchase_click' || actionType === 'purchase') &&
          ts >= oneDayAgoMs
        ) peerPurchaseCount += 1;
      });
      setTrustSignals({ recentBuyers, peerCount: peerUserIds.size, recentHourBuyers, viewingCount, peerPurchaseCount });
    } catch (error) {
      console.log('ProductDetail fetch error:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [productId]);

  // Fallback: if no Firestore doc was found (e.g. dummy Category items), use passedItem
  useEffect(() => {
    if (!loading && !product && passedItem) {
      const enriched = { ...passedItem };
      if (!enriched.history) {
        enriched.history = [
          { date: '10/01', price: enriched.originalPrice || enriched.price + 5000 },
          { date: '10/05', price: enriched.price + 2000 },
          { date: '10/10', price: enriched.price },
        ];
        enriched.lowestPrice = enriched.price;
        enriched.averagePrice = enriched.originalPrice || enriched.price + 3000;
      }
      enriched.id = enriched.id || productId;
      enriched.productId = enriched.productId || productId;
      enriched.name = enriched.name || fallbackName;
      enriched.currentPrice = enriched.currentPrice ?? enriched.price ?? 0;
      enriched.status = enriched.status || 'active';
      enriched.stageTags = enriched.stageTags || [];
      enriched.categoryTags = enriched.categoryTags || [];
      setProduct(enriched);
      if (enriched.price) {
        setOffer({ price: enriched.price, affiliateUrl: enriched.affiliateUrl ?? null, sellerType: 'coupang', deliveryType: 'normal', isRocket: false });
      }
    }
  }, [loading, product, passedItem]);

  // A/B test: log product_view once when loading finishes
  useEffect(() => {
    if (loading || !productId) return;
    const uid = auth.currentUser?.uid;
    recordAbTestAction({ userId: uid, productGroupId: productId, actionType: 'product_view', variant: abVariant, priceVerdict: priceInsight?.verdict ?? null });
  }, [loading]);

  // Fetch initial save state for this product
  useEffect(() => {
    if (!productId) return;
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    getSavedProducts(uid)
      .then((saved) => setIsSaved(saved.some((s) => s.productId === productId)))
      .catch(() => {});
  }, [productId]);

  // Fetch initial alert status for this product
  useEffect(() => {
    if (!productId) return;
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    getPriceAlertStatus(uid, productId).then(setAlertStatus).catch(() => {});
  }, [productId]);

  // Keep header icons in sync — bookmark + share
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => null,
      title: '상품 상세',
    });
  }, [navigation]);

  // Auto-scroll to purchase button when navigated with scrollToPurchase param
  useEffect(() => {
    if (!loading && scrollToPurchase && purchaseButtonY.current > 0) {
      const timer = setTimeout(() => {
        scrollViewRef.current?.scrollTo({
          y: Math.max(0, purchaseButtonY.current - 16),
          animated: true,
        });
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [loading, scrollToPurchase]);

  // Refresh reviews when returning from ReviewWriteScreen
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (!loading) {
        getReviews(productId).then(setReviews).catch(() => {});
      }
    });
    return unsubscribe;
  }, [navigation, productId, loading]);

  const handleToggleSave = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid || !productId) return;
    const wasNotSaved = !isSaved;
    setIsSaved((prev) => !prev); // optimistic
    if (wasNotSaved) {
      globalFavorites.add(productId);
      setToastVisible(true);
      setTimeout(() => setToastVisible(false), 2000);
    } else {
      globalFavorites.delete(productId);
    }
    try {
      await toggleSavedProduct(uid, productId);
      // Auto-create price alert when saving for the first time
      if (wasNotSaved) {
        createPriceAlert(uid, productId, 'drop').catch(() => {});
        console.log('[optionStats] handleToggleSave optionId:', selectedOption?.optionId);
        incrementOptionStat(product?.productGroupId || productId, selectedOption?.optionId, 'trackingCount').catch(() => {});
      }
    } catch (error) {
      setIsSaved((prev) => !prev); // rollback
      if (wasNotSaved) globalFavorites.delete(productId); else globalFavorites.add(productId);
      console.log('ProductDetail toggleSave error:', error);
    }
  };

  const handleToggleAlert = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid || !productId) return;
    const prevStatus = alertStatus;
    // Optimistic
    setAlertStatus((s) => (s ? { ...s, isActive: !s.isActive } : { alertId: null, isActive: true }));
    try {
      await togglePriceAlert(uid, productId);
      getPriceAlertStatus(uid, productId).then(setAlertStatus).catch(() => {});
    } catch (error) {
      setAlertStatus(prevStatus); // rollback
      console.log('ProductDetail toggleAlert error:', error);
    }
  };

  const handlePurchase = async () => {
    // URL priority: manual affiliateUrl (set in Firestore) > Coupang offer URL.
    // This allows revenue generation before the Coupang Partners API is active.
    const baseUrl =
      selectedOffer?.affiliateUrl ||
      product?.affiliateUrl ||
      offer?.url ||
      `https://www.coupang.com/np/search?q=${encodeURIComponent(product?.name || fallbackName)}`;
    setPurchasing(true);
    const abProductGroupId = product?.productGroupId || productId;
    const abUid = auth.currentUser?.uid;
    recordAbTestAction({ userId: abUid, productGroupId: abProductGroupId, actionType: 'product_click', variant: abVariant });
    try {
      const uid = auth.currentUser?.uid;
      const priceAtClick =
        typeof selectedOffer?.price === 'number' && selectedOffer.price > 0
          ? selectedOffer.price
          : typeof offer?.price === 'number' && offer.price > 0
            ? offer.price
            : typeof product?.currentPrice === 'number'
              ? product?.currentPrice
              : null;

      // Deep link generation only applies to raw Coupang URLs.
      // If affiliateUrl is set at offer or product level, skip createDeeplink.
      let finalUrl = baseUrl;
      let trackingId = null;
      if (!selectedOffer?.affiliateUrl && !product?.affiliateUrl) {
        try {
          const deeplink = await createDeeplink(baseUrl, uid);
          finalUrl = deeplink?.shortenUrl ?? baseUrl;
          trackingId = deeplink?.trackingId ?? null;
        } catch (_) {
          // Deeplink generation failed — fall back to raw Coupang URL.
          finalUrl = baseUrl;
        }
      }

      // Register click tracking BEFORE opening URL so the AppState listener
      // is ready before the app transitions to background.
      logProductClick({
        userId: uid,
        productId,
        priceAtClick,
        guidance: priceIntel?.guidance ?? null,
        isGoodDeal: priceIntel?.guidance === '지금 구매 추천',
        deeplinkUrl: finalUrl,
        trackingId,
      });

      await recordProductAction({
        userId: auth.currentUser?.uid,
        productId: product?.productGroupId || productId,
        productGroupId: product?.productGroupId || productId,
        actionType: 'product_purchase_click',
      });
      setPreConfirm(true);
      await new Promise((resolve) => setTimeout(resolve, 500));
      setPreConfirm(false);
      await Linking.openURL(finalUrl);
      recordAbTestAction({ userId: abUid, productGroupId: abProductGroupId, actionType: 'product_purchase_click', variant: abVariant });
      console.log('[FIX] conversion optionId:', selectedOffer?.optionId);
      incrementOptionStat(product?.productGroupId || productId, selectedOffer?.optionId, 'conversionCount').catch(() => {});
      setPurchaseFeedback(true);
      setTimeout(() => setPurchaseFeedback(false), 2000);
    } catch (error) {
      console.log('ProductDetail purchase error:', error);
    } finally {
      setPurchasing(false);
    }
  };

  const handleWriteReview = () => {
    navigation.navigate('ReviewWrite', {
      productId,
      productName: product?.name || fallbackName,
      currentPrice: currentPrice ?? null,
    });
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="small" />
      </View>
    );
  }

  console.log('route productId:', route.params?.productId);
  console.log('loaded productId:', product?.productId);
  console.log('affiliateUrl:', product?.affiliateUrl);
  console.log('product full:', product);
  console.log('ProductDetail Received Item:', route?.params?.item);

  // ── Forced display mapping — bridges RankingScreen mock fields to ProductDetail JSX ──
  const displayTitle = displayItem.name || displayItem.title || fallbackName;
  const displayPrice = displayItem.currentPrice ?? displayItem.current_price ?? displayItem.price ?? 0;
  const displayOriginalPrice = displayItem.originalPrice ?? displayItem.previous_price ?? displayItem.original ?? 0;
  const displayImage = displayItem.image || displayItem.imageUrl || displayItem.thumbnail || null;

  const name = product?.name || fallbackName;
  const brand = product?.brand || null;
  const category = product?.category || null;
  const options = Array.isArray(product?.options) ? product.options : [];
  const productOffers = Array.isArray(product?.offers) ? product.offers : [];
  const selectedOffer =
    selectRepresentativeOffer(productOffers, selectedOption?.optionId) ??
    productOffers.find((o) => o.affiliateUrl) ??
    productOffers[0] ??
    null;
  const currentPrice =
    typeof selectedOffer?.price === 'number' ? selectedOffer.price
      : typeof product?.currentPrice === 'number' ? product.currentPrice
        : null;
  const stageTags = Array.isArray(product?.stageTags) ? product.stageTags : [];
  const image = product?.image || null;
  const offerPrice = typeof offer?.price === 'number' && offer.price > 0 ? offer.price : null;
  const isOutOfStock = product?.isOutOfStock === true || offer?.isOutOfStock === true;
  const hasUrl = Boolean(selectedOffer?.affiliateUrl || product?.affiliateUrl || offer?.url || product?.name || fallbackName);

  const avgRating =
    reviews.length > 0
      ? Math.round((reviews.reduce((sum, r) => sum + (r.rating || 0), 0) / reviews.length) * 10) /
        10
      : null;

  const guidance = priceIntel?.guidance ?? null;
  const isButtonDisabled = !hasUrl || isOutOfStock || purchasing;

  // Merge user_product_actions peerCount with optionStats.trackingCount for selected option
  const optionTrackingCount =
    (product?.optionStats ?? {})[selectedOption?.optionId]?.trackingCount ?? 0;
  const peerSelectCount = Math.max(trustSignals.peerCount, optionTrackingCount);
  const optionConversionCount =
    (product?.optionStats ?? {})[selectedOption?.optionId]?.conversionCount ?? 0;
  const showOptionConfirmation =
    optionConversionCount > 0 || (selectedOffer?.score ?? 0) > 0.3;

  const ctaText = (() => {
    if (purchaseFeedback) return '이동했어요!';
    if (isOutOfStock) return '현재 품절된 상품입니다';
    if (guidance === '지금 구매 추천') return '지금 사는게 좋아요';
    if (guidance === '평균보다 높은 가격') return '가격 확인하기';
    if (guidance === '최근 최고가 근처') return '지금은 비추천';
    return '쿠팡에서 최저가 확인하기';
  })();

  const buttonVariantStyle = isButtonDisabled
    ? styles.buttonDisabled
    : purchaseFeedback
      ? styles.buttonSuccess
      : guidance === '지금 구매 추천'
        ? styles.buttonGreen
        : guidance === '최근 최고가 근처'
          ? styles.buttonMuted
          : null;

  return (
    <View style={styles.container}>
    <ScrollView ref={scrollViewRef} contentContainerStyle={styles.scrollContent}>
      {/* Image */}
      <View style={styles.imageContainer}>
        {displayImage ? (
          <Image source={{ uri: displayImage }} style={{ width: '100%', aspectRatio: 1 }} resizeMode="cover" />
        ) : displayItem.emoji ? (
          <View style={[styles.imageFallback, { backgroundColor: displayItem.bg || '#f1f5f9' }]}>
            <Text style={{ fontSize: 72 }}>{displayItem.emoji}</Text>
          </View>
        ) : (
          <View style={styles.imageFallback}>
            <Text style={styles.imageFallbackText}>이미지 없음</Text>
          </View>
        )}
      </View>

      {/* Info */}
      <View style={styles.infoBlock}>
        <Text style={styles.name}>{displayTitle}</Text>
        {brand ? <Text style={styles.meta}>브랜드: {brand}</Text> : null}
        {category ? (
          <View style={styles.badgeRow}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{category}</Text>
            </View>
          </View>
        ) : null}
        {stageTags.length > 0 ? (
          <View style={styles.badgeRow}>
            {stageTags.map((tag) => (
              <View key={tag} style={styles.stageTag}>
                <Text style={styles.stageTagText}>{tag}</Text>
              </View>
            ))}
          </View>
        ) : null}
        {/* selectionRate written by admin's computeAndWriteSelectionRates() */}
        {typeof product?.selectionRate === 'number' && product.selectionRate > 0 ? (
          <View style={styles.selectionRateRow}>
            <Text style={styles.selectionRateText}>
              👨‍👩‍👧 전체 세이브루 유저 중 {product.selectionRate}%가 이 제품을 선택했어요
            </Text>
          </View>
        ) : null}
      </View>

      {/* Options */}
      {options.length > 0 ? (
        <View style={styles.optionsBlock}>
          <Text style={styles.optionsLabel}>옵션 선택</Text>
          <View style={styles.optionsRow}>
            {options.map((opt) => {
              const isSelected = selectedOption?.optionId === opt.optionId;
              return (
                <TouchableOpacity
                  key={opt.optionId}
                  style={[styles.optionChip, isSelected && styles.optionChipSelected]}
                  onPress={() => setSelectedOption(opt)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.optionChipText, isSelected && styles.optionChipTextSelected]}>
                    {opt.name}
                  </Text>
                  {(() => {
                    const optOffer = productOffers.find((o) => o.optionId === opt.optionId);
                    return typeof optOffer?.price === 'number' ? (
                      <Text style={[styles.optionChipPrice, isSelected && styles.optionChipPriceSelected]}>
                        ₩{optOffer.price.toLocaleString('ko-KR')}
                      </Text>
                    ) : null;
                  })()}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      ) : null}

      {/* Price */}
      <View style={styles.priceBlock}>
        {offerPrice !== null ? (
          <Text style={styles.price}>₩{offerPrice.toLocaleString('ko-KR')}</Text>
        ) : currentPrice !== null && currentPrice > 0 ? (
          <Text style={styles.price}>₩{currentPrice.toLocaleString('ko-KR')}</Text>
        ) : displayPrice > 0 ? (
          <>
            <Text style={styles.price}>₩{displayPrice.toLocaleString('ko-KR')}</Text>
            {displayOriginalPrice > 0 && (
              <Text style={styles.originalPrice}>₩{displayOriginalPrice.toLocaleString('ko-KR')}</Text>
            )}
          </>
        ) : (
          <Text style={styles.priceUnknown}>가격 정보 없음</Text>
        )}
        {isOutOfStock ? <Text style={styles.outOfStock}>품절</Text> : null}
        {/* Smart freshness timestamp from priceLastUpdatedAt */}
        {(() => {
          const label = formatPriceTimestamp(product?.priceLastUpdatedAt);
          return label ? <Text style={styles.priceTimestamp}>{label}</Text> : null;
        })()}
      </View>

      {/* "지금 사기 좋은 가격인가요?" insight badge */}
      {priceIntel !== null ? (() => {
        const insightMap = {
          '지금 구매 추천':     { icon: '✅', text: '네! 지금이 사기 좋은 가격이에요', style: styles.insightGreen },
          '최근 최고가 근처':   { icon: '❌', text: '지금은 비추천 — 가격이 높은 편이에요', style: styles.insightRed },
          '평균보다 높은 가격': { icon: '⚠️', text: '조금 더 기다려 보세요', style: styles.insightOrange },
        };
        const entry = insightMap[priceIntel.guidance];
        if (!entry) return null;
        return (
          <View style={[styles.insightBadge, entry.style]}>
            <Text style={styles.insightQuestion}>지금 사기 좋은 가격인가요?</Text>
            <Text style={styles.insightAnswer}>{entry.icon} {entry.text}</Text>
          </View>
        );
      })() : null}

      {/* "판단 가이드" — verdict from offers sub-collection (computePriceInsight); hidden when OOS */}
      {!isOutOfStock && priceInsight !== null ? (() => {
        const verdictMap = {
          BEST_TIME: { icon: '✅', text: '지금 사셔도 좋아요!', style: styles.verdictGreen },
          GOOD_TIME: { icon: '⚠️', text: '가격이 조금 내려왔어요.', style: styles.verdictOrange },
          WAIT:      { icon: '❌', text: '조금 더 기다려보시는 건 어떨까요?', style: styles.verdictRed },
        };
        const entry = verdictMap[priceInsight.verdict];
        if (!entry) return null;
        return (
          <View style={[styles.verdictBadge, entry.style]}>
            <Text style={styles.verdictLabel}>판단 가이드</Text>
            <Text style={styles.verdictText}>{entry.icon} {entry.text}</Text>
            <Text style={styles.verdictSub}>
              최저 ₩{priceInsight.minPrice.toLocaleString('ko-KR')} · 평균 ₩{priceInsight.avgPrice.toLocaleString('ko-KR')} · 현재 위치 {priceInsight.currentPricePosition}%
            </Text>
          </View>
        );
      })() : null}

      {/* Price line graph — visual sparkline replacing text table */}
      {offerSnapshots.length >= 2 ? (
        <View style={styles.recentPricesBlock}>
          <Text style={styles.recentPricesTitle}>가격 변동 그래프</Text>
          <PriceLineGraph snapshots={offerSnapshots} currentPrice={currentPrice} />
        </View>
      ) : null}

      {/* Price history summary */}
      {priceIntel !== null ? (() => {
        const displayPrice = offerPrice ?? (currentPrice > 0 ? currentPrice : null);
        return (
          <View style={styles.priceHistoryBlock}>
            {displayPrice !== null ? (
              <Text style={styles.priceHistoryCurrent}>
                현재가 ₩{displayPrice.toLocaleString('ko-KR')}
              </Text>
            ) : null}
            <Text style={styles.priceHistoryLowest}>
              최저가 ₩{priceIntel.lowest.toLocaleString('ko-KR')}
            </Text>
            {priceIntel.lastPrice !== null ? (
              <View style={styles.priceHistoryChangeRow}>
                <Text style={styles.priceHistoryChangeLabel}>최근 변동</Text>
                {priceIntel.priceDrop > 0 ? (
                  <Text style={styles.priceHistoryDrop}>
                    ▼ ₩{priceIntel.priceDrop.toLocaleString('ko-KR')}
                  </Text>
                ) : priceIntel.priceRise > 0 ? (
                  <Text style={styles.priceHistoryRise}>
                    ▲ ₩{priceIntel.priceRise.toLocaleString('ko-KR')}
                  </Text>
                ) : (
                  <Text style={styles.priceHistoryUnchanged}>변동 없음</Text>
                )}
              </View>
            ) : null}
          </View>
        );
      })() : null}

      {/* Price intelligence */}
      {priceIntel !== null ? (() => {
        const displayPrice = offerPrice ?? (currentPrice > 0 ? currentPrice : null);
        const guidanceStyle =
          priceIntel.guidance === '지금 구매 추천'
            ? styles.piGuidanceGreen
            : priceIntel.guidance === '최근 최고가 근처'
              ? styles.piGuidanceRed
              : styles.piGuidanceOrange;
        return (
          <View style={styles.piBlock}>
            <View style={styles.piHeader}>
              <Text style={styles.piTitle}>가격 분석</Text>
              <Text style={styles.piMeta}>{priceIntel.recordCount}개 데이터 기준</Text>
            </View>

            {/* Bar chart */}
            <PriceGraph
              data={priceIntel.graphData}
              lowest={priceIntel.lowest}
              highest={priceIntel.highest}
              average={priceIntel.average}
            />

            {/* Stats row */}
            <View style={styles.piStatsRow}>
              <View style={styles.piStatItem}>
                <Text style={styles.piStatLabel}>최저가</Text>
                <Text style={[styles.piStatValue, styles.piStatGreen]}>
                  ₩{priceIntel.lowest.toLocaleString('ko-KR')}
                </Text>
              </View>
              <View style={[styles.piStatItem, styles.piStatCenter]}>
                <Text style={styles.piStatLabel}>평균가</Text>
                <Text style={styles.piStatValue}>
                  ₩{priceIntel.average.toLocaleString('ko-KR')}
                </Text>
              </View>
              <View style={[styles.piStatItem, styles.piStatRight]}>
                <Text style={styles.piStatLabel}>최고가</Text>
                <Text style={[styles.piStatValue, styles.piStatRed]}>
                  ₩{priceIntel.highest.toLocaleString('ko-KR')}
                </Text>
              </View>
            </View>

            {/* Percentile bar */}
            {displayPrice !== null ? (
              <View style={styles.piPercentileWrap}>
                <View style={styles.piPercentileTrack}>
                  <View
                    style={[
                      styles.piPercentileFill,
                      { width: `${priceIntel.percentile}%` },
                    ]}
                  />
                </View>
                <Text style={styles.piPercentileLabel}>
                  현재가 위치 {priceIntel.percentile}%
                </Text>
              </View>
            ) : null}

            {/* Guidance */}
            {priceIntel.guidance ? (
              <View style={styles.piGuidanceRow}>
                <Text style={guidanceStyle}>{priceIntel.guidance}</Text>
              </View>
            ) : null}
          </View>
        );
      })() : null}

      {/* "지금 사는 타이밍" dominant urgency banner */}
      {guidance === '지금 구매 추천' ? (
        <View style={styles.timingBanner}>
          <Text style={styles.timingBannerTitle}>🔥 지금 사는 타이밍!</Text>
          <Text style={styles.timingBannerSub}>오늘 기준 최저가 수준입니다</Text>
          <Text style={styles.timingBannerHint}>지금 구매 안 하면 가격 올라갈 수 있어요</Text>
        </View>
      ) : null}


      {/* Price alert toggle */}
      <View style={styles.alertRow}>
        <Text style={styles.alertLabel}>가격 떨어지면 알림 받기</Text>
        <TouchableOpacity
          style={[styles.alertToggle, alertStatus?.isActive ? styles.alertToggleOn : styles.alertToggleOff]}
          onPress={handleToggleAlert}
          activeOpacity={0.8}
        >
          <Text style={[styles.alertToggleText, alertStatus?.isActive ? styles.alertToggleTextOn : styles.alertToggleTextOff]}>
            {alertStatus?.isActive ? 'ON' : 'OFF'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Urgency + social proof — hidden when OOS (can't buy anyway) */}
      {!isOutOfStock && (trustSignals.viewingCount > 0 || trustSignals.recentHourBuyers > 0 ||
        trustSignals.peerPurchaseCount > 0 || weekPriceDrop > 0) ? (
        <View style={styles.urgencyRow}>
          {(trustSignals.viewingCount > 0 || trustSignals.recentHourBuyers > 0) ? (
            <View style={styles.urgencyChip}>
              <Text style={styles.urgencyChipText}>
                🔥 지금 {trustSignals.viewingCount}명 보고 있고, 최근 1시간 {trustSignals.recentHourBuyers}명 구매
              </Text>
            </View>
          ) : null}
          {/* Peer purchase CTA badge — floating age window social proof */}
          {trustSignals.peerPurchaseCount > 0 ? (
            <View style={styles.peerPurchaseChip}>
              <Text style={styles.peerPurchaseChipText}>
                🔥 {trustSignals.peerPurchaseCount}명의 또래 엄마들이 쿠팡에서 확인 중
              </Text>
            </View>
          ) : null}
          {/* Week-ago price drop badge */}
          {weekPriceDrop > 0 ? (
            <View style={styles.weekDropChip}>
              <Text style={styles.weekDropChipText}>
                📉 일주일 전보다 ₩{weekPriceDrop.toLocaleString('ko-KR')} 저렴해졌어요
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {/* Option confirmation */}
      {showOptionConfirmation ? (
        <Text style={styles.optionConfirmText}>✅ 이 옵션이 가장 많이 선택되고 있어요</Text>
      ) : null}

      {/* Pre-purchase confirmation */}
      {preConfirm ? (
        <View style={styles.preConfirmBanner}>
          <Text style={styles.preConfirmTitle}>지금 구매하기 좋은 타이밍입니다</Text>
          <Text style={styles.preConfirmSub}>최근 가격 대비 낮은 상태입니다</Text>
        </View>
      ) : null}

      {/* Ranking context */}
      {isCategoryTop ? (
        <View style={styles.rankContextBanner}>
          <Text style={styles.rankContextText}>🏆 이 카테고리 인기 1위 상품</Text>
        </View>
      ) : null}

      {/* Success Story banner — recent best-deal purchases */}
      {(() => {
        const sevenDaysAgoMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
        const recentBestDealCount = reviews.filter(
          (r) => r.isBestDeal && (r.createdAt?.toMillis?.() ?? 0) >= sevenDaysAgoMs
        ).length;
        return recentBestDealCount > 0 ? (
          <View style={styles.successStoryBanner}>
            <Text style={styles.successStoryText}>
              🎉 최근 7일간 세이브루 유저 {recentBestDealCount}명이 최저가 구매에 성공했어요!
            </Text>
          </View>
        ) : null;
      })()}

      {/* Reviews header */}
      <View style={styles.reviewsHeader}>
        <View style={styles.reviewsTitleRow}>
          <Text style={styles.sectionTitle}>
            리뷰 {reviews.length > 0 ? `(${reviews.length})` : ''}
          </Text>
          {avgRating !== null ? (
            <Text style={styles.avgRating}>★ {avgRating}</Text>
          ) : null}
        </View>
        <TouchableOpacity style={styles.writeButton} onPress={handleWriteReview} activeOpacity={0.85}>
          <Text style={styles.writeButtonText}>리뷰 작성</Text>
        </TouchableOpacity>
      </View>

      {/* Review list */}
      {reviews.length === 0 ? (
        <View style={styles.emptyReviews}>
          <Text style={styles.emptyText}>아직 리뷰가 없습니다. 첫 리뷰를 남겨 보세요!</Text>
        </View>
      ) : (
        reviews.map((review) => (
          <View key={review.reviewId} style={styles.reviewCard}>
            <View style={styles.reviewTop}>
              <Stars rating={review.rating} />
              {review.verifiedPurchase ? (
                <View style={styles.verifiedBadge}>
                  <Text style={styles.verifiedText}>구매 인증</Text>
                </View>
              ) : null}
              {review.isBestDeal && typeof review.purchasePrice === 'number' ? (
                <View style={styles.bestDealBadge}>
                  <Text style={styles.bestDealBadgeText}>
                    💸 핫딜 구매 성공 (₩{review.purchasePrice.toLocaleString('ko-KR')}에 구매)
                  </Text>
                </View>
              ) : null}
            </View>
            {review.content ? (
              <Text style={styles.reviewContent}>{review.content}</Text>
            ) : null}
            <Text style={styles.reviewDate}>
              {review.createdAt?.toDate
                ? review.createdAt.toDate().toLocaleDateString('ko-KR')
                : ''}
            </Text>
          </View>
        ))
      )}
    </ScrollView>

    {toastVisible && (
      <View style={{position: 'absolute', bottom: 90, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.8)', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8, zIndex: 1000}}>
        <Text style={{color: '#fff', fontWeight: 'bold'}}>✅ 관심 상품에 추가되었어요!</Text>
      </View>
    )}

    <View style={{flexDirection: 'row', alignItems: 'center', padding: 16, borderTopWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#fff', paddingBottom: Math.max(insets.bottom, 16)}}>
      <TouchableOpacity onPress={handleToggleSave} style={{marginRight: 16}}>
        <Ionicons name={isSaved ? 'heart' : 'heart-outline'} size={28} color={isSaved ? '#ef4444' : '#94a3b8'} />
      </TouchableOpacity>
      <TouchableOpacity onPress={() => Share.share({message: '이 상품 어때요?'})} style={{marginRight: 16}}>
        <Ionicons name="share-outline" size={28} color="#64748b" />
      </TouchableOpacity>
      <TouchableOpacity
        style={{flex: 1, backgroundColor: '#f97316', paddingVertical: 14, borderRadius: 8, alignItems: 'center'}}
        onPress={handlePurchase}
        activeOpacity={0.85}
        disabled={isButtonDisabled}
        onLayout={(e) => { purchaseButtonY.current = e.nativeEvent.layout.y; }}
      >
        {purchasing ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={{color: '#fff', fontSize: 16, fontWeight: 'bold'}}>🛒 쿠팡에서 바로 구매하기</Text>
        )}
      </TouchableOpacity>
    </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f7fb',
  },
  scrollContent: {
    paddingBottom: 120,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f7fb',
  },
  imageContainer: {
    width: '100%',
    height: 280,
    backgroundColor: '#e2e8f0',
  },
  image: {
    width: '100%',
    height: 280,
  },
  imageFallback: {
    width: '100%',
    height: 280,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageFallbackText: {
    color: '#94a3b8',
    fontSize: 14,
  },
  infoBlock: {
    padding: 16,
    gap: 6,
  },
  name: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
    lineHeight: 24,
  },
  meta: {
    fontSize: 14,
    color: '#64748b',
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 2,
  },
  badge: {
    backgroundColor: '#eff6ff',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2563eb',
  },
  stageTag: {
    backgroundColor: '#f0fdf4',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  selectionRateRow: {
    backgroundColor: '#fef3c7',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 4,
  },
  selectionRateText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#92400e',
  },
  stageTagText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#16a34a',
  },
  priceBlock: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  price: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0f172a',
  },
  priceUnknown: {
    fontSize: 16,
    color: '#94a3b8',
  },
  originalPrice: {
    fontSize: 13,
    color: '#94a3b8',
    textDecorationLine: 'line-through',
    marginTop: 2,
  },
  outOfStock: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ef4444',
    backgroundColor: '#fee2e2',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  // ── "지금 사기 좋은 가격인가요?" insight badge ────────────────────────────
  insightBadge: {
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    padding: 12,
    gap: 4,
  },
  insightGreen:  { backgroundColor: '#f0fdf4', borderColor: '#86efac' },
  insightRed:    { backgroundColor: '#fef2f2', borderColor: '#fca5a5' },
  insightOrange: { backgroundColor: '#fffbeb', borderColor: '#fcd34d' },
  insightQuestion: { fontSize: 11, fontWeight: '600', color: '#64748b' },
  insightAnswer:   { fontSize: 14, fontWeight: '800', color: '#0f172a' },

  // ── "판단 가이드" verdict badge (computePriceInsight from offers sub-collection) ──
  verdictBadge: {
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    padding: 12,
    gap: 4,
  },
  verdictGreen:  { backgroundColor: '#f0fdf4', borderColor: '#86efac' },
  verdictOrange: { backgroundColor: '#fffbeb', borderColor: '#fcd34d' },
  verdictRed:    { backgroundColor: '#fef2f2', borderColor: '#fca5a5' },
  verdictLabel: { fontSize: 10, fontWeight: '700', color: '#64748b', letterSpacing: 0.5, textTransform: 'uppercase' },
  verdictText:  { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  verdictSub:   { fontSize: 11, color: '#64748b', marginTop: 2 },

  // ── Recent price snapshots (from offers sub-collection) ──────────────────
  recentPricesBlock: {
    marginHorizontal: 16,
    marginTop: 10,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    gap: 6,
  },
  recentPricesTitle: { fontSize: 13, fontWeight: '700', color: '#0f172a', marginBottom: 8 },

  // Line graph stats row
  lineGraphStats: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, paddingHorizontal: 4 },
  lineGraphStat: { alignItems: 'center', gap: 2 },
  lineGraphStatVal: { fontSize: 12, fontWeight: '700', color: '#0f172a' },
  lineGraphStatLabel: { fontSize: 10, color: '#94a3b8' },
  recentPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 3,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  recentPriceDate:     { fontSize: 11, color: '#94a3b8', width: 52 },
  recentPriceValue:    { flex: 1, fontSize: 13, fontWeight: '600', color: '#0f172a' },
  recentPriceDrop:     { fontSize: 12, fontWeight: '700', color: '#16a34a' },
  recentPriceRise:     { fontSize: 12, fontWeight: '700', color: '#dc2626' },
  recentPriceNoChange: { fontSize: 12, color: '#cbd5e1' },

  priceHistoryBlock: {
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 2,
    padding: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e4e7ed',
    gap: 4,
  },
  priceHistoryCurrent: {
    fontSize: 13,
    color: '#64748b',
  },
  priceHistoryLowest: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },
  priceHistoryChangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  priceHistoryChangeLabel: {
    fontSize: 13,
    color: '#64748b',
  },
  priceHistoryDrop: {
    fontSize: 13,
    fontWeight: '700',
    color: '#16a34a',
  },
  priceHistoryRise: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ef4444',
  },
  priceHistoryUnchanged: {
    fontSize: 13,
    color: '#94a3b8',
  },
  // Price graph
  graphWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 56,
    gap: 2,
    marginTop: 6,
    marginBottom: 4,
  },
  graphBar: {
    flex: 1,
    borderRadius: 2,
    minWidth: 3,
  },
  graphBarGreen: {
    backgroundColor: '#86efac',
  },
  graphBarRed: {
    backgroundColor: '#fca5a5',
  },
  // Price intelligence block
  piBlock: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 2,
    padding: 14,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e4e7ed',
    gap: 10,
  },
  piHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  piTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },
  piMeta: {
    fontSize: 11,
    color: '#94a3b8',
  },
  piStatsRow: {
    flexDirection: 'row',
  },
  piStatItem: {
    flex: 1,
    gap: 2,
  },
  piStatCenter: {
    alignItems: 'center',
  },
  piStatRight: {
    alignItems: 'flex-end',
  },
  piStatLabel: {
    fontSize: 11,
    color: '#94a3b8',
  },
  piStatValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
  },
  piStatGreen: {
    color: '#16a34a',
  },
  piStatRed: {
    color: '#ef4444',
  },
  piPercentileWrap: {
    gap: 4,
  },
  piPercentileTrack: {
    height: 6,
    backgroundColor: '#e2e8f0',
    borderRadius: 3,
    overflow: 'hidden',
  },
  piPercentileFill: {
    height: 6,
    backgroundColor: '#3b82f6',
    borderRadius: 3,
  },
  piPercentileLabel: {
    fontSize: 11,
    color: '#64748b',
  },
  piGuidanceRow: {
    alignItems: 'flex-start',
  },
  piGuidanceGreen: {
    fontSize: 13,
    fontWeight: '700',
    color: '#16a34a',
    backgroundColor: '#f0fdf4',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  piGuidanceOrange: {
    fontSize: 13,
    fontWeight: '700',
    color: '#c2410c',
    backgroundColor: '#fff7ed',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  piGuidanceRed: {
    fontSize: 13,
    fontWeight: '700',
    color: '#b91c1c',
    backgroundColor: '#fef2f2',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  // ─── Timing banner ───────────────────────────────────────────────────────────
  timingBanner: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 16,
    backgroundColor: '#052e16',
    borderRadius: 12,
    gap: 4,
  },
  timingBannerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#4ade80',
    letterSpacing: -0.3,
  },
  timingBannerSub: {
    fontSize: 14,
    fontWeight: '700',
    color: '#bbf7d0',
  },
  timingBannerHint: {
    fontSize: 12,
    color: '#6ee7b7',
    marginTop: 2,
  },
  // ─── Urgency signals ─────────────────────────────────────────────────────────
  urgencyRow: {
    marginHorizontal: 16,
    marginTop: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  urgencyChip: {
    backgroundColor: '#fff7ed',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: '#fed7aa',
  },
  urgencyChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#c2410c',
  },
  peerPurchaseChip: {
    backgroundColor: '#fef3c7',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: '#fcd34d',
  },
  peerPurchaseChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#92400e',
  },
  weekDropChip: {
    backgroundColor: '#f0fdf4',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: '#86efac',
  },
  weekDropChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#15803d',
  },
  priceTimestamp: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 3,
  },
  // ─── Trust signals ────────────────────────────────────────────────────────────
  trustRow: {
    marginHorizontal: 16,
    marginTop: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  trustChip: {
    backgroundColor: '#f0fdf4',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  trustChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#15803d',
  },
  optionConfirmText: {
    marginHorizontal: 16,
    marginTop: 8,
    fontSize: 13,
    fontWeight: '600',
    color: '#15803d',
    textAlign: 'center',
  },
  // ─── Pre-purchase confirmation ───────────────────────────────────────────────
  preConfirmBanner: {
    marginHorizontal: 16,
    marginTop: 8,
    padding: 12,
    backgroundColor: '#f0fdf4',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#bbf7d0',
    gap: 4,
  },
  preConfirmTitle: { fontSize: 14, fontWeight: '800', color: '#15803d' },
  preConfirmSub: { fontSize: 12, color: '#16a34a' },
  // ─── Ranking context ─────────────────────────────────────────────────────────
  rankContextBanner: {
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: '#fef3c7',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#fcd34d',
  },
  rankContextText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#92400e',
  },
  // ─── Purchase button ──────────────────────────────────────────────────────────
  button: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: '#f97316',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#cbd5e1',
  },
  buttonGreen: {
    backgroundColor: '#16a34a',
  },
  buttonMuted: {
    backgroundColor: '#94a3b8',
  },
  buttonSuccess: {
    backgroundColor: '#15803d',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  // ─── Sticky CTA footer ────────────────────────────────────────────────────────
  stickyFooter: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    gap: 6,
  },
  ctaNudge: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
  },
  reviewsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginTop: 28,
    marginBottom: 10,
  },
  reviewsTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0f172a',
  },
  avgRating: {
    fontSize: 15,
    fontWeight: '700',
    color: '#f59e0b',
  },
  writeButton: {
    backgroundColor: '#eff6ff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  writeButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2563eb',
  },
  emptyReviews: {
    marginHorizontal: 16,
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e4e7ed',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#94a3b8',
  },
  // ─── Success story banner ─────────────────────────────────────────────────
  successStoryBanner: {
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 2,
    backgroundColor: '#f0fdf4',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#86efac',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  successStoryText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#15803d',
  },

  reviewCard: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e4e7ed',
    padding: 12,
    gap: 6,
  },
  reviewTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stars: {
    fontSize: 16,
    color: '#f59e0b',
    letterSpacing: 2,
  },
  bestDealBadge: {
    backgroundColor: '#fef3c7',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    flexShrink: 1,
  },
  bestDealBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#92400e',
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
    color: '#16a34a',
  },
  reviewContent: {
    fontSize: 14,
    color: '#334155',
    lineHeight: 20,
  },
  reviewDate: {
    fontSize: 12,
    color: '#94a3b8',
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginRight: 4,
  },
  headerButton: {
    padding: 2,
  },
  headerShare: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2563eb',
  },
  headerBookmark: {
    fontSize: 22,
    color: '#cbd5e1',
  },
  headerBookmarkSaved: {
    fontSize: 22,
    color: '#f59e0b',
  },
  alertRow: {
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e4e7ed',
    padding: 14,
  },
  alertLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
  },
  alertToggle: {
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  alertToggleOn: {
    backgroundColor: '#f97316',
  },
  alertToggleOff: {
    backgroundColor: '#f1f5f9',
  },
  alertToggleText: {
    fontSize: 13,
    fontWeight: '700',
  },
  alertToggleTextOn: {
    color: '#fff',
  },
  alertToggleTextOff: {
    color: '#94a3b8',
  },
  // ─── Options ─────────────────────────────────────────────────────────────────
  optionsBlock: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
    gap: 8,
  },
  optionsLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748b',
  },
  optionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionChip: {
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 2,
    alignItems: 'center',
  },
  optionChipSelected: {
    borderColor: '#f97316',
    backgroundColor: '#fff7ed',
  },
  optionChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  optionChipTextSelected: {
    color: '#c2410c',
  },
  optionChipPrice: {
    fontSize: 12,
    color: '#94a3b8',
  },
  optionChipPriceSelected: {
    color: '#c2410c',
    fontWeight: '700',
  },
});
