import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  SectionList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { useNotification } from '../context/NotificationContext';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
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

// ─── Dummy fallback data (shown when Firestore returns nothing) ───────────────

const MOCK_NOTIFICATIONS = [
  {
    id: 'mn1', type: 'price', isToday: true,
    category: '가격·재입고', time: '2시간 전',
    title: '관심상품 [팸퍼스 기저귀] 역대 최저가 도달!',
    desc: '팸퍼스 하이드로케어 기저귀 특대형 88매',
    isRead: false, createdAt: null,
  },
  {
    id: 'mn2', type: 'community', isToday: true,
    category: '맘톡·활동', time: '5시간 전',
    title: "내 글에 👑프로맘 핫딜요정님이 댓글을 남겼습니다.",
    desc: '',
    isRead: false, createdAt: null,
  },
  {
    id: 'mn3', type: 'ranking', isToday: false,
    category: '또래 맞춤', time: '어제',
    title: '67개월 남아들이 많이 담은 장난감 랭킹 업데이트!',
    desc: '지금 바로 확인해보세요',
    isRead: true, createdAt: null,
  },
  {
    id: 'mn4', type: 'event', isToday: false,
    category: '혜택·이벤트', time: '어제',
    title: '하기스 네이처메이드 무료 체험단 당첨!',
    desc: '배송지 정보를 입력해주세요',
    isRead: true, createdAt: null,
  },
];

// ─── Notification row ──────────────────────────────────────────────────────────

function typeIcon(type) {
  if (type === 'price'     || type === 'price_drop')      return { name: 'tag',        color: '#ef4444', bg: '#fee2e2' };
  if (type === 'community' || type === 'community_reply') return { name: 'comment',    color: '#3b82f6', bg: '#dbeafe' };
  if (type === 'ranking')                                 return { name: 'trophy',     color: '#d97706', bg: '#fef3c7' };
  return                                                         { name: 'gift',       color: '#8b5cf6', bg: '#ede9fe' };
}

