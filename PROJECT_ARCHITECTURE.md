# PROJECT_ARCHITECTURE.md

Technical reference for the MomDeal codebase. Describes what is actually built, not what is planned.

---

## Directory Map

```
momdeal_app_expo/
├── App.js                         # Root: navigation + useAuthSync()
├── index.js                       # Expo entry (registerRootComponent)
├── src/
│   ├── firebase/
│   │   └── config.js              # Firebase init → exports db, auth, functions
│   ├── hooks/
│   │   └── useAuthSync.js         # Anonymous auth + Firestore user sync
│   ├── screens/
│   │   ├── Tab1_ProductList.js    # 추천 tab: fetches + renders recommendations
│   │   ├── ProductListScreen.js   # 상품 tab: lists all products
│   │   ├── ProductRegister.js     # URL input form → calls registerCoupangProduct()
│   │   ├── ProductDetail.js       # Placeholder: shows name, records 'purchase' action
│   │   ├── ChildListScreen.js     # 아이 tab: lists children by userId
│   │   └── ChildAddScreen.js      # Form: creates child document
│   ├── services/
│   │   ├── recommendationService.js       # Client-side recommendation scoring
│   │   ├── productMetadataService.js      # Calls fetchCoupangProduct Cloud Function
│   │   ├── productTagService.js           # Keyword-based tag generator
│   │   ├── productActionService.js        # Writes user_product_actions docs
│   │   └── firestore/
│   │       ├── userRepository.js          # createOrUpdateUserProfile()
│   │       └── childrenRepository.js      # createChild / getChildrenByUserId / updateChild
│   ├── domain/
│   │   └── child/
│   │       └── childStageUtils.js         # calculateAgeMonthFromDate, getMvpChildStage, buildChildComputedFields
│   ├── utils/
│   │   └── registerCoupangProduct.js      # Full product registration orchestrator
│   └── components/                        # [EMPTY] No components built yet
├── functions/
│   └── index.js                           # Cloud Function: fetchCoupangProduct (HTTPS callable)
└── docs/
    ├── MOMDEAL_PLATFORM_SPEC.md           # Product vision and data spec
    └── MOMDEAL_TASK_PIPELINE.md           # Phase order and dev rules
```

---

## Navigation

```
App (NavigationContainer)
└── Tab.Navigator
    ├── 추천   → PriceStack
    │           ├── PriceList      → Tab1_ProductList
    │           └── ProductDetail  → ProductDetail
    ├── 상품   → ProductStack
    │           ├── ProductList    → ProductListScreen
    │           ├── ProductRegister→ ProductRegister
    │           └── ProductDetail  → ProductDetail
    ├── 아이   → ChildStack
    │           ├── ChildList      → ChildListScreen
    │           └── ChildAdd       → ChildAddScreen
    └── 커뮤니티 → CommunityScreen  [PLACEHOLDER — inline View/Text only]
```

---

## Firestore Schema (Implemented)

### `users/{userId}`
| Field | Type | Notes |
|---|---|---|
| email | string | '' for anonymous |
| provider | string | 'anonymous' or providerId |
| role | string | always 'user' |
| createdAt | Timestamp | |
| updatedAt | Timestamp | |
| lastLoginAt | Timestamp | updated on every auth event |

### `children/{childId}`
| Field | Type | Notes |
|---|---|---|
| userId | string | owner |
| name | string | |
| gender | string | 'male' / 'female' / 'unknown' |
| birthDate | string\|null | ISO string, null for pregnancy |
| birthOrder | number\|null | 1-indexed |
| type | string | 'child' / 'pregnancy' |
| pregnancyWeek | number\|null | only when type='pregnancy' |
| dueDate | string\|null | pregnancy only, currently always null |
| feedingType | string | 'breast'/'formula'/'mixed'/'unknown' |
| ageMonth | number\|null | computed by buildChildComputedFields |
| stage | string\|null | computed — see Stage System below |
| categoryTags | string[] | computed — derived from stage + feedingType |
| weight | number\|null | kg |
| height | number\|null | cm |
| createdAt | Timestamp | |
| updatedAt | Timestamp | |

