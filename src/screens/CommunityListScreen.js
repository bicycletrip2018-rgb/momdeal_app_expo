import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import GlobalHeader from '../components/GlobalHeader';
import { useFocusEffect } from '@react-navigation/native';
import { getPosts } from '../services/communityService';
import { getMockGamification } from '../utils/gamification';

// ─── Filter chips ─────────────────────────────────────────────────────────────

const FILTERS = [
  { key: null,       label: '전체' },
  { key: 'question', label: '🙋‍♀️ 질문' },
  { key: 'tip',      label: '🍯 꿀팁' },
  { key: 'deal',     label: '🔥 핫딜' },
  { key: 'review',   label: '📝 후기' },
  { key: 'free',     label: '💬 자유' },
];

// ─── Tag styling ──────────────────────────────────────────────────────────────

const TAG_META = {
  question: { label: '질문',   bg: '#eff6ff', text: '#2563eb' },
  tip:       { label: '꿀팁',   bg: '#f0fdf4', text: '#16a34a' },
  deal:      { label: '핫딜',   bg: '#fef3c7', text: '#b45309' },
  review:    { label: '후기',   bg: '#fce7f3', text: '#9d174d' },
  free:      { label: '자유',   bg: '#f1f5f9', text: '#475569' },
  region:    { label: '지역',   bg: '#f5f3ff', text: '#7c3aed' },
};

// ─── Gamification UI helpers ──────────────────────────────────────────────────
// GamPill renders any { label, bg, text } object (tier or badge) as a compact pill.

function GamPill({ item: pill }) {
  if (!pill) return null;
  return (
    <View style={[styles.badgePill, { backgroundColor: pill.bg }]}>
      <Text style={[styles.badgePillText, { color: pill.text }]}>{pill.label}</Text>
    </View>
  );
}

// ─── Mock posts (shown when Firestore returns nothing) ────────────────────────

