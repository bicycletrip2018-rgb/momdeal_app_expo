import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  BackHandler,
  Image,
  Linking,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Svg, {
  Circle,
  Line,
  Polyline,
  Text as SvgText,
} from 'react-native-svg';

import { Bell, BellRing, CheckCircle, ExternalLink, Info, Share2, Sparkles, Users } from 'lucide-react-native';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { getChildrenByUserId } from '../services/firestore/childrenRepository';
import { getMarketingAverage } from '../services/priceTrackingService';

// ─── Daily-price helpers ──────────────────────────────────────────────────────

// Days to fetch per time-range tab.
const RANGE_DAYS = { '1W': 7, '1M': 30, '2M': 60, '3M': 90 };

// Convert a raw daily_prices record (YYYY-MM-DD, maxPrice, minPrice)
// to the chart point shape { date: 'MM.DD', high, low }.
function toDailyPt(r) {
  const parts = r.date.split('-');
  return { date: `${parts[1]}.${parts[2]}`, high: r.maxPrice, low: r.minPrice };
}

// ─── Mock datasets ─────────────────────────────────────────────────────────────
// Four time ranges, each an array of { date, high, low }.
// Price curve: starts mid-range, rises to a peak at ~55%, then drops to a recent low
// to simulate the "good time to buy" narrative.

const DATASETS = (() => {
  function lerp(a, b, t) { return a + (b - a) * t; }

  function makeSeries(numPoints, daysBack) {
    const today = new Date();
    const step  = daysBack / Math.max(numPoints - 1, 1);
    return Array.from({ length: numPoints }, (_, i) => {
      const t     = i / Math.max(numPoints - 1, 1);
      const trend = t < 0.55
        ? lerp(0.25, 1,    t / 0.55)
        : lerp(1,    0.05, (t - 0.55) / 0.45);
      const noise = Math.sin(i * 3.1) * 0.06 + Math.cos(i * 1.7) * 0.04;
      const v     = Math.max(0, Math.min(1, trend + noise));

      // low is hero; high is strictly low + correlated margin so lines flow together
      const low    = Math.round(lerp(56000, 115000, v) / 500) * 500;
      const margin = Math.round(lerp(12000, 20000, Math.abs(Math.sin(i * 1.3) * 0.4 + 0.6)) / 500) * 500;
      const high   = low + margin;

      const dt = new Date(today);
      dt.setDate(today.getDate() - Math.round((numPoints - 1 - i) * step));
      const mm = String(dt.getMonth() + 1).padStart(2, '0');
      const dd = String(dt.getDate()).padStart(2, '0');
      return { date: `${mm}.${dd}`, high, low };
    });
  }

  return {
    '1W': makeSeries(7,   7),
    '1M': makeSeries(30,  30),
    '2M': makeSeries(20,  60),
    '3M': makeSeries(13,  90),
    '1Y': makeSeries(52, 365),
  };
})();

// All-time extremes come from the full 1Y dataset
const ALL_TIME_HIGH = Math.max(...DATASETS['1Y'].map((d) => d.high));
const ALL_TIME_LOW  = Math.min(...DATASETS['1Y'].map((d) => d.low));

const TIME_TABS = [
  { key: '1W', label: '1주일' },
  { key: '1M', label: '1개월' },
  { key: '2M', label: '2개월' },
  { key: '3M', label: '3개월' },
];

// ─── Mock options (different counts/sizes of the same product) ─────────────────

const MOCK_OPTIONS = [
  { id: '1', title: '1단계 80매 (4~8kg)',   price: 24900, origPrice: 31900, unitType: '1개', unitPriceValue: '311원', discountPct: 22, imageUrl: 'https://picsum.photos/seed/opt1/100' },
  { id: '2', title: '2단계 100매 (6~10kg)', price: 29900, origPrice: 38000, unitType: '1개', unitPriceValue: '299원', discountPct: 21, imageUrl: 'https://picsum.photos/seed/opt2/100' },
  { id: '3', title: '3단계 120매 (8~14kg)', price: 33500, origPrice: 43000, unitType: '1개', unitPriceValue: '279원', discountPct: 22, imageUrl: 'https://picsum.photos/seed/opt3/100' },
  { id: '4', title: '4단계 90매 (10~16kg)', price: 27900, origPrice: 35500, unitType: '1개', unitPriceValue: '310원', discountPct: 21, imageUrl: 'https://picsum.photos/seed/opt4/100' },
  { id: '5', title: '5단계 72매 (12~17kg)', price: 23500, origPrice: 30000, unitType: '1개', unitPriceValue: '326원', discountPct: 22, imageUrl: 'https://picsum.photos/seed/opt5/100' },
];

const OPTIONS_PREVIEW_COUNT = 3; // show 3 by default, rest behind "더 보기"

// ─── Mock similar products ─────────────────────────────────────────────────────

const MOCK_SIMILAR = [
  { productId: 'sim1', name: '하기스 맥스드라이 팬티형 3단계 108매', currentPrice: 31900, priceDrop: 7000, deliveryType: 'rocket', badge: '최근 최저가 근접' },
  { productId: 'sim2', name: '마미포코 오가닉 밴드형 2단계 84매',    currentPrice: 22500, priceDrop: 4500, deliveryType: 'rocket', badge: '최근 최저가'     },
  { productId: 'sim3', name: '보솜이 프리미엄 팬티형 4단계 60매',    currentPrice: 18900, priceDrop: 3000, deliveryType: 'fresh',  badge: null            },
  { productId: 'sim4', name: '귀염둥이 슈퍼드라이 밴드형 1단계 96매', currentPrice: 19800, priceDrop: 5200, deliveryType: 'rocket', badge: null            },
];

// ─── Chart geometry ────────────────────────────────────────────────────────────

const CHART_H       = 200;
const PAD_TOP       = 20;
const PAD_BOTTOM    = 16;
const PAD_X         = 10; // horizontal inset so first/last dots aren't clipped
const INNER_H       = CHART_H - PAD_TOP - PAD_BOTTOM;
const TOOLTIP_W     = 152;

function buildPts(data, key, domMin, domMax, w) {
  const usableW = w - PAD_X * 2;
  const step    = usableW / Math.max(data.length - 1, 1);
  return data.map((d, i) => ({
    x: PAD_X + i * step,
    y: PAD_TOP + INNER_H * (1 - (d[key] - domMin) / (domMax - domMin)),
    v: d[key],
  }));
}

function ptsStr(pts) {
  return pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
}

// ─── Multi-Badge Component ─────────────────────────────────────────────────────

function MultiBadgeComponent({ currentPrice, allTimeLow, periodAverage }) {
  if (currentPrice <= allTimeLow) {
    return (
      <View style={{ backgroundColor: '#2E6FF2', paddingVertical: 6, paddingHorizontal: 12, alignSelf: 'flex-start', borderRadius: 4 }}>
        <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 13 }}>최근 최저가</Text>
      </View>
    );
  }
  if (currentPrice <= allTimeLow * 1.05) {
    return (
      <View style={{ backgroundColor: '#EFF6FF', paddingVertical: 6, paddingHorizontal: 12, alignSelf: 'flex-start', borderRadius: 4 }}>
        <Text style={{ color: '#2E6FF2', fontWeight: '700', fontSize: 13 }}>최근 최저가 근접</Text>
      </View>
    );
  }
  if (periodAverage > 0 && currentPrice <= periodAverage) {
    return (
      <View style={{ backgroundColor: '#EFF6FF', paddingVertical: 6, paddingHorizontal: 12, alignSelf: 'flex-start', borderRadius: 4 }}>
        <Text style={{ color: '#2E6FF2', fontWeight: '700', fontSize: 13 }}>평균가 이하</Text>
      </View>
    );
  }
  return (
    <View style={{ backgroundColor: '#F3F4F6', paddingVertical: 6, paddingHorizontal: 12, alignSelf: 'flex-start', borderRadius: 4 }}>
      <Text style={{ color: '#6B7280', fontWeight: '700', fontSize: 13 }}>가격 상승 중</Text>
    </View>
  );
}

// ─── Gauge Bar ─────────────────────────────────────────────────────────────────
// pct = (currentPrice − allTimeLow) / (allTimeHigh − allTimeLow)
// Fill width = pct × 100%. Thumb dot overlaid at the same percentage left.

