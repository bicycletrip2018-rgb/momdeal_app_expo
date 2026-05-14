import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import GlobalHeader from '../components/GlobalHeader';
import { useFocusEffect } from '@react-navigation/native';
import { getPosts } from '../services/communityService';
import { Edit3, Info, Link } from 'lucide-react-native';

// ─── Filter chips ─────────────────────────────────────────────────────────────

const FILTERS = [
  { key: null,     label: '전체' },
  { key: 'chat',   label: '육아수다' },
  { key: 'qna',    label: '질문/고민' },
  { key: 'tip',    label: '육아꿀템' },
  { key: 'deal',   label: '특가제보' },
];

// ─── Tag styling (includes legacy Firestore keys for backwards compat) ────────

const TAG_META = {
  chat:     { label: '육아수다', bg: '#f1f5f9', text: '#475569' },
  qna:      { label: '질문/고민', bg: '#eff6ff', text: '#2563eb' },
  tip:      { label: '육아꿀템',  bg: '#f0fdf4', text: '#16a34a' },
  deal:     { label: '특가제보',  bg: '#fef3c7', text: '#b45309' },
  // legacy keys
  question: { label: '질문/고민', bg: '#eff6ff', text: '#2563eb' },
  free:     { label: '육아수다',  bg: '#f1f5f9', text: '#475569' },
  review:   { label: '육아꿀템',  bg: '#f0fdf4', text: '#16a34a' },
  region:   { label: '지역',      bg: '#f5f3ff', text: '#7c3aed' },
};

// ─── 4-Tier system ────────────────────────────────────────────────────────────

const TIER_META = [
  { level: 1, label: '일반맘', color: '#6B7280', bg: '#F3F4F6' },
  { level: 2, label: '성실맘', color: '#10B981', bg: '#D1FAE5' },
  { level: 3, label: '열심맘', color: '#F59E0B', bg: '#FEF3C7' },
  { level: 4, label: '우수맘', color: '#2E6FF2', bg: '#DBEAFE' },
];

function getMockTier(seed) {
  if (!seed) return TIER_META[0];
  const n = String(seed).split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return TIER_META[n % TIER_META.length];
}

const TIER_BG = { 1: '#94A3B8', 2: '#10B981', 3: '#F59E0B', 4: '#2E6FF2' };

function TierBadge({ tier }) {
  return (
    <View style={[styles.tierBadge, { backgroundColor: TIER_BG[tier.level] ?? '#94A3B8' }]}>
      <Text style={styles.tierBadgeText}>{tier.level}</Text>
    </View>
  );
}


// ARCHITECTURE CONSTRAINT: Peer matching MUST use a "Dynamic Snapshot" logic. The DB must store 'authorBabyMonthAtCreation'. Filtering ranges must be dynamic (e.g., 0-12m: ±1m, 13-36m: ±3m, 37m+: ±12m) based on the currentUser's current baby month.

// ─── Mock posts (shown when Firestore returns nothing) ────────────────────────

