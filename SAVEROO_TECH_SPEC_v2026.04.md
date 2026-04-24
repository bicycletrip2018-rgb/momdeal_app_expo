   # 🚀 [SAVEROO SYSTEM CORE DIRECTIVE & TECH SPEC v2026.04]
## 세이브루 프로젝트 기술/기획 통합 명세서

**최종 업데이트:** 2026-04-20 (rule.html 대화 기록 분석 기준)
**대화 기간:** 2026-03-24 ~ 2026-04-16 (약 3주 반, 932개 대화 블록, 647만 자)
**원본 소스:** rule.html (Gemini MyActivity) + CLAUDE.md + momdeal_master_spec.txt + history.txt

---

## 🔴 0. 이 문서를 읽는 AI가 반드시 지켜야 할 메타 규칙

1. **본 문서는 모든 개발/기획 지시 중 1순위로 병합(Merge)되어야 한다.**
2. **기존에 확정된 값/수식/규칙은 절대 추론·창작·축소로 덮어쓰지 않는다.** 누락 항목은 `[기획자 확인 필요]`로 태깅.
3. **서비스명은 "세이브루(SAVEROO)"로 고정.** Firebase 프로젝트 ID만 `momdeal-494c4` (legacy, 변경 불필요).
4. **"맘딜(MOMDEAL)"은 구 프로젝트명.** 대화 기록 내 `MOMDEAL TECH SPEC` 언급은 모두 `SAVEROO TECH SPEC`과 동일어로 처리.
5. **규칙을 축약하거나 함축적으로 표현하지 말 것.** 4월 16일자 대화에서 기획자가 명시적으로 지적했듯, 디테일한 로직은 원형 그대로 유지해야 한다.

---

## 📌 1. SERVICE DEFINITION (사업/서비스 정의)

### 1.1 정체성
- **아이덴티티:** 육아/생필품 쿠팡 상품을 단순 나열하는 앱이 **아니라**, "구매 결정을 도와주는 **판단 보조 엔진**" (Decision Assistant App)
- **핵심 가치 3축:**
  1. **"지금 사도 되는지?" 판단 보조** — 가격 추이 그래프로 현재 가격이 최저가 대비 어떤 위치인지 시각화
  2. **"비슷한 부모들은 뭘 사지?" 신뢰 형성** — 동년배(same-stage) 부모 행동 데이터 기반 peerScore
  3. **"이거 써본 사람 얘기 좀" 커뮤니티 연계** — 게시글 내용 기반 연관 상품 자동 매칭 (Context-to-Commerce)

### 1.2 수익 구조
- **1순위:** 쿠팡 파트너스 API 제휴 커미션
- **확장 계획:** 네이버(스텁 준비됨), 11번가(스텁 준비됨), 마켓컬리 등 다중 마켓
- **보조:** 시크릿 딜(게이미피케이션 잠금 해제), 리뷰 기반 프리미엄 (미확정)

### 1.3 핵심 KPI
- **CTR** (클릭률): 추천 → 상세 진입
- **Purchase Click CTR**: 상세 → `product_purchase_click` 발생률
- **Retention** (재방문율): D1/D7/D30
- **보조 KPI:** 관심상품 등록 수, 커뮤니티 게시글 수, 실구매 인증(주문번호 제출) 수

### 1.4 타겟 유저
- **주 타겟:** 3040 엄마 (임신~만 8세 미만 자녀 양육)
- **초기 마케팅 톤:** "동네에서 정보력 제일 좋은, 엑셀로 가계부 쓰는 야무진 육아 선배"
- **채널:** 네이버 블로그(SEO) + 인스타 쓰레드(공감 후킹)

---

## 🔴 2. ABSOLUTE RULES (절대 규칙 - 상세 논리 정의서)

> **주의:** 이 5개 규칙은 2026-04-16 기획자가 명시적으로 "축약 금지, 원문 그대로 복원"을 요구한 항목이다. 단 한 글자도 수정·삭제하지 말 것.

### RULE-01 | 개발 및 테스트 환경 통제 (Expo Go 원천 차단)
- **조건:** 로컬 테스트 서버 구동 시
- **로직:** `npx expo start` 기본 명령어 사용을 Lock(잠금) 처리한다.
- **강제 실행:** 반드시 `npx expo start --dev-client -c` 를 사용하여 커스텀 네이티브 코드가 포함된 물리 기기(SM_S926N) 디버깅 환경을 강제한다.
- **금지:** Expo Go의 개입은 어떠한 경우에도 허용하지 않는다.

### RULE-02 | 외부 앱 딥링크(Deep Link) 라우팅 무결성
- **조건:** `[쿠팡 앱 접속하기]` 등 외부 상품 이동 버튼 트리거 시
- **로직:** `Linking.openURL('coupang://')` 프로토콜만 **단일 허용**한다.
- **예외 처리:** Promise가 `catch` 로 빠질 경우(앱 미설치), 웹 브라우저(`https://m.coupang.com`)로의 우회(Fallback)를 **절대 금지**한다.
- **강제 대안:** 웹 로그인 유실 및 이탈 방지를 위해 반드시 Native Alert (`Alert.alert('안내', '쿠팡 앱이 설치되어 있지 않습니다...')`)를 통해 앱 설치를 유도한다.
- **주의:** history.txt 초기 구현(4월 5일 이전)에는 `try { coupang:// } catch { m.coupang.com }` 웹 fallback이 있었으나, **4월 16일자 절대규칙 확정 이후 웹 fallback은 완전 금지로 변경됨.** 최신 규칙이 우선.

### RULE-03 | 온보딩 데이터 선택의 상호 배제(Mutually Exclusive) 로직
- **조건:** 온보딩 마지막 단계 고민 카테고리 Chip 토글 시 (`selectedConcerns` 배열)
- **로직 A — '없음' 선택 시:** 상태 관리 중인 배열 `selectedConcerns` 을 **즉시** 빈 배열 `[]` 로 `clear` 한 후 '없음' 단일 항목만 Push한다.
- **로직 B — '없음' 선택 상태에서 다른 카테고리 추가 선택 시:** '없음' 항목을 즉시 제거(제외)하고 새 항목을 배열에 Push하여 데이터 논리적 모순을 차단한다.
- **의미:** 고민 데이터는 "고민이 없는 유저"와 "고민이 있는 유저"가 동시에 공존할 수 없음.

### RULE-04 | 무거운 에셋(Heavy Asset) 취급 및 UI 렌더링 최적화
- **비디오 금지:** `expo-av` 라이브러리 및 `.mp4` 확장자를 통한 로컬 비디오 플레이어 로드를 **원천 금지**한다. (번들링 타임아웃 및 메모리 초과 에러 방지)
- **대체 로직:** 모든 튜토리얼은 `.gif` 로 변환하여 React Native 기본 `<Image>` 컴포넌트로 렌더링한다.
- **강제 조건:** 레이아웃 붕괴(Blank Space) 차단을 위해 컴포넌트에 반드시 **명시적인 `width`, `height` 절대값을 주입**한다.
- **표준 스펙 (관심상품 튜토리얼 GIF):** `style={{ width: 260, height: 340, alignSelf: 'center', resizeMode: 'contain' }}`

### RULE-05 | 클립보드 매직 넛지 (Clipboard Magic Nudge) 핵심 전환 로직
- **조건:** 앱의 라이프사이클이 `background` 에서 `active` 로 전환될 때 (`AppState` 리스너 활용)
- **로직:** `Clipboard.getStringAsync()` 를 호출하여 정규식(Regex)으로 시스템 클립보드 내 `coupang.com` 관련 URL 패턴 존재 여부를 검사한다.
- **URL 허용 도메인:** `https://www.coupang.com`, `https://link.coupang.com`, `https://m.coupang.com`
- **트리거:** 조건 부합 시, 즉각적으로 "추적할까요?" 모달/토스트를 **화면 최상단(Z-index 최상위)에 강제 팝업** 시켜 상품 등록(Hooking) 플로우로 유저를 이동시킨다.
- **무한 루프 방지:** 팝업이 뜬 직후 `Clipboard.setStringAsync('')` 로 클립보드를 비워 동일 URL 중복 감지를 차단한다.
- **구현 위치:** `src/hooks/useMagicOnboarding.js` 커스텀 훅으로 분리. `HomeScreen.js` 에서 호출.
- **반환값:** `{ showNudge: boolean, detectedUrl: string }`

