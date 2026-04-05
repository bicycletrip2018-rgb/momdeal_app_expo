# DECISIONS.md

Key product and engineering decisions. Each entry records what was chosen, what was rejected, and why.

---

## 1. Recommendation Engine Design Decisions

### 1.1 Client-side execution (Phase 5–6)

**Decision:** The full 8-signal scoring runs on the client at tab-load time.

**Why:** Client-side is faster to ship. The two-phase parallel fetch pattern (5 queries in Phase 1, 3 in Phase 2) keeps total round-trips to 2 serial network waits regardless of signal count. At MVP scale this is acceptable.

**Rejected alternative:** Server-side pre-computation from the start. Requires a scheduled Cloud Function, a `recommendations/{docId}` pre-computed collection, cache invalidation logic, and a staleness strategy. All of that is Phase 7 work. Doing it before the signal set is stable wastes the investment.

**Future direction:** Phase 7 moves scoring to a scheduled Cloud Function. The client reduces to a single `getDoc` per recommendation load. The service interface (`getRecommendedProducts`) is unchanged — the implementation behind it is swapped. All weights and signal logic remain in `recommendationService.js` until then.

---

### 1.2 Weighted additive sum over machine learning

**Decision:** `score = Σ(signal × weight)` with manually tuned weights summing to 1.0.

**Why:** The dataset is too small for collaborative filtering or gradient-boosted models to generalize. An additive sum is fully interpretable — a `scoreBreakdown` object is returned with every recommendation, and `buildRecommendationReasons` converts it directly to user-facing badge text. Weights can be adjusted by inspection without retraining.

**Rejected alternatives:**
- **Pure collaborative filtering** — requires sufficient interaction density per user pair. With anonymous users and sparse click data, cold-start failures would dominate.
- **Coupang best-sellers only** — no personalization. Every parent with a 6-month-old would see the same list regardless of feedingType, birthOrder, or behavior history.
- **ML model** — premature. Before the data volume and label quality exist to train and validate a model, a tunable weighted sum is both faster and more maintainable.

**Future direction:** `mergeInternalAndCoupangRecommendations` is already stubbed in `recommendationService.js`. Phase 7 can introduce Coupang catalog items interleaved with internal scores without changing the scoring logic.

---

### 1.3 Two-phase parallel fetch pattern

**Decision:** Firestore queries are organized into exactly two phases. Within each phase, all queries run in `Promise.all`.

**Why:** Phase 2 queries depend on data derived from Phase 1 — specifically `sameStageUserIdSet` and `similarityByUserId`, which are computed from `allChildrenSnap`. These cannot be parallelized with Phase 1. Within each phase, queries are independent and run in parallel.

**Consequence:** Adding a new signal must be classified as Phase 1 (no dependencies on other queries) or Phase 2 (depends on derived data from Phase 1). Signals that require a third serial dependency should be challenged — they add a full network round-trip to every tab load.

`reviewLikeScore` was added to Phase 2 because it depends on `reviewIdToProductId`, which is derived from the Phase 1 reviews query at zero extra cost.

---

### 1.4 Child similarity threshold of 0.40

**Decision:** Only parents whose child similarity score is ≥ 0.40 enter the peer similarity pool.

**Why:** Below 0.40, the similarity signal is too weak to be informative. A parent with a 24-month toddler and a parent with a 3-month newborn would have near-zero similarity — including their behavior in scoring for the other is noise. At 0.40, the peer must share at least "same stage" (0.40 by itself) or a combination of age proximity + shared attributes.

**Tradeoff:** A stricter threshold (e.g. 0.60) gives higher-quality peers but may leave many users with an empty similarity pool, falling back entirely to stage-based signals. 0.40 is the floor that guarantees stage match is always sufficient for inclusion.

---

### 1.5 reviewLikeScore: three-layer stabilization

**Decision:** Likes are weighted by recency × quality × user similarity, then stabilized via top-20 cap, 5.0 ceiling, and log normalization before entering the score.

**Why:** Without stabilization, a single viral review on one product would give it a near-perfect `reviewLikeScore` regardless of its actual recommendation relevance. A product with 1,000 likes on one review would dominate a product with 50 likes spread across 10 high-quality verified reviews.

