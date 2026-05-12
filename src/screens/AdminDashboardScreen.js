import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  collection, doc, getDocs, orderBy, query, serverTimestamp, updateDoc,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import {
  getDailyStats,
  getTopConvertedProducts,
  getStageDistribution,
  getRecentPurchaseIntentList,
  getNotificationStats,
  computeAndWriteSelectionRates,
} from '../services/adminAnalyticsService';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmtDate = (ts) => {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : ts.seconds ? new Date(ts.seconds * 1000) : null;
  if (!d) return '';
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
};

// ─── Relative time helper ─────────────────────────────────────────────────────
function relativeTime(timestamp) {
  if (!timestamp) return '-';
  const ms = timestamp.toMillis?.() ?? (timestamp.seconds ? timestamp.seconds * 1000 : 0);
  if (!ms) return '-';
  const diffM = Math.round((Date.now() - ms) / 60000);
  if (diffM < 1) return '방금 전';
  if (diffM < 60) return `${diffM}분 전`;
  const diffH = Math.floor(diffM / 60);
  if (diffH < 24) return `${diffH}시간 전`;
  return `${Math.floor(diffH / 24)}일 전`;
}

// ─── Inquiry Reply Modal ──────────────────────────────────────────────────────

function InquiryReplyModal({ inquiry, onClose, onSubmit, submitting }) {
  const [reply, setReply] = useState('');
  if (!inquiry) return null;
  const canSubmit = reply.trim().length > 0 && !submitting;
  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={replyModal.overlay}
      >
        <View style={replyModal.card}>
          {/* Header */}
          <View style={replyModal.header}>
            <Text style={replyModal.headerTitle}>답변 등록</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={replyModal.closeBtn}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Inquiry preview */}
          <View style={replyModal.inquiryBox}>
            {inquiry.category ? (
              <Text style={replyModal.cat}>{inquiry.category}</Text>
            ) : null}
            <Text style={replyModal.inquiryTitle} numberOfLines={2}>{inquiry.title}</Text>
            <Text style={replyModal.inquiryContent} numberOfLines={4}>{inquiry.content}</Text>
            <Text style={replyModal.date}>{fmtDate(inquiry.createdAt)}</Text>
          </View>

          {/* Reply input */}
          <TextInput
            style={replyModal.input}
            value={reply}
            onChangeText={setReply}
            placeholder="사용자에게 전달할 답변을 입력하세요"
            placeholderTextColor="#94a3b8"
            multiline
            textAlignVertical="top"
            maxLength={2000}
            editable={!submitting}
          />
          <Text style={replyModal.charCount}>{reply.length} / 2000</Text>

          {/* Submit */}
          <TouchableOpacity
            style={[replyModal.submitBtn, !canSubmit && replyModal.submitBtnDisabled]}
            onPress={() => onSubmit(reply.trim())}
            disabled={!canSubmit}
            activeOpacity={0.85}
          >
            {submitting
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={replyModal.submitText}>답변 등록</Text>
            }
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, accent }) {
  return (
    <View style={[styles.statCard, accent && styles.statCardAccent]}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
    </View>
  );
}

