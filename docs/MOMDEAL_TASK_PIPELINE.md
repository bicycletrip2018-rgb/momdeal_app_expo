# MOMDEAL DEVELOPMENT PIPELINE

이 문서는 MomDeal 플랫폼 개발 순서를 정의한다.

Cursor는 아래 순서를 반드시 따라야 하며
순서를 건너뛰거나 구조를 임의 변경하면 안된다.

--------------------------------------------------

# PHASE 1

User System

목표

사용자 계정 기반 데이터 구조 생성

개발 항목

users collection
auth integration
user profile

DB

users/{userId}

fields

email
provider
createdAt
updatedAt

--------------------------------------------------

# PHASE 2

Child Data System

목표

아이 데이터를 기반으로 추천 세그먼트 생성

개발 항목

child 등록
child 목록
child 업데이트

DB

children/{childId}

fields

userId
name
gender
birthDate
birthOrder
type
pregnancyWeek
dueDate
feedingType
ageMonth
stage
createdAt
updatedAt

--------------------------------------------------

# PHASE 3

Product Core System

목표

상품 데이터 구조 생성

DB

products/{productId}

fields

name
brand
category
currentPrice
createdAt
updatedAt

subcollection

offers

offers/{offerId}

fields

price
mallName
url
checkedAt
isOutOfStock

--------------------------------------------------

# PHASE 4

Product Registration System

목표

유저가 상품을 등록하면
가격 추적이 시작되는 구조

기능

쿠팡 링크 등록
productId 추출
상품 정보 fetch
offers 생성

--------------------------------------------------

# PHASE 5

Recommendation Engine

목표

아이 데이터를 기반으로
추천 점수 계산

추천 기준

stage
ageMonth
feedingType
growth signals
community signal

--------------------------------------------------

# PHASE 6

Community System

목표

맘카페 대체

features

review
photo review
real purchase verification

DB

reviews/{reviewId}

fields

userId
productId
rating
content
images
verifiedPurchase
createdAt

--------------------------------------------------

# PHASE 7

Recommendation Ranking

목표

추천 점수 기반 피드 생성

추천 점수 계산

score =

stageScore
+ communityScore
+ purchaseScore
+ popularityScore
+ priceScore

--------------------------------------------------

# PHASE 8

Platform Expansion

목표

육아 데이터 기반 플랫폼 확장

확장 영역

교육
건강
여행
B2B
정부 서비스

--------------------------------------------------

# RULES

Cursor는

1. 기존 코드를 삭제하면 안된다
2. 기능은 단계 순서대로 개발한다
3. 구조를 임의 변경하면 안된다
4. DB 스키마 변경 시 반드시 명시해야 한다