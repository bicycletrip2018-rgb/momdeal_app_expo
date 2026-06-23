# 🚀 [SAVEROO SYSTEM CORE DIRECTIVE & TECH SPEC v2026.06]
## 세이브루 프로젝트 기술/기획 통합 명세서

**원본 소스:** rule.html (Gemini MyActivity) + CLAUDE.md + momdeal_master_spec.txt + history.txt

---

## 🔴 0. 이 문서를 읽는 AI가 반드시 지켜야 할 메타 규칙 (CRITICAL DIRECTIVE)

> **[SYSTEM WARNING]** 이 문서를 읽는 AI(Claude, GPT, Gemini 등)는 아래 규칙 위반 시 프로젝트 파괴 행위로 간주되며, 모든 응답은 이 메타 규칙을 최우선으로 복종해야 한다.

1. **[AI 요약/압축/생략 절대 금지 (NO SUMMARIZATION)]:** 토큰 최적화나 가독성을 핑계로 기획 내용, 라우팅 매트릭스, 수식, UI/UX 디테일을 임의로 축소, 요약, 뭉뚱그려 표현하는 것을 엄격히 금지한다. "등", "이하 생략", "기존과 동일" 같은 핑계성 표현을 절대 쓰지 말고, 반드시 명세서에 적힌 원문 100%를 무손실로 출력하고 코딩해야 한다.
2. **[추측 및 창작 금지 (NO HALLUCINATION)]:** 문서에 명시되지 않은 파라미터(Payload)나 라우팅 경로, DB 필드를 AI가 임의로 창작해서 넘기지 마라. 모르면 반드시 `[기획자 확인 필요]`라고 멈추고 물어봐야 한다.
3. **[수정 지시의 1순위 병합]:** 본 문서는 모든 개발/기획 지시 중 최상위 바이블(SSOT)이다. 대화 기록이나 과거 코드보다 이 MD 파일의 내용이 무조건 우선한다.
4. **서비스명 고정:** 서비스명은 "세이브루(SAVEROO)"로 고정한다. (Firebase ID `momdeal-494c4`는 레거시로 유지). 구 명칭 "맘딜(MOMDEAL)" 언급 시 세이브루로 자동 치환하여 해석하라.
5. **아키텍처 맵 출력 절대 규칙:** 아키텍처 맵(Architecture Map)을 출력할 때는 단순 진척도(완료/진행중)만 표기하지 말고, 반드시 `[ZONE] ➔ [기능/UI] ➔ [데이터/로직] ➔ [전체보기 등 라우팅]`의 4단계 뎁스와 `액션-라우팅 매트릭스`를 원본 그대로 상세히 기술할 것.
6. **절대 원본 유지: 수정 요청이 발생한 '특정 구역' 외의 나머지 내용은 삭제, 압축, 생략을 절대 금지하며 원본을 100% 보존한다.
7. 작업 단위 명시: 모든 수정 시, "어떤 섹션의 어떤 문단을 수정하는지" 명확히 밝히고 해당 구역만 코드 박스 형태로 제공한다.
8. 명령어 제거: MD 파일 본문에는 '제거하라', '수정하라'와 같은 AI의 작업 지시어(Imperative)를 일절 쓰지 않는다. 기획 의도가 담긴 **'최종 상태 중심의 서술형 명세(Declarative)'**로만 기록한다.


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

### RULE-02 | 외부 앱 딥링크(Deep Link) 라우팅 무결성 및 OS 우회 정책
- **조건:** `[쿠팡 앱 접속하기]` 등 외부 상품 이동 버튼(CTA) 트리거 시
- **로직 (iOS):** `Linking.openURL('coupang://')` 프로토콜을 최우선 허용한다.
- **로직 (Android 강제 우회):** 안드로이드의 Naked Scheme(`coupang://`) 파싱 에러(ActivityNotFound)를 방지하기 위해 반드시 Host가 포함된 `coupang://home`을 1차 호출한다. 실패할 경우, OS가 강제로 패키지를 열도록 `expo-intent-launcher` 모듈을 사용해 `com.coupang.mobile`을 직접 구동(`android.intent.action.MAIN`) 시키는 2차 폴백을 강제한다.
- **예외 처리 (최종 Fallback):** 위 네이티브 호출이 모두 실패(앱 미설치)할 경우, 웹 브라우저(`https://m.coupang.com`) 우회는 **절대 금지**한다. 대신 OS별 앱스토어/플레이스토어의 쿠팡 설치 페이지로 즉시 라우팅하여 설치를 강제한다.
- **[CRITICAL] 런칭 빌드 사전 권한 설정:** Android 11+의 패키지 가시성(Package Visibility) 보안 정책으로 인해 앱이 쿠팡 설치 여부를 거짓으로 반환하지 않도록, `app.json`의 `ios.infoPlist`에 `LSApplicationQueriesSchemes: ["coupang"]`을, 안드로이드 플러그인에 `<queries><package android:name="com.coupang.mobile" /></queries>`를 영구적으로 주입해두어야 한다.

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

### RULE-05 | 네이티브 공유 인텐트(Share Intent) 및 클립보드 폴백(Fallback) 로직
- **목적:** 쿠팡 앱에서 유저가 상품을 가장 빠르고 끊김 없이 세이브루로 가져오도록 돕는 브릿지 아키텍처.
- **로직 A (Android 메인 - Share Intent):** `expo-share-intent` 플러그인을 통해 OS의 '공유하기' 메뉴에 앱을 등록한다. 유저가 쿠팡 앱에서 `[공유하기] ➔ [세이브루]`를 선택 시, 백그라운드에서 URL을 가로채어 즉시 **클라이언트 스크래핑(Client-Side Fetch)** 파이프라인을 가동한다.
- **로직 B (iOS 및 수동 복사 폴백 - 클립보드 매직 넛지):** iOS의 Share Extension 빌드 복잡도를 피하고 기존 복사 습관을 가진 유저를 위해 클립보드 감지 방식을 2차 안전망으로 유지한다. `AppState`가 `background`에서 `active`로 전환 시 **반드시 500ms 딜레이** 후 클립보드를 읽고, `coupang.com` 포함 시 즉각 "추적할까요?" 모달을 최상단에 팝업시킨다.
- **[CRITICAL] 라우팅 강제 규칙:** 모달에서 [추적하기]를 누르면, **절대 백엔드(Firebase Functions)로 URL을 보내지 마라.** 과거의 구형 서버 스크래핑 로직은 전면 폐기되었으므로, 반드시 로직 A와 완벽하게 동일한 **프론트엔드 단독 클라이언트 스크래핑(Client-Side Fetch) 함수**를 호출하여 앱 내에서 파싱과 DB 저장을 완료해야 한다.
- **무한 루프 방지 방어막:** URL 가로채기 또는 클립보드 감지 직후 `Clipboard.setStringAsync('')`로 클립보드를 완전히 비워 동일 URL에 대한 중복 팝업을 차단한다.

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
- `optionId` 에 리뷰 귀속 금지.
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

### RULE-12 | 통신 아키텍처 하이브리드 분리 정책 (Client-WebView vs Server-API)
쿠팡의 Akamai WAF(방어막) 및 파트너스 API 보안 규정을 모두 만족시키고 OS 화면 납치(Hijack)를 방어하기 위해, 목적에 따라 통신 계층을 다음과 같이 엄격히 분리한다.

1. **[상품 최초 등록] 1픽셀 투명 웹뷰 클라이언트 스크래핑 강제 (Invisible WebView Natural Flow):**
   - **원리:** 클라우드 서버(GCP) 및 단순 `fetch()` 통신은 쿠팡의 JS 리다이렉트와 WAF에 의해 100% 차단되므로, 유저 스마트폰(앱)에 **보이지 않는 1픽셀 투명 웹뷰(`opacity: 0.01`)**를 띄워 직접 `link.coupang.com`에서 `m.coupang.com`으로 자연스럽게 접속(Natural Flow)시킨다.
   - **방어 기제:** 유저의 실제 통신망과 세션을 사용하므로 WAF를 완벽하게 우회하며, 쿠팡 웹페이지가 쏘아대는 앱 강제 실행 명령(`intent://`)은 웹뷰의 `onShouldStartLoadWithRequest` 인터셉터가 원천 차단하여 OS 화면 납치를 방어한다. 렌더링된 화면(DOM)을 믿지 않고, HTML 원시 텍스트 내의 JSON을 정규식으로 직접 뜯어내어 DB에 직행(Direct Write)한다.
2. **[제휴 API 호출 및 서버 갱신] 서버사이드 프록시 강제 (Server-Side Proxy & HMAC):**
   - **원리:** 파트너스 API(`api-gateway.coupang.com`) 호출을 위한 Secret Key가 앱 클라이언트에 노출되면 계정 탈취 위험이 크다.
   - **적용:** 딥링크 생성(`POST /deeplink`) 및 스케줄러를 통한 백그라운드 주기적 가격 갱신 크롤링은 반드시 **Firebase Cloud Functions(서버) + 가정용 프록시(Residential Proxy)**를 통해서만 수행해야 한다.

### RULE-13 | 수익화(Monetization) 코어 로직 변조 금지
- **딥링크 생성:** 상품 상세페이지 하단의 CTA 버튼(`[쿠팡에서 최저가 확인하기]`) 클릭 시, 반드시 `POST /deeplink` API를 호출하여 세이브루 트래킹 코드가 포함된 URL로 변환한 뒤 연결해야 한다. 이 단계를 누락하거나 우회하면 커미션 수익이 0원이 되므로 절대 건드려선 안 된다.
- **노출 트래킹(Impression):** V2 Reco API(맞춤 추천)를 사용할 경우, 상품이 화면에 렌더링된 시점에 반드시 `impressionUrl`을 백그라운드에서 호출하여 정상적인 광고 노출로 인정받아야 한다.

---

## 🏗 3. TECH STACK & ARCHITECTURE (기술 스택 및 아키텍처)