function GaugeBar({ current, min, max, avg, allTimeLow, fillColor = '#2E6FF2' }) {
  const range  = max - min || 1;
  const pct    = Math.min(1, Math.max(0, (current - min) / range));
  const avgPct = Math.min(1, Math.max(0, (avg    - min) / range));
  const fillW  = `${(pct * 100).toFixed(1)}%`;
  const thumbL = `${(pct * 100).toFixed(1)}%`;
  const avgL   = `${(avgPct * 100).toFixed(1)}%`;

  return (
    <View style={styles.gaugeWrap}>
      {/* Track + fill + avg tick + thumb (no overflow:hidden on outer) */}
      <View style={styles.gaugeOuter}>
        <View style={styles.gaugeTrack}>
          <View style={[styles.gaugeFill, { width: fillW, backgroundColor: fillColor }]} />
        </View>
        {/* Average price vertical tick */}
        <View style={[styles.gaugeAvgTick, { left: avgL }]} />
        {/* Thumb dot sits outside the overflow:hidden track */}
        <View style={[styles.gaugeThumb, { left: thumbL }]} />
      </View>

    </View>
  );
}

// ─── Price Chart ───────────────────────────────────────────────────────────────

function PriceChart({ data, currentPrice, width, activeIdx, onActiveIdxChange, activePeriodLabel, labelCount = 5 }) {
  const highs   = data.map((d) => d.high);
  const lows    = data.map((d) => d.low);
  const dataMax = Math.max(...highs);
  const dataMin = Math.min(...lows);
  const range   = dataMax - dataMin || 1;
  const domMin  = dataMin - range * 0.10;
  const domMax  = dataMax + range * 0.10;

  const highPts  = buildPts(data, 'high', domMin, domMax, width);
  const lowPts   = buildPts(data, 'low',  domMin, domMax, width);
  const currentY = PAD_TOP + INNER_H * (1 - (currentPrice - domMin) / (domMax - domMin));
  const maxLineY = PAD_TOP + INNER_H * (1 - (dataMax - domMin) / (domMax - domMin));
  const minLineY = PAD_TOP + INNER_H * (1 - (dataMin - domMin) / (domMax - domMin));
  const showDots = data.length <= 30;

  // Keep refs in sync so PanResponder closures always read fresh values
  const dataRef   = useRef(data);
  const widthRef  = useRef(width);
  dataRef.current  = data;
  widthRef.current = width;

  // PanResponder: map finger pageX → nearest data index
  const chartPageX  = useRef(0);
  const viewRef     = useRef(null);

  const panResponder = useRef(
    PanResponder.create({
      // Claim touch starts so tooltip fires on tap/drag.
      // Allow parent ScrollView to steal the responder on vertical swipes via
      // onPanResponderTerminationRequest: () => true.
      onStartShouldSetPanResponder:        () => true,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder:         () => true,
      onMoveShouldSetPanResponderCapture:  () => false,
      onPanResponderTerminationRequest:    () => true,  // release on vertical scroll steal
      onPanResponderTerminate:             () => onActiveIdxChange(null),
      onPanResponderGrant: (evt) => {
        const d      = dataRef.current;
        const w      = widthRef.current;
        const relX   = evt.nativeEvent.pageX - chartPageX.current - PAD_X;
        const usable = w - PAD_X * 2;
        const idx    = Math.round((relX / usable) * (d.length - 1));
        onActiveIdxChange(Math.min(d.length - 1, Math.max(0, idx)));
      },
      onPanResponderMove: (evt) => {
        const d      = dataRef.current;
        const w      = widthRef.current;
        const relX   = evt.nativeEvent.pageX - chartPageX.current - PAD_X;
        const usable = w - PAD_X * 2;
        const idx    = Math.round((relX / usable) * (d.length - 1));
        onActiveIdxChange(Math.min(d.length - 1, Math.max(0, idx)));
      },
      onPanResponderRelease:    () => onActiveIdxChange(null),
      onPanResponderTerminate:  () => onActiveIdxChange(null),
    })
  ).current;

  const activeH    = activeIdx != null ? highPts[activeIdx] : null;
  const activeL    = activeIdx != null ? lowPts[activeIdx]  : null;
  const activeDate = activeIdx != null ? data[activeIdx].date : null;

  const tooltipX = activeH
    ? Math.min(width - TOOLTIP_W - 2, Math.max(2, activeH.x - TOOLTIP_W / 2))
    : 0;

  // Find indices of the period min (hero) and period max (context) for annotation dots
  const minLowIdx  = lows.indexOf(dataMin);
  const maxHighIdx = highs.indexOf(dataMax);
  const minLowPt   = lowPts[minLowIdx];
  const maxHighPt  = highPts[maxHighIdx];

  return (
    <View>
      {/* Chart wrapper — captures touch, stores pageX via measure */}
      <View
        ref={viewRef}
        onLayout={() => {
          viewRef.current?.measure((x, y, w, h, px) => {
            chartPageX.current = px;
          });
        }}
        {...panResponder.panHandlers}
        style={{ position: 'relative' }}
      >
        <Svg width={width} height={CHART_H}>
          {/* Current-price dashed baseline — strong dark slate */}
          <Line
            x1={0} y1={currentY} x2={width} y2={currentY}
            stroke="#475569" strokeWidth={1.5} strokeDasharray="4,4"
          />

          {/* Scrub vertical rule (drawn behind data lines) */}
          {activeH && (
            <Line
              x1={activeH.x} y1={PAD_TOP}
              x2={activeH.x} y2={CHART_H - PAD_BOTTOM}
              stroke="#CBD5E1" strokeWidth={1} strokeDasharray="3,3"
            />
          )}

          {/* High polyline — soft coral/red (context) */}
          <Polyline
            points={ptsStr(highPts)}
            fill="none" stroke="#F87171" strokeWidth={2.5}
            strokeLinejoin="round" strokeLinecap="round"
          />

          {/* Low polyline — Smart Blue HERO */}
          <Polyline
            points={ptsStr(lowPts)}
            fill="none" stroke="#2E6FF2" strokeWidth={2.5}
            strokeLinejoin="round" strokeLinecap="round"
          />

          {/* High regular dots — coral */}
          {showDots && highPts.map((p, i) => (
            i !== maxHighIdx && <Circle key={`h${i}`} cx={p.x} cy={p.y} r={2} fill="#F87171" />
          ))}

          {/* Low regular dots — blue */}
          {showDots && lowPts.map((p, i) => (
            i !== minLowIdx && <Circle key={`l${i}`} cx={p.x} cy={p.y} r={2} fill="#2E6FF2" />
          ))}

          {/* Period lowest annotation — prominent hero dot + label */}
          {minLowPt && (
            <>
              <Circle cx={minLowPt.x} cy={minLowPt.y} r={7} fill="#2E6FF2" opacity={0.15} />
              <Circle cx={minLowPt.x} cy={minLowPt.y} r={4} fill="#2E6FF2" />
              <SvgText
                x={minLowPt.x > width / 2 ? minLowPt.x - 6 : minLowPt.x + 6}
                y={minLowPt.y + 14}
                textAnchor={minLowPt.x > width / 2 ? 'end' : 'start'}
                fontSize={10} fontWeight="bold" fill="#2E6FF2"
              >
                {(activePeriodLabel ? activePeriodLabel + ' ' : '') + '최저가 ' + dataMin.toLocaleString('ko-KR')}
              </SvgText>
            </>
          )}

          {/* Period highest annotation — smaller dot + subtle label */}
          {maxHighPt && (
            <>
              <Circle cx={maxHighPt.x} cy={maxHighPt.y} r={4} fill="#F87171" />
              <SvgText
                x={maxHighPt.x > width / 2 ? maxHighPt.x - 6 : maxHighPt.x + 6}
                y={maxHighPt.y - 6}
                textAnchor={maxHighPt.x > width / 2 ? 'end' : 'start'}
                fontSize={10} fill="#F87171"
              >
                {(activePeriodLabel ? activePeriodLabel + ' ' : '') + '최고가 ' + dataMax.toLocaleString('ko-KR')}
              </SvgText>
            </>
          )}

          {/* Active enlarged dots */}
          {activeH && (
            <>
              <Circle cx={activeH.x} cy={activeH.y} r={5} fill="#F87171" />
              <Circle cx={activeL.x} cy={activeL.y} r={5} fill="#2E6FF2" />
            </>
          )}
        </Svg>

        {/* Current-price Ticker Badge — right-aligned, vertically anchored to dashed line */}
        <View style={{
          position: 'absolute', right: 0,
          top: currentY - 11,
          backgroundColor: '#334155', borderRadius: 4, overflow: 'hidden',
          paddingHorizontal: 8, paddingVertical: 4,
        }}>
          <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 11 }}>
            {'현재가 ' + currentPrice.toLocaleString('ko-KR') + '원'}
          </Text>
        </View>

        {/* Floating scrub tooltip */}
        {activeH && (
          <View style={[styles.tooltip, { left: tooltipX, top: PAD_TOP - 4 }]}>
            <Text style={styles.tooltipDate}>{activeDate}</Text>
            <View style={styles.tooltipRow}>
              <View style={[styles.tooltipSquare, { backgroundColor: '#2E6FF2' }]} />
              <Text style={styles.tooltipText}>최저가 {data[activeIdx].low.toLocaleString('ko-KR')}원</Text>
            </View>
            <View style={styles.tooltipRow}>
              <View style={[styles.tooltipSquare, { backgroundColor: '#F87171' }]} />
              <Text style={styles.tooltipText}>최고가 {data[activeIdx].high.toLocaleString('ko-KR')}원</Text>
            </View>
          </View>
        )}
      </View>

      {/* X-axis: exactly `labelCount` uniformly-spaced labels; last is always today */}
      <View style={[styles.xAxis, { position: 'relative', height: 16 }]}>
        {Array.from({ length: labelCount }, (_, k) => {
          const idx = Math.round(k * (data.length - 1) / Math.max(labelCount - 1, 1));
          const pt  = lowPts[idx] ?? highPts[idx];
          const lft = pt ? Math.max(0, pt.x - 18) : undefined;
          return (
            <Text key={k} style={[styles.xAxisLabel, { position: 'absolute', left: lft }]}>
              {data[idx]?.date}
            </Text>
          );
        })}
      </View>
    </View>
  );
}

