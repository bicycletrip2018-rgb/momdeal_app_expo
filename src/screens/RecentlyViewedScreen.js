import React from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Info } from 'lucide-react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

function ImagePlaceholderIcon({ size = 24, color = '#cbd5e1' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="3" y="3" width="18" height="18" rx="2" stroke={color} strokeWidth={1.6} />
      <Circle cx="8.5" cy="8.5" r="1.5" stroke={color} strokeWidth={1.6} />
      <Path d="M21 15l-5-5L5 21" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

const DUMMY_RECENTLY_VIEWED = [
  { id: 'rv1', brand: '하기스',      name: '네이처메이드 3단계 기저귀 특대형 96매',    origPrice: 42900,  currentPrice: 32175  },
  { id: 'rv2', brand: '매일유업',    name: '앱솔루트 명작 3단계 분유 800g × 2캔',      origPrice: 38500,  currentPrice: 31570  },
  { id: 'rv3', brand: '베베숲',      name: '아쿠아 물티슈 100매 6팩 무향 저자극',       origPrice: 16900,  currentPrice: 11830  },
  { id: 'rv4', brand: '다이치',      name: '듀얼핏 360 회전형 카시트 신생아~4세',      origPrice: 429000, currentPrice: 317460 },
  { id: 'rv5', brand: '피셔프라이스', name: '소리나는 멀티활동 점퍼루 4-in-1 바운서',   origPrice: 199000, currentPrice: 214500 },
  { id: 'rv6', brand: '레고 듀플로', name: '클래식 기본 벽돌 세트 38피스 (1.5~5세)', origPrice: 38000,  currentPrice: 28120  },
];

function calcIndicator(currentPrice, origPrice) {
  if (!origPrice || !currentPrice || origPrice === currentPrice) return null;
  const pct = Math.round(Math.abs((origPrice - currentPrice) / origPrice) * 100);
  if (currentPrice < origPrice) return { arrow: '▼', pct, color: '#2E6FF2' };
  return { arrow: '▲', pct, color: '#ef4444' };
}

function ProductCard({ item, onPress }) {
  const indicator = calcIndicator(item.currentPrice, item.origPrice);
  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.75} onPress={onPress}>
      <View style={styles.thumb}>
        <ImagePlaceholderIcon size={28} color="#cbd5e1" />
      </View>
      <View style={styles.info}>
        <Text style={styles.brand}>{item.brand}</Text>
        <Text style={styles.name} numberOfLines={2}>{item.name}</Text>
        <View style={styles.priceRow}>
          {indicator && (
            <Text style={[styles.indicator, { color: indicator.color }]}>
              {indicator.arrow} {indicator.pct}%
            </Text>
          )}
          <Text style={styles.currentPrice}>{(item.currentPrice ?? 0).toLocaleString()}원</Text>
          {item.origPrice > 0 && item.origPrice !== item.currentPrice && (
            <Text style={styles.origPrice}>{item.origPrice.toLocaleString()}원</Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function RecentlyViewedScreen({ route, navigation }) {
  const insets   = useSafeAreaInsets();
  const passed   = route?.params?.products;
  const products = Array.isArray(passed) && passed.length > 0 ? passed : DUMMY_RECENTLY_VIEWED;

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <View style={styles.infoBanner}>
        <Info size={16} color="#64748b" strokeWidth={2} />
        <Text style={styles.infoBannerText}>
          최근 3일간 열람한 상품입니다 (총 {products.length}개)
        </Text>
      </View>
      <FlatList
        data={products}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        renderItem={({ item }) => (
          <ProductCard
            item={item}
            onPress={() => navigation.navigate('Detail', { item })}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },

  infoBanner: {
    backgroundColor: '#F8FAFC', borderRadius: 8, padding: 12,
    marginHorizontal: 16, marginTop: 12, marginBottom: 4,
    flexDirection: 'row', alignItems: 'center',
  },
  infoBannerText: { fontSize: 13, fontWeight: '600', color: '#475569', marginLeft: 6 },

  list: { paddingTop: 4, paddingBottom: 8 },
  sep:  { height: 1, backgroundColor: '#f1f5f9', marginLeft: 102 },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  thumb: {
    width: 66,
    height: 66,
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  info:  { flex: 1, gap: 3 },
  brand: { fontSize: 11, fontWeight: '600', color: '#94a3b8' },
  name:  { fontSize: 13, fontWeight: '600', color: '#0f172a', lineHeight: 18 },

  priceRow:     { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 6, marginTop: 3 },
  indicator:    { fontSize: 12, fontWeight: '800' },
  currentPrice: { fontSize: 14, fontWeight: '800', color: '#0f172a' },
  origPrice:    { fontSize: 11, color: '#94a3b8', textDecorationLine: 'line-through' },
});
