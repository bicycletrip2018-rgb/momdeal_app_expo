import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import GlobalHeader from '../components/GlobalHeader';
import { doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../firebase/config';
import { getOrCreateNickname } from '../services/firestore/userRepository';
import { checkMissionStatus, MISSION_DEFS, allMissionsComplete } from '../services/missionService';

const { width: SCREEN_W } = Dimensions.get('window');

// ─── Commerce dummy data ─────────────────────────────────────────────────────

const BANNERS = [
  {
    id: 1,
    bg: '#4f46e5',
    emoji: '🔥',
    title: '기저귀 특가 대란',
    sub: '인기 브랜드 최대 45% 할인',
    cta: '지금 바로 확인',
  },
  {
    id: 2,
    bg: '#e11d48',
    emoji: '🎁',
    title: '첫 구매 웰컴 쿠폰',
    sub: '신규 가입 첫 구매 3,000원 할인',
    cta: '쿠폰 받기',
  },
  {
    id: 3,
    bg: '#0891b2',
    emoji: '👶',
    title: '신생아 용품 기획전',
    sub: '출산 준비물 한 번에 모아보기',
    cta: '기획전 보기',
  },
];

const TIME_SALE_ITEMS = [
  { id: 1, emoji: '🧷', bg: '#fef9c3', brand: '하기스',     name: '네이처메이드 기저귀\n신생아용 100매',    discount: 45, price: 28900,  original: 52900 },
  { id: 2, emoji: '🧴', bg: '#fce7f3', brand: '모윈',       name: '아기 물티슈 72매\n10팩 세트',           discount: 38, price: 12500,  original: 20000 },
  { id: 3, emoji: '🫧', bg: '#e0f2fe', brand: '피죤',       name: '베이비 세탁세제\n3L 대용량',            discount: 30, price: 13200,  original: 18900 },
  { id: 4, emoji: '💊', bg: '#f0fdf4', brand: '뉴트리벤스', name: '영아용 철분 비타민\n드롭스 50ml',        discount: 25, price: 14900,  original: 19900 },
  { id: 5, emoji: '🍼', bg: '#ede9fe', brand: '헤겐',       name: '실리콘 젖꼭지 M사이즈\n4개 세트',       discount: 20, price: 9800,   original: 12300 },
];

const HOT_DEALS = [
  {
    id: 1,
    emoji: '🍼', bg: '#ede9fe',
    brand: '코멧', tag: '베스트셀러',
    name: '친환경 유아 젖병 160ml 4개 세트',
    discount: 40, price: 23900, original: 39900,
    badge: '🚀 무료배송',
  },
  {
    id: 2,
    emoji: '🌾', bg: '#fef9c3',
    brand: '아이배냇', tag: '신상',
    name: '유기농 쌀과자 15봉 멀티팩 (무첨가)',
    discount: 33, price: 15800, original: 23600,
    badge: '🚀 무료배송',
  },
  {
    id: 3,
    emoji: '🪑', bg: '#fce7f3',
    brand: '치코', tag: '핫딜',
    name: '바운서 + 흔들의자 2in1 올인원',
    discount: 20, price: 87000, original: 109000,
    badge: '🏷️ 쿠폰 추가 5%',
  },
  {
    id: 4,
    emoji: '🧣', bg: '#ecfdf5',
    brand: '코니', tag: '오늘만',
    name: '신생아 속싸개 거즈 5매 선물 세트',
    discount: 55, price: 18900, original: 42000,
    badge: '🚀 무료배송',
  },
];

const SECRET_DEAL = {
  emoji: '🎀',
  bg: '#fce7f3',
  brand: '러브뮤직',
  tag: '역대급 최저가',
  name: '오가닉 올인원 바디수트 5종 세트 (0-6개월)',
  discount: 67,
  price: 13900,
  original: 42000,
  badge: '🔥 역대급 최저가',
};

// ─── Mission config (sourced from missionService) ───────────────────────────

const MISSIONS = MISSION_DEFS.map((m) => ({
  id: m.id,
  label: m.label,
  total: m.required,
  hint: m.hint,
  navTarget: m.navTarget,
}));

const BADGES = [
  {
    id: 'explorer',
    label: '🔍 탐험가',
    desc: '추천 상품 3개 보기 완료',
    condition: (p) => p.view_products >= 3,
  },
  {
    id: 'ranker',
    label: '🏅 랭킹러',
    desc: '랭킹 탭 방문 완료',
    condition: (p) => p.view_ranking >= 1,
  },
  {
    id: 'social',
    label: '💬 소통왕',
    desc: '커뮤니티 글 1개 보기 완료',
    condition: (p) => p.view_community >= 1,
  },
  {
    id: 'champion',
    label: '🏆 오늘의 챔피언',
    desc: '오늘 미션 모두 완료',
    condition: (p) => p.view_products >= 3 && p.view_ranking >= 1 && p.view_community >= 1,
  },
];

// ─── Level derivation ────────────────────────────────────────────────────────

function deriveLevel(streak, completedToday) {
  const pts = streak * 2 + completedToday * 5;
  if (pts >= 50) return { level: 5, badge: '베테랑맘' };
  if (pts >= 25) return { level: 4, badge: '꼼꼼맘' };
  if (pts >= 10) return { level: 3, badge: '활동맘' };
  if (pts >= 3)  return { level: 2, badge: '탐험가' };
  return { level: 1, badge: '새싹맘' };
}

// ─── Countdown helper ────────────────────────────────────────────────────────

function secsUntilMidnight() {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(23, 59, 59, 0);
  return Math.max(0, Math.floor((midnight - now) / 1000));
}

function formatSecs(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ─── Sub-components: Commerce ────────────────────────────────────────────────

function BannerSlide({ emoji, title, sub, cta, bg }) {
  return (
    <TouchableOpacity
      style={[styles.bannerSlide, { width: SCREEN_W, backgroundColor: bg }]}
      activeOpacity={0.92}
    >
      <Text style={styles.bannerEmoji}>{emoji}</Text>
      <Text style={styles.bannerTitle}>{title}</Text>
      <Text style={styles.bannerSub}>{sub}</Text>
      <View style={styles.bannerCtaBtn}>
        <Text style={styles.bannerCtaText}>{cta} →</Text>
      </View>
    </TouchableOpacity>
  );
}

function TimeSaleCard({ emoji, bg, brand, name, discount, price, original }) {
  return (
    <View style={styles.timeSaleCard}>
      <View style={[styles.timeSaleImage, { backgroundColor: bg }]}>
        <Text style={{ fontSize: 30 }}>{emoji}</Text>
      </View>
      <Text style={styles.timeSaleBrand}>{brand}</Text>
      <Text style={styles.timeSaleName} numberOfLines={2}>{name}</Text>
      <Text style={styles.timeSaleOriginal}>₩{original.toLocaleString('ko-KR')}</Text>
      <View style={styles.timeSalePriceRow}>
        <Text style={styles.timeSaleDiscount}>{discount}%</Text>
        <Text style={styles.timeSalePrice}>₩{price.toLocaleString('ko-KR')}</Text>
      </View>
    </View>
  );
}

function HotDealRow({ emoji, bg, brand, tag, name, discount, price, original, badge, noBorder }) {
  return (
    <View style={[styles.hotDealCard, noBorder && styles.hotDealCardNoBorder]}>
      {/* Left thumbnail */}
      <View style={[styles.hotDealThumb, { backgroundColor: bg }]}>
        <Text style={{ fontSize: 36 }}>{emoji}</Text>
      </View>

      {/* Right info */}
      <View style={styles.hotDealInfo}>
        <View style={styles.hotDealTagRow}>
          <View style={styles.hotDealTag}>
            <Text style={styles.hotDealTagText}>{tag}</Text>
          </View>
        </View>
        <Text style={styles.hotDealBrand}>{brand}</Text>
        <Text style={styles.hotDealName} numberOfLines={2}>{name}</Text>
        <Text style={styles.hotDealOriginal}>₩{original.toLocaleString('ko-KR')}</Text>
        <View style={styles.hotDealPriceRow}>
          <Text style={styles.hotDealDiscount}>{discount}%</Text>
          <Text style={styles.hotDealPrice}>₩{price.toLocaleString('ko-KR')}</Text>
        </View>
        <View style={styles.hotDealBadge}>
          <Text style={styles.hotDealBadgeText}>{badge}</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Sub-components: Gamification (unchanged) ────────────────────────────────

function StepIndicator({ completed, total }) {
  return (
    <View style={styles.stepRow}>
      {Array.from({ length: total }).map((_, i) => (
        <React.Fragment key={i}>
          <View style={[styles.stepCircle, i < completed && styles.stepCircleDone]}>
            <Text style={[styles.stepText, i < completed && styles.stepTextDone]}>
              {i < completed ? '✓' : String(i + 1)}
            </Text>
          </View>
          {i < total - 1 ? (
            <View style={[styles.stepLine, i < completed - 1 && styles.stepLineDone]} />
          ) : null}
        </React.Fragment>
      ))}
      <Text style={styles.stepLabel}>{completed}/{total} 완료</Text>
    </View>
  );
}

function MissionRow({ label, done, total, hint, navTarget, navigation }) {
  const pct = Math.min(done / total, 1);
  const isComplete = done >= total;
  return (
    <View style={styles.missionRow}>
      <View style={styles.missionHeader}>
        <Text style={styles.missionLabel}>
          {isComplete ? '✅ ' : '⬜ '}{label}
        </Text>
        <Text style={[styles.missionCount, isComplete && styles.missionCountDone]}>
          {Math.min(done, total)}/{total}
        </Text>
      </View>
      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            { width: `${pct * 100}%` },
            isComplete && styles.progressFillDone,
          ]}
        />
      </View>
      <View style={styles.missionFooter}>
        {!isComplete ? (
          <Text style={styles.missionHint}>{hint(done)}</Text>
        ) : (
          <Text style={styles.missionHintDone}>완료!</Text>
        )}
        <TouchableOpacity
          style={[styles.missionBtn, isComplete && styles.missionBtnDone]}
          onPress={() => !isComplete && navigation.navigate(navTarget)}
          activeOpacity={isComplete ? 1 : 0.8}
          disabled={isComplete}
        >
          <Text style={[styles.missionBtnText, isComplete && styles.missionBtnTextDone]}>
            {isComplete ? '✅ 완료됨' : '보러가기'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function SecretMissionDeal({ completedMissions, totalMissions, missions, progress, navigation, allDone }) {
  return (
    <View style={styles.secretMissionCard}>
      {/* ── Top: title + step progress + mission rows ── */}
      <View style={styles.smcTop}>
        <View style={styles.smcTitleRow}>
          <Text style={styles.smcTitle}>오늘의 미션 달성하고 시크릿 핫딜 열기 🔥</Text>
          {allDone ? (
            <View style={styles.smcUnlockedBadge}>
              <Text style={styles.smcUnlockedBadgeText}>공개됨 🎉</Text>
            </View>
          ) : (
            <View style={styles.smcLockedBadge}>
              <Text style={styles.smcLockedBadgeText}>🔒 잠금</Text>
            </View>
          )}
        </View>
        <StepIndicator completed={completedMissions} total={totalMissions} />
        {missions.map((m) => (
          <MissionRow
            key={m.id}
            label={m.label}
            done={progress[m.id]}
            total={m.total}
            hint={m.hint}
            navTarget={m.navTarget}
            navigation={navigation}
          />
        ))}
      </View>

      {/* ── Divider ── */}
      <View style={styles.smcDivider} />

      {/* ── Bottom: locked preview or unlocked deal ── */}
      {allDone ? (
        <View style={styles.smcUnlockedSection}>
          <Text style={styles.smcUnlockedLabel}>🎉 시크릿 핫딜 공개!</Text>
          <HotDealRow {...SECRET_DEAL} noBorder />
        </View>
      ) : (
        <View style={styles.smcLockedSection}>
          {/* Grayed-out product preview */}
          <View style={styles.smcLockedThumb}>
            <Text style={styles.smcLockEmoji}>🔒</Text>
          </View>
          <View style={styles.smcLockedInfo}>
            <Text style={styles.smcLockedBlurName}>████████████████</Text>
            <Text style={styles.smcLockedBlurBrand}>██████</Text>
            <Text style={styles.smcLockedBlurPrice}>₩ ██,███</Text>
            <Text style={styles.smcLockedMsg}>미션 {totalMissions}개 달성 시{'\n'}역대급 최저가 오픈!</Text>
            <View style={styles.smcProgressPill}>
              <Text style={styles.smcProgressPillText}>{completedMissions}/{totalMissions} 완료</Text>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

function BadgeChip({ label, desc, earned }) {
  return (
    <View style={[styles.badgeChip, earned ? styles.badgeChipEarned : styles.badgeChipLocked]}>
      <Text style={[styles.badgeLabel, !earned && styles.badgeLabelLocked]}>{label}</Text>
      <Text style={[styles.badgeDesc, !earned && styles.badgeDescLocked]}>{desc}</Text>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function BenefitsScreen({ navigation }) {

  // ── Gamification state (unchanged) ───────────────────────────────────────
  const [progress, setProgress] = useState({
    view_products: 0,
    view_ranking: 0,
    view_community: 0,
  });
  const [streak,   setStreak]   = useState(0);
  const [nickname, setNickname] = useState('');
  const [loading,  setLoading]  = useState(true);

  // ── Commerce state ────────────────────────────────────────────────────────
  const [bannerIndex, setBannerIndex] = useState(0);
  const [countdown,   setCountdown]   = useState(secsUntilMidnight);

  // ── Data loading (unchanged) ──────────────────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      unsub();
      if (!user?.uid) { setLoading(false); return; }
      const uid = user.uid;
      getOrCreateNickname(uid).then(setNickname).catch(() => {});
      try {
        const [missionProgress, userSnap] = await Promise.all([
          checkMissionStatus(uid),
          getDoc(doc(db, 'users', uid)),
        ]);
        const userData = userSnap.exists() ? userSnap.data() : {};
        setStreak(userData.streakCount ?? userData.streak ?? 0);
        setProgress(missionProgress);
      } catch (e) {
        console.log('BenefitsScreen load error:', e);
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  useFocusEffect(
    useCallback(() => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      checkMissionStatus(uid).then(setProgress).catch(() => {});
    }, [])
  );

  // ── Countdown tick ────────────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : secsUntilMidnight()));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const completedMissions = MISSIONS.filter((m) => progress[m.id] >= m.total).length;
  const allDone = completedMissions === MISSIONS.length;
  const { level, badge: levelBadge } = deriveLevel(streak, completedMissions);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="small" />
      </View>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={styles.benefitsRoot}>
      <GlobalHeader tabName="Benefits" placeholder="찾으시는 특가 상품이 있나요?" navigation={navigation} />

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >

      {/* ══════════════════════════════════════════════════════════════════════
          1. HERO BANNER CAROUSEL
      ══════════════════════════════════════════════════════════════════════ */}
      <View style={styles.bannerSection}>
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) =>
            setBannerIndex(Math.round(e.nativeEvent.contentOffset.x / SCREEN_W))
          }
        >
          {BANNERS.map((b) => (
            <BannerSlide key={b.id} {...b} />
          ))}
        </ScrollView>
        {/* Dot indicators */}
        <View style={styles.bannerDots}>
          {BANNERS.map((_, i) => (
            <View
              key={i}
              style={[styles.bannerDot, i === bannerIndex && styles.bannerDotActive]}
            />
          ))}
        </View>
      </View>

      {/* ══════════════════════════════════════════════════════════════════════
          2. TIME SALE SECTION
      ══════════════════════════════════════════════════════════════════════ */}
      <View style={styles.sectionBlock}>
        <View style={styles.sectionTitleRow}>
          <Text style={styles.sectionTitleText}>⏰ 마감 임박 핫딜</Text>
          <View style={styles.countdownPill}>
            <Text style={styles.countdownText}>{formatSecs(countdown)}</Text>
          </View>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.timeSaleScroll}
        >
          {TIME_SALE_ITEMS.map((item) => (
            <TimeSaleCard key={item.id} {...item} />
          ))}
        </ScrollView>
      </View>

      {/* ══════════════════════════════════════════════════════════════════════
          3. PROFILE & LEVEL (existing)
      ══════════════════════════════════════════════════════════════════════ */}
      <View style={styles.profileCard}>
        <View style={styles.profileLeft}>
          <Text style={styles.profileNickname}>{nickname || '세이브루 사용자'}</Text>
          <View style={styles.levelBadgeRow}>
            <View style={styles.levelBadge}>
              <Text style={styles.levelBadgeText}>Lv.{level} {levelBadge}</Text>
            </View>
          </View>
        </View>
        <View style={styles.profileRight}>
          <Text style={styles.streakText}>
            {streak > 0 ? `🔥 ${streak}일 연속 접속 중!` : '🔥 오늘 첫 접속!'}
          </Text>
        </View>
      </View>

      {/* ══════════════════════════════════════════════════════════════════════
          4. UNIFIED MISSION + SECRET DEAL CARD
      ══════════════════════════════════════════════════════════════════════ */}
      <SecretMissionDeal
        completedMissions={completedMissions}
        totalMissions={MISSIONS.length}
        missions={MISSIONS}
        progress={progress}
        navigation={navigation}
        allDone={allDone}
      />

      {/* ══════════════════════════════════════════════════════════════════════
          5. HOT DEALS FEED
      ══════════════════════════════════════════════════════════════════════ */}
      <View style={styles.sectionBlock}>
        <View style={styles.sectionTitleRow}>
          <Text style={styles.sectionTitleText}>오늘의 육아템 특가</Text>
          <TouchableOpacity activeOpacity={0.7}>
            <Text style={styles.sectionViewAll}>전체보기 ›</Text>
          </TouchableOpacity>
        </View>
        {HOT_DEALS.map((item) => (
          <HotDealRow key={item.id} {...item} />
        ))}
      </View>

      {/* ══════════════════════════════════════════════════════════════════════
          7. BADGES (existing)
      ══════════════════════════════════════════════════════════════════════ */}
      <Text style={styles.sectionTitle}>획득 뱃지</Text>
      <View style={styles.badgeGrid}>
        {BADGES.map((b) => (
          <BadgeChip
            key={b.id}
            label={b.label}
            desc={b.desc}
            earned={b.condition(progress)}
          />
        ))}
      </View>

    </ScrollView>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  benefitsRoot: { flex: 1, backgroundColor: '#fff' },
  container:    { flex: 1, backgroundColor: '#f1f5f9' },

  content:   { gap: 14, paddingBottom: 56 },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // ── Hero banner ────────────────────────────────────────────────────────────
  bannerSection: {
    // no horizontal padding — full bleed within tab's safe area
  },
  bannerSlide: {
    height: 164,
    paddingHorizontal: 24,
    paddingVertical: 20,
    justifyContent: 'center',
    gap: 4,
  },
  bannerEmoji:   { fontSize: 28, lineHeight: 34, marginBottom: 2 },
  bannerTitle:   { fontSize: 22, fontWeight: '900', color: '#fff', lineHeight: 28 },
  bannerSub:     { fontSize: 13, color: 'rgba(255,255,255,0.82)', lineHeight: 18 },
  bannerCtaBtn: {
    alignSelf: 'flex-start',
    marginTop: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  bannerCtaText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  bannerDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    backgroundColor: '#f1f5f9',
  },
  bannerDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: '#cbd5e1',
  },
  bannerDotActive: {
    width: 18, backgroundColor: '#2563eb',
  },

  // ── Shared section block ───────────────────────────────────────────────────
  sectionBlock: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
    gap: 12,
    ...require('react-native').Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 6 },
      android: { elevation: 1 },
    }),
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  sectionTitleText: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  sectionViewAll:   { fontSize: 12, fontWeight: '700', color: '#2563eb' },

  // ── Countdown pill ─────────────────────────────────────────────────────────
  countdownPill: {
    backgroundColor: '#fef2f2',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  countdownText: { fontSize: 13, fontWeight: '800', color: '#dc2626', fontVariant: ['tabular-nums'] },

  // ── Time sale cards ────────────────────────────────────────────────────────
  timeSaleScroll: { paddingHorizontal: 16, gap: 10 },
  timeSaleCard: {
    width: 126,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    padding: 10,
    gap: 4,
  },
  timeSaleImage: {
    width: '100%', height: 80,
    borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  timeSaleBrand:    { fontSize: 10, color: '#94a3b8', fontWeight: '600' },
  timeSaleName:     { fontSize: 11, fontWeight: '600', color: '#334155', lineHeight: 15 },
  timeSaleOriginal: { fontSize: 10, color: '#cbd5e1', textDecorationLine: 'line-through', marginTop: 2 },
  timeSalePriceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, flexWrap: 'wrap' },
  timeSaleDiscount: { fontSize: 18, fontWeight: '900', color: '#ef4444' },
  timeSalePrice:    { fontSize: 13, fontWeight: '800', color: '#0f172a' },

  // ── Hot deal cards (vertical feed) ─────────────────────────────────────────
  hotDealCard: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 14,
    borderTopWidth: 1,
    borderTopColor: '#f8fafc',
  },
  hotDealThumb: {
    width: 100, height: 100,
    borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  hotDealInfo:     { flex: 1, gap: 3, justifyContent: 'center' },
  hotDealTagRow:   { flexDirection: 'row' },
  hotDealTag: {
    backgroundColor: '#eff6ff',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  hotDealTagText:     { fontSize: 10, fontWeight: '700', color: '#2563eb' },
  hotDealBrand:       { fontSize: 11, color: '#94a3b8', fontWeight: '600' },
  hotDealName:        { fontSize: 13, fontWeight: '700', color: '#0f172a', lineHeight: 17 },
  hotDealOriginal: {
    fontSize: 11,
    color: '#94a3b8',
    textDecorationLine: 'line-through',
  },
  hotDealCardNoBorder: { borderTopWidth: 0 },
  hotDealPriceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  hotDealDiscount: { fontSize: 17, fontWeight: '900', color: '#ef4444' },
  hotDealPrice:    { fontSize: 17, fontWeight: '900', color: '#0f172a' },
  hotDealBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#f0fdf4',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginTop: 2,
  },
  hotDealBadgeText: { fontSize: 10, fontWeight: '700', color: '#16a34a' },

  // ── Profile card (existing, unchanged) ─────────────────────────────────────
  profileCard: {
    backgroundColor: '#1d4ed8',
    borderRadius: 16,
    marginHorizontal: 16,
    paddingHorizontal: 18,
    paddingVertical: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  profileLeft:      { gap: 6 },
  profileRight:     {},
  profileNickname:  { fontSize: 18, fontWeight: '800', color: '#fff' },
  levelBadgeRow:    { flexDirection: 'row' },
  levelBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  levelBadgeText: { fontSize: 12, fontWeight: '700', color: '#e0f2fe' },
  streakText:     { fontSize: 13, fontWeight: '700', color: '#fde68a' },

  // ── Unified Secret Mission + Deal card ─────────────────────────────────────
  secretMissionCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginHorizontal: 16,
    borderWidth: 1.5,
    borderColor: '#fcd34d',
    overflow: 'hidden',
    ...require('react-native').Platform.select({
      ios:     { shadowColor: '#f59e0b', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 8 },
      android: { elevation: 2 },
    }),
  },
  smcTop: { padding: 16, gap: 14 },
  smcTitleRow: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8,
  },
  smcTitle: { flex: 1, fontSize: 15, fontWeight: '800', color: '#0f172a', lineHeight: 20 },
  smcLockedBadge:   { backgroundColor: '#fef3c7', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  smcLockedBadgeText: { fontSize: 11, fontWeight: '700', color: '#92400e' },
  smcUnlockedBadge:   { backgroundColor: '#dcfce7', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  smcUnlockedBadgeText: { fontSize: 11, fontWeight: '700', color: '#16a34a' },
  smcDivider: { height: 1, backgroundColor: '#fef3c7', marginHorizontal: 0 },
  // Locked deal preview
  smcLockedSection: {
    flexDirection: 'row',
    padding: 16,
    gap: 14,
    alignItems: 'center',
    backgroundColor: '#fffbeb',
  },
  smcLockedThumb: {
    width: 90, height: 90,
    borderRadius: 12,
    backgroundColor: '#e2e8f0',
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
    opacity: 0.7,
  },
  smcLockEmoji: { fontSize: 28 },
  smcLockedInfo: { flex: 1, gap: 4 },
  smcLockedBlurName:  { fontSize: 12, color: '#cbd5e1', fontWeight: '700', letterSpacing: 1 },
  smcLockedBlurBrand: { fontSize: 10, color: '#d1d5db', fontWeight: '600', letterSpacing: 1 },
  smcLockedBlurPrice: { fontSize: 12, color: '#d1d5db', fontWeight: '700', letterSpacing: 1 },
  smcLockedMsg: {
    fontSize: 13, fontWeight: '800', color: '#92400e',
    lineHeight: 19, marginTop: 4,
  },
  smcProgressPill: {
    alignSelf: 'flex-start',
    backgroundColor: '#fef3c7',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#fcd34d',
    marginTop: 2,
  },
  smcProgressPillText: { fontSize: 11, fontWeight: '700', color: '#b45309' },
  // Unlocked deal
  smcUnlockedSection: { backgroundColor: '#f0fdf4', paddingTop: 12 },
  smcUnlockedLabel: {
    fontSize: 14, fontWeight: '800', color: '#16a34a',
    textAlign: 'center', paddingBottom: 4,
  },

  // ── Mission rows (reused inside unified card) ───────────────────────────────
  stepRow:   { flexDirection: 'row', alignItems: 'center', gap: 0, paddingVertical: 4 },
  stepCircle: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#e2e8f0',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: '#cbd5e1',
  },
  stepCircleDone: { backgroundColor: '#16a34a', borderColor: '#16a34a' },
  stepText:       { fontSize: 11, fontWeight: '700', color: '#64748b' },
  stepTextDone:   { color: '#fff' },
  stepLine:       { flex: 1, height: 2, backgroundColor: '#e2e8f0', marginHorizontal: 2 },
  stepLineDone:   { backgroundColor: '#16a34a' },
  stepLabel:      { fontSize: 12, fontWeight: '700', color: '#64748b', marginLeft: 8 },
  missionRow: {
    gap: 6, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  missionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  missionLabel:      { flex: 1, fontSize: 13, fontWeight: '600', color: '#1e293b', lineHeight: 18 },
  missionCount:      { fontSize: 12, fontWeight: '700', color: '#64748b', marginLeft: 6 },
  missionCountDone:  { color: '#16a34a' },
  progressTrack:     { height: 6, backgroundColor: '#e2e8f0', borderRadius: 4, overflow: 'hidden' },
  progressFill:      { height: '100%', backgroundColor: '#3b82f6', borderRadius: 4 },
  progressFillDone:  { backgroundColor: '#16a34a' },
  missionFooter: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  missionHint:     { flex: 1, fontSize: 11, color: '#94a3b8' },
  missionHintDone: { flex: 1, fontSize: 11, color: '#16a34a', fontWeight: '700' },
  missionBtn: {
    backgroundColor: '#eff6ff', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 5,
    borderWidth: 1, borderColor: '#bfdbfe',
  },
  missionBtnDone:     { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' },
  missionBtnText:     { fontSize: 12, fontWeight: '700', color: '#2563eb' },
  missionBtnTextDone: { color: '#16a34a' },



  // ── Badges (existing, unchanged) ───────────────────────────────────────────
  sectionTitle: {
    fontSize: 16, fontWeight: '800', color: '#0f172a',
    marginTop: 2, paddingHorizontal: 16,
  },
  badgeGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16 },
  badgeChip: {
    borderRadius: 10, borderWidth: 1.5,
    paddingHorizontal: 12, paddingVertical: 10,
    gap: 2, minWidth: '47%', flexGrow: 1,
  },
  badgeChipEarned: { backgroundColor: '#fef3c7', borderColor: '#f59e0b' },
  badgeChipLocked: { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' },
  badgeLabel:       { fontSize: 14, fontWeight: '800', color: '#92400e' },
  badgeLabelLocked: { color: '#94a3b8' },
  badgeDesc:        { fontSize: 11, color: '#78350f' },
  badgeDescLocked:  { color: '#cbd5e1' },
});