// ─── Option Row ────────────────────────────────────────────────────────────────

function OptionRow({ option, isLast, navigation, onShowToast }) {
  const [isTracking, setIsTracking] = useState(false);
  const mockOptionItem = { name: option.title, currentPrice: option.price };

  const handleTrackingPress = () => {
    const next = !isTracking;
    setIsTracking(next);
    onShowToast(next ? '관심상품 등록 완료 (가격 추적 시작)' : '관심상품 등록 취소', next);
  };

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: isLast ? 0 : 1, borderColor: '#F3F4F6' }}>
      {/* Thumbnail + text — tappable, navigates to option PDP */}
      <TouchableOpacity
        activeOpacity={0.75}
        onPress={() => navigation.push('Detail', { item: mockOptionItem })}
        style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}
      >
        <Image
          source={{ uri: option.imageUrl }}
          style={{ width: 60, height: 60, borderRadius: 8, backgroundColor: '#F3F4F6', marginRight: 16 }}
        />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 2 }} numberOfLines={1}>
            {option.title}
          </Text>
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827' }}>
            {option.price.toLocaleString('ko-KR')}원
          </Text>
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#2E6FF2', marginTop: 1 }}>
            {option.unitType}당 {option.unitPriceValue}
          </Text>
        </View>
      </TouchableOpacity>

      {/* Tracking toggle button */}
      <TouchableOpacity
        activeOpacity={0.75}
        onPress={handleTrackingPress}
        style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: isTracking ? '#EFF6FF' : '#F3F4F6', alignItems: 'center', justifyContent: 'center', marginLeft: 10 }}
      >
        {isTracking ? <BellRing size={18} color="#2E6FF2" /> : <Bell size={18} color="#9CA3AF" />}
      </TouchableOpacity>
    </View>
  );
}

// ─── Social Proof Card ─────────────────────────────────────────────────────────

