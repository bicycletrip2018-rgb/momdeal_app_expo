import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  getDailyStats,
  getTopConvertedProducts,
  getStageDistribution,
  getRecentPurchaseIntentList,
  getNotificationStats,
  computeAndWriteSelectionRates,
} from '../services/adminAnalyticsService';

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
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

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

      {/* ── E. Refresh selectionRate utility ── */}
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
