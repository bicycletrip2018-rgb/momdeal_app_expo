# TASK.md

MomDeal 개발 태스크 현황. 실제 구현 상태 기준으로 기록한다.

---

## Phase 상태 요약

| Phase | Name | Status |
|---|---|---|
| 1 | User System | ✅ 완료 |
| 2 | Child Data System | ✅ 완료 |
| 3 | Product Core System | ✅ 완료 |
| 4 | Product Registration | ✅ 완료 |
| 5 | Recommendation Engine | ✅ 완료 |
| 6 | Community System | 🔄 부분 완료 (리뷰 기능 구현, 피드/토론 미구현) |
| 7 | Recommendation Ranking | ⬜ 미착수 |
| 8 | Platform Expansion | ⬜ 미착수 |

---

## ✅ 완료된 태스크

### Phase 1–5 기반 시스템
- [x] 익명 Firebase Auth + Firestore 사용자 프로필 동기화 (`useAuthSync`)
- [x] 아이 등록/목록/수정 (`ChildListScreen`, `ChildAddScreen`, `childrenRepository`)
- [x] 아이 성장 단계 계산 (`childStageUtils.buildChildComputedFields`)
- [x] `categoryTags` 아이 문서에 저장 (categoryMatch 신호 활성화)
- [x] 쿠팡 URL → 상품 등록 파이프라인 (`registerCoupangProduct`)
- [x] Cloud Function `fetchCoupangProduct` 배포 (실제 title 스크래핑, price=null)
- [x] `productMetadataService` → Cloud Function 연결 (image 필드 흐름 완성)

### 추천 피드 UI
- [x] `Tab1_ProductList` 3섹션 레이아웃: 아이에게 추천 / 인기 상품 / 최근 등록
- [x] `trendingService.js`: `getTrendingProducts`, `getRecentlyAddedProducts`
- [x] `ProductCard` 인라인 컴포넌트 (이미지, 이름, 카테고리, 가격)
- [x] 상품 탭 navigation 연결 (`ProductDetail` 화면 이동)

### 추천 엔진 V3
- [x] V1: stageMatch · categoryMatch · peerPopularity
- [x] V2: + reviewScore · userBehaviorScore
- [x] V3: + peerSimilarityScore (아이 유사도 알고리즘) · trendScore (7일 recency 가중)
- [x] `scoreBreakdown` 반환 포맷
- [x] `buildRecommendationReasons(scoreBreakdown)` — 추천 이유 배지 생성
- [x] 추천 카드에 이유 배지 표시 (최대 2개)

### 소셜 증거 UI
- [x] `fetchSocialProof`: 리뷰 통계 + 또래 클릭 수 + 가격 이력 병렬 조회
- [x] 추천 카드: 별점 · 구매 인증 리뷰 수 · 또래 클릭 수 · 🔥 인기 상승 배지

### 리뷰 시스템 (Phase 6 부분)
- [x] `reviewService.js`: `getReviews`, `submitReview`, `checkVerifiedPurchase`
- [x] `ReviewWriteScreen`: 별점 선택, 텍스트 입력, 구매 인증 자동 판별
- [x] `ProductDetail` 리뷰 섹션: 평균 별점, 리뷰 목록, 리뷰 작성 버튼
- [x] 리뷰 작성 후 돌아오면 목록 자동 갱신 (navigation focus listener)

### 저장(위시리스트) 기능
- [x] `saveService.js`: `getSavedProducts`, `toggleSavedProduct`
- [x] `ProductCard` 북마크 ☆/★ (낙관적 업데이트 + 롤백)
- [x] `ProductDetail` 헤더 북마크 (`navigation.setOptions`)
- [x] `SavedProductsScreen`: 저장 상품 목록, 카드 탭 → 상세, 북마크 탭 → 제거
- [x] `SavedStack` + 저장 탭 (하단 탭 5번째)
- [x] 탭 포커스 시 목록 자동 갱신

### 가격 추적 시스템
- [x] `priceTrackingService.js`: `recordPrice`, `getPriceHistory`, `getLowestPrice`, `getPriceChange`, `getPriceIntelligence`
- [x] 상품 등록 시 `recordPrice` fire-and-forget 호출
- [x] `getPriceIntelligence`: 최근 30개 기준 최저/최고/평균/퍼센타일/구매 가이던스 계산

### 가격 인텔리전스 UI (ProductDetail)
- [x] `PriceGraph` 바 차트 (평균 이하: 초록, 초과: 빨강)
- [x] 가격 분석 섹션: 최저가 · 평균가 · 최고가 · 현재가 위치 퍼센타일 바
- [x] 구매 가이던스 배지: 지금 구매 추천 / 평균보다 높은 가격 / 최근 최고가 근처
- [x] 최근 변동 표시: ▼ 하락 (초록) / ▲ 상승 (빨강) / 변동 없음

### 가격 알림 준비 (SavedProductsScreen)
- [x] `priceAlertService.js`: `getSavedProductsWithPriceSignals` (저장 상품 + 가격 신호 병합)
- [x] `isGoodDeal` 계산 (guidance === '지금 구매 추천' OR currentPrice ≤ avg * 0.95)
- [x] 저장 카드: 🔥 ₩N 하락 배지 · 구매 가이던스 배지 · 지금 살만한 가격 칩 · 최저가 표시