### [추가 파생 규칙 - CLAUDE.md 및 대화에서 복원]

### RULE-06 | 코드 무결성
- 기존 코드 삭제 금지. 덮어쓰기(overwrite) 금지. 반드시 **Append 또는 Patch** 방식으로 수정.
- Phase 순서 준수: User → Child → Product → Registration → Recommendation → Community → Ranking → Expansion.
- DB 스키마 임의 변경 금지. 변경 필요 시 명시적으로 문서화.

### RULE-07 | API 키 보안
- **쿠팡 등 외부 API 키는 앱(client, `src/`)에 절대 노출 금지.**
- **모든 외부 API 요청은 Firebase Functions를 경유해야 한다.** (HMAC-SHA256 서명 포함)
- 키 저장 위치: `functions/.env` (EXPO_PUBLIC_COUPANG_* 환경변수는 Functions 내부에서만 읽기).

### RULE-08 | 식별자(ID) 규칙
- `productGroupId` = 상품 식별자. **Firestore 문서 ID와 반드시 동일**해야 한다.
- `productGroupId` 생성 공식: `{market}_{originalId}` (예: `coupang_12345`).
- `optionId` = 옵션 식별자. **`itemId` 사용 절대 금지.** 정규화된 한글명 키 사용 (예: `stage3_56`).
- `offerId` = 판매자 수준 식별자. 공식: `productGroupId_itemId`.
- 동일 `productGroupId` 에 대해 중복 문서 생성 절대 금지.
- 상품명(name)으로 문서 병합 절대 금지.

### RULE-09 | 추천 데이터 모델 규칙
- 추천은 **product level만** 작동 (`productGroupId` 단위).
- 한 추천 리스트 내 동일 `productGroupId` 는 **최대 1회만** 등장.
- 각 추천 아이템은 반드시 `representativeOption` (via `selectRepresentativeOption`) 과 `representativeOffer` (via `selectRepresentativeOffer`) 를 resolve해야 한다.
- **가격(price)은 secondary signal에 불과하다.** Offer 선택에만 사용. **제품 랭킹 기준으로 "최저가 우선" 정렬 절대 금지.**

### RULE-10 | 리뷰 귀속 규칙
- `reviews/{reviewId}` 는 **`productGroupId`에만 귀속**된다.
- `optionId` 에 리뷰를 귀속시키지 말 것.
- `optionStats` 는 **행동 데이터 전용** (`clickCount`, `conversionCount`, `trackingCount`).
- `optionStats.reviewCount` 는 옵션 만족도 신호로 사용하지 말 것.

### RULE-11 | Action Type 표준 (user_product_actions)
허용된 `actionType` (이 외 임의 생성 절대 금지):
- `product_view` — 상품 상세 진입
- `product_click` — 상품 카드 클릭
- `product_purchase_click` — 쿠팡 이동 버튼(CTA) 클릭
- `post_view` — 커뮤니티 게시글 진입
- `ranking_visit` — 랭킹 탭 방문
- `post_product_click` — 커뮤니티 게시글 내 연관 상품 클릭

---

## 🏗 3. TECH STACK & ARCHITECTURE (기술 스택 및 아키텍처)

### 3.1 Stack
| Layer | Technology |
|---|---|
| Frontend | React Native (Expo) — custom dev client only (RULE-01) |
| State | React Context (`TrackingContext`) + `useState` hooks |
| Backend | Firebase (Firestore + Functions + Auth + Storage) |
| Functions Runtime | Node 24, `us-central1` region |
| External API | Coupang Partners API (HMAC-SHA256 서명) |
| Auth | Anonymous 기본 + (추후 Kakao/Google SSO 확장) |
| Local Storage | `@react-native-async-storage/async-storage` |
| Clipboard | `expo-clipboard` |
| Physical Device (테스트) | SM_S926N (Galaxy S24) |

**Bottom Tab Navigator (5 tabs, 좌→우 순서):**
1. **홈** (`PriceStack`, 메인)
2. **랭킹** (`RankingStack`)
3. **커뮤니티** (`CommunityStack`)
4. **관심상품** (`SavedProductsStack`) — 기존 혜택 탭을 대체하여 메인 탭으로 승격.
5. **마이페이지** (`MyPageStack`)

**⚠ 탭 구조 변경 이력 (중요):**
- **초기 버전 (CLAUDE.md):** 추천 / 상품 / 아이 / 커뮤니티 (4탭)
- **중기 (history 4월 5일경):** 홈 / 랭킹 / 커뮤니티 / 마이 (4탭) + GlobalFab 플로팅
- **최종 확정 (최신):** 홈 / 랭킹 / 커뮤니티 / 관심상품 / 마이페이지 (5탭) + GlobalFab 제거

### 3.3 화면 파일 전체 목록 (`src/screens/`)
```text
AdminDashboardScreen.js          — 관리자 대시보드
BenefitsScreen.js                — (폐기/레거시) 기존 혜택 탭
CategoryDetailScreen.js          — 카테고리별 상세
ChildAddScreen.js                — 아이 등록/수정
ChildListScreen.js               — 아이 목록
CommunityFeedScreen.js           — 커뮤니티 피드
CommunityListScreen.js           — 커뮤니티 탭 메인
CurationDetailScreen.js          — 큐레이션 상세 (테마별 추천)
DetailScreen.js                  — 범용 상세
HomeScreen.js                    — 홈 탭 메인 (매직 넛지 트리거)
LevelInfoScreen.js               — 등급 안내 및 레벨 퀘스트 화면 (신설)
MyActivityScreen.js              — 내 활동 (내가 쓴 글/내 댓글) 탭 화면 (신설)
MyPageScreen.js                  — 마이 탭 메인
NotificationScreen.js            — 알림 목록
OnboardingScreen.js              — 최초 진입 온보딩
PostDetailScreen.js              — 커뮤니티 게시글 상세 (Context-to-Commerce)
ProductDetail.js                 — 상품 상세 (가격 그래프)
ProductListScreen.js             — 상품 목록
ProductRegister.js               — 상품 수동 등록
RankingScreen.js                 — 랭킹 탭 (카테고리 탭 3개)
RecentlyViewedProductsScreen.js  — 최근 본 상품 전체보기 화면 (신설)
ReviewWriteScreen.js             — 리뷰 작성
RewardClaimScreen.js             — 열쇠(포인트) 적립 신청 (마이페이지로 기능 통합 예정)
SavedProductsScreen.js           — 관심상품 탭 메인 (기존 혜택 탭 대체)
SearchResultScreen.js            — 검색 결과
SearchScreen.js                  — 검색 메인
Tab1_ProductList.js              — (레거시) 추천 피드 Hero/Medium/List
TrackingListScreen.js            — (레거시) 과거 가격 추적 리스트 -> SavedProductsScreen 으로 통합
UserProfileScreen.js             — 타 유저 프로필
WritePostScreen.js               — 게시글 작성
```

### 3.4 서비스 파일 전체 목록 (`src/services/`)
```
adminAnalyticsService.js     — 관리자 통계
analyticsService.js          — 유저 이벤트 로깅
communityService.js          — 게시글 CRUD
coupangApiService.js         — 쿠팡 API 브릿지 (Functions 호출 전용)
coupangService.js            — 쿠팡 관련 유틸
firestore/
  childrenRepository.js      — 아이 CRUD (createChild, updateChild, getChildrenByUserId)
  userRepository.js          — 유저 프로필 (createOrUpdateUserProfile)
missionService.js            — 혜택 탭 미션 로직
priceAlertService.js         — 가격 알림 구독
priceTrackingService.js      — 가격 추적 관리
productActionService.js      — user_product_actions 로깅
productMetadataService.js    — 상품 메타데이터 (초기 Mock, 추후 실 API)
productTagService.js         — stageTags/categoryTags/problemTags 자동 생성
recommendationService.js     — 추천 엔진 (핵심)
reviewLikeService.js         — 리뷰 좋아요
reviewService.js             — 리뷰 CRUD
saveService.js               — 저장/위시리스트
searchService.js             — 검색
sharingService.js            — 공유 링크 생성
trendingService.js           — 실시간 트렌딩
```