### 3.1 Stack
| Layer | Technology |
|---|---|
| Scraping Engine (Client) | React Native WebView (1px Hidden) + Raw HTML/JSON Regex Parser (OS Intent 차단 및 WAF 우회) |
| State | React Context (`TrackingContext`) + `useState` hooks |
| Backend | Firebase (Firestore + Functions + Auth + Storage) |
| Native Integration | `expo-share-intent` (Expo Config Plugin 기반 OS 공유하기 권한 연동) |
| Scraping Engine (Server) | `puppeteer-core` + `@sparticuz/chromium` (스케줄러 주기적 가격 갱신 전용) |
| Proxy Infra | Bright Data Residential Proxy (서버 스케줄러 WAF 우회용) |
| External API | Coupang Partners API (HMAC-SHA256 서명) |
| Auth | Anonymous 기본 + (추후 Kakao/Google SSO 확장) |
| Local Storage | `@react-native-async-storage/async-storage` |
| Clipboard | `expo-clipboard` (iOS 팝업 폴백 용도) |
| Physical Device | SM_S926N (Galaxy S24) 등 실제 디바이스 |

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
├── role: 'user' | 'admin' | 'blocked'    // [Update] 어뷰징 3회 누적 시 'blocked' 처리
├── nickname: string
├── selectedChildId: string | null
├── postCount: number
├── commentCount: number
├── streak_count: number          // 연속 접속일
├── level: number                 // 게이미피케이션 레벨 (1:일반맘, 2:성실맘, 3:열심맘, 4:우수맘)
│   └── [Tier Color Spec]: Lv.1(#475569), Lv.2(#047857), Lv.3(#B45309), Lv.4(#1E40AF)
├── total_saved_amount: number    // [신설] 실제 구매 인증(reward_claims)을 통해 영구 누적된 총 절약액
├── abuse_penalty_count: number   // [신설] 구매 인증 후 반품/취소 시 누적되는 패널티 스택 (3회 이상 밴)
├── createdAt: Timestamp
└── updatedAt: Timestamp

해당 스키마는 유저의 자녀 또는 임신 정보를 담는 핵심 객체다. **[RULE-12]**에 의거하여 데이터 무결성을 유지한다.
children/{childId}
├── userId: string (parent)
├── lastName: string              // [Mutable] 성 (필수 아님. 온보딩 시 '선택' 표기)
├── firstName: string             // [Mutable] 이름/태명 (필수. 단, 임신 중 미입력 시 '우리 아기' Fallback 처리)
├── gender: 'female' | 'male'     // [Immutable] 성별 (Lock: 가입 후 변경 불가)
├── birthDate: Timestamp          // [Immutable] 생년월일 (Lock: 가입 후 변경 불가)
├── type: 'child' | 'pregnancy' | 'planning'  // [One-way] 상태 (임신 계획 -> 임신 -> 아이 전이만 가능, 역행 불가)
├── careEnvironment: string[]     // [Mutable] 주 양육 환경 (단, '기타'는 단일 선택 배타성 적용)
├── concerns: string[]            // [Mutable] 육아 고민 (최대 3개 제한, RULE-03 상호배제 적용)
├── isFirstChild: boolean | null  // [Mutable] 초산 여부 (임신 중일 때만 수집)
├── isWorkingPregnant: boolean | null // [Mutable] 워킹 임산부 여부 (임신 중일 때만 수집)
├── isTakingSupplement: boolean | null // [Mutable] 영양제 복용 여부 (임신 계획 중일 때만 수집)
├── feedingType: 'breast' | 'formula' | 'mixed' | 'unknown'
├── ageMonth: number              // [Computed] 월령
├── stage: string                 // [Computed] 발달 단계 (RULE-12 슬라이딩 윈도우 기준)
├── categoryTags: string[]        // [Computed] 관심 카테고리 태그
├── region: string                // [Mutable] 지역 (optional)
├── pregnancyWeek: number | null  // [Computed] 임신 주차 (수집 금지. dueDate 기반 자동 계산용)
├── dueDate: Timestamp | null     // [Mutable] 임신 중일 때만 (UI에서 오늘+300일 Max 제한 적용)
├── weight: number | null         // [Mutable] 신체 정보 (기저귀/의류 사이즈 정밀 추천용. 온보딩 수집 안함)
├── height: number | null         // [Mutable] 신체 정보 (카시트/보행기 등 체격 추천용. 온보딩 수집 안함)
└── physicalUpdatedAt: Timestamp | null // [Critical] 신체 정보 마지막 갱신일 (Time Decay 로직 가동용)

#### 🔒 데이터 수정 권한 정책 (Edit Policy)
1. **고정 데이터 (Immutable):** gender, birthDate는 초기 입력 후 수정 페이지에서 비활성화(Disabled) 처리한다.
2. **가변 데이터 (Mutable):** lastName, firstName, careEnvironment, concerns, weight, height는 상시 수정 가능하다.
3. **상태 전이 (State Transition):** type은 '임신 계획(planning) → 임신(pregnancy) → 아이(child)' 등 앞 방향으로의 변경만 허용하며, 역행은 절대 차단한다. 출산 시 type을 변경하면 잠겨있던 gender와 birthDate 입력창이 활성화되어 1회 설정할 수 있다.

products/{productGroupId}
├── productGroupId: string (document ID, RULE-08 적용)
├── market: 'coupang' | 'naver' | '11st'
├── originalId: string (마켓별 원본 ID)
├── name: string (브랜드가 제거된 순수 상품명)
├── brand: string (API 또는 크롤러가 추출한 브랜드명)
├── spec: string (크롤러가 추출한 용량/수량 규격 텍스트. 예: "190ml / 30개")
├── regularPrice: number (일반 판매가)
├── wowPrice: number | null (크롤러가 수집한 와우 회원 전용 할인가. 수집 불가 시 null)
├── deepLink: string (앱에서 쿠팡 상품 상세페이지로 다이렉트 이동하는 스키마 URL)
├── status: 'active' | 'inactive' | 'pending'
├── stageTags: string[] (적용 가능 발달 단계)
├── categoryTags: string[] (카테고리)
├── problemTags: string[] (해결 가능 고민)
├── options: Array<{ optionId: string, name: string }>
├── offers: Array<Offer> (판매자별 오퍼 스냅샷)
├── optionStats: Object (클릭/전환/추적 통계)
├── boostScore: number (수동 노출 조정 점수)
├── image: string (썸네일 URL)
├── crawlerUpdatedAt: Timestamp (백엔드 크롤러 마지막 동기화 시간)
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
├── category: '육아수다' | '질문/고민' | '육아꿀템' | '특가제보' // [RULE-01] 맘카페 표준 목적형 카테고리
├── title: string                 // [UX] Max 40자 제한 강제
├── content: string
├── viewCount: number             // 조회수
├── commentCount: number
├── likeCount: number
├── taggedProduct: object         // [신설] brand, name, productId, price (C2C 직관성 확보용)
├── authorBabyMonthAtCreation: number // [신설/Critical] 글 작성 시점의 아이 월령 스냅샷 (동적 또래 매칭용)
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

reward_claims/{claimId}           // 쿠팡 파트너스 자동 트래킹 공백 보완 및 찐 후기 검증용
├── userId: string
├── productId: string
├── orderNumber: string           // 유저가 직접 입력
├── status: 'pending' | 'approved' | 'rejected' | 'rejected_by_return' // [Update] 반품 모니터링 적발 시 상태값
├── claimedPoints: number
├── savedAmountAtPurchase: number // [신설] 구매 당시 (평균가 - 구매가) 차액 스냅샷. 승인 시 total_saved_amount에 합산됨.
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
**[이미 태어났어요 / 임신 중이에요 공통 (단, 임신 중은 7종)]**
CONCERN_OPTIONS = [
  '피부/기저귀', '수면/재우기', '수유/이유식', '발달/놀이', '안전/외출', '없음'
]

**[임신 계획 중이에요 전용 배열 신설]**
CONCERNS_PLANNING = [
  '임신 준비/영양제',      // → 고단가 건기식 타겟팅
  '배란/가임기 확인',      // → 배란 테스트기 등 타겟팅
  '난임/병원 검사',
  '생활습관/체력 관리',
  '육아비용 절약',
  '기타',
  '없음'
]
* 공통 규칙: 최대 3개까지만 선택 가능. '없음' 선택 시 [RULE-03]에 의거하여 나머지 선택은 모두 해제(상호배제)됨.
```

### 4.4 생애주기 전이(State Transition) 및 폼 동기화 원칙
세이브루의 핵심인 코호트 알고리즘이 깨지지 않도록, 유저의 상태 변화와 데이터 수집 폼은 아래의 절대 규칙을 따른다.

1. **일방향 상태 전이:** 프로필 수정창(`ChildAddScreen.js`)에서 `type` 필드는 '임신 계획 ➔ 임신 ➔ 아이'의 앞 방향으로만 전이 가능하며, 역행은 차단한다.
2. **출산 시 동적 폼 개방 (Dynamic Unlocking):** 유저가 '임신 중'에서 '아이(출산)'로 상태를 변경하는 순간, 과거의 '출산 예정일' 입력창이 사라지고 `이름, 성별, 생년월일, 키, 몸무게` 입력 폼이 그 자리에 즉각 활성화되어야 한다. (과거 데이터는 LAL 추천을 위해 백그라운드에 보존됨)
3. **V2 스키마 미러링 (Mirroring):** 아이 정보 수정창은 반드시 최초 온보딩의 V2 규격(워킹맘 등 세분화된 육아 환경, 반려동물 유무 등)을 100% 동일하게 유지해야 한다. 과거 V1 규격(임신 주차, 엄마 혼자 등) 사용 시 알고리즘 붕괴로 간주한다.
4. **신체 정보 입력 완화:** 키와 몸무게는 입력 허들을 낮추기 위해 **반드시 [선택] 값**으로 세팅하며, 입력창 상단에 "정확하지 않아도 괜찮아요! 대략적인 수치로 맞춤 상품을 찾아드릴게요."라는 마이크로 카피를 강제 적용한다.

---

## 🧮 5. CORE ALGORITHM (핵심 추천 알고리즘)

> **파일 위치:** `src/services/recommendationService.js`
> **주의:** 본 알고리즘은 **[TECH SPEC RULE-12]**를 최우선으로 준수하는 **v4 통합 버전**이다. (과거 알고리즘 스펙은 본 장으로 완전 통합됨)

### 5.1 v4 통합 랭킹 공식
- **공식:** `finalScore = (CoupangOfficialRank * 0.6) + (PeerActionScore * 0.4)`
- **PeerActionScore 산출 로직 (Anti-Abuse 적용):**
  1. **구매 의도(70%):** `purchase_click` + `price_tracking_set` (실제 돈을 쓰려는 의지)
  2. **관심도(20%):** `saved_product_count` + `product_view_time` (체류 시간)
  3. **커뮤니티 반응(10%):** `post_product_click` (단순 호기심 클릭으로 간주하여 낮은 가중치 부여)
- **Time Decay:** 모든 액션은 최근 7일 데이터에 x1.5, 30일 이전 데이터에 x0.3 가중치를 주어 최신 트렌드를 강제로 반영함.

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

### 5.6 신체 데이터 감가상각 및 점진적 수집 (Progressive Profiling & Decay)
- **수집 시점:** 온보딩 단계에서는 이탈을 막기 위해 `weight`, `height`를 묻지 않는다. 대신 홈 탭 피드 탐색 중 넛지 UI를 통해 마이페이지에서 후행 수집(Progressive Profiling)한다.
- **Steep Time Decay (강제 만료):** 영유아의 급격한 성장을 반영하여, `physicalUpdatedAt` 기준 **생후 12개월 미만은 30일, 12~36개월은 90일**이 지나면 해당 신체 데이터 가중치를 `0`으로 무력화한다.
- **Fallback (대체):** 신체 데이터 만료 시, 추천 엔진은 유저가 입력한 옛날 데이터를 무시하고 해당 월령(ageMonth)의 '국가 표준 평균 키/몸무게'로 자동 폴백하여 추천 사이즈를 결정한다. 동시에 유저에게 "성장 정보 업데이트" 넛지를 발송한다.

### 5.7 생태계 보호 및 광고(Shilling) 방어 로직
1. **1인 1상품 태그 제한 (One-Review-Per-Product):** 특정 유저(`userId`)가 동일한 상품(`productId`)을 태그한 게시글은 평생 단 1회만 허용한다. (대행사 도배 방지)
2. **월령 불일치 필터링 (Age-Mismatch Filter):** 게시글 작성 시점의 월령(`authorBabyMonthAtCreation`)을 기록하고, '내 아이 맞춤 정보' 활성화 시 유저의 현재 월령과 맞지 않는 상품 홍보글은 노출에서 배제한다.
3. **승급 타임 게이팅:** 어뷰징 방지를 위해 하루에 최대 1단계씩만 승급이 가능하다.

---

## 📱 6. PAGE-BY-PAGE ARCHITECTURE (페이지별 상세 설계)

===================================================
🚀 SAVEROO V1 MASTER ARCHITECTURE MAP (무손실 완전판)
(본 맵은 단순히 진척도를 표기하는 것이 아닙니다. 앱의 UI Flow와 데이터 분기점, 그리고 마이크로 디테일을 완벽하게 텍스트로 가시화한 시스템 설계도입니다.)
===================================================

🚪 [ZONE A] 문지기 구역 (Auth Flow)
  - [A-1] 진입점: AsyncStorage 검사로 신규/기존 유저 판별
  - [A-2] 인증: 익명 로그인(Firebase Anonymous Auth) 진행 (네트워크 에러 방어)

📋 [ZONE B] 온보딩 구역 (Onboarding Pipeline: 3-Way Split)
  - [B-0] 인트로: 텍스트 로고 및 "육아 필수템 핫딜, 이제 놓치지 마세요!" 카피 노출 ➔ 다음으로 버튼
  - [B-1] 상태 분기(Switch): 거대한 버튼 3개 (이미 태어났어요 / 임신 중이에요 / 계획 중이에요)
  - [B-2] 동적 정보 입력 (Dynamic Input Flow):
      ├─ 👶 이미 태어났어요 Path: 
      │    ├─ (1) 이름 입력 (단, '성' 필수는 배제하고 UX 간소화)
      │    ├─ (2) 성별 버튼 선택 (남/여)
      │    └─ (3) 생년월일 피커 휠 노출 ➔ 입력 완료 시 다음 버튼 활성화
      ├─ 🤰 임신 중이에요 Path: 
      │    ├─ (1) 태명 입력 (선택) ➔ 키보드 회피(KeyboardAvoiding) 로직 적용
      │    └─ (2) 출산 예정일 (필수) ➔ 캘린더 Max Date +300일 제한, 하단에 "대략적 날짜도 괜찮아요" 안내 노출
      └─ 💭 임신 계획 중이에요 Path: 
           └─ (1) 계획 시기 (6개월/1년/1~2년/미정) 단일 선택 버튼 노출
  - [B-3] 환경 설정 (공통/동적 노출): 
      ├─ 육아 환경 (워킹맘/전업맘 등) 선택
      ├─ 초산 여부 및 영양제 복용 여부 (B-1의 선택 상태에 따라 동적 노출)
      └─ 반려동물 유무 (털갈이/청소포 등 타겟팅 가중치)
  - [B-4] 고민 카테고리 (LAL 엔진 핵심): 
      └─ 수면, 수유, 피부 등 칩(Chip) 다중 선택 ➔ [RULE-03] '없음' 선택 시 상호 배제(Clear) 로직 강제
  - [B-5] 전환 로딩 (Labor Illusion):
      └─ "데이터 분석 및 맞춤 큐레이션 세팅 중..." 카피와 함께 1.5초 가짜 로딩 스피너(스마트 블루) 노출

🏠 [ZONE C] 메인 탭 구역 (GNB 5-Tabs)
  - [C-0] 핵심 튜토리얼 (App Tour Guide):
      └─ 3단계 압축 코치마크 (홈 ➔ 커뮤니티 ➔ 관심상품) ➔ 종료 시 관심상품 탭(C-4)으로 강제 랜딩
  
  - [C-1] 홈 탭 (HomeScreen: Header & 6-Section Dashboard):
      ├─ [C-1-0] 상단 헤더 및 글로벌 검색 구역 (Home Header & Search Flow):
      │    ├─ (UI/기능) 확장된 검색바 (이모지 전구 철거) + 우측 🔔 알림 아이콘 노출.
      │    ├─ (알림 라우팅) 🔔 클릭 ➔ 알림 센터 진입 ➔ 설정 텔레포트 [D-4].
      │    └─ (글로벌 검색 라우팅) 🔍 검색바 클릭 시 `SearchScreen` 진입:
      │         ├─ [C-1-0-1] 검색 초기 화면: 최근 검색어 및 '지금 많이 찾는 검색어' (Top 3 스마트 블루 강조).
      │         ├─ [C-1-0-2] 결과 탭 1 [통합]: 검색어 일치 상품 Top 3 (RULE-9.4) + 커뮤니티 인기글.
      │         │    ├─ [상호 배제 UI]: 총 결과 > 3개 시 ➔ "검색 결과 N개 더보기 >" 버튼 노출 (배너 숨김).
      │         │    └─ [상호 배제 UI]: 총 결과 <= 3개 시 ➔ "원하는 상품이 없나요?" 등록 유도 배너 노출.
      │         ├─ [C-1-0-3] 결과 탭 2 [상품]: 검색 결과 전체 리스트 노출 (무한 스크롤 적용).
      │         │    ├─ [정렬 필터 순서]: `아이 또래 인기`(Default) ➔ `할인율순` ➔ `낮은 가격순`
      │         │    └─ [동적 USP 툴팁]: `아이 또래 인기` 활성화 시 하단에 안내 배너 ("ℹ️ 회원님과 비슷한 육아 환경...") 노출.
      │         └─ [C-1-0-4] 결과 탭 3 [커뮤니티]: 검색어 포함 맘톡 게시글 전체.
      │              ├─ [UI 정비]: 글쓰기(FAB) 버튼 제거 (검색 화면 내 작성 불가 로직).
      │              ├─ [카테고리 뱃지]: 이모지 배제, 회색 캡슐형 한글 라벨 렌더링.
      │              └─ [회원 등급 4티어 컬러 시스템]: Lv.1(#6B7280), Lv.2(#10B981), Lv.3(#F59E0B), Lv.4(#2E6FF2).
      │                           
      ├─ [C-1-1] 스마트 액션 대시보드 (최상단 핀테크 배너 - 3-Priority 동적 라우팅 알고리즘):
      │    ├─ 1순위 (가격 하락 감지): 관심상품 중 7일 이상 추적된 상품 대상, `MAX(평균가 - 현재가)` Top 1 상품 추출. 
      │    │    └─ 카피: "🚨 찜해둔 [상품명], 평균가 대비 [N]원 떨어졌어요!" ➔ 터치 시 [D-3] 상세 직행.
      │    ├─ 2순위 (누적 절약 락인): `users/{uid}.total_saved_amount > 0` 일 때 (구매인증 확정액).
      │    │    └─ 카피: "💰 [닉네임]님이 진짜로 아낀 돈, 벌써 [N]원 돌파!" ➔ 터치 시 [C-5] 마이페이지 직행.
      │    └─ 3순위 (생애주기 디폴트 넛지): 
      │         ├─ 자녀 있음: `ageMonth` 연동 "👀 생후 N개월 [이름] 또래 맘들이 쟁여둔 육아템" ➔ 터치 시 [C-2] 랭킹 직행.
      │         └─ 임신 중: `dueDate` 연동 "📝 출산 D-N! 예비맘 [닉네임]님을 위한 리스트" ➔ 터치 시 [C-2] 랭킹 직행.
      │
      ├─ [C-1-2] 5대 유니버설 퀵 메뉴 (트래픽 라우팅 & UI Polish):
      │    ├─ 디자인: 이모지 원천 금지, `lucide` 파스텔 라운드 뱃지 스타일.
      │    ├─ 오늘의 특가 ➔ CurationDetail(D-1: goldbox)
      │    ├─ 맞춤 랭킹 (네이밍 변경) ➔ Ranking(C-2) 탭 스위칭
      │    ├─ 실시간 맘톡 ➔ Community(C-3) 탭 스위칭
      │    ├─ 맞춤 추천 ➔ CurationDetail(D-1: reco+LAL)
      │    └─ 전체보기 ➔ 바텀 시트 열림 ➔ CategoryDetail(D-2) 동적 템플릿 이동 (여백 압착).
      │
      ├─ [C-1-3] 스마트 맞춤 특가 (미래 지향적 Facade Pattern 적용):
      │    ├─ 래퍼 로직: `fetchPersonalizedDeals` 호출 (프론트 수정 없이 향후 AI 엔진 연동 대비).
      │    ├─ 데이터: 임산부=1014/1012, 육아=1011. C-1-4와의 상품 복제(Clone) 방지.
      │    └─ 라우팅: 전체 > 클릭 시 Ranking(C-2) 이동. 금/은/동 랭킹 뱃지 강제 적용.
      │
      ├─ [C-1-4] 오늘의 맘템 베스트 (1011 찐 랭킹):
      │    ├─ 로직: 억지 필터링 없이 쿠팡 1011 전체 실시간 랭킹. 
      │    └─ 라우팅: 전체 > 클릭 시 CurationDetail(D-1: mamtem) 이동. 금/은/동 랭킹 뱃지 강제 적용.
      │
      ├─ [C-1-5] 오늘의 특가 (골드박스 타임딜 + 핀테크 타이머):
      │    ├─ UI 로직: 듀얼 탭 철거 완료. 매일 07:00 KST 리셋되는 `lucide Clock` 벡터 타이머 실시간 렌더링. 무의미한 타임특가 뱃지 제거.
      │    └─ 라우팅: 전체 > 클릭 시 CurationDetail(D-1: goldbox) 이동.
      │
      ├─ [C-1-6] 지금 쟁여야 할 생필품 핫딜 (가성비 소모품 추천)
      │    ├─ 카피: 제목 `할인 할 때 사야하는 생필품` / 설명 `가격 내려갔을 때 미리 담아야하는 상품`
      │    ├─ Data Source: 쿠팡 API `GET /products/coupangPL`. 
      │    ├─ API Rate Limit 방어 (Fallback): 해당 API 미작동 시 빈 화면을 막기 위해 백엔드에서 `searchProducts('탐사 기저귀')`로 검색 API를 돌려 Fallback 처리한다. 단, 파트너스 API 분당 50회 호출 제한(Rate Limit)으로 인한 계정 영구 정지를 막기 위해, 이 Fallback 로직은 유저 진입 시마다 실시간 호출하는 것을 엄격히 금지하며, 반드시 `products_cache` 컬렉션에 1시간 단위로 캐싱된 데이터를 불러오는 방식(RULE-12)으로 강제 작동해야 한다.
      │    └─ 라우팅: 전체 > 클릭 시 CurationDetail(D-1: pl_deals) 이동.
      │
      ├─ [C-1-7] 홈 탭 커뮤니티 베스트 (Community Preview):
      │    ├─ 렌더링: 최근 24시간 내 인게이지먼트 점수 Top 3 추출. 
      │    └─ 라우팅: '더보기 >' 클릭 시 단순 탭 이동이 아닌, 파라미터 `{ filter: 'hot' }`를 주입하여 커뮤니티 인기 피드로 강제 랜딩.
      │
      └─ [Global Data Rules]:
           1. 이미지 HTTP 차단 방어: 모든 이미지 맵핑 시 `.replace('http://', 'https://')` 정규식 강제.
           2. 텍스트 클렌징: 상품명 내 `[LIVE서버]`, `[API 브릿지 우회]` 등 보조바퀴 텍스트를 Regex로 완벽히 소거.
      
  - [C-2] 랭킹 탭 (RankingScreen): 완료 ✅ (초개인화 핀테크 대시보드 개편 완)
      ├─ [C-2-1] 글로벌 헤더: 가짜 검색바 ➔ `SearchScreen` 전역 라우팅 (인플레이스 키보드 차단).
      ├─ [C-2-2] 동적 카테고리 탭: 월령 36개월 이상 유저 진입 시 1011(출산) 탭을 1030(패션)/1020(완구)로 자동 스위칭.
      ├─ [C-2-3] 가격 하락 티커 배너: 주식 앱 스타일 연초록 배너. `CurationDetail` (오늘의 가격 하락템) 이동.
      ├─ [C-2-4] 또래 맞춤 토글:
      │    ├─ 1회성 코치마크 (이모지 금지, AsyncStorage 적용).
      │    ├─ 정보 모달: 랭킹 기준 커스텀 바텀 시트 노출 (Alert 금지).
      │    └─ 방어 로직: 데이터 모수 부족 시 빈 화면 대신 "데이터가 모이고 있어요" 핀테크 카드 노출.
      └─ [C-2-5] 리스트 UI 밀도: Hairline 구분선 압착. `[할인율] [₩현재가] [🚀 로켓배송]` 인라인 배치.

  - [C-3] 커뮤니티 탭 (Community 2.0 & C2C Engine): 완료 ✅
      ├─ [C-3-1] 인증 후기 동적 교차 필터 (Abuse Defense Platform Core):
      │    ├─ [인증 후기만 보기] 토글 ON ➔ `.where('verifiedPurchase', '==', true)` 강제 적용하여 진짜 돈 쓴 후기만 필터링.
      │    └─ 패널티 회수 로직: 쿠팡 반품 확인 시 백엔드 스케줄러가 인증 뱃지를 박탈(false)하고 유저 어뷰징 스택(+1) 누적 (3회 누적 시 Blocked).
      ├─ [C-3-2] 내 아이 맞춤 정보 토글: 활성화 시 작성자의 `authorBabyMonthAtCreation` 스냅샷을 검사하여 유저 자녀 발달 구간(±1~3개월) 일치 글만 노출.
      ├─ [C-3-3] 네이버 카페형 로컬 검색 (CommunitySearchScreen):
      │    └─ `[제목+내용]` / `[작성자]` / `[상품태그]` 3-Way 탭 검색. (상품태그 탭으로 찐 후기 역추적 가능).
      ├─ [C-3-4] 글쓰기 UX & 쿠팡 상품 검색 모달 (C2C):
      │    └─ 하단 파란색 `[🔗 상품 검색/태그]` 터치 ➔ 실제 쿠팡 API 연동 모달에서 상품 태그 ➔ 본문에 카드 첨부 ➔ 미등록 상품은 DB에 자동 확장(Expansion).
      └─ [C-3-5] 상품 직관화 리스트: `taggedProduct` 존재 시 게시글 제목 직하단에 `[ 🔗 브랜드명 - 상품명 ]` 뱃지 노출하여 CTR 극대화.

  - [C-4] 관심상품 탭 (SavedProductsScreen): 완료 ✅
      ├─ 텅 빈 화면 시 가이드 UI 렌더링. 딥링크 호출 (RULE-02).
      ├─ [RULE-05] 매직 넛지: AppState background ➔ active 시 클립보드 쿠팡 URL 감지하여 강제 등록 모달 팝업.
      │    └─ 모달에서 승인 시 백엔드 전송 없이 프론트엔드 단독 '1픽셀 투명 웹뷰' 스크래퍼를 즉시 가동.
      └─ 비금전적 게이미피케이션 (스트릭, 미션 관리 로직).

  - [C-5] 마이페이지 탭 (MyPageScreen): 완료 ✅
      ├─ [C-5-1] Seamless Footer: 프로필 닉네임/등급/자녀정보 직하단에 카카오 오피셜 배너(#FEE500) 밀착 앵커링 (약관동의 유도).
      ├─ [C-5-2] 퀘스트 카드: 다음 레벨(Lv.1~4) 달성 프로그레스 바.
      ├─ [C-5-3] Activity Grid: 4-Column 라우팅 ➔ `MyActivityScreen`(내가 쓴 게시글/댓글/좋아요 모아보기 및 필터 검색). [내 쿠폰함]은 커스텀 모달.
      ├─ [C-5-4] 최근 본 상품: 가로 캐러셀 최대 10개 퍼포먼스 제한. 전체보기 진입 시 개별 삭제(X) 기능 제공.
      └─ [C-5-5] 듀얼 혜택 리포트 (하단 앵커링):
           ├─ 기대 절약액: `SUM(추적 중 7일 이상 된 상품의 30일 평균가 - 현재가)`
           └─ 실제 누적 확정액: `users/{uid}.total_saved_amount` (인증 기반).

🔍 [ZONE D] 공통 상세 구역 (Detail Views)
  - [D-1] 테마별 큐레이션 전체보기 (CurationDetailScreen):
      ├─ 상단 스크롤 카테고리 탭 (동적 Extract 생성).
      ├─ 핀테크 Control Bar: 좌측 `[판매량순 ⌵]`(드롭다운 정렬) / 우측 `[☰ 리스트 / ⊞ 그리드]` (뷰어 토글, 진입 시 절대 기본값: 그리드).
      ├─ 랭킹 뱃지 로직: 그리드 뷰 = 썸네일 내부 좌상단 / 리스트 뷰 = 썸네일 외부 좌측(차트형) 1~3위 금은동 렌더링.
      ├─ Empty State: 우체통 이모지 철거, 벡터 아이콘 대체.
      └─ 우측 하단 `[↑ 맨 위로]` FAB 배치.
  
  - [D-3] 단일 상품 상세 페이지 (ProductDetailScreen - PDP): 완료 ✅
      ├─ 소셜 증명 훅: 최상단 "또래 맘 N명이 지켜보고 있어요" 노출.
      ├─ 핀테크 수학적 가격 추적 게이지: 
      │    └─ 점(Dot) 위치 공식 `((현재가-최저가)/(최고가-최저가))*100 + '%'`. 현재가가 평균가 초과 시 레드(#EF4444) 렌더링.
      ├─ 옵션 단가 비교표: `unitPrice` 파싱, 개별 알림 스위치.
      ├─ 대안 상품: `category_id` 일치 조건 강제.
      └─ 스티키 하단 제어: 여백 압살(`paddingBottom: 80` 강제). `POST /deeplink` 수익화 파이프라인.

🛠️ [ZONE E] 설정 및 CS 인프라 구역 (Settings & Operations)
  - [E-1] 등급 안내 화면 (`LevelInfoScreen`): Lv.1 ~ Lv.4 승급 조건 및 혜택. (Lv.2 부터 카카오 연동 강제).
  - [E-2] 설정 메인 (`SettingsScreen`): `expo-notifications` OS 알림 권한 연동 1-Depth 토글 (권한 Denied 시 앱 토글 강제 Lock 및 설정 딥링크).
  - [E-3] 인앱 고객센터 (`InquiryListScreen`): 40자 하드캡, Zoom 확대 모달, 대기/완료 뱃지 시각화.
  - [E-4] 탈퇴 및 초기화 플로우 (`WithdrawScreen`):
      ├─ Track A (익명): 기기/DB 즉시 Wipe 및 온보딩 랜딩.
      └─ Track B (카카오): 30일 유예(`pending_deletion`) 3-Bullet 안내 및 Auth 해제.

      ===================================================
🔀 [전역 액션-라우팅 매트릭스 (Action-to-Routing Matrix)]
(개발자 주의: 앱 내의 모든 터치 이벤트(`onPress`)는 반드시 아래의 목적지와 파라미터(Payload) 규격을 100% 준수하여 구현해야 한다.)
===================================================

[1. 홈 탭 (HomeScreen)의 모든 액션]
- 🔍 상단 가짜 검색바 터치 ➔ `SearchScreen` 진입 (인플레이스 키보드 노출 차단)
- 🔔 상단 알림 아이콘 터치 ➔ `NotificationScreen` 진입
- 🏷️ 최상단 스마트 배너 (가격하락) 터치 ➔ `ProductDetailScreen` (파라미터: `{ productId: Top1_상품ID }`)
- 🏷️ 최상단 스마트 배너 (누적절약) 터치 ➔ `MyPageScreen` (마이페이지 탭으로 강제 스위칭)
- 🏷️ 최상단 스마트 배너 (생애주기) 터치 ➔ `RankingScreen` (랭킹 탭으로 강제 스위칭)
- ⚡ 퀵메뉴 [오늘의 특가] 터치 ➔ `CurationDetailScreen` (파라미터: `{ type: 'goldbox', title: '오늘의 특가' }`)
- ⚡ 퀵메뉴 [맞춤 랭킹] 터치 ➔ `RankingScreen` (랭킹 탭 스위칭)
- ⚡ 퀵메뉴 [실시간 맘톡] 터치 ➔ `CommunityListScreen` (커뮤니티 탭 스위칭)
- ⚡ 퀵메뉴 [맞춤 추천] 터치 ➔ `CurationDetailScreen` (파라미터: `{ type: 'reco', title: '맞춤 추천 상품' }`)
- ⚡ 퀵메뉴 [전체보기] 터치 ➔ `CategoryBottomSheet` 모달 호출 ➔ 내부 카테고리 터치 시 ➔ `CategoryDetailScreen` (파라미터: `{ categoryId }`)
- 🛍️ 상품 썸네일/카드 터치 (전체 섹션 공통) ➔ `ProductDetailScreen` (파라미터: `{ productId }`)
- ➡️ [스마트 맞춤 특가] 우측 '전체 >' 터치 ➔ `RankingScreen` (랭킹 탭 스위칭)
- ➡️ [유아동 베스트] 우측 '전체 >' 터치 ➔ `CurationDetailScreen` (파라미터: `{ type: 'mamtem', title: '유아동 베스트 상품' }`)
- ➡️ [오늘의 특가] 우측 '전체 >' 터치 ➔ `CurationDetailScreen` (파라미터: `{ type: 'goldbox', title: '오늘의 특가' }`)
- ➡️ [생필품 핫딜] 우측 '전체 >' 터치 ➔ `CurationDetailScreen` (파라미터: `{ type: 'pl_deals', title: '할인 할 때 사야하는 생필품' }`)
- 📝 커뮤니티 프리뷰 게시글 터치 ➔ `PostDetailScreen` (파라미터: `{ postId }`)
- ➡️ 커뮤니티 '더보기 >' 터치 ➔ `CommunityListScreen` (파라미터: `{ filter: 'hot' }` - 인기 필터 강제 적용하여 랜딩)

[2. 랭킹 탭 (RankingScreen)의 모든 액션]
- 🔍 상단 가짜 검색바 터치 ➔ `SearchScreen` 진입
- 탭 메뉴 (식품, 생활용품 등) 터치 ➔ 해당 카테고리 데이터로 `FlatList` State 변경 (화면 이동 없음)
- 📉 가격 하락 티커 배너 터치 ➔ `CurationDetailScreen` (파라미터: `{ type: 'price_drop', title: '오늘의 가격 하락템' }`)
- ℹ️ [또래 맞춤] 정보 알약 뱃지 터치 ➔ 랭킹 기준 설명 `BottomSheet` 모달 노출 (Alert 금지)
- 🛍️ 상품 썸네일/카드 터치 ➔ `ProductDetailScreen` (파라미터: `{ productId }`)

[3. 커뮤니티 탭 (CommunityListScreen)의 모든 액션]
- 🔍 상단 검색 아이콘 터치 ➔ `CommunitySearchScreen` 진입 (글로벌 검색 아님. 로컬 커뮤니티 검색임)
- 탭 메뉴 (질문, 꿀템 등) 터치 ➔ 해당 카테고리 데이터로 리스트 State 변경
- 📝 게시글 항목 터치 ➔ `PostDetailScreen` (파라미터: `{ postId }`)
- 🏷️ 게시글 제목 하단 [🔗 상품 태그 칩] 터치 ➔ `ProductDetailScreen` (파라미터: `{ productId }`)
- ✍️ 하단 [글쓰기 FAB] 터치 ➔ `WritePostScreen` 진입

[4. 마이페이지 탭 (MyPageScreen)의 모든 액션]
- ⚙️ 우측 상단 설정 아이콘 터치 ➔ `SettingsScreen` 진입
- 👤 프로필 사진/영역 터치 ➔ 닉네임 수정 모달 팝업
- 🎖️ [일반맘 >] 등 뱃지 터치 ➔ `LevelInfoScreen` 진입
- 👶 아이 정보 [수정 >] 터치 ➔ `ChildAddScreen` 진입 (Edit Mode 파라미터)
- 🟨 카카오 락인 풋터 배너 터치 ➔ 카카오 약관동의 및 SSO 연동 플로우 가동
- 📊 [내가 쓴 게시글] 터치 ➔ `MyActivityScreen` (파라미터: `{ activeTab: '내가 쓴 게시글' }`)
- 📊 [내가 쓴 댓글] 터치 ➔ `MyActivityScreen` (파라미터: `{ activeTab: '내가 쓴 댓글' }`)
- 📊 [좋아요한 글] 터치 ➔ `MyActivityScreen` (파라미터: `{ activeTab: '좋아요한 글' }`)
- 🎁 [내 쿠폰함] 터치 ➔ 쿠폰 혜택 준비 중 `BottomSheet` 모달 노출 (Alert 금지)
- 🛍️ 최근 본 상품 썸네일 터치 ➔ `ProductDetailScreen` (파라미터: `{ productId }`)
- ❌ 최근 본 상품 [X] 아이콘 터치 ➔ 로컬 캐시에서 해당 상품 즉시 삭제 (State 갱신)
- ➡️ 최근 본 상품 [전체보기 >] 터치 ➔ `RecentlyViewedProductsScreen` 진입
- 📉 하단 혜택 리포트 (관심상품 기대 절약액) 터치 ➔ `SavedProductsScreen` (관심상품 탭으로 강제 스위칭)

[5. 단일 상품 상세 화면 (ProductDetailScreen)의 모든 액션]
- 🔗 상단 [지인 공유] 아이콘 터치 ➔ 네이티브 Share API 가동 (딥링크 및 절약 카피 포함)
- 🛍️ 대안 상품(다른 옵션/유사 상품) 캐러셀 터치 ➔ `ProductDetailScreen` (새로운 `productId`로 현재 화면 Stack에 Push)
- 🔔 다른 옵션보기 우측 [종 아이콘] 터치 ➔ 해당 옵션 가격 추적 State 토글 및 Toast 알림 노출
- 🛒 최하단 스티키 CTA [쿠팡에서 최저가 확인하기] 터치 ➔ 
   1) `user_product_actions`에 클릭 로그 적재 
   2) `POST /deeplink` 서버 호출 
   3) `Linking.openURL(affiliateUrl)`로 쿠팡 앱 아웃링크 실행

[6. 설정 및 인프라 화면의 모든 액션]
- ⚙️ 설정 화면 내 알림 토글 터치 ➔ OS 알림 권한 체크 ➔ 거부 시 `Linking.openSettings()` 실행
- ⚙️ 설정 화면 내 [1:1 문의] 터치 ➔ `InquiryListScreen` 진입
- ⚙️ 설정 화면 내 [앱 데이터 초기화 / 계정 탈퇴] 터치 ➔ `WithdrawScreen` 진입
- 📝 문의 리스트 내 [문의 접수하기] 터치 ➔ `InquiryWriteScreen` 진입 ➔ 폼 제출 시 리스트로 `goBack()`

===================================================

### 6.1 온보딩 페이지 (`OnboardingScreen.js`)
**목적:** 유저 최초 진입 시 기본 데이터 수집. (앱 내 공식 명칭: **"온보딩 페이지"**)
단순한 1차원 설문조사가 아닌, 세이브루의 핵심인 **초개인화 큐레이션(LAL 알고리즘) 가동을 위한 다차원 코호트 기준 데이터를 수집하는 최초 진입 및 셋업 엔진**이다.

**진입 트리거 (Routing Trigger):**
1. 앱 최초 설치 후 실행 시: `AsyncStorage`에 완료 플래그가 없으면 무조건 강제 진입.
2. 회원 탈퇴 시: 설정에서 탈퇴 시 모든 데이터를 Wipe한 후 새로운 환경 수집을 위해 1단계로 즉시 롤백(Reset).

**데이터 수집 플로우 (Dynamic Inline Expansion UX 적용):**
1. 환영 화면 (스킵 불가)
2. 로그인 방식 선택 (기본: 익명 / 카카오·구글 SSO)
3. **생애주기 및 환경 정보 입력 (상태별 동적 렌더링):**
   - **"이미 태어났어요" 선택 시:**
     - `생년월일`, `성별`, `이름(성 선택화, 키보드 완료 시 성별 버튼 노출)` 스르륵 노출
     - 헤더 마이크로카피: *"어떤 환경에서 육아하고 계세요?"*
   - **"임신 중이에요" 선택 시:**
     - `출산 예정일` (최대 오늘+300일 제한. 하단에 "대략적인 날짜도 괜찮아요" 카피), `태명(선택)` 노출
     - 맞춤 타겟팅 추가: **"첫째 아이인가요?", "현재 직장에 출근 중이신가요?"** (Yes/No 토글, 재클릭 시 선택 해제 가능)
     - 헤더 마이크로카피: *"현재 어떤 환경에서 지내고 계세요?"*
   - **"계획 중이에요" 선택 시:**
     - `계획 시기` 버튼군 노출
     - 맞춤 타겟팅 추가: **"임신 준비를 위해 영양제를 챙겨 드시고 계신가요?"** (Yes/No 토글, 재클릭 시 선택 해제 가능)
     - 헤더 마이크로카피: *"현재 어떤 환경에서 지내고 계세요?"*
   - **(공통)** `육아 환경 ('기타' 배타성 적용)` 및 `반려동물 유무` 선택
   - **(공통)** 스마트 할인가 계산을 위한 멤버십 정보 수집: "쿠팡 와우 회원이신가요?" (Yes/No 토글, 기본값: Yes)
4. **고민 카테고리 선택** (Chip multi-select) 
   - 상태별 배열 로드 (계획 중은 `CONCERNS_PLANNING` 로드). 최대 3개 선택 제한 및 RULE-03('없음' 배타성) 적용.
5. 완료 버튼 클릭 ➔ **2초간 맞춤 핫딜 세팅 가짜 로딩(Labor Illusion) 화면 노출 후 홈 탭 진입**
6. 튜토리얼 ➔ **3단계 압축 코치마크 (홈->커뮤니티->관심상품) 후 관심상품 탭 강제 랜딩**

**Firestore Write:**
- `users/{uid}` 생성 (익명 시 `provider: 'anonymous'`, `selectedChildId` 설정)
- `children/{childId}` 생성 (computed fields 및 환경/고민 데이터 모두 포함)

---

### 6.2 [ZONE C-1] 홈 탭 (`HomeScreen.js`)
**목적:** 유저 데이터와 쿠팡 API를 결합한 초개인화 판단 보조 대시보드.

**[데이터 정책 및 UI 규칙]**
1. **[무결점 썸네일 보장] ATS 보안 및 HTML 스크래핑 강제 추출 로직:**
   - 쿠팡 API가 `http://` 썸네일을 주어 최신 모바일 OS(ATS)가 이미지를 차단하는 것을 막기 위해 무조건 `.replace('http://', 'https://')` 정규식을 거친다.
   - **(CRITICAL) 빈 화면 원천 차단:** 쿠팡 API가 판매자 예외 등으로 이미지 URL을 `null`로 리턴하거나 잘못 포맷팅했을 경우, 절대 세이브루 자체 로고(Dummy)로 퉁치지 마라. 앱 단에서 즉시 백그라운드로 '1픽셀 투명 웹뷰(Invisible WebView)'를 가동하여 해당 상품 웹페이지의 JSON 원시 데이터 및 `og:image` 메타 태그를 강제 스크래핑해 실제 상품 이미지를 화면에 바인딩한다. (단일 상품 상세 진입 시 작동).
2. **[뱃지 배치 규칙]:** - **[랭킹 순위(1~3위)] 뱃지:** 썸네일 내부 좌측 상단(`position: 'absolute', top: 8, left: 8`)에 고정 배치.
   - **[최저가] 뱃지:** 썸네일 내부 우측 상단(`position: 'absolute', top: 8, right: 8`)에 고정 배치. (좌측 순위 뱃지와 절대 겹치지 않도록 좌표 분리)
   - **[물류/인증 뱃지 (로켓/무료/인증)]:** 썸네일 컨테이너 영역 내부 배치를 원천 금지함. 반드시 썸네일 외부(현재 판매가 텍스트 우측 또는 단가 정보 하단)에 인라인으로 배치하여 분석 뱃지와 시각적 간섭을 0%로 통제함.
3. **[텍스트 정제]:** 상품명 내 불필요한 테스트 문구는 정규식으로 삭제. API 규격 필드 부재 시 상품명에서 정규식(`/\d+ml|\d+개|\d+매|\d+g/g`)을 통해 규격을 추출하여 노출.
4. **[커뮤니티 라우팅]:** 홈 하단 '지금 뜨는 맘톡'의 [더보기] 클릭 시, 인기 게시글 필터(`{ filter: 'hot' }`)가 적용된 커뮤니티 탭으로 랜딩.

**UI 구조, API 매핑 및 라우팅 (6대 섹션 아키텍처):**

**[Section 1] 개인화 대시보드 (스마트 액션 위젯)**
- **목적:** 유저의 구매 심리를 극대화하고 체류를 유도하는 핀테크 스타일의 최상단 동적 배너.
- **UI:** 흰색 배경, 옅은 파스텔톤 그림자, 라운드 카드 형태. 이모지 대신 `lucide` 아이콘 활용.
- **우선순위별 노출 및 데이터 추출 로직 (Dynamic Routing & Algorithm):**
  
  **[Priority 1] FOMO 타겟팅 폭격: 관심상품 전일 대비 급락 감지 (최우선 노출)**
  - **기획 의도:** 60일 평균가 비교(이성적 판단)보다 '어제 대비 오늘'의 하락폭(감정적 긴박함)을 강조하여 즉각적인 클릭(CTR)과 결제를 유도함.
  - **알고리즘 가드레일 (고가/저가 모순 방어 임계점):** 1. 최소 2일 이상의 추적 데이터가 존재하여 '어제 가격'과 '오늘 가격' 비교가 가능할 것.
    2. 단순 하락이 아닌, **`어제가격 대비 하락률 >= 5%`** 이거나 **`어제가격 대비 하락액 >= 2,000원`** 인 상품만 1순위 후보로 등록. (고가 상품은 비율로, 저가 상품은 절대 금액으로 방어하여 시시한 알림 차단).
  - **수학 공식:** 위 조건을 만족하는 관심상품 리스트 중 `MAX(어제가격 - 현재가)`인 단일 상품(Top 1) 추출.
  - **카피 (이모지 밴 적용):** `🚨 [상품명(15자 컷)], 어제보다 [할인액]원 더 떨어졌어요. ➔`
  - **라우팅:** 클릭 시 해당 상품의 상세 페이지(`ProductDetailScreen`)로 다이렉트 이동.

  **[Priority 2] 영끌 락인: 진짜 실구매 기반 영구 누적 절약액**
  - **알고리즘 가드레일:** 장바구니에 담긴 가상의 금액이 아니라, 유저가 실제로 결제하고 인증(`reward_claims` 승인)하여 `users/{uid}.total_saved_amount`에 적재된 '확정 절약액'을 렌더링.
  - **수학 공식:** `total_saved_amount > 0` 일 때 노출.
  - **카피:** `💰 세이브루 관심상품 가격 추적으로 지금 당장 아낄 수 있는 돈 총 [Amount]원! ➔`
  - **라우팅:** 클릭 시 마이페이지 탭(`MyPageScreen`)으로 이동하여 절약 리포트 확인.

  **[Priority 3] 디폴트 넛지: 생애주기 초개인화 인사이트**
  - **알고리즘 (아이 있음):** `ageMonth` 연동 ➔ `👀 생후 [월령]개월 [아이 이름] 또래 맘들이 쟁여둔 육아템 ➔`
  - **알고리즘 (임신 중):** `dueDate` 연동 ➔ `📝 출산 D-[디데이]! 예비맘 [닉네임]님을 위한 필수 리스트 ➔`
  - **라우팅:** 클릭 시 `맞춤 랭킹(RankingScreen)` 탭으로 스위칭 이동.

**[Section 2] 5대 유니버설 퀵 메뉴 (Core Navigation)**
- **목적:** 타겟팅 데드존(Dead Zone)을 없애고 모든 유저가 보편적으로 누릴 수 있는 핵심 기능으로 트래픽 분산.
- **UI 마감 (UX Polish):** 이모지 금지. `lucide-react-native`의 단색 벡터 아이콘 사용. 스마트 블루 연한 파스텔톤 배경의 원형 뱃지 스타일 적용.
- **라우팅 지도:**
  1. **🔥 오늘의 특가:** `CurationDetailScreen` 이동 (API: `GET /products/goldbox` 파라미터 전달)
  2. **🏆 맞춤 랭킹:** `RankingScreen` (하단 GNB 랭킹 탭으로 스위칭). 네이밍 '또래'에서 '맞춤'으로 변경하여 초개인화 강조.
  3. **💬 실시간 맘톡:** `CommunityListScreen` (하단 GNB 커뮤니티 탭으로 스위칭)
  4. **✨ 맞춤 추천:** `CurationDetailScreen` 이동 (API: `GET /products/reco` + LAL 알고리즘 파라미터 전달)
  5. **⊞ 전체보기:** BottomSheet Modal 스르륵 호출 ➔ 모달 내에서 카테고리 선택. (바텀 시트 내 이모지 절대 금지, 여백 압착).

**[Section 3] 스마트 맞춤 특가 (미래 지향적 Facade Pattern 적용)**
- **동적 카피:**
  - 유저 자녀 있음 ➔ 제목: `내 아이 맞춤 특가 상품` / 설명: `내 아이와 유사 환경의 부모가 자주 찾는 특가 상품`
  - 유저 임신/계획 ➔ 제목: `출산 맞춤 특가 상품` / 설명: `출산을 준비하는 부모가 자주 찾는 특가 상품`
- **스마트 어댑터 로직 (`fetchPersonalizedDeals`):** 향후 LAL(초개인화) 엔진 도입 시 앱(프론트엔드) 업데이트 없이 서버 스위치만 변경하기 위한 래퍼(Wrapper) 함수.
  - *현재(Phase 1):* 임산부일 경우 `1014(생활용품)` 또는 `1012(식품)` 호출. 자녀가 있을 경우 `1011(유아동)` 호출하여 Section 4와의 데이터 복제(Clone) 현상 방지.

**[Section 4] 오늘의 맘템 베스트 (1011 찐 랭킹)**
- **카피:** 제목 `유아동 베스트 상품` / 설명 `우리아이 또래 부모들이 가장 많이 찾는 제품`
- **Data Source:** 쿠팡 API `GET /bestcategories/1011`. (억지 필터링 없이 출산/유아동 코어 타겟팅)

**[Section 5] 오늘의 특가 (골드박스 타임딜 + 핀테크 타이머)**
- **UI 절대 규칙:** 제목 옆에 촌스러운 이모지(⏳) 사용 금지. 연한 붉은색 알약 뱃지 안에 `lucide`의 Clock 아이콘과 붉은 텍스트로 **매일 아침 07:00 KST를 향해 줄어드는 카운트다운 타이머**를 실시간(`setInterval`)으로 렌더링.
- **카피:** 제목 `오늘의 특가 [타이머]` / 설명 `매일 아침 업데이트되는 오늘 할인 상품`
- **Data Source:** 쿠팡 API `GET /products/goldbox` (전체 원본. 듀얼 탭 철거).

**[Section 6] 지금 쟁여야 할 생필품 핫딜 (가성비 소모품 추천)**
- **카피:** 제목 `할인 할 때 사야하는 생필품` / 설명 `가격 내려갔을 때 미리 담아야하는 상품`
- **Data Source:** 쿠팡 API `GET /products/coupangPL`. 단, 해당 API 미작동 시 빈 화면을 막기 위해 서버 단에서 `searchProducts('탐사 기저귀' 또는 '코멧 물티슈')`로 강제 Fallback 연동 처리 필수.

---

🚨 [글로벌 데이터 파이프라인 및 UI/UX 절대 규칙] 🚨
> 홈 화면 및 리스트 화면(`ProductCard.js`) 렌더링 시 발생하는 치명적 레이아웃 붕괴를 영구 차단하기 위한 하드코어 규정.

1. **[무결점 썸네일 보장] ATS 보안 및 HTML 스크래핑 강제 추출 로직:** - 쿠팡 API가 `http://` 썸네일을 주어 최신 모바일 OS(ATS)가 이미지를 차단하는 것을 막기 위해 무조건 `.replace('http://', 'https://')` 정규식을 거친다.
   - **(CRITICAL) 빈 화면 원천 차단:** 쿠팡 API가 판매자 예외 등으로 이미지 URL을 `null`로 리턴하거나 잘못 포맷팅했을 경우, 절대 세이브루 자체 로고(Dummy)로 퉁치지 마라. 이는 쇼핑몰의 신뢰도를 박살내는 행위다. 앱 단에서 즉시 백그라운드로 해당 상품의 실제 웹페이지 URL로 접속(fetch)하여, 웹 HTML 헤더 영역 내에 숨겨진 미리보기 이미지 태그인 **`og:image` 소스 정보(`/<meta property="og:image" content="(.*?)"/`)를 정규표현식으로 강제 스크래핑(Scraping)**해내어 무조건 실제 상품 이미지를 화면에 바인딩 출력한다.

2. [뱃지 배치 규칙] 뱃지 간 중첩 방지 및 시각적 위계 설정:
   - [랭킹 순위(1~3위)] 뱃지: 썸네일 내부 '좌측 상단'(`position: 'absolute', top: 8, left: 8`)에 고정 배치. 금/은/동 원형 뱃지 사용.
   - [최저가] 뱃지: 썸네일 내부 '우측 상단'(`position: 'absolute', top: 8, right: 8`)에 배치. 순위 뱃지와 물리적 위치를 분리하여 중첩 방지.
   - [로켓배송/무료배송] 뱃지: 썸네일 이미지 영역 내부 배치를 원천 금지함. 반드시 썸네일 바깥쪽 본문 영역인 '현재 판매가 텍스트 우측' 또는 '단가 정보 하단'에 인라인(Inline)으로 배치하여, 썸네일 내부의 분석 뱃지(순위/최저가)와 절대 겹치지 않게 통제함.

3. **[문자열 정제] 보조바퀴 텍스트 정규식 클렌징:** - 상품명(`productName`)에 서버 테스트용으로 붙었던 `[LIVE서버]`, `[API 브릿지 우회]` 등의 텍스트는 정규표현식으로 완벽히 치환(`replace`) 및 `trim()` 하여 상용 앱 수준의 깔끔한 텍스트만 렌더링한다.
   - API에 상품 규격(용량/수량)이 별도 필드로 내려오지 않을 경우, 상품명 문자열 내에서 정규식(`/\d+ml|\d+개|\d+매|\d+g/g`)을 돌려 텍스트를 추출해 상품명 바로 밑에 단가(`unitPrice`)와 함께 결합 렌더링한다.

**[Visual Rhythm & Spacing Rules]**
- 메인 타이틀과 '전체 >' 버튼은 반드시 수평(`alignItems: 'center'`) 정렬.
- 이중 마진(Double Margin) 절대 금지. 오직 `marginBottom`으로만 간격 통제.
- 배너 ↔ 퀵메뉴: `16px` (밀착) / 퀵메뉴 ↔ 섹션 간: 8px 두께 연회색 파티션(Divider, `#F3F4F6`).

**[홈 ➔ 커뮤니티 진입 트래픽 라우팅 절대 규칙]**
- 홈 화면 최하단 '지금 뜨는 맘톡' 섹션의 `[더보기 >]` 버튼을 클릭할 경우, 유저를 단순 커뮤니티의 '전체/최신순' 탭으로 랜딩시키면 안 된다.
- 반드시 네비게이션 Payload에 `{ filter: 'hot' }` 또는 `{ tab: '인기글' }` 속성을 포함하여 라우팅해야 한다.
- 커뮤니티 탭(C-3)은 이 파라미터를 받아, 진입 즉시 '인기/베스트' 필터가 적용된 상태의 화면을 렌더링해야 한다.

---

### 6.3 랭킹 탭 (RankingScreen.js) - ZONE C-2
**목적:** 단순 쇼핑몰 랭킹이 아닌, 쿠팡 API 판매 데이터(60%)와 동년배 부모의 행동 데이터(40%)를 결합한 '초개인화 판단 보조 대시보드'.

**[1] 상단 헤더 (글로벌 일관성)**
- **UI:** 홈 탭(HomeScreen)과 완벽히 동일한 헤더 구조를 사용한다.
- **요소:** 좌측 '가짜 검색바(버튼형)' + 우측 '알림 종(🔔) 아이콘'.
- **라우팅:** 가짜 검색바 터치 시 인플레이스 키보드가 올라오는 것을 막고, 전역 검색 화면인 `SearchScreen`으로 라우팅한다.

**[2] 동적 카테고리 탭 (생애주기 기반 스위칭 & 라벨링)**
- **기본 정렬:** 가장 비싼 첫 화면의 범용성을 확보하기 위해 `[생활용품(1014)] ➔ [식품(1012)] ➔ [출산/유아동(1011)]` 순서로 배치한다.
- **유아기(36개월 이상) 자동 스위칭:** 아이가 유아기 이상일 경우 출산/유아동 탭을 제거하고 `[생활용품(1014)] ➔ [식품(1012)] ➔ [유아동패션(1030) 또는 완구(1020)]`으로 교체한다.
- **동적 라벨링(Label Switching):** 쿠팡 API 카테고리 1012(식품 전체) 호출 시, 유저 자녀의 월령에 따라 UI 라벨 텍스트를 다르게 렌더링하여 디테일을 살린다.
  - `월령 < 12개월`: **"식품/분유"** 로 노출
  - `월령 >= 12개월`: **"식품/간식"** 으로 노출

**[3] 가격 하락 티커 배너 (Ticker Banner)**
- **UI:** 탭 아래 연초록 배경의 핀테크 주식 앱 스타일 배너 배치.
- **동적 텍스트:** `현재 [${선택된_동적_카테고리명}] 제품 중 N개 상품의 가격이 어제보다 하락했어요.` (카테고리명 동적 바인딩)
- **라우팅:** 배너 터치 시 `CurationDetailScreen` (파라미터: `{ type: 'price_drop', title: '오늘의 가격 하락템' }`)으로 즉시 이동한다. 관심상품 탭으로의 Fallback 라우팅은 폐기한다.

**[4] 또래 맞춤 토글 & 코치마크 & 방어 로직**
- **코치마크 (1회성):** `position: 'absolute'`로 띄워 레이아웃 밀림을 방지한다. `AsyncStorage`를 사용해 최초 1회만 노출("내 아이와 비슷한 또래 및 육아 환경에 맞춰 랭킹을 추천해 드려요.")하며 터치 시 영구 해제한다. 이모지 사용 금지.
- **모달 워딩 (RULE-9.4 커스텀 모달 강제):** "랭킹 기준 ℹ️" (회색 알약 뱃지) 클릭 시 노출.
  - [전체 랭킹]: "쿠팡 판매 데이터를 바탕으로 선정한 베스트 상품"
  - [또래 맞춤 랭킹]: "내 아이와 비슷한 또래 부모님들이 실제 가장 많이 선택하고 인정한 상품 (육아 환경 + 관심사 반영)"
- **데이터 방어 (Fallback):** [또래 맞춤] 토글 시 내부 행동 데이터가 부족할 경우, 빈 화면 대신 노란색 핀테크 카드 배너(ℹ️ 아이콘 포함)를 노출한다. ("⚠️ 아직 또래 맘들의 데이터가 모이고 있어요! 우선 쿠팡 전체 랭킹을 보여드릴게요.")

**[5] 상품 리스트 UI 밀도 압착 (Density)**
- 무한 스크롤 형태의 `FlatList` 렌더링.
- **UI 쫀쫀함 유지:** 항목 간 1px 연회색 실선(Hairline Divider)을 적용하고, 카테고리 하단 여백 등 잉여 Margin/Padding을 0으로 압착하여 한 화면 노출 상품 수를 극대화한다.
- **로켓배송 태그 위치:** 카드 최하단에 고립시키는 것을 금지한다. 의사결정 효율을 위해 가격 영역 우측(`[할인율] [현재가] [로켓배송]`)에 인라인(Inline)으로 배치한다.

---

### 6.4 커뮤니티 탭 (Community 2.0 & C2C Engine)
**목적:** 단순한 수다방을 넘어, 유저가 자발적으로 상품을 리뷰하고 태그하여 커미션 수익을 창출하는 **'Context-to-Commerce(C2C) 엔진'**이자 대한민국 최대의 맘템 아카이브.

**1. 동적 발달 구간화 알고리즘 (Dynamic Age Segmentation)**
- **[관행 탈피]** 기존 백엔드 편의를 위한 하드코딩 필터(±3개월)를 절대 금지한다.
- **[스냅샷 로직]** 게시글 작성 시, 작성자 아이의 '현재 월령'을 `authorBabyMonthAtCreation` 필드에 영구 박제(Snapshot)한다.
- **[동적 매칭 구간]** 유저가 리스트 상단의 **[내 아이 맞춤 정보]** 토글을 켤 경우, 유저의 현재 아이 월령에 따라 아래와 같이 필터링 범위를 고무줄처럼 동적으로 조절하여 노출한다.
  - 0~12개월 (영아): `±1~2개월` (주 단위로 발달이 변하므로 초정밀 매칭)
  - 13~36개월 (유아): `±3~6개월` (선배맘 조언 유효 구간)
  - 37개월 이상 (어린이): `±12개월` (연 단위 광역 매칭)
- **[UX]** 위 복잡한 로직을 UI에 숫자로 노출하지 않고, ℹ️ 툴팁에 "AI가 아이의 발달 단계를 분석하여 스마트하게 모아보여드려요"로 추상화하여 전문성을 높인다.

**2. 독립형 커뮤니티 로컬 검색 (Naver Cafe Style)**
- 상단 돋보기 클릭 시 글로벌 통합 검색(`SearchScreen`)으로 가는 것을 원천 차단하고, 커뮤니티 전용 검색창(`CommunitySearchScreen`)으로 이동시킨다.
- **3-Way 탭 시스템:** `[제목+내용]` / `[작성자]` / `[상품태그]`
  - 특히 **[상품태그]** 탭은 유저가 '다이치 카시트'를 검색했을 때, 해당 상품이 `taggedProduct`로 첨부된 게시글만 필터링하여 '찐 후기'만 모아볼 수 있게 하는 세이브루의 킬러 피처다.
- **빈 화면 방어:** 검색 전에는 리스트를 숨기고 빈 화면 안내를 노출하며, 검색 시 '내 아이 맞춤 정보' 필터는 자동으로 해제되어 검색 볼륨(결과 수)을 최대로 확보한다.

**3. 글쓰기 UX & 쿠팡 상품 검색 모달 (WritePost UX)**
- **제약 조건:** 제목은 리스트 가독성 방어를 위해 40자로 강제 제한(`maxLength={40}`)한다.
- **이미지 어포던스:** 하단 툴바의 작은 카메라 아이콘에만 의존하지 않고, 이미지 리스트 최앞단에 `[ 📷 0/5 ]` 형태의 회색 점선 스켈레톤 박스를 상시 노출하여 직관성을 높인다.
- **상품 태그 및 자동 등록 파이프라인 (C2C Core):**
  - 유저가 하단의 `[🔗 상품 검색/태그]` 파란 버튼을 누르면, 가짜 알림창이 아닌 **실제 쿠팡 API와 연동된 상품 검색 모달**이 하단에서 스르륵 올라온다.
  - 검색 후 상품을 선택(태그)하면 글쓰기 본문 하단에 상품 미니 카드가 첨부된다.
  - **[Data Expansion]** 유저가 세이브루 DB에 없는 새로운 쿠팡 상품을 검색해서 태그할 경우, 서버가 해당 상품을 `products` DB에 자동 등록하여 '유저 주도형 가격 추적 DB 확장'을 이뤄낸다.

**4. 리스트 렌더링 규칙 (상품 직관화)**
- 메인 리스트 및 검색 결과 리스트에서, 게시글에 `taggedProduct` 데이터가 존재할 경우 제목 바로 아래에 `[ 🔗 브랜드명 - 상품명 ]` 형태의 **상품 태그 칩(Pill)**을 반드시 노출한다. 유저가 글을 클릭하기 전에 어떤 상품을 리뷰했는지 100% 인지하게 만들어 클릭률(CTR)을 극대화한다.
- DB에 저장된 원시 영어 카테고리(`question`, `tip` 등)는 화면 렌더링 시 반드시 한글(`[질문/고민]`, `[육아꿀템]` 등)로 매핑하여 노출한다.

**5. 구매 인증 동적 교차 필터 시스템 (Verified Purchase & Segment Filtering)**
- **목적:** 가짜 바이럴 및 대행사 도배글을 원천 차단하고, 실제 세이브루를 통해 구매가 검증된 부모들의 '진짜 여론'만을 유저 생애주기에 맞춰 제공하여 정보 신뢰도를 극대화함.
- **UI 구현:** 커뮤니티 피드 상단 우측 영역에 `[내 아이 맞춤 정보]` 토글 스위치와 수평으로 **`[인증 후기만 보기]`** 컨트롤 스위치를 병렬 배치한다.
- **다차원 교차 필터링 쿼리 (Firestore Query Logic):**
  - 토글 상태에 따라 클라이언트 단에서 아래와 같이 Firestore 복합 인덱스 쿼리를 분기 가동한다.
  - `인증 후기 ON / 맞춤 정보 OFF`: `.where('verifiedPurchase', '==', true).orderBy('createdAt', 'desc')`
  - `인증 후기 ON / 맞춤 정보 ON (코어 큐레이션)`: `.where('verifiedPurchase', '==', true).where('authorBabyMonthAtCreation', '>=', minMonth).where('authorBabyMonthAtCreation', '<=', maxMonth).orderBy('createdAt', 'desc')`

**6. 반품 및 환불에 대한 어뷰징 차단 정책 (Coupang Return Abuse Defense)**
- **위험 정의:** 유저가 쿠팡에서 물건 구매 후 주문번호를 등록하여 세이브루 내 구매 인증 뱃지 및 게이미피케이션 혜택을 취득한 뒤, 쿠팡 앱에서 즉시 반품/환불을 진행하는 먹튀 행위.
- **백엔드 자동 추적 및 회수 파이프라인 로직:**
  - `getAdminPerformanceReports` 배치 프로세스가 24시간 주기로 가동될 때, 쿠팡 파트너스 취소/반품 리포트 데이터셋을 전수 검사한다.
  - 취소된 주문번호(`orderNumber`)가 Firestore `reward_claims` 컬렉션 내에 매칭되는 건이 발견될 경우, 아래의 데이터 역전이(Rollback) 프로세스를 즉각 강제 실행한다.
    1) `reward_claims.status` 필드를 `approved`에서 `rejected_by_return`으로 즉시 변경.
    2) 해당 주문번호와 바인딩된 커뮤니티 리뷰 문서의 `reviews.verifiedPurchase` 필드 값을 `true`에서 `false`로 즉시 원복 처리하여 피드 내 `[✓ 구매인증]` 마크를 실시간 박탈함.
    3) 유저 프로필 스키마 내에 어뷰징 스택(`abuse_penalty_count`)을 +1 누적 합산하며, 이 스택이 총 3회 이상 적재된 유저의 경우 `users/{userId}.role = 'blocked'`로 강제 전환하여 서비스 영구 밴(Ban) 및 계정 잠금 처리를 수행한다.

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
**목적:** 유저의 모든 커뮤니티 활동(글, 댓글, 좋아요)을 한 화면에서 모아보고 쉽게 검색하기 (개인 아카이브 목적).