The three layers each address a distinct failure mode:
- **top-20** — prevents a product with many mediocre reviews from burying one with a few excellent ones
- **cap 5.0** — bounds the raw input to `log()` so the compression is predictable
- **log(1 + x)** — makes the difference between 1 and 5 likes matter more than the difference between 50 and 100

**Rejected alternative:** Raw like count, normalized by max. This was the initial implementation (V1). Rejected because it is dominated by the product with the most likes regardless of quality or recency.

---

### 1.6 Action weights: purchase=5, review=4, click=2, view=1

**Decision:** Purchase intent is expressed in the weight, not just the action type.

**Why:** Not all interactions signal the same thing. Writing a review requires a decision; the author committed enough attention to compose text. A click is weak — users misclick, browse without intent, or compare prices without buying. These weights apply consistently across `trendScore`, `peerSimilarityScore`, and `peerPopularity`.

**Consequence:** A product with 10 verified purchases outscores a product with 30 casual clicks in peer signals. This is the intended behavior — the engine should surface products parents actually bought, not just products they glanced at.

---

## 2. Price Intelligence UX Decisions

### 2.1 Three guidance tiers instead of a continuous score

**Decision:** `getPriceIntelligence` returns one of three labels — "지금 구매 추천", "평균보다 높은 가격", "최근 최고가 근처" — or null.

**Why:** A percentile score (e.g. "현재가 위치 34%") is shown in the UI as a visual bar. But users cannot act on a number. They can act on a judgment. Three tiers map to three decisions: buy now, wait and watch, don't buy yet. The underlying calculation is precise; the label is the decision layer on top of it.

The guidance tiers also drive concrete UI changes: button text, button color, urgency banner visibility, and badge color on recommendation cards. A continuous score cannot drive these binary UI branches.

**Threshold rationale:**
```
currentPrice ≤ average × 0.95  →  "지금 구매 추천"      (5% below average = meaningful discount)
currentPrice ≥ highest × 0.90  →  "최근 최고가 근처"    (near historical high = bad time to buy)
currentPrice > average          →  "평균보다 높은 가격"  (above average, not worst)
```
"Near highest" is checked before "above average" to avoid overlap. The 5% band below average prevents noise — a product at exactly average should not trigger a buy signal.

---

### 2.2 Urgency signals are gated on guidance, not on price drop alone

**Decision:** "🔥 지금 사는 타이밍" (both card badge and detail page banner) is shown only when `guidance === '지금 구매 추천'`.

**Why:** Price drop alone is misleading. A product's price could drop from an artificially inflated level back to its normal price — this is not a buying opportunity. The guidance threshold requires the current price to be below the historical average, not just lower than yesterday.

**Rejected alternative:** Show urgency whenever `priceDrop > 0`. This would trigger the banner after every price reduction regardless of whether the new price is actually good. Users who buy at a "dropped" price that is still above average would feel deceived. Regret purchases destroy trust faster than missed opportunities.

---

### 2.3 Dynamic CTA button with honest friction

**Decision:** The purchase button text and color change based on price guidance.

| Guidance | Text | Color |
|---|---|---|
| 지금 구매 추천 | 지금 사는게 좋아요 | green |
| 평균보다 높은 가격 | 가격 확인하기 | orange |
| 최근 최고가 근처 | 지금은 비추천 | muted gray |
| no data | 구매하러 가기 | orange |

**Why:** Honest friction. The button is always pressable — users can still buy at any time. But the color and text communicate the system's assessment. A gray "지금은 비추천" button is not a disabled state; it is a signal.

**Rejected alternative:** Always show "구매하러 가기" in orange. Rejected because it treats every price moment as equally valid. MomDeal's value proposition is helping parents make better buying decisions. A button that ignores price intelligence contradicts the product's core purpose.

**Hypothesis to validate:** Users who click "지금은 비추천" will show materially lower `stayedLongEnough` rates in `product_click_logs` than users who click "지금 사는게 좋아요". If confirmed, this validates increasing the friction on bad-deal clicks further.

