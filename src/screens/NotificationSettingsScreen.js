import React, { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../constants/theme';

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function NotificationSettingsScreen() {
  const insets = useSafeAreaInsets();

  const [marketing,   setMarketing]   = useState(true);
  const [priceAlerts, setPriceAlerts] = useState(true);
  const [momtalk,     setMomtalk]     = useState(true);
  const [benefits,    setBenefits]    = useState(true);
  const [quietHours,  setQuietHours]  = useState(false);

  // When master marketing toggle turns off, disable all sub-toggles
  const handleMarketingToggle = (val) => {
    setMarketing(val);
    if (!val) {
      setPriceAlerts(false);
      setMomtalk(false);
      setBenefits(false);
    }
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
            onValueChange={(val) => { if (marketing) setPriceAlerts(val); }}
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
            value={momtalk && marketing}
            onValueChange={(val) => { if (marketing) setMomtalk(val); }}
            disabled={!marketing}
            trackColor={{ false: '#e2e8f0', true: `${COLORS.primary}55` }}
            thumbColor={(momtalk && marketing) ? COLORS.primary : '#fff'}
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
    </ScrollView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },

  sectionLabel: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 8 },
  sectionLabelText: {
    fontSize: 11, fontWeight: '700', color: '#94a3b8',
    letterSpacing: 0.8, textTransform: 'uppercase',
  },

  sectionCard: {
    backgroundColor: '#fff',
    marginHorizontal: 0,
    borderTopWidth: 1, borderBottomWidth: 1,
    borderColor: '#f1f5f9',
  },

  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
  },
  rowText:          { flex: 1, marginRight: 16 },
  rowLabel:         { fontSize: 15, fontWeight: '500', color: '#0f172a' },
  rowLabelDisabled: { color: '#94a3b8' },
  rowSub:           { fontSize: 12, color: '#94a3b8', marginTop: 2 },

  divider: { height: 1, backgroundColor: '#f1f5f9', marginLeft: 20 },

  footerNote: {
    fontSize: 12, color: '#94a3b8', lineHeight: 18,
    textAlign: 'center', paddingHorizontal: 24, marginTop: 24,
  },
});