**UI 구조 (Naver Cafe + Fintech 검색 스타일):**
1. **상단 활동 요약 블록:**
   - 유저 닉네임 및 컬러 숫자 배지(예: `[ 2 ]`) 노출. (프로필 이미지는 마이페이지와 동일한 기본 실루엣 SVG로 통일)
   - 활동 스탯: `방문 [visitCount]회 · 작성글 [postCount] · 댓글 [commentCount]` 형태의 요약 정보 제공.
2. **내 활동 검색 바 (신설):**
   - 탭 바 바로 하단에 둥근 모서리의 검색창(Search Bar) 배치. Placeholder는 선택된 탭에 따라 동적 변경 (예: "내가 쓴 댓글 내 검색").
   - **검색 로직:** 유저가 타이핑 시, '현재 선택된 탭'의 리스트 내에서 실시간으로 필터링.
3. **상단 탭 바 (4-tab - 마이페이지와 100% 동기화):**
   - `[내가 쓴 게시글]` | `[내가 쓴 댓글]` | `[댓글 단 글]` | `[좋아요한 글]`
4. **리스트 아이템 (Card) 디자인:**
   - **게시글 리스트:** `[카테고리명] 글 제목` (예: [후기] 기저귀 추천), 본문 미리보기, 닉네임, 작성일, 조회/댓글/좋아요 노출.
   - **댓글 리스트 (명확한 위계):** 내가 남긴 댓글 내용을 굵고 크게 상단에 배치, 그 하단에 원문 제목을 작게 배치하며 제목 앞에 반드시 `[카테고리명]` 병기 (예: `원문: [질문] 기저귀 추천`).

