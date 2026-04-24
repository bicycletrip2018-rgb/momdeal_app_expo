import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Circle, Line, Path, Polyline, Rect } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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

// ─── SVG Icons ───────────────────────────────────────────────────────────────

function PriceIcon({ size = 18, color = '#ef4444' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"/>
      <Line x1="7" y1="7" x2="7.01" y2="7" stroke={color} strokeWidth={2.5} strokeLinecap="round"/>
    </Svg>
  );
}

function TrendingDownIcon({ size = 18, color = '#ef4444' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Polyline points="23 18 13.5 8.5 8.5 13.5 1 6" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"/>
      <Polyline points="17 18 23 18 23 12" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"/>
    </Svg>
  );
}

function MessageIcon({ size = 18, color = '#3b82f6' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"/>
    </Svg>
  );
}

function GiftIcon({ size = 18, color = '#8b5cf6' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Polyline points="20 12 20 22 4 22 4 12" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"/>
      <Rect x="2" y="7" width="20" height="5" rx="1" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"/>
      <Line x1="12" y1="22" x2="12" y2="7" stroke={color} strokeWidth={1.8} strokeLinecap="round"/>
      <Path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"/>
      <Path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"/>
    </Svg>
  );
}

function TrophyIcon({ size = 18, color = '#d97706' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"/>
      <Path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"/>
      <Path d="M4 22h16" stroke={color} strokeWidth={1.8} strokeLinecap="round"/>
      <Path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"/>
      <Path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"/>
      <Path d="M18 2H6v7a6 6 0 0 0 12 0V2z" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"/>
    </Svg>
  );
}

function BellOffIcon({ size = 40, color = '#cbd5e1' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M13.73 21a2 2 0 0 1-3.46 0" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"/>
      <Path d="M18.63 13A17.89 17.89 0 0 1 18 8" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"/>
      <Path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"/>
      <Path d="M17.99 17.99A17.28 17.28 0 0 0 21 17s-3-2-3-9a6 6 0 0 0-.33-2" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"/>
      <Line x1="1" y1="1" x2="23" y2="23" stroke={color} strokeWidth={1.8} strokeLinecap="round"/>
    </Svg>
  );
}

function GearIcon({ size = 20, color = '#475569' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="3" stroke={color} strokeWidth={1.8}/>
      <Path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"/>
    </Svg>
  );
}

// ─── Filter chip config ───────────────────────────────────────────────────────

const FILTERS = ['전체', '가격·재입고', '맘톡·활동', '혜택'];

function matchFilter(item, filter) {
  if (filter === '전체') return true;
  if (filter === '가격·재입고') return item.type === 'price' || item.type === 'price_drop' || item.type === 'ranking';
  if (filter === '맘톡·활동')  return item.type === 'community' || item.type === 'community_reply';
  if (filter === '혜택')        return item.type === 'event' || item.type === 'system';
  return true;
}

// ─── Log notification_open — written directly because recordProductAction
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
    title: "내 글에 프로맘 핫딜요정님이 댓글을 남겼습니다.",
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

function typeIconConfig(type) {
  if (type === 'price' || type === 'price_drop') return { color: '#ef4444', bg: '#fee2e2', Icon: TrendingDownIcon };
  if (type === 'community' || type === 'community_reply') return { color: '#3b82f6', bg: '#dbeafe', Icon: MessageIcon };
  if (type === 'ranking')  return { color: '#d97706', bg: '#fef3c7', Icon: TrophyIcon };
  return                          { color: '#8b5cf6', bg: '#ede9fe', Icon: GiftIcon };
}

