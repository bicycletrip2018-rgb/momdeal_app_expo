import { collection, getDocs, limit, orderBy, query, Timestamp, where } from 'firebase/firestore';
import { db } from '../firebase/config';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const asArray = (value) => (Array.isArray(value) ? value : []);

const hasIntersection = (a, b) => {
  const setB = new Set(b);
  return a.some((item) => setB.has(item));
};

const chunkArray = (arr, size) => {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
};

const normalizeByMax = (value, max) => {
  if (!max || max <= 0) return 0;
  return Math.max(0, Math.min(1, value / max));
};

const ACTION_WEIGHTS = { view: 1, click: 2, purchase: 5, review: 4 };

// ─── Option scoring ────────────────────────────────────────────────────────────

// Offer delivery priority: lower index = better.
const DELIVERY_PRIORITY = { rocket: 0, fresh: 1, normal: 2, global: 3 };

// Recency weight for optionStats.lastUpdatedAt.
const computeOptionRecencyScore = (lastUpdatedAt) => {
  if (!lastUpdatedAt?.toMillis) return 0;
  const ageDays = (Date.now() - lastUpdatedAt.toMillis()) / 86400000;
  if (ageDays < 7)  return 1.0;
  if (ageDays < 30) return 0.7;
  if (ageDays < 90) return 0.4;
  return 0.1;
};

// Relative price competitiveness of one option vs all options of the same product.
// Cheapest option → 1.0, most expensive → 0.0. Neutral 0.5 when only one option.
const computePriceCompetitiveness = (optionId, options, offers) => {
  const prices = options.map((opt) => {
    const cheapest = offers
      .filter((o) => o.optionId === opt.optionId && typeof o.price === 'number' && o.price > 0)
      .map((o) => o.price);
    return cheapest.length > 0 ? Math.min(...cheapest) : null;
  }).filter((p) => p !== null);

  if (prices.length <= 1) return 0.5;

  const min = Math.min(...prices);
  const max = Math.max(...prices);
  if (max === min) return 0.5;

  const optionCheapest = offers
    .filter((o) => o.optionId === optionId && typeof o.price === 'number' && o.price > 0)
    .map((o) => o.price);
  if (optionCheapest.length === 0) return 0;

  const optPrice = Math.min(...optionCheapest);
  return (max - optPrice) / (max - min); // 1.0 = cheapest, 0.0 = most expensive
};

// Raw demand-first optionScore. Intentionally unbounded (used for relative ordering
// within a product, and normalized across products before adding to productScore).
const computeRawOptionScore = (stats, optionId, options, offers) => {
  const s = stats || {};
  return (
    (s.conversionCount || 0) * 0.35 +
    (s.trackingCount   || 0) * 0.25 +
    (s.clickCount      || 0) * 0.15 +
    (s.reviewCount     || 0) * 0.10 +
    computeOptionRecencyScore(s.lastUpdatedAt) * 0.10 +
    computePriceCompetitiveness(optionId, options, offers) * 0.05
  );
};

// ─── Representative option/offer selectors (exported for ProductDetail reuse) ─

// Returns the option with the highest demand score.
// Falls back to: highest offer.score → first option.
export const selectRepresentativeOption = (product) => {
  const options  = Array.isArray(product?.options) ? product.options : [];
  const offers   = Array.isArray(product?.offers)  ? product.offers  : [];
  const stats    = product?.optionStats || {};

  if (options.length === 0) return null;

  const scored = options.map((opt) => ({
    option: opt,
    score: computeRawOptionScore(stats[opt.optionId], opt.optionId, options, offers),
  }));
  const best = scored.reduce((prev, curr) => (curr.score > prev.score ? curr : prev));

  // All scores zero → fall back to highest offer.score
  if (best.score === 0 && offers.length > 0) {
    const bestOffer = offers.reduce((prev, curr) =>
      (curr.score ?? -Infinity) > (prev.score ?? -Infinity) ? curr : prev
    );
    return options.find((o) => o.optionId === bestOffer.optionId) ?? options[0];
  }

  return best.option;
};

// Returns the best offer for a given optionId.
// Priority: lowest effective price → delivery type → seller type.
export const selectRepresentativeOffer = (offers, optionId) => {
  const candidates = (Array.isArray(offers) ? offers : []).filter(
    (o) => o.optionId === optionId
  );
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  return [...candidates].sort((a, b) => {
    // 1. Lowest effective price
    const pa = typeof a.price === 'number' && a.price > 0 ? a.price : Infinity;
    const pb = typeof b.price === 'number' && b.price > 0 ? b.price : Infinity;
    if (pa !== pb) return pa - pb;
    // 2. Delivery type priority (rocket best)
    const da = DELIVERY_PRIORITY[a.deliveryType] ?? 99;
    const db = DELIVERY_PRIORITY[b.deliveryType] ?? 99;
    if (da !== db) return da - db;
    // 3. Seller type (coupang preferred)
    return (a.sellerType === 'coupang' ? 0 : 1) - (b.sellerType === 'coupang' ? 0 : 1);
  })[0];
};