function SocialProofCard({ pricePct, currentPrice }) {
  // 4-tier dynamic CTA
  let ctaText, btnColor, btnLabel;
  if (pricePct <= 0.05) {
    ctaText  = '🎉 최근 최저가입니다! 품절 전 무조건 쟁이세요.';
    btnColor = '#ef4444';
    btnLabel = '당장 구매하기';
  } else if (pricePct <= 0.45) {
    ctaText  = '🔥 최저가에 가깝습니다. 지금 구매를 추천해요.';
    btnColor = '#ef4444';
    btnLabel = '품절 전 구매하기';
  } else if (pricePct <= 0.7) {
    ctaText  = '🤔 평균가 수준입니다. 급하지 않다면 조금 기다려보세요.';
    btnColor = '#3b82f6';
    btnLabel = '현재 가격으로 구매하기';
  } else {
    ctaText  = '🚨 가격이 비싼 편이에요. 알림을 설정하고 기다리는 걸 추천해요.';
    btnColor = '#64748b';
    btnLabel = '가격 떨어지면 알림 받기';
  }

  return (
    <View style={styles.socialCard}>
      {/* Social proof text — number highlighted */}
      <Text style={styles.socialText}>
        🔥{'  '}
        <Text style={styles.socialHighlight}>현재 124명</Text>
        {'의 육아 동지가\n이 핫딜을 지켜보고 있어요!'}
      </Text>

      {/* Dynamic tier CTA message */}
      <Text style={styles.socialCtaText}>{ctaText}</Text>

      {/* Dynamic CTA button */}
      <TouchableOpacity
        style={[styles.fomoBtn, { backgroundColor: btnColor }]}
        activeOpacity={0.82}
        onPress={() =>
          Linking.openURL('coupang://').catch(() =>
            Linking.openURL('https://m.coupang.com')
          )
        }
      >
        <Text style={styles.fomoBtnText}>{btnLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Similar Product Card ──────────────────────────────────────────────────────

function SimilarProductCard({ item }) {
  const pct = item.priceDrop
    ? Math.round((item.priceDrop / (item.currentPrice + item.priceDrop)) * 100)
    : null;

  return (
    <View style={{ width: 140, borderRadius: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: '#F3F4F6', overflow: 'hidden' }}>
      {/* Thumbnail */}
      <View style={{ width: 140, height: 110, backgroundColor: '#F9FAFB', alignItems: 'center', justifyContent: 'center', borderRadius: 8 }}>
        <Ionicons name="cube-outline" size={32} color="#CBD5E1" />
        {item.badge && (
          <View style={{ position: 'absolute', top: 6, left: 6, backgroundColor: '#2E6FF2', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 }}>
            <Text style={{ fontSize: 9, fontWeight: '700', color: '#fff' }}>{item.badge}</Text>
          </View>
        )}
      </View>
      <View style={{ padding: 8 }}>
        {item.deliveryType === 'rocket' && (
          <Text style={{ fontSize: 10, fontWeight: '700', color: '#3b82f6', marginBottom: 2 }}>로켓배송</Text>
        )}
        {item.deliveryType === 'fresh' && (
          <Text style={{ fontSize: 10, fontWeight: '700', color: '#16a34a', marginBottom: 2 }}>로켓프레시</Text>
        )}
        <Text numberOfLines={2} style={{ fontSize: 13, marginTop: 2, color: '#374151', lineHeight: 18 }}>{item.name}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'nowrap', marginTop: 4 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: '#111827' }} numberOfLines={1}>₩{item.currentPrice.toLocaleString('ko-KR')}</Text>
          {pct != null && (
            <View style={styles.simDiscountBadge}>
              <Text style={styles.simDiscountBadgeText}>▼ {pct}%</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

// ─── 5-Tier Badge Logic ────────────────────────────────────────────────────────

function getBadgeState(current, min, max, avg) {
  if (current <= min)          return { label: '최근 최저가',  bg: '#2E6FF2', color: '#FFFFFF' };
  if (current <= min * 1.05)   return { label: '최저가 근접',  bg: '#EFF6FF', color: '#2E6FF2' };
  if (current <= avg)          return { label: '평균가',       bg: '#ECFDF5', color: '#059669' };
  if (current < max)           return { label: '평균가 이상',  bg: '#F3F4F6', color: '#4B5563' };
  return                              { label: '최근 최고가',  bg: '#FEE2E2', color: '#EF4444' };
}

// ─── Delivery Tag ─────────────────────────────────────────────────────────────

function renderDeliveryTag(type) {
  if (type === 'rocket') return <Text style={{ fontSize: 13, color: '#2E6FF2', fontWeight: '800', fontStyle: 'italic' }}>로켓배송</Text>;
  if (type === 'fresh')  return <Text style={{ fontSize: 13, color: '#16A34A', fontWeight: '800', fontStyle: 'italic' }}>로켓프레시</Text>;
  return                        <Text style={{ fontSize: 13, color: '#6B7280', fontWeight: '600' }}>일반배송</Text>;
}

// ─── Screen ────────────────────────────────────────────────────────────────────

export default function DetailScreen({ route, navigation }) {
  const insets = useSafeAreaInsets();
  const { item, product, from } = route?.params || {};
  const mockItem = {
    name:          '하기스 네이처메이드 기저귀 신생아용 100매 초슬림 풀박스',
    brand:         '하기스',
    currentPrice:  28900,
    originalPrice: 52900,
    rating:        4.9,
    reviews:       2140,
    image:         'https://via.placeholder.com/400',
  };
  const displayItem = item || product || mockItem;
  const displayFrom = from || 'Ranking';

  const [timeRange,           setTimeRange]           = useState('2M');
  const [activeTooltipIdx,    setActiveTooltipIdx]    = useState(null);
  const [chartWidth,          setChartWidth]          = useState(0);
  const [showAllOptions,      setShowAllOptions]      = useState(false);
  const [alertOn,             setAlertOn]             = useState(false);
  const [isAlertModalVisible, setIsAlertModalVisible] = useState(false);
  const [showPriceInfoModal,  setShowPriceInfoModal]  = useState(false);
  const [targetPriceInput,    setTargetPriceInput]    = useState('');
  const [isSaved,             setIsSaved]             = useState(false);
  const [isTracking,          setIsTracking]          = useState(false);
  const [toastMsg,            setToastMsg]            = useState('');
  const [toastSuccess,        setToastSuccess]        = useState(true);
  const toastAnim     = useRef(new Animated.Value(0)).current;
  const toastTimer    = useRef(null);

  const showToast = useCallback((msg, isSuccess = true) => {
    // 1. Clear any pending hide timer
    if (toastTimer.current) clearTimeout(toastTimer.current);
    // 2. Stop any running animation and reset immediately
    toastAnim.stopAnimation(() => {
      toastAnim.setValue(0);
      // 3. Update message state, then animate on the next frame so React has rendered the new text
      setToastMsg(msg);
      setToastSuccess(isSuccess);
      requestAnimationFrame(() => {
        Animated.timing(toastAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
        toastTimer.current = setTimeout(() => {
          Animated.timing(toastAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start();
        }, 2000);
      });
    });
  }, [toastAnim]);

  // Selected child's name for personalized tracking text
  const [childName, setChildName] = useState('우리 아이');

  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      navigation.goBack();
      return true;
    });
    return () => backHandler.remove();
  }, [navigation]);

  useEffect(() => {
    const load = async () => {
      try {
        const uid = auth.currentUser?.uid;
        if (!uid) return;
        const userSnap = await getDoc(doc(db, 'users', uid));
        const selectedChildId = userSnap.exists() ? userSnap.data().selectedChildId ?? null : null;
        const children = await getChildrenByUserId(uid);
        const child = (selectedChildId ? children.find((c) => c.id === selectedChildId) : null) ?? children[0] ?? null;
        if (child?.name) setChildName(child.name);
      } catch (_) {}
    };
    load();
  }, []);

  // Real price data from Firebase daily_prices subcollection.
  // Stored newest-first (raw from Firestore); reversed to chronological when used.
  const [rawDailyPrices, setRawDailyPrices] = useState(null); // null = not yet loaded

  const loadDailyPrices = useCallback(async () => {
    const pid = displayItem?.productId;
    if (!pid) return;
    try {
      // Fetch up to 1 year so all time-range tabs can slice from one request.
      const result = await getMarketingAverage(pid, 365);
      if (result?.dailyPrices?.length > 0) {
        // dailyPrices is newest-first from Firestore; reverse to oldest-first for chart.
        setRawDailyPrices([...result.dailyPrices].reverse());
      }
    } catch (e) {
      console.log('[DetailScreen] daily prices fetch failed:', e);
    }
  }, [displayItem?.productId]);

  useEffect(() => { loadDailyPrices(); }, [loadDailyPrices]);

  const [isInjecting, setIsInjecting] = useState(false);

  const injectMockData = useCallback(async () => {
    const pid = displayItem?.productId;
    if (!pid) {
      Alert.alert('오류', '상품 ID가 없습니다. 관심상품에서 진입해야 합니다.');
      return;
    }
    setIsInjecting(true);
    try {
      const base     = displayItem.currentPrice || 50000;
      const today    = new Date();
      const writes   = [];

      for (let i = 59; i >= 0; i--) {
        const dt = new Date(today);
        dt.setDate(today.getDate() - i);
        const dateKey = dt.toISOString().slice(0, 10);

        // Simulate a price arc: rises to peak around day 30, then drops toward current
        const t       = i / 59;                             // 1 = oldest, 0 = today
        const arc     = t < 0.5
          ? 0.85 + (t / 0.5) * 0.30                        // rise: 0.85 → 1.15
          : 1.15 - ((t - 0.5) / 0.5) * 0.25;              // fall: 1.15 → 0.90
        const noise   = (Math.sin(i * 2.3) * 0.04 + Math.cos(i * 1.1) * 0.03);
        const midMult = Math.max(0.80, Math.min(1.30, arc + noise));

        const mid      = Math.round(base * midMult / 100) * 100;
        const spread   = Math.round(base * 0.07 / 100) * 100; // ~7% spread
        const maxPrice = mid + spread;
        const minPrice = Math.max(Math.round(base * 0.70), mid - spread);

        writes.push(
          setDoc(
            doc(db, 'products', pid, 'daily_prices', dateKey),
            { maxPrice, minPrice, date: dateKey }
          )
        );
      }

      // Write in batches of 10 to avoid overwhelming Firestore
      for (let b = 0; b < writes.length; b += 10) {
        await Promise.all(writes.slice(b, b + 10));
      }

      await loadDailyPrices();
      Alert.alert('✅ 완료', '60일치 가상 가격 데이터가 Firebase에 주입되었습니다. 차트를 확인하세요!');
    } catch (e) {
      console.error('[Injector] failed:', e);
      Alert.alert('오류', `데이터 주입 실패: ${e.message}`);
    } finally {
      setIsInjecting(false);
    }
  }, [displayItem?.productId, displayItem?.currentPrice, loadDailyPrices]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => null,
      title: '상품 상세',
    });
  }, [navigation]);

  const handleShare = () =>
    Share.share({
      message: `🔥 세이브루 핫딜! ₩${currentPrice.toLocaleString('ko-KR')} — 최근 최저가 근접 중 👉 https://m.coupang.com`,
      title: '최저가 공유',
    });

  const handleToggleSave = () => {
    const newSavedState = !isSaved;
    setIsSaved(newSavedState);
    if (newSavedState) showToast('관심 상품에 추가되었어요!');
  };

  const currentPrice  = 127600; // MOCK: expensive state (≈31% above average)
  const unitPriceText = '장당 768원';

  // Slice rawDailyPrices to the selected time range (already oldest-first).
  // Falls back to DATASETS mock when Firebase data isn't available.
  const { data, currentHigh, currentLow, currentAverage } = useMemo(() => {
    const dayLimit = RANGE_DAYS[timeRange];

    if (rawDailyPrices && rawDailyPrices.length > 0) {
      // Take the last `dayLimit` entries (the most recent N days).
      const slice = rawDailyPrices.slice(-dayLimit);
      const pts   = slice.map(toDailyPt);
      const high  = Math.max(...slice.map((r) => r.maxPrice));
      const low   = Math.min(...slice.map((r) => r.minPrice));
      const avg   = Math.round(
        slice.reduce((s, r) => s + (r.maxPrice + r.minPrice) / 2, 0) / slice.length
      );
      return { data: pts, currentHigh: high, currentLow: low, currentAverage: avg };
    }

    // Fallback: mock DATASETS — direct key mapping, all periods now have their own series
    const activeData = DATASETS[timeRange] ?? DATASETS['1M'];
    const high = Math.max(...activeData.map((d) => d.high));
    const low  = Math.min(...activeData.map((d) => d.low));
    const avg  = Math.round(
      activeData.reduce((sum, d) => sum + (d.high + d.low) / 2, 0) / activeData.length
    );
    return { data: activeData, currentHigh: high, currentLow: low, currentAverage: avg };
  }, [timeRange, rawDailyPrices]);

  // Marketing discount: how much cheaper than average (Tech Spec V7 formula).
  // Falls back to period-high comparison when no average data.
  const marketingDiscountPct = currentAverage > 0
    ? Math.round(((currentAverage - currentPrice) / currentAverage) * 100)
    : null;
  const discountPct = marketingDiscountPct ?? Math.round((1 - currentPrice / currentHigh) * 100);
  const pricePct    = currentHigh > currentLow
    ? Math.min(1, Math.max(0, (currentPrice - currentLow) / (currentHigh - currentLow)))
    : 0;
  const isCheap       = (marketingDiscountPct ?? 0) >= 0;
  const discAbs       = Math.abs(marketingDiscountPct ?? discountPct);
  const gaugeFillColor = isCheap ? '#2E6FF2' : '#EF4444';
  const isShareWorthy = currentPrice <= ALL_TIME_LOW * 1.05;

  return (
    <SafeAreaView edges={[]} style={styles.container}>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >

        {/* ── Product header (hero image + vertical pricing) ── */}
        <View style={styles.header}>
          {/* Left: product image */}
          {displayItem.image ? (
            <Image source={{ uri: displayItem.image }} style={styles.heroImage} resizeMode="cover" />
          ) : (
            <View style={[styles.heroImage, styles.heroImageFallback]}>
              <Ionicons name="cube-outline" size={44} color="#94a3b8" />
            </View>
          )}

          {/* Right: title + prices */}
          <View style={styles.headerRight}>
            {/* Delivery badge */}
            {displayItem.deliveryType === 'rocket' && (
              <Text style={styles.headerDelivery}>🚀 로켓배송</Text>
            )}

            {/* Social proof — absolute top of info column */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
              <Users size={14} color="#6B7280" />
              <Text style={{ fontSize: 13, color: '#6B7280', marginLeft: 4 }}>또래 맘 84명이 지켜보고 있어요</Text>
            </View>

            {/* Brand + Product Name */}
            {(() => {
              const fullName = displayItem.name || '상품 가격 분석';
              const brand = displayItem.brand || fullName.split(' ')[0];
              const productName = displayItem.brand ? fullName : fullName.split(' ').slice(1).join(' ') || fullName;
              return (
                <>
                  <Text style={{ fontSize: 12, color: '#6B7280', fontWeight: '700', marginBottom: 2 }}>{brand}</Text>
                  <Text style={{ fontSize: 15, color: '#111827', fontWeight: '700', lineHeight: 21 }} numberOfLines={3}>{productName}</Text>
                </>
              );
            })()}

            {/* Unit price badge */}
            <View style={styles.unitBadge}>
              <Text style={styles.unitBadgeText}>{unitPriceText}</Text>
            </View>

            {/* Current price + label + expensive % indicator */}
            <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 8 }}>
              <Text style={{ fontSize: 14, color: '#6B7280', fontWeight: '600', marginRight: 6 }}>현재가격</Text>
              <Text style={{ fontSize: 26, fontWeight: '800', color: '#111827' }}>₩127,600</Text>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#EF4444', marginLeft: 8 }}>▲ 31%</Text>
            </View>

            {/* Delivery & seller metadata */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6, marginBottom: 4 }}>
              <Text style={{ fontSize: 13, color: '#4B5563', fontWeight: '500' }}>✓ 쿠팡 인증 상품</Text>
              <View style={{ marginLeft: 8 }}>
                {renderDeliveryTag('rocket')}
              </View>
            </View>

          </View>
        </View>

        <View style={{ height: 8, backgroundColor: '#f1f5f9', width: '100%', marginTop: 0, marginBottom: 0 }} />

        {/* ── 가격 분석 section header ── */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, marginBottom: 8, paddingHorizontal: 16 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: '#111827' }}>가격 분석</Text>
          <TouchableOpacity
            onPress={() => setShowPriceInfoModal(true)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{ marginLeft: 6 }}
          >
            <Info size={14} color="#94A3B8" />
          </TouchableOpacity>
        </View>

        {/* ── CTA Recommendation Card ── */}
        <View style={[styles.ctaCard, { overflow: 'visible', marginTop: 0 }]}>
          {/* Row: title + badge + share — single forced row */}
          {(() => {
            const badge = getBadgeState(127600, 63000, 135000, currentAverage);
            return (
              <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%' }}>
                <Text style={{ flexShrink: 1, fontSize: 16, fontWeight: '800', color: '#111827' }} numberOfLines={1}>
                  평균가 대비 31% 비싸요!
                </Text>
                <View style={{ backgroundColor: badge.bg, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginLeft: 8 }}>
                  <Text style={{ color: badge.color, fontSize: 11, fontWeight: '600' }}>{badge.label}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => Share.share({ message: '지금 종근당건강 프로메가 오메가3 트리플 최근 최저가 근접! 127,600원 - 세이브루에서 확인하세요.\nhttps://saveroo.app/link/product/12345' })}
                  style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6, marginLeft: 'auto' }}
                >
                  <Share2 size={12} color="#4B5563" />
                  <Text style={{ fontSize: 11, color: '#4B5563', marginLeft: 4, fontWeight: '600' }}>지인 공유</Text>
                </TouchableOpacity>
              </View>
            );
          })()}

          <View style={styles.ctaPriceRow}>
            <Text style={styles.ctaPriceLabel}>현재가</Text>
            <Text style={styles.ctaPrice}>₩{currentPrice.toLocaleString('ko-KR')}</Text>
          </View>

          <GaugeBar
            current={127600}
            min={63000}
            max={135000}
            avg={currentAverage}
            allTimeLow={ALL_TIME_LOW}
            fillColor="#EF4444"
          />

          {/* Gauge axis: min left, max right, avg absolute */}
          {(() => {
            const range = currentHigh - currentLow || 1;
            const avgPct = Math.min(1, Math.max(0, (currentAverage - currentLow) / range));
            return (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, position: 'relative' }}>
                <View style={{ alignItems: 'flex-start' }}>
                  <Text style={{ fontSize: 12, color: '#2E6FF2', fontWeight: '600' }}>최근 최저가</Text>
                  <Text style={{ fontSize: 12, color: '#6B7280', fontWeight: '600' }}>{currentLow.toLocaleString('ko-KR')}원</Text>
                </View>
                <View style={{ position: 'absolute', left: `${(avgPct * 100).toFixed(1)}%`, alignItems: 'center', transform: [{ translateX: -28 }] }}>
                  <Text style={{ fontSize: 12, color: '#64748B', fontWeight: '600' }}>평균가</Text>
                  <Text style={{ fontSize: 12, color: '#64748B', fontWeight: '600' }}>{currentAverage.toLocaleString('ko-KR')}원</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 12, color: '#F87171', fontWeight: '600' }}>최근 최고가</Text>
                  <Text style={{ fontSize: 12, color: '#6B7280', fontWeight: '600' }}>{currentHigh.toLocaleString('ko-KR')}원</Text>
                </View>
              </View>
            );
          })()}
        </View>

        <View style={styles.sectionDivider} />

        {/* ── Chart section ── */}
        <View style={styles.chartSection}>

          {/* Chart header: title + last-updated timestamp */}
          <View style={styles.chartHeader}>
            <Text style={styles.chartHeaderTitle}>가격 추적 차트</Text>
            <Text style={styles.chartHeaderTs}>
              마지막 업데이트{' '}
              {(() => {
                const now = new Date();
                const yy  = String(now.getFullYear()).slice(-2);
                const mm  = String(now.getMonth() + 1).padStart(2, '0');
                const dd  = String(now.getDate()).padStart(2, '0');
                const hh  = String(now.getHours()).padStart(2, '0');
                const min = String(now.getMinutes()).padStart(2, '0');
                return `${yy}.${mm}.${dd} ${hh}:${min}`;
              })()}
            </Text>
          </View>

          {/* Time range pill tabs */}
          <View style={styles.timeTabs}>
            {TIME_TABS.map((tab) => (
              <TouchableOpacity
                key={tab.key}
                style={[styles.timeTab, timeRange === tab.key && styles.timeTabActive]}
                onPress={() => { setTimeRange(tab.key); setActiveTooltipIdx(null); }}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.timeTabText,
                  timeRange === tab.key && styles.timeTabTextActive,
                ]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Chart area */}
          <View
            onLayout={(e) => {
              const w = e.nativeEvent.layout.width;
              // Subtract horizontal padding (12px × 2) so SVG never exceeds inner width
              if (w > 0) setChartWidth(w - 24);
            }}
            style={styles.chartContainer}
          >
            {chartWidth > 0 && (
              <PriceChart
                key={timeRange}
                data={data}
                currentPrice={currentPrice}
                width={chartWidth}
                activeIdx={activeTooltipIdx}
                onActiveIdxChange={setActiveTooltipIdx}
                activePeriodLabel={TIME_TABS.find((t) => t.key === timeRange)?.label ?? timeRange}
                labelCount={{ '1W': 4, '1M': 5, '2M': 5, '3M': 5 }[timeRange] ?? 5}
              />
            )}
          </View>

          {/* Legend */}
          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendLine, { backgroundColor: '#2E6FF2' }]} />
              <Text style={styles.legendText}>최저가</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendLine, { backgroundColor: '#F87171' }]} />
              <Text style={styles.legendText}>최고가</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDash, { borderColor: '#64748B' }]} />
              <Text style={styles.legendText}>현재가</Text>
            </View>
          </View>
        </View>

        <View style={styles.sectionDivider} />

        {/* ── Accordion Options ── */}
        <View style={styles.sectionWrap}>
          <Text style={styles.sectionTitle}>다른 옵션 보기</Text>
          <View style={styles.optionList}>
            {(showAllOptions ? MOCK_OPTIONS : MOCK_OPTIONS.slice(0, OPTIONS_PREVIEW_COUNT)).map(
              (opt, i, arr) => (
                <OptionRow key={opt.id} option={opt} isLast={i === arr.length - 1} navigation={navigation} onShowToast={showToast} />
              )
            )}
          </View>
          {MOCK_OPTIONS.length > OPTIONS_PREVIEW_COUNT && (
            <TouchableOpacity
              style={styles.optionShowMoreBtn}
              onPress={() => setShowAllOptions((v) => !v)}
              activeOpacity={0.7}
            >
              <Text style={styles.optionShowMoreText}>
                {showAllOptions
                  ? '접기'
                  : `${MOCK_OPTIONS.length}개의 모든 옵션 보기`}
              </Text>
              <Ionicons
                name={showAllOptions ? 'chevron-up' : 'chevron-down'}
                size={14} color="#3b82f6"
              />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.sectionDivider} />

        {/* ── Similar Products ── */}
        <View style={[styles.sectionWrap, { paddingHorizontal: 0 }]}>
          <Text style={[styles.sectionTitle, { paddingHorizontal: 16 }]}>또래 맘들의 관심 유사 상품</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.simRow}
          >
            {MOCK_SIMILAR.map((sim) => (
              <SimilarProductCard key={sim.productId} item={sim} />
            ))}
          </ScrollView>
        </View>

        {/* ── Legal / Disclosure Footer ── */}
        <View style={styles.legalFooter}>
          {[
            '최근 최고/최저가는 세이브루가 수집한 기간 내의 데이터입니다.',
            '세이브루의 상품 및 가격 정보는 쇼핑몰의 실제 내용과 다를 수 있습니다. 구매 시 쇼핑몰의 실제 정보를 꼭 확인하세요.',
            '실제 상품의 내용을 확인하지 못하고 구매하여 발생한 손실, 손해에 대한 책임은 이용자 본인에게 있습니다.',
            '해당 서비스를 통해 제품 구매 시 일정액의 수수료가 제공될 수 있습니다.',
          ].map((line, i) => (
            <Text key={i} style={styles.legalLine}>• {line}</Text>
          ))}
        </View>

      </ScrollView>

      <Animated.View style={{
        position: 'absolute', bottom: 120, alignSelf: 'center',
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#2E6FF2', borderRadius: 30,
        paddingVertical: 14, paddingHorizontal: 24, zIndex: 999,
        shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 6,
        opacity: toastAnim,
        transform: [{ translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
        pointerEvents: 'none',
      }}>
        {toastSuccess
          ? <CheckCircle size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
          : <Info size={18} color="#FFFFFF" style={{ marginRight: 8 }} />}
        <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '700' }}>{toastMsg}</Text>
      </Animated.View>

      <View style={{flexDirection: 'row', alignItems: 'center', paddingTop: 12, paddingHorizontal: 16, paddingBottom: insets.bottom || 16, borderTopWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#fff'}}>
        <TouchableOpacity onPress={() => setIsTracking((v) => !v)} style={{alignItems: 'center', justifyContent: 'center', width: 60, marginRight: 8}}>
          {isTracking ? <BellRing size={22} color="#2E6FF2" /> : <Bell size={22} color="#6B7280" />}
          <Text style={{fontSize: 10, color: isTracking ? '#2E6FF2' : '#6B7280', marginTop: 4, fontWeight: isTracking ? '700' : '600'}}>{isTracking ? '추적 중' : '추적 시작'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={{flex: 1, backgroundColor: '#f97316', paddingVertical: 14, borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8}}
          onPress={() => Linking.openURL('coupang://').catch(() => Linking.openURL('https://m.coupang.com'))}
        >
          <ExternalLink color="#FFFFFF" size={18} />
          <Text style={{color: '#fff', fontSize: 16, fontWeight: 'bold'}}>쿠팡 최저가 확인하기</Text>
        </TouchableOpacity>
      </View>

      {/* ── Price Alert Bottom Sheet Modal ── */}
      <Modal
        visible={isAlertModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsAlertModalVisible(false)}
      >
        <Pressable style={styles.alertModalOverlay} onPress={() => setIsAlertModalVisible(false)}>
          {/* Top-aligned card — stops tap propagation so tapping inside doesn't dismiss */}
          <Pressable onPress={(e) => e.stopPropagation()} style={styles.alertModalSheetWrap}>

          {/* Sheet */}
          <View style={styles.alertModalSheet}>
            {/* Header */}
            <View style={styles.alertModalHeader}>
              <Text style={styles.alertModalTitle}>가격 알림 설정</Text>
              <TouchableOpacity onPress={() => setIsAlertModalVisible(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={22} color="#64748b" />
              </TouchableOpacity>
            </View>

            {/* Reassurance banner */}
            <View style={styles.alertReassuranceBanner}>
              <Text style={styles.alertReassuranceText}>
                {`원하시는 평균가 대비 할인율 가격에 알림을 드립니다! (${TIME_TABS.find(t => t.key === timeRange)?.label ?? timeRange} 기준)`}
              </Text>
            </View>

            {/* Percentage-based quick action pills — 3-column single row */}
            <View style={styles.alertQuickRow}>
              <TouchableOpacity
                style={[styles.alertQuickPill, styles.alertQuickPillPrimary]}
                activeOpacity={0.78}
                onPress={() => setTargetPriceInput(currentLow.toString())}
              >
                <Text style={[styles.alertBtnTitle, styles.alertQuickPillTextPrimary]}>최저가</Text>
                <Text style={[styles.alertBtnPrice, styles.alertQuickPillTextPrimary]}>
                  {currentLow.toLocaleString('ko-KR')}원
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.alertQuickPill, styles.alertQuickPillGray]}
                activeOpacity={0.78}
                onPress={() => setTargetPriceInput(Math.round(currentAverage * 0.95).toString())}
              >
                <Text style={styles.alertBtnTitle}>5% 할인</Text>
                <Text style={styles.alertBtnPrice}>
                  {Math.round(currentAverage * 0.95).toLocaleString('ko-KR')}원
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.alertQuickPill, styles.alertQuickPillGray]}
                activeOpacity={0.78}
                onPress={() => setTargetPriceInput(Math.round(currentAverage * 0.90).toString())}
              >
                <Text style={styles.alertBtnTitle}>10% 할인</Text>
                <Text style={styles.alertBtnPrice}>
                  {Math.round(currentAverage * 0.90).toLocaleString('ko-KR')}원
                </Text>
              </TouchableOpacity>
            </View>

            {/* Direct input — right-aligned with 원 suffix */}
            <View style={styles.alertInputRow}>
              <TextInput
                style={styles.alertInput}
                keyboardType="numeric"
                placeholder="직접 입력"
                placeholderTextColor="#cbd5e1"
                value={targetPriceInput}
                onChangeText={setTargetPriceInput}
                textAlign="right"
              />
              <Text style={styles.alertInputSuffix}>원</Text>
            </View>

            {/* Real-time helper text — discount vs currentAverage */}
            {(() => {
              const val = Number(targetPriceInput.replace(/[^0-9]/g, ''));
              if (!targetPriceInput) return null;
              if (val >= currentPrice) {
                return <Text style={styles.alertHelperError}>현재가보다 높은 가격입니다.</Text>;
              }
              const disc = Math.round((1 - val / currentAverage) * 100);
              return (
                <Text style={styles.alertHelperSuccess}>
                  평균가 대비 {disc}% 저렴한 가격이에요! ✨
                </Text>
              );
            })()}

            {/* Submit button */}
            <TouchableOpacity
              style={styles.alertSubmitBtn}
              activeOpacity={0.82}
              onPress={() => {
                setIsAlertModalVisible(false);
                Alert.alert('알림 등록 완료', '알림이 등록되었습니다.');
              }}
            >
              <Text style={styles.alertSubmitBtnText}>설정 완료</Text>
            </TouchableOpacity>
          </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Price Info Modal ── */}
      <Modal visible={showPriceInfoModal} transparent={true} animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ width: '80%', backgroundColor: '#FFFFFF', borderRadius: 16, padding: 24, alignItems: 'center' }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: '#111827', marginBottom: 12 }}>가격 분석 기준</Text>
            <Text style={{ fontSize: 14, color: '#4B5563', textAlign: 'center', lineHeight: 22, marginBottom: 24 }}>
              최근 2개월(60일)간 세이브루가 수집한 데이터를 기준으로 분석했습니다.
            </Text>
            <TouchableOpacity
              onPress={() => setShowPriceInfoModal(false)}
              style={{ width: '100%', backgroundColor: '#2E6FF2', paddingVertical: 14, borderRadius: 12, alignItems: 'center' }}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '700' }}>확인</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#f8fafc' },
  scrollContent: { paddingBottom: 8 },

  // Dev injector button
  // Legal footer
  legalFooter: {
    marginHorizontal: 16, marginTop: 4, marginBottom: 0,
    backgroundColor: '#f8fafc', borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  legalLine: {
    fontSize: 11, color: '#94a3b8', lineHeight: 17, marginBottom: 4,
  },

  devInjectorBtn: {
    margin: 16, marginTop: 24,
    backgroundColor: '#1e293b', borderRadius: 10,
    paddingVertical: 14, paddingHorizontal: 16,
    alignItems: 'center',
    borderWidth: 1, borderColor: '#334155',
  },
  devInjectorText: { fontSize: 13, fontWeight: '700', color: '#f59e0b', textAlign: 'center' },
  devInjectorSub:  { fontSize: 11, color: '#94a3b8', marginTop: 4, textAlign: 'center' },

  // Top nav bar
  topNav: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f1f5f9',
  },


  // Fallback empty state
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 15, color: '#64748b' },

  // FOMO banner — Ranking entry only
  fomoBanner: {
    marginTop: 8, marginHorizontal: 16,
    backgroundColor: '#fef2f2', padding: 10, borderRadius: 8,
    flexDirection: 'row', alignItems: 'center',
  },
  fomoBannerText: { color: '#ef4444', fontWeight: 'bold', fontSize: 13, flex: 1, lineHeight: 18 },

  // Social Proof section — Ranking entry only
  socialProofSection: {
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8, marginTop: 0, marginBottom: 0,
  },
  socialProofTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a', marginTop: 0, paddingTop: 0 },
  socialProofCard: {
    backgroundColor: '#f8fafc', borderRadius: 12, padding: 16,
  },
  socialProofText:  { fontSize: 13, lineHeight: 20, color: '#475569', fontStyle: 'italic' },

  // Product header — two-column layout
  header: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4,
  },
  heroImage: {
    width: 120, height: 120, borderRadius: 8, marginRight: 14, flexShrink: 0, marginTop: 20,
  },
  heroImageFallback: {
    backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center',
  },
  headerRight:     { flex: 1, gap: 3 },
  headerDelivery:  { fontSize: 11, fontWeight: '700', color: '#3b82f6' },
  productName:     { fontSize: 13, fontWeight: '700', color: '#0f172a', lineHeight: 19 },
  unitBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#eff6ff', borderRadius: 6,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  unitBadgeText:    { fontSize: 11, fontWeight: '700', color: '#3b82f6' },
  priceRow:         { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  currentPriceText: { fontSize: 22, fontWeight: '900', color: '#0f172a' },
  discountText:     { fontSize: 13, fontWeight: '800', color: '#ef4444' },

  // Vertical 3-price comparison list
  priceCompare:      { gap: 3, marginTop: 2 },
  priceCompareRow:   { flexDirection: 'row', alignItems: 'center', gap: 4 },
  priceCompareIcon:  { fontSize: 10, fontWeight: '900', width: 10 },
  priceCompareLabel: { fontSize: 10, color: '#94a3b8', width: 52 },
  priceCompareValue: { fontSize: 11, fontWeight: '700' },

  // CTA card
  ctaCard: {
    marginHorizontal: 16, marginBottom: 8,
    backgroundColor: '#F9FAFB', borderRadius: 16, padding: 14, gap: 4,
    borderWidth: 1, borderColor: '#E5E7EB',
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.22, shadowRadius: 10 },
      android: { elevation: 6 },
    }),
  },
  ctaTitle:      { fontSize: 15, fontWeight: '800', color: '#111827', lineHeight: 23 },
  ctaPriceRow:   { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  ctaPriceLabel: { fontSize: 13, color: '#64748b', fontWeight: '600' },
  ctaPrice:      { fontSize: 26, fontWeight: '900', color: '#111827' },

  // Gauge bar
  gaugeWrap:  { gap: 8 },
  gaugeOuter: { position: 'relative', height: 16, justifyContent: 'center' },
  gaugeTrack: {
    height: 6, borderRadius: 4, overflow: 'hidden',
    backgroundColor: '#E5E7EB',
  },
  gaugeFill:  { height: '100%', borderRadius: 4, backgroundColor: '#2E6FF2' },
  gaugeAvgTick: {
    position: 'absolute', top: '50%',
    width: 2, height: 12, borderRadius: 1,
    backgroundColor: '#94a3b8', zIndex: 1,
    transform: [{ translateY: -6 }],
  },
  gaugeThumb: {
    position: 'absolute', top: '50%',
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: '#fff', borderWidth: 2, borderColor: '#2E6FF2',
    transform: [{ translateX: -7 }, { translateY: -7 }],
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.3, shadowRadius: 2 },
      android: { elevation: 2 },
    }),
  },
  gaugeLabels:   { flexDirection: 'row', justifyContent: 'space-between' },
  gaugeLabelText: { fontSize: 10, color: '#475569' },

  // CTA card buttons
  ctaBtnPrimary: {
    alignSelf: 'stretch', alignItems: 'center',
    backgroundColor: '#ef4444', borderRadius: 12, paddingVertical: 16,
    ...Platform.select({
      ios:     { shadowColor: '#ef4444', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6 },
      android: { elevation: 4 },
    }),
  },
  ctaBtnPrimaryText: { fontSize: 15, fontWeight: '800', color: '#fff' },
  ctaBtnSecondary: {
    alignSelf: 'stretch', alignItems: 'center',
    borderRadius: 8, paddingVertical: 12, marginTop: 8,
    borderWidth: 1, borderColor: '#cbd5e1',
  },
  ctaBtnSecondaryText: { fontSize: 14, fontWeight: '600', color: '#64748b' },

  // Chart section
  chartSection: { marginHorizontal: 16 },
  chartHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 8,
  },
  chartHeaderTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  chartHeaderTs:    { fontSize: 11, color: '#94a3b8' },

  // Annotation row
  annotationRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    marginBottom: 12,
  },
  annotationItem:  { alignItems: 'center', gap: 2 },
  annotationLabel: { fontSize: 10, fontWeight: '700' },
  annotationValue: { fontSize: 11, fontWeight: '800' },

  // Time range pill tabs — subtle, auto-width
  timeTabs: {
    flexDirection: 'row', gap: 6, marginBottom: 10,
  },
  timeTab: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 16, backgroundColor: 'transparent',
    borderWidth: 1, borderColor: '#e2e8f0',
  },
  timeTabActive: { backgroundColor: '#1e293b', borderColor: '#1e293b' },
  timeTabText:   { fontSize: 12, fontWeight: '600', color: '#94a3b8' },
  timeTabTextActive: { color: '#fff' },

  // Chart container
  chartContainer: {
    backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 4,
    overflow: 'hidden',
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6 },
      android: { elevation: 2 },
    }),
  },

  // X-axis labels
  xAxis:      { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4, marginBottom: 8 },
  xAxisLabel: { fontSize: 10, color: '#94a3b8' },

  // Scrub tooltip
  tooltip: {
    position: 'absolute',
    width: TOOLTIP_W,
    backgroundColor: '#1e293b', borderRadius: 8, padding: 8, gap: 5,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.28, shadowRadius: 6 },
      android: { elevation: 6 },
    }),
  },
  tooltipDate:   { fontSize: 11, fontWeight: '700', color: '#94a3b8' },
  tooltipRow:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tooltipSquare: { width: 8, height: 8, borderRadius: 2 },
  tooltipText:   { fontSize: 12, fontWeight: '600', color: '#f1f5f9' },

  // Legend
  legend: {
    flexDirection: 'row', gap: 16, paddingVertical: 10,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendLine: { width: 16, height: 2, borderRadius: 1 },
  legendDash: {
    width: 16, height: 0,
    borderTopWidth: 2, borderStyle: 'dashed',
  },
  legendText: { fontSize: 11, color: '#64748b' },

  // ── Section wrapper ────────────────────────────────────────────────────────────
  sectionWrap:  { paddingHorizontal: 16, marginBottom: 8 },
  sectionTitle:   { fontSize: 18, fontWeight: '700', color: '#0f172a', marginBottom: 12 },
  sectionDivider: { height: 8, backgroundColor: '#f1f5f9', width: '100%', marginVertical: 8 },

  // ── Accordion options ──────────────────────────────────────────────────────────
  optionList: {
    backgroundColor: '#fff', borderRadius: 12,
    overflow: 'hidden',
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6 },
      android: { elevation: 2 },
    }),
  },
  optionRow:       { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 12 },
  optionTappable:  { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  optionRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f1f5f9' },
  optionThumb: {
    width: 60, height: 60, borderRadius: 8,
    backgroundColor: '#f1f5f9',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  optionBody:           { flex: 1, gap: 2 },
  optionTitle:          { fontSize: 13, fontWeight: '600', color: '#334155' },
  optionPriceRow:       { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'nowrap' },
  optionPrice:          { fontSize: 14, fontWeight: '800', color: '#0f172a', flexShrink: 1 },
  optionDiscountBadge:  { backgroundColor: '#fef2f2', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2, flexShrink: 0 },
  optionDiscountBadgeText: { fontSize: 11, fontWeight: '700', color: '#ef4444' },
  optionUnit:           { fontSize: 11, color: '#3b82f6', fontWeight: '600' },
  optionAddBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#eff6ff',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  optionShowMoreBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: 12,
    backgroundColor: '#f8fafc', borderRadius: 10, marginTop: 8,
    borderWidth: 1, borderColor: '#e2e8f0',
  },
  optionShowMoreText: { fontSize: 13, fontWeight: '700', color: '#3b82f6' },

  // ── Social proof card ──────────────────────────────────────────────────────────
  socialCard: {
    backgroundColor: '#fff7ed', borderRadius: 16, padding: 20,
    alignItems: 'center', gap: 16,
    borderWidth: 1, borderColor: '#fed7aa',
  },
  socialText: {
    fontSize: 15, color: '#9a3412', textAlign: 'center', lineHeight: 23,
  },
  socialHighlight: { fontSize: 17, fontWeight: '900', color: '#c2410c' },
  socialCtaText:   { fontSize: 14, fontWeight: '700', color: '#7c2d12', textAlign: 'center', lineHeight: 21 },
  fomoBtn: {
    alignSelf: 'stretch', alignItems: 'center',
    backgroundColor: '#ef4444', borderRadius: 12,
    paddingVertical: 15,
    ...Platform.select({
      ios:     { shadowColor: '#ef4444', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6 },
      android: { elevation: 4 },
    }),
  },
  fomoBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },

  // ── Similar products ───────────────────────────────────────────────────────────
  simRow: { paddingHorizontal: 16, gap: 12 },
  simCard: {
    width: 140, borderRadius: 12, backgroundColor: '#fff',
    overflow: 'hidden',
    borderWidth: 1, borderColor: '#f1f5f9',
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6 },
      android: { elevation: 2 },
    }),
  },
  simImageWrap: {
    width: '100%', aspectRatio: 1,
    backgroundColor: '#f1f5f9',
    alignItems: 'center', justifyContent: 'center',
    position: 'relative',
  },
  simBadge: {
    position: 'absolute', top: 6, left: 6,
    backgroundColor: '#ef4444', borderRadius: 4,
    paddingHorizontal: 6, paddingVertical: 3,
  },
  simBadgeText: { fontSize: 10, fontWeight: '800', color: '#fff' },
  simBody:     { padding: 8, gap: 1 },
  simSource:   { fontSize: 10, fontWeight: '700', color: '#94a3b8' },
  simDelivery: { fontSize: 10, fontWeight: '700', color: '#3b82f6', marginBottom: 1 },
  simName:     { fontSize: 12, fontWeight: '600', color: '#334155', lineHeight: 16, marginBottom: 4 },
  simPriceRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'nowrap' },
  simPrice:    { fontSize: 13, fontWeight: '800', color: '#0f172a', flexShrink: 1 },
  simDiscountBadge: {
    flexShrink: 0,
    backgroundColor: '#ef4444', borderRadius: 4,
    paddingHorizontal: 5, paddingVertical: 2,
  },
  simDiscountBadgeText: { fontSize: 11, fontWeight: '800', color: '#fff' },

  // ── Toast ─────────────────────────────────────────────────────────────────────
  toastBox: {
    position: 'absolute', bottom: 100, alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.8)', paddingHorizontal: 18, paddingVertical: 12,
    borderRadius: 8, zIndex: 999,
  },
  toastText: { color: '#fff', fontSize: 13, fontWeight: '600' },

  // ── Bottom sticky action bar ───────────────────────────────────────────────────
  stickyBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12, paddingBottom: Platform.OS === 'ios' ? 28 : 12,
    backgroundColor: '#fff',
    borderTopWidth: 1, borderTopColor: '#f1f5f9',
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.06, shadowRadius: 6 },
      android: { elevation: 8 },
    }),
  },
  stickyAlertBtn: {
    width: 60, alignItems: 'center', justifyContent: 'center', gap: 3,
  },
  stickyAlertText: { fontSize: 10, fontWeight: '600', color: '#64748b' },
  stickySolidBtn: {
    flex: 1, marginLeft: 16, paddingVertical: 14, borderRadius: 8, alignItems: 'center',
    backgroundColor: '#f97316',
    ...Platform.select({
      ios:     { shadowColor: '#f97316', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6 },
      android: { elevation: 3 },
    }),
  },
  stickySolidBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },

  // ── Price alert modal ─────────────────────────────────────────────────────────
  alertModalOverlay: {
    flex: 1, justifyContent: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingTop: 80, paddingHorizontal: 16,
  },
  alertModalSheetWrap: { width: '100%' },
  alertModalSheet: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 24,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12 },
      android: { elevation: 12 },
    }),
  },
  alertModalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 20,
  },
  alertModalTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a' },

  // Reassurance banner
  alertReassuranceBanner: {
    backgroundColor: '#f1f5f9', padding: 12, borderRadius: 8, marginBottom: 16,
  },
  alertReassuranceText: { fontSize: 13, fontWeight: '600', color: '#475569', lineHeight: 19 },

  // Quick action pills row — 3-column, no wrap
  alertQuickRow: { flexDirection: 'row', gap: 8, marginBottom: 24 },
  alertQuickPill: {
    flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  alertQuickPillPrimary:     { borderColor: '#3b82f6', backgroundColor: '#eff6ff' },
  alertQuickPillGray:        { borderColor: '#e2e8f0', backgroundColor: '#f8fafc' },
  alertQuickPillText:        { fontSize: 12, fontWeight: '600', color: '#64748b' },
  alertQuickPillTextPrimary: { color: '#1d4ed8' },
  alertBtnTitle: { fontSize: 13, fontWeight: '600', color: '#64748b', marginBottom: 4 },
  alertBtnPrice: { fontSize: 12, color: '#64748b' },

  // Input
  alertInputRow: {
    flexDirection: 'row', alignItems: 'center',
    borderBottomWidth: 2, borderColor: '#3b82f6',
    marginTop: 20, marginBottom: 6, paddingBottom: 8,
  },
  alertInput: {
    flex: 1, fontSize: 24, fontWeight: '800', color: '#0f172a', padding: 0,
    textAlign: 'right',
  },
  alertInputSuffix: { fontSize: 24, fontWeight: '800', color: '#0f172a', marginLeft: 4 },

  // Helper text
  alertHelperError:   { fontSize: 13, color: '#ef4444', fontWeight: '600', marginTop: 6 },
  alertHelperSuccess: { fontSize: 13, color: '#22c55e', fontWeight: '700', marginTop: 6 },

  // Submit button
  alertSubmitBtn: {
    marginTop: 24, backgroundColor: '#3b82f6', borderRadius: 12,
    paddingVertical: 16, alignItems: 'center',
    ...Platform.select({
      ios:     { shadowColor: '#3b82f6', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6 },
      android: { elevation: 4 },
    }),
  },
  alertSubmitBtnText: { fontSize: 16, fontWeight: '800', color: '#fff' },
});