---

## 🗃 4. FIRESTORE SCHEMA (데이터베이스 스키마)

### 4.1 Collections 전체 목록

users/{userId}
├── email: string
├── provider: 'anonymous' | 'kakao' | 'google'
├── role: 'user' | 'admin'
├── nickname: string
├── selectedChildId: string | null
├── postCount: number
├── commentCount: number
├── streak_count: number          // 연속 접속일
├── level: number                 // 게이미피케이션 레벨 (Lv.N)
├── createdAt: Timestamp
└── updatedAt: Timestamp

해당 스키마는 유저의 자녀 또는 임신 정보를 담는 핵심 객체다. **[RULE-12]**에 의거하여 데이터 무결성을 유지한다.
children/{childId}
├── userId: string (parent)
├── lastName: string              // [Mutable] 성 (필수, CRM 및 개인화 푸시 알림용)
├── firstName: string             // [Mutable] 이름/태명 (필수. 단, 임신 중일 때 미입력 시 '우리 아기'로 Fallback 처리)
├── gender: 'female' | 'male'     // [Immutable] 성별 (Lock: 가입 후 변경 불가)
├── birthDate: Timestamp          // [Immutable] 생년월일 (Lock: 가입 후 변경 불가)
├── type: 'child' | 'pregnancy' | 'planning'  // [One-way] 상태 (임신 계획 -> 임신 -> 아이 전이만 가능, 역행 불가)
├── careEnvironment: string[]     // [Mutable] 주 양육 환경 (맞벌이, 독박육아, 조부모 도움 등)
├── concerns: string[]            // [Mutable] 육아 고민 (RULE-03 상호배제 적용)
├── feedingType: 'breast' | 'formula' | 'mixed' | 'unknown'
├── ageMonth: number              // [Computed] 월령
├── stage: string                 // [Computed] 발달 단계 (RULE-12 슬라이딩 윈도우 기준)
├── categoryTags: string[]        // [Computed] 관심 카테고리 태그
├── region: string                // [Mutable] 지역 (optional)
├── pregnancyWeek: number | null  // 임신 중일 때만
├── dueDate: Timestamp | null     // 임신 중일 때만
├── weight: number | null         // [Mutable] 신체 정보
└── height: number | null         // [Mutable] 신체 정보

#### 🔒 데이터 수정 권한 정책 (Edit Policy)
1. **고정 데이터 (Immutable):** gender, birthDate는 초기 입력 후 수정 페이지에서 비활성화(Disabled) 처리한다.
2. **가변 데이터 (Mutable):** lastName, firstName, careEnvironment, concerns, weight, height는 상시 수정 가능하다.
3. **상태 전이 (State Transition):** type은 '임신 계획(planning) → 임신(pregnancy) → 아이(child)' 등 앞 방향으로의 변경만 허용하며, 역행은 절대 차단한다. 출산 시 type을 변경하면 잠겨있던 gender와 birthDate 입력창이 활성화되어 1회 설정할 수 있다.

products/{productGroupId}
├── productGroupId: string        // = document ID (RULE-08)
├── market: 'coupang' | 'naver' | '11st' | ...
├── originalId: string            // 마켓별 원본 ID
├── name: string
├── status: 'active' | 'inactive' | 'pending'
├── stageTags: string[]           // 적용 가능 발달 단계
├── categoryTags: string[]        // 카테고리 (기저귀/분유/수유/...)
├── problemTags: string[]         // 해결 가능 고민 (기저귀발진/수면 등)
├── options: Array<{ optionId: string, name: string }>
├── offers: Array<Offer>          // 판매자별 오퍼
├── optionStats: {
│     [optionId]: {
│       clickCount, conversionCount, trackingCount, recency
│     }
│   }
├── boostScore: number            // 수동 노출 조정 (운영)
├── image: string                 // 썸네일 URL
└── createdAt: Timestamp

products/{productGroupId}/offers/{offerId}    // Sub-collection (가격 스냅샷)
├── offerId: string               // productGroupId_itemId
├── optionId: string
├── price: number
├── affiliateUrl: string          // 쿠팡 파트너스 딥링크
├── deliveryType: 'rocket' | 'standard' | ...
├── sellerType: 'retailer' | 'marketplace'
├── isRocket: boolean
├── isOutOfStock: boolean
├── score: number                 // offer 선택용 내부 점수
└── checkedAt: Timestamp

reviews/{reviewId}
├── productGroupId: string        // RULE-10: optionId 귀속 금지
├── userId: string
├── rating: number (1-5)
├── content: string
├── verifiedPurchase: boolean     // RewardClaim 승인 시 true
├── images: string[]
└── createdAt: Timestamp

review_likes/{userId_reviewId}    // composite doc ID
├── reviewId: string
├── userId: string
└── createdAt: Timestamp

user_product_actions/{autoId}
├── userId: string
├── productGroupId: string        // 필수 (RULE-08)
├── actionType: string            // RULE-11의 6종 중 1
├── stage: string | null          // 유저 아이의 stage (peerScore 계산용)
├── metadata: object              // 자유형 (context, position 등)
└── createdAt: Timestamp

product_click_logs/{autoId}
├── productId: string
├── userId: string
├── stayedLongEnough: boolean     // 체류 시간 판정 (Bayesian 신뢰도 입력)
└── createdAt: Timestamp

price_alerts/{autoId}
├── userId: string
├── productId: string
├── targetPrice: number | null
├── isActive: boolean
└── createdAt: Timestamp

posts/{postId}
├── userId: string
├── category: '후기' | '질문' | '자유' | '지역'
├── title: string
├── content: string
├── viewCount: number             // 조회수 (네이버 카페형 UX를 위해 신설)
├── commentCount: number
├── likeCount: number
├── attachedProductIds: string[]  // Context-to-Commerce 후보
└── createdAt: Timestamp

comments/{commentId}
├── postId: string
├── userId: string
├── content: string
└── createdAt: Timestamp

notifications/{uid}/user_notifications/{notifId}
├── type: 'price_drop' | 'comment' | 'like' | 'reward_approved'
├── productGroupId: string | null
├── message: string
├── isRead: boolean
└── createdAt: Timestamp

reward_claims/{claimId}           // 쿠팡 파트너스 자동 트래킹 공백 보완
├── userId: string
├── productId: string
├── orderNumber: string           // 유저가 직접 입력
├── status: 'pending' | 'approved' | 'rejected'
├── claimedPoints: number
├── createdAt: Timestamp
└── reviewedAt: Timestamp | null

recommendations/{docId}           // (planned, 사전 계산형 추천)
posts_saved/{userId_postId}       // (planned)
```

### 4.2 Child Stage System (`src/domain/child/childStageUtils.js`)
- **함수:** `buildChildComputedFields({ type, birthDate })`
- **반환:** `{ ageMonth, stage }`
- **Stage 전이:**
```
type='pregnancy'          → stage='pregnancy'
type='child' 생후 0-2m    → stage='newborn'
                3-5m      → stage='early_infant'
                6-11m     → stage='infant'
                12-23m    → stage='toddler'
                24-36m    → stage='early_child'
                37m+      → stage='child'
