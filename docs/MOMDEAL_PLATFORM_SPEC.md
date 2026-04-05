# MOMDEAL PLATFORM SPEC
Version: V1
Project: MomDeal
Type: Data Driven Parenting Commerce Platform

--------------------------------------------------

# 1. PRODUCT SPEC

## 1.1 Product Vision

MomDeal은 단순한 가격 비교 앱이 아니다.

MomDeal은

**육아 데이터를 기반으로 부모에게 필요한 제품과 서비스를 추천하는 데이터 플랫폼이다.**

핵심 철학

육아 = 데이터 문제

부모는 매 시기마다 필요한 제품이 다르다.

예

신생아 → 기저귀, 젖병  
뒤집기 → 놀이매트  
이유식 → 식기  
걸음마 → 안전용품  

MomDeal은

아이의 성장 데이터를 기반으로  
적절한 제품을 자동으로 추천한다.

--------------------------------------------------

## 1.2 Core Value

MomDeal이 해결하는 문제

1️⃣ 부모는 무엇을 사야할지 모른다  
2️⃣ 맘카페 정보는 광고가 많다  
3️⃣ 육아 제품은 시기 의존성이 강하다  

MomDeal 해결 방식

아이 데이터 기반 추천

--------------------------------------------------

## 1.3 Core Feature

MVP 기준 핵심 기능

1. 아이 등록
2. 제품 등록
3. 가격 추적
4. 또래 부모 기반 추천
5. 육아 단계 기반 추천

--------------------------------------------------

## 1.4 Main Navigation

Bottom Tab 구조

추천
상품
아이
커뮤니티

--------------------------------------------------

# 2. SYSTEM SPEC

## 2.1 Data Structure

User
Child
Product
Offer
Review
Recommendation

--------------------------------------------------

## 2.2 Firestore Collections

users
children
products
products/{productId}/offers
reviews
recommendations

--------------------------------------------------

## 2.3 Child Data

Child 데이터는 추천 엔진의 핵심이다.

Child Fields

childId  
userId  
name  
gender  
birthDate  
birthOrder  
type (pregnancy | child)  
pregnancyWeek  
feedingType  
ageMonth  
stage  
weight  
height  
createdAt  
updatedAt  

--------------------------------------------------

## 2.4 Product Data

productId  
name  
brand  
category  
stageTarget  
price  
source  
createdAt  

--------------------------------------------------

## 2.5 Offer Data

offerId  
productId  
mallName  
price  
checkedAt  
url  

--------------------------------------------------

# 3. RECOMMENDATION ENGINE

MomDeal 추천 시스템은 단일 알고리즘이 아니다.

Hybrid Recommendation System

Rule Based + Data Based

--------------------------------------------------

## 3.1 Recommendation Score

추천 점수

score =

StageScore  
+ ParentSimilarityScore  
+ ProductQualityScore  
+ PriceScore  
+ TrendScore

--------------------------------------------------

## 3.2 StageScore

아이의 성장 단계 기반 추천

예

0~3개월 → 기저귀  
4~6개월 → 뒤집기 매트  
6~8개월 → 이유식 용품

--------------------------------------------------

## 3.3 ParentSimilarityScore

또래 부모 데이터 기반 추천

비슷한 조건

아이 나이  
수유 방식  
체중  
성별

--------------------------------------------------

## 3.4 ProductQualityScore

제품 신뢰도

리뷰 수  
평균 평점  
반복 구매율

--------------------------------------------------

## 3.5 PriceScore

가격 경쟁력

현재 가격  
역대 최저가  
가격 변동

--------------------------------------------------

## 3.6 TrendScore

플랫폼 인기

최근 구매량  
조회수  
위시리스트 수

--------------------------------------------------

# 4. DATA PLATFORM STRATEGY

MomDeal은 커머스 앱이 아니라

육아 데이터 플랫폼이다.

--------------------------------------------------

## 4.1 Data Asset

MomDeal의 핵심 자산

아이 성장 데이터

--------------------------------------------------

## 4.2 Network Effect

아이 데이터가 많아질수록

추천 정확도가 상승한다.

--------------------------------------------------

## 4.3 Expansion

MomDeal 확장 영역

육아  
교육  
헬스  
여행  
보험  
정부 서비스  

--------------------------------------------------

# 5. TRUST SYSTEM

맘카페 문제 해결

--------------------------------------------------

## 5.1 Account Trust

카카오 로그인

--------------------------------------------------

## 5.2 Review Trust

리뷰 신뢰도

구매 인증  
사진 첨부  
활동 점수

--------------------------------------------------

# 6. ARCHITECTURE

Backend

Firebase

Firestore  
Cloud Functions  
Scheduled Jobs  

--------------------------------------------------

## 6.1 Batch Jobs

Daily Job

가격 업데이트  
추천 업데이트

--------------------------------------------------

## 6.2 Real Time

제품 등록  
아이 등록  
추천 즉시 계산

--------------------------------------------------

# 7. PLATFORM PHILOSOPHY

MomDeal은

육아 데이터를 기반으로

부모에게

정확한 추천을 제공하는

데이터 플랫폼이다.