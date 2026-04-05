# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MomDeal is a **data-driven parenting commerce platform** (React Native / Expo) that recommends baby products based on child growth stage data. The core value: parents register their child's data → the app recommends relevant products based on developmental stage and peer behavior.

Firebase project ID: `momdeal-494c4`

## Commands

```bash
# Start development server
npm start

# Run on device/emulator
npm run android
npm run ios

# Deploy Cloud Functions
cd functions && npm run deploy

# Run Functions emulator locally
cd functions && npm run serve
```

## Architecture

### Navigation Structure (App.js)
Bottom tab navigator with 4 tabs, each with its own stack navigator:
- **추천 (PriceStack)**: `Tab1_ProductList` → `ProductDetail` — recommendation feed based on child's stage
- **상품 (ProductStack)**: `ProductListScreen` → `ProductRegister` / `ProductDetail` — browse and register products
- **아이 (ChildStack)**: `ChildListScreen` → `ChildAddScreen` — manage child profiles
- **커뮤니티**: placeholder (not yet implemented)

### Auth
`useAuthSync` hook (called once in `App.js`) signs users in anonymously on first launch and syncs the profile to Firestore `users/{uid}`.

### Firestore Collections
| Collection | Purpose |
|---|---|
| `users/{userId}` | User profiles (email, provider, role) |
| `children/{childId}` | Child profiles with computed `ageMonth` + `stage` |
| `products/{productId}` | Products with `stageTags`, `categoryTags`, `status` |
| `products/{productId}/offers` | Price snapshots per mall |
| `user_product_actions` | Click/interaction events for peer signal |
| `recommendations` | (planned) pre-computed recommendations |
| `reviews` | (planned) community reviews |

### Recommendation Engine (`src/services/recommendationService.js`)
Scores products using three signals combined client-side:
- `stageMatch * 0.4` — product's `stageTags` contains child's `stage`
- `categoryMatch * 0.3` — product's `categoryTags` intersects child's `categoryTags`
- `peerPopularity * 0.3` — normalized click count from users with children at the same stage (`user_product_actions` collection)

### Child Stage System (`src/domain/child/childStageUtils.js`)
`buildChildComputedFields({ type, birthDate })` derives `ageMonth` and `stage`. Stages:
`pregnancy` → `newborn` (0–2m) → `early_infant` (3–5m) → `infant` (6–11m) → `toddler` (12–23m) → `early_child` (24–36m) → `child`

### Product Registration Flow (`src/utils/registerCoupangProduct.js`)
1. Extract `productId` from Coupang URL (regex `/\/v[mp]\/products\/(\d+)/i`)
2. Create/update `products/{productId}` document in Firestore
3. Add offer snapshot to `products/{productId}/offers`
4. Fetch metadata via `productMetadataService` (currently mock — real API not yet integrated)
5. Generate `stageTags`/`categoryTags`/`problemTags` via `productTagService`

### Cloud Functions (`functions/index.js`)
- `fetchCoupangProduct` (HTTPS callable): scrapes Coupang mobile page to extract product title. Currently returns only `name`; `price` is always `null`.
- Node 24, deployed to `us-central1`

### Key Service Files
| File | Role |
|---|---|
| `src/firebase/config.js` | Firebase init, exports `db`, `auth`, `functions` |
| `src/services/firestore/userRepository.js` | `createOrUpdateUserProfile` |
| `src/services/firestore/childrenRepository.js` | `createChild`, `getChildrenByUserId`, `updateChild` |
| `src/services/productMetadataService.js` | Mock Coupang metadata (MVP stub) |
| `src/services/productTagService.js` | `generateProductTags` — keyword-based tag assignment |
| `src/services/productActionService.js` | `recordProductAction` — writes click events |

## Development Rules (from docs/MOMDEAL_TASK_PIPELINE.md)

1. Do not delete existing code
2. Implement features in phase order (User → Child → Product → Registration → Recommendation → Community → Ranking → Expansion)
3. Do not arbitrarily change the data structure
4. Any DB schema changes must be explicitly documented

---

## Product Model Rules

- `productGroupId` = product identity — must equal the Firestore document ID
- `optionId` = option identity — normalized key (e.g. `"stage3_56"`), never `itemId`
- `offerId` = seller-level identity — `productGroupId_itemId`

- `options[]` = structure only: `{ optionId, name }` — no price, no seller info
- `offers[]` = purchase data: `{ offerId, optionId, price, affiliateUrl, sellerType, deliveryType, isRocket, score }`

## Recommendation Rules

- Recommendation operates at **product level only** (`productGroupId`)
- Each `productGroupId` must appear **at most once** in any recommendation list
- Do NOT expose multiple options inside a recommendation entry

- Every recommendation item must resolve a `representativeOption` (via `selectRepresentativeOption`)
- Every recommendation item must resolve a `representativeOffer` for that option (via `selectRepresentativeOffer`)

## Scoring Rules

- `productScore` ≠ `optionScore` — they are separate signals with separate purposes

- `productScore` uses:
  - `reviewScore`
  - `conversionScore`
  - `trendScore`

- `optionScore` uses:
  - `conversionCount`
  - `trackingCount`
  - `clickCount`

- Price is a **secondary signal only** (used for offer selection, not product ranking)
- NEVER rank products by cheapest price

## Data Rules

- Reviews (`reviews/{reviewId}`) belong to `productGroupId` only
- NEVER attach a review to an `optionId`

- `optionStats` is **behavioral data only** (`clickCount`, `conversionCount`, `trackingCount`)
- `reviewCount` inside `optionStats` must NOT be used as an option satisfaction signal

## Hard Constraints

- Do NOT merge product documents by name
- Do NOT use `itemId` as option identity
- Do NOT rank by cheapest price first
- Do NOT create duplicate product documents for the same `productGroupId`

## Current Status
- Phases 1–5 are implemented (User, Child, Product, Registration, basic Recommendation)
- `productMetadataService` is still a **mock** — real Coupang API integration is pending
- Community tab is a placeholder
- `src/domain/children/` and `src/domain/recommendation/` directories exist but are empty
- `src/components/recommendation/` directory exists but is empty
