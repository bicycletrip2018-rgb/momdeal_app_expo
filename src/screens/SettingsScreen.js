import React, { useState } from 'react';
import {
  Alert, ScrollView, StyleSheet,
  Switch, Text, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Bell, ChevronLeft, ChevronRight, FileText,
  HelpCircle, Info, LogOut, MessageSquare,
  ShieldCheck, TriangleAlert, UserX, Zap,
} from 'lucide-react-native';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase/config';
import { COLORS } from '../constants/theme';

// ─── Section Header (Caption Token — uppercase label) ────────────────────────

function SectionHeader({ title }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

// ─── Standard Row ─────────────────────────────────────────────────────────────

function SettingsRow({ icon, label, accessory, accessoryBlue, onPress, toggle, toggleValue, onToggle }) {
  const isToggle = !!toggle;
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={isToggle ? undefined : onPress}
      activeOpacity={isToggle ? 1 : 0.72}
    >
      <View style={styles.rowLeft}>
        <View style={styles.iconWrap}>{icon}</View>
        <Text style={styles.rowLabel}>{label}</Text>
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
        ) : (
          <ChevronRight
            size={16}
            color={accessoryBlue ? COLORS.primary : '#cbd5e1'}
            strokeWidth={2}
          />
        )}
      </View>
    </TouchableOpacity>
  );
}

function Divider() {
  return <View style={styles.divider} />;
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
  const [priceAlertToggle,    setPriceAlertToggle]    = useState(true);
  const [activityAlertToggle, setActivityAlertToggle] = useState(false);
  const [kakaoLinked]                                 = useState(false);

  const handleLogout = () =>
    Alert.alert('로그아웃', '정말 로그아웃 하시겠어요?', [
      { text: '취소', style: 'cancel' },
      { text: '로그아웃', style: 'destructive', onPress: () => signOut(auth).catch(() => {}) },
    ]);

  const handleWithdraw = () =>
    Alert.alert('계정 탈퇴', '계정을 탈퇴하면 모든 데이터가 삭제됩니다. 진행하시겠어요?', [
      { text: '취소', style: 'cancel' },
      { text: '탈퇴하기', style: 'destructive', onPress: () => Alert.alert('안내', '탈퇴 절차를 진행합니다.') },
    ]);

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

        {/* ── 계정 설정 ── */}
        <SectionHeader title="계정 설정" />
        <SettingsRow
          icon={<Zap size={17} color={COLORS.primary} strokeWidth={1.9} />}
          label="카카오 계정 연동"
          accessory={kakaoLinked ? '연동됨' : '연동 필요'}
          accessoryBlue={!kakaoLinked}
          onPress={() => Alert.alert('카카오 연동', '준비 중인 기능입니다.')}
        />

        {/* ── 알림 설정 ── */}
        <SectionHeader title="알림 설정" />
        <SettingsRow
          icon={<Bell size={17} color={COLORS.primary} strokeWidth={1.9} />}
          label="가격 알림"
          toggle
          toggleValue={priceAlertToggle}
          onToggle={setPriceAlertToggle}
        />
        <Divider />
        <SettingsRow
          icon={<Zap size={17} color={COLORS.primary} strokeWidth={1.9} />}
          label="활동 알림"
          toggle
          toggleValue={activityAlertToggle}
          onToggle={setActivityAlertToggle}
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
          icon={<Info size={17} color={COLORS.primary} strokeWidth={1.9} />}
          label="버전 정보"
          accessory="v1.0.0"
          onPress={() => Alert.alert('버전 정보', '현재 버전: 1.0.0 (최신)')}
        />
        <Divider />
        <SettingsRow
          icon={<FileText size={17} color={COLORS.primary} strokeWidth={1.9} />}
          label="이용약관"
          onPress={() => Alert.alert('이용약관', '준비 중인 기능입니다.')}
        />
        <Divider />
        <SettingsRow
          icon={<ShieldCheck size={17} color={COLORS.primary} strokeWidth={1.9} />}
          label="개인정보 처리방침"
          onPress={() => Alert.alert('개인정보 처리방침', '준비 중인 기능입니다.')}
        />
        <Divider />
        <SettingsRow
          icon={<HelpCircle size={17} color={COLORS.primary} strokeWidth={1.9} />}
          label="1:1 문의"
          onPress={() => Alert.alert('1:1 문의', '준비 중인 기능입니다.')}
        />
        <Divider />
        <SettingsRow
          icon={<MessageSquare size={17} color={COLORS.primary} strokeWidth={1.9} />}
          label="공지사항"
          onPress={() => Alert.alert('공지사항', '준비 중인 기능입니다.')}
        />

        {/* ── 위험 구역 — Section 4, 6.7 ── */}
        <SectionHeader title="위험 구역" />
        <View style={styles.dangerSection}>
          <DangerRow
            icon={<LogOut size={17} color="#dc2626" strokeWidth={1.9} />}
            label="로그아웃"
            onPress={handleLogout}
          />
          <View style={styles.dangerDivider} />
          <DangerRow
            icon={<UserX size={17} color="#dc2626" strokeWidth={1.9} />}
            label="계정 탈퇴"
            onPress={handleWithdraw}
          />
        </View>

      </ScrollView>
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
  rowLabel:          { fontSize: 15, fontWeight: '500', color: '#0f172a' },
  rowRight:          { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowAccessory:      { fontSize: 13, fontWeight: '500', color: '#94a3b8' },
  rowAccessoryBlue:  { color: COLORS.primary, fontWeight: '700' },

  divider: { height: 1, backgroundColor: '#f1f5f9', marginLeft: 66 },

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
