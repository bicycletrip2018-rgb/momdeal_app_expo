import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { DeepLinkContext } from '../contexts/DeepLinkContext';
import {
  FlatList,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { Info } from 'lucide-react-native';
import GlobalHeader from '../components/GlobalHeader';
import { globalFavorites } from '../utils/favoriteStore';
import { fetchAffiliateAndNavigate } from '../utils/fetchProductData';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { recordProductAction } from '../services/productActionService';
import { resolveAgingPriceDisplay } from '../utils/priceDisplay';

// ─── Stage display labels ─────────────────────────────────────────────────────

const STAGE_LABELS = {
  pregnancy:    '임신중',
  newborn:      '신생아',
  early_infant: '초기영아',
  infant:       '영아',
  toddler:      '걸음마기',
  early_child:  '유아',
  child:        '아동',
};

// ─── All categories (bottom sheet) ───────────────────────────────────────────

const ALL_CATEGORIES = [
  { key: 'baby',   label: '출산/유아동' },
  { key: 'food',   label: '식품/분유'   },
  { key: 'living', label: '생활용품'    },
  { key: 'beauty', label: '뷰티'        },
  { key: 'fashion', label: '패션의류'   },
  { key: 'home',   label: '홈인테리어'  },
  { key: 'digital', label: '가전디지털' },
  { key: 'hobby',  label: '완구/취미'   },
];

// ─── Cohort-based dynamic category tabs ──────────────────────────────────────

const COHORT_CATEGORIES = {
  pregnancy:    [{ key: 'living', label: '임산부 위생' },  { key: 'food', label: '임산부 식품' },  { key: 'baby', label: '신생아 준비' }],
  newborn:      [{ key: 'living', label: '기저귀/위생' },  { key: 'food', label: '분유/이유식' },  { key: 'baby', label: '신생아용품' }],
  early_infant: [{ key: 'living', label: '육아필수품' },   { key: 'food', label: '수유/분유' },    { key: 'baby', label: '초기영아용품' }],
  infant:       [{ key: 'living', label: '안전용품' },     { key: 'food', label: '이유식/분유' },  { key: 'baby', label: '영아용품' }],
  toddler:      [{ key: 'living', label: '안전용품' },     { key: 'food', label: '유아 간식' },    { key: 'baby', label: '걸음마 용품' }],
  early_child:  [{ key: 'living', label: '생활용품' },     { key: 'food', label: '아동 식품' },    { key: 'baby', label: '유아 완구' }],
  child:        [{ key: 'living', label: '생활용품' },     { key: 'food', label: '아동 식품' },    { key: 'baby', label: '아동 용품' }],
  default:      [{ key: 'living', label: '생활용품' },     { key: 'food', label: '식품/분유' },    { key: 'baby', label: '출산/유아동' }],
};

function getCohortCategories(child) {
  if (!child?.stage) return COHORT_CATEGORIES.default;
  return COHORT_CATEGORIES[child.stage] ?? COHORT_CATEGORIES.default;
}

// ─── Mock ranked products (10+ per category) ─────────────────────────────────

const MOCK_RANKED = [
  // 출산/유아동
  { id: 'r1',  categoryKey: 'baby',   brand: '하기스',      name: '네이처메이드 기저귀 신생아용 100매 초슬림 풀박스',    currentPrice: 28900, avgPrice: 38500, discountPct: 25, deliveryType: 'rocket', rating: 4.9, reviewCount: 2140, rankChange: 'NEW', iconName: 'heart-outline' },
  { id: 'r2',  categoryKey: 'baby',   brand: '헤겐',        name: '와이드넥 PP 젖병 세트 160ml + 240ml 4개입 신생아',   currentPrice: 34900, avgPrice: 46000, discountPct: 24, deliveryType: 'rocket', rating: 4.8, reviewCount: 1893, rankChange: +12,  iconName: 'water-outline' },
  { id: 'r3',  categoryKey: 'baby',   brand: '마미포코',    name: '팬티형 기저귀 M사이즈 58매 × 2팩 점보 세트',         currentPrice: 39900, avgPrice: 54000, discountPct: 26, deliveryType: 'rocket', rating: 4.7, reviewCount: 3271, rankChange: +5,   iconName: 'heart-outline' },
  { id: 'r4',  categoryKey: 'baby',   brand: '스토케',      name: '스쿠트5 바운서 스트롤러 신생아부터 사용 가능',        currentPrice: 249000, avgPrice: 320000, discountPct: 22, deliveryType: 'normal', rating: 4.9, reviewCount: 875, rankChange: +8,   iconName: 'cart-outline' },
  { id: 'r5',  categoryKey: 'baby',   brand: '팸퍼스',      name: '하이비 프리미엄 기저귀 L사이즈 56매',                currentPrice: 26900, avgPrice: 38000, discountPct: 29, deliveryType: 'rocket', rating: 4.7, reviewCount: 1743, rankChange: +3,   iconName: 'heart-outline' },
  { id: 'r6',  categoryKey: 'baby',   brand: '다이치',      name: '듀얼핏 360 회전형 카시트 신생아~4세 ISOFIX',         currentPrice: 319000, avgPrice: 429000, discountPct: 26, deliveryType: 'normal', rating: 4.8, reviewCount: 2231, rankChange: -1,   iconName: 'shield-outline' },
  { id: 'r7',  categoryKey: 'baby',   brand: '피셔프라이스', name: '소리나는 멀티활동 점퍼루 4-in-1 성장형 바운서',      currentPrice: 159000, avgPrice: 199000, discountPct: 20, deliveryType: 'rocket', rating: 4.9, reviewCount: 987, rankChange: +15,  iconName: 'color-wand-outline' },
  { id: 'r8',  categoryKey: 'baby',   brand: '루미',        name: '이유식 용기 세트 100ml × 8개 BPA Free',             currentPrice: 18900, avgPrice: 28000, discountPct: 32, deliveryType: 'normal', rating: 4.5, reviewCount: 632, rankChange: 'NEW', iconName: 'nutrition-outline' },
  { id: 'r9',  categoryKey: 'baby',   brand: '아토팜',      name: '어린이 미네랄 선크림 SPF50+ PA++++ 70ml',           currentPrice: 19900, avgPrice: 27000, discountPct: 26, deliveryType: 'normal', rating: 4.6, reviewCount: 891, rankChange: -4,   iconName: 'sunny-outline' },
  { id: 'r10', categoryKey: 'baby',   brand: '세타필 베이비', name: '신생아 전용 데일리 로션 400ml 무향 저자극',         currentPrice: 31900, avgPrice: 42000, discountPct: 24, deliveryType: 'rocket', rating: 4.9, reviewCount: 1456, rankChange: +6,   iconName: 'flower-outline' },
  // 식품/분유
  { id: 'r11', categoryKey: 'food',   brand: '매일유업',    name: '앱솔루트 분유 스텝2 800g × 2캔 DHA 강화 패키지',     currentPrice: 58900, avgPrice: 76000, discountPct: 22, deliveryType: 'rocket', rating: 4.7, reviewCount: 2104, rankChange: -3,   iconName: 'flask-outline' },
  { id: 'r12', categoryKey: 'food',   brand: '아이배냇',    name: '유기농 쌀과자 딸기맛 15봉 멀티팩 무첨가',            currentPrice: 15800, avgPrice: 23600, discountPct: 33, deliveryType: 'rocket', rating: 4.7, reviewCount: 1124, rankChange: +9,   iconName: 'leaf-outline' },
  { id: 'r13', categoryKey: 'food',   brand: '베이비본죽',  name: '이유식 중기 완료기 세트 10팩 냉동 보관',             currentPrice: 38900, avgPrice: 54000, discountPct: 28, deliveryType: 'fresh',  rating: 4.9, reviewCount: 1567, rankChange: -2,   iconName: 'restaurant-outline' },
  { id: 'r14', categoryKey: 'food',   brand: '남양유업',    name: '임페리얼 드림XO 3단계 800g 유아 성장 분유',          currentPrice: 52000, avgPrice: 68000, discountPct: 24, deliveryType: 'rocket', rating: 4.6, reviewCount: 988,  rankChange: +4,   iconName: 'flask-outline' },
  { id: 'r15', categoryKey: 'food',   brand: '일동후디스',  name: '하이키드 성장기용 조제분유 4단계 800g',              currentPrice: 44500, avgPrice: 59000, discountPct: 25, deliveryType: 'rocket', rating: 4.5, reviewCount: 743,  rankChange: +2,   iconName: 'flask-outline' },
  { id: 'r16', categoryKey: 'food',   brand: '아이꼬야',    name: '유기농 이유식 퓨레 사과 + 당근 혼합 10팩',          currentPrice: 22900, avgPrice: 32000, discountPct: 28, deliveryType: 'fresh',  rating: 4.8, reviewCount: 1230, rankChange: 'NEW', iconName: 'nutrition-outline' },
  { id: 'r17', categoryKey: 'food',   brand: '베베쿡',      name: '냉동 이유식 초기 1단계 완료팩 12종 세트',           currentPrice: 34900, avgPrice: 48000, discountPct: 27, deliveryType: 'fresh',  rating: 4.7, reviewCount: 876,  rankChange: +7,   iconName: 'restaurant-outline' },
  { id: 'r18', categoryKey: 'food',   brand: '엘빈즈',      name: '유기농 쌀 미음 혼합팩 20봉 무방부제 간편 이유식',   currentPrice: 18500, avgPrice: 26000, discountPct: 29, deliveryType: 'rocket', rating: 4.6, reviewCount: 654,  rankChange: +1,   iconName: 'leaf-outline' },
  { id: 'r19', categoryKey: 'food',   brand: '롤리폴리',    name: '과일 스무디 파우치 딸기 + 바나나 혼합 15팩',        currentPrice: 12900, avgPrice: 18900, discountPct: 32, deliveryType: 'rocket', rating: 4.5, reviewCount: 432,  rankChange: -1,   iconName: 'nutrition-outline' },
  { id: 'r20', categoryKey: 'food',   brand: '아담스',      name: '유아 전용 천연 과일 간식 모둠팩 24개입',            currentPrice: 16800, avgPrice: 24000, discountPct: 30, deliveryType: 'rocket', rating: 4.7, reviewCount: 521,  rankChange: +3,   iconName: 'leaf-outline' },
  // 생활용품
  { id: 'r21', categoryKey: 'living', brand: '퍼실',        name: '베이비 세탁세제 3L 유아 피부 전용 무형광',           currentPrice: 13200, avgPrice: 18900, discountPct: 30, deliveryType: 'rocket', rating: 4.8, reviewCount: 2456, rankChange: +1,   iconName: 'water-outline' },
  { id: 'r22', categoryKey: 'living', brand: '드리미',      name: '유아 안전 계단 게이트 압박식 확장형 75~120cm',       currentPrice: 38900, avgPrice: 59000, discountPct: 34, deliveryType: 'rocket', rating: 4.7, reviewCount: 1345, rankChange: +4,   iconName: 'shield-outline' },
  { id: 'r23', categoryKey: 'living', brand: '샤오미',      name: '유아 스마트 모니터 카메라 양방향 음성 야간투시',     currentPrice: 49900, avgPrice: 79000, discountPct: 37, deliveryType: 'rocket', rating: 4.6, reviewCount: 891,  rankChange: 'NEW', iconName: 'videocam-outline' },
  { id: 'r24', categoryKey: 'living', brand: '윌리스',      name: '유아 안전 콘센트 커버 12개입 + 모서리 보호대 세트',  currentPrice: 8900,  avgPrice: 14000, discountPct: 36, deliveryType: 'rocket', rating: 4.7, reviewCount: 3102, rankChange: +2,   iconName: 'shield-outline' },
  { id: 'r25', categoryKey: 'living', brand: '버블베베',    name: '유아 버블 목욕 젤 무향 무색소 500ml',               currentPrice: 11900, avgPrice: 17500, discountPct: 32, deliveryType: 'rocket', rating: 4.8, reviewCount: 1876, rankChange: +6,   iconName: 'water-outline' },
  { id: 'r26', categoryKey: 'living', brand: '록시땅',      name: '베이비 스킨케어 로션 200ml 민감 피부용',            currentPrice: 29900, avgPrice: 42000, discountPct: 29, deliveryType: 'normal', rating: 4.9, reviewCount: 1102, rankChange: -2,   iconName: 'flower-outline' },
  { id: 'r27', categoryKey: 'living', brand: '엑스봄',      name: '유아 침구 세트 이불 + 베개 신생아 100% 순면',       currentPrice: 34900, avgPrice: 52000, discountPct: 33, deliveryType: 'rocket', rating: 4.6, reviewCount: 743,  rankChange: +5,   iconName: 'bed-outline' },
  { id: 'r28', categoryKey: 'living', brand: '코멧',        name: '아기 물티슈 캡형 100매 × 10팩 순면 무향',           currentPrice: 15900, avgPrice: 22000, discountPct: 28, deliveryType: 'rocket', rating: 4.7, reviewCount: 4231, rankChange: +3,   iconName: 'water-outline' },
  { id: 'r29', categoryKey: 'living', brand: '러브베베',    name: '유아 체온계 귀적외선 측정기 1초 측정',              currentPrice: 22900, avgPrice: 35000, discountPct: 35, deliveryType: 'rocket', rating: 4.8, reviewCount: 987,  rankChange: -1,   iconName: 'thermometer-outline' },
  { id: 'r30', categoryKey: 'living',  brand: '좋은느낌',    name: '임산부용 산모 위생 패드 대형 30매 × 2팩',             currentPrice: 17500,  avgPrice: 24000,  discountPct: 27, deliveryType: 'rocket', rating: 4.5, reviewCount: 1654, rankChange: +8,   iconName: 'heart-outline' },
  // 뷰티
  { id: 'r31', categoryKey: 'beauty', brand: '이니스프리',  name: '블랙티 유스 인핸싱 앰플 30ml 집중 안티에이징',         currentPrice: 28000,  avgPrice: 38000,  discountPct: 26, deliveryType: 'rocket', rating: 4.8, reviewCount: 2341, rankChange: +5,   iconName: 'sparkles-outline' },
  { id: 'r32', categoryKey: 'beauty', brand: '라운드랩',    name: '독도 토너 200ml 저자극 수분 진정 민감피부용',           currentPrice: 14900,  avgPrice: 21000,  discountPct: 29, deliveryType: 'rocket', rating: 4.8, reviewCount: 4521, rankChange: +12,  iconName: 'water-outline' },
  { id: 'r33', categoryKey: 'beauty', brand: '아누아',      name: '어성초 77% 수딩토너 250ml 진정 보습 대용량',            currentPrice: 18900,  avgPrice: 26000,  discountPct: 27, deliveryType: 'rocket', rating: 4.9, reviewCount: 6789, rankChange: +3,   iconName: 'leaf-outline' },
  { id: 'r34', categoryKey: 'beauty', brand: '닥터지',      name: 'R.E.D. 블레미쉬 클리어 수딩크림 70ml 진정 트러블',     currentPrice: 22000,  avgPrice: 32000,  discountPct: 31, deliveryType: 'rocket', rating: 4.7, reviewCount: 3210, rankChange: 'NEW', iconName: 'flower-outline' },
  { id: 'r35', categoryKey: 'beauty', brand: '조선미녀',    name: '맑은 쌀 선크림 SPF50+ PA++++ 50ml 가벼운 어그러짐',    currentPrice: 16900,  avgPrice: 23000,  discountPct: 27, deliveryType: 'rocket', rating: 4.9, reviewCount: 8912, rankChange: +8,   iconName: 'sunny-outline' },
  // 홈인테리어
  { id: 'r36', categoryKey: 'home',   brand: '일룸',        name: '에보 책상 + 서랍장 세트 1200 화이트 성장형 아동',       currentPrice: 289000, avgPrice: 399000, discountPct: 28, deliveryType: 'normal', rating: 4.7, reviewCount: 1203, rankChange: +4,   iconName: 'desktop-outline' },
  { id: 'r37', categoryKey: 'home',   brand: '리바트',      name: '심플리 패브릭 소파 3인용 라이트그레이 거실',             currentPrice: 349000, avgPrice: 489000, discountPct: 29, deliveryType: 'normal', rating: 4.6, reviewCount: 876,  rankChange: +2,   iconName: 'bed-outline' },
  { id: 'r38', categoryKey: 'home',   brand: '퍼시스',      name: '하이브리드 매트리스 퀸 200X150 독립스프링 고탄력',       currentPrice: 449000, avgPrice: 620000, discountPct: 28, deliveryType: 'normal', rating: 4.8, reviewCount: 654,  rankChange: 'NEW', iconName: 'bed-outline' },
  { id: 'r39', categoryKey: 'home',   brand: '모던하우스',  name: '오크 원목 커피테이블 600X1200 천연오일마감 북유럽',       currentPrice: 128000, avgPrice: 179000, discountPct: 29, deliveryType: 'rocket', rating: 4.5, reviewCount: 432,  rankChange: +6,   iconName: 'grid-outline' },
  { id: 'r40', categoryKey: 'home',   brand: '한샘',        name: '시스템 붙박이장 1200 화이트 맞춤형 수납장 슬라이딩',     currentPrice: 198000, avgPrice: 278000, discountPct: 29, deliveryType: 'normal', rating: 4.7, reviewCount: 987,  rankChange: +1,   iconName: 'grid-outline' },
  // 가전디지털
  { id: 'r41', categoryKey: 'digital', brand: '삼성',       name: '갤럭시 탭 A9+ 11인치 WiFi 128GB 그라파이트 태블릿',     currentPrice: 349000, avgPrice: 499000, discountPct: 30, deliveryType: 'rocket', rating: 4.7, reviewCount: 2341, rankChange: +5,   iconName: 'tablet-portrait-outline' },
  { id: 'r42', categoryKey: 'digital', brand: 'LG',         name: '코드제로 A9S 올인원 타워 무선청소기 습건식 겸용',        currentPrice: 489000, avgPrice: 690000, discountPct: 29, deliveryType: 'rocket', rating: 4.8, reviewCount: 1876, rankChange: +3,   iconName: 'flash-outline' },
  { id: 'r43', categoryKey: 'digital', brand: '다이슨',     name: 'V12 디텍트 슬림 플러피 무선청소기 레이저 먼지감지',      currentPrice: 549000, avgPrice: 749000, discountPct: 27, deliveryType: 'normal', rating: 4.9, reviewCount: 3421, rankChange: +7,   iconName: 'flash-outline' },
  { id: 'r44', categoryKey: 'digital', brand: '쿠쿠',       name: 'IH 압력밥솥 CRP-PHB0610FW 6인용 스마트 쿠킹',          currentPrice: 149000, avgPrice: 210000, discountPct: 29, deliveryType: 'rocket', rating: 4.7, reviewCount: 2109, rankChange: 'NEW', iconName: 'restaurant-outline' },
  { id: 'r45', categoryKey: 'digital', brand: '소니',       name: 'WH-1000XM5 노이즈캔슬링 블루투스 헤드폰 LDAC',          currentPrice: 289000, avgPrice: 399000, discountPct: 28, deliveryType: 'rocket', rating: 4.9, reviewCount: 4567, rankChange: +9,   iconName: 'headset-outline' },
];

// Custom-ranking reason templates
const CUSTOM_REASONS = [
  (c) => `${c.ageLabel} ${c.genderLabel} 부모들이 많이 샀어요`,
  (_) => `또래 맘들이 재구매하는 상품`,
  (c) => `${c.ageLabel} 필수 육아템`,
  (_) => `이 시기 엄마들의 1순위 선택`,
  (_) => `워킹맘도 강력 추천하는 상품`,
];

// ─── Sub-component: PersonalizationTag ───────────────────────────────────────

function PersonalizationTag({ item, child, idx }) {
  if (!child) return null;
  const ageLabel    = `${child.ageMonth}개월`;
  const genderLabel = child.gender === 'female' ? '여아' : '남아';
  const reason = CUSTOM_REASONS[idx % CUSTOM_REASONS.length]({ ageLabel, genderLabel });
  return (
    <View style={styles.customTag}>
      <Text style={styles.customTagText}>{reason}</Text>
    </View>
  );
}

// ─── Sub-component: RankChangeBadge ──────────────────────────────────────────

function RankChangeBadge({ rankChange }) {
  if (rankChange === 'NEW') return <Text style={styles.rankChangeNew}>NEW</Text>;
  if (typeof rankChange === 'number' && rankChange > 0) return <Text style={styles.rankChangeUp}>▲ {rankChange}</Text>;
  if (typeof rankChange === 'number' && rankChange < 0) return <Text style={styles.rankChangeDown}>▼ {Math.abs(rankChange)}</Text>;
  return null;
}

// ─── Sub-component: RankItem ──────────────────────────────────────────────────

function RankItem({ item, rank, navigation, isCustom, child }) {
  const medalColors = { 1: '#FBBF24', 2: '#94A3B8', 3: '#B45309' };
  const medalBg = medalColors[rank];

  return (
    <TouchableOpacity
      style={styles.rankItem}
      onPress={() => {
        recordProductAction({ userId: auth.currentUser?.uid, productId: item.id, productGroupId: item.id, actionType: 'click' });
        navigation.navigate('Detail', { item: { ...item, currentPrice: item.currentPrice }, from: 'Ranking' });
      }}
      activeOpacity={0.85}
    >
      {/* Thumbnail with rank badge overlay */}
      <View style={styles.thumbWrap}>
        <View style={styles.thumbPlaceholder}>
          <Ionicons name={item.iconName || 'cube-outline'} size={28} color="#94A3B8" />
        </View>
        {/* Rank badge — top-left overlay */}
        <View style={[styles.rankOverlay, medalBg ? { backgroundColor: medalBg } : styles.rankOverlayDefault]}>
          <Text style={styles.rankOverlayText}>{rank}</Text>
        </View>
        {/* Rank change badge — top-right */}
        <View style={styles.rankChangeOverlay}>
          <RankChangeBadge rankChange={item.rankChange} />
        </View>
      </View>

      {/* Right: text info */}
      <View style={styles.itemInfo}>
        {isCustom && child && <PersonalizationTag item={item} child={child} idx={rank} />}

        {/* Brand + Name */}
        <Text numberOfLines={2} style={{ lineHeight: 18, marginBottom: 4 }}>
          <Text style={{ fontSize: 11, fontWeight: '400', color: '#94A3B8' }}>{item.brand} </Text>
          <Text style={{ fontSize: 13, fontWeight: '600', color: '#111827' }}>{item.name}</Text>
        </Text>

        {/* Rating */}
        <View style={[styles.itemRatingRow, { marginBottom: 4 }]}>
          <Ionicons name="star" size={11} color="#FBBF24" />
          <Text style={styles.itemRating}>{item.rating}</Text>
          <Text style={styles.itemReviewCount}>({item.reviewCount.toLocaleString('ko-KR')})</Text>
        </View>

        {/* Price row: ▼ % + current price + delivery tag inline */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {item.discountPct > 0 && (
            <Text style={{ fontSize: 13, fontWeight: '800', color: '#2E6FF2' }}>
              ▼ {item.discountPct}%
            </Text>
          )}
          <Text style={{ fontSize: 16, fontWeight: '800', color: '#111827' }}>
            ₩{item.currentPrice.toLocaleString('ko-KR')}
          </Text>
          {item.deliveryType === 'rocket' && (
            <Text style={{ fontSize: 10, color: '#2E6FF2', fontWeight: '700', borderWidth: 1, borderColor: '#BFDBFE', borderRadius: 3, paddingHorizontal: 4, paddingVertical: 1 }}>로켓배송</Text>
          )}
          {item.deliveryType === 'fresh' && (
            <Text style={{ fontSize: 10, color: '#16A34A', fontWeight: '700', borderWidth: 1, borderColor: '#BBF7D0', borderRadius: 3, paddingHorizontal: 4, paddingVertical: 1 }}>로켓프레시</Text>
          )}
        </View>

        {/* Average price strikethrough */}
        {item.avgPrice > 0 && (
          <Text style={{ fontSize: 11, color: '#94A3B8', textDecorationLine: 'line-through', marginTop: 2 }}>
            평균가 ₩{item.avgPrice.toLocaleString('ko-KR')}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

// ─── Mock: replace with child.ageMonth once live ─────────────────────────────
const mockChildAgeMonths = 24;

function resolveTabLabel(cat) {
  if (cat.key === 'food') {
    return mockChildAgeMonths < 12 ? cat.label : '식품/간식';
  }
  return cat.label;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function RankingScreen({ navigation, route }) {
  const { deepLinkIntent, setDeepLinkIntent } = useContext(DeepLinkContext);
  const [activeCategory,     setActiveCategory]     = useState('living');
  const [isCustomRanking,    setIsCustomRanking]     = useState(false);
  const [child,              setChild]              = useState(null);
  const [savedIds,           setSavedIds]           = useState(() => new Set(globalFavorites));
  const [refreshing,         setRefreshing]         = useState(false);
  const [showCriteriaModal,  setShowCriteriaModal]  = useState(false);
  const [showCategorySheet,  setShowCategorySheet]  = useState(false);
  const [showCoachMark,      setShowCoachMark]      = useState(false);
  const [hasEnoughPeerData,  setHasEnoughPeerData]  = useState(false);
  const [toastVisible,       setToastVisible]       = useState(false);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    getDocs(query(collection(db, 'children'), where('userId', '==', uid)))
      .then((snap) => { if (!snap.empty) setChild(snap.docs[0].data()); })
      .catch(() => {});
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (deepLinkIntent) {
        if (deepLinkIntent.targetTab) setActiveCategory(deepLinkIntent.targetTab);
        if (deepLinkIntent.enableCustom !== undefined) setIsCustomRanking(deepLinkIntent.enableCustom);
        setDeepLinkIntent(null);
      }
    }, [deepLinkIntent])
  );

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (uid) recordProductAction({ userId: uid, actionType: 'ranking_visit' }).catch(() => {});
  }, []);

  useEffect(() => {
    AsyncStorage.getItem('@has_seen_ranking_tooltip')
      .then((val) => { if (!val) setShowCoachMark(true); })
      .catch(() => {});
  }, []);

  const dismissCoachMark = useCallback(() => {
    setShowCoachMark(false);
    AsyncStorage.setItem('@has_seen_ranking_tooltip', 'true').catch(() => {});
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 600);
  }, []);

  const dynamicCategories = useMemo(() => getCohortCategories(child), [child]);
  const activeCategoryName = useMemo(
    () => dynamicCategories.find((c) => c.key === activeCategory)?.label ?? activeCategory,
    [dynamicCategories, activeCategory]
  );

  const filtered = useMemo(() => {
    let base = MOCK_RANKED.filter((p) => p.categoryKey === activeCategory);
    if (isCustomRanking) base = base.filter((p) => p.reviewCount > 500);
    return base;
  }, [activeCategory, isCustomRanking]);

  const ListHeader = useCallback(() => (
    <View>
      {/* Fintech Ticker Banner */}
      <TouchableOpacity style={styles.tickerBanner} activeOpacity={0.8} onPress={() => navigation.navigate('CurationDetail', { type: 'price_drop', title: '오늘의 가격 하락템' })}>
        <Text style={styles.tickerText}>
          현재 [{activeCategoryName}] 제품 중 142개 상품의 가격이 어제보다 하락했어요  →
        </Text>
      </TouchableOpacity>

      {/* 랭킹 기준 + 전체/또래맞춤 toggle row */}
      <View style={styles.criteriaRow}>
        <TouchableOpacity
          onPress={() => setShowCriteriaModal(true)}
          activeOpacity={0.7}
          style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F1F5F9', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}
        >
          <Info size={14} color="#64748B" />
          <Text style={{ fontSize: 12, color: '#475569', marginLeft: 4, fontWeight: '600' }}>랭킹 기준</Text>
        </TouchableOpacity>

        <View>
          {showCoachMark && (
            <TouchableOpacity style={styles.coachMarkAbsolute} activeOpacity={0.85} onPress={dismissCoachMark}>
              <View style={styles.coachMark}>
                <Text style={styles.coachMarkText}>내 아이와 비슷한 또래 및 육아 환경에 맞춰 랭킹을 추천해 드려요.</Text>
                <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', marginLeft: 6, lineHeight: 16 }}>×</Text>
              </View>
              <View style={styles.coachMarkArrow} />
            </TouchableOpacity>
          )}
          <View style={styles.pillToggle}>
            <TouchableOpacity
              style={[styles.pillToggleBtn, !isCustomRanking && styles.pillToggleBtnActive]}
              onPress={() => setIsCustomRanking(false)}
              activeOpacity={0.8}
            >
              <Text style={[styles.pillToggleBtnText, !isCustomRanking && styles.pillToggleBtnTextActive]}>전체</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.pillToggleBtn, isCustomRanking && styles.pillToggleBtnActive]}
              onPress={() => setIsCustomRanking(true)}
              activeOpacity={0.8}
            >
              <Text style={[styles.pillToggleBtnText, isCustomRanking && styles.pillToggleBtnTextActive]}>또래 맞춤</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Peer Match data-insufficiency warning */}
      {isCustomRanking && !hasEnoughPeerData && (
        <View style={styles.peerDataWarning}>
          <View style={{ marginRight: 8 }}>
            <Info size={16} color="#D97706" />
          </View>
          <Text style={styles.peerDataWarningText}>
            아직 또래 맘들의 데이터가 모이고 있어요! 우선 쿠팡 전체 랭킹을 보여드릴게요.
          </Text>
        </View>
      )}
    </View>
  ), [isCustomRanking, navigation, activeCategoryName, showCoachMark, dismissCoachMark, hasEnoughPeerData]);

  return (
    <View style={styles.container}>

      {/* Global header */}
      <GlobalHeader tabName="Ranking" placeholder="어떤 상품의 랭킹이 궁금하신가요?" navigation={navigation} />

      {/* Main category tabs */}
      <View style={styles.categoryTabBar}>
        {/* All categories nudge */}
        <TouchableOpacity style={styles.allCatsBtn} onPress={() => setShowCategorySheet(true)} activeOpacity={0.8}>
          <Text style={styles.allCatsBtnText} numberOfLines={1}>전체 카테고리</Text>
          <Ionicons name="chevron-down-outline" size={10} color="#6B7280" />
        </TouchableOpacity>
        <View style={styles.categoryTabDivider} />
        {/* Cohort-based dynamic tabs */}
        {dynamicCategories.map((cat) => {
          const active = activeCategory === cat.key;
          return (
            <TouchableOpacity
              key={cat.key}
              style={[styles.categoryTab, active && styles.categoryTabActive]}
              onPress={() => setActiveCategory(cat.key)}
              activeOpacity={0.8}
            >
              <Text style={[styles.categoryTabText, active && styles.categoryTabTextActive]}>
                {resolveTabLabel(cat)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Ranking criteria modal */}
      <Modal visible={showCriteriaModal} transparent animationType="fade" onRequestClose={() => setShowCriteriaModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowCriteriaModal(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>세이브루 랭킹 기준</Text>
            <View style={styles.modalRow}>
              <Text style={styles.modalRowLabel}>[전체] 랭킹</Text>
              <Text style={styles.modalRowDesc}>
                쿠팡 판매 데이터를 바탕으로 선정한 베스트 상품
              </Text>
            </View>
            <View style={[styles.modalRow, { marginBottom: 0 }]}>
              <Text style={styles.modalRowLabel}>[또래 맞춤] 랭킹</Text>
              <Text style={styles.modalRowDesc}>
                내 아이와 비슷한 또래 부모님들이 실제 가장 많이 선택하고 인정한 상품 (육아 환경 + 관심사 반영)
              </Text>
            </View>
            <TouchableOpacity style={styles.modalBtn} onPress={() => setShowCriteriaModal(false)}>
              <Text style={styles.modalBtnText}>확인</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Category bottom sheet */}
      <Modal visible={showCategorySheet} transparent animationType="slide" onRequestClose={() => setShowCategorySheet(false)}>
        <Pressable style={styles.sheetOverlay} onPress={() => setShowCategorySheet(false)}>
          <Pressable style={styles.sheetCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>전체 카테고리</Text>
            {ALL_CATEGORIES.map((cat) => {
              const active = activeCategory === cat.key;
              return (
                <TouchableOpacity
                  key={cat.key}
                  style={styles.sheetItem}
                  onPress={() => { setActiveCategory(cat.key); setShowCategorySheet(false); }}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.sheetItemText, active && styles.sheetItemTextActive]}>{cat.label}</Text>
                  {active && <Ionicons name="checkmark" size={16} color="#2E6FF2" />}
                </TouchableOpacity>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Toast */}
      {toastVisible && (
        <View style={styles.toast} pointerEvents="none">
          <Text style={styles.toastText}>최저가 알림 시작! 관심상품 탭에서 확인하세요</Text>
        </View>
      )}

      {/* Ranked vertical feed */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <RankItem
            item={item}
            rank={index + 1}
            navigation={navigation}
            isCustom={isCustomRanking}
            child={child}
          />
        )}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Ionicons name="search-outline" size={36} color="#CBD5E1" />
            <Text style={styles.emptyText}>[{activeCategoryName}] 카테고리 상품이 없어요</Text>
            <Text style={styles.emptySub}>다른 카테고리를 선택해보세요</Text>
          </View>
        }
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#2E6FF2']}
            tintColor="#2E6FF2"
          />
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#F8FAFC' },
  listContent: { paddingBottom: 24 },

  // ── Category tabs ──────────────────────────────────────────────────────────
  categoryTabBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1, borderBottomColor: '#E4E7ED',
    marginBottom: 0,
  },
  categoryTab: {
    flex: 1, alignItems: 'center',
    paddingTop: 10, paddingBottom: 8,
    borderBottomWidth: 0,
  },
  categoryTabActive: { borderBottomWidth: 2, borderBottomColor: '#111827', paddingBottom: 6 },
  categoryTabText:   { fontSize: 14, fontWeight: '600', color: '#94A3B8' },
  categoryTabTextActive: { fontSize: 14, fontWeight: '700', color: '#111827' },

  allCatsBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 10, paddingVertical: 10, gap: 3, minWidth: 70,
  },
  allCatsBtnText: { fontSize: 11, fontWeight: '700', color: '#6B7280' },
  categoryTabDivider: { width: 1, backgroundColor: '#E4E7ED', marginVertical: 8 },

  // ── Peer data warning ─────────────────────────────────────────────────────
  peerDataWarning: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 12, paddingVertical: 10,
    marginHorizontal: 16, marginTop: 12,
    borderRadius: 8,
  },
  peerDataWarningText: {
    flex: 1, fontSize: 13, fontWeight: '600', color: '#D97706', lineHeight: 18,
  },

  // ── Ticker banner ──────────────────────────────────────────────────────────
  tickerBanner: {
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 16, paddingVertical: 10,
    marginTop: 0,
  },
  tickerText: {
    fontSize: 13, fontWeight: '700', color: '#16A34A',
  },

  // ── Criteria row ───────────────────────────────────────────────────────────
  criteriaRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F1F5F9',
  },
  coachMarkAbsolute: {
    position: 'absolute',
    zIndex: 50,
    top: -48,
    right: 0,
    alignItems: 'center',
    width: 226,
  },
  coachMark: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#2E6FF2', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 7,
    width: '100%',
  },
  coachMarkText: { fontSize: 12, color: '#FFFFFF', fontWeight: '600', flex: 1, lineHeight: 17 },
  coachMarkArrow: {
    width: 0, height: 0,
    borderLeftWidth: 6, borderLeftColor: 'transparent',
    borderRightWidth: 6, borderRightColor: 'transparent',
    borderTopWidth: 6, borderTopColor: '#2E6FF2',
    alignSelf: 'flex-end', marginRight: 18,
  },

  pillToggle: {
    flexDirection: 'row', backgroundColor: '#F3F4F6', borderRadius: 20, padding: 2,
  },
  pillToggleBtn: {
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 18,
  },
  pillToggleBtnActive: { backgroundColor: '#2E6FF2' },
  pillToggleBtnText:   { fontSize: 12, fontWeight: '600', color: '#6B7280' },
  pillToggleBtnTextActive: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },

  // ── Rank item ──────────────────────────────────────────────────────────────
  rankItem: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
    paddingVertical: 12, paddingHorizontal: 16,
  },

  thumbWrap: {
    width: 72, height: 72, marginRight: 14, flexShrink: 0, position: 'relative',
  },
  thumbPlaceholder: {
    width: 72, height: 72, borderRadius: 8,
    backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center',
  },
  rankOverlay: {
    position: 'absolute', top: 0, left: 0,
    width: 20, height: 20, borderRadius: 4,
    alignItems: 'center', justifyContent: 'center',
  },
  rankOverlayDefault: { backgroundColor: '#64748B' },
  rankOverlayText:    { fontSize: 11, fontWeight: '800', color: '#FFFFFF' },
  rankChangeOverlay:  { position: 'absolute', top: 0, right: 0 },

  itemInfo:  { flex: 1 },
  customTag: {
    alignSelf: 'flex-start', backgroundColor: '#FEF3C7',
    borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, marginBottom: 3,
  },
  customTagText: { fontSize: 9, fontWeight: '700', color: '#B45309' },

  itemRatingRow:   { flexDirection: 'row', alignItems: 'center', gap: 2 },
  itemRating:      { fontSize: 11, fontWeight: '700', color: '#374151', marginLeft: 2 },
  itemReviewCount: { fontSize: 11, color: '#94A3B8' },

  rankChangeUp:   { fontSize: 10, fontWeight: '700', color: '#EF4444' },
  rankChangeDown: { fontSize: 10, fontWeight: '700', color: '#2E6FF2' },
  rankChangeNew:  { fontSize: 10, fontWeight: '700', color: '#F59E0B' },

  // ── Criteria modal ─────────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32,
  },
  modalCard: {
    backgroundColor: '#FFFFFF', borderRadius: 16, padding: 24, width: '100%',
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12 },
      android: { elevation: 8 },
    }),
  },
  modalTitle:    { fontSize: 18, fontWeight: '800', color: '#111827', marginBottom: 16 },
  modalRow:      { marginBottom: 12 },
  modalRowLabel: { fontSize: 13, fontWeight: '700', color: '#2E6FF2', marginBottom: 3 },
  modalRowDesc:  { fontSize: 13, color: '#4B5563', lineHeight: 20 },
  modalBtn: {
    marginTop: 20, backgroundColor: '#2E6FF2',
    paddingVertical: 14, borderRadius: 12, alignItems: 'center',
  },
  modalBtnText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },

  // ── Category bottom sheet ──────────────────────────────────────────────────
  sheetOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end',
  },
  sheetCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 24, paddingTop: 12, paddingBottom: 40,
  },
  sheetHandle: {
    width: 36, height: 4, backgroundColor: '#E4E7ED',
    borderRadius: 2, alignSelf: 'center', marginBottom: 16,
  },
  sheetTitle:          { fontSize: 17, fontWeight: '800', color: '#111827', marginBottom: 8 },
  sheetItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F1F5F9',
  },
  sheetItemText:       { fontSize: 15, fontWeight: '500', color: '#374151' },
  sheetItemTextActive: { fontWeight: '700', color: '#2E6FF2' },

  // ── Empty state ────────────────────────────────────────────────────────────
  emptyBox: { alignItems: 'center', paddingTop: 60, paddingBottom: 40, gap: 10 },
  emptyText: { fontSize: 15, fontWeight: '700', color: '#334155' },
  emptySub:  { fontSize: 13, color: '#94A3B8' },

  // ── Toast ──────────────────────────────────────────────────────────────────
  toast: {
    position: 'absolute', bottom: 90, alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.8)', paddingHorizontal: 20,
    paddingVertical: 12, borderRadius: 8, zIndex: 9999,
  },
  toastText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },

});