### `products/{productGroupId}`
Doc ID = `productGroupId` (numeric group ID from Coupang URL path `/vm/products/<id>`).
Re-registering the same URL always merges into the same document.
| Field | Type | Notes |
|---|---|---|
| productGroupId | string | primary identity; mirrors doc ID |
| name | string | from mock metadata |
| brand | string | from mock metadata |
| category | string | from mock metadata |
| currentPrice | number | 0 until real API is wired |
| status | string | `'active'` |
| source | string | `'coupang'` or `'manual'` |
| stageTags | string[] | e.g. `['infant','toddler']` |
| categoryTags | string[] | e.g. `['diaper']` |
| problemTags | string[] | e.g. `['diaper_leak']` |
| ageMinMonth | null | not yet populated |
| ageMaxMonth | null | not yet populated |
| image | string | CDN URL |
| affiliateUrl | string\|undefined | product-level fallback affiliate link |
| options | array\|undefined | structural labels; each item: `{ optionId, name }`. Selecting an option drives offer resolution. |
| offers | array\|undefined | purchase data per option; each item: `{ optionId, price, affiliateUrl, sellerType, deliveryType, isRocket, score }`. Default = offer with highest `score`, matched via `optionId`. |
| boostScore | number\|undefined | added directly to recommendation score |
| optionStats | map\|undefined | demand stats per optionId: `{ [optionId]: { trackingCount, clickCount, conversionCount, reviewCount, lastUpdatedAt } }`. Drives representative option selection and `optionScore` signal. |
| createdAt | Timestamp | |
| updatedAt | Timestamp | |

### `products/{productGroupId}/offers/{offerId}` (price-history subcollection)
Separate from the inline `offers` array — these are price snapshots for price-intelligence queries.
| Field | Type | Notes |
|---|---|---|
| offerId | string | `productGroupId_itemId` when `itemId` present in URL, otherwise Firestore auto-ID |
| productGroupId | string | parent product reference |
| mallName | string | `'coupang'` |
| price | number | snapshot price |
| isOutOfStock | boolean | |
| url | string | canonical m.coupang.com URL |
| checkedAt | Timestamp | |

### `user_product_actions/{docId}`
| Field | Type | Notes |
|---|---|---|
| userId | string | |
| productId | string | |
| actionType | string | 'click' / 'purchase' |
| createdAt | Timestamp | |

### `reviews/{reviewId}`
| Field | Type | Notes |
|---|---|---|
| userId | string | author |
| productId | string | |
| rating | number | 1–5 |
| content | string | review body |
| images | string[] | always [] — photo review not yet implemented |
| verifiedPurchase | boolean | set by `checkVerifiedPurchase` at write time |
| createdAt | Timestamp | |

### `review_likes/{userId}_{reviewId}`
Document ID is a composite key `{userId}_{reviewId}` — guarantees uniqueness per user per review and enables direct lookup without a composite index.
| Field | Type | Notes |
|---|---|---|
| userId | string | who liked |
| reviewId | string | which review |
| createdAt | Timestamp | |

### `product_click_logs/{docId}`
Written by `analyticsService.logProductClick` when user taps the purchase button.
`stayedLongEnough` is updated asynchronously via AppState listener after the user returns from the external purchase page.
| Field | Type | Notes |
|---|---|---|
| userId | string\|null | who clicked |
| productId | string | |
| clickedAt | Timestamp | |
| priceAtClick | number\|null | displayed price at click time |
| guidance | string\|null | price guidance label at click time |
| isGoodDeal | boolean | `guidance === '지금 구매 추천'` |
| deeplinkUrl | string\|null | affiliate deep link URL that was opened (from `coupangService.createDeeplink`) |
| trackingId | string\|null | `{userId}_{productId}_{epoch}` for Coupang conversion webhook attribution |
| stayedLongEnough | boolean\|null | null until resolved; true = spent ≥ 10 s on external page ("good click") |

### `price_alerts/{docId}`
Written by `priceAlertService.createPriceAlert` / `togglePriceAlert`.
Checked fire-and-forget in `registerCoupangProduct` and when a product is saved.
| Field | Type | Notes |
|---|---|---|
| userId | string | who set the alert |
| productId | string | |
| targetType | string | `'drop'` (price falls) \| `'goodDeal'` (guidance === '지금 구매 추천') |
| isActive | boolean | toggled by user from `ProductDetail` and `SavedProductsScreen` |
| createdAt | Timestamp | |

### Planned (not created yet)
- `recommendations/{docId}` — pre-computed recommendation results

---

## Child Stage System

**File:** `src/domain/child/childStageUtils.js`

```
buildChildComputedFields({ type, birthDate })
  → { ageMonth: number|null, stage: string|null }
```

Stage ladder:
| stage | condition |
|---|---|
| pregnancy | type === 'pregnancy' |
| newborn | ageMonth 0–2 |
| early_infant | ageMonth 3–5 |
| infant | ageMonth 6–11 |
| toddler | ageMonth 12–23 |
| early_child | ageMonth 24–36 |
| child | ageMonth > 36 |

Called by `childrenRepository` on every `createChild` and `updateChild`. `ageMonth` and `stage` are never stored by the client raw — always computed through this function.

---

## Recommendation Engine

**File:** `src/services/recommendationService.js`
**Runs:** client-side on 추천 tab load

### Data fetched per call

