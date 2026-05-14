import React, { useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Image,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, ChevronDown, Search, Link } from 'lucide-react-native';

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_OPTIONS = ['전체', '육아수다', '질문/고민', '육아꿀템', '특가제보'];
const SORT_OPTIONS     = ['최신순', '댓글순', '조회순', '좋아요순'];

// ─── Mock search results ──────────────────────────────────────────────────────

// Full unfiltered dataset — peer match is intentionally bypassed in search
const MOCK_RESULTS = [
  { postId: 'r1', category: 'qna',  title: '12개월 아기 걷기 연습 어떻게 하셨어요?',     nickname: '12개월 솔이맘', timeAgo: '26.05.13.', commentCount: 14, viewCount: 892,  likeCount: 9  },
  { postId: 'r2', category: 'tip',  title: '기저귀 발진에 진짜 효과 있었던 꿀템 공유',   nickname: '8개월 별이맘',  timeAgo: '26.05.12.', commentCount: 31, viewCount: 2103, likeCount: 74,
    taggedProduct: { name: '베베숲 물티슈 캡형 100매', brand: '베베숲' } },
  { postId: 'r3', category: 'chat', title: '오늘 아이랑 처음으로 공원 나들이 다녀왔어요', nickname: '15개월 하나맘', timeAgo: '26.05.11.', commentCount: 7,  viewCount: 445,  likeCount: 21 },
  { postId: 'r4', category: 'deal', title: '하기스 매직팬티 5단계 역대급 특가 정보',      nickname: '9개월 노을맘',  timeAgo: '26.05.10.', commentCount: 5,  viewCount: 1247, likeCount: 33,
    taggedProduct: { name: '하기스 매직팬티 5단계 남아 40매', brand: '하기스' } },
  { postId: 'r5', category: 'qna',  title: '분유 끊는 시기 언제가 적당할까요?',           nickname: '11개월 콩이맘', timeAgo: '26.05.09.', commentCount: 22, viewCount: 673,  likeCount: 15,
    taggedProduct: { name: '앱솔루트 명작 분유 2단계 800g', brand: '매일유업' } },
];

// Covers both current and legacy Firestore category keys
const CATEGORY_LABEL = {
  chat: '육아수다', qna: '질문/고민', tip: '육아꿀템', deal: '특가제보',
  question: '질문/고민', free: '육아수다', review: '육아꿀템', region: '지역',
};

// ─── Result Card ──────────────────────────────────────────────────────────────

