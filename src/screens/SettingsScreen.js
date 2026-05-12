import React, { useState } from 'react';
import {
  ActivityIndicator, Alert, Linking, Modal, Platform,
  ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View,
  KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Bell, ChevronLeft, ChevronRight, FileText,
  HelpCircle, Info, MessageSquare,
  ShieldCheck, UserX, Zap,
} from 'lucide-react-native';
import { COLORS } from '../constants/theme';
import { loginWithKakao } from '../services/authService';
import { useNotification } from '../context/NotificationContext';

// ─── Section Header (Caption Token — uppercase label) ────────────────────────

function SectionHeader({ title }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

// ─── Standard Row ─────────────────────────────────────────────────────────────

function SettingsRow({ icon, label, accessory, accessoryBlue, labelBlue, onPress, toggle, toggleValue, onToggle, disabled }) {
  const isToggle = !!toggle;
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={isToggle ? undefined : onPress}
      activeOpacity={isToggle || disabled ? 1 : 0.72}
      disabled={disabled}
    >
      <View style={styles.rowLeft}>
        <View style={[styles.iconWrap, labelBlue && styles.iconWrapBlue]}>{icon}</View>
        <Text style={[styles.rowLabel, labelBlue && styles.rowLabelBlue]}>{label}</Text>
      </View>
      <View style={styles.rowRight}>
        {accessory ? (
          <Text style={[styles.rowAccessory, accessoryBlue && styles.rowAccessoryBlue]}>
            {accessory}
          </Text>
        ) : null}
        {isToggle ? (
          <Switch
            value={toggleValue}
            onValueChange={onToggle}
            trackColor={{ false: '#e2e8f0', true: `${COLORS.primary}66` }}
            thumbColor={toggleValue ? COLORS.primary : '#fff'}
          />
        ) : !disabled ? (
          <ChevronRight
            size={16}
            color={accessoryBlue ? COLORS.primary : '#cbd5e1'}
            strokeWidth={2}
          />
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

// ─── Kakao Consent Modal ──────────────────────────────────────────────────────

function KakaoConsentModal({ visible, onClose, onConfirm, navigation }) {
  const [termsAgreed,     setTermsAgreed]     = useState(false);
  const [privacyAgreed,   setPrivacyAgreed]   = useState(false);
  const [marketingAgreed, setMarketingAgreed] = useState(false);
  const isAllSelected = termsAgreed && privacyAgreed && marketingAgreed;
  const toggleAll = () => {
    const v = !isAllSelected;
    setTermsAgreed(v); setPrivacyAgreed(v); setMarketingAgreed(v);
  };
  const canConfirm = termsAgreed && privacyAgreed;

  const handleClose = () => {
    setTermsAgreed(false); setPrivacyAgreed(false); setMarketingAgreed(false);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TouchableOpacity style={consent.backdrop} activeOpacity={1} onPress={handleClose} />
        <View style={consent.sheet}>
          <View style={consent.handle} />

          {/* Header */}
          <Text style={consent.title}>카카오 계정 연동을{"\n"}위해 약관에 동의해 주세요</Text>
          <Text style={consent.subtitle}>데이터를 안전하게 보관하고 기기 분실 시 복구할 수 있어요.</Text>

          {/* Select All */}
          <TouchableOpacity onPress={toggleAll} style={consent.selectAllRow}>
            <View style={[consent.circleL, isAllSelected && consent.circleActive]}>
              {isAllSelected && <Text style={consent.checkMark}>✓</Text>}
            </View>
            <Text style={consent.selectAllText}>약관 전체 동의하기</Text>
          </TouchableOpacity>
          <View style={consent.divider} />

          {/* Terms */}
          <View style={consent.itemWrap}>
            <TouchableOpacity onPress={() => setTermsAgreed(!termsAgreed)} style={consent.itemRow}>
              <View style={[consent.circleS, termsAgreed && consent.circleActive]}>
                {termsAgreed && <Text style={consent.checkMarkS}>✓</Text>}
              </View>
              <Text style={consent.itemText}>(필수) 서비스 이용약관 동의</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.navigate('TermsDetail', { title: '서비스 이용약관', type: 'terms' })}>
              <Text style={consent.viewLink}>보기 {'>'}</Text>
            </TouchableOpacity>
          </View>

          {/* Privacy */}
          <View style={consent.itemWrap}>
            <TouchableOpacity onPress={() => setPrivacyAgreed(!privacyAgreed)} style={consent.itemRow}>
              <View style={[consent.circleS, privacyAgreed && consent.circleActive]}>
                {privacyAgreed && <Text style={consent.checkMarkS}>✓</Text>}
              </View>
              <Text style={consent.itemText}>(필수) 개인정보 수집 및 이용 동의</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.navigate('TermsDetail', { title: '개인정보 처리방침', type: 'privacy' })}>
              <Text style={consent.viewLink}>보기 {'>'}</Text>
            </TouchableOpacity>
          </View>
          <Text style={consent.itemHint}>초개인화 큐레이션을 위한 연령 및 양육 환경 수집</Text>

          {/* Marketing */}
          <View style={[consent.itemWrap, { marginBottom: 32 }]}>
            <TouchableOpacity onPress={() => setMarketingAgreed(!marketingAgreed)} style={consent.itemRow}>
              <View style={[consent.circleS, marketingAgreed && consent.circleActive]}>
                {marketingAgreed && <Text style={consent.checkMarkS}>✓</Text>}
              </View>
              <Text style={consent.itemText}>(선택) 혜택 및 특가 알림 수신 동의</Text>
            </TouchableOpacity>
          </View>
          <Text style={[consent.itemHint, { marginTop: -24, marginBottom: 28 }]}>관심 상품 최저가 도달 및 맞춤 혜택 PUSH 알림</Text>

          {/* CTA */}
          <TouchableOpacity
            disabled={!canConfirm}
            onPress={() => onConfirm(marketingAgreed)}
            style={[consent.cta, !canConfirm && consent.ctaDisabled]}
          >
            <Text style={[consent.ctaText, !canConfirm && consent.ctaTextDisabled]}>
              동의하고 카카오로 시작하기
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const consent = StyleSheet.create({
  backdrop:       { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet:          { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 24, paddingBottom: 36, paddingTop: 16 },
  handle:         { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', marginBottom: 24 },
  title:          { fontSize: 22, fontWeight: 'bold', color: '#111827', lineHeight: 30, marginBottom: 8 },
  subtitle:       { fontSize: 14, color: '#6B7280', lineHeight: 20, marginBottom: 28 },
  selectAllRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  circleL:        { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: '#D1D5DB', backgroundColor: 'transparent', marginRight: 12, justifyContent: 'center', alignItems: 'center' },
  circleS:        { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#D1D5DB', backgroundColor: 'transparent', marginRight: 12, justifyContent: 'center', alignItems: 'center' },
  circleActive:   { borderColor: '#2E6FF2', backgroundColor: '#2E6FF2' },
  checkMark:      { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  checkMarkS:     { color: '#fff', fontWeight: 'bold', fontSize: 11 },
  selectAllText:  { fontSize: 17, fontWeight: 'bold', color: '#111827' },
  divider:        { height: 1, backgroundColor: '#F3F4F6', marginBottom: 20 },
  itemWrap:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  itemRow:        { flexDirection: 'row', alignItems: 'center', flex: 1 },
  itemText:       { fontSize: 15, color: '#374151', flex: 1 },
  itemHint:       { fontSize: 12, color: '#9CA3AF', marginLeft: 34, marginBottom: 16 },
  viewLink:       { fontSize: 13, color: '#9CA3AF' },
  cta:            { backgroundColor: '#2E6FF2', padding: 18, borderRadius: 16, alignItems: 'center' },
  ctaDisabled:    { backgroundColor: '#F3F4F6' },
  ctaText:        { color: '#fff', fontSize: 17, fontWeight: 'bold' },
  ctaTextDisabled:{ color: '#9CA3AF' },
});

// ─── Permission Modal ─────────────────────────────────────────────────────────

function PermissionModal({ visible, onClose }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={permModal.overlay}>
        <View style={permModal.card}>
          <Text style={permModal.title}>기기 알림이 꺼져있어요</Text>
          <Text style={permModal.body}>
            {'중요한 핫딜을 놓치지 않으려면,\n[기기 설정 > 애플리케이션 > 세이브루 > 알림] 탭에서 알림을 허용해주세요.'}
          </Text>
          <View style={permModal.btnRow}>
            <TouchableOpacity style={permModal.cancelBtn} onPress={onClose} activeOpacity={0.75}>
              <Text style={permModal.cancelText}>취소</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={permModal.confirmBtn}
              onPress={() => { onClose(); Linking.openSettings(); }}
              activeOpacity={0.85}
            >
              <Text style={permModal.confirmText}>설정으로 이동</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Version Modal ───────────────────────────────────────────────────────────

function VersionModal({ visible, onClose }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={permModal.overlay}>
        <View style={permModal.card}>
          <Text style={permModal.title}>버전 정보</Text>
          <Text style={permModal.body}>현재 버전: v1.0.0{'\n'}(최신 버전입니다)</Text>
          <TouchableOpacity style={permModal.confirmBtn} onPress={onClose} activeOpacity={0.85}>
            <Text style={permModal.confirmText}>확인</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Danger Row ───────────────────────────────────────────────────────────────

function DangerRow({ icon, label, onPress }) {
  return (
    <TouchableOpacity style={styles.dangerRow} onPress={onPress} activeOpacity={0.72}>
      <View style={styles.dangerRowLeft}>
        <View style={styles.dangerIconWrap}>{icon}</View>
        <Text style={styles.dangerLabel}>{label}</Text>
      </View>
      <ChevronRight size={16} color="#fca5a5" strokeWidth={2} />
    </TouchableOpacity>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function SettingsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { priceAlerts: priceAlertToggle,    setPriceAlerts:    setPriceAlertToggle,
          activityAlerts: activityAlertToggle, setActivityAlerts: setActivityAlertToggle,
        } = useNotification();
  const [kakaoLinked,           setKakaoLinked]           = useState(false);
  const [isLoggingIn,           setIsLoggingIn]           = useState(false);
  const [permModalVisible,      setPermModalVisible]      = useState(false);
  const [versionModalVisible,   setVersionModalVisible]   = useState(false);
  const [consentModalVisible,   setConsentModalVisible]   = useState(false);

  const handleKakaoLink = () => {
    if (kakaoLinked || isLoggingIn) return;
    setConsentModalVisible(true);
  };

  const handleConsentConfirmed = async (marketingAgreed) => {
    setConsentModalVisible(false);
    setIsLoggingIn(true);
    try {
      await loginWithKakao();
      setKakaoLinked(true);
    } catch (e) {
      console.error('[Kakao] login failed', e);
      Alert.alert('카카오 연동 실패', '잠시 후 다시 시도해 주세요.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleWithdraw = () => navigation.navigate('Withdraw');

  const handlePriceToggle = async (val) => {
    const ok = await setPriceAlertToggle(val);
    if (ok === false) setPermModalVisible(true);
  };
  const handleActivityToggle = async (val) => {
    const ok = await setActivityAlertToggle(val);
    if (ok === false) setPermModalVisible(true);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>

      {/* ── Top bar — Typography Token 9.3 (18px Bold Center) ── */}
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.backBtn}
        >
          <ChevronLeft size={24} color="#0f172a" strokeWidth={2.2} />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>설정</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
      >

        {/* ── Kakao Link Banner ── */}
        {!kakaoLinked && (
          <TouchableOpacity
            style={styles.kakaoBanner}
            onPress={handleKakaoLink}
            activeOpacity={0.85}
          >
            <View style={styles.kakaoBannerLeft}>
              <Text style={styles.kakaoBannerEmoji}>🔐</Text>
              <View>
                <Text style={styles.kakaoBannerTitle}>카카오 계정 연동하기</Text>
                <Text style={styles.kakaoBannerSub}>데이터를 안전하게 보관하고 기기 분실 시 복구하세요</Text>
              </View>
            </View>
            {isLoggingIn
              ? <ActivityIndicator size="small" color="#fff" />
              : <ChevronRight size={18} color="#fff" strokeWidth={2.5} />}
          </TouchableOpacity>
        )}

        {/* ── 알림 설정 ── */}
        <SectionHeader title="알림 설정" />
        <SettingsRow
          icon={<Bell size={17} color={COLORS.primary} strokeWidth={1.9} />}
          label="가격 알림"
          toggle
          toggleValue={priceAlertToggle}
          onToggle={handlePriceToggle}
        />
        <Divider />
        <SettingsRow
          icon={<Zap size={17} color={COLORS.primary} strokeWidth={1.9} />}
          label="활동 알림"
          toggle
          toggleValue={activityAlertToggle}
          onToggle={handleActivityToggle}
        />
        <Divider />
        <SettingsRow
          icon={<Bell size={17} color={COLORS.primary} strokeWidth={1.9} />}
          label="알림 상세 설정"
          onPress={() => navigation.navigate('NotificationSettings')}
        />

        {/* ── 정보 ── */}
        <SectionHeader title="정보" />
        <SettingsRow
          icon={<MessageSquare size={17} color={COLORS.primary} strokeWidth={1.9} />}
          label="공지사항"
          labelBlue
          onPress={() => navigation.navigate('Notice')}
        />
        <Divider />
        <SettingsRow
          icon={<HelpCircle size={17} color={COLORS.primary} strokeWidth={1.9} />}
          label="1:1 문의"
          labelBlue
          onPress={() => navigation.navigate('Inquiry')}
        />
        <Divider />
        <SettingsRow
          icon={<FileText size={17} color="#64748b" strokeWidth={1.9} />}
          label="서비스 이용약관"
          onPress={() => navigation.navigate('TermsDetail', { title: '이용약관', type: 'terms' })}
        />
        <Divider />
        <SettingsRow
          icon={<ShieldCheck size={17} color="#64748b" strokeWidth={1.9} />}
          label="개인정보 처리방침"
          onPress={() => navigation.navigate('TermsDetail', { title: '개인정보 처리방침', type: 'privacy' })}
        />
        <Divider />
        <SettingsRow
          icon={<Info size={17} color="#64748b" strokeWidth={1.9} />}
          label="버전 정보"
          accessory="v1.0.0"
          onPress={() => setVersionModalVisible(true)}
        />

        {/* ── 위험 구역 — Section 4, 6.7 ── */}
        <SectionHeader title="위험 구역" />
        <View style={styles.dangerSection}>
          <DangerRow
            icon={<UserX size={17} color="#dc2626" strokeWidth={1.9} />}
            label="계정 탈퇴"
            onPress={handleWithdraw}
          />
        </View>

      </ScrollView>

      <PermissionModal visible={permModalVisible} onClose={() => setPermModalVisible(false)} />
      <VersionModal visible={versionModalVisible} onClose={() => setVersionModalVisible(false)} />
      <KakaoConsentModal
        visible={consentModalVisible}
        onClose={() => setConsentModalVisible(false)}
        onConfirm={handleConsentConfirmed}
        navigation={navigation}
      />
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },

  // ── Top bar — Typography Token 9.3 ──
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  backBtn:     { width: 40, alignItems: 'center', justifyContent: 'center' },
  topBarTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a', textAlign: 'center' },

  // ── Section header — Caption Token ──
  sectionHeader: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 8 },
  sectionTitle:  { fontSize: 11, fontWeight: '700', color: '#94a3b8', letterSpacing: 0.8, textTransform: 'uppercase' },

  // ── Standard row ──
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', paddingHorizontal: 20, paddingVertical: 15,
  },
  rowLeft:           { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
  iconWrap:          { width: 32, height: 32, borderRadius: 8, backgroundColor: '#eff6ff', alignItems: 'center', justifyContent: 'center' },
  iconWrapBlue:      { backgroundColor: '#dbeafe' },
  rowLabel:          { fontSize: 15, fontWeight: '500', color: '#0f172a' },
  rowLabelBlue:      { color: COLORS.primary, fontWeight: '700' },
  rowRight:          { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowAccessory:      { fontSize: 13, fontWeight: '500', color: '#94a3b8' },
  rowAccessoryBlue:  { color: COLORS.primary, fontWeight: '700' },

  divider: { height: 1, backgroundColor: '#f1f5f9', marginLeft: 66 },

  // ── Kakao Banner ──
  kakaoBanner: {
    marginHorizontal: 16, marginTop: 20, marginBottom: 4,
    backgroundColor: '#2E6FF2', borderRadius: 16, padding: 18,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    ...Platform.select({
      ios:     { shadowColor: '#2E6FF2', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 12 },
      android: { elevation: 6 },
    }),
  },
  kakaoBannerLeft:  { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
  kakaoBannerEmoji: { fontSize: 28 },
  kakaoBannerTitle: { fontSize: 15, fontWeight: '800', color: '#fff', marginBottom: 2 },
  kakaoBannerSub:   { fontSize: 12, color: 'rgba(255,255,255,0.8)', lineHeight: 17 },

  // ── Danger section — Section 4, 6.7 ──
  dangerSection: {
    marginHorizontal: 16, marginTop: 4,
    borderRadius: 14, overflow: 'hidden',
    borderWidth: 1, borderColor: '#fee2e2',
    backgroundColor: '#FEF2F2',
  },
  dangerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 15,
  },
  dangerRowLeft:  { flexDirection: 'row', alignItems: 'center', gap: 14 },
  dangerIconWrap: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#fee2e2', alignItems: 'center', justifyContent: 'center' },
  dangerLabel:    { fontSize: 15, fontWeight: '600', color: '#DC2626' },
  dangerDivider:  { height: 1, backgroundColor: '#fee2e2', marginLeft: 62 },
});

const permModal = StyleSheet.create({
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
  confirmBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: '#2E6FF2', alignItems: 'center' },
  confirmText:{ fontSize: 15, fontWeight: '800', color: '#fff' },
});