function NotifCard({ item, onPress }) {
  const { color, bg, Icon } = typeIconConfig(item.type);
  // Support both new (title/desc/time) and Firestore (body/productName/timeAgo) shapes
  const titleText = item.title || item.body || '';
  const descText  = item.desc  || item.productName || '';
  const timeLabel = item.time  || item.timeAgo || (item.createdAt?.toDate
    ? item.createdAt.toDate().toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '');

  return (
    <TouchableOpacity
      style={[styles.notifCard, !item.isRead && styles.notifCardUnread]}
      onPress={() => onPress(item)}
      activeOpacity={0.8}
    >
      {/* Icon circle */}
      <View style={[styles.notifIconWrap, { backgroundColor: bg }]}>
        <Icon size={16} color={color} />
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
  const insets = useSafeAreaInsets();
  const { clearBadge } = useNotification();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('전체');

  // Inject gear icon into the React Navigation header
  useLayoutEffect(() => {
    navigation.setOptions({
      title: '알림',
      headerRight: () => (
        <TouchableOpacity
          onPress={() => navigation.navigate('NotificationSettings')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={{ marginRight: 8, padding: 4 }}
        >
          <GearIcon size={20} color="#475569" />
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

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

  // Filter by active chip
  const filtered = notifications.filter((n) => matchFilter(n, activeFilter));

  // Build SectionList sections — Today first, then Previous
  const todayItems    = filtered.filter((n) => n.isToday !== false);
  const previousItems = filtered.filter((n) => n.isToday === false);
  const sections = [
    ...(todayItems.length    > 0 ? [{ title: '오늘', data: todayItems    }] : []),
    ...(previousItems.length > 0 ? [{ title: '이전', data: previousItems }] : []),
  ];

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator size="small" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>

      {/* ── Unread banner ── */}
      {unreadCount > 0 && (
        <View style={styles.unreadBanner}>
          <Text style={styles.unreadBannerText}>읽지 않은 알림 {unreadCount}개</Text>
        </View>
      )}

      {/* ── Filter chips ── */}
      <View style={styles.filterRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {FILTERS.map((f) => (
            <TouchableOpacity
              key={f}
              style={[styles.filterChip, activeFilter === f && styles.filterChipActive]}
              onPress={() => setActiveFilter(f)}
              activeOpacity={0.75}
            >
              <Text style={[styles.filterChipText, activeFilter === f && styles.filterChipTextActive]}>
                {f}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* ── List ── */}
      {filtered.length === 0 ? (
        <View style={styles.emptyWrap}>
          <BellOffIcon size={40} color="#cbd5e1" />
          <Text style={styles.emptyTitle}>알림이 없어요</Text>
          <Text style={styles.emptySub}>
            관심 상품의 가격이 내려가면{'\n'}여기서 알려드릴게요
          </Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 32 }]}
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

  // ── Unread banner ──
  unreadBanner: {
    backgroundColor: '#eff6ff', paddingHorizontal: 16, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: '#bfdbfe',
  },
  unreadBannerText: { fontSize: 12, fontWeight: '700', color: '#1d4ed8' },

  // ── Filter chips ──
  filterRow:    { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  filterScroll: { paddingHorizontal: 16, paddingVertical: 10, gap: 8, flexDirection: 'row' },
  filterChip: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
    backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0',
  },
  filterChipActive:     { backgroundColor: '#2E6FF2', borderColor: '#2E6FF2' },
  filterChipText:       { fontSize: 13, fontWeight: '600', color: '#64748b' },
  filterChipTextActive: { color: '#fff' },

  // ── Empty state ──
  emptyWrap:  { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: '#0f172a', marginTop: 12 },
  emptySub:   { fontSize: 13, color: '#64748b', textAlign: 'center', lineHeight: 18 },

  // ── SectionList ──
  listContent:   { paddingBottom: 40 },
  sectionHeader: {
    fontSize: 12, fontWeight: '700', color: '#94a3b8', letterSpacing: 0.6,
    textTransform: 'uppercase',
    paddingTop: 20, paddingBottom: 8, paddingHorizontal: 16,
    backgroundColor: '#f1f5f9',
  },

  // ── Notification card ──
  notifCard: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: '#ffffff', borderRadius: 12,
    marginHorizontal: 16, marginBottom: 8, padding: 14,
    gap: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 3, elevation: 1,
  },
  notifCardUnread: { backgroundColor: '#eff6ff' },
  notifIconWrap: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  notifBody:     { flex: 1, gap: 3 },
  notifMeta:     { flexDirection: 'row', alignItems: 'center' },
  notifCategory: { fontSize: 11, fontWeight: '600', color: '#64748b' },
  notifDot:      { fontSize: 11, color: '#94a3b8' },
  notifTime:     { fontSize: 11, color: '#94a3b8' },
  notifText:        { fontSize: 14, color: '#475569', lineHeight: 20, fontWeight: '400' },
  notifTextUnread:  { fontWeight: '700', color: '#0f172a' },
  notifProduct:     { fontSize: 11, color: '#94a3b8', marginTop: 2 },
  unreadDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: '#2E6FF2', marginTop: 6, flexShrink: 0,
  },
});
