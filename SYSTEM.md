# SYSTEM.md

Engineering reference for the MomDeal system. Describes what is actually built and why.

---

## 1. Product Definition

MomDeal is a **data-driven parenting commerce platform**.

The core insight: parenting is a data problem. Every developmental stage creates a distinct set of product needs that parents don't know in advance.

```
임신       → 임신 용품, 출산 준비물
신생아     → 기저귀, 젖병, 모유 용품
early_infant → 뒤집기 매트, 바운서
infant     → 이유식 용품, 식기
toddler    → 안전용품, 걸음마 보조
early_child → 교육 완구, 외출 용품
```

MomDeal does not ask parents "what do you need?". It reads the child's stage and answers automatically.

### What MomDeal is not

- **Not a price comparison site** — price is one signal among eight, not the product
- **Not a community-first platform** — community (reviews, likes) is a data source for recommendations
- **Not a search engine** — the feed is curated, not keyword-driven

### Core data asset

The child profile is the moat. Every `children/{childId}` document written increases the quality of peer-based recommendation signals for all other users at the same stage.

### Monetization model

Affiliate commission via Coupang Partners API. Every outbound click is a potential revenue event. The recommendation engine's job is to make sure that click is likely to convert.

---

## 2. Recommendation Engine Structure

**File:** `src/services/recommendationService.js`
**Runs:** client-side on 추천 tab load. Server-side pre-computation planned (Phase 7).

### Two-phase fetch pattern

All Firestore queries are parallelized across two phases. Phase 2 depends on data derived from Phase 1.

```
Phase 1 (parallel — 5 queries)
  ├── products (status == 'active')
  ├── children (all, for peer pool derivation)
  ├── reviews (all, for stats + reviewId→productId map)
  ├── user_product_actions (current user only)
  └── user_product_actions (last 7 days, all users)

  ↓ derive: sameStageUserIdSet, similarityByUserId, reviewIdToProductId, reviewQualityMap

Phase 2 (parallel — 4 queries)
  ├── user_product_actions (clicks, same-stage peers)
  ├── user_product_actions (all actions, similar-child peers)
  ├── review_likes (by reviewId, for reviewLikeScore)
  └── product_click_logs (resolved entries only, for conversionScore)
```

### Scoring formula

```
score =
  conversionScore     × 0.20   — goodClicks/totalClicks from product_click_logs (normalized)
  stageMatch          × 0.15   — product stageTags ∩ child stage
  peerSimilarityScore × 0.15   — Σ(childSimilarity × actionWeight) across similar parents
  categoryMatch       × 0.10   — product categoryTags ∩ child categoryTags
  peerPopularity      × 0.10   — click count from same-stage parents (normalized)
  trendScore          × 0.10   — Σ(actionWeight × recencyWeight) last 7 days
  reviewLikeScore     × 0.10   — Σ(like × recency × quality × userSimilarity), log-scaled
  reviewScore         × 0.05   — f(avgRating, reviewCount, verifiedRatio)
  userBehaviorScore   × 0.05   — current user's past interaction count (normalized)
                      ──────
                        1.00
```

### Child similarity algorithm (`computeChildSimilarity`)

Used to build the peer pool for `peerSimilarityScore`. Compared field by field:

| Signal | Weight |
|---|---|
| Same stage | +0.40 |
| Age diff ≤ 3 months | +0.25 |
| Age diff ≤ 6 months | +0.10 |
| Same feedingType | +0.20 |
| categoryTags overlap | +0.15 |

Only parents scoring ≥ 0.40 total are included in the similarity peer pool.

### reviewLikeScore stabilization pipeline

Raw like data is biased by viral reviews and old likes. Three stabilization layers applied in sequence:

```
1. Per like:    recency × quality × userSimilarity weight
                  recency:    1.0 / 0.7 / 0.4 / 0.2  (< 1d / < 3d / < 7d / older)
                  quality:    ×1.3 verifiedPurchase, ×1.2 rating ≥ 4, ×1.0 otherwise
                  similarity: ×1.2 same stage, ×1.1 similar child, ×1.0 others

2. Per product: top-20 reviews by weighted score (diversity cap)
                sum, cap at 5.0 (outlier cap)

3. Normalize:   log(1 + rawScore) / max  → 0–1
```

### Recommendation output shape

```js
{
  productId: string,
  score: number,           // 0–1
  scoreBreakdown: {
    stageMatch, categoryMatch, peerPopularity,
    peerSimilarityScore, trendScore, reviewLikeScore,
    reviewScore, userBehaviorScore
  },
  product: { ...productDoc }
}
```

`buildRecommendationReasons(scoreBreakdown)` converts `scoreBreakdown` into human-readable badge labels shown on recommendation cards (max 2 badges per card).

### Action weights

Actions on `user_product_actions` are weighted by purchase intent:

| actionType | weight |
|---|---|
| purchase | 5 |
| review | 4 |
| click | 2 |
| view | 1 |

---

## 3. Conversion Tracking System

The product surface area for monetization is the purchase button. Every tap is an outbound click to Coupang. The conversion tracking system measures whether that click was meaningful.

### Data flow

```
User taps purchase button
  │
  ├── logProductClick() called  [BEFORE Linking.openURL]
  │     └── addDoc → product_click_logs  (stayedLongEnough: null)
  │     └── AppState listener registered
  │
  └── Linking.openURL(coupangUrl)
        └── app → background

User returns to app
  │
  └── AppState 'active' event fires
        └── elapsed = Date.now() - backgroundedAt
        └── stayedLongEnough = elapsed ≥ 10_000
        └── updateDoc → product_click_logs  (stayedLongEnough: true|false)

Auto-resolve at 60s
  └── stayedLongEnough = (backgroundedAt !== null)
```

