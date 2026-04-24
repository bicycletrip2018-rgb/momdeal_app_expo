import React from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Rect } from 'react-native-svg';
import { COLORS } from '../constants/theme';

function ChevronLeftIcon({ size = 22, color = '#0f172a' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M15 18l-6-6 6-6" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"/>
    </Svg>
  );
}

// ─── SVG Icons ───────────────────────────────────────────────────────────────

function LockIcon({ size = 13, color = '#94a3b8' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="3" y="11" width="18" height="11" rx="2" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"/>
      <Path d="M7 11V7a5 5 0 0 1 10 0v4" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"/>
    </Svg>
  );
}

function CheckIcon({ size = 11, color = '#fff' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M20 6L9 17l-5-5" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"/>
    </Svg>
  );
}

// ─── Level data (SSOT — criteria terminology unified) ────────────────────────

const LEVEL_LIST = [
  {
    id: 'rookie',
    lvNum: 1,
    name: '일반맘',
    bg: '#f0fdf4', text: '#15803d', dotBg: '#22c55e',
    criteriaDetail: '앱 설치 및 아이 프로필 등록',
    progressItems: [],
  },
  {
    id: 'explorer',
    lvNum: 2,
    name: '성실맘',
    bg: '#eff6ff', text: COLORS.primary, dotBg: COLORS.primary,
    criteriaDetail: '관심상품 등록 5개 이상 & 맘톡 게시글 1개 이상',
    progressItems: [
      { label: '관심상품', statKey: 'savedCount', target: 5 },
      { label: '맘톡 글',  statKey: 'postCount',  target: 1 },
    ],
  },
  {
    id: 'reviewer',
    lvNum: 3,
    name: '열심맘',
    bg: '#fef3c7', text: '#b45309', dotBg: '#f59e0b',
    criteriaDetail: '실구매 인증 리뷰 3회 이상 & 관심상품 등록 10개 이상',
    progressItems: [
      { label: '리뷰 인증', statKey: 'reviewCount', target: 3 },
      { label: '관심상품',  statKey: 'savedCount',  target: 10 },
    ],
  },
  {
    id: 'pro',
    lvNum: 4,
    name: '우수맘',
    bg: '#fdf4ff', text: '#7e22ce', dotBg: '#a855f7',
    criteriaDetail: '실구매 인증 리뷰 10회 & 커뮤니티 게시글 10개 & 관심상품 등록 30개',
    progressItems: [
      { label: '리뷰 인증', statKey: 'reviewCount', target: 10 },
      { label: '게시글',    statKey: 'postCount',   target: 10 },
      { label: '관심상품',  statKey: 'savedCount',  target: 30 },
    ],
  },
];

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function LevelInfoScreen({ route, navigation }) {
  const insets         = useSafeAreaInsets();
  const currentLevelId = route?.params?.currentLevelId ?? 'rookie';
  const stats          = route?.params?.stats ?? {};
  const currentIdx     = LEVEL_LIST.findIndex((l) => l.id === currentLevelId);

  return (
    <View style={[styles.screenWrap, { paddingTop: insets.top }]}>
      {/* Custom header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.headerBack}
        >
          <ChevronLeftIcon size={22} color="#0f172a" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>등급 안내</Text>
        <View style={styles.headerBack} />
      </View>

    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: insets.bottom + 16, paddingTop: 12 }}
      showsVerticalScrollIndicator={false}
    >
      {LEVEL_LIST.map((level, idx) => {
        const isCurrent = idx === currentIdx;
        const isTarget  = idx === currentIdx + 1;
        const achieved  = idx <= currentIdx;
        const isLast    = idx === LEVEL_LIST.length - 1;

        return (
          <View key={level.id} style={styles.timelineRow}>

            {/* ── Spine ── */}
            <View style={styles.spine}>
              <View style={[styles.dot, achieved ? { backgroundColor: level.dotBg } : styles.dotLocked]}>
                {achieved
                  ? <CheckIcon size={10} color="#fff" />
                  : <LockIcon size={10} color="#94a3b8" />}
              </View>
              {!isLast && (
                <View style={[styles.connector, achieved && !isCurrent && { backgroundColor: level.dotBg + '88' }]} />
              )}
            </View>

            {/* ── Card ── */}
            <View style={[
              styles.card,
              !achieved && styles.cardLocked,
              isCurrent && [styles.cardCurrent, { borderColor: level.dotBg }],
            ]}>

              {/* Title row */}
              <View style={styles.titleRow}>
                <View style={[styles.lvChip, { backgroundColor: achieved ? level.bg : '#f1f5f9' }]}>
                  <Text style={[styles.lvChipText, { color: achieved ? level.text : '#94a3b8' }]}>
                    {'Lv.' + level.lvNum}
                  </Text>
                </View>
                <Text style={[styles.levelName, !achieved && styles.levelNameLocked]}>
                  {level.name}
                </Text>
                {isCurrent && (
                  <View style={[styles.currentChip, { backgroundColor: level.dotBg }]}>
                    <Text style={styles.currentChipText}>현재</Text>
                  </View>
                )}
                {!achieved && (
                  <View style={styles.lockChip}>
                    <LockIcon size={10} color="#94a3b8" />
                  </View>
                )}
              </View>

              {/* Criteria */}
              <View style={styles.criteriaRow}>
                <Text style={styles.criteriaLabel}>달성 조건</Text>
                <Text style={[styles.criteriaValue, !achieved && styles.criteriaValueLocked]}>
                  {level.criteriaDetail}
                </Text>
              </View>

              {/* Progress gauges — target level only */}
              {isTarget && level.progressItems.length > 0 && (
                <View style={styles.gaugeSection}>
                  {level.progressItems.map((item) => {
                    const cur  = Math.min(stats[item.statKey] ?? 0, item.target);
                    const pct  = item.target > 0 ? cur / item.target : 0;
                    const done = pct >= 1;
                    return (
                      <View key={item.label} style={styles.gaugeRow}>
                        <Text style={styles.gaugeLabel}>{item.label}</Text>
                        <View style={styles.gaugeTrack}>
                          <View style={[styles.gaugeFill, { width: `${pct * 100}%` }, done && styles.gaugeFillDone]} />
                        </View>
                        <Text style={[styles.gaugeCount, done && styles.gaugeCountDone]}>
                          {cur}/{item.target}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              )}

            </View>
          </View>
        );
      })}

      <Text style={styles.footerNote}>레벨은 활동 데이터 기준으로 자동 갱신됩니다.</Text>
    </ScrollView>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screenWrap: { flex: 1, backgroundColor: '#f8fafc' },
  container: { flex: 1, backgroundColor: '#f8fafc' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    paddingHorizontal: 4,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  headerBack: {
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
  },

  timelineRow: { flexDirection: 'row', paddingHorizontal: 14, gap: 10 },

  spine: { width: 22, alignItems: 'center', paddingTop: 7 },
  dot: {
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center', zIndex: 1,
  },
  dotLocked: { backgroundColor: '#e2e8f0' },
  connector: { width: 2, flex: 1, backgroundColor: '#e2e8f0', minHeight: 8, marginVertical: 2 },

  card: {
    flex: 1, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0',
    backgroundColor: '#fff',
    paddingHorizontal: 12, paddingVertical: 10,
    marginBottom: 8, gap: 6,
  },
  cardLocked: {
    backgroundColor: '#f8fafc',
  },
  cardCurrent: {
    borderWidth: 2,
    ...Platform.select({
      ios:     { shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 },
      android: { elevation: 2 },
    }),
  },

  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  lvChip: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  lvChipText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.2 },
  levelName: { fontSize: 16, fontWeight: '900', color: '#0f172a', flex: 1 },
  levelNameLocked: { color: '#94a3b8' },

  currentChip: { borderRadius: 20, paddingHorizontal: 7, paddingVertical: 2 },
  currentChipText: { fontSize: 9, fontWeight: '800', color: '#fff' },
  lockChip: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center',
  },

  criteriaRow: { gap: 2 },
  criteriaLabel: {
    fontSize: 9, fontWeight: '700', color: '#94a3b8',
    textTransform: 'uppercase', letterSpacing: 0.4,
  },
  criteriaValue: { fontSize: 12, fontWeight: '600', color: '#0f172a', lineHeight: 17 },
  criteriaValueLocked: { color: '#94a3b8' },

  gaugeSection: { gap: 5 },
  gaugeRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  gaugeLabel: { fontSize: 10, fontWeight: '600', color: '#475569', width: 48 },
  gaugeTrack: { flex: 1, height: 7, borderRadius: 4, backgroundColor: '#e2e8f0', overflow: 'hidden' },
  gaugeFill: { height: '100%', borderRadius: 4, backgroundColor: COLORS.primary },
  gaugeFillDone: { backgroundColor: '#22c55e' },
  gaugeCount: { fontSize: 10, fontWeight: '700', color: '#334155', width: 28, textAlign: 'right' },
  gaugeCountDone: { color: '#16a34a' },

  footerNote: {
    fontSize: 11, color: '#94a3b8', textAlign: 'center',
    paddingHorizontal: 24, marginTop: 4,
  },
});