function ResultCard({ item }) {
  const catLabel  = CATEGORY_LABEL[item.category] ?? item.category;
  const thumbUri  = item.images?.[0] ?? item.imageUrls?.[0] ?? null;
  const extraImgs = Math.max(0, ((item.images ?? item.imageUrls)?.length ?? 0) - 1);

  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.85}>
      <View style={{ flexDirection: 'row' }}>
        {/* Left: text content */}
        <View style={{ flex: 1, marginRight: thumbUri ? 12 : 0 }}>
          <Text style={styles.cardCategory}>{catLabel}</Text>
          <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
          {item.taggedProduct && (
            <View style={styles.productPill}>
              <Link size={12} color="#64748B" />
              <Text style={styles.productPillText} numberOfLines={1}>
                {item.taggedProduct.brand ? `[${item.taggedProduct.brand}] ` : ''}{item.taggedProduct.name}
              </Text>
            </View>
          )}
          <View style={styles.cardMeta}>
            <Text style={styles.cardMetaText}>{item.nickname}</Text>
            <Text style={styles.cardMetaDot}> · </Text>
            <Text style={styles.cardMetaText}>{item.timeAgo}</Text>
            <Text style={styles.cardMetaDot}> · </Text>
            <Text style={styles.cardMetaText}>댓글 {item.commentCount}</Text>
            <Text style={styles.cardMetaDot}> · </Text>
            <Text style={styles.cardMetaText}>조회 {item.viewCount}</Text>
          </View>
        </View>

        {/* Right: thumbnail */}
        {thumbUri && (
          <View style={{ alignSelf: 'flex-start' }}>
            <Image source={{ uri: thumbUri }} style={styles.cardThumb} />
            {extraImgs > 0 && (
              <View style={styles.cardThumbOverlay}>
                <Text style={styles.cardThumbOverlayText}>+{extraImgs}</Text>
              </View>
            )}
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function CommunitySearchScreen({ navigation }) {
  const { top } = useSafeAreaInsets();
  const inputRef = useRef(null);

  const [query,        setQuery]        = useState('');
  const [activeTab,    setActiveTab]    = useState('title');   // 'title' | 'author' | 'product'
  const [activeCategory, setActiveCategory] = useState('전체');
  const [activeSort,   setActiveSort]   = useState('최신순');
  const [showCatMenu,  setShowCatMenu]  = useState(false);
  const [showSortMenu, setShowSortMenu] = useState(false);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const filtered = MOCK_RESULTS.filter((p) => {
      let matchesTab = false;
      if (activeTab === 'title') {
        matchesTab = p.title.toLowerCase().includes(q) || (p.content ?? '').toLowerCase().includes(q);
      } else if (activeTab === 'author') {
        matchesTab = p.nickname.toLowerCase().includes(q);
      } else if (activeTab === 'product') {
        const tp = p.taggedProduct;
        matchesTab = !!(tp && (tp.name.toLowerCase().includes(q) || tp.brand.toLowerCase().includes(q)));
      }
      const matchesCat = activeCategory === '전체' || CATEGORY_LABEL[p.category] === activeCategory;
      return matchesTab && matchesCat;
    });

    const sorted = [...filtered];
    switch (activeSort) {
      case '댓글순': sorted.sort((a, b) => (b.commentCount ?? 0) - (a.commentCount ?? 0)); break;
      case '조회순': sorted.sort((a, b) => (b.viewCount    ?? 0) - (a.viewCount    ?? 0)); break;
      case '좋아요순': sorted.sort((a, b) => (b.likeCount  ?? 0) - (a.likeCount    ?? 0)); break;
      default: sorted.sort((a, b) => (b.timeAgo ?? '').localeCompare(a.timeAgo ?? '')); break;
    }
    return sorted;
  }, [query, activeTab, activeCategory, activeSort]);

  return (
    <View style={[styles.container, { paddingTop: top }]}>

      {/* ── Search header ── */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.backBtn}
        >
          <ArrowLeft size={24} color="#334155" />
        </TouchableOpacity>
        <TextInput
          ref={inputRef}
          style={styles.searchInput}
          placeholder="커뮤니티 글 검색"
          placeholderTextColor="#B0B8C8"
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
          autoFocus
          clearButtonMode="while-editing"
        />
      </View>

      {/* ── Filter row: Category + Sort dropdowns ── */}
      <View style={styles.filterRow}>
        {/* Category dropdown */}
        <View>
          <TouchableOpacity
            style={styles.filterBtn}
            onPress={() => { setShowCatMenu((v) => !v); setShowSortMenu(false); }}
            activeOpacity={0.8}
          >
            <Text style={styles.filterBtnText}>카테고리: {activeCategory}</Text>
            <ChevronDown size={14} color="#475569" />
          </TouchableOpacity>
          {showCatMenu && (
            <View style={[styles.dropdown, { left: 0 }]}>
              {CATEGORY_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt}
                  style={[styles.dropdownItem, opt === activeCategory && styles.dropdownItemActive]}
                  onPress={() => { setActiveCategory(opt); setShowCatMenu(false); }}
                >
                  <Text style={[styles.dropdownItemText, opt === activeCategory && styles.dropdownItemTextActive]}>{opt}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Sort dropdown */}
        <View>
          <TouchableOpacity
            style={styles.filterBtn}
            onPress={() => { setShowSortMenu((v) => !v); setShowCatMenu(false); }}
            activeOpacity={0.8}
          >
            <Text style={styles.filterBtnText}>정렬: {activeSort}</Text>
            <ChevronDown size={14} color="#475569" />
          </TouchableOpacity>
          {showSortMenu && (
            <View style={[styles.dropdown, { left: 0 }]}>
              {SORT_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt}
                  style={[styles.dropdownItem, opt === activeSort && styles.dropdownItemActive]}
                  onPress={() => { setActiveSort(opt); setShowSortMenu(false); }}
                >
                  <Text style={[styles.dropdownItemText, opt === activeSort && styles.dropdownItemTextActive]}>{opt}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </View>

      {/* ── Search-field tabs: 제목+내용 / 작성자 / 상품태그 ── */}
      <View style={styles.tabRow}>
        {[
          { key: 'title',   label: '제목+내용' },
          { key: 'author',  label: '작성자' },
          { key: 'product', label: '상품태그' },
        ].map(({ key, label }) => (
          <TouchableOpacity
            key={key}
            style={[styles.tab, activeTab === key && styles.tabActive]}
            onPress={() => setActiveTab(key)}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabText, activeTab === key && styles.tabTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Results / Empty state ── */}
      {query.trim().length === 0 ? (
        <View style={styles.emptyState}>
          <Search size={40} color="#CBD5E1" style={{ marginBottom: 16 }} />
          <Text style={styles.emptyStateText}>검색어를 입력해보세요</Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.postId}
          renderItem={({ item }) => <ResultCard item={item} />}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 40 }}
          ListEmptyComponent={
            <Text style={styles.emptyText}>검색 결과가 없어요</Text>
          }
        />
      )}

    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
    gap: 8,
  },
  backBtn:     { padding: 4 },
  searchInput: {
    flex: 1, fontSize: 15, color: '#0f172a',
    backgroundColor: '#F8FAFC',
    borderWidth: 1, borderColor: '#E2E8F0',
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
  },

  // Filter row
  filterRow: {
    flexDirection: 'row', gap: 8,
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
    zIndex: 10,
  },
  filterBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: '#E2E8F0',
    borderRadius: 8, backgroundColor: '#fff',
  },
  filterBtnText: { fontSize: 13, fontWeight: '600', color: '#475569' },
  dropdown: {
    position: 'absolute', top: 38, zIndex: 20,
    backgroundColor: '#fff', borderRadius: 10,
    borderWidth: 1, borderColor: '#E2E8F0',
    minWidth: 130,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8 },
      android: { elevation: 8 },
    }),
  },
  dropdownItem:         { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F1F5F9' },
  dropdownItemActive:   { backgroundColor: '#EFF6FF' },
  dropdownItemText:     { fontSize: 14, color: '#334155' },
  dropdownItemTextActive: { color: '#2E6FF2', fontWeight: '700' },

  // Tabs
  tabRow: {
    flexDirection: 'row',
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  tab: {
    flex: 1, alignItems: 'center', paddingVertical: 12,
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabActive:     { borderBottomColor: '#2E6FF2' },
  tabText:       { fontSize: 14, fontWeight: '600', color: '#94A3B8' },
  tabTextActive: { color: '#2E6FF2', fontWeight: '700' },

  // Result card
  card: {
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
    gap: 6,
  },
  cardCategory: { fontSize: 12, fontWeight: '600', color: '#64748B' },
  cardTitle:    { fontSize: 15, fontWeight: '400', color: '#334155', lineHeight: 22 },
  cardMeta:     { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: 6 },
  cardMetaText: { fontSize: 12, color: '#94A3B8' },
  cardMetaDot:  { fontSize: 12, color: '#D1D5DB' },
  cardThumb: { width: 64, height: 64, borderRadius: 8, backgroundColor: '#F1F5F9' },
  cardThumbOverlay: {
    position: 'absolute', bottom: 4, right: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 4, paddingVertical: 2, borderRadius: 4,
  },
  cardThumbOverlayText: { color: '#FFF', fontSize: 10, fontWeight: '700' },

  productPill: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0',
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4,
    marginTop: 8, alignSelf: 'flex-start', maxWidth: '90%',
  },
  productPillText: { fontSize: 12, color: '#475569', marginLeft: 6 },

  emptyState:     { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyStateText: { color: '#94A3B8', fontSize: 14 },
  emptyText:      { textAlign: 'center', color: '#94A3B8', marginTop: 60, fontSize: 14 },
});