---

### 2.4 Price history starts at first registration, no backfill

**Decision:** `recordPrice` is called in `registerCoupangProduct` as a fire-and-forget side effect. History begins from day one of product tracking.

**Why:** Backfilling historical prices would require Coupang API access for historical data, which is not available in the Partners API. Starting from registration date is the pragmatic choice. With a price-checking scheduler (planned for Phase 7), a product registered today will have 30+ data points within a month.

**Consequence:** Price intelligence is unreliable for newly registered products with fewer than 3–5 data points. `getPriceIntelligence` returns null for products with no history. The UI falls back to showing the raw price without guidance labels. This is correct behavior — no guidance is better than misleading guidance.

---

### 2.5 30-record window for price intelligence

**Decision:** `getPriceIntelligence` queries the last 30 price records.

**Why:** 30 balances recency and statistical stability. With daily price checks (Phase 7 scheduler), 30 records ≈ 1 month of data. This is enough to establish a meaningful average and identify genuine highs and lows. An unlimited window would be dominated by old prices that are no longer representative of current market conditions.

**Rejected alternative:** 7-day window. Too short for products with infrequent price changes — the average and highest would be nearly identical, producing useless guidance.

---

## 3. Community System Direction

### 3.1 Community as a recommendation data source, not a standalone product

**Decision:** The community system was built to produce signals for the recommendation engine first, and to provide user-facing content second.

**Why:** `reviewScore` and `reviewLikeScore` together account for 0.15 weight in the scoring formula. Every review written and liked improves the recommendation quality for all users at a similar stage. The community tab is the surface through which this data is collected, not a separate product competing with the recommendation feed for attention.

**Consequence:** Community features are prioritized in the order of their contribution to recommendation quality. Verified purchase reviews were built before anonymous reviews because `verifiedPurchase: true` carries more weight in scoring. Likes were built before comments because likes aggregate into `reviewLikeScore`; comments currently have no recommendation signal.

---

### 3.2 Composite document ID for `review_likes`

**Decision:** `review_likes` documents use `${userId}_${reviewId}` as the document ID.

**Why:** This encodes the uniqueness constraint (one like per user per review) at the data model level — Firestore guarantees document ID uniqueness, so double-likes are impossible without application-level checks. More importantly, `toggleLike` and `getLikeStatus` can use `getDoc` (O(1)) instead of a two-field `where` query, avoiding the need for a composite Firestore index on `(userId, reviewId)`.

**Rejected alternative:** Subcollection `reviews/{reviewId}/likes/{userId}`. Rejected because bulk-loading like counts for a feed of N reviews would require N separate subcollection queries. With the flat `review_likes` collection and `where('reviewId', 'in', chunk)`, `getBulkLikeData` loads all likes for up to 30 reviews in one query.

---

### 3.3 Verified purchase determined at write time

**Decision:** `verifiedPurchase` is computed by `checkVerifiedPurchase` when the review is submitted and stored as a boolean field on the review document.

**Why:** Computing it at read time would require querying `user_product_actions` for every review rendered in the feed and every review displayed on the product detail page. At scale, this is untenable. Computing it once at write time stores the result and never recalculates it.

**Tradeoff:** If a user's purchase action is recorded after they write their review (edge case), the badge will be absent even though the user did buy. This is acceptable — the verification is conservative by design, which maintains its credibility.

---

### 3.4 Photo reviews deferred with schema reservation

**Decision:** `reviews` documents include `images: []` (always empty). Firebase Storage integration is not built.

**Why:** The field exists to prevent a schema migration when photo reviews are implemented. Adding a new field to existing Firestore documents is a no-op (documents are schema-free), but deciding the field name and type now prevents inconsistency later. The `images` field is always `[]` in current data — callers treat it as an empty array, which is already the correct behavior for "no photos."

**Future direction:** When photo reviews are implemented, `ReviewWriteScreen` adds an image picker, uploads to Firebase Storage, and writes CDN URLs into the `images` array. The rest of the system (community feed, product detail) already maps `images` — displaying them just requires adding the `<Image>` render logic.

