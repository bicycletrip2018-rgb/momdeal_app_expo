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

// Track A — anonymous user: instant wipe, no recovery
const WARNINGS_ANON = [
  '앱에 저장된 관심상품 및 맞춤 정보가 즉시 영구 삭제되며, 절대 복구할 수 없습니다.',
];

// Track B — Kakao linked user: 30-day grace period
const WARNINGS_KAKAO = [
  '탈퇴(초기화) 신청 시 30일간 계정이 비활성화되며, 이후 모든 데이터(관심상품, 아이 정보, 활동 내역)가 영구 삭제됩니다.',
  '단, 30일 이내에 다시 카카오 계정으로 로그인하시면 탈퇴가 즉시 취소되고 모든 데이터가 복구됩니다.',
  '탈퇴 시 카카오 계정 연동은 기기에서 즉시 안전하게 해제됩니다.',
];

// ─── Confirmation Modal ───────────────────────────────────────────────────────

function ConfirmModal({ visible, onCancel, isKakaoLinked }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={modal.overlay}>
        <View style={modal.card}>
          <Text style={modal.title}>
            {isKakaoLinked ? '정말 세이브루를 떠나시겠어요?' : '앱 데이터를 초기화할까요?'}
          </Text>
          <Text style={modal.sub}>
            {isKakaoLinked
              ? '30일 후 모든 맞춤 추천 및 정보가 영구 삭제됩니다.'
              : '이 작업은 되돌릴 수 없습니다. 모든 데이터가 즉시 삭제됩니다.'}
          </Text>
          <View style={modal.btnRow}>
            <TouchableOpacity style={modal.cancelBtn} onPress={onCancel} activeOpacity={0.75}>
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
              <Text style={modal.confirmText}>
                {isKakaoLinked ? '탈퇴 진행하기' : '초기화하기'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function WithdrawScreen({ navigation }) {
  const insets = useSafeAreaInsets();

  // TODO: Connect to real Auth state (e.g. from context or Firebase currentUser)
  const [isKakaoLinked, setIsKakaoLinked] = useState(false);
  const [agreed,        setAgreed]        = useState(false);
  const [isLoading,     setIsLoading]     = useState(false);
  const [showModal,     setShowModal]     = useState(false);

  const warnings     = isKakaoLinked ? WARNINGS_KAKAO : WARNINGS_ANON;
  const screenTitle  = isKakaoLinked ? '계정 탈퇴' : '앱 데이터 초기화';
  const checkText    = isKakaoLinked
    ? '안내 사항을 확인하였으며 탈퇴에 동의합니다.'
    : '안내 사항을 확인하였으며 데이터 초기화에 동의합니다.';
  const submitText   = isKakaoLinked ? '최종 탈퇴하기' : '초기화하고 처음으로 돌아가기';
  const bannerLabel  = isKakaoLinked ? '탈퇴 전 꼭 확인해 주세요' : '초기화 전 꼭 확인해 주세요';

  const handleWithdraw = () => { if (!agreed) return; setShowModal(true); };

  const executeWithdraw = async () => {
    setIsLoading(true);
    try {
      const uid = auth.currentUser?.uid;
      if (isKakaoLinked) {
        await unlink().catch(() => {});
        if (uid) {
          await updateDoc(doc(db, 'users', uid), {
            status: 'pending_deletion',
            deletionDate: new Date(Date.now() + THIRTY_DAYS_MS),
            deletionRequestedAt: serverTimestamp(),
          }).catch(() => {});
        }
        await signOut(auth).catch(() => {});
      }
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

      {/* ── [DEV] Toggle for CPO testing ── */}
      <TouchableOpacity onPress={() => { setIsKakaoLinked((v) => !v); setAgreed(false); }}>
        <Text style={styles.devToggle}>
          [Test] 현재: {isKakaoLinked ? '카카오 연동 (Track B)' : '비연동 익명 (Track A)'} — 탭하여 전환
        </Text>
      </TouchableOpacity>

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
        <Text style={styles.topBarTitle}>{screenTitle}</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 32, paddingHorizontal: 20 }}
      >
        <View style={styles.warningBanner}>
          <AlertTriangle size={22} color="#dc2626" strokeWidth={2} />
          <Text style={styles.warningTitle}>{bannerLabel}</Text>
        </View>

        <View style={styles.warningCard}>
          {warnings.map((text, i) => (
            <View key={i} style={styles.warningRow}>
              <View style={styles.warningDot} />
              <Text style={styles.warningText}>{text}</Text>
            </View>
          ))}
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
          <Text style={styles.checkLabel}>{checkText}</Text>
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
          {isLoading
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={styles.withdrawBtnText}>{submitText}</Text>
          }
        </TouchableOpacity>
      </View>

      <ConfirmModal
        visible={showModal}
        isKakaoLinked={isKakaoLinked}
        onCancel={() => setShowModal(false)}
        onConfirm={executeWithdraw}
      />
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },

  devToggle: {
    color: '#2E6FF2', textAlign: 'center',
    fontSize: 12, fontWeight: '600',
    paddingVertical: 8, backgroundColor: '#EFF6FF',
  },

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
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24,
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
  title:      { fontSize: 18, fontWeight: '800', color: '#0f172a', textAlign: 'center', marginBottom: 10 },
  sub:        { fontSize: 14, color: '#64748b', textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  btnRow:     { flexDirection: 'row', gap: 12, width: '100%' },
  cancelBtn:  { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: '#f1f5f9', alignItems: 'center' },
  cancelText: { fontSize: 15, fontWeight: '700', color: '#475569' },
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