```
- **categoryTags 자동 생성:** `deriveCategoryTags({ stage, feedingType })` — stage별 기본 카테고리 + 수유 타입별 추가 카테고리 병합.

### 4.3 Concerns 옵션 (온보딩 Chip)
```js
CONCERN_OPTIONS = [
  '피부/기저귀',   // → 매칭 problemTags: 'diaper', 'diaper_leak', 'skin_rash'
  '수면/재우기',   // → 'sleep', 'swaddle'
  '수유/이유식',   // → 'feeding', 'bottle', 'weaning'
  '발달/놀이',     // → 'development', 'toy'
  '안전/외출',     // → 'safety', 'stroller', 'carseat'
  '없음'           // → RULE-03 상호배제 대상
]
```

---

## 🧮 5. CORE ALGORITHM (핵심 추천 알고리즘)

> **파일 위치:** `src/services/recommendationService.js`
> **주의:** 본 알고리즘은 **[TECH SPEC RULE-12]**를 최우선으로 준수하는 **v4 통합 버전**이다. (과거 알고리즘 스펙은 본 장으로 완전 통합됨)

### 5.1 v4 통합 랭킹 공식
`finalScore = (productScore * 0.6) + (peerSegmentScore * 0.4)`

### 5.2 세부 점수 산출 공식 (Sub-scores) 및 시간 감가상각 (Time-Decayed Weighting)
모든 점수는 최근 7일을 기준으로 합산하되, 최신성에 따라 점수를 차등 반영한다.
- **시간 감가상각 (Multiplier):** 1~2일 내 (x 1.5) / 3~5일 내 (x 1.0) / 6~7일 내 (x 0.5)
- **(a) productScore (상품 점수):** - 목표가 알림 설정(Base 50점), 관심 상품 담기(Base 30점), 상세 1분 체류(Base 10점) 등 명시적/암묵적 액션에 시간 감가상각을 곱하여 산출.
- **(b) peerSegmentScore (3-Layer 또래 유사도):**
  - Layer 1 (필수 관문): 나이 윈도우 일치(0|1) × 성별 일치(0|1)
  - Layer 2 (선택 속성): (일치하는 고민/수유/양육환경 수 / 전체 수) × 0.5
  - Layer 3 (행동 유사도): 구매 벡터 코사인 유사도 × 0.5

### 5.3 소아 발달 및 학령기 기반 슬라이딩 윈도우 (RULE-12)
아이의 발달 가속도에 비례하여 추천 범위를 동적으로 조절한다.
- **임신부:** 예정일 ±2주 / **신생아 (0~1개월):** 생일 ±7일
- **영아 초기 (1~6개월):** 생일 ±15일 / **영아 후기 (6~12개월):** 생일 ±1개월
- **유아기 (12~36개월):** 생일 ±2개월 / **초기 아동기 (3~5세):** 생일 ±6개월
- **학령기 이후:** 초등 저(±1.5년) / 초등 고(±2년) / 청소년(±3년) / 성인(통합)

### 5.4 추천 블렌딩 전략 (Soft Persona Blending 7:2:1)
데이터가 부족한 초기 유저의 확증 편향(Filter Bubble)을 막기 위해 최소 10건의 행동 로그가 쌓인 후 페르소나를 부여하며, 아래 비율로 혼합 노출한다.
1. **70%:** 동일 세그먼트 내 상위 랭킹 상품 (페르소나 맞춤)
2. **20%:** 인접 세그먼트(발달 단계 +1) 상위 상품 (선제 제안)
3. **10%:** 전체 유저 대상 트렌딩/디스커버리 상품

### 5.5 소모 주기 예측 (Replenishment Prediction)
기저귀, 분유 등 소모성 카테고리는 유저의 과거 구매/알림 시점과 아이의 성장 속도를 계산하여, 다음 단계(Next-step) 및 재구매 필요 상품을 선제적으로 상단에 노출한다.

---

## 📱 6. PAGE-BY-PAGE ARCHITECTURE (페이지별 상세 설계)

### 6.1 온보딩 (`OnboardingScreen.js`)
**목적:** 유저 최초 진입 시 기본 데이터 수집.
**유입 경로:**
- 설치 후 최초 실행 (항상)
- 딥링크로 들어왔으나 로그인 안된 상태 (리다이렉트)

**데이터 수집 플로우:**
1. 환영 화면 (스킵 불가)
2. 로그인 방식 선택 (기본: 익명 / 카카오·구글 SSO 준비중)
3. **아이 정보 입력** (`ChildAddScreen.js` 와 공유):
   - `type` (`child` / `pregnancy`)
   - `birthDate` (child) or `pregnancyWeek`, `dueDate` (pregnancy)
   - `gender`, `name` (optional)
   - `feedingType` (모유/분유/혼합/모름)
   - `weight`, `height` (optional)
4. **고민 카테고리 선택** (Chip multi-select) — RULE-03 적용
5. 완료 → 홈 탭 진입

**Firestore Write:**
- `users/{uid}` 생성 (익명 시 `provider: 'anonymous'`, `selectedChildId` 설정)
- `children/{childId}` 생성 (computed fields 포함, concerns 포함)

**추후 고도화:**
- 공유 링크 유입자: 온보딩 스킵 → 해당 상품으로 직행 → 나중에 아이 정보 입력 유도
- 지역(region) 필드 수집 (동네 핫딜용)
- 관심 카테고리 선호도 (Like/Dislike) 수집으로 cold start 개선

---

### 6.2 홈 탭 (`HomeScreen.js`)
**목적:** 선택된 아이 기준 맞춤 추천 피드. 세이브루의 메인 화면.

**UI 구조 (Hero/Medium/List):**
- **Hero 카드 1개** — `finalScore` 최상위 제품 (큰 이미지, 신뢰 카피)
- **Medium 카드 2개** — 2~3위 제품 (중간 크기)
- **리스트 형태** — 4위 이하

**신뢰 기반 1줄 추천 이유 (Trust Copy, 5개 순환):**
- "같은 개월 수 부모님들이 가장 많이 찾은 제품이에요"
- "또래 아이를 키우는 부모님의 96%가 선택했어요"
- (나머지 3개 fallback은 `docs/history.txt` 참조)

**핵심 기능:**
1. **매직 넛지 (RULE-05)** — `useMagicOnboarding` 훅 호출. 앱 foreground 전환 시 클립보드 감지.
2. **지금 사면 좋은 상품 스트립** — `getFloatingWindowProducts(child)` 결과 가로 스크롤.
3. **코치마크 (신규 유저용)** — 스포트라이트 효과 (`backgroundColor: 'rgba(255,255,255,0.3)'`, border 없음, 하단 탭 아이콘 중앙 정렬).

**유입 경로:**
- 온보딩 완료 후 (기본)
- 다른 탭 → 홈 탭 클릭
- 딥링크 (푸시 알림, 외부 공유)

**데이터 소스:**
- `recommendationService.getRecommendedProducts(childId)` (메인 피드)
- `recommendationService.getFloatingWindowProducts(child)` (상단 스트립)
- 유저의 `selectedChildId` 가 없을 경우 fallback: `searchCoupangProducts('기저귀', 20)`

**데이터 Write:**
- 상품 카드 클릭 시 → `user_product_actions` 에 `product_click` 로깅

**추후 고도화:**
- 시간대별 콘텐츠 (아침: 이유식 / 저녁: 수면용품)
- Hero 영역 A/B 테스트 (배너 vs 상품)
- 스트릭 상태 뱃지 노출 (연속 접속 N일)

---

### 6.3 랭킹 탭 (`RankingScreen.js`)
**목적:** 카테고리별 쿠팡 베스트 + 동년배 행동 데이터 결합 랭킹.

**UI 구조:**
- **상단 카테고리 탭 (3개):**
  - `출산/유아동` (Coupang category ID: **1011**)
  - `식품/분유` (Coupang category ID: **1012**)
  - `생활용품` (Coupang category ID: **1014**)
- **기본 로드:** 1011 (출산/유아동)
- 세로 리스트, 쿠팡 랭킹 순 + 내부 peerScore 가중

**핵심 로직:**
```
rankingScore = coupangOfficialRank * 0.6 + peerScore * 0.4
```
- `coupangOfficialRank`: Firebase Function `getBestCategoryProducts` 로 가져온 쿠팡 베스트카테고리 API 결과 (HMAC 서명, 최대 50개).
- `peerScore`: 세이브루 내 같은 stage 부모들의 클릭/전환 빈도 기반.

**유입 경로:**
- 탭바에서 직접 진입
- 홈/마이페이지 빈 상태에서 "랭킹 보러가기 →" CTA
- 딥링크: `saveroo://ranking/{categoryId}`

**데이터 Write:**
- 탭 진입 시 → `user_product_actions`: `ranking_visit`
- 상품 카드 클릭 → `product_click`

**추후 고도화:**
- 카테고리 추가 (유아교육/건강보조)
- 시간별 랭킹 (오늘 / 이번주 / 이번달)
- "지금 막 오른 제품" 급상승 섹션

---

