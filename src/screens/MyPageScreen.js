import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { signOut } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { collection, doc, getDoc, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { auth, db, functions } from '../firebase/config';
import { getChildrenByUserId } from '../services/firestore/childrenRepository';
import {
  getOrCreateNickname,
  updateNickname,
  updateSelectedChild,
} from '../services/firestore/userRepository';
import { getSavedProductsWithPriceSignals } from '../services/priceAlertService';
import { toggleSavedProduct } from '../services/saveService';
import { recordProductAction } from '../services/productActionService';
import { useTracking } from '../context/TrackingContext';
import { COLORS } from '../constants/theme';
import Svg, { Circle, Line, Path, Polyline, Rect } from 'react-native-svg';
import { Lock, TrendingDown } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';

// ─── SVG Icons ───────────────────────────────────────────────────────────────

function BellIcon({ size = 20, color = '#0f172a' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"/>
      <Path d="M13.73 21a2 2 0 0 1-3.46 0" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"/>
    </Svg>
  );
}

function GearIcon({ size = 20, color = '#0f172a' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="3" stroke={color} strokeWidth={1.8}/>
      <Path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"/>
    </Svg>
  );
}

function AwardIcon({ size = 18, color = COLORS.primary }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="8" r="6" stroke={color} strokeWidth={1.8}/>
      <Path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"/>
    </Svg>
  );
}

function ImagePlaceholderIcon({ size = 28, color = '#cbd5e1' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="3" y="3" width="18" height="18" rx="2" stroke={color} strokeWidth={1.6}/>
      <Circle cx="8.5" cy="8.5" r="1.5" stroke={color} strokeWidth={1.6}/>
      <Path d="M21 15l-5-5L5 21" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"/>
    </Svg>
  );
}

function ChevronRightSmIcon({ size = 16, color = '#94a3b8' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M9 18l6-6-6-6" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
    </Svg>
  );
}

function CameraIcon({ size = 18, color = COLORS.primary }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"/>
      <Circle cx="12" cy="13" r="4" stroke={color} strokeWidth={1.8}/>
    </Svg>
  );
}

function Settings2Icon({ size = 11, color = '#475569' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M20 7H4" stroke={color} strokeWidth={1.9} strokeLinecap="round"/>
      <Path d="M20 12H4" stroke={color} strokeWidth={1.9} strokeLinecap="round"/>
      <Path d="M20 17H4" stroke={color} strokeWidth={1.9} strokeLinecap="round"/>
      <Circle cx="8" cy="7" r="2.3" fill="#fff" stroke={color} strokeWidth={1.8}/>
      <Circle cx="16" cy="12" r="2.3" fill="#fff" stroke={color} strokeWidth={1.8}/>
      <Circle cx="8" cy="17" r="2.3" fill="#fff" stroke={color} strokeWidth={1.8}/>
    </Svg>
  );
}

function PenToolIcon({ size = 18, color = COLORS.primary }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 19l7-7 3 3-7 7-3-3z" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"/>
      <Path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"/>
      <Path d="M2 2l7.586 7.586" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"/>
      <Circle cx="11" cy="11" r="2" stroke={color} strokeWidth={1.8}/>
    </Svg>
  );
}

function XIcon({ size = 22, color = '#94a3b8' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M18 6L6 18M6 6l12 12" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"/>
    </Svg>
  );
}

function InfoIcon({ size = 13, color = '#22c55e' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="10" stroke={color} strokeWidth={1.8}/>
      <Path d="M12 16v-4M12 8h.01" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
    </Svg>
  );
}

function GiftIcon({ size = 32, color = COLORS.primary }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M20 12v10H4V12" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"/>
      <Path d="M22 7H2v5h20V7z" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"/>
      <Line x1="12" y1="22" x2="12" y2="7" stroke={color} strokeWidth={1.8} strokeLinecap="round"/>
      <Path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"/>
      <Path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"/>
    </Svg>
  );
}

function PencilIcon({ size = 14, color = '#94a3b8' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"/>
      <Path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"/>
    </Svg>
  );
}

function CheckSmIcon({ size = 14, color = COLORS.primary }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M20 6L9 17l-5-5" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"/>
    </Svg>
  );
}

