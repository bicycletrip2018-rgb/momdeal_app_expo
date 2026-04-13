import React, { useCallback, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';

// ─── Dummy data ───────────────────────────────────────────────────────────────

const DIAPER_ITEMS = [
  { id: 'd1', brand: '팸퍼스',   name: '하이드로케어 기저귀 특대형 5단계 88매',  price: 30500, originalPrice: 46900, discount: 35, unitPrice: '장당 346원' },
  { id: 'd2', brand: '하기스',   name: '네이처메이드 기저귀 신생아 100매 초슬림', price: 28900, originalPrice: 52900, discount: 45, unitPrice: '장당 289원' },
  { id: 'd3', brand: '마미포코', name: '팬티기저귀 점보 XL 56매',               price: 19900, originalPrice: 29900, discount: 33, unitPrice: '장당 355원' },
  { id: 'd4', brand: '보솜이',   name: '순면 밴드형 기저귀 소형 80매',           price: 15900, originalPrice: 22900, discount: 31, unitPrice: '장당 199원' },
];

const FORMULA_ITEMS = [
  { id: 'f1', brand: '압타밀',     name: '압타밀 프로푸트라 1단계 800g',         price: 42000, originalPrice: 58000, discount: 28, unitPrice: '100g당 5,250원' },
  { id: 'f2', brand: '매일유업',   name: '앱솔루트 명작 2단계 800g × 2캔',       price: 39800, originalPrice: 62000, discount: 36, unitPrice: '100g당 2,488원' },
  { id: 'f3', brand: '남양유업',   name: '아이엠마더 3단계 800g',                price: 34500, originalPrice: 48000, discount: 28, unitPrice: '100g당 4,313원' },
  { id: 'f4', brand: '일동후디스', name: '산양분유 프리미엄 1단계 800g',          price: 48000, originalPrice: 68000, discount: 29, unitPrice: '100g당 6,000원' },
];

// ✨추천 badges removed per PM feedback — size chips are plain toggles
const RECOMMENDED_CHIPS = new Set();

const DETAIL_FILTERS = {
  diaper: [
    { section: '배송 형태',     chips: ['🚀 로켓배송', '📦 일반배송'] },
    { section: '브랜드',        chips: ['하기스', '팸퍼스', '마미포코', '페넬로페', '킨도', '군', '보솜이', '리베로', '네이쳐러브메레', '슈퍼대디', '모모래빗', '애플크럼비'] },
    { section: '형태',          chips: ['밴드형', '팬티형', '일자형'] },
    { section: '사이즈',        chips: ['1단계', '2단계', '3단계', '4단계', '5단계', '6단계', '7단계', '8단계'] },
  ],
  formula: [
    { section: '배송 형태',     chips: ['🚀 로켓배송', '📦 일반배송'] },
    { section: '브랜드',        chips: ['압타밀', '힙(Hipp)', '매일유업', '남양유업', '일동후디스', '파스퇴르', '노발락', '퓨어락', '일루마'] },
    { section: '성분/특징',     chips: ['일반분유', '산양분유', '특수/센서티브'] },
    { section: '원산지',        chips: ['국내', '해외'] },
    { section: '단계',          chips: ['프레(Pre)', '1단계', '2단계', '3단계', '4단계'] },
    { section: '형태',          chips: ['분말', '액상', '스틱'] },
  ],
};

// ─── Product Row ──────────────────────────────────────────────────────────────

function ProductRow({ item, onPress }) {
  return (
    <TouchableOpacity style={styles.productRow} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.productThumb} />
      <View style={styles.productInfo}>
        <Text style={styles.productBrand}>{item.brand}</Text>
        <Text style={styles.productName} numberOfLines={2}>{item.name}</Text>
        <View style={styles.priceRow}>
          <Text style={styles.productPrice}>₩{item.price.toLocaleString('ko-KR')}</Text>
          <View style={styles.discountBadge}>
            <Text style={styles.discountText}>{item.discount}%↓</Text>
          </View>
          {item.unitPrice && (
            <Text style={styles.unitPrice}>{item.unitPrice}</Text>
          )}
        </View>
        <Text style={styles.origPrice}>₩{item.originalPrice.toLocaleString('ko-KR')}</Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function CategoryScreen({ navigation }) {
  const [activeTab,       setActiveTab]       = useState('diaper');
  const [isFilterVisible, setIsFilterVisible] = useState(false);
  const [isSortOpen,      setIsSortOpen]      = useState(false);
  const [sortLabel,       setSortLabel]       = useState('할인율순');
  // PM Logic Rule: Selecting multiple items across different filter groups (e.g., '역대 최저가' AND '67개월 인기') acts as a strict AND condition. Multiple selections within the same group (e.g., '하기스' OR '팸퍼스') acts as an OR condition.
  const [selected,        setSelected]        = useState({});

  const isFormula = activeTab === 'formula';
  const items     = isFormula ? FORMULA_ITEMS : DIAPER_ITEMS;

  function handleTabChange(tab) {
    setActiveTab(tab);
    setSelected({});
  }

  function toggleChip(chip) {
    setSelected((prev) => ({ ...prev, [chip]: !prev[chip] }));
  }

  function resetFilters() {
    setSelected({});
  }

  const selectedCount = Object.values(selected).filter(Boolean).length;

  useFocusEffect(
    useCallback(() => {
      return () => setIsSortOpen(false);
    }, [])
  );

  return (
    <View style={styles.root}>

      {/* ── Custom Top Tab Bar ── */}
      <View style={styles.topTabBar}>
        {['diaper', 'formula'].map((tab) => {
          const isActive = activeTab === tab;
          return (
            <TouchableOpacity
              key={tab}
              style={[styles.topTab, isActive && styles.topTabActive]}
              onPress={() => handleTabChange(tab)}
              activeOpacity={0.8}
            >
              <Text style={[styles.topTabText, isActive && styles.topTabTextActive]}>
                {tab === 'diaper' ? '기저귀' : '분유'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Sort / Count Header (+ Detail Filter button) ── */}
      <View style={styles.sortRow}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={styles.itemCount}>전체 {items.length * 31}개</Text>
          <View style={{ position: 'relative', marginLeft: 16, zIndex: 20 }}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setIsSortOpen((v) => !v)}
              style={{ flexDirection: 'row', alignItems: 'center' }}
            >
              <Text style={styles.sortLabel}>{sortLabel}</Text>
              <Ionicons name="chevron-down" size={18} color="#0f172a" style={{ marginLeft: 4 }} />
            </TouchableOpacity>
            {isSortOpen && (
              <View style={styles.sortDropdown}>
                {['할인율순', '낮은 가격순', '역대 최저가순', '노을이 또래 인기순'].map((opt) => (
                  <TouchableOpacity
                    key={opt}
                    style={styles.sortDropdownItem}
                    onPress={() => { setSortLabel(opt); setIsSortOpen(false); }}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.sortDropdownText, sortLabel === opt && styles.sortDropdownTextActive]}>
                      {opt}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        </View>
        <TouchableOpacity
            style={[styles.detailFilterBtn, selectedCount > 0 && styles.detailFilterBtnActive]}
            onPress={() => setIsFilterVisible(true)}
            activeOpacity={0.85}
          >
            <Ionicons name="options-outline" size={15} color={selectedCount > 0 ? '#2563eb' : '#475569'} />
            <Text style={[styles.detailFilterText, selectedCount > 0 && styles.detailFilterTextActive]}>
              상세 필터{selectedCount > 0 ? ` (${selectedCount})` : ''}
            </Text>
          </TouchableOpacity>
      </View>

      {/* ── Sort backdrop: closes dropdown when tapping outside ── */}
      {isSortOpen && (
        <Pressable
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10 }}
          onPress={() => setIsSortOpen(false)}
        />
      )}

      {/* ── Product List ── */}
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ProductRow
            item={item}
            onPress={() => navigation.navigate('ProductDetail', { productId: item.id, productName: item.name })}
          />
        )}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />

      {/* ── Bottom Sheet Modal ── */}
      <Modal
        visible={isFilterVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setIsFilterVisible(false)}
      >
        {/* Backdrop */}
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={() => setIsFilterVisible(false)}
        />

        {/* Sheet */}
        <View style={styles.sheet}>
          {/* Sheet header */}
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>필터</Text>
            <TouchableOpacity
              onPress={() => setIsFilterVisible(false)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={22} color="#334155" />
            </TouchableOpacity>
          </View>

          {/* Filter groups */}
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetBody}>
            {DETAIL_FILTERS[activeTab].map(({ section, chips }) => (
              <View key={section} style={styles.filterGroup}>
                <Text style={styles.filterGroupTitle}>{section}</Text>
                <View style={styles.chipWrap}>
                  {chips.map((chip) => {
                    const isActive = !!selected[chip];
                    return (
                      <TouchableOpacity
                        key={chip}
                        style={[styles.filterChip, isActive && styles.filterChipActive]}
                        onPress={() => toggleChip(chip)}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>{chip}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))}
          </ScrollView>

          {/* Sticky footer */}
          <View style={styles.sheetFooter}>
            <TouchableOpacity style={styles.resetBtn} onPress={resetFilters} activeOpacity={0.85}>
              <Text style={styles.resetBtnText}>초기화</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.applyBtn}
              onPress={() => setIsFilterVisible(false)}
              activeOpacity={0.85}
            >
              <Text style={styles.applyBtnText}>상품 보기</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },

  // Top tab bar
  topTabBar:        { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e2e8f0', marginTop: 0, paddingTop: 0 },
  topTab:           { flex: 1, alignItems: 'center', paddingVertical: 14, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  topTabActive:     { borderBottomColor: '#2563eb' },
  topTabText:       { fontSize: 15, fontWeight: 'normal', color: '#94a3b8' },
  topTabTextActive: { fontWeight: 'bold', color: '#2563eb' },

  // Brand selector bar
  brandBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 4, paddingRight: 12,
    borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  brandList:      { paddingHorizontal: 12, gap: 4 },
  brandItem:      { paddingHorizontal: 14, paddingVertical: 10 },
  brandText:      { fontSize: 14, fontWeight: 'normal', color: '#64748b' },
  brandTextActive:{ fontWeight: 'bold', color: '#2563eb' },

  detailFilterBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0',
    backgroundColor: '#fff', flexShrink: 0, marginLeft: 8,
  },
  detailFilterBtnActive: { borderColor: '#2563eb', backgroundColor: '#eff6ff' },
  detailFilterText:      { fontSize: 12, color: '#475569' },
  detailFilterTextActive:{ color: '#2563eb', fontWeight: 'bold' },

  // Sort row
  sortRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', zIndex: 10 },
  itemCount: { fontSize: 13, color: '#64748b' },
  sortLabel: { fontSize: 13, fontWeight: '600', color: '#0f172a' },
  sortDropdown: {
    position: 'absolute', top: 30, left: 0,
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0',
    borderRadius: 8, padding: 8, zIndex: 100,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 6, elevation: 8,
    minWidth: 150,
  },
  sortDropdownItem: { paddingVertical: 9, paddingHorizontal: 12 },
  sortDropdownText: { fontSize: 13, color: '#475569' },
  sortDropdownTextActive: { fontWeight: '700', color: '#0f172a' },

  // Product list
  listContent:  { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40 },
  separator:    { height: 1, backgroundColor: '#f1f5f9' },
  productRow:   { flexDirection: 'row', paddingVertical: 14, gap: 12 },
  productThumb: { width: 72, height: 72, borderRadius: 8, backgroundColor: '#f1f5f9', flexShrink: 0 },
  productInfo:  { flex: 1 },
  productBrand: { fontSize: 11, color: '#94a3b8', fontWeight: '600', marginBottom: 2 },
  productName:  { fontSize: 14, fontWeight: '500', color: '#1e293b', lineHeight: 20, marginBottom: 6 },
  priceRow:     { flexDirection: 'row', alignItems: 'center', gap: 6 },
  productPrice: { fontSize: 15, fontWeight: '900', color: '#0f172a' },
  discountBadge:{ backgroundColor: '#fee2e2', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  discountText: { fontSize: 11, fontWeight: '800', color: '#ef4444' },
  unitPrice:    { fontSize: 11, color: '#64748b', backgroundColor: '#f1f5f9', paddingHorizontal: 4, borderRadius: 4, marginLeft: 6, overflow: 'hidden' },
  origPrice:    { fontSize: 11, color: '#cbd5e1', textDecorationLine: 'line-through', marginTop: 2 },

  // Bottom Sheet
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: '90%',
  },
  sheetHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  sheetTitle: { fontSize: 17, fontWeight: '800', color: '#0f172a' },
  sheetBody:  { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 16 },

  // Filter groups
  filterGroup:      { marginTop: 14 },
  filterGroupTitle: { fontSize: 14, fontWeight: '700', color: '#334155', marginBottom: 8 },
  chipWrap:         { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chipRowScroll:    { flexDirection: 'row', gap: 8, paddingRight: 20 },
  filterChip: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#fff',
  },
  filterChipActive:       { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  filterChipText:         { fontSize: 13, color: '#64748b' },
  filterChipTextActive:   { color: '#fff', fontWeight: 'bold' },
  recommendBadge:         { fontSize: 11, color: '#2563eb', fontWeight: '700' },
  recommendBadgeActive:   { color: '#93c5fd' },

  // Sheet footer
  sheetFooter: {
    flexDirection: 'row', gap: 10,
    paddingHorizontal: 20, paddingVertical: 16,
    borderTopWidth: 1, borderTopColor: '#f1f5f9',
  },
  resetBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 10,
    borderWidth: 1, borderColor: '#cbd5e1', alignItems: 'center',
  },
  resetBtnText: { fontSize: 14, fontWeight: '700', color: '#475569' },
  applyBtn: {
    flex: 2, paddingVertical: 14, borderRadius: 10,
    backgroundColor: '#2563eb', alignItems: 'center',
  },
  applyBtnText: { fontSize: 14, fontWeight: '800', color: '#fff' },
});