### 6.4 커뮤니티 탭 (`CommunityListScreen.js`, `PostDetailScreen.js`)
**목적:** 게시글 작성/조회 + **Context-to-Commerce** (게시글 내용 기반 연관 상품 자동 매칭).

**UI 구조:**
- **카테고리 필터:** 전체 / 후기 / 질문 / 자유 / 지역
- **구매 인증 배지:** `verifiedPurchase: true` 유저 게시글에 뱃지 표시
- 게시글 카드 (제목, 본문 일부, 댓글 수, 좋아요, 작성자, 시간)

**핵심 로직 — Context-to-Commerce (`PostDetailScreen.js` 하단):**
1. **키워드 추출:** 게시글 `title` + `content` 에서 명사 추출.
2. **쿠팡 후보 검색:** `searchCoupangProducts(keyword, limit)` 호출.
3. **Peer Score 계산:** `user_product_actions` 에서 같은 stage 부모들의 해당 상품 action 카운트 수집.
4. **Top 3 선택:** Peer Score 기준 상위 3개 → 가로 카드 캐러셀 렌더링.
5. **Trust Copy:** "비슷한 개월 수 부모님들이 많이 찾은 제품이에요" (또는 fallback).
6. **로깅:** 카드 클릭 시 → `user_product_actions`: `post_product_click`.

**유입 경로:**
- 탭바 직접 진입
- 홈에서 "관련 게시글" 카드 클릭
- 딥링크: `saveroo://post/{postId}`
- (추후) 외부 쓰레드/인스타 공유 링크

**데이터 Write:**
- 게시글 진입 → `post_view`
- 댓글 작성 → `comments` 컬렉션
- 연관 상품 클릭 → `post_product_click`

**추후 고도화:**
- 키워드 추출 알고리즘 개선 (TF-IDF → BERT 임베딩)
- 지역 필터 (region 기반 동네 맘카페화)
- 실시간 인기 게시글 (trendingService 연동)
- 전문가 답변 (소아과 의사 인증 계정)

---

### 6.5 관심상품 탭 (SavedProductsScreen.js)
**목적:** **비금전적 게이미피케이션** — 일일 미션, 스트릭, 레벨업, 시크릿 딜.

**UI 구조:**
1. **프로필 & 레벨 섹션:**
   - 닉네임 + `Lv.N 배지` (streak/missions 합산 계산)
   - 🔥 연속 접속 스트릭 (`streak_count`)
2. **Daily Mission 섹션:**
   - Step indicator (e.g., 1/3)
   - 3개 태스크 (각 '보러가기' 버튼으로 홈/랭킹/커뮤니티 이동)
   - 미션 예시:
     - "오늘의 맞춤 추천 상품 3개 보기" → **"아이와 또래 부모가 최근 7일 가장 많이 산 제품 보기"** (4월 확정 변경)
     - "랭킹 1개 카테고리 둘러보기"
     - "커뮤니티 게시글 1개 읽기"
3. **시크릿 핫딜 섹션 (잠금):**
   - 미션 전체 완료 시 잠금 해제
   - 플레이스홀더 카드 (잠금 상태)
4. **배지 그리드:**
   - 탐험가 / 랭킹러 / 소통왕 / 오늘의 챔피언

**핵심 로직:**
- `missionService.js` 에서 일일 진행 상태 관리.
- 매일 KST 00:00 기준 초기화.
- 미션 완료 조건은 해당 탭 방문 + 액션 1회 이상 (`user_product_actions` 체크).

**유입 경로:**
- 탭바 직접
- 푸시 알림 ("오늘의 미션을 확인하세요")
- 미션 CTA에서 타 탭으로 이동 후 복귀

**데이터 Write:**
- 미션 달성 → `users/{uid}.missions` 필드 업데이트
- 스트릭 업데이트 → `users/{uid}.streak_count` 증가

**추후 고도화:**
- 주간/월간 챌린지
- 친구 초대 배지
- 시크릿 딜 실제 딜 컨텐츠 (B2B 광고주 연동)
- 배지 수집도에 따른 프리미엄 기능 잠금 해제

---
### 6.5.1 내 활동 화면 (`MyActivityScreen.js`)
**목적:** 유저의 모든 커뮤니티 활동(글, 댓글, 좋아요)을 한 화면에서 모아보고 쉽게 검색하기 (개인 아카이브 목적. 내 글에 대한 타인의 댓글/좋아요 등 실시간 반응은 글로벌 🔔 알림 탭에서 별도 처리).

**UI 구조 (Naver Cafe + Fintech 검색 스타일):**
1. **상단 활동 요약 블록:**
   - 유저 닉네임 및 현재 등급(배지) 노출. (프로필 이미지는 초성 텍스트 렌더링 절대 금지, 마이페이지와 동일한 기본 실루엣 SVG로 통일)
   - 활동 스탯: `방문 [visitCount]회 · 작성글 [postCount] · 내 댓글 [commentCount]` 형태의 요약 정보 제공. (숫자는 1k 등 축약 없이 실제 갯수 그대로 콤마(,) 표기).
2. **내 활동 검색 바 (신설):**
   - 탭 바 바로 하단에 둥근 모서리의 검색창(Search Bar) 배치. Placeholder: "내 활동 검색 (제목+본문)"
   - **검색 로직:** 유저가 타이핑 시, 현재 선택된 탭의 리스트 내에서 `제목(title)` 또는 `본문(content)`에 해당 키워드가 포함된 항목만 실시간으로 필터링.
3. **상단 탭 바 (4-tab):** `[작성글]` | `[작성댓글]` | `[댓글단 글]` | `[좋아요한 글]`
4. **리스트 아이템 (Card) 디자인:**
   - **게시글 리스트:** `[카테고리명] 글 제목` (예: [후기] 기저귀 추천), 본문 미리보기, 닉네임, 작성일(YYYY.MM.DD), `조회 [viewCount]`, `댓글 [commentCount]`, `좋아요 [likeCount]` 노출. (DB 부하 방지 및 핀테크 표준에 따라 순차적 게시글 번호 No.는 노출하지 않음).
   - **댓글 리스트:** 내가 남긴 댓글 내용, 원문 글 제목, 작성일 노출.
5. **동적 연동:** 탭 클릭 시 Firestore에서 데이터를 실시간으로 가져와 리스트로 노출. 빈 상태 시 탭별 맞춤 안내 노출.

---

### 6.6 마이 탭 (`MyPageScreen.js`)
**목적:** 유저의 개인화된 활동 허브이자, 앱의 체감 혜택(절약액)을 확인하는 대시보드.

**UI 구조 및 UX 상세 명세 (최신 핀테크 표준):**

1. **상단 글로벌 헤더 (Global Header):**
   - **좌측:** "마이페이지" (타이포그래피 토큰: `24px, 800(ExtraBold), #0f172a`)
   - **우측 액션:** - 🔔 (알림 아이콘): `NotificationScreen`으로 이동.
     - ⚙️ (글로벌 설정 아이콘): 앱 전체 관리를 위한 `SettingsScreen`으로 이동.

2. **프로필 & 정보 통합 블록:**
   - **프로필 이미지:** 핀테크 스타일의 사용자 실루엣 SVG 기본 적용. (초성 텍스트 렌더링 절대 금지)
     - **오버레이 ⚙️ 아이콘:** 이미지 우측 하단에 조그맣게 겹쳐진 설정 아이콘. 
     - **동작 (프로필 편집):** 클릭 시 화면이 어두워지며(Dimmed) 하단에서 `ProfileEditModal` 바텀 시트가 열림. (모달 내에서 사진 변경 및 닉네임 유효성 검사 수행)
   - **정보 영역 (통합 2줄 구조):**
     - **닉네임 & 등급 영역 (Line 1):** `flexDirection: 'row'`, `alignItems: 'center'` 배치. 닉네임이 길어질 경우 `ellipsizeMode="tail"` 처리.
       - **닉네임:** (토큰: `fontSize: 20`, `fontWeight: '800'`) 노출.
       - **등급 버튼 (Pill Badge):** 닉네임 우측에 옅은 파란색 배경(`#EFF6FF`)의 둥근 캡슐 형태로 `[등급명] >` (예: 일반맘 >) 노출. (글자색: 스마트 블루 `#2E6FF2`, Bold). 클릭 시 `LevelInfoScreen` 이동. (등급 체계: 일반맘-성실맘-열심맘-우수맘)
     - **아이 정보 요약 (Line 2):** 닉네임 줄 바로 아래 배치. `이름 · 성별 · 개월수 · 키 · 몸무게` 형식의 텍스트 + 우측 끝에 옅은 회색의 `수정 >` 버튼 배치. (클릭 시 `ChildInfoEditScreen` 이동).

