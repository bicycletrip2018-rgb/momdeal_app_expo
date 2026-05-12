import React, { useState } from 'react';
import {
  ActivityIndicator, Modal, Platform, ScrollView,
  StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { doc, deleteDoc } from 'firebase/firestore';
import { ChevronLeft } from 'lucide-react-native';
import { db } from '../firebase/config';
import { COLORS } from '../constants/theme';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmtDate = (ts) => {
  if (!ts) return '';
  const d = ts.toDate
    ? ts.toDate()
    : ts.seconds
      ? new Date(ts.seconds * 1000)
      : null;
  if (!d) return '';
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
};

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function InquiryDetailScreen({ navigation, route }) {
  const insets   = useSafeAreaInsets();
  const inquiry  = route.params?.inquiry ?? {};

  const [confirmVisible, setConfirmVisible] = useState(false);
  const [deleting,       setDeleting]       = useState(false);

  const handleDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'inquiries', inquiry.id));
      setConfirmVisible(false);
      navigation.goBack();
    } catch (e) {
      console.error('[InquiryDetailScreen] delete error', e);
      setDeleting(false);
    }
  };

  const answered = inquiry.status === 'answered';

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
        <Text style={styles.topBarTitle}>문의 상세</Text>
        <TouchableOpacity
          onPress={() => setConfirmVisible(true)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.backBtn}
        >
          <Text style={styles.deleteBtn}>삭제</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Question card ── */}
        <View style={styles.card}>
          {/* Meta row */}
          <View style={styles.metaRow}>
            {inquiry.category ? (
              <View style={styles.catBadge}>
                <Text style={styles.catText}>{inquiry.category}</Text>
              </View>
            ) : null}
            <View style={[styles.statusBadge, answered ? styles.statusAnswered : styles.statusPending]}>
              <Text style={[styles.statusText, answered ? styles.statusAnsweredText : styles.statusPendingText]}>
                {answered ? '답변 완료' : '답변 대기'}
              </Text>
            </View>
          </View>

          <Text style={styles.title}>{inquiry.title}</Text>
          <Text style={styles.date}>{fmtDate(inquiry.createdAt)}</Text>

          <View style={styles.divider} />

          <Text style={styles.content}>{inquiry.content}</Text>
        </View>

        {/* ── Reply section ── */}
        {answered ? (
          <View style={styles.replyCard}>
            <View style={styles.replyHeader}>
              <Text style={styles.replyLabel}>운영자 답변</Text>
              {inquiry.repliedAt ? (
                <Text style={styles.replyDate}>{fmtDate(inquiry.repliedAt)}</Text>
              ) : null}
            </View>
            <View style={styles.replyDivider} />
            <Text style={styles.replyBody}>
              {inquiry.reply ?? ''}
            </Text>
          </View>
        ) : (
          <View style={styles.pendingCard}>
            <Text style={styles.pendingText}>
              답변을 준비 중입니다.{'\n'}조금만 기다려주세요!
            </Text>
          </View>
        )}

      </ScrollView>

      {/* ── Delete confirmation modal ── */}
      <Modal
        visible={confirmVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmVisible(false)}
      >
        <View style={confirm.overlay}>
          <View style={confirm.card}>
            <Text style={confirm.title}>문의 내역 삭제</Text>
            <Text style={confirm.body}>
              {'이 문의 내역을 정말 삭제하시겠습니까?\n삭제된 내역은 복구할 수 없습니다.'}
            </Text>
            <View style={confirm.btnRow}>
              <TouchableOpacity
                style={confirm.cancelBtn}
                onPress={() => setConfirmVisible(false)}
                disabled={deleting}
                activeOpacity={0.75}
              >
                <Text style={confirm.cancelText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={confirm.deleteConfirmBtn}
                onPress={handleDelete}
                disabled={deleting}
                activeOpacity={0.85}
              >
                {deleting
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={confirm.deleteConfirmText}>삭제하기</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  backBtn:     { width: 40, alignItems: 'center', justifyContent: 'center' },
  topBarTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a', textAlign: 'center' },
  deleteBtn:   { fontSize: 14, fontWeight: '600', color: '#94a3b8' },

  scroll: { padding: 16 },

  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 20, marginBottom: 12,
    borderWidth: 1, borderColor: '#f1f5f9',
  },

  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },

  catBadge: {
    backgroundColor: '#f0fdf4', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 3,
  },
  catText: { fontSize: 11, fontWeight: '700', color: '#15803d' },

  statusBadge:         { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  statusPending:       { backgroundColor: '#f1f5f9' },
  statusAnswered:      { backgroundColor: '#dbeafe' },
  statusText:          { fontSize: 11, fontWeight: '700' },
  statusPendingText:   { color: '#64748b' },
  statusAnsweredText:  { color: COLORS.primary },

  title:   { fontSize: 17, fontWeight: '700', color: '#0f172a', lineHeight: 24, marginBottom: 6 },
  date:    { fontSize: 12, color: '#94a3b8', fontWeight: '500', marginBottom: 16 },
  divider: { height: 1, backgroundColor: '#f1f5f9', marginBottom: 16 },
  content: { fontSize: 15, color: '#334155', lineHeight: 24 },

  // ── Answered reply ──
  replyCard: {
    backgroundColor: '#eff6ff', borderRadius: 16, padding: 20,
    borderWidth: 1, borderColor: '#bfdbfe',
  },
  replyHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  replyLabel:  { fontSize: 13, fontWeight: '800', color: COLORS.primary },
  replyDate:   { fontSize: 12, color: '#93c5fd', fontWeight: '500' },
  replyDivider:{ height: 1, backgroundColor: '#bfdbfe', marginBottom: 14 },
  replyBody:   { fontSize: 14, color: '#1e3a8a', lineHeight: 22 },

  // ── Pending state ──
  pendingCard: {
    backgroundColor: '#f8fafc', borderRadius: 16, padding: 20,
    borderWidth: 1, borderColor: '#e2e8f0',
    alignItems: 'center',
  },
  pendingText: {
    fontSize: 14, color: '#94a3b8', fontWeight: '600',
    textAlign: 'center', lineHeight: 22,
  },
});

const confirm = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24,
  },
  card: {
    width: '100%', backgroundColor: '#fff',
    borderRadius: 20, paddingHorizontal: 24, paddingVertical: 28,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 20 },
      android: { elevation: 12 },
    }),
  },
  title:      { fontSize: 17, fontWeight: '800', color: '#0f172a', marginBottom: 10 },
  body:       { fontSize: 13, color: '#64748b', lineHeight: 20, marginBottom: 24 },
  btnRow:     { flexDirection: 'row', gap: 12 },
  cancelBtn:  { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: '#f1f5f9', alignItems: 'center' },
  cancelText: { fontSize: 15, fontWeight: '700', color: '#475569' },
  deleteConfirmBtn:  { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: '#ef4444', alignItems: 'center' },
  deleteConfirmText: { fontSize: 15, fontWeight: '800', color: '#fff' },
});
