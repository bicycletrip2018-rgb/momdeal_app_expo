import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { auth, db } from '../firebase/config';

// Log notification_open — written directly because recordProductAction
// requires productId which may be absent for non-product notifications.
async function logNotificationOpen(userId, item) {
  if (!userId) return;
  try {
    await addDoc(collection(db, 'user_product_actions'), {
      userId,
      actionType: 'notification_open',
      notificationType: item.type || 'unknown',
      ...(item.productGroupId ? { productGroupId: item.productGroupId, productId: item.productGroupId } : {}),
      ...(item.postId ? { postId: item.postId } : {}),
      createdAt: serverTimestamp(),
    });
  } catch (_) {}
}

// ─── Notification row ──────────────────────────────────────────────────────────

function NotifIcon({ type }) {
  if (type === 'price_drop') return <Text style={styles.notifIconText}>📉</Text>;
  if (type === 'community_reply') return <Text style={styles.notifIconText}>💬</Text>;
  return <Text style={styles.notifIconText}>🔔</Text>;
}

function NotifCard({ item, onPress }) {
  const dateStr = item.createdAt?.toDate
    ? item.createdAt.toDate().toLocaleDateString('ko-KR', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  return (
    <TouchableOpacity
      style={[styles.notifCard, !item.isRead && styles.notifCardUnread]}
      onPress={() => onPress(item)}
      activeOpacity={0.8}
    >
      <View style={styles.notifIconWrap}>
        <NotifIcon type={item.type} />
      </View>
      <View style={styles.notifBody}>
        <Text
          style={[styles.notifText, !item.isRead && styles.notifTextUnread]}
          numberOfLines={3}
        >
          {item.body}
        </Text>
        {item.productName ? (
          <Text style={styles.notifProduct} numberOfLines={1}>
            {item.productName}
          </Text>
        ) : null}
        <Text style={styles.notifDate}>{dateStr}</Text>
      </View>
      {!item.isRead ? <View style={styles.unreadDot} /> : null}
    </TouchableOpacity>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function NotificationScreen({ navigation }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadNotifications = useCallback(async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      setLoading(false);
      return;
    }
    try {
      const snap = await getDocs(
        query(
          collection(db, 'notifications', uid, 'user_notifications'),
          orderBy('createdAt', 'desc'),
          limit(50)
        )
      );
      setNotifications(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.log('NotificationScreen load error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  // Refresh when returning to screen
  useFocusEffect(
    useCallback(() => {
      loadNotifications();
    }, [loadNotifications])
  );

  const handlePress = async (item) => {
    const uid = auth.currentUser?.uid;

    // Mark as read (optimistic)
    if (!item.isRead && uid) {
      updateDoc(
        doc(db, 'notifications', uid, 'user_notifications', item.id),
        { isRead: true }
      ).catch(() => {});
      setNotifications((prev) =>
        prev.map((n) => (n.id === item.id ? { ...n, isRead: true } : n))
      );
    }

    // Log notification_open for re-engagement CTR measurement
    logNotificationOpen(uid, item);

    // Navigate to the relevant screen
    if (item.type === 'price_drop' && item.productGroupId) {
      navigation.navigate('ProductDetail', {
        productId: item.productGroupId,
        productName: item.productName || '상품',
      });
    } else if (item.type === 'community_reply' && item.postId) {
      navigation.navigate('PostDetail', {
        postId: item.postId,
        title: item.postTitle || '게시글',
      });
    }
  };

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="small" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {unreadCount > 0 ? (
        <View style={styles.unreadBanner}>
          <Text style={styles.unreadBannerText}>읽지 않은 알림 {unreadCount}개</Text>
        </View>
      ) : null}

      {notifications.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyIcon}>🔔</Text>
          <Text style={styles.emptyTitle}>새 알림이 없어요</Text>
          <Text style={styles.emptySub}>
            관심 상품의 가격이 내려가면{'\n'}여기서 알려드릴게요
          </Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <NotifCard item={item} onPress={handlePress} />
          )}
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7fb' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Unread banner
  unreadBanner: {
    backgroundColor: '#eff6ff',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#bfdbfe',
  },
  unreadBannerText: { fontSize: 13, fontWeight: '700', color: '#1d4ed8' },

  // Empty state
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 8,
  },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: '#0f172a' },
  emptySub: { fontSize: 13, color: '#64748b', textAlign: 'center', lineHeight: 18 },

  // List
  listContent: { padding: 12, gap: 8 },

  // Notification card
  notifCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e4e7ed',
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
    gap: 10,
  },
  notifCardUnread: {
    backgroundColor: '#f0f9ff',
    borderColor: '#bae6fd',
  },
  notifIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  notifIconText: { fontSize: 18 },
  notifBody: { flex: 1, gap: 3 },
  notifText: { fontSize: 13, color: '#334155', lineHeight: 18 },
  notifTextUnread: { fontWeight: '700', color: '#0f172a' },
  notifProduct: { fontSize: 11, color: '#64748b' },
  notifDate: { fontSize: 11, color: '#94a3b8', marginTop: 2 },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2563eb',
    marginTop: 4,
    flexShrink: 0,
  },
});