// ─── conversionScore stabilization constants ──────────────────────────────────
// Bayesian-style smoothing: adds CONVERSION_PRIOR_STRENGTH pseudo-observations
// at CONVERSION_PRIOR_RATE before computing the rate. This pulls low-sample
// products toward the neutral prior (0.5) rather than letting a single "good
// click" produce a misleading 100% rate.
//
// Confidence gate (applied after smoothing):
//   totalClicks < 3  →  ×0.3  (two data points are noise — strong downweight)
//   totalClicks < 5  →  ×0.6  (borderline — partial downweight)
//   totalClicks ≥ 5  →  ×1.0  (enough evidence to trust — full signal)
const CONVERSION_PRIOR_RATE = 0.5;
const CONVERSION_PRIOR_STRENGTH = 5;

// ─── Peer similarity ──────────────────────────────────────────────────────────

const computeChildSimilarity = (current, peer) => {
  let score = 0;

  if (current.stage && current.stage === peer.stage) score += 0.40;

  const ageDiff = Math.abs((current.ageMonth || 0) - (peer.ageMonth || 0));
  if (ageDiff <= 3) score += 0.25;
  else if (ageDiff <= 6) score += 0.10;

  if (current.feedingType && peer.feedingType && current.feedingType === peer.feedingType) {
    score += 0.20;
  }

  const currentTags = new Set(asArray(current.categoryTags));
  if (currentTags.size > 0 && asArray(peer.categoryTags).some((t) => currentTags.has(t))) {
    score += 0.15;
  }

  return Math.max(0, Math.min(1, score));
};

// ─── Data fetchers ────────────────────────────────────────────────────────────

// Returns { statsMap: { [productGroupId]: { totalRating, count, verifiedCount, positiveCount } },
//           reviewIdToProductId: { [reviewId]: productGroupId },
//           reviewQualityMap:    { [reviewId]: { rating, verifiedPurchase } } }
// Field used: productGroupId (new schema). Legacy `productId` field is ignored.
const fetchReviewStatsMap = async () => {
  const snap = await getDocs(collection(db, 'reviews'));
  const statsMap = {};
  const reviewIdToProductId = {};
  const reviewQualityMap = {};
  snap.docs.forEach((docSnapshot) => {
    const { productGroupId, rating, verifiedPurchase } = docSnapshot.data();
    if (!productGroupId) return;
    reviewIdToProductId[docSnapshot.id] = productGroupId;
    reviewQualityMap[docSnapshot.id] = { rating, verifiedPurchase };
    if (!statsMap[productGroupId]) {
      statsMap[productGroupId] = { totalRating: 0, count: 0, verifiedCount: 0, positiveCount: 0 };
    }
    statsMap[productGroupId].totalRating += typeof rating === 'number' ? rating : 0;
    statsMap[productGroupId].count += 1;
    if (verifiedPurchase) statsMap[productGroupId].verifiedCount += 1;
    if (typeof rating === 'number' && rating >= 4) statsMap[productGroupId].positiveCount += 1;
  });
  return { statsMap, reviewIdToProductId, reviewQualityMap };
};

// Returns { [productId]: interactionCount } for the current user
const fetchUserBehaviorMap = async (userId) => {
  if (!userId) return {};
  const snap = await getDocs(
    query(collection(db, 'user_product_actions'), where('userId', '==', userId))
  );
  const countMap = {};
  snap.docs.forEach((docSnapshot) => {
    const productId = docSnapshot.data()?.productId;
    if (productId) countMap[productId] = (countMap[productId] || 0) + 1;
  });
  return countMap;
};

// Returns { [productId]: clickCount } — only click actions, for same-stage peers
const fetchClickCountMap = async (userIds) => {
  if (userIds.length === 0) return {};
  const countMap = {};
  await Promise.all(
    chunkArray(userIds, 30).map((chunk) =>
      getDocs(
        query(
          collection(db, 'user_product_actions'),
          where('userId', 'in', chunk),
          where('actionType', '==', 'click')
        )
      ).then((snap) => {
        snap.docs.forEach((docSnapshot) => {
          const productId = docSnapshot.data()?.productId;
          if (productId) countMap[productId] = (countMap[productId] || 0) + 1;
        });
      })
    )
  );
  return countMap;
};

// Returns all action records for given userIds (all action types)
const fetchPeerActions = async (userIds) => {
  if (userIds.length === 0) return [];
  const actions = [];
  await Promise.all(
    chunkArray(userIds, 30).map((chunk) =>
      getDocs(
        query(collection(db, 'user_product_actions'), where('userId', 'in', chunk))
      ).then((snap) => {
        snap.docs.forEach((docSnapshot) => actions.push(docSnapshot.data()));
      })
    )
  );
  return actions;
};