---

### 6.6 마이 탭 (`MyPageScreen.js`)
**목적:** 유저의 개인화된 활동 허브이자, 앱의 체감 혜택(절약액)을 확인하는 대시보드.

**UI 구조 및 UX 상세 명세 (최신 핀테크 표준):**

1. **상단 글로벌 헤더 (Global Header):**
   - **좌측:** "마이페이지" (타이포그래피 토큰: `24px, 800(ExtraBold), #0f172a`)
   - **우측 액션:** 🔔 (알림 아이콘), ⚙️ (글로벌 설정 아이콘)

2. **프로필 & 카카오 락인(Lock-in) 통합 블록 (일체형 UI):**
   - **프로필 이미지:** 핀테크 스타일의 사용자 실루엣 SVG 기본 적용. (클릭 시 닉네임 변경 모달)
   - **정보 영역:**
     - **닉네임 & 등급:** 닉네임 우측에 옅은 파란색 알약 배지(`[일반맘 >]`). 클릭 시 `LevelInfoScreen` 이동.
     - **아이 정보 요약:** `이름 · 성별 · 개월수 · 키 · 몸무게` + `수정 >` 버튼.
   - **카카오 오피셜 풋터 (Seamless Footer):** 프로필 카드 하단에 여백 없이 완벽히 밀착된 노란색 배너.
     - **스펙:** 배경 `#FEE500`, 텍스트/아이콘 `#191919` (카카오 공식 가이드라인 엄수).
     - **카피:** "체험단, 전용 쿠폰, 핫딜 키워드 무제한 알림까지!" (아이콘: 선물 상자)