const MOCK_POSTS = [
  {
    postId: 'mock1', category: 'chat', _tier: 1,
    title: '요즘 육아하면서 제일 힘든 게 뭐예요 다들',
    nickname: '7개월 노을맘', viewCount: 1243, likeCount: 31, commentCount: 18, timeAgo: '26.05.13.',
  },
  {
    postId: 'mock2', category: 'tip', _tier: 2,
    title: '기저귀 발진 잡는 꿀템 총정리 (경험담)',
    nickname: '15개월 별이맘', viewCount: 3401, likeCount: 128, commentCount: 42, timeAgo: '26.05.12.',
  },
  {
    postId: 'mock3', category: 'deal', _tier: 3,
    title: '하기스 매직팬티 역대급 특가 오늘만!',
    nickname: '8개월 콩이맘', viewCount: 892, likeCount: 14, commentCount: 7, timeAgo: '26.05.11.',
  },
  {
    postId: 'mock4', category: 'qna', _tier: 4,
    title: '아이 낮잠 거부 어떻게 극복하셨어요?',
    nickname: '13개월 하나맘', viewCount: 564, likeCount: 57, commentCount: 12, timeAgo: '26.05.10.',
  },
  {
    postId: 'mock5', category: 'qna', _tier: 2,
    title: '12개월인데 아직 걸음마 안 하면 이상한 건가요?',
    nickname: '24개월 솔이맘', viewCount: 2107, likeCount: 83, commentCount: 29, timeAgo: '26.05.09.',
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

function PostCard({ item, onPress, activeFilter }) {
  const tag      = item.category ? (TAG_META[item.category] ?? { label: item.category }) : null;
  const tier     = item._tier ? TIER_META[item._tier - 1] : getMockTier(item.userId || item.nickname || item.postId);
  const date     = item.createdAt?.toDate ? item.createdAt.toDate() : null;
  const time     = item.timeAgo ?? (date ? formatPostTime(date) : '');
  const cmts     = item.commentCount ?? 0;
  const likes    = item.likeCount ?? 0;
  const views    = item.viewCount ?? 0;
  const thumbUri = item.imageUrls?.[0] ?? null;
  const extraImgs = Math.max(0, (item.imageUrls?.length ?? 0) - 1);

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      <View style={{ flexDirection: 'row' }}>

        {/* Left column — content first */}
        <View style={{ flex: 1, justifyContent: 'flex-start', marginRight: thumbUri ? 12 : 0 }}>
          {/* 1. Title + comment count */}
          <Text style={styles.cardTitle} numberOfLines={2} ellipsizeMode="tail">
            {activeFilter === null && tag?.label
              ? <Text style={styles.cardCategoryPrefix}>[{tag.label}] </Text>
              : null}
            {item.title || '(제목 없음)'}
            {cmts > 0 && <Text style={styles.cardCmtCount}> ({cmts})</Text>}
          </Text>

          {/* 2. Tagged product pill */}
          {item.taggedProduct && (
            <View style={styles.productPill}>
              <Link size={12} color="#64748B" />
              <Text style={styles.productPillText} numberOfLines={1}>
                {item.taggedProduct.brand ? `[${item.taggedProduct.brand}] ` : ''}{item.taggedProduct.name}
              </Text>
            </View>
          )}

          {/* 3. Meta row — nickname · tier · date · views · likes */}
          <View style={styles.cardFooter}>
            <Text style={styles.cardAuthor}>{item.nickname || '익명'}</Text>
            <TierBadge tier={tier} />
            <Text style={styles.cardDot}> · </Text>
            <Text style={styles.cardMeta}>
              {time}{'  '}조회 {views}{likes > 0 ? ` · 좋아요 ${likes}` : ''}
            </Text>
          </View>
        </View>

        {/* Right: 64×64 thumbnail with +N overlay */}
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

export default function CommunityListScreen({ navigation }) {
  const [posts, setPosts]               = useState([]);
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);
  const [activeFilter, setActiveFilter] = useState(null);
  const [isPeerMode,     setIsPeerMode]     = useState(false);
  const [isTooltipVisible, setIsTooltipVisible] = useState(false);

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
      <GlobalHeader
        tabName="Community"
        placeholder="커뮤니티 글 검색"
        navigation={navigation}
        onSearchPress={() => navigation.navigate('CommunitySearch')}
      />

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

      {/* Peer match toggle */}
      <View style={styles.peerToggleRow}>
        <View style={{ flex: 1 }} />
        <Text style={[styles.peerToggleText, isPeerMode && styles.peerToggleTextActive]}>내 아이 맞춤 정보</Text>
        <TouchableOpacity
          onPress={() => setIsTooltipVisible(true)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={{ marginLeft: 4 }}
        >
          <Info size={16} color="#94A3B8" />
        </TouchableOpacity>
        <Switch
          value={isPeerMode}
          onValueChange={setIsPeerMode}
          trackColor={{ false: '#E2E8F0', true: '#BFDBFE' }}
          thumbColor={isPeerMode ? '#2E6FF2' : '#94A3B8'}
          ios_backgroundColor="#E2E8F0"
          style={{ marginLeft: 8 }}
        />
      </View>

      {/* Peer match tooltip modal */}
      <Modal visible={isTooltipVisible} transparent animationType="fade" onRequestClose={() => setIsTooltipVisible(false)}>
        <Pressable style={styles.tooltipOverlay} onPress={() => setIsTooltipVisible(false)}>
          <Pressable style={styles.tooltipCard} onPress={() => {}}>
            <Text style={styles.tooltipTitle}>내 아이 맞춤 정보란?</Text>
            <Text style={styles.tooltipBody}>
              회원님 아이의 발달 단계(월령)를 분석하여, 지금 시기에 가장 핏이 맞는 부모님들의 글만 스마트하게 모아보여드려요.
            </Text>
            <TouchableOpacity style={styles.tooltipBtn} onPress={() => setIsTooltipVisible(false)} activeOpacity={0.85}>
              <Text style={styles.tooltipBtnText}>확인</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Post feed */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="small" color="#2563eb" />
        </View>
      ) : (
        <FlatList
          data={displayPosts}
          keyExtractor={(item) => item.postId}
          renderItem={({ item }) => <PostCard item={item} onPress={() => handlePress(item)} activeFilter={activeFilter} />}
          contentContainerStyle={styles.listContent}
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
        <Edit3 size={22} color="#FFFFFF" />
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
    borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 6,
    backgroundColor: '#F1F5F9',
  },
  chipActive:     { backgroundColor: '#2E6FF2' },
  chipText:       { fontSize: 13, fontWeight: '600', color: '#64748B' },
  chipTextActive: { color: '#FFFFFF', fontWeight: '700' },

  // Peer match toggle
  peerToggleRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'flex-end',
    paddingRight: 16, paddingBottom: 8, paddingTop: 6,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  peerToggleText:       { fontSize: 13, fontWeight: '500', color: '#64748B' },
  peerToggleTextActive: { color: '#2E6FF2', fontWeight: '600' },

  // Tooltip modal
  tooltipOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center', padding: 32,
  },
  tooltipCard: {
    backgroundColor: '#fff', borderRadius: 16,
    padding: 24, width: '100%', gap: 12,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12 },
      android: { elevation: 10 },
    }),
  },
  tooltipTitle:   { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  tooltipBody:    { fontSize: 14, color: '#334155', lineHeight: 22 },
  tooltipBtn:     { backgroundColor: '#2E6FF2', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  tooltipBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // Post card
  listContent: { paddingBottom: 100, paddingTop: 4 },
  card: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  cardTitle:    { fontSize: 15, fontWeight: '400', lineHeight: 22, color: '#334155', marginBottom: 6 },
  cardCmtCount: { fontSize: 13, fontWeight: '400', color: '#2E6FF2' },
  cardFooter:   { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: 6 },
  cardCategoryPrefix: { color: '#64748B', fontWeight: '500' },
  productPill: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0',
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4,
    marginTop: 8, alignSelf: 'flex-start', maxWidth: '90%',
  },
  productPillText: { fontSize: 12, color: '#475569', marginLeft: 6 },
  tierBadge:     { width: 15, height: 15, borderRadius: 4, justifyContent: 'center', alignItems: 'center', marginLeft: 4 },
  tierBadgeText: { fontSize: 9, fontWeight: 'bold', color: '#FFFFFF', lineHeight: 13 },
  cardAuthor:    { fontSize: 13, color: '#94A3B8' },
  cardDot:       { fontSize: 13, color: '#D1D5DB' },
  cardMeta:      { fontSize: 13, color: '#94A3B8' },
  cardThumb:    { width: 64, height: 64, borderRadius: 8, backgroundColor: '#F3F4F6' },
  cardThumbOverlay: {
    position: 'absolute', bottom: 4, right: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 4, paddingVertical: 2, borderRadius: 4,
  },
  cardThumbOverlayText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },

  emptyText: {
    textAlign: 'center', color: '#94a3b8', marginTop: 60,
    fontSize: 14, lineHeight: 22,
  },

  // Circular FAB
  fab: {
    position: 'absolute', right: 24, bottom: 24,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#2E6FF2',
    alignItems: 'center', justifyContent: 'center',
    ...Platform.select({
      ios:     { shadowColor: '#2E6FF2', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.45, shadowRadius: 10 },
      android: { elevation: 8 },
    }),
  },
});