**Phase 1 (parallel):**
1. All `products` where `status == 'active'`
2. All `children` (peer pool derivation)
3. All `reviews` — stats + `reviewId→productId` mapping
4. `user_product_actions` for current user
5. `user_product_actions` last 7 days (trend)

**Phase 2 (parallel, depends on Phase 1):**
6. `user_product_actions` clicks for same-stage peers (chunked)
7. `user_product_actions` all actions for similar-child peers (chunked)
8. `review_likes` for all fetched reviewIds (chunked) — `reviewLikeScore`
9. `product_click_logs` resolved entries (`stayedLongEnough in [true,false]`) — `conversionScore`

### Scoring
```
score = conversionScore(0.20) + stageMatch(0.15) + peerSimilarityScore(0.15)
      + categoryMatch(0.10) + peerPopularity(0.10) + trendScore(0.10) + reviewLikeScore(0.10)
      + userBehaviorScore(0.05) + reviewScore(0.05)

stageMatch          = 1 if product.stageTags includes child.stage, else 0
categoryMatch       = 1 if product.categoryTags ∩ child.categoryTags ≠ ∅, else 0
peerPopularity      = clickCount / maxClickCount  (normalized 0–1, same-stage peers)
userBehaviorScore   = interactionCount / maxInteractionCount  (current user, normalized)
reviewScore         = f(avgRating, reviewCount, verifiedRatio)  (normalized 0–1)
peerSimilarityScore = sum(similarity × actionWeight) across similar-child peers  (normalized)
trendScore          = sum(actionWeight × recencyWeight) for last 7 days  (normalized)
reviewLikeScore     = Σ(like × recency × quality × similarity), log-scaled, normalized 0–1
conversionScore     = goodClicks/totalClicks from product_click_logs, normalized 0–1
```

Returns top 20 by score.

**Known issue:** `child.categoryTags` is not a field on child documents (see `children` schema above). `categoryMatch` always evaluates to 0 in current data. Category-based matching is not actually functional.

---

## Product Registration Flow

**File:** `src/utils/registerCoupangProduct.js`

```
Input: Coupang URL string
  ↓
extractProductGroupId()  — regex /\/v[mp]\/products\/(\d+)/i  → productGroupId
extractItemId()          — regex /[?&]itemId=(\d+)/i         → itemId (optional)
  ↓
Firestore: setDoc products/{productGroupId}  (create or merge; identity = productGroupId)
  ↓
Firestore: setDoc products/{productGroupId}/offers/{autoId}
           offerId = productGroupId_itemId | autoId
           + productGroupId field
  ↓
fetchCoupangProductMetadata(productGroupId)  [MOCK — returns deterministic fake data]
  ↓
updateDoc products/{productGroupId}  — writes name/brand/category/price/image
  ↓
generateProductTags({ name, category })  — keyword matching
  ↓
updateDoc products/{productGroupId}  — writes stageTags/categoryTags/problemTags
  ↓
return { ok: true, productGroupId }
```

**Tag generation** (`productTagService.js`) is keyword-based, Korean + English. Maps to one of: `diaper`, `feeding`, `bath`, `play`, `outing`, `general`.

---

## Cloud Functions

**File:** `functions/index.js`
**Deployed to:** `us-central1`

### `fetchCoupangProduct` (HTTPS callable)
- Input: `{ productId: string }`
- Fetches `https://m.coupang.com/vm/products/{productId}` with iPhone UA
- Extracts `<title>` tag, strips " : 쿠팡" suffix
- Returns: `{ name: string, price: null, isOutOfStock: false }`
- **Note:** This function exists and is deployed but is not called anywhere in the current mobile client. `registerCoupangProduct.js` uses the local mock service instead.

---

## Authentication Flow

```
App mounts
  → useAuthSync() called once
  → if !auth.currentUser → signInAnonymously()
  → onAuthStateChanged listener
      → on user: createOrUpdateUserProfile({ userId, email, provider, role: 'user' })
```

All Firestore writes that need `userId` fall back to `auth.currentUser?.uid` if not explicitly passed. No Firestore security rules are documented or enforced in this repo.

---

## Known Gaps (Implemented but Broken/Incomplete)

| Issue | Location | Impact |
|---|---|---|
| Akamai may block `vm/v4` from GCP | `functions/index.js` | If blocked, HTML fallback is used — price extraction depends on HTML structure |
| `ProductDetail` is a stub | `screens/ProductDetail.js` | No product data shown |
| `offers` always price=0 | `registerCoupangProduct.js:68` | Price tracking non-functional |
| `dueDate` always null | `ChildAddScreen.js:81` | Pregnancy due date not stored |
| `src/components/` all empty | — | No reusable components exist |
| `src/domain/children/` empty | — | Planned but unused directory |
| `src/domain/recommendation/` empty | — | Planned but unused directory |
