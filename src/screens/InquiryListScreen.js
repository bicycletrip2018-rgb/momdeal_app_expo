import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, FlatList, Platform, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { collection, getDocs, orderBy, query, where } from 'firebase/firestore';
import { ChevronLeft } from 'lucide-react-native';
import { auth, db } from '../firebase/config';
import { COLORS } from '../constants/theme';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmtDate = (ts) => {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : ts.seconds ? new Date(ts.seconds * 1000) : null;
  if (!d) return '';
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
};

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const answered = status === 'answered';
  return (
    <View style={[badge.wrap, answered ? badge.answered : badge.pending]}>
      <Text style={[badge.text, answered ? badge.answeredText : badge.pendingText]}>
        {answered ? '답변 완료' : '답변 대기'}
      </Text>
    </View>
  );
}

const badge = StyleSheet.create({
  wrap:         { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  pending:      { backgroundColor: '#f1f5f9' },
  answered:     { backgroundColor: '#dbeafe' },
  text:         { fontSize: 11, fontWeight: '700' },
  pendingText:  { color: '#64748b' },
  answeredText: { color: COLORS.primary },
});

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function InquiryListScreen({ navigation, route }) {
  const insets   = useSafeAreaInsets();
  const [items,   setItems]   = useState([]);
  const [loading, setLoading] = useState(true);

  // Toast
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const [toastMsg, setToastMsg] = useState('');

  const showToast = (msg) => {
    setToastMsg(msg);
    Animated.sequence([
      Animated.timing(toastOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(2000),
      Animated.timing(toastOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();
  };

  const loadInquiries = useCallback(async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) { setLoading(false); return; }
    try {
      const q = query(
        collection(db, 'inquiries'),
        where('userId', '==', uid),
        orderBy('createdAt', 'desc')
      );
      const snap = await getDocs(q);
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error('[InquiryListScreen] load error', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadInquiries(); }, [loadInquiries]);

  useEffect(() => {
    const unsub = navigation.addListener('focus', () => {
      setLoading(true);
      loadInquiries();
      const toast = route.params?.toast;
      if (toast) {
        showToast(toast);
        navigation.setParams({ toast: undefined });
      }
    });
    return unsub;
  }, [navigation, loadInquiries, route.params?.toast]);

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={styles.row}
      onPress={() => navigation.navigate('InquiryDetail', { inquiry: JSON.parse(JSON.stringify(item)) })}
      activeOpacity={0.72}
    >
      <View style={styles.rowMeta}>
        {item.category ? (
          <View style={styles.catBadge}>
            <Text style={styles.catText}>{item.category}</Text>
          </View>
        ) : null}
        <StatusBadge status={item.status} />
      </View>
      <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
      <Text style={styles.rowDate}>{fmtDate(item.createdAt)}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>

      {/* ── Header ── */}
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.backBtn}
        >
          <ChevronLeft size={24} color="#0f172a" strokeWidth={2.2} />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>1:1 문의</Text>
        <View style={styles.backBtn} />
      </View>

      {/* ── List ── */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="small" color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={[
            { paddingBottom: insets.bottom + 100 },
            items.length === 0 && styles.emptyFlex,
          ]}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>등록된 문의 내역이 없습니다.</Text>
              <Text style={styles.emptySub}>아래 버튼으로 첫 문의를 남겨보세요.</Text>
            </View>
          }
        />
      )}

      {/* ── Bottom CTA ── */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity
          style={styles.writeBtn}
          onPress={() => navigation.navigate('InquiryWrite')}
          activeOpacity={0.85}
        >
          <Text style={styles.writeBtnText}>+ 새 문의 작성하기</Text>
        </TouchableOpacity>
      </View>

      {/* ── Toast ── */}
      <Animated.View
        style={[styles.toast, { opacity: toastOpacity, bottom: insets.bottom + 80 }]}
        pointerEvents="none"
      >
        <Text style={styles.toastText}>{toastMsg}</Text>
      </Animated.View>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center' },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  backBtn:     { width: 40, alignItems: 'center', justifyContent: 'center' },
  topBarTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a', textAlign: 'center' },

  row: {
    backgroundColor: '#fff',
    paddingHorizontal: 20, paddingVertical: 16,
  },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },

  catBadge: {
    backgroundColor: '#f0fdf4', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 3,
  },
  catText: { fontSize: 11, fontWeight: '700', color: '#15803d' },

  rowTitle: { fontSize: 15, fontWeight: '600', color: '#0f172a', marginBottom: 6 },
  rowDate:  { fontSize: 12, color: '#94a3b8', fontWeight: '500' },

  separator: { height: 1, backgroundColor: '#f1f5f9' },

  emptyFlex: { flex: 1 },
  empty:     { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: '#475569', marginBottom: 6 },
  emptySub:   { fontSize: 13, color: '#94a3b8' },

  bottomBar: {
    paddingHorizontal: 20, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: '#f1f5f9', backgroundColor: '#fff',
  },
  writeBtn: {
    backgroundColor: COLORS.primary, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
    ...Platform.select({
      ios:     { shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8 },
      android: { elevation: 4 },
    }),
  },
  writeBtnText: { fontSize: 16, fontWeight: '800', color: '#fff' },

  toast: {
    position: 'absolute', alignSelf: 'center',
    backgroundColor: 'rgba(15,23,42,0.88)', borderRadius: 12,
    paddingHorizontal: 20, paddingVertical: 12,
  },
  toastText: { fontSize: 14, fontWeight: '600', color: '#fff' },
});