### 가격 알림 시스템 (price_alerts 컬렉션)
- [x] `priceAlertService.js`: `createPriceAlert`, `getPriceAlertStatus`, `togglePriceAlert`, `checkPriceAlerts` (mock 알림)
- [x] `registerCoupangProduct`: 상품 등록 후 `checkPriceAlerts` fire-and-forget 호출
- [x] `Tab1_ProductList`: 저장 시 `createPriceAlert` 자동 생성 (fire-and-forget)
- [x] `ProductDetail`: 알림 상태 fetch + "가격 떨어지면 알림 받기" ON/OFF 토글 UI
- [x] `ProductDetail`: 저장 시 `createPriceAlert` 자동 생성
- [x] `SavedProductsScreen`: 저장 카드에 🔔/🔕 알림 상태 표시

### 구매 결정 UI (추천 카드)
- [x] `isRecommended` prop → 추천 섹션 전용 구매 결정 UI 활성화
- [x] 가격 행: 현재가 + 최저가 인라인 표시
- [x] 액션 버튼: **지금 구매하기** (isGoodDeal) / **가격 더 보기** (그 외)
- [x] **🔥 지금 사는 타이밍** 배지: priceDrop > 0 + guidance=지금 구매 추천 + 또래 클릭 상위 30%
- [x] `scrollToPurchase` 파라미터: ProductDetail에서 구매 버튼으로 자동 스크롤

---

## 🔄 다음 우선순위

### Phase 6 — Community System (미완료 항목)
- [x] 커뮤니티 탭 피드 화면: `CommunityFeedScreen` + `communityService.getRecentReviews` + `CommunityStack` in App.js
- [x] 좋아요 UI: `ReviewCard` 좋아요 버튼 + 카운트 + 댓글 placeholder + 구매인증 카드 하이라이트
- [x] 좋아요 Firestore 연동: `review_likes` 컬렉션, `reviewLikeService.js` (`toggleLike`, `getLikeStatus`, `getLikeCount`, `getBulkLikeData`), 낙관적 업데이트 + 롤백
- [x] 추천 엔진 좋아요 신호: `reviewLikeScore × 0.10` 추가 (Phase 2 병렬 fetch, 가중치 재조정: userBehaviorScore·reviewScore → 0.05씩)
- [x] 추천 엔진 전환 신호: `conversionScore × 0.20` 추가 (product_click_logs goodClicks/totalClicks, Phase 2 병렬 fetch, 가중치 재조정)
- [ ] 포토 리뷰 (이미지 업로드, Firebase Storage 연동)
- [ ] 커뮤니티 게시글 / 질문 기능
- [ ] `reviews` 컬렉션 `images` 필드 활성화

### 쿠팡 API 통합 구조 (수익화 준비)
- [x] `coupangService.js`: `searchProducts`, `getRecoProducts`, `createDeeplink` (MOCK, 실제 API 모양 반환)
- [x] `createDeeplink`: userId + productId + trackingId 포함 딥링크 구조
- [x] `logProductClick`: `product_click_logs` 컬렉션에 클릭 이벤트 기록 (실제 Firestore 쓰기)
- [x] `normalizeCoupangProduct`: 쿠팡 상품 → 내부 product 형태 변환 어댑터
- [x] `mergeInternalAndCoupangRecommendations`: 추천 피드 통합 stub (Phase 7에서 완성)
- [ ] `_callCoupangAPI` HMAC-SHA256 인증 실제 구현 (API 키 대기 중 — `functions/.env`)
- [ ] `product_click_logs` → Coupang conversion webhook 매핑

### 상품 가격 실제 연동
- [ ] Cloud Function에서 실제 가격 추출 (현재 항상 null 반환)
- [ ] Coupang Partners API 연동 (HMAC 준비 완료, API 키 대기 중 — `functions/.env`)
- [ ] `offers` price 필드 실제 값 업데이트

### Push 알림 (가격 알림)
- [x] `priceAlertService` 기반 가격 하락 감지 로직 (`checkPriceAlerts` — 현재 mock console.log)
- [ ] FCM 토큰 저장 (`users/{userId}` 문서)
- [ ] `checkPriceAlerts` → 실제 FCM 푸시 알림 발송으로 교체
- [ ] Cloud Function 스케줄러: 저장 상품 가격 주기적 체크

---

## ⬜ 미착수 Phase

### Phase 7 — Recommendation Ranking
- [ ] 서버사이드 추천 점수 사전 계산 (Scheduled Cloud Function)
- [ ] `recommendations/{docId}` 컬렉션 생성 및 스키마 정의
- [ ] 클라이언트 추천 로직 → 사전 계산 결과 조회로 교체

### Phase 8 — Platform Expansion
- [ ] 교육 카테고리 확장
- [ ] 건강 / 여행 카테고리
- [ ] B2B / 정부 서비스 연계

---

## 🔧 기술 부채

| 항목 | 위치 | 비고 |
|---|---|---|
| `dueDate` 항상 null | `ChildAddScreen.js` | 임신 유형 날짜 피커 미구현 |
| Firestore 보안 규칙 없음 | Firebase 콘솔 | 익명 사용자가 전체 읽기/쓰기 가능 |
| `productMetadataService` Mock | `src/services/productMetadataService.js` | 실제 API 연동 전까지 가짜 데이터 반환 |
| `src/components/` 비어 있음 | — | `ChoiceChip` 등 재사용 컴포넌트 미추출 |
| `src/domain/children/` 비어 있음 | — | 계획된 디렉토리, 미사용 |
| `src/domain/recommendation/` 비어 있음 | — | 계획된 디렉토리, 미사용 |
| 추천 엔진 완전 클라이언트 실행 | `recommendationService.js` | MVP 범위 내 허용, Phase 7에서 서버 이전 |
