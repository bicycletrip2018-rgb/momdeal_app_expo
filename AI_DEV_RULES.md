# AI_DEV_RULES.md

Rules for AI assistants working in this repository. Follow these exactly.

---

## Hard Rules

1. **Do not delete existing code.** Refactor only if explicitly requested.
2. **Do not change Firestore field names** without updating `PROJECT_ARCHITECTURE.md` and noting it in the task.
3. **Do not skip phases.** Development order is defined in `docs/MOMDEAL_TASK_PIPELINE.md`. Phases 1–5 are done. Phase 6 (Community) is current.
4. **Do not add new Firestore collections** without documenting schema in `PROJECT_ARCHITECTURE.md`.
5. **Do not wire real external APIs** (Coupang scraping, payment, etc.) without explicit instruction.

---

## Code Conventions

### File placement
| Type | Location |
|---|---|
| Screen components | `src/screens/` |
| Reusable UI components | `src/components/` |
| Firebase read/write logic | `src/services/firestore/` |
| Non-Firestore service logic | `src/services/` |
| Pure domain logic (no Firebase) | `src/domain/` |
| One-off orchestration utilities | `src/utils/` |
| Firebase init only | `src/firebase/config.js` |

### Firestore access
- Always import `db`, `auth`, `functions` from `src/firebase/config.js`
- Never call `getFirestore()` or `initializeApp()` outside `config.js`
- Use `auth.currentUser?.uid` as userId fallback — do not assume auth is always ready

### Child stage logic
- Never compute `ageMonth` or `stage` inline in screens or services
- Always use `buildChildComputedFields({ type, birthDate })` from `src/domain/child/childStageUtils.js`
- Never store `ageMonth` or `stage` directly from client input — always derive

### Product registration
- The canonical entry point is `registerCoupangProduct(url)` in `src/utils/registerCoupangProduct.js`
- `productId` is always the Coupang numeric ID string extracted from URL
- `products/{productId}` uses the Coupang productId as the Firestore doc ID

### Recommendation scoring
- Scoring logic lives only in `src/services/recommendationService.js`
- Scoring weights: stageMatch=0.4, categoryMatch=0.3, peerPopularity=0.3
- Do not add scoring signals without updating the weights and `PROJECT_ARCHITECTURE.md`

---

## What is Mock / Stub (Do Not Treat as Real)

| File | Status | What's fake |
|---|---|---|
| `src/services/productMetadataService.js` | MOCK | All returned data is deterministic fake — name/brand/category/price derived from productId digits |
| `functions/index.js` fetchCoupangProduct | PARTIAL | Returns real `name` scraped from `<title>`, but `price` is always `null` |
| `src/screens/ProductDetail.js` | STUB | Does not fetch or display real product data |
| `offers` price field | STUB | Always written as `0` |

---

## Patterns to Follow

### Screen data loading
Follow the pattern in `ChildListScreen.js` and `ProductListScreen.js`:
- `useCallback` for fetch function
- `useEffect` for initial load
- `useFocusEffect` only if the list must refresh on tab return (see `ProductListScreen.js`)
- Separate `loading` and `refreshing` states
- `errorMessage` string state, not thrown errors

### Form screens
Follow `ChildAddScreen.js`:
- `saving` boolean state to disable submit during async
- `Alert.alert` for validation and success/error feedback
- Parse and validate before calling repository

### Action recording
After any user interaction with a product:
```js
await recordProductAction({ userId: auth.currentUser?.uid, productId, actionType: 'click' | 'purchase' });
```

---

## Schema Change Protocol

If you add or rename a Firestore field:
1. Update the schema table in `PROJECT_ARCHITECTURE.md`
2. Update the normalizer in the relevant repository file (e.g. `normalizeChildPayload` in `childrenRepository.js`)
3. Note the change explicitly in your response — do not make schema changes silently
