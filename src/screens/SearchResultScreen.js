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
  { id: 's1', brand: '하기스',   name: '네이처메이드 기저귀 신생아용 100매 초슬림 풀박스',      rating: 4.9, reviewCount: 2140, discount: 45, price: 28900,  emoji: '🧷', bg: '#fef9c3' },
  { id: 's2', brand: '헤겐',     name: '와이드넥 PP 젖병 세트 160ml + 240ml 4개입 신생아',     rating: 4.8, reviewCount: 1893, discount: 24, price: 34900,  emoji: '🍼', bg: '#ede9fe' },
  { id: 's3', brand: '매일유업', name: '앱솔루트 분유 스텝2 800g × 2캔 DHA 강화 패키지',       rating: 4.7, reviewCount: 2104, discount: 22, price: 58900,  emoji: '🥛', bg: '#f0fdf4' },
  { id: 's4', brand: '팸퍼스',   name: '하이비 프리미엄 기저귀 L사이즈 56매',                  rating: 4.7, reviewCount: 1743, discount: 29, price: 26900,  emoji: '🧷', bg: '#fef9c3' },
  { id: 's5', brand: '스토케',   name: '스쿠트5 바운서 스트롤러 신생아부터 사용 가능',          rating: 4.9, reviewCount:  875, discount: 22, price: 249000, emoji: '🛒', bg: '#ecfdf5' },
];

const MOCK_POSTS = [
  { id: 'p1', board: '맘카페',    title: '신생아 기저귀 하기스 vs 팸퍼스 실제 써본 후기',        snippet: '두 달째 써보니 확실히 하기스가 허벅지 밀림이 적더라고요...', commentCount: 34, viewCount: 1240, author: '익명의 세이브루맘', likeCount: 47 },
  { id: 'p2', board: '핫딜/할인', title: '쿠팡 분유 역대 최저가 떴어요! 오늘 마감',             snippet: '앱솔루트 스텝2 2캔 세트가 58,900원이에요. 놓치지 마세요',   commentCount: 18, viewCount:  870, author: '절약맘_서울',       likeCount: 32 },
  { id: 'p3', board: '육아정보',  title: '6개월 이유식 시작할 때 꼭 필요한 준비물 총정리',        snippet: '이유식 용기, 스푼, 냉동백... 저도 처음엔 뭐가 필요한지',   commentCount: 12, viewCount:  340, author: '두아이맘_경기',      likeCount: 19 },
];