**Critical ordering:** `logProductClick` is synchronous and registers the AppState listener before returning. `Linking.openURL` is called after. This guarantees no `background` transition event is missed.

### Schema: `product_click_logs/{docId}`

| Field | Type | Description |
|---|---|---|
| userId | string\|null | who clicked |
| productId | string | |
| clickedAt | Timestamp | |
| priceAtClick | number\|null | displayed price at click time |
| guidance | string\|null | price intelligence label at click time |
| isGoodDeal | boolean | guidance === '지금 구매 추천' |
| stayedLongEnough | boolean\|null | null until resolved |

### "Good click" definition

`stayedLongEnough === true` — user spent ≥ 10 seconds on the external purchase page before returning to the app. This is the primary conversion proxy metric.

Rationale: a user who returns in < 10 s bounced before engaging with the purchase page. A user who stays ≥ 10 s read the product page. A user who never returns within 60 s likely completed a multi-step checkout flow.

### Conversion rate

```js
computeConversionRate(productId)
→ { total: N, goodClicks: N, rate: 0–1 }
```

Only resolved entries (stayedLongEnough !== null) count. Unresolved entries (doc written, AppState event never fired) are excluded to avoid noise.

### Price intelligence → conversion signal

Each click log includes `guidance` and `isGoodDeal`, allowing offline analysis of:
- Do "지금 구매 추천" clicks convert at a higher rate than neutral clicks?
- Does lower `priceAtClick` correlate with higher `stayedLongEnough`?

This data informs future weight adjustments to the recommendation engine.

---

## 4. UX Philosophy

### Decision support, not discovery

The 추천 tab is not a catalog. It is an answer to the question "what should I buy for my child right now?". Every UI element either supports that answer or it does not belong.

### Urgency is earned, not manufactured

Urgency signals ("🔥 지금 사는 타이밍!") are shown only when the price intelligence system confirms `guidance === '지금 구매 추천'` — i.e. current price ≤ average × 0.95. They are never shown speculatively.

### Trust is concrete, not abstract

Every trust signal in the UI references a real data point:
- "별점 ★4.8" → computed from `reviews` collection
- "구매 인증" → `verifiedPurchase: true` on the review document
- "최근 24시간 N명 구매" → count from `user_product_actions` with `actionType: 'purchase'`
- "비슷한 부모 N명이 선택" → unique userId count from `user_product_actions` for this product

### Optimistic UI is default

All toggle operations (save, like, alert on/off) apply the UI change immediately and roll back on error. Users should never wait for a network round-trip to see their action reflected.

### CTA text reflects reality

The purchase button text is determined by price intelligence:

| Guidance | Button text |
|---|---|
| 지금 구매 추천 | 지금 사는게 좋아요 (green) |
| 평균보다 높은 가격 | 가격 확인하기 (orange) |
| 최근 최고가 근처 | 지금은 비추천 (muted) |
| no data | 구매하러 가기 (orange) |

The button color is an honest signal. A gray button on a high-price product is intentional friction — the system is telling the user to wait.

### No nested touchables

Cards that contain action buttons (like button, save button) use an outer `View` with sibling inner `TouchableOpacity` elements. This is a hard rule to prevent event propagation issues on Android.

---

## 5. Current Strategy

### What phase we are in

Phase 6 (Community System). Phases 1–5 (User, Child, Product, Registration, Recommendation) are complete. Phase 7 (server-side recommendation pre-computation) and Phase 8 (platform expansion) are not yet started.

### What is working

| System | Status |
|---|---|
| Child stage → recommendation | Working (categoryTags now written to child docs) |
| Price tracking & intelligence | Working (priceTrackingService, getPriceIntelligence) |
| Peer popularity signal | Working |
| Peer similarity signal | Working |
| Review score signal | Working |
| Trend score (7-day recency) | Working |
| reviewLikeScore (quality + recency + similarity) | Working |
| Community feed with Firestore-backed likes | Working |
| Price alert creation and toggle | Working (mock FCM, no actual push) |
| Conversion click logging with AppState tracking | Working |

### What is stubbed or blocked

| Item | Blocker |
|---|---|
| Real product prices | Coupang Partners API key pending (`functions/.env`) |
| FCM push notifications for price alerts | FCM token not yet stored |
| Server-side recommendation pre-computation | Phase 7 (not started) |
| Photo reviews | Firebase Storage integration not built |
| `_callCoupangAPI` HMAC-SHA256 | API key pending |

### Recommendation engine: client vs. server

The current engine runs entirely on the client. This is an explicit Phase 5 MVP decision. The full 8-signal computation fetches approximately 5–8 Firestore queries per page load (parallelized into 2 phases). This is acceptable for MVP scale.

Phase 7 replaces this with a scheduled Cloud Function that pre-computes scores and writes them to `recommendations/{docId}`. The client then does a single read instead of the full computation.

### Data strategy

The platform's defensibility increases with child profile density. The two most important network effects:

1. **Stage-based peer signal** — more children at stage X → more peer click data → better `peerPopularity` and `peerSimilarityScore` for that stage
2. **Review like quality** — more community engagement → `reviewLikeScore` better distinguishes genuinely helpful reviews from noise

The recommendation engine is designed to improve automatically as data grows, without code changes.

### Key metric: conversion rate by guidance label

The conversion tracking system (`analyticsService.computeConversionRate`) plus the `guidance` field on each click log enables a direct test of whether the price intelligence system improves purchase decisions. The expected result: clicks tagged `isGoodDeal: true` should show materially higher `stayedLongEnough` rates than neutral clicks. If this is confirmed in data, it validates increasing the weight of price-based signals in the recommendation score.
