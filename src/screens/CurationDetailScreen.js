import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTracking } from '../context/TrackingContext';
import { TrackingCard } from '../components/TrackingCard';

// ─── Constants ────────────────────────────────────────────────────────────────

const SORT_OPTIONS = ['최신순', '할인율순', '오래된순', '낮은가격순', '즐겨찾기순'];

const CURATION_DESCRIPTIONS = {
  timing:   '구매 적기가 다가온 상품들을 모았어요! 지금이 바로 살 때입니다.',
  lowest:   '과거 가격 대비 하락 폭이 가장 큰 꿀템 모음입니다!',
  peers:    '비슷한 또래 아이를 키우는 맘들이 가장 많이 관심 가진 상품이에요.',
  frequent: '자주 재구매하는 소모품 중심으로 모아봤어요.',
};

// ─── Filter (mirrors TrackingListScreen mock logic) ───────────────────────────

function applyCurationFilter(items, curationId) {
  if (!curationId) return items;
  if (curationId === 'lowest') return items.filter((i) => (i.priceDrop || 0) > 5000);
  return items;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function CurationDetailScreen({ route }) {
  const { curationId } = route.params;
  const { globalTrackedItems } = useTracking();

  const [viewMode,           setViewMode]           = useState('grid');
  const [sortOption,         setSortOption]         = useState('최신순');
  const [isSortModalVisible, setIsSortModalVisible] = useState(false);

  const filteredItems = applyCurationFilter(globalTrackedItems, curationId);

  const sortedItems = useMemo(() => {
    const arr = [...filteredItems];
    switch (sortOption) {
      case '오래된순':
        return arr.reverse();
      case '할인율순':
        return arr.sort((a, b) => {
          const pctA = a.priceDrop ? a.priceDrop / ((a.currentPrice || 0) + a.priceDrop) : 0;
          const pctB = b.priceDrop ? b.priceDrop / ((b.currentPrice || 0) + b.priceDrop) : 0;
          return pctB - pctA;
        });
      case '낮은가격순':
        return arr.sort((a, b) => (a.currentPrice || 0) - (b.currentPrice || 0));
      case '즐겨찾기순':
        return arr.sort((a, b) => (b.isFavorite ? 1 : 0) - (a.isFavorite ? 1 : 0));
      default:
        return arr; // 최신순 — insertion order = newest first
    }
  }, [filteredItems, sortOption]);

  const isGrid       = viewMode === 'grid';
  const description  = CURATION_DESCRIPTIONS[curationId] ?? '';

  const ListHeader = (
    <View>
      {/* Info banner */}
      {description.length > 0 && (
        <View style={styles.infoBanner}>
          <Ionicons name="information-circle-outline" size={16} color="#3b82f6" style={{ marginRight: 6 }} />
          <Text style={styles.infoBannerText}>{description}</Text>
        </View>
      )}

      {/* Control bar */}
      <View style={styles.controlBar}>
        <TouchableOpacity
          style={styles.controlSortBtn}
          onPress={() => setIsSortModalVisible(true)}
          activeOpacity={0.7}
        >
          <Text style={styles.controlSortText}>{sortOption}</Text>
          <Ionicons name="chevron-down" size={14} color="#334155" />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setViewMode((v) => v === 'grid' ? 'list' : 'grid')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          activeOpacity={0.7}
        >
          <Ionicons
            name={viewMode === 'grid' ? 'list-outline' : 'grid-outline'}
            size={20} color="#64748b"
          />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView edges={['bottom']} style={styles.container}>
      <FlatList
        key={viewMode}
        data={sortedItems}
        keyExtractor={(item) => String(item.productId ?? item.savedId)}
        numColumns={isGrid ? 2 : 1}
        columnWrapperStyle={isGrid ? styles.columnWrapper : undefined}
        ListHeaderComponent={ListHeader}
        contentContainerStyle={sortedItems.length === 0 ? styles.emptyContainer : styles.listContent}
        showsVerticalScrollIndicator={false}
        extraData={{ viewMode, sortOption }}
        renderItem={({ item }) => (
          <TrackingCard
            item={item}
            isEditMode={false}
            isSelected={false}
            viewMode={viewMode}
            onRemove={() => {}}
            onToggleSelect={() => {}}
            onLongPressActivate={() => {}}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📭</Text>
            <Text style={styles.emptyTitle}>해당 조건의 상품이 없습니다</Text>
            <Text style={styles.emptySub}>다른 카테고리를 확인해보세요!</Text>
          </View>
        }
      />

      {/* ── Sort modal ── */}
      <Modal
        visible={isSortModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setIsSortModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={{ flex: 1 }} onPress={() => setIsSortModalVisible(false)} />
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>정렬</Text>
            {SORT_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt}
                style={[styles.sortOption, opt === sortOption && styles.sortOptionActive]}
                onPress={() => { setSortOption(opt); setIsSortModalVisible(false); }}
                activeOpacity={0.7}
              >
                <Text style={[styles.sortOptionText, opt === sortOption && styles.sortOptionTextActive]}>
                  {opt}
                </Text>
                {opt === sortOption && (
                  <Ionicons name="checkmark" size={16} color="#3b82f6" />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#fff' },
  listContent:    { paddingBottom: 40 },
  emptyContainer: { paddingBottom: 40 },

  columnWrapper: {
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginTop: 16,
    marginBottom: 0,
  },

  // Info banner
  infoBanner: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: '#eff6ff',
    paddingHorizontal: 16, paddingVertical: 12,
    marginBottom: 0,
  },
  infoBannerText: { flex: 1, fontSize: 13, color: '#1d4ed8', lineHeight: 19 },

  // Control bar
  controlBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderColor: '#f1f5f9',
  },
  controlSortBtn:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  controlSortText: { fontSize: 14, fontWeight: '600', color: '#334155' },

  // Empty state
  emptyState: { alignItems: 'center', paddingTop: 80 },
  emptyIcon:  { fontSize: 52, marginBottom: 16 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#334155', marginBottom: 8 },
  emptySub:   { fontSize: 14, color: '#94a3b8', lineHeight: 21 },

  // Sort modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 20, paddingBottom: 36, paddingTop: 12,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.1, shadowRadius: 8 },
      android: { elevation: 10 },
    }),
  },
  modalHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: '#e2e8f0', alignSelf: 'center', marginBottom: 16,
  },
  modalTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a', marginBottom: 8 },
  sortOption: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f1f5f9',
  },
  sortOptionActive:     {},
  sortOptionText:       { fontSize: 15, fontWeight: '500', color: '#334155' },
  sortOptionTextActive: { fontWeight: '700', color: '#3b82f6' },
});
