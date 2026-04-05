import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTracking } from '../context/TrackingContext';
import { TrackingCard } from '../components/TrackingCard';

// ─── Curation categories ──────────────────────────────────────────────────────

const CURATION_CATEGORIES = [
  { id: 'timing',   label: '구매 타이밍', icon: 'alarm-outline',   color: '#6366f1' },
  { id: 'lowest',   label: '역대 최저가', icon: 'flame-outline',   color: '#ef4444' },
  { id: 'peers',    label: '또래 추천',   icon: 'people-outline',  color: '#f59e0b' },
  { id: 'frequent', label: '자주 산 상품', icon: 'cart-outline',   color: '#10b981' },
];

const SORT_OPTIONS = ['최신순', '할인율순', '오래된순', '낮은가격순', '즐겨찾기순'];

// Returns items that match a curation filter. Mock logic: only 'lowest' applies a real predicate.
function applyCurationFilter(items, curationId) {
  if (!curationId) return items;
  if (curationId === 'lowest') return items.filter((i) => (i.priceDrop || 0) > 5000);
  return items; // timing / peers / frequent — no mock rule yet, show all
}

// ─── Curation card ────────────────────────────────────────────────────────────

// images: up to 4 URIs from globalTrackedItems (may be empty)
function CurationCard({ category, images, count, onPress }) {
  return (
    <TouchableOpacity style={styles.curationCardWrap} onPress={onPress} activeOpacity={0.75}>
      {/* Folder container */}
      <View style={styles.curationCard}>
        {/* Count badge top-right */}
        <View style={styles.curationBadge}>
          <Text style={styles.curationBadgeText}>{count}</Text>
        </View>

        {/* 2×2 product image grid (folder UI) */}
        <View style={styles.curationImageGrid}>
          {images.length === 0 ? (
            <View style={styles.curationImageFallback}>
              <Ionicons name={category.icon} size={20} color={category.color} />
            </View>
          ) : (
            images.map((uri, idx) => (
              uri
                ? <Image key={idx} source={{ uri }} style={styles.curationImageCell} resizeMode="cover" />
                : <View key={idx} style={[styles.curationImageCell, { backgroundColor: '#e2e8f0' }]} />
            ))
          )}
        </View>
      </View>

      {/* Label sits below the folder, outside the bg container */}
      <Text style={styles.curationLabel} numberOfLines={1}>{category.label}</Text>
    </TouchableOpacity>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function TrackingListScreen({ navigation }) {
  const { globalTrackedItems, removeTrackedItem, updateTrackedItems } = useTracking();

  const [isEditMode,        setIsEditMode]        = useState(false);
  const [selectedIds,       setSelectedIds]       = useState([]);
  const [viewMode,          setViewMode]          = useState('grid');
  const [showTooltip,       setShowTooltip]       = useState(false);
  const [showOnlyFavorites,  setShowOnlyFavorites]  = useState(false);
  const [sortOption,         setSortOption]         = useState('최신순');
  const [isSortModalVisible,   setIsSortModalVisible]   = useState(false);
  const [isFilterModalVisible, setIsFilterModalVisible] = useState(false);
  const [isTutorialVisible,    setIsTutorialVisible]    = useState(false);

  // Items shown in the FlatList — favorites filter applied when active.
  const listData = showOnlyFavorites
    ? globalTrackedItems.filter((i) => i.isFavorite)
    : globalTrackedItems;

  // Apply sort on top of the filtered list.
  const sortedData = useMemo(() => {
    const arr = [...listData];
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
      default: // 최신순 — context prepends newest, so insertion order = newest first
        return arr;
    }
  }, [listData, sortOption]);

  // Dismiss tooltip whenever the screen goes out of focus (tab switch, navigation)
  useFocusEffect(useCallback(() => {
    return () => setShowTooltip(false);
  }, []));

  const exitEditMode = useCallback(() => { setIsEditMode(false); setSelectedIds([]); }, []);

  const toggleSelect = useCallback((id) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]);
  }, []);

  const activateEditMode = useCallback((itemId) => {
    setIsEditMode(true);
    setSelectedIds([itemId]);
  }, []);

  const allSelected = sortedData.length > 0 && selectedIds.length === sortedData.length;

  const handleSelectAll = useCallback(() => {
    setSelectedIds(allSelected ? [] : sortedData.map((i) => i.productId ?? i.savedId));
  }, [allSelected, sortedData]);

  const handleDeleteSelected = useCallback(() => {
    Alert.alert(
      '상품 삭제',
      `선택된 상품 ${selectedIds.length}개를 삭제하시겠습니까?`,
      [
        { text: '아니오', style: 'cancel' },
        {
          text: '예', style: 'destructive',
          onPress: () => {
            selectedIds.forEach((id) => removeTrackedItem(id));
            exitEditMode();
          },
        },
      ]
    );
  }, [selectedIds, removeTrackedItem, exitEditMode]);

  // ── Toggle helpers: compute majority state across selected items, then flip ──
  // If majority (≥50%) of selected items have the flag ON, turn all OFF; else ON.
  const handleToggleFlag = useCallback((flag) => {
    if (selectedIds.length === 0) return;
    const selected = globalTrackedItems.filter((i) => selectedIds.includes(i.productId));
    const onCount  = selected.filter((i) => i[flag]).length;
    const nextVal  = onCount < selected.length; // flip to ON unless all already ON
    updateTrackedItems(selectedIds, { [flag]: nextVal });
  }, [selectedIds, globalTrackedItems, updateTrackedItems]);

  // Derive "active" state of each toggle button from selected items for visual feedback
  const selectedItems     = globalTrackedItems.filter((i) => selectedIds.includes(i.productId));
  const allPriceAlertOn   = selectedItems.length > 0 && selectedItems.every((i) => i.isPriceAlertOn);
  const allRestockAlertOn = selectedItems.length > 0 && selectedItems.every((i) => i.isRestockAlertOn);
  const allFavorite       = selectedItems.length > 0 && selectedItems.every((i) => i.isFavorite);

  // Header: dynamic title + guide button (normal mode) / 완료 button (edit mode)
  useEffect(() => {
    navigation.setOptions({
      title: globalTrackedItems.length > 0
        ? `관심상품 (총 ${globalTrackedItems.length}개)`
        : '관심상품',
      headerRight: isEditMode
        ? () => (
            <TouchableOpacity
              onPress={exitEditMode}
              style={{ marginRight: 16 }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#ef4444' }}>완료</Text>
            </TouchableOpacity>
          )
        : () => (
            <TouchableOpacity
              onPress={() => setIsTutorialVisible(true)}
              style={{ marginRight: 16 }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#64748b' }}>🪄 상품 추가 방법</Text>
            </TouchableOpacity>
          ),
    });
  }, [navigation, isEditMode, exitEditMode, globalTrackedItems.length]);

  // Summary bar + curation dashboard
  const SummaryBar = (
    <View>
      {/* Top row */}
      <View style={styles.summaryBar}>
        {isEditMode ? (
          <TouchableOpacity onPress={handleSelectAll} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.selectAllText}>{allSelected ? '전체 해제' : '전체 선택'}</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.summaryLeft}>
            <Text style={styles.summaryTitle}>지금 사면 좋은 상품</Text>
            <TouchableOpacity
              onPress={() => setShowTooltip(true)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{ marginLeft: 4 }}
            >
              <Ionicons name="information-circle-outline" size={16} color="#94a3b8" />
            </TouchableOpacity>
          </View>
        )}
        <View style={styles.summaryRight} />
      </View>

      {/* Horizontal curation dashboard (folder cards) — always visible */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.curationRow}
      >
        {CURATION_CATEGORIES.map((cat) => {
          const matchCount = applyCurationFilter(globalTrackedItems, cat.id).length;
          const previewImages = applyCurationFilter(globalTrackedItems, cat.id)
            .slice(0, 4)
            .map((i) => i.image ?? null);
          return (
            <CurationCard
              key={cat.id}
              category={cat}
              images={previewImages}
              count={matchCount}
              onPress={isEditMode ? undefined : () => navigation.navigate('CurationDetail', { curationId: cat.id, title: cat.label })}
            />
          );
        })}
      </ScrollView>
      {/* Section divider */}
      <View style={styles.curationDivider} />

      {/* Empty state — shown inside list when favorites filter yields nothing */}
      {sortedData.length === 0 && showOnlyFavorites && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>📭</Text>
          <Text style={styles.emptySub}>
            {'즐겨찾기 상품이 없습니다.\n특정 상품을 즐겨찾기로 관리하세요.'}
          </Text>
        </View>
      )}

      {/* ── Control bar — always visible ── */}
      <View style={styles.controlBar}>
        {/* Left: sort order */}
        <TouchableOpacity
          style={styles.controlSortBtn}
          onPress={isEditMode ? undefined : () => setIsSortModalVisible(true)}
          activeOpacity={0.7}
        >
          <Text style={styles.controlSortText}>{sortOption}</Text>
          <Ionicons name="chevron-down" size={14} color="#334155" />
        </TouchableOpacity>

        {/* Right: filter / edit / view toggle / quick-favorite */}
        <View style={styles.controlRight}>
          <TouchableOpacity
            style={styles.controlIconBtn}
            onPress={isEditMode ? undefined : () => setIsFilterModalVisible(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="funnel-outline" size={16} color="#64748b" />
            <Text style={styles.controlIconText}>필터</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.controlIconBtn}
            onPress={() => setIsEditMode(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="checkbox-outline" size={16} color={isEditMode ? '#3b82f6' : '#64748b'} />
            <Text style={[styles.controlIconText, isEditMode && { color: '#3b82f6' }]}>편집</Text>
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

          <TouchableOpacity
            onPress={() => setShowOnlyFavorites((v) => !v)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.7}
          >
            <Ionicons
              name={showOnlyFavorites ? 'star' : 'star-outline'}
              size={22}
              color={showOnlyFavorites ? '#f59e0b' : '#94a3b8'}
            />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  const isGrid = viewMode === 'grid';
  const isEmpty = globalTrackedItems.length === 0;

  // Skeleton add card appended at the end (only when items exist)
  const listDataWithAdd = isEmpty ? [] : [...sortedData, { isAddPlaceholder: true }];

  return (
    <SafeAreaView edges={['bottom']} style={styles.container}>

      {/* ── Zero-state: full-screen CTA when no items tracked ── */}
      {isEmpty ? (
        <View style={styles.zeroState}>
          <Ionicons name="cube-outline" size={64} color="#cbd5e1" style={{ marginBottom: 24 }} />
          <Text style={styles.zeroStateTitle}>
            {'아직 찜한 상품이 없어요!\n쿠팡에서 핫딜을 찾아 세이브루에 추가해보세요.'}
          </Text>
          <TouchableOpacity
            style={styles.zeroStateCta}
            activeOpacity={0.82}
            onPress={() => Linking.openURL('coupang://').catch(() => Linking.openURL('https://m.coupang.com'))}
          >
            <Text style={styles.zeroStateCtaText}>+ 쿠팡 앱 열고 상품 찾기</Text>
          </TouchableOpacity>
        </View>
      ) : (
      <FlatList
        key={viewMode}
        data={listDataWithAdd}
        keyExtractor={(item) => item.isAddPlaceholder ? '__add__' : String(item.productId ?? item.savedId)}
        numColumns={isGrid ? 2 : 1}
        columnWrapperStyle={isGrid ? styles.columnWrapper : undefined}
        ListHeaderComponent={SummaryBar}
        contentContainerStyle={[
          styles.listContent,
          isEditMode && { paddingBottom: 180 },
        ]}
        showsVerticalScrollIndicator={false}
        extraData={{ isEditMode, selectedIds, viewMode, showOnlyFavorites, sortOption, globalTrackedItems }}
        renderItem={({ item }) => {
          if (item.isAddPlaceholder) {
            if (isGrid) {
              return (
                <TouchableOpacity
                  style={styles.addCard}
                  activeOpacity={0.7}
                  onPress={() => Linking.openURL('coupang://').catch(() => Linking.openURL('https://m.coupang.com'))}
                >
                  <Ionicons name="add-circle-outline" size={32} color="#94a3b8" />
                  <Text style={styles.addCardText}>상품 추가</Text>
                </TouchableOpacity>
              );
            }
            return (
              <TouchableOpacity
                style={styles.addCardList}
                activeOpacity={0.7}
                onPress={() => Linking.openURL('coupang://').catch(() => Linking.openURL('https://m.coupang.com'))}
              >
                <Ionicons name="add-circle-outline" size={22} color="#94a3b8" />
                <Text style={styles.addCardText}>상품 추가하기</Text>
              </TouchableOpacity>
            );
          }
          return (
            <TrackingCard
              item={item}
              isEditMode={isEditMode}
              isSelected={selectedIds.includes(item.productId ?? item.savedId)}
              viewMode={viewMode}
              onRemove={removeTrackedItem}
              onToggleSelect={toggleSelect}
              onLongPressActivate={activateEditMode}
              onPress={() => navigation.navigate('Detail', { item })}
            />
          );
        }}
      />
      )}


      {/* ── Tooltip overlay ── */}
      {showTooltip && (
        <Pressable style={styles.tooltipOverlay} onPress={() => setShowTooltip(false)}>
          <View style={styles.tooltipBox}>
            <View style={styles.tooltipArrow} />
            <Text style={styles.tooltipText}>
              비슷한 환경에 있는 육아맘들의 관심 상품과 할인율이 높은 상품, 구매 할 때가 된 상품을 묶어서 보여드려요!
            </Text>
          </View>
        </Pressable>
      )}

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
                style={styles.sortOption}
                onPress={() => { setSortOption(opt); setIsSortModalVisible(false); }}
                activeOpacity={0.7}
              >
                <Text style={styles.sortOptionText}>{opt}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>

      {/* ── Filter modal ── */}
      <Modal
        visible={isFilterModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setIsFilterModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={{ flex: 1 }} onPress={() => setIsFilterModalVisible(false)} />
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>관심상품 필터</Text>
              <TouchableOpacity
                onPress={() => setIsFilterModalVisible(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={22} color="#334155" />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalPlaceholder}>필터 옵션이 곧 추가될 예정입니다.</Text>
          </View>
        </View>
      </Modal>

      {/* ── Tutorial modal ── */}
      <Modal
        visible={isTutorialVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setIsTutorialVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={{ flex: 1 }} onPress={() => setIsTutorialVisible(false)} />
          <View style={styles.tutorialSheet}>
            <View style={styles.modalHandle} />

            {/* Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>상품 추가 방법</Text>
              <TouchableOpacity
                onPress={() => setIsTutorialVisible(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={22} color="#334155" />
              </TouchableOpacity>
            </View>

            {/* Steps */}
            {[
              { icon: 'phone-portrait-outline', text: '1. 쿠팡 앱에서 원하는 상품을 여세요.' },
              { icon: 'share-social-outline',   text: "2. 공유하기 버튼을 누르고 'URL 복사'를 선택하세요." },
              { icon: 'sparkles-outline',        text: '3. 세이브루로 돌아오면 자동으로 추가됩니다!' },
            ].map(({ icon, text }, i) => (
              <View key={i} style={styles.tutorialStep}>
                <View style={styles.tutorialStepIcon}>
                  <Ionicons name={icon} size={26} color="#64748b" />
                </View>
                <Text style={styles.tutorialStepText}>{text}</Text>
              </View>
            ))}

            {/* Footer CTA */}
            <TouchableOpacity
              style={styles.tutorialCta}
              activeOpacity={0.82}
              onPress={() => {
                setIsTutorialVisible(false);
                Linking.openURL('coupang://').catch(() => Linking.openURL('https://m.coupang.com'));
              }}
            >
              <Text style={styles.tutorialCtaText}>쿠팡 앱 열고 시작하기</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Toggle switchboard action bar (edit mode only) ── */}
      {isEditMode && (
        <View style={styles.floatingBar}>

          {/* Top row: 3 toggle buttons */}
          <View style={styles.toggleRow}>
            <TouchableOpacity
              style={[styles.toggleBtn, allPriceAlertOn && styles.toggleBtnActive]}
              onPress={() => handleToggleFlag('isPriceAlertOn')}
              activeOpacity={0.75}
            >
              <Ionicons
                name={allPriceAlertOn ? 'notifications-off' : 'notifications'}
                size={18} color={allPriceAlertOn ? '#93c5fd' : '#94a3b8'}
              />
              <Text style={[styles.toggleBtnLabel, allPriceAlertOn && styles.toggleBtnLabelActive]}>
                {allPriceAlertOn ? '가격 알림 해제' : '가격 알림'}
              </Text>
            </TouchableOpacity>

            <View style={styles.toggleDivider} />

            <TouchableOpacity
              style={[styles.toggleBtn, allRestockAlertOn && styles.toggleBtnActive]}
              onPress={() => handleToggleFlag('isRestockAlertOn')}
              activeOpacity={0.75}
            >
              <Ionicons
                name="cube"
                size={18} color={allRestockAlertOn ? '#93c5fd' : '#94a3b8'}
              />
              <Text style={[styles.toggleBtnLabel, allRestockAlertOn && styles.toggleBtnLabelActive]}>
                {allRestockAlertOn ? '재입고 알림 해제' : '재입고 알림'}
              </Text>
            </TouchableOpacity>

            <View style={styles.toggleDivider} />

            <TouchableOpacity
              style={[styles.toggleBtn, allFavorite && styles.toggleBtnActive]}
              onPress={() => handleToggleFlag('isFavorite')}
              activeOpacity={0.75}
            >
              <Ionicons
                name={allFavorite ? 'star' : 'star-outline'}
                size={18} color={allFavorite ? '#fbbf24' : '#94a3b8'}
              />
              <Text style={[styles.toggleBtnLabel, allFavorite && styles.toggleBtnLabelActive]}>
                {allFavorite ? '즐겨찾기 해제' : '즐겨찾기'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Thin separator */}
          <View style={styles.barSeparator} />

          {/* Bottom row: 취소 | 삭제 | 확인 */}
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={exitEditMode} activeOpacity={0.8}>
              <Text style={styles.cancelText}>취소</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.deleteBtn, selectedIds.length === 0 && styles.deleteBtnDisabled]}
              onPress={selectedIds.length > 0 ? handleDeleteSelected : undefined}
              activeOpacity={0.85}
            >
              <Text style={styles.deleteText}>삭제</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.confirmBtn} onPress={exitEditMode} activeOpacity={0.85}>
              <Text style={styles.confirmText}>확인</Text>
            </TouchableOpacity>
          </View>

        </View>
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#fff' },
  listContent: { paddingBottom: 40 },

  // Zero-state (no items at all)
  zeroState: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 32,
  },
  zeroStateTitle: {
    fontSize: 16, fontWeight: '600', color: '#64748b',
    textAlign: 'center', lineHeight: 24, marginBottom: 28,
  },
  zeroStateCta: {
    backgroundColor: '#3b82f6', borderRadius: 14,
    paddingVertical: 16, paddingHorizontal: 32,
    ...Platform.select({
      ios:     { shadowColor: '#3b82f6', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 8 },
      android: { elevation: 4 },
    }),
  },
  zeroStateCtaText: { fontSize: 16, fontWeight: '800', color: '#fff' },

  // Summary bar
  summaryBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f1f5f9',
  },
  summaryLeft:   { flexDirection: 'row', alignItems: 'center' },
  summaryTitle:  { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  selectAllText: { fontSize: 15, fontWeight: '700', color: '#3b82f6' },
  summaryRight:  { flexDirection: 'row', alignItems: 'center' },
  guideBtn:      { backgroundColor: '#f1f5f9', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4 },
  guideBtnText:  { fontSize: 12, fontWeight: '600', color: '#64748b' },

  // Grid
  columnWrapper: { justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 16, marginTop: 16 },

  // Add skeleton card
  addCard: {
    flex: 1, margin: 8, minHeight: 220, borderRadius: 12,
    borderWidth: 2, borderStyle: 'dashed', borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
    alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  addCardList: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 14,
    borderWidth: 2, borderStyle: 'dashed', borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
    marginHorizontal: 16, marginTop: 8, borderRadius: 10,
  },
  addCardText: { fontSize: 14, fontWeight: '600', color: '#64748b' },

  // Empty state
  emptyState: { alignItems: 'center', paddingTop: 80 },
  emptyIcon:  { fontSize: 52, marginBottom: 16 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#334155', marginBottom: 8 },
  emptySub:   { fontSize: 14, color: '#94a3b8', textAlign: 'center', paddingHorizontal: 32, lineHeight: 21 },

  // Curation dashboard
  curationRow: {
    paddingHorizontal: 12, paddingVertical: 6, gap: 10, flexDirection: 'row',
  },
  // Outer touchable: column layout so label sits below the folder box
  curationCardWrap: {
    alignItems: 'center', gap: 6,
  },
  // Folder background box
  curationCard: {
    width: 72, height: 72, borderRadius: 16,
    backgroundColor: '#f8fafc',
    padding: 6,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 },
      android: { elevation: 1 },
    }),
  },
  curationLabel: { fontSize: 13, fontWeight: '700', color: '#334155', textAlign: 'center' },

  // 2×2 image grid: 72px box − 6px padding × 2 sides = 60px
  curationImageGrid: {
    width: 60, height: 60,
    flexDirection: 'row', flexWrap: 'wrap',
    justifyContent: 'space-between', alignContent: 'space-between',
    borderRadius: 8, overflow: 'hidden',
    backgroundColor: '#fff',
  },
  curationImageCell:     { width: 28, height: 28, borderRadius: 6 },
  curationImageFallback: { width: 60, height: 60, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },

  // Control bar
  controlBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 8,
    borderBottomWidth: 1, borderColor: '#f1f5f9',
  },
  controlSortBtn:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  controlSortText: { fontSize: 14, fontWeight: '600', color: '#334155' },
  controlRight:    { flexDirection: 'row', gap: 12, alignItems: 'center' },
  controlIconBtn:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  controlIconText: { fontSize: 13, color: '#64748b' },

  // Divider below curation ScrollView
  curationDivider: { height: 8, backgroundColor: '#f1f5f9', width: '100%', marginBottom: 0 },
  curationBadge: {
    position: 'absolute', top: -4, right: -4,
    zIndex: 10,
    minWidth: 20, height: 20, borderRadius: 10,
    backgroundColor: '#ef4444',
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 4,
    ...Platform.select({ android: { elevation: 5 } }),
  },
  curationBadgeText: { fontSize: 10, fontWeight: '800', color: '#fff' },

  // ── Bottom sheet modals ──────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1, justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
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
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12,
  },
  modalTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a', marginBottom: 8 },
  sortOption: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f1f5f9',
  },
  sortOptionText: { fontSize: 15, fontWeight: '500', color: '#334155' },
  modalPlaceholder: { fontSize: 14, color: '#94a3b8', textAlign: 'center', marginTop: 24, marginBottom: 8 },

  // Tutorial modal
  tutorialSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 20, paddingBottom: 36, paddingTop: 12,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.1, shadowRadius: 8 },
      android: { elevation: 10 },
    }),
  },
  tutorialStep: {
    flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 24,
  },
  tutorialStepIcon: {
    width: 60, height: 60, borderRadius: 12,
    backgroundColor: '#f1f5f9',
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  tutorialStepText: { flex: 1, fontSize: 14, color: '#334155', lineHeight: 21 },
  tutorialCta: {
    backgroundColor: '#3b82f6', borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
    ...Platform.select({
      ios:     { shadowColor: '#3b82f6', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
      android: { elevation: 4 },
    }),
  },
  tutorialCtaText: { fontSize: 16, fontWeight: '800', color: '#fff' },

  // Tooltip
  tooltipOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 10 },
  tooltipBox: {
    position: 'absolute', top: 45, left: 20, right: 20,
    backgroundColor: '#334155', borderRadius: 8, padding: 12,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 8 },
      android: { elevation: 6 },
    }),
  },
  tooltipArrow: {
    position: 'absolute', top: -8, left: 20,
    width: 0, height: 0,
    borderLeftWidth: 8,   borderLeftColor:   'transparent',
    borderRightWidth: 8,  borderRightColor:  'transparent',
    borderBottomWidth: 8, borderBottomColor: '#334155',
  },
  tooltipText: { fontSize: 13, color: '#fff', lineHeight: 19 },

  // ── Toggle switchboard floating bar ──────────────────────────────────────────
  floatingBar: {
    position: 'absolute', bottom: 16, left: 16, right: 16,
    backgroundColor: '#1e293b', borderRadius: 16,
    padding: 12, gap: 10, flexDirection: 'column',
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.22, shadowRadius: 12 },
      android: { elevation: 8 },
    }),
  },

  // Top row: toggle buttons
  toggleRow:          { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  toggleBtn:          { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 10, gap: 4 },
  toggleBtnActive:    { backgroundColor: 'rgba(59,130,246,0.18)' },

  toggleBtnLabel:     { fontSize: 11, fontWeight: '600', color: '#94a3b8' },
  toggleBtnLabelActive: { color: '#93c5fd' },
  toggleDivider:      { width: 1, height: 36, backgroundColor: '#334155' },

  barSeparator: { height: 1, backgroundColor: '#334155' },

  // Bottom row: action buttons
  actionRow:  { flexDirection: 'row', gap: 8 },
  cancelBtn:  { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: '#334155', alignItems: 'center' },
  cancelText: { fontSize: 14, fontWeight: '700', color: '#94a3b8' },
  deleteBtn:  { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: '#ef4444', alignItems: 'center' },
  deleteBtnDisabled: { backgroundColor: 'rgba(239,68,68,0.35)' },
  deleteText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  confirmBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: '#3b82f6', alignItems: 'center' },
  confirmText:{ fontSize: 14, fontWeight: '700', color: '#fff' },
});