function UserSilhouetteIcon({ size = 36, color = '#fff' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="8" r="4" stroke={color} strokeWidth={1.8}/>
      <Path d="M4 20c0-4 3.582-7 8-7s8 3 8 7" stroke={color} strokeWidth={1.8} strokeLinecap="round"/>
    </Svg>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const genderLabel = (g) => (g === 'female' ? '여아' : g === 'male' ? '남아' : '');

function buildChildSummaryLine(child) {
  if (!child) return null;
  if (child.type === 'planning') return '임신 준비 중';
  if (child.type === 'pregnancy') {
    const w = typeof child.pregnancyWeek === 'number' ? `임신 ${child.pregnancyWeek}주` : '임신 중';
    return w;
  }
  const ln = (child.lastName  || '').trim();
  const fn = (child.firstName || child.name || '').trim();
  const name = [ln, fn].filter(Boolean).join(' ');
  const parts = [];
  if (name) parts.push(name);
  const gl = genderLabel(child.gender);
  if (gl) parts.push(gl);
  if (typeof child.ageMonth === 'number') parts.push(`${child.ageMonth}개월`);
  if (child.height) parts.push(`${child.height}cm`);
  if (child.weight) parts.push(`${child.weight}kg`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

const formatAgeMonth = (child) => {
  if (child?.type === 'pregnancy') {
    return typeof child?.pregnancyWeek === 'number' ? `임신 ${child.pregnancyWeek}주` : '임신';
  }
  return typeof child?.ageMonth === 'number' ? `${child.ageMonth}개월` : '-';
};

// ─── Price tracking helpers ──────────────────────────────────────────────────

// Rec items use real Unsplash images (no emojis)
// coupangUrl: Coupang Partners short links (coupa.ng universal links).
// Universal Links — iOS opens the native app if installed, else web. Android same via App Links.
// Replace each coupa.ng path with the actual Partners-generated short link for production.
const MOCK_INFANT_ITEMS = [
  { id: 'inf1', name: '하기스 네이처메이드 기저귀 특대형',
    image: 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=280&q=80',
    origPrice: 42900, currentPrice: 31900,
    coupangUrl: 'https://coupa.ng/blE0dT' },
  { id: 'inf2', name: '에디슨 실리콘 젖병 세트 240ml',
    image: 'https://images.unsplash.com/photo-1584466977773-e625c37cdd50?w=280&q=80',
    origPrice: 18000, currentPrice: 13500,
    coupangUrl: 'https://coupa.ng/bkJF3s' },
  { id: 'inf3', name: '코코넛 유기농 아기 로션 200ml',
    image: 'https://images.unsplash.com/photo-1608248597279-f99d160bfcbc?w=280&q=80',
    origPrice: 15900, currentPrice: 11900,
    coupangUrl: 'https://coupa.ng/bmR7tY' },
  { id: 'inf4', name: '피죤 아기 섬유유연제 2.5L',
    image: 'https://images.unsplash.com/photo-1582735689369-4fe89db7114c?w=280&q=80',
    origPrice: 14900, currentPrice: 10900,
    coupangUrl: 'https://coupa.ng/bpX9wZ' },
];

const MOCK_TODDLER_ITEMS = [
  { id: 'tod1', name: '몬테소리 원목 블록 50pcs',
    image: 'https://images.unsplash.com/photo-1558060370-d644479cb6f7?w=280&q=80',
    origPrice: 32900, currentPrice: 22900,
    coupangUrl: 'https://coupa.ng/bqA2mK' },
  { id: 'tod2', name: '멜리사 앤 더그 퍼즐 세트',
    image: 'https://images.unsplash.com/photo-1619532550766-12c325d9516a?w=280&q=80',
    origPrice: 28000, currentPrice: 19500,
    coupangUrl: 'https://coupa.ng/brC4nL' },
  { id: 'tod3', name: '아기 안전문 게이트 80cm',
    image: 'https://images.unsplash.com/photo-1576201836106-db1758fd1c97?w=280&q=80',
    origPrice: 45000, currentPrice: 31900,
    coupangUrl: 'https://coupa.ng/bsDmPo' },
  { id: 'tod4', name: '유아 치발기 치아발육기 세트',
    image: 'https://images.unsplash.com/photo-1591382696684-38c427c7547a?w=280&q=80',
    origPrice: 12900, currentPrice: 8900,
    coupangUrl: 'https://coupa.ng/btF6qR' },
];

const MOCK_KIDS_ITEMS = [
  { id: 'kid1', name: '레고 듀플로 동물원 세트',
    image: 'https://images.unsplash.com/photo-1587654780291-39c9404d746b?w=280&q=80',
    origPrice: 54900, currentPrice: 38900,
    coupangUrl: 'https://coupa.ng/buG8rS' },
  { id: 'kid2', name: '킨더조이 어린이 가방 14L',
    image: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=280&q=80',
    origPrice: 24900, currentPrice: 16900,
    coupangUrl: 'https://coupa.ng/bvH0sT' },
  { id: 'kid3', name: '어린이 칫솔 5단계 4개입',
    image: 'https://images.unsplash.com/photo-1559305616-3f99cd43e353?w=280&q=80',
    origPrice: 9900,  currentPrice: 6900,
    coupangUrl: 'https://coupa.ng/bwI1tU' },
  { id: 'kid4', name: '퍼실 실내건조 고농축 세탁세제 3L',
    image: 'https://images.unsplash.com/photo-1582735689369-4fe89db7114c?w=280&q=80',
    origPrice: 24900, currentPrice: 16900,
    coupangUrl: 'https://coupa.ng/bxJ3uV' },
];

function getRecommendedItems(ageMonth) {
  if (!ageMonth || ageMonth < 12) return MOCK_INFANT_ITEMS;
  if (ageMonth < 36)              return MOCK_TODDLER_ITEMS;
  return MOCK_KIDS_ITEMS;
}

function getStatusBadge(item) {
  const current = item.currentPrice ?? 0;
  const drop    = item.priceDrop   ?? 0;
  if (current <= 0) return { label: '변동 없음', bg: '#f8fafc', text: '#94a3b8' };
  const orig    = current + drop;
  const dropPct = orig > 0 ? (drop / orig) * 100 : 0;
  if (dropPct > 30) return { label: '역대 최저가', bg: '#fef2f2', text: '#dc2626' };
  if (drop > 0)     return { label: '하락 중',     bg: '#eff6ff', text: '#2563eb' };
  return                   { label: '변동 없음',   bg: '#f8fafc', text: '#94a3b8' };
}

// ─── Sub-components ─────────────────────────────────────────────────────────

// ─── Tracking add card (Polcent-style) ───────────────────────────────────────

function AddSquareCard({ onPress }) {
  return (
    <TouchableOpacity style={styles.trackingAddSquareCard} onPress={onPress} activeOpacity={0.75}>
      <Text style={styles.trackingAddSquarePlus}>+</Text>
      <Text style={styles.trackingAddSquareLabel}>추가</Text>
    </TouchableOpacity>
  );
}

function MenuItem({ icon, label, value, onPress, danger = false }) {
  return (
    <TouchableOpacity style={styles.menuItem} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.menuItemLeft}>
        <Text style={styles.menuItemIcon}>{icon}</Text>
        <Text style={[styles.menuItemLabel, danger && styles.menuItemLabelDanger]}>{label}</Text>
      </View>
      <View style={styles.menuItemRight}>
        {value ? <Text style={styles.menuItemValue}>{value}</Text> : null}
        <Text style={styles.menuItemChevron}>›</Text>
      </View>
    </TouchableOpacity>
  );
}

function MenuSectionHeader({ title }) {
  return (
    <View style={styles.menuSectionHeader}>
      <Text style={styles.menuSectionTitle}>{title}</Text>
    </View>
  );
}

// ─── Child badge helper ──────────────────────────────────────────────────────

const FEEDING_KO = { breast: '모유', formula: '분유', mixed: '혼합', solids: '이유식' };

function buildChildBadges(child) {
  const b = [];
  if (child.type === 'planning') {
    b.push({ label: '임신 준비 중', bg: '#fdf2f8', text: '#db2777' });
    if (Array.isArray(child.concerns) && child.concerns.length > 0) {
      b.push({ label: child.concerns[0], bg: '#eff6ff', text: '#1d4ed8' });
    }
    return b;
  }
  if (child.type === 'pregnancy') {
    if (typeof child.pregnancyWeek === 'number') {
      b.push({ label: `임신 ${child.pregnancyWeek}주차`, bg: '#fdf2f8', text: '#db2777' });
    }
    if (child.dueDate) {
      const due = new Date(child.dueDate);
      const diffDays = Math.ceil((due - new Date()) / 86400000);
      b.push({ label: diffDays >= 0 ? `D-${diffDays}` : `D+${Math.abs(diffDays)}`, bg: '#fdf2f8', text: '#9333ea' });
    }
    return b;
  }
  // type === 'child'
  if (typeof child.ageMonth === 'number') {
    b.push({ label: `${child.ageMonth}개월`, bg: '#eff6ff', text: '#1d4ed8' });
  }
  const gl = genderLabel(child.gender);
  if (gl) b.push({ label: gl, bg: '#fce7f3', text: '#be185d' });
  if (child.height) b.push({ label: `${child.height}cm`, bg: '#f0fdf4', text: '#166534' });
  if (child.weight) b.push({ label: `${child.weight}kg`, bg: '#f0fdf4', text: '#166534' });
  return b;
}

// ─── Resolve display name from child record ───────────────────────────────────

function resolveChildDisplayName(child) {
  if (child.type === 'planning') return '예비 엄마';
  if (child.type === 'pregnancy') {
    const fn = (child.firstName || '').trim();
    return fn || '우리 아기';
  }
  // type === 'child'
  const ln = (child.lastName  || '').trim();
  const fn = (child.firstName || child.name || '').trim();
  return [ln, fn].filter(Boolean).join(' ') || '-';
}

// ─── Selected child dashboard card ───────────────────────────────────────────

function ChildDashboardCard({ child, onEdit }) {
  const badges = buildChildBadges(child);

  return (
    <View style={styles.childDashCard}>
      {/* Header: child name (left) + edit button (right) */}
      <View style={styles.childDashHeader}>
        <View style={styles.childDashNameRow}>
          <Text style={styles.childDropName} numberOfLines={1}>{resolveChildDisplayName(child)}</Text>
        </View>
        <TouchableOpacity
          style={styles.childDashEditBtn}
          onPress={() => onEdit(child)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.childDashEditText}>편집</Text>
        </TouchableOpacity>
      </View>

      {/* Physical attribute badges */}
      {badges.length > 0 ? (
        <View style={styles.childDashBadges}>
          {badges.map((b, i) => (
            <View key={i} style={[styles.childDashBadge, { backgroundColor: b.bg }]}>
              <Text style={[styles.childDashBadgeText, { color: b.text }]}>#{b.label}</Text>
            </View>
          ))}
        </View>
      ) : (
        <TouchableOpacity onPress={() => onEdit(child)} activeOpacity={0.8}>
          <Text style={styles.childDashNoBadgeHint}>
            아이 정보를 더 채우면 맞춤 추천이 더 정교해져요
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Constants ──────────────────────────────────────────────────────────────

const MARKETS = [
  { key: 'coupang', name: '쿠팡',       active: true  },
  { key: 'kurly',   name: '마켓컬리',   active: false },
  { key: 'naver',   name: '네이버쇼핑', active: false },
];

const SKELETON_COUNT = 6;

const PLACEHOLDER_PRODUCTS = [
  { id: 'ph1', name: '관심 상품을 클릭하면 기록돼요' },
  { id: 'ph2', name: '핫딜 상품을 살펴보세요' },
  { id: 'ph3', name: '가격 추적 목록을 확인해보세요' },
];

const DUMMY_RECENTLY_VIEWED = [
  { id: 'rv1', brand: '하기스',      name: '네이처메이드 3단계 기저귀 특대형 96매',    origPrice: 42900,  currentPrice: 32175  },
  { id: 'rv2', brand: '매일유업',    name: '앱솔루트 명작 3단계 분유 800g × 2캔',      origPrice: 38500,  currentPrice: 31570  },
  { id: 'rv3', brand: '베베숲',      name: '아쿠아 물티슈 100매 6팩 무향 저자극',       origPrice: 16900,  currentPrice: 11830  },
  { id: 'rv4', brand: '다이치',      name: '듀얼핏 360 회전형 카시트 신생아~4세',      origPrice: 429000, currentPrice: 317460 },
  { id: 'rv5', brand: '피셔프라이스', name: '소리나는 멀티활동 점퍼루 4-in-1 바운서',   origPrice: 199000, currentPrice: 214500 },
  { id: 'rv6', brand: '레고 듀플로', name: '클래식 기본 벽돌 세트 38피스 (1.5~5세)', origPrice: 38000,  currentPrice: 28120  },
];

// ─── Level System ────────────────────────────────────────────────────────────

const LEVEL_LIST = [
  { id: 'rookie',   name: '일반맘', bg: '#f0fdf4', text: '#15803d', criteriaDetail: '앱 설치 및 아이 프로필 등록', check: () => true },
  { id: 'explorer', name: '성실맘', bg: '#eff6ff', text: COLORS.primary, criteriaDetail: '관심상품 등록 5개 이상 & 맘톡 게시글 1개 이상', check: (s) => s.savedCount >= 5 && s.postCount >= 1 },
  { id: 'reviewer', name: '열심맘', bg: '#fef3c7', text: '#b45309', criteriaDetail: '실구매 인증 리뷰 3회 이상 & 관심상품 등록 10개 이상', check: (s) => s.reviewCount >= 3 && s.savedCount >= 10 },
  { id: 'pro',      name: '우수맘', bg: '#fdf4ff', text: '#7e22ce', criteriaDetail: '실구매 인증 리뷰 10회 & 커뮤니티 게시글 10개 & 관심상품 등록 30개', check: (s) => s.reviewCount >= 10 && s.postCount >= 10 && s.savedCount >= 30 },
];

function deriveLevel(stats) {
  let levelIdx = 0;
  LEVEL_LIST.forEach((lvl, idx) => { if (lvl.check(stats)) levelIdx = idx; });
  return { level: LEVEL_LIST[levelIdx], levelIdx, nextLevel: LEVEL_LIST[levelIdx + 1] ?? null };
}

function buildNudgeText(stats, nextLevel) {
  if (!nextLevel) return '최고 등급 프로 핫딜러에 도달했어요!';
  if (nextLevel.id === 'explorer') {
    const parts = [];
    if (stats.savedCount < 5) parts.push(`관심상품 ${5 - stats.savedCount}개`);
    if (stats.postCount  < 1) parts.push('맘톡 게시글 1개');
    return `${nextLevel.name}까지 ${parts.join(', ')} 남았어요!`;
  }
  if (nextLevel.id === 'reviewer') {
    const parts = [];
    if (stats.reviewCount < 3)  parts.push(`리뷰 ${3  - stats.reviewCount}개`);
    if (stats.savedCount  < 10) parts.push(`관심상품 ${10 - stats.savedCount}개`);
    return `${nextLevel.name}까지 ${parts.join(', ')} 남았어요!`;
  }
  if (nextLevel.id === 'pro') {
    const parts = [];
    if (stats.reviewCount < 10) parts.push(`리뷰 ${10 - stats.reviewCount}개`);
    if (stats.postCount   < 10) parts.push(`게시글 ${10 - stats.postCount}개`);
    if (stats.savedCount  < 30) parts.push(`관심상품 ${30 - stats.savedCount}개`);
    return `${nextLevel.name}까지 ${parts.join(', ')} 남았어요!`;
  }
  return `${nextLevel.name}에 도전해보세요!`;
}

function buildNudgeProgress(stats, nextLevel) {
  if (!nextLevel) return [];
  if (nextLevel.id === 'explorer') return [
    { label: '관심상품', current: Math.min(stats.savedCount, 5),  target: 5 },
    { label: '맘톡 글',  current: Math.min(stats.postCount,  1),  target: 1 },
  ];
  if (nextLevel.id === 'reviewer') return [
    { label: '리뷰 인증', current: Math.min(stats.reviewCount, 3),  target: 3 },
    { label: '관심상품',  current: Math.min(stats.savedCount,  10), target: 10 },
  ];
  if (nextLevel.id === 'pro') return [
    { label: '리뷰 인증', current: Math.min(stats.reviewCount, 10), target: 10 },
    { label: '게시글',    current: Math.min(stats.postCount,   10), target: 10 },
    { label: '관심상품',  current: Math.min(stats.savedCount,  30), target: 30 },
  ];
  return [];
}

// ─── Screen ─────────────────────────────────────────────────────────────────

export default function MyPageScreen({ navigation }) {
  const insets = useSafeAreaInsets();

  const { globalTrackedItems, addTrackedItem, removeTrackedItem, setTrackedItems } = useTracking();

  const [children,           setChildren]           = useState([]);
  const [activityStats,      setActivityStats]      = useState({ clickCount: 0, purchaseCount: 0 });
  const [recentProducts,     setRecentProducts]     = useState([]);
  const [purchasedProducts,  setPurchasedProducts]  = useState([]);
  const [mostViewedCategory, setMostViewedCategory] = useState(null);
  const [selectedChildId,    setSelectedChildId]    = useState(null);
  const [nickname,           setNickname]           = useState('');
  const [reviewCount,        setReviewCount]        = useState(0);
  const [postCount,          setPostCount]          = useState(0);
  const [commentCount,       setCommentCount]       = useState(0);
  const [likesCount,         setLikesCount]         = useState(0);
  const [loading,            setLoading]            = useState(true);
  const [refreshing,         setRefreshing]         = useState(false);
  const [urlInput,           setUrlInput]           = useState('');
  const [registering,        setRegistering]        = useState(false);
  const [isAdmin,            setIsAdmin]            = useState(false);
  const [addSheetOpen,       setAddSheetOpen]       = useState(false);
  const [savedFilter,        setSavedFilter]        = useState('all');
  // Guide modal
  const [isGuideOpen,        setIsGuideOpen]        = useState(false);
  const [nicknameInput,      setNicknameInput]      = useState('');
  const [nicknameSaving,     setNicknameSaving]     = useState(false);
  // Child picker — removed (1 account, 1 child)
  // Product action modal (long-press on tracked item)
  const [productActionModal, setProductActionModal] = useState({ visible: false, productId: null, productName: null });
  const [profileEditModalOpen, setProfileEditModalOpen] = useState(false);
  const [imagePickerSheetOpen, setImagePickerSheetOpen] = useState(false);
  const [profileImageUri,      setProfileImageUri]      = useState(null);
  const [couponModalOpen,      setCouponModalOpen]  = useState(false);
  const [keyboardHeight,       setKeyboardHeight]   = useState(0);
  const [toastMsg,             setToastMsg]         = useState('');

  const loadAll = useCallback(async () => {
    const uid = auth.currentUser?.uid;
    try {
      if (uid) getOrCreateNickname(uid).then(setNickname).catch(() => {});

      const [childList, saved, userSnap, reviewSnap, postSnap, commentSnap] = await Promise.all([
        uid ? getChildrenByUserId(uid) : [],
        uid ? getSavedProductsWithPriceSignals(uid) : [],
        uid ? getDoc(doc(db, 'users', uid)) : Promise.resolve(null),
        uid ? getDocs(query(collection(db, 'reviews'),  where('userId', '==', uid))) : Promise.resolve({ size: 0 }),
        uid ? getDocs(query(collection(db, 'posts'),    where('userId', '==', uid), limit(100))) : Promise.resolve({ size: 0 }),
        uid ? getDocs(query(collection(db, 'comments'), where('userId', '==', uid), limit(100))) : Promise.resolve({ size: 0 }),
      ]);

      setReviewCount(reviewSnap.size);
      setPostCount(postSnap.size ?? 0);
      setCommentCount(commentSnap.size ?? 0);

      if (userSnap?.exists()) {
        const userData = userSnap.data();
        setSelectedChildId(userData.selectedChildId ?? null);
        setIsAdmin(userData.role === 'admin');
      }

      childList.sort((a, b) => {
        const aT = a?.updatedAt?.toDate?.().getTime() ?? 0;
        const bT = b?.updatedAt?.toDate?.().getTime() ?? 0;
        return bT - aT;
      });
      setChildren(childList);
      // MOCK PHASE: do not overwrite context with the (empty) Firestore result.
      // Re-enable once the backend returns real saved_products data.
      // setTrackedItems(saved);
      // const catCount = {};
      // saved.forEach((item) => {
      //   const cat = item.category || '기타';
      //   catCount[cat] = (catCount[cat] || 0) + 1;
      // });
      // const topCat = Object.entries(catCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      // setMostViewedCategory(topCat);

      if (uid) {
        const actionsSnap = await getDocs(
          query(
            collection(db, 'user_product_actions'),
            where('userId', '==', uid),
            orderBy('createdAt', 'desc'),
            limit(50)
          )
        );

        let clickCount = 0;
        let purchaseCount = 0;
        const clickSeen = new Set();
        const purchaseSeen = new Set();
        const clickPids = [];
        const purchasePids = [];

        actionsSnap.docs.forEach((d) => {
          const { actionType, productGroupId, productId } = d.data();
          const pid = productGroupId || productId;
          if (actionType === 'click' || actionType === 'product_view' || actionType === 'product_click') {
            clickCount += 1;
            if (pid && !clickSeen.has(pid)) { clickSeen.add(pid); clickPids.push(pid); }
          }
          if (actionType === 'purchase' || actionType === 'product_purchase_click') {
            purchaseCount += 1;
            if (pid && !purchaseSeen.has(pid)) { purchaseSeen.add(pid); purchasePids.push(pid); }
          }
        });

        setActivityStats({ clickCount, purchaseCount });

        const fetchDocs = (pids) =>
          Promise.all(
            pids.slice(0, 10).map((pid) =>
              getDoc(doc(db, 'products', pid)).then((d) => (d.exists() ? { id: d.id, ...d.data() } : null))
            )
          ).then((docs) => docs.filter(Boolean));

        const [recentDocs, purchaseDocs] = await Promise.all([
          fetchDocs(clickPids),
          fetchDocs(purchasePids),
        ]);
        setRecentProducts(recentDocs);
        setPurchasedProducts(purchaseDocs);
      }
    } catch (error) {
      console.log('MyPageScreen loadAll error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (!loading) loadAll();
    });
    return unsubscribe;
  }, [navigation, loading, loadAll]);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => setKeyboardHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 2000);
  };

  const handleSelectChild = async (childId) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setSelectedChildId(childId);
    try {
      await updateSelectedChild(uid, childId);
    } catch (error) {
      console.log('MyPageScreen selectChild error:', error);
    }
  };

  const handleRemoveSaved = async (productId) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    removeTrackedItem(productId);
    try {
      await toggleSavedProduct(uid, productId);
    } catch {
      loadAll();
    }
  };

  const handleRegisterUrl = async () => {
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    setRegistering(true);
    try {
      const registerProductFromUrl = httpsCallable(functions, 'registerProductFromUrl');
      const result = await registerProductFromUrl({ url: trimmed });
      setUrlInput('');
      setAddSheetOpen(false);
      const isNew = result?.data?.isNew !== false;
      Alert.alert(
        isNew ? '등록 완료' : '이미 등록된 상품',
        isNew
          ? '상품이 가격 추적 목록에 추가되었어요!'
          : '이미 추적 중인 상품입니다. 가격 정보를 업데이트했어요.'
      );
    } catch (error) {
      const code = error?.code ?? '';
      let msg;
      if (code.includes('invalid-argument')) {
        msg = error.message || '지원하지 않는 URL입니다. 쿠팡 상품 URL을 붙여넣어 주세요.';
      } else if (code.includes('not-found')) {
        msg = '상품 정보를 찾을 수 없습니다. URL을 다시 확인해주세요.';
      } else {
        msg = '등록에 실패했습니다. 잠시 후 다시 시도해주세요.';
      }
      Alert.alert('등록 실패', msg);
    } finally {
      setRegistering(false);
    }
  };

  const handleProductPress = (productId, productName) => {
    recordProductAction({ userId: auth.currentUser?.uid, productId, actionType: 'click' });
    navigation.navigate('ProductDetail', { productId, productName });
  };

  const handleLogout = () => {
    Alert.alert('로그아웃', '정말 로그아웃 하시겠어요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '로그아웃',
        style: 'destructive',
        onPress: () => signOut(auth).catch(() => {}),
      },
    ]);
  };

  const handleSaveProfile = async () => {
    const trimmed = nicknameInput.trim();
    if (!trimmed || trimmed.length < 2) return;
    if (trimmed === nickname) {
      setProfileEditModalOpen(false);
      return;
    }
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setNicknameSaving(true);
    try {
      await updateNickname(uid, trimmed);
      setNickname(trimmed);
      setProfileEditModalOpen(false);
    } catch {
      Alert.alert('오류', '닉네임 저장에 실패했습니다.');
    } finally {
      setNicknameSaving(false);
    }
  };

  const handlePickImage = async () => {
    setImagePickerSheetOpen(false);
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.[0]?.uri) {
      setProfileImageUri(result.assets[0].uri);
    }
  };

  const handleInstantTrack = useCallback(async (mockItem) => {
    const uid = auth.currentUser?.uid;
    const already = globalTrackedItems.some((s) => s.productId === mockItem.id);
    if (already) {
      Alert.alert('이미 추적 중', '이미 가격 추적 목록에 있는 상품이에요.');
      return;
    }
    // Optimistic update — include coupangUrl so the tracked card can open the Partners link
    const synthetic = {
      productId: mockItem.id,
      savedId: mockItem.id,
      name: mockItem.name,
      currentPrice: mockItem.currentPrice,
      priceDrop: mockItem.origPrice - mockItem.currentPrice,
      coupangUrl: mockItem.coupangUrl ?? null,
    };
    addTrackedItem(synthetic);
    Alert.alert('추적 시작', `${mockItem.name}\n가격 추적 목록에 추가되었어요!`);
    if (uid) {
      try {
        await toggleSavedProduct(uid, mockItem.id);
      } catch {
        // Firestore write failed — roll back optimistic item
        removeTrackedItem(mockItem.id);
        Alert.alert('오류', '추적 등록에 실패했습니다. 다시 시도해주세요.');
      }
    }
  }, [globalTrackedItems, addTrackedItem, removeTrackedItem]);

  // Partners Universal Link — coupa.ng short links are registered as Universal Links (iOS)
  // and App Links (Android). The OS routes directly to the native Coupang app if installed,
  // or falls back to the web product page — no custom scheme or intent branching needed.
  const handleOpenCoupang = useCallback(async (url = 'https://coupa.ng/blE0dT') => {
    Alert.alert('쿠팡으로 이동 중...', '잠시만 기다려 주세요.');
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('연결 실패', '기기에서 해당 링크를 열 수 없습니다. (에뮬레이터 환경 등)');
    }
  }, []);

  const navigateToEditChild = (child) => {
    if (!child) return;
    navigation.navigate('ChildAdd', {
      childId: child.id,
      child: {
        ...child,
        birthDate: child.birthDate?.toDate?.()?.toISOString?.() ?? child.birthDate ?? null,
        createdAt: null,
        updatedAt: null,
      },
    });
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="small" />
      </View>
    );
  }

  const selectedChild     = children.find((c) => c.id === selectedChildId) ?? children[0] ?? null;
  const displayName       = nickname || auth.currentUser?.displayName || auth.currentUser?.email || '사용자';
  const childSummaryLine  = buildChildSummaryLine(selectedChild);
  const levelStats = { reviewCount, postCount, savedCount: globalTrackedItems.length };
  const { level: currentLevel, nextLevel } = deriveLevel(levelStats);
  const nudgeText     = buildNudgeText(levelStats, nextLevel);
  const nudgeProgress = buildNudgeProgress(levelStats, nextLevel);

  const modalNicknameStatus = (() => {
    const t = nicknameInput.trim();
    if (!t) return 'empty';
    if (t.length < 2) return 'too_short';
    if (t === nickname) return 'duplicate';
    return 'valid';
  })();

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>

      {/* ── Top app bar ── */}
      <View style={styles.appBar}>
        <Text style={styles.appBarTitle}>마이페이지</Text>
        <View style={styles.appBarActions}>
          <TouchableOpacity
            onPress={() => navigation.navigate('Notifications')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{ padding: 4 }}
          >
            <BellIcon size={22} color="#0f172a" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.navigate('Settings')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{ padding: 4 }}
          >
            <GearIcon size={22} color="#0f172a" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); loadAll(); }}
          />
        }
      >
        {/* ── Profile Card (Fintech-style) ── */}
        <View style={styles.profileCard}>
          <View style={styles.profileCardRow}>

            {/* User silhouette avatar */}
            <View style={styles.avatarWrapper}>
              <View style={styles.avatarCircle}>
                {profileImageUri
                  ? <Image source={{ uri: profileImageUri }} style={styles.avatarImage} />
                  : <UserSilhouetteIcon size={34} color="#fff" />}
              </View>
              <TouchableOpacity
                style={styles.avatarEditBadge}
                onPress={() => { setNicknameInput(nickname || auth.currentUser?.displayName || ''); setProfileEditModalOpen(true); }}
                activeOpacity={0.85}
                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
              >
                <GearIcon size={11} color="#475569" />
              </TouchableOpacity>
            </View>

            {/* Info column */}
            <View style={styles.profileInfoCol}>

              {/* Line 1: Nickname + Clickable Grade pill */}
              <View style={styles.nicknameRow}>
                <Text style={styles.nicknameText} numberOfLines={1} ellipsizeMode="tail">{displayName}</Text>
                <TouchableOpacity
                  onPress={() => navigation.navigate('LevelInfo', { currentLevelId: currentLevel.id, stats: levelStats })}
                  activeOpacity={0.75}
                  style={styles.levelBadgePillInline}
                >
                  <Text style={styles.levelBadgePillInlineText}>{currentLevel.name} {'>'}</Text>
                </TouchableOpacity>
              </View>

              {/* Line 2: Child summary */}
              {childSummaryLine ? (
                <View style={styles.childSummaryRow}>
                  <Text style={styles.childSummaryText} numberOfLines={1}>{childSummaryLine}</Text>
                  <TouchableOpacity
                    onPress={() => selectedChild ? navigateToEditChild(selectedChild) : navigation.navigate('ChildAdd')}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={styles.childEditBtn}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.childEditBtnText}>수정</Text>
                    <ChevronRightSmIcon size={11} color="#94a3b8" />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity onPress={() => navigation.navigate('ChildAdd')} activeOpacity={0.7}>
                  <Text style={styles.childSummaryAdd}>+ 아이 프로필 등록</Text>
                </TouchableOpacity>
              )}

            </View>
          </View>
        </View>

        {/* ── Action Nudge Card ── */}
        <TouchableOpacity
          style={styles.nudgeCard}
          onPress={() => navigation.navigate('LevelInfo', { currentLevelId: currentLevel.id, stats: levelStats })}
          activeOpacity={0.85}
        >
          {/* Header row */}
          <View style={styles.nudgeCardHeader}>
            <Lock size={14} color="#94a3b8" strokeWidth={2.2} />
            {nextLevel ? (
              <Text style={styles.nudgeCardTitle} numberOfLines={1}>
                <Text style={styles.nudgeQuestPrefix}>다음 레벨 </Text>
                <Text style={styles.nudgeCardLevelName}>'{nextLevel.name}'</Text>
                <Text style={styles.nudgeQuestSuffix}>까지</Text>
              </Text>
            ) : (
              <Text style={styles.nudgeCardTitle}>최고 레벨 달성!</Text>
            )}
            <ChevronRightSmIcon size={13} color="#94a3b8" />
          </View>

          {/* Progress bar rows */}
          {nudgeProgress.map((item) => {
            const pct = item.target > 0 ? Math.min(item.current / item.target, 1) : 0;
            const done = pct >= 1;
            return (
              <View key={item.label} style={styles.nudgeProgressRow}>
                <Text style={styles.nudgeProgressLabel}>{item.label}</Text>
                <View style={styles.nudgeBarTrack}>
                  <View style={[styles.nudgeBarFill, { width: `${pct * 100}%` }, done && styles.nudgeBarFillDone]} />
                </View>
                <Text style={[styles.nudgeProgressCount, done && styles.nudgeProgressCountDone]}>
                  {item.current}/{item.target}
                </Text>
              </View>
            );
          })}

          {/* Max level state */}
          {!nextLevel && (
            <Text style={styles.nudgeMaxText}>{nudgeText}</Text>
          )}
        </TouchableOpacity>

        {/* ── Activity stats — 4-cell grid ── */}
        <View style={styles.statsRow}>
          <TouchableOpacity
            style={styles.statCell}
            onPress={() => navigation.navigate('MyActivity', { activeTab: 'posts', postCount, commentCount, likesCount, nickname })}
            activeOpacity={0.7}
          >
            {postCount > 0
              ? <Text style={styles.statNumber}>{postCount}</Text>
              : <Text style={styles.statActionHint}>글 작성하기</Text>}
            <Text style={styles.statLabel}>내가 쓴 글</Text>
          </TouchableOpacity>

          <View style={styles.statDivider} />

          <TouchableOpacity
            style={styles.statCell}
            onPress={() => navigation.navigate('MyActivity', { activeTab: 'comments', postCount, commentCount, likesCount, nickname })}
            activeOpacity={0.7}
          >
            {commentCount > 0
              ? <Text style={styles.statNumber}>{commentCount}</Text>
              : <Text style={styles.statActionHint}>댓글 달기</Text>}
            <Text style={styles.statLabel}>내 댓글</Text>
          </TouchableOpacity>

          <View style={styles.statDivider} />

          <TouchableOpacity
            style={styles.statCell}
            onPress={() => navigation.navigate('MyActivity', { activeTab: 'likes', postCount, commentCount, likesCount, nickname })}
            activeOpacity={0.7}
          >
            <Text style={styles.statNumber}>{likesCount}</Text>
            <Text style={styles.statLabel}>좋아요한 글</Text>
          </TouchableOpacity>

          <View style={styles.statDivider} />

          <TouchableOpacity
            style={styles.statCell}
            onPress={() => showToast('준비 중인 기능입니다')}
            activeOpacity={0.7}
          >
            <Text style={styles.statActionHint}>준비중</Text>
            <Text style={styles.statLabel}>내 쿠폰함</Text>
          </TouchableOpacity>
        </View>

        {/* ── 최근 본 상품 ── */}
        <View style={styles.recentSection}>
          <View style={styles.recentHeader}>
            <Text style={styles.recentTitle}>최근 본 상품</Text>
            <TouchableOpacity
              style={styles.recentViewAllBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              onPress={() => navigation.navigate('RecentlyViewed', { products: recentProducts.length > 0 ? recentProducts : DUMMY_RECENTLY_VIEWED })}
            >
              <Text style={styles.recentViewAllText}>전체보기</Text>
              <ChevronRightSmIcon size={14} color="#94a3b8" />
            </TouchableOpacity>
          </View>
          {(() => {
            const displayItems = recentProducts.length > 0 ? recentProducts : null;
            const dummyItems   = DUMMY_RECENTLY_VIEWED;
            const source       = displayItems ?? dummyItems;
            return (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.recentScroll}
              >
                {source.map((item) => {
                  const isReal       = !!displayItems;
                  const brand        = item.brand        ?? '';
                  const title        = item.name         ?? '';
                  const origPrice    = item.origPrice    ?? 0;
                  const currentPrice = item.currentPrice ?? origPrice;
                  const pct = origPrice > 0 && currentPrice !== origPrice
                    ? Math.round(Math.abs((origPrice - currentPrice) / origPrice) * 100) : 0;
                  const isDown = currentPrice < origPrice;
                  const isUp   = currentPrice > origPrice;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={styles.recentCard}
                      onPress={() => isReal ? handleProductPress(item.id, title) : null}
                      activeOpacity={0.8}
                    >
                      <View style={styles.recentThumb}>
                        <ImagePlaceholderIcon size={26} color="#cbd5e1" />
                      </View>
                      {brand ? <Text style={styles.recentCardBrand} numberOfLines={1}>{brand}</Text> : null}
                      <Text style={styles.recentCardName} numberOfLines={2}>{title}</Text>
                      <View style={styles.recentPriceRow}>
                        {pct > 0 && (
                          <Text style={[styles.recentCardDiscount, isUp && styles.recentCardDiscountUp]}>
                            {isDown ? '▼' : '▲'} {pct}%
                          </Text>
                        )}
                        {currentPrice > 0 && (
                          <Text style={styles.recentCardPrice}>{currentPrice.toLocaleString()}원</Text>
                        )}
                      </View>
                      {origPrice > 0 && origPrice !== currentPrice && (
                        <Text style={styles.recentCardOrigPrice}>{origPrice.toLocaleString()}원</Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            );
          })()}
        </View>

        {/* ── Savings Report Banner ── */}
        <TouchableOpacity
          style={styles.savingsBanner}
          activeOpacity={0.84}
          onPress={() => navigation.navigate('관심상품')}
        >
          <View style={styles.savingsBannerIconWrap}>
            <TrendingDown size={26} color={COLORS.primary} strokeWidth={2} />
          </View>
          <View style={styles.savingsBannerBody}>
            <Text style={styles.savingsBannerTitle}>내 관심상품 할인 리포트</Text>
            <Text style={styles.savingsBannerText}>
              {'추적 중인 상품들을 지금 구매하시면\n총 '}
              <Text style={styles.savingsBannerAmount}>42,500원</Text>
              {'을 절약할 수 있어요!'}
            </Text>
          </View>
          <ChevronRightSmIcon size={16} color={COLORS.primary} />
        </TouchableOpacity>

        {/* ── Admin dashboard ── */}
        {isAdmin ? (
          <TouchableOpacity
            style={styles.adminBtn}
            onPress={() => navigation.navigate('AdminDashboard')}
            activeOpacity={0.85}
          >
            <Text style={styles.adminBtnText}>어드민 대시보드</Text>
          </TouchableOpacity>
        ) : null}

        <View style={{ height: 30 }} />
      </ScrollView>

      {/* ── How-to Guide Modal ── */}
      <Modal
        visible={isGuideOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setIsGuideOpen(false)}
      >
        <TouchableWithoutFeedback onPress={() => setIsGuideOpen(false)}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>
        <View style={[styles.sheet, styles.guideSheet, { paddingBottom: insets.bottom + 24 }]}>
          <View style={styles.sheetHandle} />
          {/* Header */}
          <View style={styles.guideHeader}>
            <Text style={styles.guideTitle}>상품 추가 방법</Text>
            <TouchableOpacity
              onPress={() => setIsGuideOpen(false)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.guideCloseBtn}>✕</Text>
            </TouchableOpacity>
          </View>
          {/* Steps */}
          <View style={styles.guideSteps}>
            <View style={styles.guideStep}>
              <View style={styles.guideStepNum}>
                <Text style={styles.guideStepNumText}>1</Text>
              </View>
              <Text style={styles.guideStepText}>쿠팡 앱에서 원하는 육아템을 찾아요.</Text>
            </View>
            <View style={styles.guideStepConnector} />
            <View style={styles.guideStep}>
              <View style={styles.guideStepNum}>
                <Text style={styles.guideStepNumText}>2</Text>
              </View>
              <Text style={styles.guideStepText}>화면의 '공유하기' 버튼을 눌러요.</Text>
            </View>
            <View style={styles.guideStepConnector} />
            <View style={styles.guideStep}>
              <View style={styles.guideStepNum}>
                <Text style={styles.guideStepNumText}>3</Text>
              </View>
              <Text style={styles.guideStepText}>
                {'\'링크 복사\'를 누르고 세이브루 앱으로\n돌아오면 끝!'}
              </Text>
            </View>
          </View>
          {/* CTA */}
          <TouchableOpacity
            style={styles.guideCta}
            onPress={() => { setIsGuideOpen(false); setAddSheetOpen(true); }}
            activeOpacity={0.85}
          >
            <Text style={styles.guideCtaText}>바로 추가하기</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* ── Add Product Bottom Sheet ── */}
      <Modal
        visible={addSheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setAddSheetOpen(false)}
      >
        <TouchableWithoutFeedback onPress={() => setAddSheetOpen(false)}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.sheetWrap}
        >
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>상품 링크로 추가하기</Text>
            <Text style={styles.sheetSub}>가격을 추적하고 싶은 상품의 링크를 붙여넣어 주세요</Text>
            <View style={styles.marketRow}>
              {MARKETS.map((m) => (
                <View key={m.key} style={[styles.marketItem, !m.active && styles.marketItemDisabled]}>
                  <Text style={[styles.marketName, !m.active && styles.marketNameDisabled]}>{m.name}</Text>
                  {!m.active ? <Text style={styles.comingSoon}>준비 중</Text> : null}
                </View>
              ))}
            </View>
            <View style={styles.sheetInputRow}>
              <TextInput
                style={styles.sheetUrlInput}
                value={urlInput}
                onChangeText={setUrlInput}
                placeholder="https://www.coupang.com/..."
                placeholderTextColor="#aaa"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!registering}
              />
              <TouchableOpacity
                style={[styles.sheetRegisterBtn, (!urlInput.trim() || registering) && styles.sheetRegisterBtnDisabled]}
                onPress={handleRegisterUrl}
                disabled={!urlInput.trim() || registering}
                activeOpacity={0.85}
              >
                {registering
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.sheetRegisterBtnText}>등록</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>


      {/* ── Profile Edit Modal (Bottom Sheet) ── */}
      <Modal
        visible={profileEditModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setProfileEditModalOpen(false)}
      >
        <TouchableWithoutFeedback onPress={() => setProfileEditModalOpen(false)}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>
        <View style={[styles.sheetWrap, { paddingBottom: keyboardHeight }]}>
          <View style={[styles.profileEditSheet, { paddingBottom: keyboardHeight > 0 ? 20 : insets.bottom + 20 }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.profileEditSheetTitle}>프로필 설정</Text>

            {/* Avatar with camera overlay */}
            <TouchableOpacity
              style={styles.profileEditAvatarWrap}
              onPress={() => setImagePickerSheetOpen(true)}
              activeOpacity={0.8}
            >
              <View style={styles.profileEditAvatarCircle}>
                {profileImageUri
                  ? <Image source={{ uri: profileImageUri }} style={styles.profileEditAvatarImage} />
                  : <UserSilhouetteIcon size={38} color="rgba(255,255,255,0.55)" />}
                <View style={styles.profileEditAvatarOverlay}>
                  <CameraIcon size={22} color="#fff" />
                </View>
              </View>
              <Text style={styles.profileEditAvatarHint}>이미지 변경</Text>
            </TouchableOpacity>

            {/* Nickname TextInput + char counter + validation */}
            <View style={styles.profileEditInputBlock}>
              <Text style={styles.profileEditInputLabel}>닉네임</Text>
              <View style={styles.profileEditInputRow}>
                <TextInput
                  style={styles.profileEditInput}
                  value={nicknameInput}
                  onChangeText={setNicknameInput}
                  maxLength={10}
                  returnKeyType="done"
                  onSubmitEditing={handleSaveProfile}
                  editable={!nicknameSaving}
                  placeholder="닉네임을 입력해주세요"
                  placeholderTextColor="#94a3b8"
                  autoFocus
                />
                <Text style={styles.profileEditCounter}>{nicknameInput.length}/10</Text>
              </View>
              <View style={styles.nicknameValidRow}>
                <InfoIcon
                  size={13}
                  color={modalNicknameStatus === 'valid' ? '#22c55e' : '#EF4444'}
                />
                <Text style={[
                  styles.nicknameValidText,
                  { color: modalNicknameStatus === 'valid' ? '#22c55e' : '#EF4444' },
                ]}>
                  {modalNicknameStatus === 'valid'     && '사용할 수 있는 닉네임입니다.'}
                  {modalNicknameStatus === 'empty'     && '닉네임을 입력해주세요.'}
                  {modalNicknameStatus === 'too_short' && '닉네임을 2자 이상 입력해주세요.'}
                  {modalNicknameStatus === 'duplicate' && '이미 사용 중인 닉네임입니다.'}
                </Text>
              </View>
            </View>

            {/* Save button */}
            {(() => {
              const isSaveDisabled = nicknameSaving || modalNicknameStatus === 'empty' || modalNicknameStatus === 'too_short';
              return (
                <TouchableOpacity
                  style={[styles.profileEditSaveBtn, isSaveDisabled && styles.profileEditSaveBtnDisabled]}
                  onPress={handleSaveProfile}
                  disabled={isSaveDisabled}
                  activeOpacity={0.85}
                >
                  {nicknameSaving
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={[styles.profileEditSaveBtnText, isSaveDisabled && styles.profileEditSaveBtnTextDisabled]}>저장</Text>}
                </TouchableOpacity>
              );
            })()}
          </View>
        </View>
      </Modal>

      {/* ── Image Picker Sheet (inside profile edit context) ── */}
      <Modal
        visible={imagePickerSheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setImagePickerSheetOpen(false)}
      >
        <TouchableWithoutFeedback onPress={() => setImagePickerSheetOpen(false)}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>
        <View style={[styles.profileSheet, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.sheetHandle} />
          <Text style={styles.profileSheetTitle}>프로필 이미지</Text>

          <TouchableOpacity
            style={styles.imgPickerOption}
            onPress={handlePickImage}
            activeOpacity={0.7}
          >
            <Text style={styles.imgPickerOptionText}>사진 선택</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.imgPickerOption}
            onPress={() => { setProfileImageUri(null); setImagePickerSheetOpen(false); }}
            activeOpacity={0.7}
          >
            <Text style={[styles.imgPickerOptionText, styles.imgPickerDangerText]}>사진 삭제</Text>
          </TouchableOpacity>

          <View style={styles.profileSheetDivider} />

          <TouchableOpacity
            style={styles.profileSheetCancelRow}
            onPress={() => setImagePickerSheetOpen(false)}
            activeOpacity={0.7}
          >
            <Text style={styles.profileSheetCancelText}>취소</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* ── Coupon Modal ── */}
      <Modal
        visible={couponModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setCouponModalOpen(false)}
      >
        <TouchableWithoutFeedback onPress={() => setCouponModalOpen(false)}>
          <View style={styles.couponBackdrop} />
        </TouchableWithoutFeedback>
        <View style={styles.couponModalWrap} pointerEvents="box-none">
          <View style={styles.couponModalBox}>
            <GiftIcon size={36} color={COLORS.primary} />
            <Text style={styles.couponModalTitle}>시크릿 혜택 오픈 준비 중!</Text>
            <Text style={styles.couponModalBody}>
              {'곧 엄청난 특가 쿠폰과 이벤트가 쏟아질 예정이에요.\n조금만 기다려주세요!'}
            </Text>
            <TouchableOpacity
              style={styles.couponModalBtn}
              onPress={() => setCouponModalOpen(false)}
              activeOpacity={0.85}
            >
              <Text style={styles.couponModalBtnText}>기대할게요</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Product Action Modal (long-press on tracked item) ── */}
      <Modal
        visible={productActionModal.visible}
        transparent
        animationType="slide"
        onRequestClose={() => setProductActionModal({ visible: false, productId: null, productName: null })}
      >
        <TouchableWithoutFeedback onPress={() => setProductActionModal({ visible: false, productId: null, productName: null })}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>
        <View style={[styles.sheet, styles.productActionSheet, { paddingBottom: insets.bottom + 20 }]}>
          <View style={styles.sheetHandle} />
          <Text style={styles.productActionTitle} numberOfLines={1}>
            {productActionModal.productName || '상품'}
          </Text>
          <TouchableOpacity
            style={styles.productActionRow}
            onPress={() => {
              setProductActionModal({ visible: false, productId: null, productName: null });
              Alert.alert('알림 끄기', '이 상품의 가격 알림을 껐어요.');
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.productActionLabel}>알림 끄기</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.productActionRow}
            onPress={() => {
              const pid = productActionModal.productId;
              setProductActionModal({ visible: false, productId: null, productName: null });
              handleRemoveSaved(pid);
            }}
            activeOpacity={0.8}
          >
            <Text style={[styles.productActionLabel, styles.productActionLabelDanger]}>삭제</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.productActionCancelRow}
            onPress={() => setProductActionModal({ visible: false, productId: null, productName: null })}
            activeOpacity={0.8}
          >
            <Text style={styles.productActionCancelText}>취소</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* ── In-app Toast ── */}
      {!!toastMsg && (
        <View style={styles.toast} pointerEvents="none">
          <Text style={styles.toastText}>{toastMsg}</Text>
        </View>
      )}

    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7fb' },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // ── In-app Toast ──
  toast: {
    position: 'absolute', bottom: 32, alignSelf: 'center',
    backgroundColor: 'rgba(15,23,42,0.85)',
    paddingHorizontal: 20, paddingVertical: 10,
    borderRadius: 24,
  },
  toastText: {
    fontSize: 13, fontWeight: '600', color: '#fff',
  },

  // ── Top app bar ──
  appBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  appBarTitle:       { fontSize: 24, fontWeight: '800', color: '#0f172a' },
  appBarTitleCenter: { fontSize: 16, fontWeight: '800', color: '#0f172a', flex: 1, textAlign: 'center' },
  appBarSaveBtn:     { fontSize: 15, fontWeight: '800', color: COLORS.primary },
  appBarActions: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  appBarIcon:    { fontSize: 22 },

  // ── Avatar wrapper + edit badge ──
  avatarWrapper: {
    position: 'relative',
    flexShrink: 0,
  },
  avatarCircleEdit: {
    opacity: 0.85,
  },
  avatarEditOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: 32,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarImage: {
    width: 64, height: 64, borderRadius: 32,
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.14, shadowRadius: 3 },
      android: { elevation: 3 },
    }),
  },

  // ── Nickname inline edit block ──
  nicknameEditBlock: {
    gap: 4, flex: 1,
  },
  nicknameInputEdit: {
    fontSize: 16, fontWeight: '700', color: '#0f172a',
    borderWidth: 1.5, borderColor: COLORS.primary, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 8,
    backgroundColor: '#f8fbff',
  },
  nicknameValidRow: {
    flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2,
  },
  nicknameValidText: {
    fontSize: 11, fontWeight: '600', lineHeight: 15,
  },

  // ── Image picker sheet options ──
  imgPickerOption: {
    paddingVertical: 17,
    borderTopWidth: 1, borderTopColor: '#f1f5f9',
    alignItems: 'center',
  },
  imgPickerOptionText: {
    fontSize: 16, fontWeight: '600', color: '#0f172a',
  },
  imgPickerDangerText: {
    color: '#EF4444',
  },

  // ── Child edit button (right-aligned) ──
  childEditBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
  },
  childEditBtnText: {
    fontSize: 11, fontWeight: '600', color: '#94a3b8',
  },

  // ── Nudge next-level tag ──
  nudgeNextTag: {
    fontSize: 11, fontWeight: '700', color: COLORS.primary,
  },
  nudgeQuestPrefix: {
    fontSize: 13, fontWeight: '500', color: '#64748b',
  },
  nudgeQuestSuffix: {
    fontSize: 13, fontWeight: '500', color: '#64748b',
  },

  // ── Nickname inline edit wrap + counter ──
  nicknameEditWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  nicknameCounter: {
    fontSize: 11, fontWeight: '500', color: '#94a3b8', flexShrink: 0,
  },

  // ── Profile edit sheet ──
  profileSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 20, paddingTop: 12, gap: 0,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.1, shadowRadius: 12 },
      android: { elevation: 16 },
    }),
  },
  profileSheetTitle: {
    fontSize: 14, fontWeight: '700', color: '#94a3b8',
    textAlign: 'center', letterSpacing: 0.3,
    paddingVertical: 10, marginBottom: 4,
  },
  profileSheetOption: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 16,
    borderTopWidth: 1, borderTopColor: '#f1f5f9',
  },
  profileSheetOptionIcon: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#eff6ff',
    alignItems: 'center', justifyContent: 'center',
  },
  profileSheetOptionText: {
    fontSize: 16, fontWeight: '700', color: COLORS.primary,
  },
  profileSheetDivider: {
    height: 8, backgroundColor: '#f8fafc',
    marginHorizontal: -20, marginTop: 8, marginBottom: 4,
  },
  profileSheetCancelRow: {
    paddingVertical: 16, alignItems: 'center',
  },
  profileSheetCancelText: {
    fontSize: 16, fontWeight: '700', color: '#94a3b8',
  },

  // ── Coupon modal ──
  couponBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  couponModalWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  couponModalBox: {
    backgroundColor: '#fff',
    borderRadius: 20,
    marginHorizontal: 32,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 24,
    alignItems: 'center',
    gap: 10,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 20 },
      android: { elevation: 12 },
    }),
  },
  couponModalTitle: {
    fontSize: 17, fontWeight: '900', color: '#0f172a', textAlign: 'center',
  },
  couponModalBody: {
    fontSize: 14, fontWeight: '500', color: '#64748b', textAlign: 'center', lineHeight: 21,
  },
  couponModalBtn: {
    marginTop: 8,
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingHorizontal: 32,
    paddingVertical: 13,
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  couponModalBtnText: {
    fontSize: 15, fontWeight: '800', color: '#fff',
  },

  // ── Profile Card (Fintech) ──
  profileCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16, marginTop: 12, marginBottom: 4,
    borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0',
    padding: 16,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
      android: { elevation: 2 },
    }),
  },
  profileCardRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
  },
  avatarCircle: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  profileInfoCol: {
    flex: 1, gap: 6,
  },
  nicknameRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  nicknameText: {
    fontSize: 20, fontWeight: '900', color: '#0f172a', flex: 1,
  },
  nicknameInput: {
    flex: 1, fontSize: 17, fontWeight: '800', color: '#0f172a',
    borderBottomWidth: 1.5, borderBottomColor: COLORS.primary,
    paddingVertical: 2, paddingHorizontal: 0,
  },
  nicknameActionBtn: {
    padding: 4,
  },
  childSummaryRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  childSummaryText: {
    fontSize: 12, fontWeight: '500', color: '#64748b', flex: 1,
  },
  childSummaryAdd: {
    fontSize: 12, fontWeight: '600', color: COLORS.primary,
  },


  // ── Level badge pill — clickable, inline in nickname row ──
  levelBadgePillInline: {
    marginLeft: 8, backgroundColor: '#EFF6FF', borderRadius: 12,
    paddingHorizontal: 8, paddingVertical: 4, flexShrink: 0,
  },
  levelBadgePillInlineText: { fontSize: 12, fontWeight: 'bold', color: '#2E6FF2' },

  // ── Profile edit bottom sheet ──
  profileEditSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 24, paddingTop: 12,
    gap: 20,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.1, shadowRadius: 16 },
      android: { elevation: 20 },
    }),
  },
  profileEditSheetTitle: {
    fontSize: 17, fontWeight: '900', color: '#0f172a', textAlign: 'center', paddingTop: 4,
  },
  profileEditAvatarWrap: {
    alignItems: 'center', gap: 8,
  },
  profileEditAvatarCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  profileEditAvatarImage: {
    width: 80, height: 80, borderRadius: 40,
  },
  profileEditAvatarOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: 40,
    backgroundColor: 'rgba(0,0,0,0.32)',
    alignItems: 'center', justifyContent: 'center',
  },
  profileEditAvatarHint: {
    fontSize: 12, fontWeight: '600', color: '#94a3b8',
  },
  profileEditInputBlock: {
    gap: 6,
  },
  profileEditInputLabel: {
    fontSize: 12, fontWeight: '700', color: '#64748b', letterSpacing: 0.3,
  },
  profileEditInputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  profileEditInput: {
    flex: 1, fontSize: 16, fontWeight: '700', color: '#0f172a',
    borderWidth: 1.5, borderColor: COLORS.primary, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: '#f8fbff',
  },
  profileEditCounter: {
    fontSize: 11, fontWeight: '500', color: '#94a3b8', flexShrink: 0,
  },
  profileEditSaveBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  profileEditSaveBtnDisabled: {
    backgroundColor: '#cbd5e1',
  },
  profileEditSaveBtnText: {
    fontSize: 16, fontWeight: '800', color: '#fff',
  },
  profileEditSaveBtnTextDisabled: {
    color: '#94a3b8',
  },

  // ── Grade info modal ──
  gradeSheet: {
    maxHeight: '85%',
    paddingHorizontal: 0,
    paddingTop: 16,
  },
  gradeSheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, marginBottom: 6,
  },
  gradeSheetTitle: { fontSize: 17, fontWeight: '900', color: '#0f172a' },
  gradeSheetClose: { fontSize: 18, color: '#94a3b8' },
  gradeSheetSub: {
    fontSize: 13, color: '#64748b', lineHeight: 18,
    paddingHorizontal: 20, marginBottom: 14,
  },
  gradeScrollArea: { paddingHorizontal: 14, paddingTop: 4 },

  // Custom tab switcher
  gradeTabRow: {
    flexDirection: 'row',
    marginHorizontal: 20, marginBottom: 12,
    borderRadius: 10, backgroundColor: '#f1f5f9',
    padding: 3, gap: 3,
  },
  gradeTab: {
    flex: 1, paddingVertical: 8, borderRadius: 8,
    alignItems: 'center',
  },
  gradeTabActive: {
    backgroundColor: '#fff',
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 3 },
      android: { elevation: 2 },
    }),
  },
  gradeTabText:       { fontSize: 14, fontWeight: '600', color: '#94a3b8' },
  gradeTabTextActive: { color: '#0f172a', fontWeight: '800' },

  // Title cards (호칭 tab)
  gradeTitleCard: {
    borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0',
    borderLeftWidth: 4,
    backgroundColor: '#fff',
    padding: 10, marginBottom: 6, gap: 6,
  },
  gradeTitleCardActive: {
    borderColor: COLORS.primary, borderWidth: 2, borderLeftWidth: 4,
    backgroundColor: '#f8fbff',
  },
  gradeTitleCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  gradeTitleActiveTag: {
    backgroundColor: COLORS.primary, borderRadius: 20,
    paddingHorizontal: 6, paddingVertical: 2, marginLeft: 'auto',
  },
  gradeTitleActiveTagText: { fontSize: 9, fontWeight: '800', color: '#fff' },
  gradeTitleTapHint: {
    fontSize: 10, color: COLORS.primary, fontWeight: '600', marginTop: 1,
  },
  gradeTierCard: {
    borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    padding: 10, marginBottom: 6, gap: 6,
    opacity: 0.7,
  },
  gradeTierCardUnlocked: { backgroundColor: '#fff', opacity: 1 },
  gradeTierCardCurrent: {
    borderColor: COLORS.primary, borderWidth: 2,
    ...Platform.select({
      ios:     { shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 },
      android: { elevation: 2 },
    }),
  },
  gradeTierHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  gradeTierBadge: {
    borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3,
  },
  gradeTierBadgeText: { fontSize: 12, fontWeight: '800' },
  gradeTierLockIcon:  { fontSize: 14, marginLeft: 'auto' },
  gradeTierCurrentTag: {
    backgroundColor: COLORS.primary, borderRadius: 20,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  gradeTierCurrentTagText: { fontSize: 9, fontWeight: '800', color: '#fff' },
  gradeTierSection:    { gap: 1 },
  gradeTierSectionLabel: { fontSize: 9, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.3 },
  gradeTierSectionText: { fontSize: 12, fontWeight: '500', color: '#334155', lineHeight: 17 },
  gradeTierLockedText:  { color: '#cbd5e1', letterSpacing: 0 },

  // ── Child dropdown trigger ──
  childDropBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#f1f5f9', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 7,
    flex: 1, alignSelf: 'flex-start',
  },
  childDropName:  { fontSize: 14, fontWeight: '800', color: '#0f172a', flexShrink: 1 },
  childDropCaret: { fontSize: 11, color: '#64748b', marginLeft: 2 },

  // ── Child dashboard card ──
  childDashCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16, marginTop: 12, marginBottom: 4,
    borderRadius: 16,
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 16,
    borderWidth: 1, borderColor: '#e2e8f0',
    gap: 10,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6 },
      android: { elevation: 2 },
    }),
  },
  childDashHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  childDashNameRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1,
  },
  childDashEditBtn: {
    backgroundColor: '#f1f5f9', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  childDashEditText: { fontSize: 13, fontWeight: '600', color: COLORS.primary },
  childDashBadges: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 6,
  },
  childDashBadge: {
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4,
  },
  childDashBadgeText: { fontSize: 12, fontWeight: '700' },
  childDashNoBadgeHint: {
    fontSize: 13, color: '#94a3b8', fontStyle: 'italic', lineHeight: 20,
  },
  childDashEmpty: {
    marginHorizontal: 16, marginTop: 12, marginBottom: 4,
    borderRadius: 16, borderWidth: 1.5, borderColor: '#e2e8f0', borderStyle: 'dashed',
    paddingVertical: 18, alignItems: 'center',
  },
  childDashEmptyText: { fontSize: 14, fontWeight: '700', color: '#94a3b8' },

  // ── Child picker modal ──
  childPickerCard: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 32,
    gap: 2,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.1, shadowRadius: 12 },
      android: { elevation: 16 },
    }),
  },
  childPickerTitle: {
    fontSize: 13, fontWeight: '800', color: '#94a3b8',
    letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8,
  },
  childPickerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 13, paddingHorizontal: 4,
    borderRadius: 12,
  },
  childPickerRowActive:    { backgroundColor: '#eff6ff' },
  childPickerRowEmoji:     { fontSize: 22 },
  childPickerRowName:      { flex: 1, fontSize: 15, fontWeight: '600', color: '#334155' },
  childPickerRowNameActive: { color: '#1d4ed8', fontWeight: '800' },
  childPickerCheck:        { fontSize: 16, color: COLORS.primary, fontWeight: '900' },
  childPickerAddRow: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: 6,
    paddingVertical: 13, paddingHorizontal: 4,
    borderTopWidth: 1, borderTopColor: '#f1f5f9',
  },
  childPickerAddText: { fontSize: 14, fontWeight: '700', color: COLORS.primary },

  // ── Activity stats — single fixed row ──
  statsRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff',
    borderTopWidth: 1, borderTopColor: '#f1f5f9',
    paddingVertical: 12, paddingHorizontal: 4,
  },
  statCell:       { flex: 1, alignItems: 'center', gap: 3, paddingHorizontal: 2 },
  statNumber:     { fontSize: 16, fontWeight: '900', color: '#0f172a' },
  statActionHint: { fontSize: 11, fontWeight: '700', color: COLORS.primary },
  statLabel:      { fontSize: 10, fontWeight: '600', color: '#64748b', textAlign: 'center', lineHeight: 13 },
  statDivider:    { width: 1, height: 30, backgroundColor: '#e2e8f0' },

  // ── Section divider ──
  sectionDivider: { height: 8, backgroundColor: '#f1f5f9' },

  // ── Level badge pill ──
  levelBadgePill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start',
  },
  levelBadgePillText: { fontSize: 12, fontWeight: '800' },

  // ── Action Nudge Card ──
  nudgeCard: {
    backgroundColor: '#F8FAFC',
    marginHorizontal: 16, marginTop: 10, marginBottom: 0,
    borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 14,
    borderWidth: 1, borderColor: '#e2e8f0',
    gap: 10,
  },
  nudgeCardHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  nudgeCardTitle: {
    flex: 1, fontSize: 14, lineHeight: 18,
  },
  nudgeCardLevelName: {
    fontSize: 13, fontWeight: '800', color: '#0f172a',
  },
  nudgeCardTitleSuffix: {
    fontWeight: '500', color: '#64748b', fontSize: 12,
  },
  nudgeProgressRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  nudgeProgressLabel: {
    fontSize: 11, fontWeight: '600', color: '#475569', width: 52,
  },
  nudgeBarTrack: {
    flex: 1, height: 7, borderRadius: 4, backgroundColor: '#e2e8f0', overflow: 'hidden',
  },
  nudgeBarFill: {
    height: '100%', borderRadius: 4, backgroundColor: COLORS.primary,
  },
  nudgeBarFillDone: {
    backgroundColor: '#22c55e',
  },
  nudgeProgressCount: {
    fontSize: 11, fontWeight: '700', color: '#334155', width: 30, textAlign: 'right',
  },
  nudgeProgressCountDone: {
    color: '#16a34a',
  },
  nudgeMaxText: {
    fontSize: 13, fontWeight: '700', color: COLORS.primary,
  },

  // ── Savings Report Banner ──
  savingsBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#EFF6FF',
    marginHorizontal: 16, marginTop: 20, marginBottom: 4,
    borderRadius: 16,
    paddingHorizontal: 16, paddingVertical: 14,
    borderWidth: 1, borderColor: '#BFDBFE',
    ...Platform.select({
      ios:     { shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 6 },
      android: { elevation: 2 },
    }),
  },
  savingsBannerIconWrap: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: '#DBEAFE',
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  savingsBannerBody: {
    flex: 1, gap: 3,
  },
  savingsBannerTitle: {
    fontSize: 11, fontWeight: '700', color: COLORS.primary,
    letterSpacing: 0.3, textTransform: 'uppercase',
  },
  savingsBannerText: {
    fontSize: 13, fontWeight: '500', color: '#334155', lineHeight: 19,
  },
  savingsBannerAmount: {
    fontSize: 14, fontWeight: '900', color: COLORS.primary,
  },

  // ── Gamification Banner ──
  gamiBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#eff6ff',
    marginHorizontal: 16, marginTop: 12, marginBottom: 4,
    borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 13,
    borderWidth: 1, borderColor: '#bfdbfe',
  },
  gamiBannerText: {
    flex: 1, fontSize: 13, fontWeight: '700', color: '#1d4ed8', lineHeight: 18,
  },

  // ── Recently Viewed ──
  recentSection: {
    backgroundColor: '#fff',
    marginTop: 12,
    paddingTop: 14, paddingBottom: 18,
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#f1f5f9',
  },
  recentHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, marginBottom: 12,
  },
  recentTitle: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  recentViewAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  recentViewAllText: { fontSize: 12, fontWeight: '500', color: '#94a3b8' },
  recentEmpty: { paddingHorizontal: 16, paddingVertical: 20, alignItems: 'center', gap: 4 },
  recentEmptyText: { fontSize: 13, fontWeight: '600', color: '#94a3b8' },
  recentEmptyHint: { fontSize: 12, color: '#cbd5e1' },
  recentScroll: { paddingHorizontal: 16, paddingBottom: 4, gap: 12 },
  recentCard: { width: 108, gap: 4 },
  recentThumb: {
    width: 108, height: 108, borderRadius: 12,
    backgroundColor: '#f1f5f9',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#e2e8f0',
    position: 'relative', overflow: 'hidden',
  },
  recentDiscountBadge: {
    position: 'absolute', top: 6, left: 6,
    backgroundColor: '#EF4444', borderRadius: 4,
    paddingHorizontal: 5, paddingVertical: 2,
  },
  recentDiscountText: { fontSize: 10, fontWeight: '800', color: '#fff' },
  recentCardBrand:     { fontSize: 10, fontWeight: '600', color: '#94a3b8', marginTop: 2 },
  recentCardName:      { fontSize: 11, fontWeight: '600', color: '#334155', lineHeight: 15 },
  recentPriceRow:        { flexDirection: 'row', alignItems: 'baseline', gap: 4, flexWrap: 'wrap' },
  recentCardDiscount:    { fontSize: 12, fontWeight: '800', color: '#2E6FF2' },
  recentCardDiscountUp:  { color: '#ef4444' },
  recentCardPrice:       { fontSize: 13, fontWeight: '900', color: '#0f172a' },
  recentCardOrigPrice:   { fontSize: 10, color: '#94a3b8', textDecorationLine: 'line-through' },

  // ── Price Tracking Widget ──
  trackingWidget: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  trackingWidgetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12,
  },
  trackingWidgetTitle: { fontSize: 18, fontWeight: '900', color: '#0f172a' },
  trackingSubtitle:    { fontSize: 13, color: '#94a3b8', lineHeight: 18, marginBottom: 12 },

  // Header action buttons
  trackingClipboardBtn: {
    backgroundColor: '#f1f5f9', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  trackingClipboardText: { fontSize: 14, fontWeight: '700', color: '#475569' },
  trackingViewAllBtn: {
    backgroundColor: '#eff6ff', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  trackingViewAllText: { fontSize: 13, fontWeight: '700', color: COLORS.primary },

  // ── Empty state ──
  trackingAddCardFull: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 12, borderWidth: 1.5, borderColor: '#bfdbfe', borderStyle: 'dashed',
    backgroundColor: '#f8fbff',
    paddingVertical: 16, marginBottom: 20,
  },
  trackingAddCardFullPlus:  { fontSize: 24, color: '#60a5fa', lineHeight: 28 },
  trackingAddCardFullLabel: { fontSize: 14, fontWeight: '700', color: '#60a5fa' },
  trackingAddCardFullSub:   { fontSize: 11, color: '#93c5fd', marginTop: 2 },

  trackingEmptyDivider: {
    height: 8, backgroundColor: '#f1f5f9', width: '100%', marginVertical: 24,
  },
  trackingEmptyRecTitle: {
    fontSize: 18, fontWeight: '900', color: '#0f172a', marginBottom: 10,
  },
  // ── Empty state rec cards (horizontal) ──
  trackingRecHScroll: { paddingBottom: 6, gap: 10 },
  trackingRecCard: {
    width: 130,
    borderRadius: 12, backgroundColor: 'transparent',
    overflow: 'visible',
  },
  trackingRecCardImage: {
    width: '100%', height: 120,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
  },
  trackingRecCardBody: {
    paddingTop: 8, paddingHorizontal: 2, flex: 1, gap: 4,
  },
  trackingRecCardName:    { fontSize: 12, fontWeight: '500', color: '#1e293b', lineHeight: 17 },
  trackingRecPriceRow:    { flexDirection: 'row', alignItems: 'center', gap: 4 },
  trackingRecOrig: {
    fontSize: 10, color: '#cbd5e1', textDecorationLine: 'line-through',
  },
  trackingRecDropBadge: {
    backgroundColor: '#fef2f2', borderRadius: 4,
    paddingHorizontal: 4, paddingVertical: 1,
  },
  trackingRecDropText:    { fontSize: 10, fontWeight: '700', color: '#dc2626' },
  trackingRecCurrent:     { fontSize: 13, fontWeight: '800', color: '#0f172a' },
  trackingRecAddBtn: {
    marginTop: 6,
    backgroundColor: '#f1f5f9', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6, alignSelf: 'stretch', alignItems: 'center',
  },
  trackingRecAddText: { fontSize: 11, fontWeight: '600', color: '#374151' },

  // ── Active state: horizontal scroll ──
  trackingHScroll: { paddingBottom: 4, gap: 10 },

  // Polcent-style square add card
  trackingAddSquareCard: {
    width: 140, height: 165,
    borderRadius: 12,
    borderWidth: 1.5, borderColor: '#e2e8f0',
    borderStyle: 'dashed',
    backgroundColor: '#f8fafc',
    alignItems: 'center', justifyContent: 'center',
    gap: 6,
  },
  trackingAddSquarePlus:  { fontSize: 36, color: '#94a3b8', lineHeight: 40 },
  trackingAddSquareLabel: { fontSize: 13, fontWeight: '700', color: '#94a3b8' },

  // Polcent-style stacked commerce card
  trackingItemCard: {
    width: 140,
    borderRadius: 12, backgroundColor: '#fff',
    borderWidth: 1, borderColor: '#f1f5f9',
    marginRight: 12, padding: 0, overflow: 'hidden',
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 6 },
      android: { elevation: 2 },
    }),
  },
  trackingImageWrap: {
    width: 140, height: 140, backgroundColor: '#f1f5f9', overflow: 'hidden',
    marginBottom: 8,
  },
  trackingItemThumb:         { width: '100%', height: '100%' },
  trackingItemThumbFallback: { alignItems: 'center', justifyContent: 'center' },
  trackingSourceBadge: {
    fontSize: 10, fontWeight: '700', color: '#64748b',
    marginBottom: 4, paddingHorizontal: 10,
  },
  trackingItemName: {
    fontSize: 13, fontWeight: '600', color: '#334155',
    lineHeight: 18, marginBottom: 6, paddingHorizontal: 10,
  },

  // Price row: strikethrough + current
  trackingPriceRow:  {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    flexWrap: 'wrap', paddingHorizontal: 10,
  },
  trackingOrigPrice: { fontSize: 11, color: '#cbd5e1', textDecorationLine: 'line-through' },
  trackingItemPrice: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  trackingTrendBadge: {
    fontSize: 12, fontWeight: '800', color: '#3b82f6',
    paddingHorizontal: 10, paddingBottom: 10, marginTop: 2,
  },

  // ── Product action modal (long-press) ──
  productActionSheet: {
    paddingHorizontal: 0,
    gap: 0,
  },
  productActionTitle: {
    fontSize: 14, fontWeight: '700', color: '#64748b',
    paddingHorizontal: 20, paddingTop: 4, paddingBottom: 12,
  },
  productActionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    paddingHorizontal: 20, paddingVertical: 16,
    borderTopWidth: 1, borderTopColor: '#f1f5f9',
  },
  productActionIcon: { fontSize: 22, width: 28, textAlign: 'center' },
  productActionLabel: { fontSize: 16, fontWeight: '600', color: '#1e293b' },
  productActionLabelDanger: { color: '#dc2626' },
  productActionCancelRow: {
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 16,
    marginTop: 4,
    borderTopWidth: 1, borderTopColor: '#f1f5f9',
  },
  productActionCancelText: { fontSize: 16, fontWeight: '700', color: '#94a3b8' },

  // ── How-to guide button ──
  guideButtonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
  },
  guideButton: {
    backgroundColor: '#1f2937',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  guideButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },

  // ── How-to guide modal ──
  guideSheet: {
    gap: 0,
    paddingHorizontal: 24,
  },
  guideHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 24,
  },
  guideTitle:    { fontSize: 17, fontWeight: '900', color: '#0f172a' },
  guideCloseBtn: { fontSize: 18, color: '#94a3b8' },
  guideSteps: { gap: 0 },
  guideStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  guideStepNum: {
    width: 28, height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  guideStepNumText: { fontSize: 13, fontWeight: '900', color: '#fff' },
  guideStepText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#1e293b',
    lineHeight: 22,
    paddingBottom: 2,
  },
  guideStepConnector: {
    width: 2,
    height: 18,
    backgroundColor: '#dbeafe',
    marginLeft: 13,
    marginVertical: 3,
  },
  guideCta: {
    marginTop: 28,
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  guideCtaText: { color: '#fff', fontWeight: '800', fontSize: 15 },

  // ── Menu ──
  menuSectionHeader: {
    paddingHorizontal: 16, paddingTop: 18, paddingBottom: 6,
    backgroundColor: '#f5f7fb',
  },
  menuSectionTitle: { fontSize: 12, fontWeight: '800', color: '#94a3b8', letterSpacing: 0.5 },
  menuItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff',
    paddingHorizontal: 16, paddingVertical: 15,
    borderBottomWidth: 1, borderBottomColor: '#f8fafc',
  },
  menuItemLeft:        { flexDirection: 'row', alignItems: 'center', gap: 14 },
  menuItemIcon:        { fontSize: 20, width: 28, textAlign: 'center' },
  menuItemLabel:       { fontSize: 15, fontWeight: '600', color: '#0f172a' },
  menuItemLabelDanger: { color: '#ef4444' },
  menuItemRight:       { flexDirection: 'row', alignItems: 'center', gap: 6 },
  menuItemValue:       { fontSize: 13, color: '#94a3b8', fontWeight: '600' },
  menuItemChevron:     { fontSize: 20, color: '#cbd5e1', fontWeight: '300' },

  // ── Admin ──
  adminBtn: {
    margin: 16, backgroundColor: '#0f172a', borderRadius: 12,
    paddingVertical: 14, alignItems: 'center',
  },
  adminBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },

  // ── Bottom sheets ──
  backdrop:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheetWrap: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 20, paddingTop: 12, gap: 12,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.1, shadowRadius: 12 },
      android: { elevation: 16 },
    }),
  },
  sheetHandle: {
    alignSelf: 'center', width: 36, height: 4,
    borderRadius: 2, backgroundColor: '#cbd5e1', marginBottom: 4,
  },
  sheetTitle:   { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  sheetSub:     { fontSize: 13, color: '#64748b' },
  marketRow:    { flexDirection: 'row', gap: 12 },
  marketItem: {
    flex: 1, alignItems: 'center', gap: 4,
    backgroundColor: '#f8fafc', borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: '#e4e7ed',
  },
  marketItemDisabled: { opacity: 0.45 },
  marketEmoji:        { fontSize: 20 },
  marketName:         { fontSize: 11, fontWeight: '700', color: '#334155' },
  marketNameDisabled: { color: '#94a3b8' },
  comingSoon:         { fontSize: 9, color: '#94a3b8', fontWeight: '600' },
  sheetInputRow:      { flexDirection: 'row', gap: 8, alignItems: 'center' },
  sheetUrlInput: {
    flex: 1, backgroundColor: '#f8fafc', borderRadius: 10,
    borderWidth: 1, borderColor: '#e4e7ed',
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: '#0f172a',
  },
  sheetRegisterBtn: {
    backgroundColor: COLORS.primary, borderRadius: 10,
    paddingHorizontal: 16, paddingVertical: 10,
    alignItems: 'center', justifyContent: 'center', minWidth: 56,
  },
  sheetRegisterBtnDisabled: { backgroundColor: '#cbd5e1' },
  sheetRegisterBtnText:     { color: '#fff', fontWeight: '800', fontSize: 14 },
});
