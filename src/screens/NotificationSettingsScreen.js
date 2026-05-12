import React, { useEffect, useRef, useState } from 'react';
import {
  AppState, Linking, Modal, Platform, ScrollView,
  StyleSheet, Switch, Text, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import { COLORS } from '../constants/theme';
import { useNotification } from '../context/NotificationContext';

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

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function NotificationSettingsScreen() {
  const insets = useSafeAreaInsets();

  const {
    priceAlerts,    setPriceAlerts,
    activityAlerts, setActivityAlerts,
  } = useNotification();

  const [marketing,        setMarketing]        = useState(false);
  const [benefits,         setBenefits]         = useState(true);
  const [quietHours,       setQuietHours]       = useState(false);
  const [permModalVisible, setPermModalVisible] = useState(false);

  const appState = useRef(AppState.currentState);

  useEffect(() => {
    const syncOsPermission = async () => {
      const { status } = await Notifications.getPermissionsAsync();
      if (status === 'denied') {
        setPriceAlerts(false);
        setActivityAlerts(false);
        setBenefits(false);
      }
    };

    syncOsPermission();

    const sub = AppState.addEventListener('change', (next) => {
      if (appState.current.match(/inactive|background/) && next === 'active') {
        syncOsPermission();
      }
      appState.current = next;
    });

    return () => sub.remove();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleMarketingToggle = (val) => {
    setMarketing(val);
    if (!val) {
      setPriceAlerts(false);
      setActivityAlerts(false);
      setBenefits(false);
    }
  };

  const handlePriceToggle = async (val) => {
    if (!marketing) return;
    const ok = await setPriceAlerts(val);
    if (ok === false) setPermModalVisible(true);
  };
  const handleActivityToggle = async (val) => {
    if (!marketing) return;
    const ok = await setActivityAlerts(val);
    if (ok === false) setPermModalVisible(true);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
      showsVerticalScrollIndicator={false}
    >
      {/* ── 마케팅 정보 수신 동의 (master) ── */}
      <View style={styles.sectionCard}>
        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.rowLabel}>마케팅 정보 수신 동의</Text>
            <Text style={styles.rowSub}>혜택·이벤트·가격 알림 전체 수신</Text>
          </View>
          <Switch
            value={marketing}
            onValueChange={handleMarketingToggle}
            trackColor={{ false: '#e2e8f0', true: `${COLORS.primary}55` }}
            thumbColor={marketing ? COLORS.primary : '#fff'}
          />
        </View>
      </View>

      {/* ── 개별 알림 설정 ── */}
      <View style={styles.sectionLabel}>
        <Text style={styles.sectionLabelText}>개별 알림 설정</Text>
      </View>

      <View style={styles.sectionCard}>
        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={[styles.rowLabel, !marketing && styles.rowLabelDisabled]}>가격·재입고 알림</Text>
            <Text style={styles.rowSub}>관심상품 최저가 도달 및 재입고</Text>
          </View>
          <Switch
            value={priceAlerts && marketing}
            onValueChange={handlePriceToggle}
            disabled={!marketing}
            trackColor={{ false: '#e2e8f0', true: `${COLORS.primary}55` }}
            thumbColor={(priceAlerts && marketing) ? COLORS.primary : '#fff'}
          />
        </View>

        <View style={styles.divider} />

        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={[styles.rowLabel, !marketing && styles.rowLabelDisabled]}>맘톡·활동 알림</Text>
            <Text style={styles.rowSub}>내 글의 댓글 및 반응</Text>
          </View>
          <Switch
            value={activityAlerts && marketing}
            onValueChange={handleActivityToggle}
            disabled={!marketing}
            trackColor={{ false: '#e2e8f0', true: `${COLORS.primary}55` }}
            thumbColor={(activityAlerts && marketing) ? COLORS.primary : '#fff'}
          />
        </View>

        <View style={styles.divider} />

        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={[styles.rowLabel, !marketing && styles.rowLabelDisabled]}>혜택·이벤트 알림</Text>
            <Text style={styles.rowSub}>쿠폰 및 체험단 당첨</Text>
          </View>
          <Switch
            value={benefits && marketing}
            onValueChange={(val) => { if (marketing) setBenefits(val); }}
            disabled={!marketing}
            trackColor={{ false: '#e2e8f0', true: `${COLORS.primary}55` }}
            thumbColor={(benefits && marketing) ? COLORS.primary : '#fff'}
          />
        </View>
      </View>

      {/* ── 야간 알림 제한 ── */}
      <View style={styles.sectionLabel}>
        <Text style={styles.sectionLabelText}>방해금지 설정</Text>
      </View>

      <View style={styles.sectionCard}>
        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.rowLabel}>야간 알림 제한</Text>
            <Text style={styles.rowSub}>21:00 ~ 08:00 방해금지 모드</Text>
          </View>
          <Switch
            value={quietHours}
            onValueChange={setQuietHours}
            trackColor={{ false: '#e2e8f0', true: `${COLORS.primary}55` }}
            thumbColor={quietHours ? COLORS.primary : '#fff'}
          />
        </View>
      </View>

      <Text style={styles.footerNote}>
        알림 설정은 기기 설정의 알림 권한과 별개로 동작합니다.{'\n'}
        알림을 받으려면 기기 설정에서도 알림이 허용되어야 합니다.
      </Text>

      <PermissionModal visible={permModalVisible} onClose={() => setPermModalVisible(false)} />
    </ScrollView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },

  sectionLabel:     { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 8 },
  sectionLabelText: { fontSize: 11, fontWeight: '700', color: '#94a3b8', letterSpacing: 0.8, textTransform: 'uppercase' },

  sectionCard: {
    backgroundColor: '#fff',
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#f1f5f9',
  },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
  },
  rowText:          { flex: 1, marginRight: 16 },
  rowLabel:         { fontSize: 15, fontWeight: '500', color: '#0f172a' },
  rowLabelDisabled: { color: '#94a3b8' },
  rowSub:           { fontSize: 12, color: '#94a3b8', marginTop: 2 },
  divider:          { height: 1, backgroundColor: '#f1f5f9', marginLeft: 20 },

  footerNote: {
    fontSize: 12, color: '#94a3b8', lineHeight: 18,
    textAlign: 'center', paddingHorizontal: 24, marginTop: 24,
  },
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