const MOCK_POSTS = [
  {
    postId: 'mock1', category: 'question',
    title: '67개월 아이 영양제 뭐 먹이세요?',
    content: '비타민D랑 오메가3 먹이려고 하는데 다들 어떤 브랜드 쓰시나요? 맛이 없으면 안 먹으려 해서요 😭',
    nickname: '67개월 노을맘', viewCount: 1243, commentCount: 18, timeAgo: '23분 전',
  },
  {
    postId: 'mock2', category: 'tip',
    title: '기저귀 발진 잡는 법 총정리 (경험담)',
    content: '밤새 울어서 정말 힘들었는데 이 방법으로 3일 만에 완치! 좌욕 + 징크 크림 조합이 신의 한 수였어요.',
    nickname: '15개월 별이맘', viewCount: 3401, commentCount: 42, timeAgo: '1시간 전',
  },
  {
    postId: 'mock3', category: 'deal',
    title: '하기스 기저귀 역대급 할인 중 🔥 오늘만!',
    content: '쿠팡 로켓배송 하기스 네이처메이드 M 144매 19,900원. 파트너스 활동 통해 적립 가능해요~',
    nickname: '8개월 콩이맘', viewCount: 892, commentCount: 7, timeAgo: '2시간 전',
  },
  {
    postId: 'mock4', category: 'review',
    title: '노리플레이 블록 한 달 써본 솔직 후기',
    content: '돌 지난 아이한테 샀는데 생각보다 훨씬 오래 갖고 놀아요. 삼킴 위험 없는 큰 사이즈라 안심하고 줄 수 있어요.',
    nickname: '13개월 하나맘', viewCount: 564, commentCount: 12, timeAgo: '5시간 전',
  },
  {
    postId: 'mock5', category: 'free',
    title: '아이 낮잠 안 자는 거 어떻게 극복하셨어요 ㅠ',
    content: '24개월 지나고부터 낮잠을 완전히 거부하는데 밤에도 늦게 자서 저도 너무 힘드네요. 비슷한 분 있으신가요?',
    nickname: '24개월 솔이맘', viewCount: 2107, commentCount: 29, timeAgo: '어제',
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPostTime(date) {
  if (!date) return '';
  const now  = new Date();
  const diff = (now.getTime() - date.getTime()) / 1000; // seconds

  // Same calendar day → relative or HH:MM
  const isSameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth()    === now.getMonth()    &&
    date.getDate()     === now.getDate();

  if (isSameDay) {
    if (diff < 60)   return '방금 전';
    if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
    // Show clock time for older same-day posts
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  // Past day → "YYYY. M. D."
  return `${date.getFullYear()}. ${date.getMonth() + 1}. ${date.getDate()}.`;
}

// ─── Post Card ────────────────────────────────────────────────────────────────

function PostCard({ item, onPress }) {
  const tag  = item.category ? (TAG_META[item.category] ?? { label: item.category, bg: '#f1f5f9', text: '#475569' }) : null;
  // Use userId for live Firestore posts; nickname for mocks — ensures every post gets gamification
  const gam  = getMockGamification(item.userId || item.nickname || item.postId);
  const date = item.createdAt?.toDate ? item.createdAt.toDate() : null;
  const time = item.timeAgo ?? (date ? formatPostTime(date) : '');
  const views = item.viewCount    ?? 0;
  const cmts  = item.commentCount ?? 0;
  const preview = item.content ?? item.contentPreview ?? '';

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      {/* Tag + Title row */}
      <View style={styles.cardTop}>
        {tag && (
          <View style={[styles.tagPill, { backgroundColor: tag.bg }]}>
            <Text style={[styles.tagText, { color: tag.text }]}>{tag.label}</Text>
          </View>
        )}
        <Text style={styles.cardTitle} numberOfLines={1}>{item.title || '(제목 없음)'}</Text>
      </View>

      {/* Content preview */}
      {preview.length > 0 && (
        <Text style={styles.cardPreview} numberOfLines={2}>{preview}</Text>
      )}

      {/* Footer: [tier] [badge] nickname · time   views comments */}
      <View style={styles.cardFooter}>
        <GamPill item={gam.tier} />
        <GamPill item={gam.badge} />
        <Text style={styles.cardAuthor}>{item.nickname || '익명'}</Text>
        {time.length > 0 && <Text style={styles.cardDot}>·</Text>}
        {time.length > 0 && <Text style={styles.cardMeta}>{time}</Text>}
        <View style={{ flex: 1 }} />
        {views > 0 && (
          <Text style={styles.cardStat}>👁 {views.toLocaleString('ko-KR')}</Text>
        )}
        {cmts > 0 && (
          <Text style={styles.cardStat}>💬 {cmts}</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function CommunityListScreen({ navigation }) {
  const [posts, setPosts]               = useState([]);
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);
  const [activeFilter, setActiveFilter] = useState(null);

  const loadPosts = useCallback(async () => {
    try {
      const data = await getPosts(activeFilter);
      setPosts(data);
    } catch (err) {
      console.log('CommunityListScreen loadPosts error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeFilter]);

  useEffect(() => { setLoading(true); loadPosts(); }, [loadPosts]);
  useFocusEffect(useCallback(() => { loadPosts(); }, [loadPosts]));

  const handlePress = (item) => {
    if (item.postId?.startsWith('mock')) {
      Alert.alert('', '아직 실제 게시글이 없어요. 첫 번째 글을 남겨보세요! 🎉');
      return;
    }
    if (item.category === 'region') {
      Alert.alert('지역 게시판', 'GPS 위치 인증이 필요한 게시판입니다. (준비 중)');
      return;
    }
    navigation.navigate('PostDetail', {
      postId:    item.postId,
      title:     item.title,
      content:   item.content,
      category:  item.category,
      likeCount: item.likeCount ?? 0,
      likedBy:   item.likedBy   ?? [],
      imageUrls: item.imageUrls ?? [],
      userId:    item.userId,
      nickname:  item.nickname,
      isVerified: item.isVerified,
      viewCount:  item.viewCount,
      // Serialize Timestamp → ISO string so React Navigation can pass it safely
      createdAt: item.createdAt?.toDate ? item.createdAt.toDate().toISOString() : (item.createdAt ?? null),
    });
  };

  // Show mocks when Firestore returns nothing.
  const displayPosts = posts.length > 0
    ? posts
    : (loading ? [] : MOCK_POSTS.filter((p) => activeFilter === null || p.category === activeFilter));

  return (
    <View style={styles.container}>
      <GlobalHeader tabName="Community" placeholder="궁금한 육아 고민이나 꿀팁 검색" navigation={navigation} />

      {/* Filter chips */}
      <View style={styles.chipBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipContent}
        >
          {FILTERS.map(({ key, label }) => {
            const active = activeFilter === key;
            return (
              <TouchableOpacity
                key={String(key)}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setActiveFilter(key)}
                activeOpacity={0.8}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Post feed */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="small" color="#2563eb" />
        </View>
      ) : (
        <FlatList
          data={displayPosts}
          keyExtractor={(item) => item.postId}
          renderItem={({ item }) => <PostCard item={item} onPress={() => handlePress(item)} />}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); loadPosts(); }}
              colors={['#2563eb']}
              tintColor="#2563eb"
            />
          }
          ListEmptyComponent={
            <Text style={styles.emptyText}>아직 게시글이 없어요{'\n'}첫 번째 글을 남겨보세요!</Text>
          }
        />
      )}

      {/* Circular FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('WritePost')}
        activeOpacity={0.85}
      >
        <Text style={styles.fabIcon}>✏️</Text>
        <Text style={styles.fabText}>글쓰기</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },

  center:    { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Filter chip bar
  chipBar: {
    backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#e4e7ed',
  },
  chipContent: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  chip: {
    borderRadius: 20, borderWidth: 1, borderColor: '#e2e8f0',
    paddingHorizontal: 14, paddingVertical: 6, backgroundColor: '#fff',
  },
  chipActive: { backgroundColor: '#1d4ed8', borderColor: '#1d4ed8' },
  chipText: { fontSize: 13, fontWeight: '600', color: '#64748b' },
  chipTextActive: { color: '#fff' },

  // Post card
  listContent: { paddingBottom: 100, paddingTop: 4 },
  separator:   { height: 6 },
  card: {
    backgroundColor: '#fff', marginHorizontal: 0,
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
    gap: 7,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tagPill: {
    borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, flexShrink: 0,
  },
  tagText: { fontSize: 11, fontWeight: '800' },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a', flex: 1 },
  cardPreview: { fontSize: 13, color: '#64748b', lineHeight: 19 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  cardAuthor: { fontSize: 12, fontWeight: '600', color: '#475569' },
  cardDot:    { fontSize: 11, color: '#cbd5e1' },
  cardMeta:   { fontSize: 12, color: '#94a3b8' },
  cardStat:   { fontSize: 12, color: '#94a3b8', marginLeft: 6 },
  badgePill:  { borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 },
  badgePillText: { fontSize: 10, fontWeight: '800' },

  emptyText: {
    textAlign: 'center', color: '#94a3b8', marginTop: 60,
    fontSize: 14, lineHeight: 22,
  },

  // Circular FAB
  fab: {
    position: 'absolute', right: 20, bottom: 24,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#1d4ed8',
    borderRadius: 28, paddingHorizontal: 18, paddingVertical: 12,
    ...Platform.select({
      ios:     { shadowColor: '#1d4ed8', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.45, shadowRadius: 8 },
      android: { elevation: 6 },
    }),
  },
  fabIcon: { fontSize: 16 },
  fabText: { fontSize: 14, fontWeight: '800', color: '#fff' },
});
