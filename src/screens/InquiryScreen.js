import React, { useState } from 'react';
import {
  ActivityIndicator, Modal, Platform, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { ChevronLeft } from 'lucide-react-native';
import { auth, db } from '../firebase/config';
import { COLORS } from '../constants/theme';

// ─── Success Toast Modal ──────────────────────────────────────────────────────

function SuccessModal({ visible }) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={success.overlay}>
        <View style={success.card}>
          <Text style={success.text}>문의가 성공적으로 접수되었습니다.</Text>
        </View>
      </View>
    </Modal>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function InquiryScreen({ navigation }) {
  const insets = useSafeAreaInsets();

  const [title,       setTitle]       = useState('');
  const [content,     setContent]     = useState('');
  const [submitting,  setSubmitting]  = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const canSubmit = title.trim().length > 0 && content.trim().length > 0;

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      await addDoc(collection(db, 'inquiries'), {
        userId:    auth.currentUser?.uid ?? 'anonymous',
        title:     title.trim(),
        content:   content.trim(),
        status:    'pending',
        createdAt: serverTimestamp(),
      });
      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
        navigation.goBack();
      }, 1500);
    } catch (e) {
      console.error('[InquiryScreen] submit error', e);
    } finally {
      setSubmitting(false);
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
          disabled={submitting}
        >
          <ChevronLeft size={24} color="#0f172a" strokeWidth={2.2} />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>1:1 문의</Text>
        <View style={styles.backBtn} />
      </View>

      {/* ── Form ── */}
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 110 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.field}>
          <Text style={styles.label}>제목</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="제목을 입력해주세요"
            placeholderTextColor="#94a3b8"
            maxLength={100}
            returnKeyType="next"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>내용</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={content}
            onChangeText={setContent}
            placeholder="문의하실 내용을 상세히 적어주세요"
            placeholderTextColor="#94a3b8"
            multiline
            textAlignVertical="top"
            maxLength={1000}
          />
          <Text style={styles.charCount}>{content.length} / 1000</Text>
        </View>

        <View style={styles.noteCard}>
          <Text style={styles.noteText}>
            {'문의 접수 후 영업일 기준 1~2일 내에\nsupport@saveroo.co.kr 로 답변 드립니다.'}
          </Text>
        </View>
      </ScrollView>

      {/* ── Bottom CTA ── */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity
          style={[styles.submitBtn, (!canSubmit || submitting) && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={!canSubmit || submitting}
          activeOpacity={0.85}
        >
          {submitting
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={styles.submitBtnText}>문의 접수하기</Text>
          }
        </TouchableOpacity>
      </View>

      <SuccessModal visible={showSuccess} />
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

  field:      { marginBottom: 20 },
  label:      { fontSize: 13, fontWeight: '700', color: '#334155', marginBottom: 8 },
  input: {
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 15, color: '#0f172a',
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4 },
      android: { elevation: 1 },
    }),
  },
  textArea:   { height: 220, paddingTop: 13 },
  charCount:  { fontSize: 12, color: '#94a3b8', textAlign: 'right', marginTop: 6 },

  noteCard: {
    backgroundColor: '#eff6ff', borderRadius: 12,
    borderWidth: 1, borderColor: '#bfdbfe',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  noteText: { fontSize: 13, color: '#1e40af', lineHeight: 20 },

  bottomBar: {
    paddingHorizontal: 20, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: '#f1f5f9', backgroundColor: '#fff',
  },
  submitBtn: {
    backgroundColor: COLORS.primary, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
    ...Platform.select({
      ios:     { shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8 },
      android: { elevation: 4 },
    }),
  },
  submitBtnDisabled: {
    backgroundColor: '#d1d5db',
    ...Platform.select({ ios: { shadowOpacity: 0 }, android: { elevation: 0 } }),
  },
  submitBtnText: { fontSize: 16, fontWeight: '800', color: '#fff' },
});

const success = StyleSheet.create({
  overlay: {
    flex: 1, alignItems: 'center', justifyContent: 'flex-end',
    paddingBottom: 60,
  },
  card: {
    backgroundColor: 'rgba(15,23,42,0.88)', borderRadius: 12,
    paddingHorizontal: 24, paddingVertical: 14,
  },
  text: { fontSize: 14, fontWeight: '600', color: '#fff' },
});