3. **게이미피케이션 상태 영역 (퀘스트 카드):**
   - **다음 레벨 퀘스트 카드:** - **UI:** 옅은 파란색/회색 톤의 배경 (`#F8FAFC`). 좌측 파란색 테두리 선 삭제.
     - **타이틀:** 🔒 (자물쇠 아이콘) + `다음 레벨 '[목표등급]'까지` (잠겨있는 퀘스트 느낌 강조. 예: '성실맘'까지).
     - **내용:** 달성 조건(관심상품 등록 수, 글 작성 수 등) 프로그레스 바 노출.

4. **Activity Grid (4-column):**
   - **`[내가 쓴 글 (count)]`:** 클릭 시 `MyActivityScreen` 이동 (`{ activeTab: 'posts' }`).
   - **`[내 댓글 (count)]`:** 클릭 시 `MyActivityScreen` 이동 (`{ activeTab: 'comments' }`).
   - **`[좋아요한 글 (count)]`:** 클릭 시 `MyActivityScreen` 이동 (`{ activeTab: 'likes' }`).
   - **`[관심상품]`:** 클릭 시 하단 GNB의 `관심상품 탭`으로 이동 (Navigation Routing).
   - **`[내 쿠폰함]`:** (준비 중 기능 - Stub 팝업 노출).

5. **최근 본 상품 (가로 스크롤 캐러셀 및 전체보기):**
   - **데이터 소스:** 유저가 상품 상세페이지(`ProductDetail.js`)에 진입할 때 로컬 스토리지 또는 Firestore에 저장된 실제 열람 기록.
   - **노출 및 정렬 기준:** 최근 3일 이내 열람한 상품만 최신순(내림차순)으로 노출.
   - **UI 제약:** 최대 10개까지만 노출. 빈 상태 시 "최근 본 상품이 없습니다" 표시.
   - **카드 UI:** [9.4장 글로벌 가격 표기 정책] 철저 준수. 가격 블록은 첫 줄에 `[▼/▲ X% (동적 컬러)] [현재가 (크고 굵게)]`, 두 번째 줄에 `[평균가 (회색 취소선)]` 레이아웃 통일.
   - **라우팅:** 헤더 우측 꺾쇠(`>`) 좌측에 옅은 회색으로 `(전체보기)` 텍스트 배치. 클릭 시 `RecentlyViewedProductsScreen`으로 이동.
   - **전체보기 화면 UX:** 헤더(중앙 정렬) 바로 아래에 옅은 파스텔톤 배경(`backgroundColor: '#F8FAFC'`)의 **Info Banner** 배치. (ℹ️ 아이콘 + `최근 3일간 열람한 상품입니다 (총 N개)`). 세로 리스트의 가격 블록은 한 줄(Inline)로 배치하여 공간 최적화.

6. **하단 혜택 리포트 (절약 배너 - 가계부 역할):**
   - **목적:** 관심상품(추적) 등록을 자연스럽게 유도하고, 앱의 존재 이유(체감 혜택)를 극대화.
   - **산출 로직 (포트폴리오 어뷰징 방지):** 단순 클릭 누적 방식이 아님. 유저가 현재 "추적 중인 전체 상품"을 지금 딱 1회씩 모두 구매한다고 가정했을 때의 총 절약액.
   - **공식:** `SUM(추적 중인 각 상품의 최근 30일 평균가 - 현재가)` (단, 현재가가 평균가보다 높으면 0원 처리하여 마이너스 방지).
   - **카피라이팅:**
     - 타이틀: `💸 내 관심상품 할인 리포트`
     - 본문: `[유저명]님, 추적 중인 상품들을 지금 구매하시면\n총 [42,500원]을 절약할 수 있어요!` (금액 부분은 굵은 스마트 블루 컬러로 강조).
   - **라우팅:** 클릭 시 `SavedProductsScreen`(관심상품 탭)으로 딥링크 이동. 하단 탭 `backBehavior="history"` 적용으로 뒤로 가기 시 마이페이지로 안전하게 복귀.
   - **레이아웃:** 마이페이지 최하단에 위치하며, 위쪽 컴포넌트와의 여백을 핀테크 표준(margin-top: 20~30px)으로 쫀쫀하게 유지.

**핵심 기능 로직 명세:**
- **닉네임 유효성 검사 (Inline Validation):** 프로필 수정 모달 내에서 네이티브 알림창(`Alert.alert`) 사용 절대 금지. 실시간으로 2~10자 제한 및 중복 검사를 수행하여 초록/빨강 텍스트 피드백 제공 (17장 참조).
- **키보드 회피 (Keyboard Avoiding):** 프로필 수정 모달 호출 시, 키보드가 닉네임 입력창과 [저장] 버튼을 가리지 않도록 하단 패딩(Padding)을 동적으로 밀어 올림.
- **버튼 비활성화:** 닉네임이 1자 이하일 경우 모달 내 [저장] 버튼은 회색으로 비활성화(`disabled`).

**추후 고도화:**
- 카카오싱크 로그인 연동 (카카오톡 플러스친구 자동 추가를 통한 CRM 푸시 발송)
- 가계부 연동 (월별 실제 지출 및 절약 금액 리포트)
---

### 6.7 상품 상세 (`ProductDetail.js`)
**목적:** 구매 결정 판단 보조.

**핵심 컴포넌트 — PriceLineGraph (가격 그래프):**
- **입력:** `offers` 서브컬렉션 snapshots 기반 가격 추이 데이터
- **조회 기간 설정:** 1주일, 1개월, 3개월, 6개월 (초기 기본값: 1개월)
  * UX/데이터 정합성 원칙: 외부 리스트의 '30일 평균가' 로직과 완벽히 일치시키기 위해, 진입 시 무조건 1개월(30일) 기준의 그래프를 최우선 노출한다.
- **시각화 (범례 및 색상 규칙):**
  - **최고가 (해당 날짜):** 빨간색 실선 (`#ef4444`)
  - **최저가 (해당 날짜):** 파란색 실선 (`#2E6FF2`)
  - **현재가 (오늘 기준):** 연두색 점선 (`#22c55e`)
  - **기간 최고가 (설정 기간 내 최고):** 빨간색 점선 (`#ef4444`, `strokeDasharray` 적용)
  - **기간 최저가 (설정 기간 내 최저):** 파란색 점선 (`#2E6FF2`, `strokeDasharray` 적용)
- **Y축 스케일링:** 동적 min/max 기반 스케일링 적용
- **렌더링 조건:** `offerSnapshots.length >= 2` 일 때만 렌더링
- **하단 Stats Row (범례 표시):** `최고가 | 최저가 | 현재가 | 기간 최고가 | 기간 최저가` 5개 범례 및 수치 표시

**CTA Button:**
- 라벨: **"쿠팡에서 최저가 확인하기"**
- Sticky (Footer 고정, `useSafeAreaInsets` 적용)
- 마이크로 카피 (버튼 위): **"비슷한 상품 중에서도 선택이 높은 제품이에요"**
- 클릭 시:
  1. `user_product_actions` 에 `product_purchase_click` + `productGroupId` 로깅
  2. `recordAbTestAction` 호출
  3. `Linking.openURL(affiliateUrl || 'coupang://...')` (RULE-02)
  4. affiliateUrl 없으면 쿠팡 검색 URL fallback

**추후 고도화:**
- 가격 예측 그래프 (향후 7일 예상)
- 최저가 알림 구독 버튼
- 성분 분석 (유아용품)
- 실구매 리뷰 상단 고정

---

### 6.8 쿠팡 URL 등록 파이프라인 (`registerCoupangProduct.js` + CF `registerProductFromUrl`)