3. **게이미피케이션 상태 영역 (퀘스트 카드):**
   - **UI:** 옅은 파란색/회색 톤의 배경 (`#F8FAFC`). 다음 레벨까지의 프로그레스 바 노출.

4. **Activity Grid (4-column):**
   - **`[내가 쓴 게시글 (count)]`:** 클릭 시 `MyActivityScreen` 이동 (`{ activeTab: '내가 쓴 게시글' }`)
   - **`[내가 쓴 댓글 (count)]`:** 클릭 시 `MyActivityScreen` 이동 (`{ activeTab: '내가 쓴 댓글' }`)
   - **`[좋아요한 글 (count)]`:** 클릭 시 `MyActivityScreen` 이동 (`{ activeTab: '좋아요한 글' }`)
   - **`[내 쿠폰함]`:** 시스템 알럿 금지. 프리미엄 선물 상자 벡터 아이콘이 포함된 커스텀 모달 노출 ("회원님의 등급에 맞춰 특별한 혜택을 준비하고 있어요").

5. **최근 본 상품 (캐러셀 및 전체보기):**
   - **데이터 소스:** 최근 3일 이내 열람한 상품.
   - **메인 화면 UI (퍼포먼스 최적화):** 최대 10개까지만 노출(`slice(0,10)`).
   - **전체보기 라우팅:** 우측 상단 `전체보기 >` 클릭 시 `RecentlyViewedProductsScreen`으로 이동.
   - **전체보기 화면 UX:** 각 상품 카드 우측 상단에 **'삭제(X)' 버튼**을 추가하여 유저가 리스트를 직접 관리할 수 있도록 지원.

6. **하단 혜택 리포트 (듀얼 절약 대시보드):**
   - **기대 절약액 (관심상품 기반):** `SUM(추적 중 7일 이상 된 각 상품의 60일 평균가 - 현재가)`. 당장 관심상품을 샀을 때 얻을 수 있는 잠재적 이득을 표기.
   - **실제 누적 절약액 (인증 기반):** `users/{uid}.total_saved_amount`. 세이브루를 통해 실제로 아낀 확정적 누적 이득 표기.
   - **동적 카피(Nudge):** 추적 중인 상품이 없을 경우, 0원 표기 대신 "관심상품을 담고 최저가 추적을 시작해보세요! 🔗" 문구로 등록 유도.

**핵심 기능 로직 명세:**
- **닉네임 유효성 검사 (Inline Validation):** 프로필 수정 모달 내에서 네이티브 알림창(`Alert.alert`) 사용 절대 금지. 실시간으로 2~10자 제한 및 중복 검사를 수행하여 초록/빨강 텍스트 피드백 제공 (17장 참조).
- **키보드 회피 (Keyboard Avoiding):** 프로필 수정 모달 호출 시, 키보드가 닉네임 입력창과 [저장] 버튼을 가리지 않도록 하단 패딩(Padding)을 동적으로 밀어 올림.
- **버튼 비활성화:** 닉네임이 1자 이하일 경우 모달 내 [저장] 버튼은 회색으로 비활성화(`disabled`).

**추후 고도화:**
- 카카오싱크 로그인 연동 (카카오톡 플러스친구 자동 추가를 통한 CRM 푸시 발송)
- 가계부 연동 (월별 실제 지출 및 절약 금액 리포트)
---

### 6.7 상품 상세 (`ProductDetail.js`)
**목적:** 구매 결정 판단 보조 및 핀테크 기준의 가격 정합성 제공 (Decision Assistant Engine)

---

### 🧱 [SECTION 1] 핵심 컴포넌트 — PriceLineGraph (가격 그래프)

* **기능 정의:** Firestore의 `products/{productGroupId}/offers` 서브컬렉션에 누적된 시계열 가격 스냅샷 데이터를 호출하여, 유저가 선택한 기간에 맞춰 가격 변동 추이를 시각화하는 벡터 차트 컴포넌트이다.
* **입력 데이터:** `offers` 서브컬렉션 Snapshots 배열 (`Array<{ price: number, checkedAt: Timestamp }>`)
* **조회 기간 필터 설정:** `[1주일] | [1개월] | [2개월] | [3개월] | [6개월]` (동적 State 관리)
    * **⚠️ UX/데이터 정합성 절대 규칙 (Core Baseline):** 리스트 및 대시보드의 '60일 평균가' 분석 로직과 차트 데이터 범위의 시각적 일치를 위해, **화면 최초 진입 시 무조건 '2개월(60일)' 필터를 Default로 강제 할당**하여 렌더링한다.
