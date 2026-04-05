# NEXT_STEPS.md

Prioritized task list. Price extraction is explicitly out of scope for MVP.

---

## Phase Status

| Phase | Name | Status |
|---|---|---|
| 1 | User System | ✅ Done |
| 2 | Child Data System | ✅ Done |
| 3 | Product Core System | ✅ Done |
| 4 | Product Registration | ✅ Done |
| 5 | Recommendation Engine | ✅ Done (client-side scoring, all signals active) |
| 6 | Community System | ⬜ Not started |
| 7 | Recommendation Ranking | ⬜ Not started |
| 8 | Platform Expansion | ⬜ Not started |

---

## ✅ Completed

- `categoryMatch` signal fixed — `categoryTags` now written on `createChild` / `updateChild`
- `productMetadataService` wired to real Cloud Function (`fetchCoupangProduct`)
- `image` field flows from CF → Firestore on product registration
- Coupang Partners API HMAC integration ready (awaiting API keys in `functions/.env`)

---

## Priority 1 — Recommendation Feed UI

**Current state:** `Tab1_ProductList.js` renders a plain list of text cards. No sections, no score visibility, tapping a card only records a click — no navigation.

**What to build:**
- Section layout: "추천 상품" (scored list) + "인기 상품" (trending) + "최근 등록" (recently added)
- Each card: name, price, category badge, score indicator (optional)
- Tap navigates to `ProductDetail` screen (currently not wired)
- Empty state when no child is registered: prompt to add a child

**New Firestore queries needed:** none — trending and recent can be derived from existing `products` collection using `orderBy('updatedAt', 'desc')` and click count from `user_product_actions`.

**Files:** `src/screens/Tab1_ProductList.js`, new `src/services/trendingService.js`

---

## Priority 2 — Trending Products

**What it is:** Products sorted by total click count across all users in the last N days.

**Query:** `user_product_actions` where `actionType == 'click'`, group by `productId`, sort by count descending.

**Note:** Firestore has no server-side `GROUP BY`. This must be done client-side by fetching recent actions and aggregating, or pre-computed in a scheduled Cloud Function.

**MVP approach:** Client-side aggregation of the last 7 days of click actions. Works at small scale.

**Files:** `src/services/trendingService.js` (new)

---

## Priority 3 — Recently Added Products

**What it is:** Products ordered by `createdAt` descending. No new logic needed — just a new query.

**Query:** `collection('products'), where('status', '==', 'active'), orderBy('createdAt', 'desc'), limit(10)`

**Files:** Add to `src/services/trendingService.js` or inline in `Tab1_ProductList.js`

---

## Priority 4 — Product Detail Screen

**Current state:** `ProductDetail.js` is a stub — shows only the name passed via route params, purchase button shows an alert.

**What to build:**
- Fetch `products/{productId}` document on mount
- Display: name, brand, category, `currentPrice`, `stageTags`, `image` (when available)
- Fetch `products/{productId}/offers` subcollection — show most recent offer price + `isOutOfStock`
- Purchase button: open `offer.url` via `expo-linking` instead of showing alert
- Record `purchase` action (already in place)

**Files:** `src/screens/ProductDetail.js` only

---

## Priority 5 — User Interaction Tracking

**Current state:** `recordProductAction` writes `click` and `purchase` events to `user_product_actions`. The `추천` tab records `click` but does not navigate. The `ProductDetail` screen records `purchase` but it fires on button press regardless of whether the user actually went to the purchase URL.

**What to improve:**
- Wire tap in `Tab1_ProductList` to navigate to `ProductDetail` AND record `click` (currently only records, no navigation)
- Record `click` in `ProductListScreen` (currently no action recorded when browsing 상품 tab)
- Record `purchase` only after `Linking.openURL` succeeds (not before)
- Add `view` action type: record when `ProductDetail` mounts (impression tracking)

**Files:** `src/screens/Tab1_ProductList.js`, `src/screens/ProductListScreen.js`, `src/screens/ProductDetail.js`

---

## Technical Debt (Non-Blocking)

| Issue | Location | Notes |
|---|---|---|
| Price always 0 | `offers` subcollection | Intentionally deferred — not MVP |
| `dueDate` always null | `ChildAddScreen.js` | Add date picker for pregnancy type |
| No Firestore security rules | Firebase console | Anonymous users can read/write everything |
| Recommendation runs fully client-side | `recommendationService.js` | Fine for MVP |
| `src/components/` empty | — | Extract `ChoiceChip` from `ChildAddScreen.js` |