const PRODUCT_FILTERS = [
  { key: 'discount', label: '🔥 할인율 높은 순' },
  { key: 'lowest',   label: '📉 역대 최저가 근접' },
  { key: 'rating',   label: '⭐ 평점 높은 순' },
  { key: 'review',   label: '💬 리뷰 많은 순' },
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
      <View style={styles.rankBox}>
        {medal ? (
          <View style={[styles.medalCircle, { backgroundColor: medal }]}>
            <Text style={styles.medalText}>{rank}</Text>
          </View>
        ) : (
          <Text style={styles.rankNumDefault}>{rank}</Text>
        )}
        <View style={styles.rankDash} />
      </View>
      <View style={styles.itemThumb}>
        <Text style={styles.itemEmoji}>{item.emoji}</Text>
      </View>
      <View style={styles.itemInfo}>
        <Text numberOfLines={2} style={{ lineHeight: 19 }}>
          <Text style={{ fontSize: 12, fontWeight: '400', color: '#adb5bd' }}>{item.brand} </Text>
          <Text style={{ fontSize: 13, fontWeight: '500', color: '#212529' }}>{item.name}</Text>
        </Text>
        <View style={styles.itemRatingRow}>
          <Text style={{ fontSize: 12 }}>⭐</Text>
          <Text style={styles.itemRating}>{item.rating}</Text>
          <Text style={styles.itemReviewCount}>({item.reviewCount.toLocaleString('ko-KR')})</Text>
        </View>
        <View style={styles.itemPriceRow}>
          <Text style={styles.itemDiscount}>{item.discount}%</Text>
          <Text style={styles.itemPrice}>{item.price.toLocaleString('ko-KR')}원</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function PostItem({ post }) {
  return (
    <View style={styles.postItem}>
      <Text style={styles.postBoard}>{post.board}</Text>
      <Text style={styles.postTitle}>{post.title}</Text>
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

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function SearchResultScreen({ navigation, route }) {
  const query = route?.params?.query || '';
  const [activeTab, setActiveTab] = useState('통합');
  const [activeFilter, setActiveFilter] = useState('discount');

  function renderIntegrated() {
    return (
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 0 }}>
        {/* Product section header */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>상품 검색 결과 {MOCK_PRODUCTS.length}건</Text>
        </View>
        {MOCK_PRODUCTS.slice(0, 3).map((p, i) => (
          <ProductItem key={p.id} item={p} rank={i + 1} navigation={navigation} />
        ))}
        <TouchableOpacity style={styles.moreBtn} onPress={() => setActiveTab('상품')} activeOpacity={0.8}>
          <Text style={styles.moreBtnText}>상품 전체보기 ›</Text>
        </TouchableOpacity>

        {/* Community section header with 전체보기 */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>커뮤니티 인기글</Text>
          <TouchableOpacity onPress={() => setActiveTab('커뮤니티')} activeOpacity={0.8}>
            <Text style={styles.sectionViewAll}>전체보기 ›</Text>
          </TouchableOpacity>
        </View>
        {MOCK_POSTS.map((post) => (
          <PostItem key={post.id} post={post} />
        ))}

        <View style={styles.ctaBox}>
          <Text style={styles.ctaText}>찾으시는 상품이 없나요?</Text>
          <TouchableOpacity style={styles.ctaBtn} activeOpacity={0.85}>
            <Text style={styles.ctaBtnText}>🔗 링크 붙여넣고 가격 추적</Text>
          </TouchableOpacity>
        </View>
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
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>상품 검색 결과 {MOCK_PRODUCTS.length}건</Text>
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
              <Text style={styles.ctaBtnText}>🔗 링크 붙여넣고 가격 추적</Text>
            </TouchableOpacity>
          </View>
        }
      />
    );
  }

  const renderCommunity = () => {
    const categories = ['전체', '질문', '꿀팁', '핫딜', '후기', '자유'];
    const searchQuery = query || '검색어';

    return (
      <View style={{ flex: 1, backgroundColor: '#fff' }}>

        {/* Category Chips Horizontal Scroll */}
        <View style={{ paddingVertical: 12, borderBottomWidth: 1, borderColor: '#f1f5f9' }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16 }}>
            {categories.map((cat, index) => (
              <TouchableOpacity
                key={index}
                style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: index === 0 ? '#0f172a' : '#e2e8f0', backgroundColor: index === 0 ? '#0f172a' : '#fff', marginRight: 8 }}
                activeOpacity={0.8}
              >
                <Text style={{ color: index === 0 ? '#fff' : '#64748b', fontWeight: index === 0 ? 'bold' : 'normal', fontSize: 14 }}>
                  {cat}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Empty State Content */}
        <View style={{ flex: 1, alignItems: 'center', marginTop: 80 }}>
          <Text style={{ fontSize: 32, marginBottom: 16 }}>💬</Text>
          <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#1e293b' }}>
            "{searchQuery}"에 대한 게시글이 없습니다.
          </Text>
          <Text style={{ fontSize: 14, color: '#94a3b8', marginTop: 8 }}>
            다른 키워드로 검색하거나 직접 질문을 남겨보세요.
          </Text>
          <TouchableOpacity style={{ marginTop: 24, paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8, borderWidth: 1, borderColor: '#3b82f6' }} activeOpacity={0.85} onPress={() => navigation.navigate('커뮤니티', { screen: 'WritePost' })}>
            <Text style={{ color: '#3b82f6', fontWeight: 'bold' }}>+ 새 글 작성하기</Text>
          </TouchableOpacity>
        </View>

      </View>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>

      {/* 1. Header */}
      <View style={styles.searchHeader}>
        <TouchableOpacity onPress={() => navigation?.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>‹</Text>
        </TouchableOpacity>
        <View style={styles.searchBox}>
          <Text style={styles.searchQuery} numberOfLines={1}>{query || '검색어를 입력하세요'}</Text>
        </View>
      </View>

      {/* 2. Tab Bar */}
      <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: '#e2e8f0' }}>
        {['통합', '상품', '커뮤니티'].map((tab) => (
          <TouchableOpacity
            key={tab}
            style={{
              flex: 1, paddingVertical: 14, alignItems: 'center',
              borderBottomWidth: activeTab === tab ? 2 : 0,
              borderColor: '#0f172a',
            }}
            onPress={() => setActiveTab(tab)}
            activeOpacity={0.8}
          >
            <Text style={{
              fontSize: 15,
              fontWeight: activeTab === tab ? 'bold' : 'normal',
              color: activeTab === tab ? '#0f172a' : '#64748b',
            }}>
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 3. CONTENT AREA */}
      <View style={{ flex: 1 }}>
        {activeTab === '통합' && renderIntegrated()}
        {activeTab === '상품' && renderProducts()}

        {/* 4. FORCE COMMUNITY UI HERE */}
        {activeTab === '커뮤니티' && (
          <View style={{ flex: 1, backgroundColor: '#fff' }}>

            {/* Horizontal Categories */}
            <View style={{ paddingVertical: 12, borderBottomWidth: 1, borderColor: '#f1f5f9' }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16 }}>
                {['전체', '질문', '꿀팁', '핫딜', '후기', '자유'].map((cat, index) => (
                  <TouchableOpacity
                    key={index}
                    style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: index === 0 ? '#0f172a' : '#e2e8f0', backgroundColor: index === 0 ? '#0f172a' : '#fff', marginRight: 8 }}
                    activeOpacity={0.8}
                  >
                    <Text style={{ color: index === 0 ? '#fff' : '#64748b', fontWeight: index === 0 ? 'bold' : 'normal', fontSize: 14 }}>
                      {cat}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Empty State */}
            <View style={{ flex: 1, alignItems: 'center', marginTop: 80 }}>
              <Text style={{ fontSize: 32, marginBottom: 16 }}>💬</Text>
              <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#1e293b' }}>
                해당 키워드에 대한 게시글이 없습니다.
              </Text>
              <Text style={{ fontSize: 14, color: '#94a3b8', marginTop: 8 }}>
                다른 키워드로 검색하거나 직접 질문을 남겨보세요.
              </Text>
              <TouchableOpacity style={{ marginTop: 24, paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8, borderWidth: 1, borderColor: '#3b82f6' }} activeOpacity={0.85} onPress={() => navigation.navigate('커뮤니티', { screen: 'WritePost' })}>
                <Text style={{ color: '#3b82f6', fontWeight: 'bold' }}>+ 새 글 작성하기</Text>
              </TouchableOpacity>
            </View>

          </View>
        )}
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

  sectionHeader:    { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  sectionHeaderRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8,
  },
  sectionTitle:   { fontSize: 18, fontWeight: 'bold', color: '#0f172a' },
  sectionViewAll: { fontSize: 13, color: '#3b82f6', fontWeight: '600' },
  moreBtn:        { alignItems: 'flex-end', paddingHorizontal: 16, paddingBottom: 12 },
  moreBtnText:    { fontSize: 13, color: '#3b82f6', fontWeight: '600' },

  filterRow: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  chip: {
    paddingVertical: 6, paddingHorizontal: 14, borderRadius: 20,
    borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#fff',
  },
  chipActive:     { backgroundColor: '#0f172a', borderColor: '#0f172a' },
  chipText:       { fontSize: 13, color: '#475569' },
  chipTextActive: { fontSize: 13, color: '#fff', fontWeight: '600' },

  productItem: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: '#fff', borderRadius: 12,
    borderWidth: 1, borderColor: '#f1f5f9',
    paddingVertical: 12, paddingHorizontal: 14,
    marginBottom: 8, marginHorizontal: 16,
  },
  rankBox:        { width: 24, alignItems: 'center', marginRight: 8, flexShrink: 0 },
  medalCircle:    { width: 22, height: 22, borderRadius: 11, justifyContent: 'center', alignItems: 'center' },
  medalText:      { color: '#fff', fontWeight: 'bold', fontSize: 11 },
  rankDash:       { width: 8, height: 2, backgroundColor: '#cbd5e1', marginTop: 4 },
  rankNumDefault: { fontSize: 14, fontWeight: 'bold', color: '#64748b' },
  itemThumb: {
    width: 64, height: 64, borderRadius: 4, marginRight: 12, flexShrink: 0,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff',
  },
  itemEmoji:       { fontSize: 26 },
  itemInfo:        { flex: 1, marginTop: -2 },
  itemRatingRow:   { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  itemRating:      { fontSize: 12, fontWeight: 'bold', color: '#495057', marginLeft: 2 },
  itemReviewCount: { fontSize: 11, color: '#adb5bd', marginLeft: 2 },
  itemPriceRow:    { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  itemDiscount:    { fontSize: 14, fontWeight: '700', color: '#fa5252', marginRight: 4 },
  itemPrice:       { fontSize: 14, fontWeight: '700', color: '#212529' },

  postItem: {
    backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  postBoard:    { fontSize: 12, color: '#3b82f6', fontWeight: '600', marginBottom: 4 },
  postTitle:    { fontSize: 15, fontWeight: 'bold', color: '#1e293b', marginBottom: 3 },
  postSnippet:  { fontSize: 13, color: '#64748b' },
  postMetaRow:  { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4, marginTop: 6 },
  postAuthor:   { fontSize: 12, color: '#64748b', fontWeight: '600' },
  postMetaDot:  { fontSize: 12, color: '#cbd5e1' },
  postMeta:     { fontSize: 12, color: '#94a3b8' },

  ctaBox: {
    backgroundColor: '#f8fafc', marginHorizontal: 16, marginTop: 8, marginBottom: 16, padding: 20,
    borderRadius: 12, alignItems: 'center',
    borderWidth: 1, borderColor: '#e2e8f0',
  },
  ctaText:    { fontSize: 14, color: '#475569', marginBottom: 8 },
  ctaBtn:     { backgroundColor: '#0f172a', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8 },
  ctaBtnText: { fontSize: 14, fontWeight: 'bold', color: '#fff' },
});