**Flow:**
1. 유저 URL 복사 → 앱 foreground 복귀
2. RULE-05 매직 넛지 팝업
3. `[추적하기]` 클릭 → 바텀시트 오픈
4. URL 정규식 추출: `/\/v[mp]\/products\/(\d+)/i` → `originalId`
5. `productGroupId = "coupang_" + originalId` 생성
6. Firestore `products/{productGroupId}` 존재 확인
7. 없으면 skeleton doc 생성: `{ market: 'coupang', originalId, status: 'active', createdAt }`
8. 초기 offer snapshot을 `offers` 서브컬렉션에 추가
9. `fetchCoupangProduct` (Callable CF) 호출로 `name` 메타데이터 수집
10. `productTagService.generateProductTags()` 로 stageTags/categoryTags/problemTags 자동 할당

**에러 처리:**
- URL invalid → `Alert.alert("알림", "지원하지 않는 URL입니다")`
- 네트워크 실패 → 재시도 UI
- 중복 등록 → 기존 문서 반환 (RULE-08)

---

## ⚙️ 7. CLOUD FUNCTIONS (서버 로직)

| Function | Trigger | Purpose |
|---|---|---|
| `searchProducts` | Callable | 쿠팡 Partners API 키워드 검색 (HMAC 서명) |
| `getProductDetail` | Callable | 단일 상품 메타 |
| `generateDeeplink` | Callable | 파트너스 제휴 링크 일괄 생성 (최대 10 URL) |
| `getBestCategoryProducts` | Callable | 쿠팡 베스트카테고리 API (카테고리당 최대 50개) |
| `registerProductFromUrl` | Callable | URL → products 문서 생성 파이프라인 |
| `fetchCoupangProduct` | Callable | 멀티 전략 fetch: Partners API → v4 JSON → HTML 스크레이핑 |
| `scheduledPriceUpdate` | Scheduled (**6시간 주기**) | 전체 products 가격 재조회 → offers 서브컬렉션 append |
| `onPriceDropNotify` | Firestore trigger (`offers` write) | 가격 하락 감지 시 FCM 푸시 (price_alerts 구독자 대상) |
| `onReviewCreate` | Firestore trigger (`reviews` write) | 리뷰 통계 자동 증가 |

**HMAC 서명 규칙:**
- 알고리즘: HMAC-SHA256
- 타임스탬프 포맷: `YYMMDDTHHMMSSZ`
- 키 저장: `functions/.env` → `EXPO_PUBLIC_COUPANG_ACCESS_KEY`, `EXPO_PUBLIC_COUPANG_SECRET_KEY`
- **절대 client에 노출 금지 (RULE-07)**

---

## 🎯 8. USER FUNNEL & SEGMENTATION (유저 퍼널 및 세그먼트 전략)

### 8.1 유입 경로별 차별화

#### A. 검색 유입 (네이버 SEO 블로그)
- 타겟 키워드: "2026년 출산혜택", "부모급여", "첫만남이용권", "아동수당"
- Landing: 블로그 포스트 → 앱 설치 유도 CTA
- 차별화 UI: 검색 키워드 기반 맞춤 홈 (e.g., "출산혜택" 검색 유저 → 임산부 상품 Hero)

#### B. 공유 링크 유입 (쓰레드/맘카페)
- 차별화 UI: 온보딩 스킵 → 해당 상품 직행
- 최소 데이터만 수집 후 지연 온보딩 (3회 방문 후 프롬프트)

#### C. 매직 넛지 (클립보드)
- RULE-05 트리거
- 기존 유저 재방문 시 최고 전환 포인트

#### D. 푸시 (가격 하락)
- `onPriceDropNotify` FCM
- Deep Link: `saveroo://product/{productGroupId}`

### 8.2 유저 세그먼트 (추천 엔진 입력 기준)
- **Stage Segment:** `pregnancy` / `newborn` / `early_infant` / `infant` / `toddler` / `early_child` / `child`
- **Feeding Segment:** `breast` / `formula` / `mixed`
- **Concern Segment:** 5종 (`피부/기저귀` / `수면/재우기` / `수유/이유식` / `발달/놀이` / `안전/외출`)
- **Activity Segment:** 행동량 기반 `new (0-3 actions)` / `active (4-20)` / `power (20+)`

---

## 📊 9. COLOR & DESIGN TOKENS & GLOBAL UI RULES

### 9.1 핵심 색상 (Smart Blue Theme)
- **Primary (브랜드):** `#2E6FF2` (스마트 블루 - 신뢰감 부여, 헤더, 버튼, 가격 dot 등 메인 포인트 컬러)
- **Success (최저가/긍정):** `#22c55e` (녹색)
- **Danger (최고가/경고):** `#ef4444` (빨강 - 탈퇴, 에러 등에 사용)
- **Info:** `#3b82f6` (파랑, ActivityIndicator)
- **Neutral:** `#0f172a` (본문), `#334155` (서브), `#94a3b8` (caption), `#cbd5e1` (비활성화/테두리), `#f1f5f9` (배경)
- **Coachmark Spotlight:** `rgba(0, 0, 0, 0.6)` (어두운 배경에 툴팁 강조)

### 9.2 글로벌 UI/UX 절대 규칙 (Global Rules)
- **이모지 밴(Ban):** 앱 내 모든 UI(알림, 마이페이지, 헤더 등)에서 네이티브 이모지(👶, 👩, 💬 등) 사용을 엄격히 금지한다. 모든 아이콘은 `lucide-react-native` 등의 SVG 벡터 아이콘으로 대체한다. (단, OS 푸시 알림 Payload에는 예외적으로 허용)
- **코치 마크(Coach Mark):** 구시대적인 5단계 팝업 튜토리얼과 상단 헤더의 전구(💡) 아이콘은 폐기한다. 유저가 각 주요 탭에 최초 진입할 때 1회성 코치 마크를 노출하여 학습시킨다.

### 9.3 Typography & Global Header (핀테크 표준)
앱 내 모든 텍스트와 헤더는 개별 하드코딩을 금지하고 아래의 타이포그래피 토큰을 따른다. 특히 스택 네비게이터의 기본 헤더를 비활성화하고 통일된 `<GlobalHeader />` 컴포넌트를 사용하여 굵기와 크기의 일관성을 100% 유지한다.
- **Main Tab Title (홈/마이페이지 등 탭 메인):** `fontSize: 24, fontWeight: '800', color: '#0f172a'` (좌측 정렬)
- **Sub Header Title (상세 페이지 헤더):** `fontSize: 18, fontWeight: '700', color: '#0f172a'` (중앙 정렬)
- **Body 1 (일반 본문):** `fontSize: 14, fontWeight: '400', color: '#334155'`
- **Caption (작은 설명):** `fontSize: 12, fontWeight: '400', color: '#94a3b8'`
- **Product Name / Price:** `fontSize: 11 (600)` / `fontSize: 12 (800)`

### 9.4 글로벌 상품 가격 표기 정책 (Global Price UI Policy)
**적용 범위:** 홈, 랭킹, 관심상품, 마이페이지 등 앱 내 모든 상품 카드(Product Card)
**목적:** 유저에게 평균가 대비 명확한 할인 혜택을 인지시키고, 신규 데이터의 신뢰도 하락 방지.

