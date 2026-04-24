import React, { useMemo, useState } from 'react';
import {
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Eye, FileText, Heart, MessageCircle, MessageSquare, Search, ThumbsUp } from 'lucide-react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { COLORS } from '../constants/theme';

function UserSilhouetteIcon({ size = 36, color = '#fff' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="8" r="4" stroke={color} strokeWidth={1.8} />
      <Path d="M4 20c0-4 3.582-7 8-7s8 3 8 7" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

// ─── Tab config ──────────────────────────────────────────────────────────────

const TABS = [
  { key: 'posts',          label: '작성글',      countKey: 'postCount',    Icon: FileText },
  { key: 'comments',       label: '작성댓글',    countKey: 'commentCount', Icon: MessageCircle },
  { key: 'commentedPosts', label: '댓글단 글',   countKey: null,           Icon: MessageSquare },
  { key: 'likes',          label: '좋아요한 글', countKey: 'likesCount',   Icon: Heart },
];

const ROUTE_TO_TAB = {
  posts: 'posts', comments: 'comments', commentedPosts: 'commentedPosts', likes: 'likes',
};

// ─── Mock data ───────────────────────────────────────────────────────────────

const MOCK_POSTS = [
  { id: 'p1', category: '질문', title: '하기스 vs 마미포코 뭐가 더 좋아요?',    content: '', nickname: '노을맘', createdAt: '2026.04.21', viewCount: 312,  commentCount: 14, likeCount: 28  },
  { id: 'p2', category: '후기', title: '세이브루 핫딜로 분유 30% 할인 받았어요', content: '', nickname: '노을맘', createdAt: '2026.04.18', viewCount: 508,  commentCount: 22, likeCount: 47  },
  { id: 'p3', category: '질문', title: '아기 이유식 시작 시기 궁금해요',         content: '', nickname: '노을맘', createdAt: '2026.04.14', viewCount: 189,  commentCount: 9,  likeCount: 15  },
];

const MOCK_COMMENTS = [
  { id: 'c1', title: '저도 마미포코 쓰는데 피부 트러블 없었어요!',  content: '저도 마미포코 쓰는데 피부 트러블 없었어요! 추천합니다', originalTitle: '기저귀 브랜드 추천 부탁드려요',    createdAt: '2026.04.22' },
  { id: 'c2', title: '세이브루 관심상품 등록하면 알림 와요',         content: '세이브루 관심상품 등록하면 가격 떨어질 때 알림 와요 :)', originalTitle: '분유 최저가 어디서 사나요',       createdAt: '2026.04.20' },
  { id: 'c3', title: '보통 6개월 전후로 시작해도 괜찮아요',          content: '보통 6개월 전후로 시작해도 괜찮아요. 아이 발달 상황 보면서요', originalTitle: '이유식 언제 시작했어요?', createdAt: '2026.04.17' },
];

const MOCK_COMMENTED_POSTS = [
  { id: 'cp1', title: '기저귀 브랜드 추천 부탁드려요', content: '', nickname: '별이맘', createdAt: '2026.04.22', viewCount: 1024, commentCount: 38, likeCount: 62  },
  { id: 'cp2', title: '분유 최저가 어디서 사나요',    content: '', nickname: '하늘맘', createdAt: '2026.04.19', viewCount: 741,  commentCount: 27, likeCount: 33  },
];

const MOCK_LIKED_POSTS = [
  { id: 'lp1', title: '쿠팡 로켓배송 vs 새벽배송 비교 후기',      content: '', nickname: '봄이맘', createdAt: '2026.04.23', viewCount: 2108, commentCount: 51, likeCount: 134 },
  { id: 'lp2', title: '유아 크림 순한 제품 추천해드려요',          content: '', nickname: '솜이맘', createdAt: '2026.04.20', viewCount: 885,  commentCount: 19, likeCount: 77  },
  { id: 'lp3', title: '아기 카시트 비교 총정리 (2026년 기준)',    content: '', nickname: '달이맘', createdAt: '2026.04.15', viewCount: 3402, commentCount: 88, likeCount: 210 },
];

const TAB_DATA = {
  posts: MOCK_POSTS, comments: MOCK_COMMENTS, commentedPosts: MOCK_COMMENTED_POSTS, likes: MOCK_LIKED_POSTS,
};

const EMPTY = {
  posts:          { title: '작성한 글이 없습니다.',    hint: '커뮤니티에 첫 글을 남겨보세요.' },
  comments:       { title: '작성한 댓글이 없습니다.',  hint: '게시글에 댓글을 달면 여기에 표시돼요.' },
  commentedPosts: { title: '댓글을 단 글이 없습니다.', hint: '다른 분의 글에 댓글을 달아보세요.' },
  likes:          { title: '좋아요한 글이 없습니다.',  hint: '마음에 드는 글에 좋아요를 눌러보세요.' },
};

const fmt = (n) => (n ?? 0).toLocaleString();

// ─── List item components ─────────────────────────────────────────────────────

function PostItem({ item }) {
  return (
    <TouchableOpacity style={styles.listItem} activeOpacity={0.7}>
      <Text style={styles.itemTitle} numberOfLines={2}>
        {item.category ? `[${item.category}] ${item.title}` : item.title}
      </Text>
      <View style={styles.itemMeta}>
        <Text style={styles.metaText}>{item.nickname}</Text>
        <Text style={styles.metaDot}>·</Text>
        <Text style={styles.metaText}>{item.createdAt}</Text>
        <Text style={styles.metaDot}>·</Text>
        <View style={styles.metaIconRow}>
          <Eye size={11} color="#94a3b8" strokeWidth={1.8} />
          <Text style={styles.metaText}>{fmt(item.viewCount)}</Text>
        </View>
        <Text style={styles.metaDot}>·</Text>
        <View style={styles.metaIconRow}>
          <MessageCircle size={11} color="#94a3b8" strokeWidth={1.8} />
          <Text style={styles.metaText}>{fmt(item.commentCount)}</Text>
        </View>
        <Text style={styles.metaDot}>·</Text>
        <View style={styles.metaIconRow}>
          <ThumbsUp size={11} color="#94a3b8" strokeWidth={1.8} />
          <Text style={styles.metaText}>{fmt(item.likeCount)}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function CommentItem({ item }) {
  return (
    <TouchableOpacity style={styles.listItem} activeOpacity={0.7}>
      <Text style={styles.itemTitle} numberOfLines={2}>{item.content}</Text>
      <View style={styles.itemMeta}>
        <MessageSquare size={11} color="#94a3b8" strokeWidth={1.8} />
        <Text style={[styles.metaText, styles.metaOrigTitle]} numberOfLines={1}>{item.originalTitle}</Text>
        <Text style={styles.metaDot}>·</Text>
        <Text style={styles.metaText}>{item.createdAt}</Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function MyActivityScreen({ route }) {
  const routeTab     = route?.params?.activeTab    ?? 'posts';
  const postCount    = route?.params?.postCount    ?? 0;
  const commentCount = route?.params?.commentCount ?? 0;
  const likesCount   = route?.params?.likesCount   ?? 0;
  const nickname     = route?.params?.nickname     ?? '노을맘';

  const initialKey = ROUTE_TO_TAB[routeTab] ?? 'posts';
  const [activeKey,    setActiveKey]    = useState(initialKey);
  const [searchQuery,  setSearchQuery]  = useState('');

  const counts = { postCount, commentCount, likesCount };

  const filteredData = useMemo(() => {
    const raw = TAB_DATA[activeKey] ?? [];
    const q   = searchQuery.trim().toLowerCase();
    if (!q) return raw;
    return raw.filter((item) => {
      const inTitle   = (item.title   ?? '').toLowerCase().includes(q);
      const inContent = (item.content ?? '').toLowerCase().includes(q);
      return inTitle || inContent;
    });
  }, [activeKey, searchQuery]);

  const empty  = EMPTY[activeKey];

  const renderItem = ({ item }) =>
    activeKey === 'comments' ? <CommentItem item={item} /> : <PostItem item={item} />;

  return (
    <View style={styles.container}>

      {/* ── Profile summary header ── */}
      <View style={styles.profileHeader}>
        <View style={styles.avatarCircle}>
          <UserSilhouetteIcon size={26} color="#fff" />
        </View>
        <View style={styles.profileInfo}>
          <Text style={styles.profileNickname}>{nickname}</Text>
          <View style={styles.profileStatRow}>
            <Text style={styles.profileStatText}>방문 5회</Text>
            <Text style={styles.profileStatDot}>·</Text>
            <Text style={styles.profileStatText}>작성글 {fmt(postCount)}</Text>
            <Text style={styles.profileStatDot}>·</Text>
            <Text style={styles.profileStatText}>댓글 {fmt(commentCount)}</Text>
          </View>
        </View>
      </View>

      {/* ── Naver Cafe-style horizontal top tab bar ── */}
      <View style={styles.tabBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabBarContent}
        >
          {TABS.map((tab) => {
            const isActive = activeKey === tab.key;
            const count    = tab.countKey ? (counts[tab.countKey] ?? 0) : 0;
            return (
              <TouchableOpacity
                key={tab.key}
                style={styles.tabItem}
                onPress={() => { setActiveKey(tab.key); setSearchQuery(''); }}
                activeOpacity={0.7}
              >
                <View style={styles.tabLabelRow}>
                  <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                    {tab.label}
                  </Text>
                  {count > 0 && (
                    <View style={[styles.tabBadge, isActive && styles.tabBadgeActive]}>
                      <Text style={[styles.tabBadgeText, isActive && styles.tabBadgeTextActive]}>
                        {fmt(count)}
                      </Text>
                    </View>
                  )}
                </View>
                {isActive && <View style={styles.tabIndicator} />}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* ── Search bar ── */}
      <View style={styles.searchWrap}>
        <Search size={15} color="#94a3b8" strokeWidth={2} />
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="내 활동 검색"
          placeholderTextColor="#94a3b8"
          returnKeyType="search"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
      </View>

      {/* ── Content ── */}
      {filteredData.length > 0 ? (
        <FlatList
          data={filteredData}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ItemSeparatorComponent={() => <View style={styles.listSep} />}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        />
      ) : (
        <View style={styles.emptyContent}>
          {searchQuery.trim() ? (
            <>
              <Search size={40} color="#e2e8f0" strokeWidth={1.4} />
              <Text style={styles.emptyTitle}>검색 결과가 없습니다.</Text>
              <Text style={styles.emptyHint}>다른 검색어로 시도해보세요.</Text>
            </>
          ) : (
            (() => {
              const { Icon } = TABS.find((t) => t.key === activeKey);
              return (
                <>
                  <Icon size={42} color="#e2e8f0" strokeWidth={1.4} />
                  <Text style={styles.emptyTitle}>{empty.title}</Text>
                  <Text style={styles.emptyHint}>{empty.hint}</Text>
                </>
              );
            })()
          )}
        </View>
      )}

    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },

  // ── Profile header ──
  profileHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  avatarCircle: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  profileInfo:     { flex: 1, gap: 3 },
  profileNickname: { fontSize: 16, fontWeight: '900', color: '#0f172a' },
  profileStatRow:  { flexDirection: 'row', alignItems: 'center', gap: 5 },
  profileStatText: { fontSize: 12, fontWeight: '500', color: '#64748b' },
  profileStatDot:  { fontSize: 10, color: '#cbd5e1' },

  // ── Tab bar ──
  tabBar: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  tabBarContent: { flexDirection: 'row', paddingHorizontal: 8 },
  tabItem: {
    paddingHorizontal: 14, paddingTop: 13, paddingBottom: 12,
    position: 'relative', alignItems: 'center', justifyContent: 'center', minWidth: 72,
  },
  tabLabelRow:        { flexDirection: 'row', alignItems: 'center', gap: 5 },
  tabLabel:           { fontSize: 14, fontWeight: '500', color: '#94a3b8', letterSpacing: 0.1 },
  tabLabelActive:     { fontWeight: '800', color: '#0f172a' },
  tabBadge:           { minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  tabBadgeActive:     { backgroundColor: COLORS.primary },
  tabBadgeText:       { fontSize: 10, fontWeight: '700', color: '#64748b' },
  tabBadgeTextActive: { color: '#fff' },
  tabIndicator:       { position: 'absolute', bottom: 0, left: 0, right: 0, height: 2.5, backgroundColor: COLORS.primary, borderTopLeftRadius: 2, borderTopRightRadius: 2 },

  // ── Search bar ──
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#f8fafc',
    marginHorizontal: 14, marginVertical: 10,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9,
    borderWidth: 1, borderColor: '#e2e8f0',
  },
  searchInput: {
    flex: 1, fontSize: 14, fontWeight: '400', color: '#0f172a', paddingVertical: 0,
  },

  // ── List ──
  listContent: { paddingVertical: 4 },
  listSep:     { height: 1, backgroundColor: '#f1f5f9', marginLeft: 16 },
  listItem:    { paddingHorizontal: 16, paddingVertical: 13, gap: 6 },
  itemTitle:   { fontSize: 14, fontWeight: '700', color: '#0f172a', lineHeight: 20 },
  itemMeta:    { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
  metaText:    { fontSize: 11, color: '#94a3b8' },
  metaDot:     { fontSize: 10, color: '#cbd5e1' },
  metaIconRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  metaOrigTitle: { flex: 1, maxWidth: 160 },

  // ── Empty state ──
  emptyContent: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 32 },
  emptyTitle:   { fontSize: 15, fontWeight: '700', color: '#94a3b8', marginTop: 4 },
  emptyHint:    { fontSize: 13, color: '#cbd5e1', textAlign: 'center', lineHeight: 19 },
});
