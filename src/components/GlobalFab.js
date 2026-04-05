import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase/config';

const MARKETS = [
  { key: 'coupang', name: '쿠팡', emoji: '🛒', active: true },
  { key: 'kurly',   name: '마켓컬리', emoji: '🟣', active: false },
  { key: 'naver',   name: '네이버쇼핑', emoji: '🟢', active: false },
];

export default function GlobalFab() {
  const insets = useSafeAreaInsets();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [registering, setRegistering] = useState(false);

  const handleRegister = async () => {
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    setRegistering(true);
    try {
      const fn = httpsCallable(functions, 'registerProductFromUrl');
      const result = await fn({ url: trimmed });
      setUrlInput('');
      setSheetOpen(false);
      const isNew = result?.data?.isNew !== false;
      Alert.alert(
        isNew ? '등록 완료 ✅' : '이미 등록된 상품',
        isNew
          ? '상품이 가격 추적 목록에 추가되었어요!'
          : '이미 추적 중인 상품입니다. 가격 정보를 업데이트했어요.'
      );
    } catch (error) {
      const code = error?.code ?? '';
      let msg;
      if (code.includes('invalid-argument')) {
        msg = error.message || '지원하지 않는 URL이에요. 쿠팡 상품 링크를 붙여넣어 주세요.';
      } else if (code.includes('not-found')) {
        msg = '상품 정보를 찾을 수 없어요. URL을 다시 확인해주세요.';
      } else {
        msg = '등록에 실패했어요. 잠시 후 다시 시도해주세요.';
      }
      Alert.alert('등록 실패', msg);
    } finally {
      setRegistering(false);
    }
  };

  // Bottom padding: tab bar (~50px) + safe area
  const fabBottom = insets.bottom + 62;

  return (
    <>
      {/* FAB button */}
      <TouchableOpacity
        style={[styles.fab, { bottom: fabBottom }]}
        onPress={() => setSheetOpen(true)}
        activeOpacity={0.85}
      >
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>

      {/* Bottom Sheet Modal */}
      <Modal
        visible={sheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setSheetOpen(false)}
      >
        <TouchableWithoutFeedback onPress={() => setSheetOpen(false)}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.sheetWrap}
        >
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            {/* Handle */}
            <View style={styles.handle} />

            <Text style={styles.sheetTitle}>상품 링크로 추가하기</Text>
            <Text style={styles.sheetSub}>가격을 추적하고 싶은 상품의 링크를 붙여넣어 주세요</Text>

            {/* Market selector */}
            <View style={styles.marketRow}>
              {MARKETS.map((m) => (
                <View key={m.key} style={[styles.marketItem, !m.active && styles.marketItemDisabled]}>
                  <Text style={styles.marketEmoji}>{m.emoji}</Text>
                  <Text style={[styles.marketName, !m.active && styles.marketNameDisabled]}>
                    {m.name}
                  </Text>
                  {!m.active ? (
                    <Text style={styles.comingSoon}>준비 중</Text>
                  ) : null}
                </View>
              ))}
            </View>

            {/* URL input */}
            <View style={styles.inputRow}>
              <TextInput
                style={styles.urlInput}
                value={urlInput}
                onChangeText={setUrlInput}
                placeholder="https://www.coupang.com/..."
                placeholderTextColor="#aaa"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!registering}
              />
              <TouchableOpacity
                style={[styles.registerBtn, (!urlInput.trim() || registering) && styles.registerBtnDisabled]}
                onPress={handleRegister}
                disabled={!urlInput.trim() || registering}
                activeOpacity={0.85}
              >
                {registering ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.registerBtnText}>등록</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 20,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#f472b6',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#f472b6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 999,
  },
  fabIcon: { fontSize: 28, color: '#fff', lineHeight: 32, fontWeight: '300' },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },

  sheetWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 12,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: '#e2e8f0', alignSelf: 'center', marginBottom: 8,
  },
  sheetTitle: { fontSize: 17, fontWeight: '800', color: '#0f172a' },
  sheetSub: { fontSize: 13, color: '#64748b', marginTop: -6 },

  marketRow: { flexDirection: 'row', gap: 10 },
  marketItem: {
    flex: 1, alignItems: 'center', gap: 4,
    backgroundColor: '#fdf2f8', borderRadius: 12,
    borderWidth: 1.5, borderColor: '#f472b6', padding: 12,
  },
  marketItemDisabled: {
    backgroundColor: '#f8fafc', borderColor: '#e2e8f0',
  },
  marketEmoji: { fontSize: 22 },
  marketName: { fontSize: 12, fontWeight: '700', color: '#0f172a' },
  marketNameDisabled: { color: '#94a3b8' },
  comingSoon: { fontSize: 10, color: '#94a3b8', fontWeight: '600' },

  inputRow: { flexDirection: 'row', gap: 8 },
  urlInput: {
    flex: 1, backgroundColor: '#f8fafc', borderRadius: 10,
    borderWidth: 1, borderColor: '#e2e8f0',
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 13, color: '#0f172a',
  },
  registerBtn: {
    backgroundColor: '#f472b6', borderRadius: 10,
    paddingHorizontal: 16, justifyContent: 'center', minWidth: 54,
  },
  registerBtnDisabled: { backgroundColor: '#fbb6ce' },
  registerBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