* **시각화 그래픽 제어 및 색상 토큰 규칙:**
    * **현재가 (오늘 기준):** `#22c55e` (연두색 점선, `strokeDasharray: [4, 4]`) ➔ 오늘 수집된 가장 최신의 최저가 기준 수평선.
    * **기간 최고가:** `#ef4444` (빨간색 점선, `strokeDasharray: [4, 4]`) ➔ 유저가 설정한 조회 기간 범위 내에서 가장 높았던 가격 스냅샷의 Y축 임계점 수평선.
    * **기간 최저가:** `#2E6FF2` (파란색 점선, `strokeDasharray: [4, 4]`) ➔ 유저가 설정한 조회 기간 범위 내에서 가장 낮았던 가격 스냅샷의 Y축 임계점 수평선.
    * **최고가 노드 (해당 날짜):** `#ef4444` (빨간색 실선 플롯 및 원형 포인트 마커) ➔ 차트 라인 위의 최고점 데이터 팁.
    * **최저가 노드 (해당 날짜):** `#2E6FF2` (파란색 실선 플롯 및 원형 포인트 마커) ➔ 차트 라인 위의 최저점 데이터 팁.
* **Y축 동적 스케일링 알고리즘:** 유저가 선택한 기간 내의 `MIN(price)`과 `MAX(price)`를 실시간으로 추출한 뒤, 차트 상하단 레이아웃 붕괴를 방지하기 위해 최소값 유격 5% 감산 처리 및 최대값 유격 5% 가산 처리를 적용하여 `yMin`, `yMax` 범위를 동적으로 재계산(Scaling) 주입한다.
* **컴포넌트 렌더링 예외 가드(Guard):** `offerSnapshots.length < 2` 일 경우 차트 컴포넌트 내부 렌더링을 차단하고, 빈 화면(Blank Space) 대신 `<ActivityIndicator color="#2E6FF2" />` 또는 `데이터를 매칭하고 있어요` 스켈레톤 카드를 노출한다.
* **하단 Stats Row (범례 표기 명세):** 차트 바로 직하단 영역에 `최고가 | 최저가 | 현재가 | 기간 최고가 | 기간 최저가` 총 5가지 범례의 컬러 매칭 도트와 파싱된 실제 원화 금액 데이터 수치(예: `127,600원`)를 수평 정렬하여 명시한다.

---

### 🎨 [SECTION 2] 핀테크 동적 가격 렌더링 및 UI/UX 구조 파이프라인

**[핵심 원칙] 데이터 소스 단일화 (Single Source of Truth):**
앱(Frontend)은 쿠팡 API와 직접 통신하거나 HTML을 직접 스크래핑하는 행위를 일절 금지한다. 상세페이지의 모든 UI는 백엔드 크롤러가 정제하여 저장한 Firestore `products/{productGroupId}` 문서의 필드값만을 100% 신뢰하여 렌더링한다.

#### 1. 플로팅 가격 추적 위젯 (Price Tracker FAB)
- **위치:** 화면 우측 하단(`bottom: 100, right: 20`), z-index 999 고정 배치. 이모지 아이콘 제거.
- **텍스트 및 폰트:**
  - 미등록: `[가격 추적]` (스마트 블루 배경, 흰색 텍스트, fontSize 14, Bold)
  - 추적 중: `[가격 추적중]` (연초록 배경, 진녹색 텍스트, fontSize 14, Bold)
- **동작:** 탭바와 상품 상세 정보가 가려지지 않도록 뷰 포트 상단 레이어 유지.

#### 2. 레이아웃 위계 및 상품 요약 구역 (Top-to-Bottom)
본문은 유저의 시선 흐름에 맞춰 반드시 세로 배치되며, 레이아웃 파편화를 금지한다.

* **좌측 썸네일:** 크기는 `width: 105, height: 105` 절대값 고정 및 `contain` 강제. 이미지 보안 정책(`http` 차단) 방어를 위해 DB의 URL 문자열을 강제로 `https://`로 치환하여 바인딩한다. 앱 단에서의 강제 스크래핑 로직은 전면 폐기한다.
* **우측 텍스트 Stack (계단식 수직 정렬):**
  1. **브랜드명:** `{product.brand}` 매핑. (데이터 부재 시 해당 텍스트 컴포넌트 전체를 숨김 처리(Hide)한다.)
  2. **상품명:** `{product.name}` 매핑. `fontSize: 18, fontWeight: '800'`. 2줄 초과 시 생략(`numberOfLines={2}`)을 강제 주입한다.
  3. **수량/용량 스펙:** 백엔드 크롤러가 수집한 `{product.spec}` 데이터를 렌더링한다. 데이터가 `null`이거나 비어있을 경우, "상세 규격 없음" 등의 에러 텍스트를 띄우지 않고 해당 줄을 화면에서 완전히 숨김(Hide) 처리한다.
  4. **신뢰도 뱃지 (Inline 배치):** 썸네일 외부 본문 영역에 `ⓒ 쿠팡 인증 상품` 마크와 쿠팡 메타데이터 기반 `[🚀 로켓배송]` 또는 `[📦 무료배송]` 뱃지를 수평 인라인으로 배치한다.

#### 3. 프리미엄 소셜 증명 박스 (Social Proof Highlight Card)
- **UI 구조 강제:** 컨테이너에 `width: '100%'`, `paddingHorizontal: 16`을 부여하여 가로로 꽉 차게 확장하고, 우측으로 쏠리는 현상을 유발하는 `alignItems` 속성은 부모 컨테이너에서 완전 제거한다. (`backgroundColor: '#F1F5F9', paddingVertical: 12, borderRadius: 8, marginTop: 16`)
- **가독성 가드레일:** 내부 텍스트에 `numberOfLines={2}` 및 `ellipsizeMode="tail"`을 박아 깔끔한 2줄 위계로 강제 정렬한다.
- **라인 1 (숫자 하이라이트):** `{peerCount}명 의` (peerCount는 파란색 Bold 처리)
- **라인 2 (동적 카피 로직):** 유저 자녀 이름 변수(`{childName}`)를 매핑하여 `[지우]와 비슷한 환경의 부모들이 지켜보고 있어요` 형태로 렌더링한다. (임신/계획 단계도 동일하게 동적 매핑)

#### 4. 메인 가격 헤더 및 데이터 그리드
- **메인 가격 헤더:** 무조건 가로 1열 수평 정렬(`justifyContent: 'space-between'`).
  - 행 좌측: `현재가(14px)` ➔ **`{product.regularPrice}원` (크기 22px, Bold)** ➔ 평균가 수치 (회색 취소선).
  - 행 우측: 등락 부호 수치(`▼ 31%`) 밀착 렌더링.
- **와우회원가 렌더링 (가짜 가격 방어 로직):** 앱 단에서 `일반가 * 0.9` 등의 임의 계산을 통한 가짜 할인가 생성을 엄격히 금지한다. DB의 `{product.wowPrice}` 필드가 존재하는 경우에만 `쿠팡 와우 회원가: {product.wowPrice}원` 행을 빨간색으로 노출하며, `null`일 경우 돔 트리에서 완전히 제거(Hide)한다.
- **4열 핀테크 데이터 매트릭스 그리드:** 4등분 균등 수평 그리드 배치. '평균 대비' 칸에는 백분율(%) 대신 현재가와 평균가의 실제 수치상 차액 금액을 절대값으로 매핑한다. (예: `-12,000원`)

#### 5. 데이터 Sparsity 방어 (콜드 스타트) 및 CTA 딥링크
- **[Phase 1] 7일 미만 추적 (`trackedDays < 7`):** 평균가 취소선 및 등락 기호 제거. `[가격 수집 중 🔍]` 뱃지 및 `(최소 7일 필요)` 타임스탬프 명시.
- **[Phase 2] 7일~60일 미만 (`7 <= trackedDays < 60`):** `{trackedDays}일 평균` 고무줄 동적 라벨 노출.
- **[Phase 3] 60일 이상 (`trackedDays >= 60`):** `60일 평균` 영구 고정 고지.
- **CTA Button 라우팅 로직:** 제휴 브릿지 페이지로 빠지는 현상을 막기 위해, 백엔드 크롤러가 수집/조립해 둔 `{product.deepLink}` (예: `coupang://vp/products/...`) URL 스키마를 최우선으로 `Linking.openURL()` 호출한다. 미설치 시 웹 URL로 Fallback 처리한다.
---

### 🛍️ [SECTION 3] CTA Button 및 제휴 마켓 API 라우팅 파이프라인

* **Primary CTA 라벨 명세:** 하단 고정형 메인 버튼 스펙 명칭은 오직 **"쿠팡에서 최저가 확인하기"** 텍스트만 단독 허용한다.
* **화면 스티키 가드레일:** 기기별 SafeArea 하단 인셋 유격을 완벽히 계산하는 `useSafeAreaInsets` 패딩 바인딩 공식을 주입하여 하단 버튼 플로팅 현상을 원천 락(Lock) 처리한다.
* **[수익화 연동 명세] 딥링크 컨버전 (`POST /deeplink`):**
    1.  CTA 터치 즉시 백그라운드에서 `user_product_actions`에 `actionType: 'product_purchase_click'`을 적재한다.
    2.  Firebase Cloud Functions의 `POST /deeplink` API를 호출해 세이브루 파트너스 트래킹 코드가 병합된 제휴 아웃링크 주소(`affiliateUrl`)를 발급받는다.
    3.  `Linking.openURL(affiliateUrl)` 프로토콜로 외부 쿠팡 앱을 구동한다. (미설치 시 웹 브라우저 우회 절대 금지, Native Alert 유도 `RULE-02` 복종).

---

### 🔮 [SECTION 4] FUTURE ROADMAP (상세 페이지 향후 고도화 계획)

* **가격 예측 꺾은선 그래프 (향후 7일 시계열 도출):** 최근 3개월 동안 누적 수집된 가격 스냅샷의 변동 주기 빈도 및 요일별 마케팅 할인율 가중치 데이터를 행렬 계산 처리하여 향후 7일간 예상되는 최저가 도달 시점 예측 점선을 차트 컴포넌트 내에 추가 렌더링 인프라 예비 예정.
* **독립형 최저가 알림 구독 타겟팅 스위치:** 유저가 직접 수동으로 자신이 원하는 목표 구매 도달 가액을 지정하여 스위치를 켜두면 백엔드 Firestore trigger 파이프라인과 연동되어 FCM 푸시 알림을 즉시 서빙하는 토글 UI 모듈 확장 탑재 공간 확보.
* **유아용품 성분 분석 정보 탭:** 기저귀 발진 유발 성분 등 공공 데이터 오픈 API 브릿지를 연동하여 상품명 직하단 영역에 클린 성분 안전성 안전 등급 라벨 뱃지를 출력하는 데이터 세분화 구역 스텁 설계 대기.
* **실구매 인증 기반 찐 후기 리뷰 최상단 고정 노출:** `reward_claims` 영수증 검증 단계를 거쳐 진짜 돈을 쓰고 반품을 안 한 것이 입증된 세그먼트 유저의 커뮤니티 작성글을 상세 페이지 중앙 피드 구역에 최우선적으로 상단 앵커링 스위칭 서빙하는 컴포넌트 배치 예비 공간 구획 완료.

---

### 6.8 [핵심 돌파] 클라이언트 스크래핑 및 네이티브 공유하기(Share Intent) 아키텍처

**[CRITICAL] 폴센트(Polsent) 벤치마킹: OS Share Sheet + Invisible WebView + Soft Landing UX**
과거 Firebase 서버와 순수 `fetch()`를 활용한 방식은 쿠팡의 WAF(보안서버)와 JS-Redirect 꼼수에 막혀 완전히 무력화되었다. 
이를 영구적으로 돌파하기 위해 **유저의 기기에서 보이지 않는 1픽셀 웹뷰를 가동하여 쿠팡의 세션을 자연스럽게 취득하고, 백그라운드에서 데이터를 훔친 뒤 앱을 죽이지 않고 쿠팡으로 부드럽게 되돌려 보내는(Soft Landing) 궁극의 클라이언트 아키텍처**를 강제한다.

**Core Flow (4-Step 파이프라인):**

**Step 1: Native Share Intent (URL 가로채기 및 오버레이 렌더링)**
- **OS 권한 획득:** `expo-share-intent`를 통해 안드로이드 시스템에 `ACTION_SEND` 인텐트 필터를 네이티브 레벨로 등록한다.
- **오버레이 가동:** 유저가 쿠팡 앱에서 '세이브루'로 공유 시, 세이브루 앱이 켜지며 전체 화면을 덮는 반투명 검은색 뷰(`Absolute View`, Modal 사용 절대 금지)와 로딩 스피너를 즉각 렌더링한다.

**Step 2: 1-Pixel Invisible WebView (WAF 우회 및 OS 납치 방어)**
- 반투명 오버레이 내부에 사람 눈에 보이지 않고 OS의 절전 모드를 피하는 **1픽셀 투명 웹뷰 (`width: 1, height: 1, top: 0, left: 0, opacity: 0.01`)**를 생성한다.
- **Natural Flow (WAF 우회):** 가로챈 단축 URL(`link.coupang.com`)과 모바일 UA를 부여하여 웹뷰가 스스로 모바일 상품 페이지(`m.coupang.com`)까지 리다이렉트를 타도록 방치한다. 이 과정에서 브라우저 세션과 쿠키가 정상 생성되어 WAF(`Access Denied`)를 완벽히 통과한다.
- **Intent Blocker (OS 납치 차단):** 모바일 쿠팡 웹이 안드로이드 기기를 감지하고 쏘아대는 앱 강제 실행 딥링크(`intent://`)를 차단하기 위해, 웹뷰에 반드시 `originWhitelist={["*"]}`를 적용하고 `onShouldStartLoadWithRequest`에서 `http`, `https` 이외의 모든 스키마를 `false`로 튕겨내어 화면 납치를 물리적으로 차단한다.

**Step 3: Smart Polling & Raw JSON Extraction (가격 0원 탈출 및 자동 스크래핑)**
- **스마트 폴링:** 쿠팡의 무거운 렌더링을 대응하기 위해 `setTimeout` 대신 `setInterval`을 가동한다. (0.5초 주기로 최대 20회/10초 대기). `<head>` 태그 내의 `og:title`이 감지되는 순간 즉시 DOM 로딩이 완료된 것으로 판단하고 인터벌을 종료한다.
- **원시 데이터 추출 (Anti-LazyLoad):** 화면 밖으로 밀려난 웹뷰는 텍스트 노드를 그리지 않아 `.textContent`가 0원을 반환한다. 이를 돌파하기 위해 렌더링 트리를 무시하고 `document.body.innerHTML`의 전체 문자열을 가져와 정규표현식(`/"(?:salePrice|price|originalPrice)"\s*:\s*["']?([\d,]+)["']?/i`)으로 서버가 내려준 JSON 원시 데이터에 직접 꽂혀있는 가격을 뜯어낸다.
- **이미지 정규화:** `og:image`의 주소가 `//`로 시작할 경우 반드시 `https:`를 강제 결합(Prepend)하여 React Native 이미지 로딩 에러를 방지한다.

**Step 4: Direct DB Write & Soft Landing UX (앱 생명주기 유지)**
- 스크래퍼가 던져준 Payload(상품ID, 이름, 가격, 썸네일)를 백엔드를 거치지 않고 프론트엔드가 즉시 Firestore `products` 및 `user_saved_products` 컬렉션에 Direct Write 한다.
- **Polsent UX (앱 킬 금지):** `BackHandler.exitApp()`은 앱 프로세스를 파괴하여 재접속 시 콜드 스타트(튜토리얼 초기화)를 유발하므로 절대 사용을 금지한다.
- **소프트 랜딩 라우팅:** 성공 시 `navigationRef`를 통해 내부적으로 UI를 `[관심상품]` 탭으로 먼저 텔레포트 시킨 뒤, 300ms 딜레이 후 `Linking.openURL("coupang://")` 인텐트를 쏘아 유저의 화면(Focus)만 쿠팡 앱으로 부드럽게 넘긴다. (세이브루 앱은 관심상품 탭이 켜진 상태로 백그라운드에 안전하게 보존된다).

### 6.9 인앱 고객센터 (CS Center: 1:1 문의 및 버그 신고)
**목적:** 앱 이탈 없이 유저와 운영자가 소통하고, 버그 캡처 화면을 직접 제보받는 완벽한 CS 폐쇄 루프 구축.

**화면 및 로직 구성 (Single Page Optimization):**
1. **리스트 (`InquiryListScreen`):**
   - **UI 위계:** 게시글 번호(No. 1, 2) 대신 핀테크 표준인 '상태 뱃지 + 날짜/시간 + 제목' 구조를 사용.
   - **타임스탬프:** `2026.05.16 14:30` 처럼 분(mm) 단위까지 정확히 노출.
   - **상태 뱃지 대비:** `답변 대기(회색 배경)` / `답변 완료(스마트 블루 #2E6FF2 배경)`으로 시각적 대비 극대화.
