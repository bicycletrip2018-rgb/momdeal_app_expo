import React, { useState } from 'react';
import {
  ActivityIndicator, Image, KeyboardAvoidingView, Modal,
  Platform, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { Camera, ChevronLeft, X } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { auth, db } from '../firebase/config';
import { COLORS } from '../constants/theme';

const CATEGORIES = ['서비스 오류', '앱 사용 문의', '제안/건의', '기타'];

export default function InquiryWriteScreen({ navigation }) {
  const insets = useSafeAreaInsets();

  const [category,      setCategory]      = useState('');
  const [title,         setTitle]         = useState('');
  const [content,       setContent]       = useState('');
  const [attachments,   setAttachments]   = useState([]);
  const [selectedImage, setSelectedImage] = useState(null);
  const [submitting,    setSubmitting]    = useState(false);

  const canSubmit = category.length > 0 && title.trim().length > 0 && content.trim().length > 0;

  const handlePickImage = async () => {
    if (attachments.length >= 3) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7,
    });
    if (!result.canceled && result.assets?.[0]?.uri) {
      setAttachments((prev) => [...prev, result.assets[0].uri]);
    }
  };

  const handleRemoveImage = (index) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

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
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
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
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Category chips */}
        <View style={styles.field}>
          <Text style={styles.label}>
            문의 유형 <Text style={styles.required}>*</Text>
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
          <View style={styles.labelRow}>
            <Text style={styles.label}>제목</Text>
            <Text style={styles.counter}>{title.length}/40</Text>
          </View>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="제목을 입력해주세요"
            placeholderTextColor="#94a3b8"
            maxLength={40}
            returnKeyType="next"
          />
        </View>

        {/* Content */}
        <View style={styles.field}>
          <View style={styles.labelRow}>
            <Text style={styles.label}>내용</Text>
            <Text style={styles.counter}>{content.length}/1000</Text>
          </View>
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
        </View>

        {/* Image Attachment */}
        <View style={styles.field}>
          <View style={styles.labelRow}>
            <Text style={styles.label}>스크린샷 첨부</Text>
            <Text style={styles.counter}>선택 · 최대 3장</Text>
          </View>
          <View style={styles.attachRow}>
            {attachments.length < 3 && (
              <TouchableOpacity style={styles.cameraBtn} onPress={handlePickImage} activeOpacity={0.75}>
                <Camera size={20} color="#94A3B8" strokeWidth={1.8} />
                <Text style={styles.cameraBtnText}>{attachments.length}/3</Text>
              </TouchableOpacity>
            )}
            {attachments.map((uri, idx) => (
              <View key={idx} style={styles.thumbWrap}>
                <TouchableOpacity activeOpacity={0.85} onPress={() => setSelectedImage(uri)}>
                  <Image source={{ uri }} style={styles.thumb} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.thumbDelete}
                  onPress={() => handleRemoveImage(idx)}
                  hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                >
                  <X size={11} color="#fff" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </View>

        {/* Note */}
        <View style={styles.noteCard}>
          <Text style={styles.noteText}>영업일 기준 1~2일 내 현재 화면에서 답변드립니다.</Text>
        </View>
      </ScrollView>

      {/* ── Bottom CTA ── */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
        <Text style={styles.abuseWarning}>
          욕설·비방·반복 악성 문의는 약관에 따라 답변 거부 또는 이용 제한될 수 있습니다.
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

      {/* ── Image Zoom Modal ── */}
      <Modal
        visible={!!selectedImage}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedImage(null)}
      >
        <View style={zoom.overlay}>
          <TouchableOpacity
            style={zoom.closeBtn}
            onPress={() => setSelectedImage(null)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <X size={22} color="#fff" strokeWidth={2.5} />
          </TouchableOpacity>
          {selectedImage && (
            <Image source={{ uri: selectedImage }} style={zoom.image} resizeMode="contain" />
          )}
        </View>
      </Modal>
    </KeyboardAvoidingView>
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

  scrollContent: { padding: 16, paddingBottom: 24 },

  field:    { marginBottom: 14 },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  label:    { fontSize: 13, fontWeight: '700', color: '#334155' },
  required: { color: COLORS.primary },
  counter:  { fontSize: 12, color: '#94a3b8', fontWeight: '500' },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: {
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7,
    backgroundColor: '#f1f5f9', borderWidth: 1.5, borderColor: 'transparent',
  },
  chipActive:     { backgroundColor: '#eff6ff', borderColor: COLORS.primary },
  chipText:       { fontSize: 13, fontWeight: '600', color: '#64748b' },
  chipTextActive: { color: COLORS.primary, fontWeight: '700' },

  input: {
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 15, color: '#0f172a',
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4 },
      android: { elevation: 1 },
    }),
  },
  textArea: { height: 120, paddingTop: 11 },

  attachRow:     { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cameraBtn:     { width: 68, height: 68, borderRadius: 12, backgroundColor: '#f8fafc', borderWidth: 1.5, borderColor: '#e2e8f0', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 3 },
  cameraBtnText: { fontSize: 11, color: '#94A3B8', fontWeight: '600' },
  thumbWrap:     { width: 68, height: 68, borderRadius: 12, overflow: 'hidden', position: 'relative' },
  thumb:         { width: 68, height: 68 },
  thumbDelete:   { position: 'absolute', top: 4, right: 4, width: 18, height: 18, borderRadius: 9, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },

  noteCard: {
    backgroundColor: '#eff6ff', borderRadius: 10,
    borderWidth: 1, borderColor: '#bfdbfe',
    paddingHorizontal: 14, paddingVertical: 10,
    marginTop: 2,
  },
  noteText: { fontSize: 12, color: '#1e40af', lineHeight: 18 },

  bottomBar: {
    paddingHorizontal: 20, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: '#f1f5f9', backgroundColor: '#fff',
  },
  abuseWarning: { fontSize: 11, color: '#94a3b8', textAlign: 'center', marginBottom: 10, lineHeight: 16 },
  submitBtn: {
    backgroundColor: COLORS.primary, borderRadius: 14,
    paddingVertical: 15, alignItems: 'center',
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

const zoom = StyleSheet.create({
  overlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  closeBtn: { position: 'absolute', top: 52, right: 20, zIndex: 10, padding: 8 },
  image:    { width: '100%', height: '80%' },
});
