# RULES.md

MomDeal 코드베이스 개발 규칙. 모든 개발자와 AI 어시스턴트가 따라야 한다.

---

## 1. 절대 규칙 (Hard Rules)

1. **기존 코드를 삭제하지 않는다.** 리팩토링은 명시적 요청이 있을 때만 한다.
2. **Firestore 필드명을 임의로 바꾸지 않는다.** 변경 시 `PROJECT_ARCHITECTURE.md` 스키마 테이블을 반드시 업데이트하고 응답에 명시한다.
3. **Phase 순서를 건너뛰지 않는다.** 개발 순서는 `docs/MOMDEAL_TASK_PIPELINE.md`를 따른다. 현재 Phase 6.
4. **새 Firestore 컬렉션을 추가할 때는** `PROJECT_ARCHITECTURE.md`에 스키마를 먼저 정의한다.
5. **외부 실제 API(쿠팡 스크래핑, 결제 등)는** 명시적 지시 없이 연동하지 않는다.
6. **추천 점수 로직을 변경하지 않는다.** `recommendationService.js`의 가중치·신호 수정은 별도 태스크로 처리한다.
7. **`TASK.md`를 최신 상태로 유지한다.** 기능을 완료하면 해당 항목을 체크한다.

---

## 2. 파일 배치 규칙

| 유형 | 위치 |
|---|---|
| 화면 컴포넌트 | `src/screens/` |
| 재사용 UI 컴포넌트 | `src/components/` |
| Firestore 읽기/쓰기 | `src/services/firestore/` |
| 비 Firestore 서비스 로직 | `src/services/` |
| 순수 도메인 로직 (Firebase 없음) | `src/domain/` |
| 일회성 오케스트레이션 유틸 | `src/utils/` |
| Firebase 초기화만 | `src/firebase/config.js` |
| Cloud Functions | `functions/index.js` |

새 파일을 만들기 전에 기존 파일에 추가할 수 있는지 먼저 검토한다.

---

## 3. Firestore 접근 규칙

- `db`, `auth`, `functions`는 반드시 `src/firebase/config.js`에서만 import한다.
- `getFirestore()`, `initializeApp()`을 `config.js` 밖에서 호출하지 않는다.
- userId는 항상 `auth.currentUser?.uid`로 가져온다. auth가 항상 준비됐다고 가정하지 않는다.
- Firestore `in` 연산자는 한 번에 최대 30개 항목만 허용된다. 청킹 패턴을 사용한다:

```js
const chunks = [];
for (let i = 0; i < ids.length; i += 30) chunks.push(ids.slice(i, i + 30));
const snaps = await Promise.all(chunks.map(chunk => getDocs(query(..., where('id', 'in', chunk)))));
```

- 복합 인덱스가 필요한 쿼리(`where` + `orderBy` 다른 필드 조합)는 Firebase 콘솔에서 인덱스를 먼저 생성해야 한다. 불필요한 복합 인덱스는 클라이언트 정렬로 대체한다.

---

## 4. 화면(Screen) 패턴

### 데이터 로딩
```js
const loadData = useCallback(async () => {
  try {
    const data = await someService();
    setItems(data);
  } catch (error) {
    console.log('ScreenName load error:', error);
  } finally {
    setLoading(false);
    setRefreshing(false);
  }
}, []);

useEffect(() => { loadData(); }, [loadData]);
```

- `useCallback`으로 fetch 함수를 메모이제이션한다.
- `loading`과 `refreshing`을 분리한다 (`loading` = 초기 로드, `refreshing` = 당겨서 새로고침).
- 에러는 `throw`하지 않고 `console.log`로만 기록한다.
- 탭 복귀 시 갱신이 필요한 화면은 `navigation.addListener('focus', ...)` 또는 `useFocusEffect`를 사용한다.

### 낙관적 업데이트 (Optimistic UI)
```js
// 즉시 UI 반영
setState(newValue);
try {
  await apiCall();
} catch {
  setState(oldValue); // 실패 시 롤백
}
```

저장(북마크) · 삭제 · 토글처럼 빠른 피드백이 필요한 인터랙션에 적용한다.

### 폼 화면
- `saving` boolean 상태로 submit 중 버튼 비활성화.
- 유효성 검사는 서비스 호출 전에 수행한다.
- 성공/실패 피드백은 `Alert.alert`를 사용한다.

---

## 5. 컴포넌트 패턴

### 중첩 TouchableOpacity 금지
카드 안에 버튼이 있을 경우 외부 `TouchableOpacity`를 `View`로 교체하고, 내부에 별도 `TouchableOpacity`를 둔다:

```jsx
// ❌ 잘못된 패턴
<TouchableOpacity onPress={onCardPress}>
  <TouchableOpacity onPress={onButtonPress}>...</TouchableOpacity>
</TouchableOpacity>

// ✅ 올바른 패턴
<View>
  <TouchableOpacity onPress={onCardPress}>...</TouchableOpacity>
  <TouchableOpacity onPress={onButtonPress}>...</TouchableOpacity>
</View>
```

### 조건부 렌더링
삼항 연산자 대신 `&&` 또는 `condition ? <A /> : null` 패턴을 사용한다. 복잡한 조건 블록은 즉시 실행 함수(`(() => { ... })()`)로 분리한다.

### 인라인 컴포넌트
같은 파일 안에서만 쓰이는 컴포넌트는 별도 파일로 분리하지 않고 동일 파일 상단에 함수로 정의한다.

---

## 6. 서비스 레이어 규칙

### 부수 효과 (Fire-and-forget)
응답을 기다릴 필요 없는 작업은 `.catch(() => {})` 패턴으로 논블로킹 처리한다:
```js
recordPrice(productId, price, 'coupang').catch(() => {});
```

