import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { getUserProfile } from '../services/firestore/userRepository';
import { getPostsByUser, getCommentsByUser } from '../services/communityService';

export default function UserProfileScreen({ route }) {
  const { userId } = route.params;

  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getUserProfile(userId),
      getPostsByUser(userId),
      getCommentsByUser(userId),
    ])
      .then(([p, ps, cs]) => {
        setProfile(p);
        setPosts(ps);
        setComments(cs);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [userId]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="small" />
      </View>
    );
  }

  const nickname = profile?.nickname || `user_${userId.slice(0, 6)}`;

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.content}
      data={[]}
      renderItem={null}
      ListHeaderComponent={
        <>
          {/* Profile card */}
          <View style={styles.profileCard}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{nickname.slice(0, 1)}</Text>
            </View>
            <Text style={styles.nickname}>{nickname}</Text>
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statNum}>{profile?.postCount || 0}</Text>
                <Text style={styles.statLabel}>게시글</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statNum}>{profile?.commentCount || 0}</Text>
                <Text style={styles.statLabel}>댓글</Text>
              </View>
            </View>
          </View>

          {/* Posts */}
          <Text style={styles.sectionTitle}>게시글 ({posts.length})</Text>
          {posts.length === 0 ? (
            <Text style={styles.emptyText}>게시글이 없습니다</Text>
          ) : (
            posts.map((p) => (
              <View key={p.postId} style={styles.itemCard}>
                <Text style={styles.itemTitle} numberOfLines={1}>{p.title}</Text>
                <Text style={styles.itemDate}>
                  {p.createdAt?.toDate?.().toLocaleDateString('ko-KR') || ''}
                </Text>
              </View>
            ))
          )}

          {/* Comments */}
          <Text style={[styles.sectionTitle, { marginTop: 20 }]}>댓글 ({comments.length})</Text>
          {comments.length === 0 ? (
            <Text style={styles.emptyText}>댓글이 없습니다</Text>
          ) : (
            comments.map((c) => (
              <View key={c.commentId} style={styles.itemCard}>
                <Text style={styles.itemTitle} numberOfLines={2}>{c.content}</Text>
                <Text style={styles.itemDate}>
                  {c.createdAt?.toDate?.().toLocaleDateString('ko-KR') || ''}
                </Text>
              </View>
            ))
          )}
        </>
      }
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7fb' },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  profileCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e4e7ed',
    padding: 20,
    alignItems: 'center',
    gap: 10,
    marginBottom: 20,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 24, fontWeight: '800', color: '#fff' },
  nickname: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  statsRow: { flexDirection: 'row', gap: 24, alignItems: 'center' },
  statItem: { alignItems: 'center', gap: 2 },
  statNum: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  statLabel: { fontSize: 12, color: '#64748b' },
  statDivider: { width: 1, height: 28, backgroundColor: '#e4e7ed' },

  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#0f172a', marginBottom: 8 },
  emptyText: { fontSize: 13, color: '#94a3b8', textAlign: 'center', marginBottom: 4 },
  itemCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e4e7ed',
    padding: 12,
    marginBottom: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  itemTitle: { flex: 1, fontSize: 13, fontWeight: '600', color: '#1e293b' },
  itemDate: { fontSize: 11, color: '#94a3b8', flexShrink: 0 },
});
