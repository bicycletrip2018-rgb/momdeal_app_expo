import React, { useState } from 'react';
import {
  ActivityIndicator, DevSettings, Modal, Platform, ScrollView,
  StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, AlertTriangle, CheckSquare, Square } from 'lucide-react-native';
import { unlink } from '@react-native-seoul/kakao-login';
import { signOut } from 'firebase/auth';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth, db } from '../firebase/config';
import { COLORS } from '../constants/theme';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const WARNINGS = [
  '탈퇴 후 30일간 계정 데이터가 보관되며, 이후 영구 삭제됩니다.',
  '30일 이내 재로그인 시 계정을 복구할 수 있습니다.',
  '보관 기간이 지나면 저장한 상품, 아이 정보, 활동 내역이 모두 삭제됩니다.',
  '카카오 계정 연동이 해제됩니다.',
];

// ─── Confirmation Modal ───────────────────────────────────────────────────────

function ConfirmModal({ visible, onCancel, onConfirm, isLoading }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={modal.overlay}>
        <View style={modal.card}>
          <Text style={modal.title}>정말 세이브루를 떠나시겠어요?</Text>
          <Text style={modal.sub}>30일 후 모든 맞춤 추천 및 정보가 영구 삭제됩니다.</Text>
          <View style={modal.btnRow}>
            <TouchableOpacity
              style={modal.cancelBtn}
              onPress={onCancel}
              disabled={isLoading}
              activeOpacity={0.75}
            >
              <Text style={modal.cancelText}>취소</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={modal.confirmBtn}
              onPress={async () => {
                try {
                  await AsyncStorage.clear();
                  DevSettings.reload();
                } catch (e) {
                  console.error(e);
                }
              }}
              activeOpacity={0.85}
            >
              <Text style={modal.confirmText}>탈퇴 진행하기</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function WithdrawScreen({ navigation }) {
  const insets      = useSafeAreaInsets();
  const [agreed,    setAgreed]    = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const handleWithdraw = () => {
    if (!agreed) return;
    setShowModal(true);
  };

  const executeWithdraw = async () => {
    setIsLoading(true);
    try {
      const uid = auth.currentUser?.uid;

      // A — Kakao SSO unlink (best-effort, may not be linked)
      await unlink().catch(() => {});

      // B — Mark Firestore user as pending deletion
      if (uid) {
        await updateDoc(doc(db, 'users', uid), {
          status: 'pending_deletion',
          deletionDate: new Date(Date.now() + THIRTY_DAYS_MS),
          deletionRequestedAt: serverTimestamp(),
        }).catch(() => {});
      }

      // C — Sign out (best-effort)
      await signOut(auth).catch(() => {});

    } catch (e) {
      console.error('[Withdraw] error', e);
    } finally {
      await AsyncStorage.clear();
      setIsLoading(false);
      DevSettings.reload();
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>

      {/* ── Header ── */}
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.backBtn}
          disabled={isLoading}
        >
          <ChevronLeft size={24} color="#0f172a" strokeWidth={2.2} />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>계정 탈퇴</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 32, paddingHorizontal: 20 }}
      >
        <View style={styles.warningBanner}>
          <AlertTriangle size={22} color="#dc2626" strokeWidth={2} />
          <Text style={styles.warningTitle}>탈퇴 전 꼭 확인해 주세요</Text>
        </View>

        <View style={styles.warningCard}>
          {WARNINGS.map((text, i) => (
            <View key={i} style={styles.warningRow}>
              <View style={styles.warningDot} />
              <Text style={styles.warningText}>{text}</Text>
            </View>
          ))}
        </View>

        <View style={styles.graceBox}>
          <Text style={styles.graceTitle}>30일 유예 기간 안내</Text>
          <Text style={styles.graceBody}>
            탈퇴 신청 후 30일간은 계정이 비활성화 상태로 보관됩니다.
            이 기간 내에 다시 로그인하면 계정 탈퇴가 취소되며,
            30일이 경과하면 모든 데이터가 자동으로 영구 삭제됩니다.
          </Text>
        </View>

        <TouchableOpacity
          style={styles.checkRow}
          onPress={() => setAgreed((v) => !v)}
          activeOpacity={0.75}
        >
          {agreed
            ? <CheckSquare size={22} color={COLORS.primary} strokeWidth={2} />
            : <Square      size={22} color="#94a3b8"         strokeWidth={2} />
          }
          <Text style={styles.checkLabel}>
            안내 사항을 확인하였으며 탈퇴에 동의합니다.
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* ── Bottom CTA ── */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity
          style={[styles.withdrawBtn, !agreed && styles.withdrawBtnDisabled]}
          onPress={handleWithdraw}
          disabled={!agreed || isLoading}
          activeOpacity={0.85}
        >
          <Text style={styles.withdrawBtnText}>최종 탈퇴하기</Text>
        </TouchableOpacity>
      </View>

      <ConfirmModal
        visible={showModal}
        isLoading={isLoading}
        onCancel={() => setShowModal(false)}
        onConfirm={executeWithdraw}
      />
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  backBtn:     { width: 40, alignItems: 'center', justifyContent: 'center' },
  topBarTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a', textAlign: 'center' },

  warningBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 24, marginBottom: 12 },
  warningTitle:  { fontSize: 17, fontWeight: '800', color: '#dc2626' },

  warningCard: {
    backgroundColor: '#fff5f5', borderRadius: 14,
    borderWidth: 1, borderColor: '#fee2e2',
    paddingHorizontal: 16, paddingVertical: 14,
    gap: 10, marginBottom: 16,
  },
  warningRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  warningDot:  { width: 5, height: 5, borderRadius: 3, backgroundColor: '#dc2626', marginTop: 7, flexShrink: 0 },
  warningText: { fontSize: 13, color: '#374151', lineHeight: 20, flex: 1, fontWeight: '500' },

  graceBox: {
    backgroundColor: '#eff6ff', borderRadius: 14,
    borderWidth: 1, borderColor: '#bfdbfe',
    paddingHorizontal: 16, paddingVertical: 14, marginBottom: 24,
  },
  graceTitle: { fontSize: 13, fontWeight: '800', color: COLORS.primary, marginBottom: 6 },
  graceBody:  { fontSize: 13, color: '#1e40af', lineHeight: 20 },

  checkRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 14,
    borderWidth: 1, borderColor: '#e2e8f0',
    paddingHorizontal: 16, paddingVertical: 16,
  },
  checkLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: '#0f172a', lineHeight: 20 },

  bottomBar: {
    paddingHorizontal: 20, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: '#f1f5f9', backgroundColor: '#fff',
  },
  withdrawBtn: {
    backgroundColor: '#dc2626', borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
    ...Platform.select({
      ios:     { shadowColor: '#dc2626', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8 },
      android: { elevation: 4 },
    }),
  },
  withdrawBtnDisabled: {
    backgroundColor: '#d1d5db',
    ...Platform.select({ ios: { shadowOpacity: 0 }, android: { elevation: 0 } }),
  },
  withdrawBtnText: { fontSize: 16, fontWeight: '800', color: '#fff' },
});

const modal = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%', backgroundColor: '#fff',
    borderRadius: 20, paddingHorizontal: 24, paddingVertical: 28,
    alignItems: 'center',
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 20 },
      android: { elevation: 12 },
    }),
  },
  title: { fontSize: 18, fontWeight: '800', color: '#0f172a', textAlign: 'center', marginBottom: 10 },
  sub:   { fontSize: 14, color: '#64748b', textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  btnRow: { flexDirection: 'row', gap: 12, width: '100%' },
  cancelBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 12,
    backgroundColor: '#f1f5f9', alignItems: 'center',
  },
  cancelText:  { fontSize: 15, fontWeight: '700', color: '#475569' },
  confirmBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 12,
    backgroundColor: '#ef4444', alignItems: 'center',
    ...Platform.select({
      ios:     { shadowColor: '#ef4444', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6 },
      android: { elevation: 4 },
    }),
  },
  confirmText: { fontSize: 15, fontWeight: '800', color: '#fff' },
});