// Returns { [productId]: cappedWeightedScore } — stabilized per-product like signal.
// Pipeline per product:
//   1. Accumulate Σ(recencyWeight × qualityWeight × userSimilarityWeight) per review.
//   2. Take top-20 reviews by score (diversity cap).
//   3. Sum and cap total at 5.0 (outlier cap).
// buildNormalizedReviewLikeScores then applies log(1+x) before 0–1 normalization.
// Queries review_likes chunked by reviewId — runs in Phase 2 alongside existing action fetches.
const fetchReviewLikeCountMap = async (
  reviewIdToProductId,
  reviewQualityMap,
  sameStageUserIdSet,
  similarityByUserId
) => {
  const reviewIds = Object.keys(reviewIdToProductId);
  if (reviewIds.length === 0) return {};

  // Step 1: Accumulate weighted like scores per review
  const reviewScoreMap = {}; // { [reviewId]: number }
  await Promise.all(
    chunkArray(reviewIds, 30).map((chunk) =>
      getDocs(query(collection(db, 'review_likes'), where('reviewId', 'in', chunk))).then(
        (snap) => {
          snap.docs.forEach((docSnapshot) => {
            const { reviewId, userId: likerUserId, createdAt } = docSnapshot.data();
            if (!reviewId) return;
            const recencyWeight = getLikeRecencyWeight(createdAt);
            const qualityWeight = getLikeQualityWeight(reviewQualityMap?.[reviewId]);
            const userSimilarityWeight = getLikeUserSimilarityWeight(
              likerUserId,
              sameStageUserIdSet,
              similarityByUserId
            );
            reviewScoreMap[reviewId] =
              (reviewScoreMap[reviewId] || 0) + recencyWeight * qualityWeight * userSimilarityWeight;
          });
        }
      )
    )
  );

  // Step 2: Group by product, keep top-20 reviews, sum, cap at 5.0
  const productReviewScores = {}; // { [productId]: number[] }
  Object.entries(reviewScoreMap).forEach(([reviewId, score]) => {
    const productId = reviewIdToProductId[reviewId];
    if (!productId) return;
    if (!productReviewScores[productId]) productReviewScores[productId] = [];
    productReviewScores[productId].push(score);
  });

  const scoreMap = {};
  Object.entries(productReviewScores).forEach(([productId, scores]) => {
    const top20Sum = scores
      .sort((a, b) => b - a)
      .slice(0, 20)
      .reduce((s, v) => s + v, 0);
    scoreMap[productId] = Math.min(top20Sum, 5.0);
  });

  return scoreMap;
};

// Returns { [productId]: stabilizedScore } — resolved click-log entries only.
// "resolved" = stayedLongEnough is true or false (not null).
// Uses product_click_logs; queries only resolved entries via in:[true,false].
//
// Two-layer stabilization:
//   1. Bayesian smoothing  — (goodClicks + prior) / (totalClicks + priorStrength)
//                            shrinks the observed rate toward 0.5 for small samples.
//   2. Confidence gate     — multiplies by 0.3 / 0.6 / 1.0 based on totalClicks.
//                            Ensures products with < 5 clicks cannot dominate ranking
//                            even if their smoothed rate is high.
const fetchConversionRateMap = async () => {
  const snap = await getDocs(
    query(collection(db, 'product_click_logs'), where('stayedLongEnough', 'in', [true, false]))
  );
  const rateData = {}; // { [productId]: { goodClicks, totalClicks } }
  snap.docs.forEach((docSnapshot) => {
    const { productId, stayedLongEnough } = docSnapshot.data();
    if (!productId) return;
    if (!rateData[productId]) rateData[productId] = { goodClicks: 0, totalClicks: 0 };
    rateData[productId].totalClicks += 1;
    if (stayedLongEnough === true) rateData[productId].goodClicks += 1;
  });
  const rateMap = {};
  Object.entries(rateData).forEach(([productId, { goodClicks, totalClicks }]) => {
    // Layer 1: Bayesian smoothing — pull toward prior for small samples
    const smoothedRate =
      (goodClicks + CONVERSION_PRIOR_RATE * CONVERSION_PRIOR_STRENGTH) /
      (totalClicks + CONVERSION_PRIOR_STRENGTH);
    // Layer 2: Confidence gate — explicit penalty for low sample counts
    const confidence = totalClicks < 3 ? 0.3 : totalClicks < 5 ? 0.6 : 1.0;
    rateMap[productId] = smoothedRate * confidence;
  });
  return rateMap;
};