// ─── Section title ────────────────────────────────────────────────────────────
function SectionTitle({ title }) {
  return <Text style={styles.sectionTitle}>{title}</Text>;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function AdminDashboardScreen() {
  const [dailyStats, setDailyStats] = useState(null);
  const [topProducts, setTopProducts] = useState([]);
  const [stageDist, setStageDist] = useState([]);
  const [recentList, setRecentList] = useState([]);
  const [notifStats, setNotifStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [computing, setComputing] = useState(false);

  const [inquiries,       setInquiries]       = useState([]);
  const [selectedInquiry, setSelectedInquiry] = useState(null);
  const [replying,        setReplying]        = useState(false);

  const loadInquiries = useCallback(async () => {
    try {
      const snap = await getDocs(
        query(collection(db, 'inquiries'), orderBy('createdAt', 'desc'))
      );
      setInquiries(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.log('AdminDashboard loadInquiries error:', e);
    }
  }, []);

  const loadAll = useCallback(async () => {
    try {
      const [daily, top, stages, recent, notif] = await Promise.all([
        getDailyStats(),
        getTopConvertedProducts(),
        getStageDistribution(),
        getRecentPurchaseIntentList(20),
        getNotificationStats(),
      ]);
      setDailyStats(daily);
      setTopProducts(top);
      setStageDist(stages);
      setRecentList(recent);
      setNotifStats(notif);
    } catch (e) {
      console.log('AdminDashboard load error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
    await loadInquiries();
  }, [loadInquiries]);

  const handleSubmitReply = async (replyText) => {
    if (!selectedInquiry || replying) return;
    setReplying(true);
    try {
      await updateDoc(doc(db, 'inquiries', selectedInquiry.id), {
        status:    'answered',
        reply:     replyText,
        repliedAt: serverTimestamp(),
      });
      setSelectedInquiry(null);
      await loadInquiries();
    } catch (e) {
      console.log('AdminDashboard submitReply error:', e);
      Alert.alert('오류', '답변 등록에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setReplying(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    loadInquiries();
  }, [loadInquiries]);

  const handleRefreshRates = async () => {
    setComputing(true);
    try {
      const count = await computeAndWriteSelectionRates();
      Alert.alert('완료', `${count}개 상품에 selectionRate 업데이트 완료`);
    } catch (e) {
      Alert.alert('오류', e.message || '업데이트 실패');
    } finally {
      setComputing(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="small" />
      </View>
    );
  }

  // Stage distribution: hottest stage = first entry
  const hottestStage = stageDist[0];

  return (
    <View style={{ flex: 1, backgroundColor: '#f5f7fb' }}>
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); loadAll(); }}
        />
      }
    >
      {/* ── A. Today's key metrics ── */}
      <SectionTitle title="오늘의 지표" />
      <View style={styles.statRow}>
        <StatCard
          label="구매 의도 CTR"
          value={`${dailyStats?.ctr ?? '0.0'}%`}
          sub={`${dailyStats?.purchaseClicks ?? 0}회 / ${dailyStats?.views ?? 0}뷰`}
          accent
        />
        <StatCard
          label="가장 핫한 월령대"
          value={hottestStage?.label ?? '-'}
          sub={`${hottestStage?.pct ?? 0}% (${hottestStage?.count ?? 0}명)`}
        />
        <StatCard
          label="알림 반응률"
          value={`${notifStats?.openRate ?? '0.0'}%`}
          sub={`${notifStats?.opened ?? 0} / ${notifStats?.sent ?? 0} 이벤트`}
        />
      </View>

      {/* ── B. Top converted products ── */}
      <SectionTitle title="TOP 구매 의도 상품" />
      {topProducts.length === 0 ? (
        <Text style={styles.emptyText}>데이터 없음</Text>
      ) : (
        topProducts.map((item, i) => (
          <View key={item.productGroupId} style={styles.rankRow}>
            <Text style={[styles.rankNum, i < 3 && styles.rankNumTop]}>
              {i + 1}
            </Text>
            <Text style={styles.rankName} numberOfLines={1}>{item.name}</Text>
            <View style={styles.rankClickBadge}>
              <Text style={styles.rankClickText}>{item.clickCount}회</Text>
            </View>
          </View>
        ))
      )}

      {/* ── C. Stage distribution ── */}
      <SectionTitle title="아이 월령 분포" />
      {stageDist.length === 0 ? (
        <Text style={styles.emptyText}>데이터 없음</Text>
      ) : (
        stageDist.map((entry) => (
          <View key={entry.stage} style={styles.stageRow}>
            <Text style={styles.stageLabel}>{entry.label}</Text>
            <View style={styles.stageBarTrack}>
              <View style={[styles.stageBarFill, { width: `${entry.pct}%` }]} />
            </View>
            <Text style={styles.stagePct}>{entry.pct}%</Text>
          </View>
        ))
      )}

      {/* ── D. Recent purchase intent list ── */}
      <SectionTitle title="최근 수익 유도 성공 리스트" />
      {recentList.length === 0 ? (
        <Text style={styles.emptyText}>데이터 없음</Text>
      ) : (
        recentList.map((item) => (
          <View key={item.id} style={styles.recentRow}>
            <View style={styles.recentInfo}>
              <Text style={styles.recentName} numberOfLines={1}>
                {item.productName}
              </Text>
              <Text style={styles.recentId} numberOfLines={1}>
                {item.productGroupId || item.productId || '-'}
              </Text>
            </View>
            <Text style={styles.recentTime}>{relativeTime(item.createdAt)}</Text>
          </View>
        ))
      )}

      {/* ── E. 1:1 문의 관리 ── */}
      <SectionTitle title="1:1 문의 관리" />
      {inquiries.length === 0 ? (
        <Text style={styles.emptyText}>접수된 문의가 없습니다</Text>
      ) : (
        inquiries.map((item) => {
          const pending = item.status !== 'answered';
          return (
            <TouchableOpacity
              key={item.id}
              style={[styles.inquiryRow, pending && styles.inquiryRowPending]}
              onPress={() => pending ? setSelectedInquiry(item) : null}
              activeOpacity={pending ? 0.72 : 1}
            >
              <View style={styles.inquiryMeta}>
                {item.category ? (
                  <View style={styles.inquiryCatBadge}>
                    <Text style={styles.inquiryCatText}>{item.category}</Text>
                  </View>
                ) : null}
                <View style={[styles.inquiryStatusBadge, pending ? styles.statusBadgePending : styles.statusBadgeAnswered]}>
                  <Text style={[styles.inquiryStatusText, pending ? styles.statusTextPending : styles.statusTextAnswered]}>
                    {pending ? '답변 대기' : '답변 완료'}
                  </Text>
                </View>
              </View>
              <Text style={[styles.inquiryTitle, pending && styles.inquiryTitlePending]} numberOfLines={1}>
                {item.title}
              </Text>
              <Text style={styles.inquiryDate}>{fmtDate(item.createdAt)}</Text>
              {pending && (
                <View style={styles.inquiryReplyBtn}>
                  <Text style={styles.inquiryReplyBtnText}>답변하기 →</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })
      )}

      {/* ── F. Refresh selectionRate utility ── */}
      <View style={styles.utilSection}>
        <Text style={styles.utilTitle}>상품 선택률 (selectionRate) 업데이트</Text>
        <Text style={styles.utilSub}>
          ProductDetail의 "N%가 이 제품 선택" 라벨에 사용됩니다.
          최근 30일 행동 데이터 기반으로 각 상품의 selectionRate를 재계산합니다.
        </Text>
        <TouchableOpacity
          style={[styles.utilBtn, computing && styles.utilBtnDisabled]}
          onPress={handleRefreshRates}
          disabled={computing}
          activeOpacity={0.8}
        >
          {computing ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.utilBtnText}>지표 새로고침</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>

    {selectedInquiry && (
      <InquiryReplyModal
        inquiry={selectedInquiry}
        onClose={() => setSelectedInquiry(null)}
        onSubmit={handleSubmitReply}
        submitting={replying}
      />
    )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7fb' },
  content: { padding: 14, paddingBottom: 48, gap: 10 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
    marginTop: 6,
    marginBottom: 2,
  },
  emptyText: { fontSize: 12, color: '#94a3b8', paddingVertical: 6 },

  // Stat row
  statRow: { flexDirection: 'row', gap: 8 },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e4e7ed',
    padding: 12,
    gap: 3,
    alignItems: 'center',
  },
  statCardAccent: { borderColor: '#bfdbfe', backgroundColor: '#eff6ff' },
  statValue: { fontSize: 18, fontWeight: '900', color: '#1d4ed8' },
  statLabel: { fontSize: 10, fontWeight: '700', color: '#64748b', textAlign: 'center' },
  statSub: { fontSize: 9, color: '#94a3b8', textAlign: 'center' },

  // Rank rows
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  rankNum: { fontSize: 14, fontWeight: '700', color: '#94a3b8', width: 20 },
  rankNumTop: { color: '#f59e0b' },
  rankName: { flex: 1, fontSize: 13, fontWeight: '600', color: '#0f172a' },
  rankClickBadge: {
    backgroundColor: '#eff6ff',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  rankClickText: { fontSize: 11, fontWeight: '700', color: '#2563eb' },

  // Stage distribution
  stageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  stageLabel: { width: 110, fontSize: 11, color: '#334155', fontWeight: '600' },
  stageBarTrack: {
    flex: 1,
    height: 8,
    backgroundColor: '#e2e8f0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  stageBarFill: {
    height: '100%',
    backgroundColor: '#6366f1',
    borderRadius: 4,
  },
  stagePct: { width: 32, fontSize: 11, fontWeight: '700', color: '#6366f1', textAlign: 'right' },

  // Recent list
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  recentInfo: { flex: 1, gap: 2 },
  recentName: { fontSize: 13, fontWeight: '600', color: '#0f172a' },
  recentId: { fontSize: 10, color: '#94a3b8' },
  recentTime: { fontSize: 11, color: '#64748b', flexShrink: 0 },

  // Inquiry rows
  inquiryRow: {
    backgroundColor: '#fff', borderRadius: 10,
    borderWidth: 1, borderColor: '#f1f5f9',
    paddingHorizontal: 14, paddingVertical: 12, gap: 4,
  },
  inquiryRowPending: { borderColor: '#fecaca', backgroundColor: '#fff7f7' },
  inquiryMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  inquiryCatBadge: {
    backgroundColor: '#f0fdf4', borderRadius: 20,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  inquiryCatText:  { fontSize: 10, fontWeight: '700', color: '#15803d' },
  inquiryStatusBadge: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
  statusBadgePending:  { backgroundColor: '#fee2e2' },
  statusBadgeAnswered: { backgroundColor: '#dbeafe' },
  inquiryStatusText:     { fontSize: 10, fontWeight: '700' },
  statusTextPending:  { color: '#dc2626' },
  statusTextAnswered: { color: '#1d4ed8' },
  inquiryTitle:        { fontSize: 13, fontWeight: '600', color: '#0f172a' },
  inquiryTitlePending: { fontWeight: '800', color: '#7f1d1d' },
  inquiryDate:         { fontSize: 11, color: '#94a3b8' },
  inquiryReplyBtn: {
    alignSelf: 'flex-start', marginTop: 4,
    backgroundColor: '#dc2626', borderRadius: 6,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  inquiryReplyBtnText: { fontSize: 11, fontWeight: '700', color: '#fff' },

  // Util section
  utilSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e4e7ed',
    padding: 14,
    gap: 8,
    marginTop: 6,
  },
  utilTitle: { fontSize: 13, fontWeight: '800', color: '#0f172a' },
  utilSub: { fontSize: 11, color: '#64748b', lineHeight: 16 },
  utilBtn: {
    backgroundColor: '#1d4ed8',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  utilBtnDisabled: { backgroundColor: '#93c5fd' },
  utilBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
});

const replyModal = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 36,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.1, shadowRadius: 12 },
      android: { elevation: 12 },
    }),
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 16,
  },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#0f172a' },
  closeBtn:    { fontSize: 18, color: '#64748b', fontWeight: '600' },

  inquiryBox: {
    backgroundColor: '#f8fafc', borderRadius: 12,
    padding: 14, marginBottom: 16, gap: 4,
  },
  cat:           { fontSize: 11, fontWeight: '700', color: '#15803d', marginBottom: 2 },
  inquiryTitle:  { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  inquiryContent:{ fontSize: 13, color: '#475569', lineHeight: 20 },
  date:          { fontSize: 11, color: '#94a3b8', marginTop: 2 },

  input: {
    backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, color: '#0f172a', height: 140, textAlignVertical: 'top',
  },
  charCount: { fontSize: 11, color: '#94a3b8', textAlign: 'right', marginTop: 4, marginBottom: 16 },

  submitBtn: {
    backgroundColor: '#1d4ed8', borderRadius: 12,
    paddingVertical: 14, alignItems: 'center',
  },
  submitBtnDisabled: { backgroundColor: '#93c5fd' },
  submitText: { fontSize: 15, fontWeight: '800', color: '#fff' },
});
