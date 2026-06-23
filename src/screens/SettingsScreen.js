import React, { useEffect, useState } from 'react';
import { useUser } from '../context/UserContext';
import {
  ActivityIndicator, Alert, Linking, Modal, Platform,
  ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Bell, ChevronLeft, ChevronRight, FileText, Gift,
  HelpCircle, Info, MessageCircle, MessageSquare,
  ShieldCheck, UserX, Zap,
} from 'lucide-react-native';
import { COLORS } from '../constants/theme';
import { loginWithKakao } from '../services/authService';
import { useNotification } from '../context/NotificationContext';
import KakaoConsentModal from '../components/KakaoConsentModal';
import * as Notifications from 'expo-notifications';

// ─── Section Header (Caption Token — uppercase label) ────────────────────────

function SectionHeader({ title }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

// ─── Standard Row ─────────────────────────────────────────────────────────────

function SettingsRow({ icon, label, subLabel, accessory, accessoryBlue, labelBlue, onPress, toggle, toggleValue, onToggle, disabled }) {
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
        <View style={{ flex: 1 }}>
          <Text style={[styles.rowLabel, labelBlue && styles.rowLabelBlue]}>{label}</Text>
          {subLabel ? <Text style={styles.rowSubLabel}>{subLabel}</Text> : null}
        </View>
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
          <Text style={permModal.body}>{'현재 버전: v1.0.0\n(최신 버전입니다)\n\n개발/운영: SAVEROO Team'}</Text>
          <TouchableOpacity style={permModal.soloBtn} onPress={onClose} activeOpacity={0.85}>
            <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16, textAlign: 'center' }}>확인</Text>
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
  const { isWowMember, setIsWowMember } = useUser();
  const [marketingAlerts,       setMarketingAlertsRaw]    = useState(false);
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

  // MD Spec 14.2 — sync all toggle UI state with actual OS permission on mount
  useEffect(() => {
    Notifications.getPermissionsAsync().then(({ status }) => {
      if (status !== 'granted') {
        setPriceAlertToggle(false);
        setActivityAlertToggle(false);
        setMarketingAlertsRaw(false);
      }
    });
  }, []);

  const handleMarketingToggle = async (val) => {
    if (!val) { setMarketingAlertsRaw(false); return; }
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') { setPermModalVisible(true); return; }
    setMarketingAlertsRaw(true);
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
            <MessageCircle size={22} color="#191919" strokeWidth={0} fill="#191919" style={{ marginRight: 10 }} />
            <Text style={styles.kakaoBannerTitle}>카카오 연동하기</Text>
            {isLoggingIn
              ? <ActivityIndicator size="small" color="#191919" style={{ marginLeft: 'auto' }} />
              : <ChevronRight size={16} color="#191919" style={{ marginLeft: 'auto', opacity: 0.6 }} />}
          </TouchableOpacity>
        )}

        {/* ── 회원정보 ── */}
        <SectionHeader title="회원정보" />
        <SettingsRow
          icon={<Zap size={17} color={COLORS.primary} strokeWidth={1.9} />}
          label="쿠팡 와우 회원"
          subLabel="와우 회원가로 가격을 표시합니다"
          toggle
          toggleValue={isWowMember}
          onToggle={setIsWowMember}
        />

        {/* ── 알림 설정 (1-depth flat) ── */}
        <SectionHeader title="알림 설정" />
        <SettingsRow
          icon={<Bell size={17} color={COLORS.primary} strokeWidth={1.9} />}
          label="가격·재입고 알림"
          subLabel="관심상품 최저가 도달 시"
          toggle
          toggleValue={priceAlertToggle}
          onToggle={handlePriceToggle}
        />
        <Divider />
        <SettingsRow
          icon={<MessageCircle size={17} color={COLORS.primary} strokeWidth={1.9} />}
          label="커뮤니티·활동 알림"
          subLabel="내 글의 댓글 및 반응"
          toggle
          toggleValue={activityAlertToggle}
          onToggle={handleActivityToggle}
        />
        <Divider />
        <SettingsRow
          icon={<Gift size={17} color={COLORS.primary} strokeWidth={1.9} />}
          label="혜택·이벤트 알림"
          subLabel="마케팅 정보 수신 동의"
          toggle
          toggleValue={marketingAlerts}
          onToggle={handleMarketingToggle}
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
          label="1:1 문의 및 버그 신고"
          labelBlue
          onPress={() => navigation.navigate('Inquiry')}
        />
        <Divider />
        <SettingsRow
          icon={<FileText size={17} color={COLORS.primary} strokeWidth={1.9} />}
          label="서비스 이용약관"
          onPress={() => navigation.navigate('TermsDetail', { title: '이용약관', type: 'terms' })}
        />
        <Divider />
        <SettingsRow
          icon={<ShieldCheck size={17} color={COLORS.primary} strokeWidth={1.9} />}
          label="개인정보 처리방침"
          onPress={() => navigation.navigate('TermsDetail', { title: '개인정보 처리방침', type: 'privacy' })}
        />
        <Divider />
        <SettingsRow
          icon={<Info size={17} color={COLORS.primary} strokeWidth={1.9} />}
          label="버전 정보"
          accessory="v1.0.0"
          onPress={() => setVersionModalVisible(true)}
        />

        {/* ── 위험 구역 — Section 4, 6.7 ── */}
        <SectionHeader title="위험 구역" />
        <View style={styles.dangerSection}>
          <DangerRow
            icon={<UserX size={17} color="#EF4444" strokeWidth={1.9} />}
            label={kakaoLinked ? '계정 탈퇴' : '앱 데이터 초기화'}
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
  rowSubLabel:       { fontSize: 12, color: '#94a3b8', marginTop: 2 },

  divider: { height: 1, backgroundColor: '#f1f5f9', marginLeft: 66 },

  // ── Kakao Banner (Official Kakao spec: #FEE500 / #191919, h:48, r:12) ──
  kakaoBanner: {
    marginHorizontal: 16, marginTop: 20, marginBottom: 4,
    backgroundColor: '#FEE500', borderRadius: 12,
    height: 48,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 6 },
      android: { elevation: 3 },
    }),
  },
  kakaoBannerTitle: { fontSize: 15, fontWeight: 'bold', color: '#191919' },

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
  dangerLabel:    { fontSize: 15, fontWeight: '600', color: '#EF4444' },
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
  soloBtn:    { paddingVertical: 14, borderRadius: 12, backgroundColor: '#2E6FF2', alignItems: 'center', alignSelf: 'stretch' },
});