// Returns all action records from the last 7 days (all users, all action types)
const fetchTrendActions = async () => {
  const sevenDaysAgo = Timestamp.fromMillis(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const snap = await getDocs(
    query(collection(db, 'user_product_actions'), where('createdAt', '>=', sevenDaysAgo))
  );
  return snap.docs.map((docSnapshot) => docSnapshot.data());
};

// ─── Score builders ───────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

// Product recency signal — how recently the product was registered on the platform.
// New products surface more readily; decays over 90 days to a floor of 0.1.
const computeProductRecency = (createdAt) => {
  if (!createdAt?.toMillis) return 0.1;
  const ageDays = (Date.now() - createdAt.toMillis()) / 86400000;
  if (ageDays < 7)  return 1.0;
  if (ageDays < 30) return 0.7;
  if (ageDays < 90) return 0.4;
  return 0.1;
};

const getRecencyWeight = (createdAt) => {
  const ageMs = Date.now() - (createdAt?.toMillis?.() ?? 0);
  if (ageMs < DAY_MS) return 1.0;
  if (ageMs < 3 * DAY_MS) return 0.7;
  return 0.4; // 3–7 days
};

// Recency weight for individual likes (wider decay range than action recency)
const getLikeRecencyWeight = (createdAt) => {
  const ageMs = Date.now() - (createdAt?.toMillis?.() ?? 0);
  if (ageMs < DAY_MS) return 1.0;
  if (ageMs < 3 * DAY_MS) return 0.7;
  if (ageMs < 7 * DAY_MS) return 0.4;
  return 0.2;
};

// Quality multiplier based on the review that received the like
const getLikeQualityWeight = (quality) => {
  if (!quality) return 1.0;
  if (quality.verifiedPurchase) return 1.3;
  if (typeof quality.rating === 'number' && quality.rating >= 4) return 1.2;
  return 1.0;
};

// User similarity multiplier based on the liker's child stage vs. the current user's child
const getLikeUserSimilarityWeight = (likerUserId, sameStageUserIdSet, similarityByUserId) => {
  if (!likerUserId) return 1.0;
  if (sameStageUserIdSet?.has(likerUserId)) return 1.2;
  if (similarityByUserId?.[likerUserId] !== undefined) return 1.1;
  return 1.0;
};

// trendRawScore(p) = sum(actionWeight * recencyWeight) for all actions on p in last 7 days
// Returns { [productId]: normalizedScore 0–1 }
const buildNormalizedTrendScores = (trendActions) => {
  const rawScores = {};
  trendActions.forEach(({ productId, actionType, createdAt }) => {
    if (!productId) return;
    const actionWeight = ACTION_WEIGHTS[actionType] || 0;
    const recencyWeight = getRecencyWeight(createdAt);
    rawScores[productId] = (rawScores[productId] || 0) + actionWeight * recencyWeight;
  });
  const maxRaw = Object.values(rawScores).reduce((m, v) => (v > m ? v : m), 0);
  const normalized = {};
  Object.entries(rawScores).forEach(([productId, raw]) => {
    normalized[productId] = maxRaw > 0 ? raw / maxRaw : 0;
  });
  return normalized;
};

// positiveRate = fraction of reviews with rating >= 4 (product-level signal per CLAUDE.md rules)
const computeRawReviewScore = (avgRating, reviewCount, verifiedRatio, positiveRate) =>
  (avgRating / 5) * 0.5 + Math.log(reviewCount + 1) * 0.2 + verifiedRatio * 0.1 + positiveRate * 0.2;

// Returns { [productId]: normalizedScore 0–1 }
const buildNormalizedReviewScores = (reviewStatsMap) => {
  const rawScores = {};
  Object.entries(reviewStatsMap).forEach(([productId, stats]) => {
    if (stats.count === 0) return;
    const avgRating    = stats.totalRating  / stats.count;
    const verifiedRatio = stats.verifiedCount / stats.count;
    const positiveRate  = stats.positiveCount / stats.count;
    rawScores[productId] = computeRawReviewScore(avgRating, stats.count, verifiedRatio, positiveRate);
  });
  const maxRaw = Object.values(rawScores).reduce((m, v) => (v > m ? v : m), 0);
  const normalized = {};
  Object.entries(rawScores).forEach(([productId, raw]) => {
    normalized[productId] = maxRaw > 0 ? raw / maxRaw : 0;
  });
  return normalized;
};

// Returns { [productId]: normalizedScore 0–1 }
// Input is already top-20-filtered and capped at 5.0 by fetchReviewLikeCountMap.
// Applies log(1+x) before normalization to compress outliers further.
const buildNormalizedReviewLikeScores = (likeCountByProductId) => {
  const logScores = {};
  Object.entries(likeCountByProductId).forEach(([productId, raw]) => {
    logScores[productId] = Math.log(1 + raw);
  });
  const max = Object.values(logScores).reduce((m, v) => (v > m ? v : m), 0);
  const normalized = {};
  Object.entries(logScores).forEach(([productId, logScore]) => {
    normalized[productId] = max > 0 ? logScore / max : 0;
  });
  return normalized;
};

// Returns { [productId]: normalizedScore 0–1 }
// Raw rate is already 0–1 (goodClicks/totalClicks); normalized by max for consistency.
export const buildNormalizedConversionScores = (conversionRateByProductId) => {
  const max = Object.values(conversionRateByProductId).reduce((m, v) => (v > m ? v : m), 0);
  const normalized = {};
  Object.entries(conversionRateByProductId).forEach(([productId, rate]) => {
    normalized[productId] = max > 0 ? rate / max : 0;
  });
  return normalized;
};

// Returns { [productId]: normalizedOptionScore 0–1 }
// Computes each product's representative option raw score, then normalizes by max.
const buildOptionScoreMap = (productsSnap) => {
  const rawScores = {};
  productsSnap.docs.forEach((docSnapshot) => {
    const data = docSnapshot.data();
    const pid = data.productGroupId || docSnapshot.id;
    const repOption = selectRepresentativeOption(data);
    if (!repOption) {
      rawScores[pid] = 0;
      return;
    }
    const options = Array.isArray(data.options) ? data.options : [];
    const offers  = Array.isArray(data.offers)  ? data.offers  : [];
    const stats   = data.optionStats || {};
    rawScores[pid] = computeRawOptionScore(stats[repOption.optionId], repOption.optionId, options, offers);
  });
  const max = Object.values(rawScores).reduce((m, v) => (v > m ? v : m), 0);
  const normalized = {};
  Object.entries(rawScores).forEach(([pid, raw]) => {
    normalized[pid] = max > 0 ? raw / max : 0;
  });
  return normalized;
};

// peerProductScore(p) = sum(similarity[user] × weight[actionType]) across all peer actions on p
// Returns { [productId]: normalizedScore 0–1 }
const buildPeerSimilarityScores = (similarityByUserId, peerActions) => {
  const rawScores = {};
  peerActions.forEach(({ userId, productId, actionType }) => {
    if (!productId) return;
    const similarity = similarityByUserId[userId];
    if (!similarity) return;
    const weight = ACTION_WEIGHTS[actionType] || 0;
    rawScores[productId] = (rawScores[productId] || 0) + similarity * weight;
  });
  const maxRaw = Object.values(rawScores).reduce((m, v) => (v > m ? v : m), 0);
  const normalized = {};
  Object.entries(rawScores).forEach(([productId, raw]) => {
    normalized[productId] = maxRaw > 0 ? raw / maxRaw : 0;
  });
  return normalized;
};

// ─── Item builder ─────────────────────────────────────────────────────────────

const toRecommendationItem = (productDoc, child, ctx) => {
  const product = { productId: productDoc.id, ...productDoc.data() };
  const stageTags = asArray(product.stageTags);
  const categoryTags = asArray(product.categoryTags);
  const childStage = child?.stage || '';
  const childCategoryTags = asArray(child?.categoryTags);

  const stageMatch = childStage && stageTags.includes(childStage) ? 1 : 0;
  const categoryMatch =
    childCategoryTags.length > 0 && hasIntersection(categoryTags, childCategoryTags) ? 1 : 0;

  // Concern match: child's parenting concerns intersect product's problemTags or categoryTags
  const childConcerns = asArray(child?.concerns);
  const productProblemTags = asArray(product.problemTags);
  const concernMatch =
    childConcerns.length > 0 &&
    (hasIntersection(productProblemTags, childConcerns) ||
      hasIntersection(categoryTags, childConcerns))
      ? 1 : 0;
  const peerPopularity = normalizeByMax(
    ctx.clickCountByProductId[product.productId] || 0,
    ctx.maxClickCount
  );
  const userBehaviorScore = normalizeByMax(
    ctx.userBehaviorMap[product.productId] || 0,
    ctx.maxUserBehavior
  );
  const reviewScore = ctx.reviewScoreByProductId[product.productId] || 0;
  const peerSimilarityScore = ctx.peerSimilarityByProductId[product.productId] || 0;
  const trendScore = ctx.trendScoreByProductId[product.productId] || 0;
  const reviewLikeScore = ctx.reviewLikeScoreByProductId[product.productId] || 0;
  const conversionScore = ctx.conversionScoreByProductId[product.productId] || 0;

  // Product recency: decay from product.createdAt (signal per CLAUDE.md scoring rules)
  const recency = computeProductRecency(product.createdAt);

  // Cold-start bonus: new products with no behavioral data get +0.2 so they are
  // not systematically filtered out by the top-20 cutoff before accumulating data.
  const isColdStart = reviewScore === 0 && conversionScore === 0 && trendScore === 0;
  const coldStartBonus = isColdStart ? 0.2 : 0;

  // Manual boost: product.boostScore (number, set in Firestore) is added directly
  // to the final score, allowing ops to surface specific products temporarily.
  const boostScore = typeof product.boostScore === 'number' ? product.boostScore : 0;

  // Demand-based option quality signal: normalized across all products.
  const optionScore = ctx.optionScoreByProductId[product.productId] || 0;

  // Representative option and offer for this product (used by recommendation tab UI).
  const representativeOption = selectRepresentativeOption(product);
  const representativeOffer = representativeOption
    ? selectRepresentativeOffer(asArray(product.offers), representativeOption.optionId)
    : null;

  // Child-based personalization: stage match + category match + concern match (additive boosts).
  const personalizationScore = stageMatch * 0.3 + categoryMatch * 0.3 + concernMatch * 0.2;

  // productScore formula (per CLAUDE.md scoring rules):
  //   conversionScore * 0.4 + trendScore * 0.2 + reviewScore * 0.3 + recency * 0.1
  // personalizationScore (0–0.4) applied as multiplier: productScore * (1 + personalizationScore)
  // optionScore, coldStartBonus, boostScore are additive boosts outside the multiplier.
  const productScore =
    conversionScore * 0.4 +
    trendScore      * 0.2 +
    reviewScore     * 0.3 +
    recency         * 0.1 +
    coldStartBonus +
    boostScore;

  // Collaborative filtering: similar users' behavior signal, capped at 0.3.
  const peerScore = Math.min(peerSimilarityScore, 0.3);

  const score = productScore * (1 + personalizationScore) + optionScore + peerScore;

  return {
    productId: product.productId,
    score,
    scoreBreakdown: {
      stageMatch,
      categoryMatch,
      peerPopularity,
      userBehaviorScore,
      reviewScore,
      peerSimilarityScore,
      trendScore,
      reviewLikeScore,
      conversionScore,
      recency,
      coldStartBonus,
      boostScore,
      optionScore,
      concernMatch,
      personalizationScore,
      peerScore,
    },
    representativeOption,
    representativeOffer,
    product,
  };
};

// ─── Explanation ──────────────────────────────────────────────────────────────

const REASON_RULES = [
  { key: 'stageMatch',         threshold: 0,   label: '우리 아이 단계에 맞는 상품' },
  { key: 'peerPopularity',     threshold: 0.3, label: '또래 부모들이 많이 본 상품' },
  { key: 'peerSimilarityScore',threshold: 0.3, label: '비슷한 부모 선택' },
  { key: 'reviewScore',        threshold: 0.3, label: '리뷰 평점이 높은 상품' },
  { key: 'trendScore',         threshold: 0.3, label: '최근 구매 증가' },
  { key: 'userBehaviorScore',  threshold: 0.3, label: '관심 상품과 비슷한 상품' },
  { key: 'reviewLikeScore',    threshold: 0.3, label: '리뷰에 공감이 많은 상품' },
  { key: 'conversionScore',   threshold: 0.3, label: '실제로 구매 전환이 높은 상품' },
  { key: 'optionScore',       threshold: 0.3, label: '많이 선택된 옵션이 있는 상품' },
];

export const buildRecommendationReasons = (scoreBreakdown, counts = {}) => {
  if (!scoreBreakdown) return [];
  return REASON_RULES
    .filter(({ key, threshold }) => (scoreBreakdown[key] || 0) > threshold)
    .map(({ key, label }) => {
      if (key === 'trendScore' && counts.purchaseCount > 0) {
        return `최근 24시간 ${counts.purchaseCount}명 구매`;
      }
      if (key === 'peerSimilarityScore' && counts.peerCount > 0) {
        return `비슷한 부모 ${counts.peerCount}명이 선택`;
      }
      return label;
    });
};

// Builds { [userId]: similarityScore } from shared product interactions.
// Two users are similar if they interacted with the same productGroupId.
// similarity = sharedCount / currentUserProductCount (capped at 1).
const buildSimilarityFromActions = (userId, actions) => {
  if (!userId) return {};
  const myProducts = new Set(
    actions
      .filter((a) => a.userId === userId)
      .map((a) => a.productGroupId || a.productId)
      .filter(Boolean)
  );
  if (myProducts.size === 0) return {};
  const sharedCounts = {};
  actions.forEach(({ userId: uid, productGroupId, productId }) => {
    const pid = productGroupId || productId;
    if (!uid || uid === userId || !pid) return;
    if (myProducts.has(pid)) {
      sharedCounts[uid] = (sharedCounts[uid] || 0) + 1;
    }
  });
  const similarity = {};
  Object.entries(sharedCounts).forEach(([uid, count]) => {
    similarity[uid] = Math.min(count / myProducts.size, 1);
  });
  return similarity;
};

// ─── Main export ──────────────────────────────────────────────────────────────

export async function getRecommendedProducts(child) {
  const userId = child?.userId || null;

  // Phase 1: parallel independent fetches
  const [productsSnap, allChildrenSnap, reviewStatsResult, userBehaviorMap, trendActions] =
    await Promise.all([
      getDocs(query(collection(db, 'products'), where('status', '==', 'active'))),
      getDocs(collection(db, 'children')),
      fetchReviewStatsMap(),
      fetchUserBehaviorMap(userId),
      fetchTrendActions(),
    ]);

  const { statsMap: reviewStatsMap, reviewIdToProductId, reviewQualityMap } = reviewStatsResult;

  // sameStageUserIdSet: same-stage parents for peerPopularity signal
  const sameStageUserIdSet = new Set();
  allChildrenSnap.docs.forEach((docSnapshot) => {
    const peer = docSnapshot.data();
    if (!peer.userId || peer.userId === userId) return;
    if (peer.stage && peer.stage === child?.stage) {
      sameStageUserIdSet.add(peer.userId);
    }
  });

  // similarityByUserId: built from shared product interactions (no children required)
  const similarityByUserId = buildSimilarityFromActions(userId, trendActions);

  // Phase 2: parallel action fetches (all run at the same time)
  const [clickCountByProductId, peerActions, likeCountByProductId, conversionRateByProductId] =
    await Promise.all([
      fetchClickCountMap([...sameStageUserIdSet]),
      fetchPeerActions(Object.keys(similarityByUserId)),
      fetchReviewLikeCountMap(reviewIdToProductId, reviewQualityMap, sameStageUserIdSet, similarityByUserId),
      fetchConversionRateMap(),
    ]);

  const maxClickCount = Object.values(clickCountByProductId).reduce(
    (max, v) => (v > max ? v : max),
    0
  );
  const maxUserBehavior = Object.values(userBehaviorMap).reduce(
    (max, v) => (v > max ? v : max),
    0
  );

  const reviewScoreByProductId = buildNormalizedReviewScores(reviewStatsMap);
  const peerSimilarityByProductId = buildPeerSimilarityScores(similarityByUserId, peerActions);
  const trendScoreByProductId = buildNormalizedTrendScores(trendActions);
  const reviewLikeScoreByProductId = buildNormalizedReviewLikeScores(likeCountByProductId);
  const conversionScoreByProductId = buildNormalizedConversionScores(conversionRateByProductId);
  const optionScoreByProductId = buildOptionScoreMap(productsSnap);

  const ctx = {
    clickCountByProductId,
    maxClickCount,
    userBehaviorMap,
    maxUserBehavior,
    reviewScoreByProductId,
    peerSimilarityByProductId,
    trendScoreByProductId,
    reviewLikeScoreByProductId,
    conversionScoreByProductId,
    optionScoreByProductId,
  };

  const ranked = productsSnap.docs
    .filter((productDoc) => productDoc.data().isOutOfStock !== true)
    .map((productDoc) => toRecommendationItem(productDoc, child, ctx))
    .sort((a, b) => b.score - a.score);

  if (__DEV__) {
    console.log('[Reco] results:', ranked.slice(0, 20).map((item) => ({
      productGroupId:  item.productId,
      optionId:        item.representativeOption?.optionId ?? null,
      productScore:    +item.score.toFixed(3),
      reviewScore:     +item.scoreBreakdown.reviewScore.toFixed(3),
      conversionScore: +item.scoreBreakdown.conversionScore.toFixed(3),
      trendScore:      +item.scoreBreakdown.trendScore.toFixed(3),
      optionScore:     +item.scoreBreakdown.optionScore.toFixed(3),
      peerScore:       +item.scoreBreakdown.peerScore.toFixed(3),
    })));
  }

  return ranked.slice(0, 20);
}

// ─── Floating Age Window ──────────────────────────────────────────────────────
//
// Returns products whose stageTags include the child's current stage, scored by
// peer actions from parents whose children are within ±windowMonths of the child's age.
//
// Score formula: stageMatch(0|1)*0.7 + normalizedPeerScore*0.3
// This is intentionally lighter than getRecommendedProducts — used for the
// personalized horizontal carousel on the Home screen.
//
// stageTags alignment: uses stage values from childStageUtils.js getMvpChildStage().

export async function getFloatingWindowProducts(child, windowMonths = 3) {
  if (!child?.stage) return [];
  const childAgeMonth = typeof child.ageMonth === 'number' ? child.ageMonth : 0;

  const [productsSnap, allChildrenSnap] = await Promise.all([
    getDocs(query(collection(db, 'products'), where('status', '==', 'active'))),
    getDocs(collection(db, 'children')),
  ]);

  // Build ±windowMonths peer user set (floating age window)
  const floatingWindowUserIds = new Set();
  allChildrenSnap.docs.forEach((d) => {
    const peer = d.data();
    if (!peer.userId || peer.userId === child.userId) return;
    const peerAge = typeof peer.ageMonth === 'number' ? peer.ageMonth : null;
    // Also include exact-stage peers whose ageMonth is missing
    if (peerAge === null) {
      if (peer.stage && peer.stage === child.stage) floatingWindowUserIds.add(peer.userId);
      return;
    }
    if (Math.abs(peerAge - childAgeMonth) <= windowMonths) {
      floatingWindowUserIds.add(peer.userId);
    }
  });

  const clickCountMap = await fetchClickCountMap([...floatingWindowUserIds]);
  const maxClickCount = Object.values(clickCountMap).reduce((m, v) => (v > m ? v : m), 0);

  const stageMatchItems = productsSnap.docs
    .filter((docSnapshot) => docSnapshot.data().isOutOfStock !== true)
    .map((docSnapshot) => {
      const product = { productId: docSnapshot.id, ...docSnapshot.data() };
      const stageTags = asArray(product.stageTags);
      const stageMatch = stageTags.includes(child.stage) ? 1 : 0;
      if (stageMatch === 0) return null;

      const rawPeer = clickCountMap[product.productId] || 0;
      const peerScore = maxClickCount > 0 ? Math.min(1, rawPeer / maxClickCount) : 0;

      // Concern match bonus: +0.2 when child's concerns intersect product tags
      const childConcerns = asArray(child?.concerns);
      const concernBonus =
        childConcerns.length > 0 &&
        (hasIntersection(asArray(product.problemTags), childConcerns) ||
          hasIntersection(asArray(product.categoryTags), childConcerns))
          ? 0.2 : 0;

      const score = stageMatch * 0.7 + peerScore * 0.3 + concernBonus;

      const representativeOption = selectRepresentativeOption(product);
      const representativeOffer = representativeOption
        ? selectRepresentativeOffer(asArray(product.offers), representativeOption.optionId)
        : null;

      return {
        productId: product.productId,
        score,
        scoreBreakdown: {
          stageMatch,
          peerScore,
          floatingWindowSize: floatingWindowUserIds.size,
        },
        product,
        representativeOption,
        representativeOffer,
        source: 'floating_window',
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  return stageMatchItems.slice(0, 10);
}

// ─── Coupang merge (stub) ──────────────────────────────────────────────────────

/**
 * Merges internal MomDeal recommendations with external Coupang recommendations
 * into a single feed. Designed so that plugging in real Coupang data later
 * requires no changes to callers or to getRecommendedProducts().
 *
 * Merge item shape:
 *   {
 *     productId     : string,
 *     score         : number | null,     — null for pure Coupang items
 *     scoreBreakdown: Object | null,     — null for pure Coupang items
 *     product       : Object,            — internal product shape (via normalizeCoupangProduct)
 *     source        : 'internal' | 'coupang' | 'both',
 *   }
 *
 * Planned strategy (Phase 7 — TODO):
 *   1. Build a productId → internalItem map for O(1) dedup.
 *   2. For each external item whose productId already exists in internal:
 *        mark source = 'both'; use internal score; keep Coupang URL for purchase.
 *   3. Interleave remaining Coupang-only items at every INTERLEAVE_INTERVAL slot
 *        (e.g. insert 1 Coupang item after every 4 internal items).
 *   4. Cap merged list at MAX_RESULTS (e.g. 20).
 *   5. Emit 'coupangItem' label on Coupang-sourced cards for UI differentiation
 *        (e.g. "쿠팡 추천" badge, Rocket delivery icon).
 *
 * Current behaviour: returns internal items unchanged (safe no-op).
 * External items are intentionally ignored until Phase 7 implementation.
 *
 * @param {Array} internal — output of getRecommendedProducts():
 *                           [{ productId, score, scoreBreakdown, product }]
 * @param {Array} external — Coupang items normalized via normalizeCoupangProduct():
 *                           [{ productId, score: null, scoreBreakdown: null, product, source: 'coupang' }]
 * @returns {Array} — merged list, each item has a `source` field
 */
export function mergeInternalAndCoupangRecommendations(internal, external) { // eslint-disable-line no-unused-vars
  // Phase 7: replace this stub with the full merge strategy described above.

  // Attach source='internal' to every existing item — non-breaking for callers
  // that already destructure { productId, score, scoreBreakdown, product }.
  return (Array.isArray(internal) ? internal : []).map((item) => ({
    ...item,
    source: 'internal',
  }));
}

// ─── Price insight (offers sub-collection) ────────────────────────────────────

// Pure function — accepts pre-fetched offer snapshots (newest-first).
// Returns { minPrice, maxPrice, avgPrice, currentPrice, currentPricePosition, verdict }
//   verdict: 'BEST_TIME' (≤5% above historical min), 'GOOD_TIME' (≤avg), 'WAIT' (>avg)
// Returns null when fewer than 2 valid price points are available.
export function computePriceInsight(snapshots) {
  const prices = (Array.isArray(snapshots) ? snapshots : [])
    .map((s) => s.price)
    .filter((p) => typeof p === 'number' && p > 0);
  if (prices.length < 2) return null;

  const currentPrice = prices[0]; // snapshots are newest-first
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const avgPrice = Math.round(prices.reduce((s, p) => s + p, 0) / prices.length);
  const range = maxPrice - minPrice;
  const currentPricePosition = range > 0
    ? Math.round(((currentPrice - minPrice) / range) * 100)
    : 50;

  let verdict;
  if (currentPrice <= minPrice * 1.05) verdict = 'BEST_TIME';
  else if (currentPrice <= avgPrice)   verdict = 'GOOD_TIME';
  else                                 verdict = 'WAIT';

  return { minPrice, maxPrice, avgPrice, currentPrice, currentPricePosition, verdict };
}

// Async version — fetches up to 10 snapshots from products/{productGroupId}/offers.
// Use computePriceInsight(offerSnapshots) instead when the snapshots are already loaded.
export async function getPriceInsight(productGroupId) {
  if (!productGroupId) return null;
  const snap = await getDocs(
    query(
      collection(db, 'products', productGroupId, 'offers'),
      orderBy('checkedAt', 'desc'),
      limit(10)
    )
  );
  if (snap.empty) return null;
  return computePriceInsight(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
}
