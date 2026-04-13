import React from 'react';
import {
  Image,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  Vibration,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Returns the best available discount percentage for display.
// Priority: marketingDiscountPct (Tech Spec V7) > static priceDrop fallback.
// Positive = discount (price below average), negative = price above average.
// Returns null when no signal is available.
function resolveDiscountPct(item) {
  if (typeof item.marketingDiscountPct === 'number' && item.marketingDiscountPct !== 0) {
    return item.marketingDiscountPct;
  }
  const orig = (item.currentPrice || 0) + (item.priceDrop || 0);
  if (!item.priceDrop || !orig) return null;
  return Math.round((item.priceDrop / orig) * 100);
}

// ─── StatusBadge ──────────────────────────────────────────────────────────────
// Grid variant: circular overlay (no text). List variant: pill with icon + label.

function StatusBadge({ iconName, iconColor, bgColor, text }) {
  if (text) {
    return (
      <View style={[styles.statusPill, { backgroundColor: bgColor }]}>
        <Ionicons name={iconName} size={9} color={iconColor} />
        <Text style={[styles.statusPillText, { color: iconColor }]}>{text}</Text>
      </View>
    );
  }
  return (
    <View style={[styles.statusCircle, { backgroundColor: bgColor }]}>
      <Ionicons name={iconName} size={10} color={iconColor} />
    </View>
  );
}

// ─── GridStatusOverlay ────────────────────────────────────────────────────────
// All active badges in a single top-right row.

function GridStatusOverlay({ item }) {
  const hasAny = item.isFavorite || item.isPriceAlertOn || item.isRestockAlertOn;
  if (!hasAny) return null;
  return (
    <View style={styles.statusBadgeRow}>
      {item.isFavorite && (
        <StatusBadge iconName="star" iconColor="#f59e0b" bgColor="rgba(255,255,255,0.92)" />
      )}
      {item.isPriceAlertOn && (
        <StatusBadge iconName="notifications" iconColor="#fff" bgColor="rgba(59,130,246,0.85)" />
      )}
      {item.isRestockAlertOn && (
        <StatusBadge iconName="cube" iconColor="#fff" bgColor="rgba(16,163,74,0.85)" />
      )}
    </View>
  );
}

// ─── TargetPriceBar ───────────────────────────────────────────────────────────
// Shown only when item.targetPrice is set.

function TargetPriceBar({ currentPrice, targetPrice }) {
  if (!targetPrice || !currentPrice) return null;

  const reached = currentPrice <= targetPrice;
  // fillPct: how far along toward the target (capped at 100)
  const fillPct = Math.min(100, (targetPrice / currentPrice) * 100);
  const diff    = currentPrice - targetPrice;

  return (
    <View style={styles.targetWrap}>
      <View style={styles.targetHeader}>
        <Text style={styles.targetLabel}>
          목표가 ₩{targetPrice.toLocaleString('ko-KR')}
        </Text>
        {reached ? (
          <Text style={styles.targetReached}>🔥 목표가 도달!</Text>
        ) : (
          <Text style={styles.targetGap}>{diff.toLocaleString('ko-KR')}원 남음</Text>
        )}
      </View>
      <View style={styles.targetTrack}>
        <View style={[
          styles.targetFill,
          { width: `${fillPct}%`, backgroundColor: reached ? '#ef4444' : '#3b82f6' },
        ]} />
      </View>
    </View>
  );
}

// ─── DeliveryBadge ────────────────────────────────────────────────────────────

function DeliveryBadge({ deliveryType }) {
  if (deliveryType === 'rocket') {
    return <Text style={[styles.deliveryBadge, { color: '#3b82f6' }]}>🚀 로켓배송</Text>;
  }
  if (deliveryType === 'fresh') {
    return <Text style={[styles.deliveryBadge, { color: '#16a34a' }]}>🌿 로켓프레시</Text>;
  }
  return null;
}

// ─── TrackingCard ─────────────────────────────────────────────────────────────

export function TrackingCard({
  item,
  isEditMode,
  isSelected,
  viewMode,
  onRemove,
  onToggleSelect,
  onLongPressActivate,
  onPress,
}) {
  const pct       = resolveDiscountPct(item);
  const orig      = (item.currentPrice || 0) + (item.priceDrop || 0);
  const itemId    = item.productId ?? item.savedId;
  const isList    = viewMode === 'list';
  const isCompact = viewMode === 'grid3';

  const handlePress = () => {
    if (isEditMode) { onToggleSelect(itemId); } else { onPress?.(); }
  };
  const handleLongPress = () => {
    if (!isEditMode) { Vibration.vibrate(50); onLongPressActivate(itemId); }
  };

  if (isList) {
    return (
      <TouchableOpacity
        style={[styles.listCard, isSelected && styles.cardSelected]}
        onPress={handlePress}
        onLongPress={handleLongPress}
        delayLongPress={350}
        activeOpacity={isEditMode ? 0.7 : 0.85}
      >
        <View style={styles.listImageWrap}>
          {item.image ? (
            <Image source={{ uri: item.image }} style={styles.listImage} resizeMode="cover" />
          ) : (
            <View style={[styles.listImage, styles.imageFallback]}>
              <Text style={{ fontSize: 22 }}>🛍️</Text>
            </View>
          )}
          {isEditMode && (
            <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
              {isSelected && <Text style={styles.checkboxMark}>✓</Text>}
            </View>
          )}
        </View>

        <View style={styles.listBody}>
          <Text style={styles.sourceBadge}>C 쿠팡</Text>
          <DeliveryBadge deliveryType={item.deliveryType} />
          {(item.isFavorite || item.isPriceAlertOn || item.isRestockAlertOn) && (
            <View style={styles.listStatusRow}>
              {item.isFavorite && (
                <StatusBadge iconName="star" iconColor="#f59e0b" bgColor="rgba(245,158,11,0.12)" text="즐겨찾기" />
              )}
              {item.isPriceAlertOn && (
                <StatusBadge iconName="notifications" iconColor="#3b82f6" bgColor="rgba(59,130,246,0.1)" text="가격 알림" />
              )}
              {item.isRestockAlertOn && (
                <StatusBadge iconName="cube" iconColor="#16a34a" bgColor="rgba(16,163,74,0.1)" text="재입고" />
              )}
            </View>
          )}
          <Text style={styles.name} numberOfLines={2}>{item.name || '상품'}</Text>
          <View style={styles.priceRow}>
            {item.priceDrop > 0 && orig > 0 && (
              <Text style={styles.origPrice}>₩{orig.toLocaleString('ko-KR')}</Text>
            )}
            <Text style={styles.currentPrice}>
              {typeof item.currentPrice === 'number' && item.currentPrice > 0
                ? `₩${item.currentPrice.toLocaleString('ko-KR')}` : '—'}
            </Text>
            {pct != null && pct !== 0 && (
              <Text style={[styles.trendBadge, pct < 0 && styles.trendBadgeUp]}>
                {pct > 0 ? `▼ ${pct}%` : `▲ ${Math.abs(pct)}%`}
              </Text>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  // Compact grid card (3-column)
  if (isCompact) {
    return (
      <TouchableOpacity
        style={[styles.compactCard, isSelected && styles.cardSelected]}
        onPress={handlePress}
        onLongPress={handleLongPress}
        delayLongPress={350}
        activeOpacity={isEditMode ? 0.7 : 0.85}
      >
        <View style={styles.compactImageWrap}>
          {item.image ? (
            <Image source={{ uri: item.image }} style={styles.image} resizeMode="cover" />
          ) : (
            <View style={[styles.image, styles.imageFallback]}>
              <Text style={{ fontSize: 20 }}>🛍️</Text>
            </View>
          )}
          {/* Discount badge — bottom-left */}
          {pct != null && pct !== 0 && (
            <View style={[styles.compactDiscountBadge, pct < 0 && styles.compactDiscountBadgeUp]}>
              <Text style={styles.compactDiscountText}>
                {pct > 0 ? `▼${pct}%` : `▲${Math.abs(pct)}%`}
              </Text>
            </View>
          )}
          {/* Status icon row — top-right */}
          {(item.isFavorite || item.isPriceAlertOn || item.isRestockAlertOn) && (
            <View style={styles.compactStatusRow}>
              {item.isFavorite     && <Ionicons name="star"          size={10} color="#f59e0b" />}
              {item.isPriceAlertOn && <Ionicons name="notifications" size={10} color="#3b82f6" />}
              {item.isRestockAlertOn && <Ionicons name="cube"        size={10} color="#10b981" />}
            </View>
          )}
          {isEditMode && (
            <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
              {isSelected && <Text style={styles.checkboxMark}>✓</Text>}
            </View>
          )}
        </View>
        <View style={styles.compactBody}>
          {item.isRocket && <Text style={styles.compactRocket}>🚀</Text>}
          <Text style={styles.compactName} numberOfLines={2}>{item.name || '상품'}</Text>
          <Text style={styles.compactPrice}>
            {typeof item.currentPrice === 'number' && item.currentPrice > 0
              ? `₩${item.currentPrice.toLocaleString('ko-KR')}` : '—'}
          </Text>
        </View>
      </TouchableOpacity>
    );
  }

  // Standard grid card (2-column)
  return (
    <TouchableOpacity
      style={[styles.gridCard, isSelected && styles.cardSelected]}
      onPress={handlePress}
      onLongPress={handleLongPress}
      delayLongPress={350}
      activeOpacity={isEditMode ? 0.7 : 0.85}
    >
      <View style={styles.imageWrap}>
        {item.image ? (
          <Image source={{ uri: item.image }} style={styles.image} resizeMode="cover" />
        ) : (
          <View style={[styles.image, styles.imageFallback]}>
            <Text style={{ fontSize: 32 }}>🛍️</Text>
          </View>
        )}
        <GridStatusOverlay item={item} />
        {isEditMode && (
          <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
            {isSelected && <Text style={styles.checkboxMark}>✓</Text>}
          </View>
        )}
      </View>

      <View style={styles.body}>
        <Text style={styles.sourceBadge}>C 쿠팡</Text>
        <DeliveryBadge deliveryType={item.deliveryType} />
        <Text style={styles.name} numberOfLines={2}>{item.name || '상품'}</Text>
        <View style={styles.priceRow}>
          {item.priceDrop > 0 && orig > 0 && (
            <Text style={styles.origPrice}>₩{orig.toLocaleString('ko-KR')}</Text>
          )}
          <Text style={styles.currentPrice}>
            {typeof item.currentPrice === 'number' && item.currentPrice > 0
              ? `₩${item.currentPrice.toLocaleString('ko-KR')}` : '—'}
          </Text>
        </View>
        {pct != null && pct !== 0 && (
          <Text style={[styles.trendBadge, pct < 0 && styles.trendBadgeUp]}>
            {pct > 0 ? `▼ ${pct}%` : `▲ ${Math.abs(pct)}%`}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Grid card
  gridCard: {
    width: '48%', borderRadius: 12, backgroundColor: '#fff',
    borderWidth: 1, borderColor: '#f1f5f9', overflow: 'hidden',
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 6 },
      android: { elevation: 2 },
    }),
  },
  imageWrap:     { width: '100%', aspectRatio: 1.2, backgroundColor: '#f1f5f9' },
  image:         { width: '100%', height: '100%' },
  imageFallback: { alignItems: 'center', justifyContent: 'center' },
  body:          { padding: 8 },

  // List card
  listCard: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 8,
    marginBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f1f5f9',
    backgroundColor: '#fff',
  },
  listImageWrap: { width: 80, height: 80, borderRadius: 10, overflow: 'hidden', backgroundColor: '#f1f5f9', flexShrink: 0 },
  listImage:     { width: '100%', height: '100%' },
  listBody:      { flex: 1, marginLeft: 10 },
  listStatusRow: { flexDirection: 'row', gap: 4, flexWrap: 'wrap', marginBottom: 2 },

  cardSelected: { borderColor: '#3b82f6', borderWidth: 2, opacity: 0.92 },

  // StatusBadge: grid circular variant
  statusCircle: {
    width: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  // StatusBadge: list pill variant
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2,
  },
  statusPillText: { fontSize: 10, fontWeight: '700' },

  // GridStatusOverlay: top-right badge row
  statusBadgeRow: {
    position: 'absolute', top: 8, right: 8,
    flexDirection: 'row', gap: 4,
  },

  // Delivery badge
  deliveryBadge: { fontSize: 11, fontWeight: '700', marginBottom: 3 },

  // Checkbox (edit mode)
  checkbox: {
    position: 'absolute', top: 8, left: 8,
    width: 24, height: 24, borderRadius: 12,
    borderWidth: 2, borderColor: '#fff',
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxSelected: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  checkboxMark:     { fontSize: 13, color: '#fff', fontWeight: '900', lineHeight: 15 },

  // Target price progress bar
  targetWrap: {
    backgroundColor: '#f8fafc', padding: 10, borderRadius: 8, marginTop: 10,
  },
  targetHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  targetLabel:   { fontSize: 11, fontWeight: '600', color: '#475569' },
  targetReached: { fontSize: 11, fontWeight: '700', color: '#ef4444' },
  targetGap:     { fontSize: 11, color: '#64748b' },
  targetTrack: {
    height: 6, backgroundColor: '#e2e8f0', borderRadius: 3, marginTop: 8, overflow: 'hidden',
  },
  targetFill:    { height: '100%', borderRadius: 3 },

  // Compact card (grid3 — 3-column)
  compactCard: {
    width: '31%', borderRadius: 8, backgroundColor: '#fff',
    borderWidth: 1, borderColor: '#f1f5f9', overflow: 'hidden',
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3 },
      android: { elevation: 1 },
    }),
  },
  compactImageWrap: { width: '100%', aspectRatio: 1, backgroundColor: '#f1f5f9' },
  compactBody:      { paddingHorizontal: 5, paddingVertical: 4 },
  compactName:      { fontSize: 11, fontWeight: '600', color: '#334155', lineHeight: 15, marginBottom: 2 },
  compactPrice:     { fontSize: 12, fontWeight: '800', color: '#0f172a' },
  compactRocket:    { fontSize: 9, marginBottom: 1 },
  compactDiscountBadge: {
    position: 'absolute', bottom: 4, left: 4,
    backgroundColor: 'rgba(59,130,246,0.88)',
    borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1,
  },
  compactDiscountText:    { fontSize: 9, fontWeight: '800', color: '#fff' },
  compactDiscountBadgeUp: { backgroundColor: 'rgba(239,68,68,0.88)' },
  compactStatusRow: {
    position: 'absolute', top: 4, right: 4,
    flexDirection: 'row', gap: 2,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: 6, paddingHorizontal: 3, paddingVertical: 2,
  },

  // Shared body typography
  sourceBadge:  { fontSize: 10, fontWeight: '700', color: '#64748b', marginBottom: 2 },
  name:         { fontSize: 13, fontWeight: '600', color: '#334155', lineHeight: 18, marginBottom: 4 },
  priceRow:     { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  origPrice:    { fontSize: 11, color: '#cbd5e1', textDecorationLine: 'line-through' },
  currentPrice: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  trendBadge:    { fontSize: 12, fontWeight: '800', color: '#3b82f6', marginTop: 2 },
  trendBadgeUp:  { color: '#ef4444' },
});