function NotifCard({ item, onPress }) {
  const { name, color, bg } = typeIcon(item.type);
  // Support both new (title/desc/time) and Firestore (body/productName/timeAgo) shapes
  const titleText = item.title || item.body || '';
  const descText  = item.desc  || item.productName || '';
  const timeLabel = item.time  || item.timeAgo || (item.createdAt?.toDate
    ? item.createdAt.toDate().toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '');

  return (
    <TouchableOpacity style={styles.notifCard} onPress={() => onPress(item)} activeOpacity={0.8}>
      {/* Icon circle */}
      <View style={[styles.notifIconWrap, { backgroundColor: bg }]}>
        <FontAwesome5 name={name} size={16} color={color} />
      </View>

      <View style={styles.notifBody}>
        {/* Top row: category · time */}
        <View style={styles.notifMeta}>
          <Text style={styles.notifCategory}>{item.category || '알림'}</Text>
          <Text style={styles.notifDot}> · </Text>
          <Text style={styles.notifTime}>{timeLabel}</Text>
        </View>

        {/* Main message */}
        <Text style={[styles.notifText, !item.isRead && styles.notifTextUnread]} numberOfLines={3}>
          {titleText}
        </Text>

        {descText ? (
          <Text style={styles.notifProduct} numberOfLines={1}>{descText}</Text>
        ) : null}
      </View>

      {/* Unread dot */}
      {!item.isRead && <View style={styles.unreadDot} />}
    </TouchableOpacity>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function NotificationScreen({ navigation: navProp }) {
  const navigation = useNavigation();
  const { clearBadge } = useNotification();
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
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setNotifications(docs.length > 0 ? docs : MOCK_NOTIFICATIONS);
    } catch (e) {
      console.log('NotificationScreen load error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  // Refresh + clear badge when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadNotifications();
      clearBadge(); // resets red dot on home header; individual isRead states preserved
    }, [loadNotifications, clearBadge])
  );

  const handlePress = async (item) => {
    const uid = auth.currentUser?.uid;

    // Always mark as read in local state (works for both mock and Firestore items)
    if (!item.isRead) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === item.id ? { ...n, isRead: true } : n))
      );
      // Persist to Firestore only for real items
      if (uid && !item.id.startsWith('mn')) {
        updateDoc(
          doc(db, 'notifications', uid, 'user_notifications', item.id),
          { isRead: true }
        ).catch(() => {});
      }
    }

    logNotificationOpen(uid, item);

    // Route based on type — covers both new and legacy type strings
    try {
      if (item.type === 'price' || item.type === 'price_drop') {
        navigation.navigate('ProductDetail', { productId: item.productGroupId || 'dummy', productName: item.desc || item.productName || '상품' });
      } else if (item.type === 'community' || item.type === 'community_reply') {
        navigation.navigate('CommunityPost', { postId: item.postId || 'dummy' });
      } else if (item.type === 'ranking') {
        navigation.navigate('Ranking');
      } else if (item.type === 'event' || item.type === 'system') {
        navigation.navigate('Home');
      }
    } catch (_) {}
  };

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  // Build SectionList sections — Today first, then Previous
  const todayItems    = notifications.filter((n) => n.isToday !== false);
  const previousItems = notifications.filter((n) => n.isToday === false);
  const sections = [
    ...(todayItems.length    > 0 ? [{ title: '오늘 받은 알림', data: todayItems    }] : []),
    ...(previousItems.length > 0 ? [{ title: '이전 알림',      data: previousItems }] : []),
  ];

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="small" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {unreadCount > 0 && (
        <View style={styles.unreadBanner}>
          <Text style={styles.unreadBannerText}>읽지 않은 알림 {unreadCount}개</Text>
        </View>
      )}

      {notifications.length === 0 ? (
        <View style={styles.emptyWrap}>
          <FontAwesome5 name="bell-slash" size={40} color="#cbd5e1" style={{ marginBottom: 12 }} />
          <Text style={styles.emptyTitle}>새 알림이 없어요</Text>
          <Text style={styles.emptySub}>
            관심 상품의 가격이 내려가면{'\n'}여기서 알려드릴게요
          </Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderSectionHeader={({ section }) => (
            <Text style={styles.sectionHeader}>{section.title}</Text>
          )}
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
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Unread banner
  unreadBanner: {
    backgroundColor: '#eff6ff', paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#bfdbfe',
  },
  unreadBannerText: { fontSize: 13, fontWeight: '700', color: '#1d4ed8' },

  // Empty state
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: '#0f172a' },
  emptySub:   { fontSize: 13, color: '#64748b', textAlign: 'center', lineHeight: 18 },

  // SectionList
  listContent:   { paddingBottom: 40 },
  sectionHeader: {
    fontSize: 16, fontWeight: 'bold', color: '#334155',
    paddingTop: 20, paddingBottom: 12, paddingHorizontal: 16,
    backgroundColor: '#f1f5f9',
  },

  // Naver-style card
  notifCard: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: '#ffffff', borderRadius: 12,
    marginHorizontal: 16, marginBottom: 10, padding: 16,
    gap: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  notifIconWrap: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  notifBody: { flex: 1, gap: 4 },
  notifMeta: { flexDirection: 'row', alignItems: 'center' },
  notifCategory: { fontSize: 11, fontWeight: '600', color: '#64748b' },
  notifDot:      { fontSize: 11, color: '#94a3b8' },
  notifTime:     { fontSize: 11, color: '#94a3b8' },
  notifText:        { fontSize: 14, color: '#475569', lineHeight: 20, fontWeight: 'normal' },
  notifTextUnread:  { fontWeight: 'bold', color: '#0f172a' },
  notifProduct:     { fontSize: 11, color: '#94a3b8', marginTop: 2 },
  unreadDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: '#2563eb', marginTop: 6, flexShrink: 0,
  },
});