---

### 3.5 Free-form community posts deferred

**Decision:** The community tab shows reviews only. Posts, questions, and discussion threads are not built.

**Why:** Reviews have structured data (rating, productId, verifiedPurchase) that feeds the recommendation engine. Free-form posts have no recommendation signal and no natural product attachment. Building the community content graph before it has a clear connection to the recommendation or trust systems would add complexity without advancing the core product.

**When to revisit:** When the review volume is high enough that the community tab's engagement can be measured independently, and there is evidence that parents are using it to ask questions that reviews don't answer.

---

## 4. Conversion Optimization Strategy

### 4.1 AppState engagement detection as a conversion proxy

**Decision:** `stayedLongEnough` (user spent ≥ 10s on external purchase page) is used as a "good click" proxy metric, tracked via `AppState.addEventListener`.

**Why:** The ground-truth conversion signal — whether the user actually completed a purchase on Coupang — requires the Coupang Partners conversion webhook. That requires API credentials, which are pending. AppState is available immediately with no external dependency.

**Limitations acknowledged:**
- A user who spends 15 seconds on the Coupang page then abandons registers as `stayedLongEnough: true`
- A user who completes a purchase in 8 seconds (unlikely but possible on mobile) registers as `false`
- AppState events may not fire reliably on all Android OEM builds

**Replacement plan:** When Coupang conversion webhook is available, map `trackingId` from `coupangService.createDeeplink` to confirmed purchase events. The `product_click_logs` collection already stores `trackingId` for this purpose. At that point, `stayedLongEnough` becomes a secondary signal rather than the primary proxy.

---

### 4.2 Two separate click log services

**Decision:** `coupangService.logProductClick` and `analyticsService.logProductClick` are separate functions writing to the same `product_click_logs` collection with different field sets.

**Why:** They serve different purposes. `coupangService.logProductClick` tracks affiliate revenue attribution — it records `source`, `deeplink`, and `trackingId` for matching against Coupang's conversion webhook. `analyticsService.logProductClick` tracks recommendation quality — it records `priceAtClick`, `guidance`, and `isGoodDeal` for internal analysis.

Merging them would create a function with too many responsibilities and would couple the monetization layer to the analytics layer. When the Coupang API is live, `coupangService` will be modified (HMAC integration, real deeplinks). That should not affect the analytics tracking logic.

---

### 4.3 logProductClick is synchronous by design

**Decision:** `analyticsService.logProductClick` is a regular function (not `async`). It does not return a promise. It registers the `AppState` listener synchronously before returning.

**Why:** The listener must be registered before `Linking.openURL` causes the app to transition to background. If `logProductClick` were async and awaited before calling `Linking.openURL`, two problems arise:
1. The Firestore `addDoc` introduces 100–500ms of network latency before the URL opens, degrading the tap response
2. If `addDoc` fails, the purchase flow would need error handling that has nothing to do with opening the URL

The Firestore write runs in the background. A `pendingUpdate` closure bridges the race condition where `AppState` resolves before `addDoc` completes.

---

### 4.4 Price intelligence captured at click time

**Decision:** `guidance` and `isGoodDeal` are written to `product_click_logs` at the moment of the click, not derived retrospectively from price history.

**Why:** Prices change. Analyzing conversion rates a week after clicks were logged using current guidance labels would misattribute the decision context. The user who clicked at "최근 최고가 근처" made that decision when the price was genuinely high. Capturing the state at click time preserves the causality of the analysis.

**What this enables:** Segmenting `stayedLongEnough` rates by `guidance` to answer: "Does price intelligence improve purchase quality?" If `isGoodDeal: true` clicks show materially better engagement than `isGoodDeal: false` clicks, that validates the price signal's weight in the recommendation engine and justifies the behavioral friction on the CTA button.

---

### 4.5 Auto-create price alert on save

**Decision:** When a user saves a product (bookmarks it), `createPriceAlert` is called automatically with `targetType: 'drop'`. The user does not need to explicitly create an alert.