### 병렬 페치
독립적인 Firestore 쿼리는 `Promise.all`로 병렬 실행한다:
```js
const [snap1, snap2, snap3] = await Promise.all([
  getDoc(...),
  getDocs(...),
  getReviews(productId),
]);
```

### 서비스 함수 반환 형태
- `null` — 해당 데이터 없음
- `[]` — 빈 목록
- 에러 시 throw하지 않고 null / 빈 배열 반환을 기본으로 한다 (UI 레이어에서 방어 처리 가능하도록).

---

## 7. 도메인 규칙

### 아이 성장 단계
- `ageMonth`와 `stage`는 화면이나 서비스에서 직접 계산하지 않는다.
- 반드시 `buildChildComputedFields({ type, birthDate })`를 사용한다 (`src/domain/child/childStageUtils.js`).
- 아이 생성/수정 시 항상 이 함수를 거쳐 저장한다.

### 상품 등록
- 진입점은 항상 `registerCoupangProduct(url)` (`src/utils/registerCoupangProduct.js`).
- `productId`는 쿠팡 URL에서 정규식으로 추출한 숫자 ID 문자열이다.
- Firestore 문서 ID는 이 `productId`와 동일하다.

### 가격 추적
- 가격 기록: `recordPrice(productId, price, source)` (`priceTrackingService.js`)
- 가격 이력 조회: `getPriceHistory(productId)` — newest-first
- 상세 인텔리전스: `getPriceIntelligence(productId)` — 최근 30개 기준 최저/최고/평균/가이던스
- 가격이 0이거나 null이면 `recordPrice`는 자동으로 무시한다.

### 가격 가이던스 기준 (일관성 유지)
```
currentPrice ≤ average * 0.95  → "지금 구매 추천"
currentPrice ≥ highest * 0.90  → "최근 최고가 근처"  (위 조건 우선)
currentPrice > average         → "평균보다 높은 가격"
```
이 로직은 `priceTrackingService.getPriceIntelligence`와 `Tab1_ProductList.fetchSocialProof`에 동일하게 적용한다. 기준을 바꿀 때는 두 곳을 함께 수정한다.

### 사용자 액션 기록
상품에 대한 모든 사용자 인터랙션 후 호출한다:
```js
recordProductAction({
  userId: auth.currentUser?.uid,
  productId,
  actionType: 'click' | 'purchase' | 'view',
});
```

---

## 8. 추천 엔진 규칙

- 점수 계산 로직은 `src/services/recommendationService.js`에만 존재한다.
- 현재 가중치: `stageMatch(0.20) · categoryMatch(0.15) · peerPopularity(0.15) · userBehaviorScore(0.05) · reviewScore(0.05) · peerSimilarityScore(0.20) · trendScore(0.10) · reviewLikeScore(0.10)`
- 신호를 추가하거나 가중치를 변경할 때는 반드시 `PROJECT_ARCHITECTURE.md`를 업데이트하고 합계가 1.0이 되는지 확인한다.
- 반환 형태: `[{ productId, score, scoreBreakdown, product }]`
- `buildRecommendationReasons(scoreBreakdown)`으로 UI 배지 텍스트를 생성한다.

---

## 9. UI 규칙

### 배지 컬러 시스템
| 의미 | 배경 | 텍스트 |
|---|---|---|
| 긍정 / 추천 (초록) | `#f0fdf4` | `#15803d` |
| 경고 / 주의 (주황) | `#fff7ed` | `#c2410c` |
| 위험 / 최고가 (빨강) | `#fef2f2` | `#b91c1c` |
| 인기 / 트렌드 (주황 강조) | `#fff7ed` | `#c2410c` |
| 카테고리 (파랑) | `#eff6ff` | `#2563eb` |
| 성장 단계 (초록) | `#f0fdf4` | `#16a34a` |

### 구매 버튼 컬러
- 구매 유도 (CTA): `#f97316` (주황)
- 비활성 / 품절: `#cbd5e1` (회색)

### 섹션 제목
`fontSize: 17, fontWeight: '800', color: '#0f172a'`

### 빈 상태 (Empty State)
`fontSize: 14, color: '#94a3b8'`, 중앙 정렬, 카드 내부에 표시.

---

## 10. Mock / Stub 현황

아래 항목은 실제 데이터가 아니므로 실제인 것처럼 처리하지 않는다.

| 파일 | 상태 | 가짜인 부분 |
|---|---|---|
| `src/services/productMetadataService.js` | MOCK | name/brand/category/price 모두 productId 기반 가짜 데이터 |
| `functions/index.js` fetchCoupangProduct | PARTIAL | name은 실제 스크래핑, price는 항상 null |
| `offers` price 필드 | STUB | 항상 0으로 저장됨 |

---

## 11. 스키마 변경 프로토콜

Firestore 필드를 추가하거나 이름을 바꿀 때:

1. `PROJECT_ARCHITECTURE.md`의 해당 컬렉션 스키마 테이블을 업데이트한다.
2. 관련 repository 파일의 normalizer를 수정한다 (예: `childrenRepository.js`의 `normalizeChildPayload`).
3. 응답에 변경 내용을 명시한다. 조용히 바꾸지 않는다.
4. `TASK.md` 기술 부채 항목에 반영한다.

---

## 12. 새 컬렉션 추가 시 체크리스트

- [ ] `PROJECT_ARCHITECTURE.md`에 스키마 정의 추가
- [ ] `src/services/firestore/`에 repository 파일 생성
- [ ] `TASK.md` 완료 항목에 기록
- [ ] 필요한 Firestore 인덱스 콘솔에서 생성