2. **작성 폼 (`InquiryWriteScreen` - 한 화면 압축):**
   - **입력 제한:** 제목은 최대 40자로 하드 제한(`maxLength={40}`)하며, 제목과 내용의 글자 수 카운터(`0/40`, `0/1000`)는 모두 입력창 '우측 상단'에 통일하여 배치.
   - **이미지 첨부 (필수):** 내용 입력창 하단에 `[ 📷 0/3 ]` (최대 3장) 이미지 첨부 버튼 노출.
   - **UX 정책:** 스크롤 없이 하단 `[문의 접수하기]` 버튼이 보이도록 마진(Margin)을 압착하고 `KeyboardAvoidingView` 적용.
   - **이미지 확대 모달:** 등록된 썸네일 이미지를 터치하면, 화면이 어두워지며(Dimmed) 원본 비율로 크게 볼 수 있는 커스텀 줌(Zoom) 모달 가동.
3. **상세 화면 (`InquiryDetailScreen`):**
   - 운영자와의 데이터 정합성을 위해 유저의 '수정' 기능 원천 차단. 삭제만 가능.
   - 관리자 답변 완료 시 하단에 옅은 파란색 박스로 답변 내용 렌더링.

### 6.10 운영자 대시보드 (`AdminDashboardScreen.js`)
**목적:** 파이어베이스 콘솔 없이 앱 내에서 유저 문의를 확인하고 즉각 대응하는 백오피스.

**핵심 로직:**
1. **데이터 관리:** `inquiries` 컬렉션을 시간 역순으로 전체 로드.
2. **UI/UX:** 답변 작성 모달은 반드시 `<KeyboardAvoidingView>`를 적용하여 키보드가 입력창을 가리지 않도록 제어한다.
3. **상태 업데이트:** 답변 등록 시 해당 문서의 `status`를 'answered'로 변경하고, `reply` 내용과 `repliedAt` 타임스탬프를 서버에 기록한다.

### 6.11 통합 검색 플로우 (`SearchScreen.js` & `SearchResultScreen.js`)
**목적:** 단순 상품 검색이 아닌, 상품 가격과 커뮤니티 여론을 동시에 제공하는 하이브리드 검색 엔진.

**UI 구조 및 UX 절대 규칙:**

**[상태 1: 검색 초기 화면]**
- **지금 많이 찾는 검색어:** 1~10위 노출. 단, 1~3위 숫자는 반드시 `스마트 블루(#2E6FF2)` 색상과 `ExtraBold`로 강조하여 시선을 유도한다.

**[상태 2: 검색 결과 화면 - 3 Tab 구조]**
- **로딩 모드:** 파이어베이스/쿠팡 API 쿼리 시 반드시 **스마트 블루** 색상의 `ActivityIndicator`를 노출한다. (핑크색 절대 금지)
- **이모지 밴(RULE-04):** 검색 결과의 모든 배너 및 커뮤니티 리스트에서 이모지(🔗, 🔥, 💡 등) 사용을 엄격히 금지하고 `lucide` 아이콘 또는 텍스트 뱃지로 대체한다.

**1. 통합 탭 (All Preview)**
- **상품 미리보기:** 상위 3개 항목만 [RULE-9.4] 포맷으로 렌더링. 브랜드명은 회색 괄호 `[브랜드]`로 분리.
- **커뮤니티 미리보기:** 검색어 포함 게시글 중 **인게이지먼트 점수 최상위 3개** 노출.
- **상호 배제 배너 로직 (Mutually Exclusive UX):**
  - 총검색 결과 > 3개: 하단에 `[상품 검색 결과 N개 더보기 >]` 액션 버튼 노출 (상품 탭으로 스위칭). 배너 숨김.
  - 총검색 결과 <= 3개: 하단에 `[원하는 상품이 없나요? 추가하기]` 배너 노출. 더보기 버튼 숨김.

**2. 상품 탭 (Product Infinite Scroll)**
- **무한 스크롤 (Pagination):** 초기 10개 렌더링 후, 하단 스크롤 시 스피너 노출과 함께 10개씩 추가 로드.
- **Pill 스타일 필터:** 선택된 필터는 파란색 배경+흰색 글씨 캡슐 형태로 렌더링.
- **정렬 로직:**
  - `아이 또래 인기`: peerScore(내부 점수) 내림차순 (Desc) - Default 선택 및 USP 안내 툴팁 노출.
  - `할인율순`: discountRate 내림차순 (Desc)
  - `낮은 가격순`: currentPrice 오름차순 (Asc)

**3. 커뮤니티 탭 (Community)**
- **필터링:** 검색어와 일치하는 제목/본문을 가진 `posts` 컬렉션 게시글만 노출.
- **정렬 로직 (Engagement Score):** 단순히 최신순이 아닌, 최근 90일 이내 작성글 중 `(조회수 × 0.1) + (댓글 수 × 2) + (좋아요 수 × 3)` 공식을 적용한 인게이지먼트 점수 내림차순으로 정렬.
- **UI/UX 규칙:** - 글쓰기(FAB) 버튼 강제 숨김.
  - 4티어 레벨링 시스템 적용: `Lv.1 일반맘(#6B7280)`, `Lv.2 성실맘(#10B981)`, `Lv.3 열심맘(#F59E0B)`, `Lv.4 우수맘(#2E6FF2)`.

### 6.12 큐레이션 및 테마 상세 화면 (CurationDetailScreen.js)
**목적:** 홈 탭의 모든 특가/베스트 상품에서 '전체 >' 클릭 시 진입하는 인피니트 스크롤 대시보드.

**[1] 핀테크 표준 Control Bar (정렬 및 배열 방식 토글)**
- **위치:** 상단 카테고리 탭 (또는 헤더) 바로 아래 위치.
- **좌측 (정렬 필터):** 기존의 투박한 알약 3개 버튼을 폐기하고, `[판매량순 ⌵]`, `[낮은가격순 ⌵]` 형태의 세련된 **드롭다운(Dropdown)** 버튼 UI로 구현하여 공간 효율을 극대화한다.
- **우측 (뷰어 토글):** 유저가 리스트 형태를 선택할 수 있도록 `[☰ 가로 리스트형]`과 `[⊞ 그리드형]` 토글 아이콘을 배치한다.
  - **절대 기본값 (Default):** 이커머스 시각적 밀도 최적화를 위해 진입 시 무조건 **[⊞ 2열 그리드(Grid) 형태]**를 기본값으로 렌더링한다.

