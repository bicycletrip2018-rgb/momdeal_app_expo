import React, { useState } from 'react';
import {
  FlatList,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_PRODUCTS = [
  { id: 's1', brand: '하기스',   name: '네이처메이드 기저귀 신생아용 100매 초슬림 풀박스',   rating: 4.9, reviewCount: 2140, discount: 45, price: 28900,  originalPrice: 52500,  emoji: '🧷', bg: '#fef9c3' },
  { id: 's2', brand: '헤겐',     name: '와이드넥 PP 젖병 세트 160ml + 240ml 4개입',          rating: 4.8, reviewCount: 1893, discount: 24, price: 34900,  originalPrice: 45900,  emoji: '🍼', bg: '#ede9fe' },
  { id: 's3', brand: '매일유업', name: '앱솔루트 분유 스텝2 800g × 2캔 DHA 강화',             rating: 4.7, reviewCount: 2104, discount: 22, price: 58900,  originalPrice: 75500,  emoji: '🥛', bg: '#f0fdf4' },
  { id: 's4', brand: '팸퍼스',   name: '하이비 프리미엄 기저귀 L사이즈 56매',                 rating: 4.7, reviewCount: 1743, discount: 29, price: 26900,  originalPrice: 37900,  emoji: '🧷', bg: '#fef9c3' },
  { id: 's5', brand: '스토케',   name: '스쿠트5 바운서 스트롤러 신생아부터 사용 가능',         rating: 4.9, reviewCount:  875, discount: 22, price: 249000, originalPrice: 319000, emoji: '🛒', bg: '#ecfdf5' },
];

const MOCK_POSTS = [
  { id: 'p1', board: '맘카페',    title: '신생아 기저귀 하기스 vs 팸퍼스 실제 써본 후기',      snippet: '두 달째 써보니 확실히 하기스가 허벅지 밀림이 적더라고요...', commentCount: 34, viewCount: 1240, author: '익명의 세이브루맘', likeCount: 47 },
  { id: 'p2', board: '핫딜/할인', title: '쿠팡 분유 역대 최저가 떴어요! 오늘 마감',           snippet: '앱솔루트 스텝2 2캔 세트가 58,900원이에요. 놓치지 마세요',   commentCount: 18, viewCount:  870, author: '절약맘_서울',       likeCount: 32 },
  { id: 'p3', board: '육아정보',  title: '6개월 이유식 시작할 때 꼭 필요한 준비물 총정리',      snippet: '이유식 용기, 스푼, 냉동백... 저도 처음엔 뭐가 필요한지',   commentCount: 12, viewCount:  340, author: '두아이맘_경기',      likeCount: 19 },
];

const PRODUCT_FILTERS = [
  { key: 'discount', label: '할인율 높은 순' },
  { key: 'lowest',   label: '낮은 가격순' },
  { key: 'rating',   label: '평점 높은 순' },
  { key: 'review',   label: '리뷰 많은 순' },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function ProductItem({ item, rank, navigation }) {
  const medalColors = { 1: '#fbbf24', 2: '#94a3b8', 3: '#b45309' };
  const medal = medalColors[rank];
  return (
    <TouchableOpacity
      style={styles.productItem}
      onPress={() => navigation?.navigate('Detail', { item })}
      activeOpacity={0.85}
    >
      {/* Rank */}
      <View style={styles.rankBox}>
        {medal ? (
          <View style={[styles.medalCircle, { backgroundColor: medal }]}>
            <Text style={styles.medalText}>{rank}</Text>
          </View>
        ) : (
          <Text style={styles.rankNumDefault}>{rank}</Text>
        )}
      </View>

      {/* Thumb */}
      <View style={styles.itemThumb}>
        <Text style={styles.itemEmoji}>{item.emoji}</Text>
      </View>

      {/* Info */}
      <View style={styles.itemInfo}>
        <Text numberOfLines={2} style={styles.itemName}>
          <Text style={styles.itemBrand}>{item.brand} </Text>
          {item.name}
        </Text>
        <View style={styles.itemRatingRow}>
          <Text style={{ fontSize: 11 }}>⭐</Text>
          <Text style={styles.itemRating}>{item.rating}</Text>
          <Text style={styles.itemReviewCount}>({item.reviewCount.toLocaleString('ko-KR')})</Text>
        </View>
        {/* RULE-9.4 Price Block */}
        <View style={styles.itemPriceRow}>
          <Text style={styles.itemDiscount}>▼{item.discount}%</Text>
          <Text style={styles.itemPrice}>₩{item.price.toLocaleString('ko-KR')}</Text>
        </View>
        {item.originalPrice != null && (
          <Text style={styles.itemOriginalPrice}>₩{item.originalPrice.toLocaleString('ko-KR')}</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

function PostItem({ post }) {
  return (
    <View style={styles.postItem}>
      <Text style={styles.postBoard}>{post.board}</Text>
      <Text style={styles.postTitle} numberOfLines={2}>{post.title}</Text>
      <Text style={styles.postSnippet} numberOfLines={1}>{post.snippet}</Text>
      <View style={styles.postMetaRow}>
        <Text style={styles.postAuthor}>{post.author}</Text>
        <Text style={styles.postMetaDot}>·</Text>
        <Text style={styles.postMeta}>댓글 {post.commentCount}</Text>
        <Text style={styles.postMetaDot}>·</Text>
        <Text style={styles.postMeta}>조회 {post.viewCount}</Text>
        <Text style={styles.postMetaDot}>·</Text>
        <Text style={styles.postMeta}>좋아요 {post.likeCount ?? 0}</Text>
      </View>
    </View>
  );
}

function SectionDivider() {
  return <View style={styles.sectionDivider} />;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function SearchResultScreen({ navigation, route }) {
  const query = route?.params?.query || '';
  const [activeTab,    setActiveTab]    = useState('통합');
  const [activeFilter, setActiveFilter] = useState('discount');

  function renderIntegrated() {
    return (
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Product section header */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>상품 검색 결과 <Text style={styles.sectionCount}>{MOCK_PRODUCTS.length}건</Text></Text>
          <TouchableOpacity onPress={() => setActiveTab('상품')} activeOpacity={0.8}>
            <Text style={styles.sectionViewAll}>전체 ›</Text>
          </TouchableOpacity>
        </View>

        {[
          { id: '1', name: '팸퍼스 기저귀 신생아용 100매',   currentPrice: 29800, originalPrice: 45000, discountRate: 35 },
          { id: '2', name: '하기스 네이처메이드 2단계 156매', currentPrice: 32000, originalPrice: 48000, discountRate: 33 },
          { id: '3', name: '에디슨 실리콘 젖병 240ml',        currentPrice: 15000, originalPrice: 20000, discountRate: 25 },
        ].map((item) => {
          const nameParts   = item.name.split(' ');
          const brand       = nameParts[0];
          const productName = nameParts.slice(1).join(' ');
          return (
            <TouchableOpacity
              key={item.id}
              style={{ flexDirection: 'row', paddingVertical: 16, paddingHorizontal: 16, borderBottomWidth: 1, borderColor: '#F3F4F6' }}
              activeOpacity={0.85}
              onPress={() => navigation?.navigate('Detail', { item })}
            >
              <View style={{ width: 80, height: 80, backgroundColor: '#F3F4F6', borderRadius: 8, marginRight: 16, flexShrink: 0 }} />
              <View style={{ flex: 1, justifyContent: 'center' }}>
                <Text style={{ fontSize: 14, marginBottom: 4 }} numberOfLines={2}>
                  <Text style={{ color: '#9CA3AF', fontWeight: '700' }}>[{brand}] </Text>
                  <Text style={{ color: '#111827', fontWeight: '500' }}>{productName}</Text>
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
                  <Text style={{ color: '#2E6FF2', fontWeight: '800', fontSize: 14, marginRight: 6 }}>▼ {item.discountRate}%</Text>
                  <Text style={{ fontWeight: '800', fontSize: 16, color: '#111827' }}>₩{item.currentPrice.toLocaleString('ko-KR')}</Text>
                </View>
                <Text style={{ textDecorationLine: 'line-through', color: '#94A3B8', fontSize: 12 }}>₩{item.originalPrice.toLocaleString('ko-KR')}</Text>
              </View>
            </TouchableOpacity>
          );
        })}

        {MOCK_PRODUCTS.length > 3 ? (
          <TouchableOpacity
            style={{ paddingVertical: 14, alignItems: 'center', borderBottomWidth: 1, borderColor: '#F3F4F6' }}
            onPress={() => setActiveTab('상품')}
            activeOpacity={0.8}
          >
            <Text style={{ color: '#6B7280', fontSize: 14, fontWeight: '600' }}>상품 검색 결과 {MOCK_PRODUCTS.length}개 더보기 ›</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.ctaBox}>
            <Text style={styles.ctaText}>찾으시는 상품이 없나요?</Text>
            <TouchableOpacity style={styles.ctaBtn} activeOpacity={0.85}>
              <Text style={styles.ctaBtnText}>링크 붙여넣고 가격 추적</Text>
            </TouchableOpacity>
          </View>
        )}

        <SectionDivider />

        {/* Community section header */}
        <View style={[styles.sectionHeaderRow, { paddingTop: 24 }]}>
          <Text style={styles.sectionTitle}>커뮤니티 인기글 <Text style={styles.sectionCount}>{MOCK_POSTS.length}건</Text></Text>
          <TouchableOpacity onPress={() => setActiveTab('커뮤니티')} activeOpacity={0.8}>
            <Text style={styles.sectionViewAll}>전체 ›</Text>
          </TouchableOpacity>
        </View>

        {MOCK_POSTS.map((post) => (
          <PostItem key={post.id} post={post} />
        ))}
      </ScrollView>
    );
  }

  function renderProducts() {
    return (
      <FlatList
        data={MOCK_PRODUCTS}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRow}
            >
              {PRODUCT_FILTERS.map((f) => {
                const active = activeFilter === f.key;
                return (
                  <TouchableOpacity
                    key={f.key}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setActiveFilter(f.key)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{f.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <View style={[styles.sectionHeaderRow, { paddingBottom: 4 }]}>
              <Text style={styles.sectionTitle}>상품 검색 결과 <Text style={styles.sectionCount}>{MOCK_PRODUCTS.length}건</Text></Text>
            </View>
          </>
        }
        renderItem={({ item, index }) => (
          <ProductItem item={item} rank={index + 1} navigation={navigation} />
        )}
        ListFooterComponent={
          <View style={styles.ctaBox}>
            <Text style={styles.ctaText}>찾으시는 상품이 없나요?</Text>
            <TouchableOpacity style={styles.ctaBtn} activeOpacity={0.85}>
              <Text style={styles.ctaBtnText}>링크 붙여넣고 가격 추적</Text>
            </TouchableOpacity>
          </View>
        }
      />
    );
  }

  function renderCommunity() {
    const categories = ['전체', '질문', '꿀팁', '핫딜', '후기', '자유'];
    return (
      <View style={{ flex: 1, backgroundColor: '#fff' }}>
        <View style={styles.communityFilterRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
            {categories.map((cat, i) => (
              <TouchableOpacity
                key={cat}
                style={[styles.chip, i === 0 && styles.chipActive]}
                activeOpacity={0.8}
              >
                <Text style={[styles.chipText, i === 0 && styles.chipTextActive]}>{cat}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <View style={styles.communityEmptyState}>
          <Text style={{ fontSize: 32, marginBottom: 16 }}>💬</Text>
          <Text style={styles.communityEmptyTitle}>"{query || '검색어'}"에 대한 게시글이 없습니다.</Text>
          <Text style={styles.communityEmptySub}>다른 키워드로 검색하거나 직접 질문을 남겨보세요.</Text>
          <TouchableOpacity
            style={styles.communityWriteBtn}
            activeOpacity={0.85}
            onPress={() => navigation.navigate('커뮤니티', { screen: 'WritePost' })}
          >
            <Text style={styles.communityWriteBtnText}>+ 새 글 작성하기</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>

      {/* Header */}
      <View style={styles.searchHeader}>
        <TouchableOpacity onPress={() => navigation?.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>‹</Text>
        </TouchableOpacity>
        <View style={styles.searchBox}>
          <Text style={styles.searchQuery} numberOfLines={1}>{query || '검색어를 입력하세요'}</Text>
        </View>
      </View>

      {/* Tab Bar */}
      <View style={styles.tabBar}>
        {['통합', '상품', '커뮤니티'].map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tabItem, activeTab === tab && styles.tabItemActive]}
            onPress={() => setActiveTab(tab)}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      <View style={{ flex: 1 }}>
        {activeTab === '통합'    && renderIntegrated()}
        {activeTab === '상품'    && renderProducts()}
        {activeTab === '커뮤니티' && renderCommunity()}
      </View>

    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  searchHeader: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  backBtn:     { paddingRight: 8, paddingVertical: 4 },
  backBtnText: { fontSize: 24, color: '#0f172a', lineHeight: 28 },
  searchBox: {
    flex: 1, backgroundColor: '#f1f5f9', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  searchQuery: { fontSize: 14, color: '#0f172a' },

  tabBar:      { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#e2e8f0' },
  tabItem:     { flex: 1, paddingVertical: 14, alignItems: 'center', borderBottomWidth: 2, borderColor: 'transparent' },
  tabItemActive: { borderColor: '#0f172a' },
  tabText:       { fontSize: 15, color: '#64748b' },
  tabTextActive: { fontWeight: '700', color: '#0f172a' },

  sectionHeaderRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12,
  },
  sectionTitle:   { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  sectionCount:   { fontSize: 14, fontWeight: '600', color: '#2E6FF2' },
  sectionViewAll: { fontSize: 13, color: '#6B7280', fontWeight: '600' },

  sectionDivider: { height: 8, backgroundColor: '#F3F4F6', marginVertical: 8 },

  filterRow:      { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  chip:           { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, backgroundColor: '#F3F4F6' },
  chipActive:     { backgroundColor: '#2E6FF2' },
  chipText:       { fontSize: 13, fontWeight: '500', color: '#6B7280' },
  chipTextActive: { fontSize: 13, fontWeight: '700', color: '#fff' },

  productItem: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingVertical: 12, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  rankBox:        { width: 24, alignItems: 'center', marginRight: 10, flexShrink: 0, paddingTop: 2 },
  medalCircle:    { width: 22, height: 22, borderRadius: 11, justifyContent: 'center', alignItems: 'center' },
  medalText:      { color: '#fff', fontWeight: '700', fontSize: 11 },
  rankNumDefault: { fontSize: 14, fontWeight: '700', color: '#94a3b8' },
  itemThumb: {
    width: 60, height: 60, borderRadius: 8, marginRight: 12, flexShrink: 0,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#f1f5f9',
  },
  itemEmoji:       { fontSize: 24 },
  itemInfo:        { flex: 1 },
  itemName:        { fontSize: 13, fontWeight: '500', color: '#1e293b', lineHeight: 18, marginBottom: 4 },
  itemBrand:       { fontSize: 12, color: '#94a3b8', fontWeight: '400' },
  itemRatingRow:   { flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: 4 },
  itemRating:      { fontSize: 12, fontWeight: '600', color: '#495057' },
  itemReviewCount: { fontSize: 11, color: '#adb5bd' },
  itemPriceRow:      { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 4 },
  itemDiscount:      { fontSize: 13, fontWeight: '800', color: '#2E6FF2' },
  itemPrice:         { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  itemOriginalPrice: { fontSize: 12, color: '#94a3b8', textDecorationLine: 'line-through', marginTop: 2 },

  postItem: {
    backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  postBoard:   { fontSize: 12, color: '#2E6FF2', fontWeight: '600', marginBottom: 4 },
  postTitle:   { fontSize: 15, fontWeight: '700', color: '#1e293b', marginBottom: 4, lineHeight: 20 },
  postSnippet: { fontSize: 13, color: '#64748b', lineHeight: 18 },
  postMetaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4, marginTop: 8 },
  postAuthor:  { fontSize: 12, color: '#64748b', fontWeight: '600' },
  postMetaDot: { fontSize: 12, color: '#cbd5e1' },
  postMeta:    { fontSize: 12, color: '#94a3b8' },

  communityFilterRow:  { paddingVertical: 12, borderBottomWidth: 1, borderColor: '#f1f5f9' },
  communityEmptyState: { flex: 1, alignItems: 'center', marginTop: 80, paddingHorizontal: 32 },
  communityEmptyTitle: { fontSize: 16, fontWeight: '700', color: '#1e293b', textAlign: 'center' },
  communityEmptySub:   { fontSize: 14, color: '#94a3b8', marginTop: 8, textAlign: 'center' },
  communityWriteBtn:   { marginTop: 24, paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8, borderWidth: 1, borderColor: '#2E6FF2' },
  communityWriteBtnText: { color: '#2E6FF2', fontWeight: '700' },

  ctaBox: {
    backgroundColor: '#f8fafc', marginHorizontal: 16, marginTop: 16, marginBottom: 16,
    padding: 20, borderRadius: 12, alignItems: 'center',
    borderWidth: 1, borderColor: '#e2e8f0',
  },
  ctaText:    { fontSize: 14, color: '#475569', marginBottom: 10 },
  ctaBtn:     { backgroundColor: '#0f172a', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8 },
  ctaBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
