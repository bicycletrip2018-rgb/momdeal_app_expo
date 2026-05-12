import React, { useState } from 'react';
import {
  ActivityIndicator, Platform, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { ChevronLeft } from 'lucide-react-native';
import { auth, db } from '../firebase/config';
import { COLORS } from '../constants/theme';

const CATEGORIES = ['서비스 오류', '앱 사용 문의', '제안/건의', '기타'];

export default function InquiryWriteScreen({ navigation }) {
  const insets = useSafeAreaInsets();

  const [category,   setCategory]   = useState('');
  const [title,      setTitle]      = useState('');
  const [content,    setContent]    = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = category.length > 0 && title.trim().length > 0 && content.trim().length > 0;

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      await addDoc(collection(db, 'inquiries'), {
        userId:    auth.currentUser?.uid ?? 'anonymous',
        category,
        title:     title.trim(),
        content:   content.trim(),
        status:    'pending',
        createdAt: serverTimestamp(),
      });
      navigation.navigate('Inquiry', { toast: '문의가 성공적으로 접수되었습니다.' });
    } catch (e) {
      console.error('[InquiryWriteScreen] submit error', e);
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
        <Text style={styles.topBarTitle}>새 문의 작성</Text>
        <View style={styles.backBtn} />
      </View>

      {/* ── Form ── */}
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 110 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >

        {/* Category chips */}
        <View style={styles.field}>
          <Text style={styles.label}>
            문의 유형을 선택해주세요 <Text style={styles.required}>*</Text>
          </Text>
          <View style={styles.chipRow}>
            {CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat}
                style={[styles.chip, category === cat && styles.chipActive]}
                onPress={() => setCategory(cat)}
                activeOpacity={0.72}
              >
                <Text style={[styles.chipText, category === cat && styles.chipTextActive]}>
                  {cat}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Title */}
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

        {/* Content */}
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
            영업일 기준 1~2일 내 현재 화면에서 답변드립니다.
          </Text>
        </View>
      </ScrollView>

      {/* ── Bottom CTA ── */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
        <Text style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center', marginBottom: 12, paddingHorizontal: 10 }}>
          욕설, 비방, 반복적인 악성 문의는 서비스 이용 약관에 따라 답변이 거부되거나 앱 이용이 제한될 수 있습니다.
        </Text>
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

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  backBtn:     { width: 40, alignItems: 'center', justifyContent: 'center' },
  topBarTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a', textAlign: 'center' },

  field:    { marginBottom: 20 },
  label:    { fontSize: 13, fontWeight: '700', color: '#334155', marginBottom: 10 },
  required: { color: COLORS.primary },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: '#f1f5f9', borderWidth: 1.5, borderColor: 'transparent',
  },
  chipActive: {
    backgroundColor: '#eff6ff', borderColor: COLORS.primary,
  },
  chipText:       { fontSize: 13, fontWeight: '600', color: '#64748b' },
  chipTextActive: { color: COLORS.primary, fontWeight: '700' },

  input: {
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 15, color: '#0f172a',
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4 },
      android: { elevation: 1 },
    }),
  },
  textArea:  { height: 200, paddingTop: 13 },
  charCount: { fontSize: 12, color: '#94a3b8', textAlign: 'right', marginTop: 6 },

  noteCard: {
    backgroundColor: '#eff6ff', borderRadius: 12,
    borderWidth: 1, borderColor: '#bfdbfe',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  noteText:          { fontSize: 13, color: '#1e40af', lineHeight: 20 },
  noteTextHighlight: { color: '#2E6FF2', fontWeight: '700' },

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

  abuseWarning: {
    fontSize: 12, color: '#94a3b8', textAlign: 'center', marginBottom: 10,
  },
});