**[2] 1~3위 금은동 랭킹 뱃지 글로벌 적용 및 동적 레이아웃**
- 특정 탭(맘템)에만 국한하지 않고, 모든 특가 상세 리스트(`goldbox`, `pl_deals`, `mamtem` 등)에 배열 `index` 기반의 랭킹 뱃지를 적용하여 구매 신뢰도를 높인다.
  - `1위`: 금색 (#FBBF24) / `2위`: 은색 (#9CA3AF) / `3위`: 동색 (#B45309) / `4위~`: 회색 (#E5E7EB) 원형 뱃지.
- **뷰어(ViewType)에 따른 뱃지 위치 이동 로직 (UX Core):**
  - `그리드(Grid) 뷰`: 썸네일 이미지가 크므로 기존대로 썸네일 **좌측 상단 내부**에 오버레이(Absolute) 배치한다.
  - `리스트(List) 뷰`: 썸네일이 작아 뱃지가 상품을 가리는 것을 방지하기 위해, 멜론 차트처럼 썸네일 **좌측 바깥쪽**으로 랭킹 숫자를 완전히 분리하여 배치한다 (`[순위] [썸네일] [상품정보]`).

**[3] 카테고리 동적 필터링 탭 (Scrollable Tab)**
- 골드박스 등 여러 카테고리가 섞인 데이터를 받았을 때, 데이터 내부의 `categoryName`을 중복 제거(Extract)하여 상단에 스크롤 가능한 탭(예: `전체 | 식품 | 생활용품 | 유아동`)으로 자동 생성한다. 드롭다운이 아닌 1-Depth 탭 형태를 유지하여 탐색 이탈률을 막는다.

**[4] 사용성 극대화 장치**
- 화면 우측 하단에 `[↑ 맨 위로]` 스크롤을 쏠 수 있는 FAB(Floating Action Button)를 배치한다.

### 6.13 등급 안내 및 레벨 퀘스트 (`LevelInfoScreen.js`)
**목적:** 유저에게 명확한 승급 목표와 혜택을 제시하여 리텐션을 강화하는 화면.

**등급별 달성 조건 및 혜택 로직:**
- **Lv.1 일반맘:** 기본 부여 (앱 설치 및 익명 로그인)
- **Lv.2 성실맘:** 관심상품 3개 & 게시글 1개 & 댓글 3개
- **Lv.3 열심맘:** 관심상품 10개 & 게시글 5개 & 댓글 15개 & **[연속 접속 3일]**
- **Lv.4 우수맘:** 관심상품 30개 & 게시글 20개 & 댓글 50개 & **[연속 접속 7일]**

**시스템 제약 사항:**
- **카카오 연동 강제:** Lv.2 진입(커뮤니티 글쓰기 권한 확보) 시점부터는 어뷰징 방지를 위해 카카오 계정 연동이 필수로 요구됨.

### 6.14 전역 라우팅 및 공통 노출 화면 관계 명세 (Universal Routing Matrix)
**목적:** 앱 내 전역에서 호출되는 공통 화면들의 유기적 연관성과 탭 간 교차 라우팅 흐름을 명시하여, 추후 시스템 확장 시 아키텍처 파편화를 원천 차단한다.

#### 1. 전역 공통 호출 인프라 화면 (Cross-Cutting Shared Screens)
아래 4개 화면은 특정 탭에 종속되지 않고 앱 전역(홈, 랭킹, 커뮤니티, 관심상품, 마이페이지)에서 상시 교차 호출되는 전역 공통 컴포넌트다.

- **[공통 A] 전역 통합 검색 엔진 (`SearchScreen.js` / `SearchResultScreen.js`)**
  - **호출 진입점:** 홈 탭 헤더 [C-1-0], 랭킹 탭 헤더 [C-2-1], 마이페이지 탭 헤더.
  - **데이터 로직:** 호출한 컨텍스트와 무관하게 전역 쿼리를 수행하며, 검색 결과에서 상품 터치 시 단일 상품 상세 [공통 C], 맘톡 게시글 터치 시 게시글 상세 [공통 D]로 다이렉트 텔레포트 라우팅을 수행한다.
- **[공통 B] 글로벌 알림 센터 (`NotificationScreen.js`)**
  - **호출 진입점:** GNB 모든 탭의 우측 상단 종(🔔) 아이콘 클릭 시 진입.
  - **데이터 로직:** `notifications/{uid}/user_notifications`를 실시간 리스닝하여 노출하며, 알림 종류에 따라 `product_drop`은 단일 상품 상세 [공통 C]로, `comment`는 게시글 상세 [공통 D]로 유저를 역라우팅(Deep Link) 시킨다.
- **[공통 C] 단일 상품 상세 페이지 (`ProductDetailScreen.js`)**
  - **호출 진입점:** 홈 탭 특가 리스트, 랭킹 탭 랭킹 리스트, 통합 검색 상품 결과, 커뮤니티 게시글 내 태그 칩, 마이페이지 최근 본 상품 및 할인 리포트.
  - **데이터 로직:** 부모 `productGroupId` 파라미터를 받아 가격 그래프 및 단가 비교표를 동적 렌더링하며, 최하단 스티키 CTA 클릭 시 `POST /deeplink` 서버 파이프라인을 거쳐 외부 쿠팡 앱으로 유저를 아웃링크 라우팅 처리한다.
- **[공통 D] 커뮤니티 게시글 상세 (`PostDetailScreen.js`)**
  - **호출 진입점:** 홈 탭 커뮤니티 베스트, 통합 검색 커뮤니티 결과, 커뮤니티 피드 리스트, 마이페이지 내 활동(내가 쓴 게시글, 내가 쓴 댓글, 댓글 단 글, 좋아요한 글) 리스트.
  - **데이터 로직:** 부모 `postId` 파라미터를 받아 게시글 본문과 댓글 서브 컬렉션을 로드하며, 본문 내 `taggedProduct`가 존재할 경우 단일 상품 상세 [공통 C]로 재진입할 수 있는 2차 라우팅 루프를 제공한다.

#### 2. 전역 시스템 라우팅 및 데이터 로직 흐름도 (Visual Topology)
```text
[비로그인/최초진입] ➔ OnboardingScreen (ZONE B)
                        │ (익명 인증 및 아동 코호트 데이터 적재)
                        ▼
┌────────────────────── GNB 5-TABS BACKBONE (ZONE C) ──────────────────────┐
│                                                                          │
│  [C-1] 홈 탭  ───┐                                                        │
│  [C-2] 랭킹 탭  ───┼─➔ [공통 A] 통합 검색 ──➔ 상품 터치   ──┐                   │
│  [C-5] 마이 탭  ───┘        (Search)         글 터치  ──┼─┐                 │
│                                                      │ │                 │
│  [C-3] 맘톡 탭 ─────➔ [C-S] 로컬 검색 ──────────────┐    │ │                 │
│                             │                   │    │ │                │
│                             ▼                   ▼    ▼ ▼                │
│                      글쓰기/태깅 ──➔ [공통 D] 게시글 상세페이지 (PostDetail)      │
│                      (WritePost)             │                           │
│                                              └─➔ 태그 칩 터치 ──┐          │
│                                                              ▼          │
│  [C-4] 관심상품 📅 스트릭/일일 미션 🔄 혜택 모달 팝업       [공통 C] 단일 상품        │
│                                                      상세페이지 (PDP)       │ 
│  [C-5] 마이페이지 ──➔ Activity Grid 라우팅 ──────┐              │             │
│              │       ├─ 내가 쓴 게시글 ─────────┼──────────────┘             │
│              │       ├─ 내가 쓴 댓글 ───────────┼──────────────┘            │
│              │       └─ 좋아요한 글 ────────────┘                           │
│              │                                                           │
│              └─➔ [D-4] 설정창 ──➔ 1-Depth 알림 토글 동기화 (OS Permission)     │
│                            └──➔ WithdrawScreen (2-Track 분기 로직)         │
│                                  ├─ 익명 유저 ➔ [앱 데이터 초기화]             │
│                                  └─ 카카오 유저 ➔ [30일 유예 계정 탈퇴]         │
└──────────────────────────────────────────────────────────────────────────┘

---

## ⚙️ 7. CLOUD FUNCTIONS (서버 로직)

| Function | Trigger | API Endpoint Mapping / Purpose |
|---|---|---|
| `scrapeProductDetails` | Callable | **[용도 변경 / Fallback]** 초기 유저 등록 로직은 클라이언트로 이관됨. 이 함수는 백엔드 크론잡(`scheduledDailyPriceCheck`)이 기존 등록된 상품의 가격을 주기적으로 갱신할 때만 Proxy를 태워 사용하는 '스케줄러 갱신 전용 엔진'으로 용도 제한됨. |
| `searchProducts` | Callable | `GET /products/search` (쿠팡 검색 API 브릿지, 최대 50 호출/분) |
| `getBestCategoryProducts` | Callable | `GET /products/bestcategories/{categoryId}` (카테고리별 베스트 상품. 홈 탭 랭킹용) |
| `getGoldboxDeals` | Callable | `GET /products/goldbox` (오전 7:30 업데이트 골드박스 특가. 홈 탭 특가용) |
| `getCoupangPLProducts` | Callable | `GET /products/coupangPL/{brandId}` (탐사/비지엔젤 등 자사브랜드 가성비 추천용) |
| `getPersonalizedReco` | Callable | `GET /products/reco` (ADID 기반 쿠팡 개인화 추천. 홈 탭 하이브리드 추천용) |
| `generateDeeplink` | Callable | `POST /deeplink` (파트너스 제휴 트래킹 URL 변환 생성) |
| `registerProductFromUrl` | Callable | **[DEPRECATED]** 과거 클라이언트 스크래핑용. `scrapeProductDetails`로 완전 통합/대체됨. |
| `fetchCoupangProduct` | Callable | **[DEPRECATED]** 과거 메타 수집용. `scrapeProductDetails`로 완전 통합/대체됨. |
| `scheduledPriceUpdate` | Scheduled (6시간) | 전체 products 가격 재조회 → offers 서브컬렉션 append |
| `onPriceDropNotify` | Firestore trigger | 가격 하락 감지 시 FCM 푸시 (price_alerts 구독자 대상) |
| `onReviewCreate` | Firestore trigger | 리뷰 통계 자동 증가 |
| `getPersonalizedRecoV2` | Callable | `POST /v2/.../products/reco` (신규 V2 개인화 추천. Device ID 기반 타겟팅) |
| `getAdminPerformanceReports` | Scheduled (매일 15:10) | `GET /reports/clicks, orders, commission` (관리자용 일일 커미션 수익/전환율 리포트 데이터 적재) |

**보안 환경 변수 및 Secret Manager 규칙 [RULE-07]:**
- **Coupang API 키 (HMAC 서명용):** `EXPO_PUBLIC_COUPANG_ACCESS_KEY`, `EXPO_PUBLIC_COUPANG_SECRET_KEY` (알고리즘: HMAC-SHA256, 타임스탬프 포맷: `YYMMDDTHHMMSSZ`)
- **Proxy 인프라 키 (WAF 우회용):** `PROXY_URL` (형식: `http://username:password@proxy-host:port`)
  - `scrapeProductDetails` 함수는 GCP IP 차단을 막기 위해 반드시 Firebase Secret Manager에 등록된 `PROXY_URL`을 거쳐서 외부망(쿠팡)과 통신해야 한다. 이 환경변수가 누락되면 봇 탐지로 인해 기능이 100% 마비된다.
- **[CRITICAL] 클라이언트(앱)에서 쿠팡 API 엔드포인트를 직접 `fetch/axios` 하는 것을 절대 금지한다. 반드시 위 Callable Functions를 경유할 것.**

### 7.2 백엔드 크롤러 및 상품 DB 아키텍처 (Backend Crawler Pipeline)
**목적:** 쿠팡 파트너스 API의 치명적 한계(와우회원가 누락, 규격 정보 누락, 딥링크 유실)를 극복하기 위해 HTML을 파싱하여 완벽한 데이터를 구축하는 파이프라인.

**[SECTION A] Crawler Engine 하이브리드 로직 명세**
- **User-Initiated (유저 직접 등록 시 - SSR + Proxy 회피형):** 클라이언트가 직접 쿠팡을 호출하는 것을 전면 금지하고, 서버(`scrapeProductDetails`)가 `PROXY_URL`을 통해 일반 가정집 IP(Residential)로 위장한 뒤 Puppeteer로 HTML을 긁어오고 파싱하는 구조를 강제한다. (GCP 데이터센터 IP 차단 완벽 회피).
- **Scheduled (배치 스케줄러 가동 시):** 매일 새벽 2시 KST 등 정기적으로 가동되는 가격 갱신 크롤러(`scheduledDailyPriceCheck`)의 경우, 최신 `User-Agent` 및 브라우저 헤더를 극도로 정밀하게 위장(Spoofing)한 요청을 수행한다.
- **수집 데이터 타겟 3원칙:**
  1. **가격 추출:** `meta[property="product:price:amount"]` 1차 추출 후, 누락 시 `.total-price strong` 숫자 정규식 파싱으로 Fallback.
  2. **썸네일 보안:** `meta[property="og:image"]` 추출 후 반드시 `https://` 로 리플레이스 강제.
  3. **와우/일반 분기:** `wow-price` 클래스 여부를 감지하여 일반가와 와우회원가를 분리 수집.

**[SECTION B] 크롤링 실행 주기 (Tiered Cron-job Strategy)**
비용 최적화 및 유저 구매 적시성(Timing) 확보를 위해 상품의 중요도에 따라 크롤링 주기를 차등 적용하는 하이브리드 전략을 가동한다.
- **Tier 1 (S급 상품):** 매 1~2시간 단위 크롤링 가동. (유저가 현재 가격 알림을 켜두었거나, 홈 화면 메인에 노출 중인 고관여 상품)
- **Tier 2 (A급 상품):** 매 6시간 단위 크롤링 가동. (카테고리 베스트셀러 등 트래픽 유입이 꾸준한 상품)
- **Tier 3 (B급 상품):** 매 24시간(하루 1번) 크롤링 가동. (유저가 개별 검색하여 DB에 등록된 일반 롱테일 상품)
- **Global Sync:** 매일 자정(00:05 KST) KST 기준, 일별 쿠폰 및 할인율 갱신 타이밍에 맞춰 전체 상품 DB 강제 동기화를 1회 수행한다.

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

### 8.2 다차원 유사도 코호트 알고리즘 (Look-Alike Model, LAL)
세이브루의 추천 엔진은 1차원적 조건 매칭("강아지 키움 -> 강아지 매트 추천")을 전면 폐기하고, **다차원 클러스터링 및 시계열 행동 추적 기반의 알고리즘**으로 작동한다.

**✅ [Phase 1] 유저 N차원 클러스터링 (조합 타겟팅)**
온보딩 페이지에서 수집된 데이터를 융합하여 정밀한 소속 집단을 생성한다.
- **로직 예시:** `[생후 7~8개월]` + `[워킹맘]` + `[실내견 보유]` + `[관심사: 수면/안전]` = **<클러스터 A-73>** 생성

**✅ [Phase 2] 시계열 장바구니 행동 추적 (Time-Series Behavioral Tracking)**
단순히 존재하는 상품을 띄우는 것이 아니라, 해당 클러스터 유저들의 실제 액션 데이터를 추적한다.
- **로직:** <클러스터 A-73> 유저들의 `user_product_actions` 및 `product_click_logs` 데이터 분석.
- **출력값 도출:** "이 환경의 유저들은 **생후 7.5개월 기점**으로 대용량 롤러와 무독성 롤매트를 일반 유저 대비 3.5배 높은 빈도로 탐색 및 구매한다."

**✅ [Phase 3] 행동 심리학적 UI 메시징 (Social Proof)**
위 도출된 데이터를 바탕으로, 앱 내 추천 텍스트를 판매자 시점이 아닌 '심리적 동조 현상'을 이끌어내는 문구로 동적 렌더링한다.
- **출력 카피:** "비슷한 시기에 반려동물을 키우는 워킹맘 84%가 최근 일주일 내에 탐색한 필수템이에요."

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

### 9.4 글로벌 상품 가격 표기 정책 (Global Price UI Policy) - 화면 목적별 분리 (Spatial Separation)
**목적:** 한 화면 내에서 취소선의 기준(쿠팡 원가 vs 세이브루 평균가)이 혼재되어 발생하는 유저 혼란을 원천 차단하고, 쿠팡 실시간 데이터의 투명성과 우리 앱의 분석 신뢰도를 동시에 확보함.

**1. [Discovery 구역] 홈 탭 & 랭킹 탭 (쿠팡 실시간 데이터 원형 보존)**
   - **원칙:** 쿠팡 API가 내려주는 실시간 가격 데이터를 임의의 수학적 가공(가짜 평균가/할인율 생성) 없이 있는 그대로 렌더링한다.
   - **UI 렌더링 A (원가 데이터가 있는 경우):** 쿠팡 파트너스 API가 `originalPrice`와 `discountRate`를 함께 내려준 경우 ➔ `[적색 할인율] + [현재가(강조)] + [쿠팡 원가(회색 취소선)]` 노출.
   - **UI 렌더링 B (무의미한 타임특가 뱃지 제거 및 배송 뱃지 동적화):**
     - 현재가(`productPrice`) 텍스트는 유저의 시선이 집중되도록 `16px` 이상, `ExtraBold`로 가장 크고 강력하게 렌더링한다.
     - 의미 없이 모든 상품에 붙는 가짜 `[타임특가]` 뱃지 생성을 원천 금지한다.
     - 대신 쿠팡 API의 메타데이터를 활용하여, `isRocket === true`일 경우 스마트 블루 컬러의 **`[🚀 로켓배송]`** 뱃지를, 로켓이 아니지만 `isFreeShipping === true`일 경우 회색의 **`[📦 무료배송]`** 뱃지를 현재가 우측에 인라인으로 렌더링하여 실질적인 구매 전환(Conversion)을 유도한다.

**2. [Analysis 구역] 상품 상세(PDP), 관심상품 탭, 통합 검색 결과 (세이브루 분석 데이터)**
   - **원칙:** 우리 DB(Firestore)에 누적된 시계열 가격 데이터를 바탕으로 "진짜 싼지"를 분석하여 보여준다.
   - **UI 렌더링:** 유저의 `isWowMember` 상태에 따라 메인 가격(displayPrice)을 `wowPrice` 또는 `regularPrice`로 동적 할당한다. 렌더링 포맷은 `[평균가 대비 낙폭(▼ N%)] + [현재가(강조)] + [세이브루 60일 평균가(회색 취소선)]` 형식을 따른다.
   - **일반 회원(OFF) 넛지:** 메인 가격 하단에 군더더기 없이 `쿠팡 와우 회원가: N원`을 심플하게 추가 노출한다.
   - **제약:** 홈 탭에서 클릭하고 상세 페이지로 진입했을 때, 취소선의 의미가 '쿠팡 원가'에서 '세이브루 평균가'로 전환됨을 유저가 인지할 수 있도록 상세 페이지 상단에 툴팁이나 명확한 라벨링("60일 평균가 기준")을 제공해야 한다.

### 9.5 네이티브 Alert 사용 원천 금지 정책 (Custom UI Pop-up Policy)
(이하 동일) 스마트폰 OS 기본 `Alert.alert` 금지, 커스텀 바텀 시트 또는 모달 강제 사용.

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

### 11.2 현재 Mock 상태 및 수동/자동 전환 과도기 로직
- `productMetadataService.js` — 실 쿠팡 API 대체 mock. 실 API 통합 예정.
- **`reward_claims` 승인 프로세스의 하이브리드 운영:** 최초 유저가 제출한 구매 인증(주문번호)에 대한 1차 승인(`pending` ➔ `approved`)은 관리자 대시보드에서 수동으로 진행한다. 단, 승인 완료 이후에 발생하는 **'쿠팡 앱 내 반품/취소 어뷰징'에 대한 사후 모니터링 및 뱃지 박탈(`rejected_by_return`) 프로세스는 6.4항의 백엔드 스케줄러를 통해 100% 자동화**되어 가동된다. (초기 수동 승인과 사후 자동 회수의 이원화 체제 유지).

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

### 14.1 투 트랙(Two-Track) 알림 발송 정책 및 임계점(Threshold)
1. **가격·재입고 (Anti-Spam 임계점 적용):** 관심상품 최저가 도달 시 **앱 내 + OS 푸시를 즉시 발송**한다. 단, 유저 피로도 및 스팸성 알림을 막기 위해 10원 단위 하락에는 반응하지 않으며, 홈 탭 스마트 배너와 완벽히 동일하게 **`어제가격 대비 하락률 >= 5%` 또는 `하락액 >= 2,000원`** 조건을 충족했을 때만 `onPriceDropNotify` FCM 푸시가 가동되도록 발송 임계점을 엄격히 통제한다.
2. **맘톡·활동:** 내 글에 달린 댓글 ➔ **앱 내 + OS 푸시 발송** (좋아요는 푸시 제외)
3. **또래 맞춤:** 또래 랭킹 업데이트 ➔ **앱 내 알림만 저장**
4. **혜택·이벤트:** 체험단 당첨 등 ➔ **앱 내 + OS 푸시 (마케팅 동의자 한정)**

### 14.2 알림 설정(Settings) 및 UI/UX 로직 규칙
* **필터 & 정렬:** 상단 카테고리 필터 칩 제공, 최신순 정렬, '오늘/이전' 섹션 분리.
* **읽음 처리:** 안 읽음(Bold+연한 배경), 읽음(Regular+흰색 배경). 클릭 시 개별 읽음. 종(🔔) 뱃지는 클릭 시 즉시 0으로 초기화.
* **마케팅 수신 동의의 법적 준수:** 혜택/이벤트 알림(마케팅)의 스위치 기본값은 정보통신망법에 의거하여 가입 시 **반드시 OFF(false)**로 설정되어야 한다.
* **OS 권한 동기화 및 스마트 넛지 (Critical):**
  1. 유저가 알림 설정창에 진입할 때(Mount), 반드시 `expo-notifications`를 통해 기기 OS의 실제 알림 권한 상태를 체크해야 한다.
  2. 기기 권한이 거부(Denied) 상태라면, 앱 내의 모든 알림 스위치(가격, 활동, 혜택)는 UI 상에서 **강제로 잠금(OFF)** 처리되어야 한다.
  3. 권한이 없는 상태에서 유저가 스위치를 켜려고 시도하면, 커스텀 모달("기기 알림이 꺼져있어요")을 띄우고 `Linking.openSettings()`를 호출하여 스마트폰 설정 앱으로 다이렉트 이동시킨다.

---

## 📱 15. APP NAVIGATION & ARCHITECTURE (앱 네비게이션)

### 15.1 하단 탭 (GNB)
- [홈] - [랭킹] - [커뮤니티] - [관심상품] - [마이페이지] 5탭 체제 유지.

#### 15.2 설정창(SettingsScreen) 아키텍처 및 콘텐츠 명세

**📱 UI/UX 및 메뉴 순서 (1-Depth 직관성 & Smart Blue 테마 적용)**
1. **카카오 로그인 버튼 (최상단):** 높이 `48px`, 배경 `#FEE500`, 텍스트/로고 `#191919`.
2. 회원정보 (Membership):
   - 💎 쿠팡 와우 회원 (토글 스위치): 유저가 자신의 멤버십 상태를 변경할 수 있도록 최상단에 배치.
3. **알림 설정 (1-Depth Toggles):** 하위 메뉴 진입 없이 설정 메인 화면에서 3개의 스위치로 즉각 제어.
   - 🔔 가격·재입고 알림 (관심상품 최저가 도달 시)
   - 💬 맘톡·활동 알림 (내 글의 댓글 및 반응)
   - 🎁 혜택·이벤트 알림 (마케팅 정보 수신 동의)
4. **유틸리티 메뉴 (In-App 구현):**
   - 📢 공지사항
   - 💬 1:1 문의 및 버그 신고 (QA 효율화를 위해 명칭 변경)
   - 📄 서비스 이용약관
   - 🔒 개인정보 처리방침
   - ℹ️ 버전 정보 (클릭 시 하단 파란색 [확인] 버튼과 `개발/운영: SAVEROO Team`이 적힌 커스텀 모달 노출)
5. **위험 구역 (Danger Zone - 하단 앵커링):**
   - **동적 버튼 텍스트 로직:** 카카오 연동 유저일 경우 `[ 계정 탈퇴 ]`로 노출되며, 미연동(익명) 유저일 경우 `[ 앱 데이터 초기화 ]`로 노출. (버튼 배경은 옅은 붉은색 `#FEF2F2` 적용).

#### 15.3 탈퇴 및 초기화 2-Track 정책 (Withdrawal & Reset Logic)
세이브루는 유저의 인증 상태(카카오 연동 여부)에 따라 2가지의 완전히 다른 탈퇴/초기화 플로우를 가동하여 논리적 모순을 방지한다. 화면 내 중복되는 안내 문구는 배제하고 직관적인 1단 경고문 구조를 사용한다.

**Track A: 익명 유저 (카카오 미연동 상태)**
- **진입 버튼:** [앱 데이터 초기화]
- **화면 타이틀:** 앱 데이터 초기화
- **경고문 UX:** "앱에 저장된 관심상품 및 맞춤 정보가 즉시 영구 삭제되며, 절대 복구할 수 없습니다." (단일 Bullet Point 적용)
- **제어 로직:** 하단 `[초기화하고 처음으로 돌아가기]` 터치 시, 파이어베이스 임시 계정 및 기기 로컬 데이터(`AsyncStorage`)를 즉각 Wipe 처리하고 온보딩 1단계로 강제 랜딩.

**Track B: 정식 유저 (카카오 연동 완료 상태)**
- **진입 버튼:** [계정 탈퇴]
- **화면 타이틀:** 계정 탈퇴
- **경고문 UX (3-Bullet 압축):**
  1. 탈퇴 신청 시 30일간 계정이 비활성화되며, 이후 모든 데이터가 영구 삭제됩니다.
  2. 단, 30일 이내에 다시 카카오 계정으로 로그인하시면 탈퇴가 즉시 취소되고 데이터가 복구됩니다.
  3. 탈퇴 시 카카오 계정 연동은 기기에서 즉시 안전하게 해제됩니다.
- **제어 로직 (30일 유예):** `[최종 탈퇴하기]` 터치 시, Firestore의 `users/{uid}` 문서에 `status: 'pending_deletion'` 및 `deletionDate` 타임스탬프를 부여. Firebase Auth 삭제 및 Kakao SDK `unlink()` 호출 후 온보딩 랜딩.

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

## 📢 18. MARKETING & PR ASSETS (광고/마케팅 소스)

**[핵심 무기 1] 다차원 또래 매칭 알고리즘 (LAL Peer Score)**
- **로직 요약:** 전체 판매량 1위가 아닌, 내 아이와 [동일 월령 + 성별 + 양육 환경(워킹맘 등) + 육아 고민]이 완벽히 일치하는 부모들의 '진짜 찐 구매 데이터'만 필터링하여 순위를 제공.

**[광고 카피(Hook) 활용 예시]**

**타겟 A: 정보 검색에 지친 워킹맘 (시간 절약 강조)**
- 카피: "생후 7개월 워킹맘들이 지금 제일 많이 쟁여두는 기저귀는?"
- 서브: "맘카페 뒤질 시간 없으시죠? 세이브루가 딱 맞는 동년배 랭킹만 뽑아드릴게요."

**타겟 B: 실패 경험이 있는 맘 (신뢰도/사회적 증거 강조)**
- 카피: "국민템이라고 샀는데 우리 아이한텐 안 맞나요?"
- 서브: "수면 고민이 있는 10개월 여아 엄마들의 '진짜 1위템'을 세이브루에서 확인하세요."

**타겟 C: 임신 준비/초기 (초개인화 강조)**
- 카피: "초산이라 뭘 사야 할지 막막하다면?"
- 서브: "나와 출산 예정일이 비슷한 예비맘들의 장바구니를 훔쳐보세요."

**[마케팅 시각화(이미지) 아이디어]**
- 좌측: [쿠팡 전체 랭킹 1위 - 무작위 상품] 
- 우측: [세이브루 7개월 워킹맘 랭킹 1위 - 딱 맞는 상품] 
- "내 상황에 맞는 진짜 1위를 찾아보세요" (비교형 광고 소재)