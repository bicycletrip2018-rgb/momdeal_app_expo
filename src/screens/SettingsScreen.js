import React, { useState } from 'react';
import {
  Alert, Platform, ScrollView, StyleSheet,
  Switch, Text, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Bell, ChevronLeft, ChevronRight, Database, Eye,
  HelpCircle, Info, Link, LogOut, Megaphone,
  MessageSquare, Trash2, TriangleAlert, User,
} from 'lucide-react-native';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase/config';
import { COLORS } from '../constants/theme';

// ─── Components ───────────────────────────────────────────────────────────────

function SectionHeader({ title }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

function SettingsRow({ icon, label, accessory, onPress, danger = false, toggle, toggleValue, onToggle }) {
  const isToggle = !!toggle;
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={isToggle ? undefined : onPress}
      activeOpacity={isToggle ? 1 : 0.7}
    >
      <View style={styles.rowLeft}>
        <View style={[styles.iconWrap, danger && styles.iconWrapDanger]}>{icon}</View>
        <Text style={[styles.rowLabel, danger && styles.rowLabelDanger]}>{label}</Text>
      </View>
      <View style={styles.rowRight}>
        {accessory ? <Text style={styles.rowAccessory}>{accessory}</Text> : null}
        {isToggle ? (
          <Switch
            value={toggleValue}
            onValueChange={onToggle}
            trackColor={{ false: '#e2e8f0', true: `${COLORS.primary}55` }}
            thumbColor={toggleValue ? COLORS.primary : '#fff'}
          />
        ) : (
          <ChevronRight size={16} color="#cbd5e1" strokeWidth={2} />
        )}
      </View>
    </TouchableOpacity>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

function DangerRow({ icon, label, onPress }) {
  return (
    <TouchableOpacity style={styles.dangerRow} onPress={onPress} activeOpacity={0.7}>
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
  const [colorBlindMode, setColorBlindMode] = useState(false);

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

  const handleClearCache = () =>
    Alert.alert('캐시 삭제', '앱 캐시를 삭제하시겠어요?', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', onPress: () => Alert.alert('완료', '캐시가 삭제되었습니다.') },
    ]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.backBtn}
        >
          <ChevronLeft size={24} color="#0f172a" strokeWidth={2.2} />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>설정</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>

        {/* 계정 */}
        <SectionHeader title="계정" />
        <SettingsRow
          icon={<Link size={17} color={COLORS.primary} strokeWidth={1.9} />}
          label="카카오/구글 계정 연동"
          accessory="구글 연동됨"
          onPress={() => Alert.alert('계정 연동', '준비 중인 기능입니다.')}
        />
        <Divider />
        <SettingsRow
          icon={<Database size={17} color={COLORS.primary} strokeWidth={1.9} />}
          label="데이터 이전하기"
          onPress={() => Alert.alert('데이터 이전', '준비 중인 기능입니다.')}
        />

        {/* 서비스 설정 */}
        <SectionHeader title="서비스 설정" />
        <SettingsRow
          icon={<Bell size={17} color={COLORS.primary} strokeWidth={1.9} />}
          label="알림 설정"
          onPress={() => navigation.navigate('NotificationSettings')}
        />
        <Divider />
        <SettingsRow
          icon={<Eye size={17} color={COLORS.primary} strokeWidth={1.9} />}
          label="색약 사용자 모드"
          toggle
          toggleValue={colorBlindMode}
          onToggle={setColorBlindMode}
        />

        {/* 앱 관리 */}
        <SectionHeader title="앱 관리" />
        <SettingsRow
          icon={<Trash2 size={17} color={COLORS.primary} strokeWidth={1.9} />}
          label="앱 캐시 삭제"
          onPress={handleClearCache}
        />

        {/* 고객센터 */}
        <SectionHeader title="고객센터" />
        <SettingsRow
          icon={<HelpCircle size={17} color={COLORS.primary} strokeWidth={1.9} />}
          label="불편한 점 접수"
          onPress={() => Alert.alert('불편 접수', '이메일 또는 앱 스토어 리뷰로 접수해 주세요.')}
        />
        <Divider />
        <SettingsRow
          icon={<Megaphone size={17} color={COLORS.primary} strokeWidth={1.9} />}
          label="공지사항"
          onPress={() => Alert.alert('공지사항', '준비 중인 기능입니다.')}
        />
        <Divider />
        <SettingsRow
          icon={<MessageSquare size={17} color={COLORS.primary} strokeWidth={1.9} />}
          label="1:1 문의"
          onPress={() => Alert.alert('1:1 문의', '준비 중인 기능입니다.')}
        />
        <Divider />
        <SettingsRow
          icon={<Info size={17} color={COLORS.primary} strokeWidth={1.9} />}
          label="약관 및 버전 정보"
          accessory="v1.0.0 (최신)"
          onPress={() => Alert.alert('버전 정보', '현재 버전: 1.0.0')}
        />

        {/* 위험 구역 */}
        <SectionHeader title="위험 구역" />
        <View style={styles.dangerSection}>
          <DangerRow
            icon={<LogOut size={17} color="#dc2626" strokeWidth={1.9} />}
            label="로그아웃"
            onPress={handleLogout}
          />
          <View style={styles.dangerDivider} />
          <DangerRow
            icon={<TriangleAlert size={17} color="#dc2626" strokeWidth={1.9} />}
            label="계정 탈퇴"
            onPress={handleWithdraw}
          />
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  backBtn:     { width: 40, alignItems: 'center', justifyContent: 'center' },
  topBarTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a' },

  sectionHeader: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 8 },
  sectionTitle:  { fontSize: 11, fontWeight: '700', color: '#94a3b8', letterSpacing: 0.8, textTransform: 'uppercase' },

  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', paddingHorizontal: 20, paddingVertical: 15,
  },
  rowLeft:    { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
  iconWrap:   { width: 32, height: 32, borderRadius: 8, backgroundColor: '#eff6ff', alignItems: 'center', justifyContent: 'center' },
  rowLabel:   { fontSize: 15, fontWeight: '500', color: '#0f172a' },
  rowRight:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowAccessory: { fontSize: 13, fontWeight: '500', color: '#94a3b8' },

  divider: { height: 1, backgroundColor: '#f1f5f9', marginLeft: 66 },

  // ── Danger section ──
  dangerSection: {
    marginHorizontal: 16, marginTop: 4,
    borderRadius: 14, overflow: 'hidden',
    borderWidth: 1, borderColor: '#fee2e2',
    backgroundColor: '#fff5f5',
  },
  dangerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 15,
  },
  dangerRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  dangerIconWrap: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: '#fef2f2', alignItems: 'center', justifyContent: 'center',
  },
  dangerLabel: { fontSize: 15, fontWeight: '600', color: '#dc2626' },
  dangerDivider: { height: 1, backgroundColor: '#fee2e2', marginLeft: 62 },
});