**Why:** A user who saves a product is by definition interested in buying it eventually. Creating an alert for them removes a step and ensures no saved product is silently tracked without an alert. The alert can be toggled off from the detail page or SavedProductsScreen.

**Rejected alternative:** Require explicit opt-in to create an alert after saving. This reduces alert volume but misses the largest signal of intent (the save action itself). The default-on model also trains users that saves are active, not passive — MomDeal monitors prices on your behalf.

**Tradeoff:** Users who save many products without intending to buy will accumulate inactive alerts. This is resolved by the ON/OFF toggle on the detail page and the alert indicator on saved cards. The noise of over-alerting is a lesser problem than the missed opportunity of under-alerting.

---

### 4.6 conversionScore as highest-weight signal (×0.20)

**Decision:** `conversionScore = goodClicks / totalClicks` from `product_click_logs` is the single highest-weighted signal in the recommendation formula, at ×0.20.

**Why:** This closes the feedback loop. Every other signal is a proxy for purchase intent (stage match, peer behavior, review quality). `conversionScore` is direct evidence: users who tapped the purchase button and spent ≥10s on the external page actually engaged with the purchase flow. A product that consistently produces engaged sessions is objectively better at converting than one that does not, regardless of how well it matches stage tags or peer trends.

**Normalization:** Raw rates (0–1) are normalized by the highest observed rate across all products. This means the top-converting product always scores 1.0, and others are scaled relative to it. A product with no click log data scores 0 — which is correct behavior, since no evidence of conversion is not evidence of good conversion.

**Rejected alternative:** Using raw `goodClicks` count (not a rate). Rejected because a product with 100 total clicks and 60 goodClicks (60%) is a better converter than one with 200 total clicks and 80 goodClicks (40%), even though the raw count is higher. Rate captures quality; raw count captures volume.

**Bootstrap concern:** New products have zero click data and will score 0 on this signal. They still compete on the remaining 8 signals (total weight 0.80). As click data accumulates, `conversionScore` naturally rises for products that earn it. This is the intended behavior — the engine should favor proven converters over untested ones, but not exclude untested products entirely.

**Future direction:** When the Coupang Partners conversion webhook is live, replace `stayedLongEnough` with confirmed purchase events. The `trackingId` field on `product_click_logs` documents is already reserved for this mapping. At that point, `conversionScore` becomes a true purchase rate, not a proxy.

---

## 5. Monetization Pre-API Strategy

### 5.1 Manual affiliateUrl field for pre-API revenue

**Decision:** `products/{productId}` documents accept an optional `affiliateUrl` field. When present, the purchase button opens it instead of the Coupang offer URL. The field is set directly in the Firestore console — the app only reads it.

**Why:** Coupang Partners API approval takes time. Manual affiliate links (e.g. Coupang Partners short links, Kakao Partners, Naver CPA) can be set per product immediately, generating real commission before the API is live. Zero additional infrastructure — one Firestore field, one line of priority logic in `handlePurchase`.

**URL priority:** `product.affiliateUrl` → `offer.url` (Coupang product URL). If neither exists, the purchase button is disabled.

**Rejected alternative:** A separate admin screen in the app for entering affiliate URLs. Rejected because it requires auth-gated UI, role checks, and a write path — unnecessary overhead before the API exists. Direct Firestore console edits are sufficient at this stage.

**Click tracking:** All purchase button clicks log to `product_click_logs` regardless of which URL is used. When `affiliateUrl` is set, `deeplinkUrl` in the log captures the affiliate URL and `trackingId` is null.

### 5.2 createDeeplink isolated failure handling

**Decision:** The `createDeeplink` call in `handlePurchase` is wrapped in its own try/catch, independent of the outer purchase flow. A deeplink generation failure silently falls back to the raw Coupang URL.

**Why:** `createDeeplink` is currently a mock and will eventually be a real HMAC-signed API call. Any failure in that network call should not block the user from completing a purchase. The cost of a missed deeplink (tracking gap) is far lower than the cost of a broken purchase button.

**When `affiliateUrl` is set:** `createDeeplink` is skipped entirely — the affiliate URL is already a fully-formed link and wrapping it in a Coupang deeplink would produce an invalid URL.