**노출 기준 로직:**
1. **데이터 누적 7일 이상 (정상 노출):**
   - **현재가:** 가장 크고 굵은 검은색 텍스트
   - **평균가:** 얇은 회색 텍스트 + 취소선
   - **가격 변동률:** - 현재가 < 평균가: 스마트 블루(#2E6FF2) + `▼` (예: `▼ 25%`)
     - 현재가 > 평균가: 데인저 레드(#ef4444) + `▲` (예: `▲ 10%`)
   - **레이아웃:** 세로 리스트는 `[변동률] [현재가] [평균가]` 한 줄 배치. 가로 카드는 평균가를 두 번째 줄에 배치.

2. **데이터 누적 7일 미만 (신뢰도 방어):**
   - 변동률 및 평균가 완전 블라인드.
   - 현재가 아래에 `(가격 추적 중. M월 D일부터 할인율 노출)` 표기.

---

## 🚀 10. FUTURE ROADMAP (향후 고도화 계획)

### 10.1 단기 (런칭 후 1~3개월)
1. **공유 링크 유입 전용 랜딩 화면** — 온보딩 스킵
2. **지역(region) 맞춤 탭** — 동네 핫딜, 지역 맘카페
3. **가격 예측 그래프** — 최근 3개월 데이터 기반 향후 7일 예측
4. **실시간 인기 랭킹** (trendingService 확장)
5. **푸시 세분화** — 가격 알림 / 신상품 / 커뮤니티 / 미션

### 10.2 중기 (3~6개월)
1. **다중 마켓 확장** — 네이버/11번가/쿠팡 가격 비교
2. **카카오 / 구글 SSO** — 익명에서 실 유저 전환
3. **커뮤니티 전문가 답변** — 소아과 의사 인증 계정
4. **키워드 추출 고도화** — 간이 TF-IDF → BERT 임베딩
5. **관리자 대시보드 실 지표** — 유저 행동, CTR, 전환율 시각화

### 10.3 장기 (6개월+)
1. **B2B 광고주 연동 시크릿 딜**
2. **가계부 연동** — 월별 절약 금액 리포트
3. **구독 프리미엄 모델** — 상세 리포트, 광고 제거
4. **맞춤 상품 박스 큐레이션** — 월 구독형 (정기 배송 파트너십)
5. **AI 상담사** — "3개월 아기 기저귀 발진이 심해" → 맞춤 상품 + 커뮤니티 연계

### 10.4 확장성을 위해 지금부터 고려해야 할 아키텍처
- **유저 DB 구조화:** `users/{uid}/follow_list`, `users/{uid}/block_list` 서브컬렉션 예비 (커뮤니티 확장용).
- **productGroupId 마켓 prefix:** `coupang_*`, `naver_*`, `11st_*` 이미 적용 중. 쿼리 시 `market` 필드 인덱싱 필수.
- **actionType 확장 가능성:** 현재 6종. 신규 추가 시 반드시 문서화 (RULE-11).
- **다국어 i18n:** 현재 한글 하드코딩. 향후 `i18next` 도입 검토.
- **오프라인 모드:** `AsyncStorage` 캐싱 전략 예비.

---

## ⚠️ 11. KNOWN ISSUES & TODO (현재 진행 중/미해결)

### 11.1 확인된 기획상 공백 (`[기획자 확인 필요]`)
- **스트릭 계산 리셋 조건:** KST 00:00 기준인지, 마지막 접속 24시간 기준인지 미정.
- **적정가 계산 시 이상치(Outlier) 처리 기준:** 크롤링 데이터 중 터무니없는 가격(Outlier) 제외 로직 미정.

### 11.2 현재 Mock 상태
- `productMetadataService.js` — 실 쿠팡 API 대체 mock. 실 API 통합 예정.
- `reward_claims` 승인 프로세스 — 수동 승인 상태. 자동 검증 로직 미구현.

---

## 📚 12. FILE REFERENCE MAP (파일 참조 맵)

현재 세이브루 프로젝트는 철저한 단일 진실 공급원(SSOT) 원칙에 따라 구형 문서(CLAUDE.md, RULES.md 등)를 모두 폐기하고 아래 2개의 파일만 코어 문서로 운영한다.
- `SAVEROO_TECH_SPEC_v2026.04.md` — 본 문서. 앱 전체 아키텍처 및 UI/UX 절대 규칙.
- `SAVEROO_ALGORITHM_SPEC.md` — 알고리즘 랭킹 산출 공식 (v4 기준).

---

## 🎖 13. BRAND & COPYWRITING (브랜드 톤 & 마이크로카피)

### 브랜드 네임: **세이브루(SAVEROO)**
- `SAVE` + `ROOM` (돈을 아끼는 여유) 조합. Save+You 연상 가능.
- **[CRITICAL] 핵심 브랜드 컬러:** `스마트 블루 (#2E6FF2)` (기존 핑크색 폐기. 신뢰감을 주는 핀테크 톤앤매너)

### 브랜드 톤 & 매너
- **페르소나:** "동네에서 정보력 제일 좋은, 엑셀로 가계부 쓰는 야무진 육아 선배"
- **금지어:** "최저가 찾기" 같은 단순 쇼핑 강조 표현 (❌) → "지금 사도 되는지 알려줄게요" (⭕)

### 앱 내 마이크로카피 표준
- CTA: **"쿠팡에서 최저가 확인하기"**
- 매직 넛지: **"복사하신 쿠팡 상품의\n최저가를 추적할까요?"** / **[추적하기]**
- 관심상품 빈 상태: **"관심상품이 텅 비어있어요!"** → **"이렇게 추가해 보세요"** → **"쿠팡 앱에서 상품 URL을 복사해 주세요!"**

---

## 🔔 14. GLOBAL NOTIFICATION SYSTEM (글로벌 알림 시스템)

### 14.1 투 트랙(Two-Track) 알림 발송 정책
1. **가격·재입고:** 관심상품 최저가/재입고 ➔ **앱 내 + OS 푸시 즉시 발송**
2. **맘톡·활동:** 내 글에 달린 댓글 ➔ **앱 내 + OS 푸시 발송** (좋아요는 푸시 제외)
3. **또래 맞춤:** 또래 랭킹 업데이트 ➔ **앱 내 알림만 저장**
4. **혜택·이벤트:** 체험단 당첨 등 ➔ **앱 내 + OS 푸시 (마케팅 동의자 한정)**

### 14.2 앱 내 알림창(In-App) UI/UX 규칙
* **필터 & 정렬:** 상단 카테고리 필터 칩 제공, 최신순 정렬, '오늘/이전' 섹션 분리.
* **읽음 처리:** 안 읽음(Bold+연한 배경), 읽음(Regular+흰색 배경). 클릭 시 개별 읽음.
* **뱃지 초기화:** 종(🔔) 아이콘 클릭 시 즉시 0으로 초기화.
* **설정 진입:** 알림창 우측 상단 설정(⚙️) 아이콘으로 알림 제어 화면 이동.
* **DB 수명:** 30일 경과 시 Firebase TTL 자동 삭제.

---

## 📱 15. APP NAVIGATION & ARCHITECTURE (앱 네비게이션)

### 15.1 하단 탭 (GNB)
- [홈] - [랭킹] - [커뮤니티] - [관심상품] - [마이페이지] 5탭 체제 유지.

### 15.2 마이페이지(MyPage) vs 설정창(Settings) 아키텍처
- **마이페이지:** 시스템 설정 메뉴를 전면 삭제하고 오직 프로필, 활동 데이터(글, 댓글), 쿠폰 등 **개인화 대시보드** 역할만 수행한다. 우측 상단에 설정창(⚙️) 아이콘 배치.
- **설정창(SettingsScreen):** 독립된 제어 화면. 계정 관리, 알림 세부 제어, 앱 관리(캐시 삭제), 고객센터, 로그아웃/탈퇴 기능을 통합 관리한다.

---

## ✅ 16. 프롬프트 프리픽스 (AI 지시어 표준)
> 제미나이/클로드에게 코드/기획 지시 시 아래 프리픽스를 맨 앞에 두고 작업을 지시할 것.

## 🛡 17. 프로필 닉네임 유효성 검사 규칙 (Validation)

프로필 닉네임은 **최소 2자 ~ 최대 10자**로 제한한다.
네이티브 알림창(`Alert.alert`) 사용을 절대 금지하며, 입력창 하단에 실시간으로 아래의 피드백 메시지와 색상을 노출한다.
- **성공 (2~10자, 중복 아님):** `사용할 수 있는 닉네임입니다.` (글자색: 초록색 `#22c55e`)
- **경고 (1자 이하):** `닉네임을 2자 이상 입력해주세요.` (글자색: 빨간색 `#ef4444`)
- **경고 (중복 발생):** `이미 사용 중인 닉네임입니다.` (글자색: 빨간색 `#ef4444`)
- **UI 제약사항:** 상태 텍스트 옆에 글자색과 동일한 색상의 `<Info />` (lucide-react-native) SVG 아이콘을 배치한다. 글자 수 카운터(예: `2/10`)를 입력창 내 우측 하단에 배치한다.