import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, storage } from '../firebase/config';
import { createPost } from '../services/communityService';
import { getOrCreateNickname, incrementPostCount } from '../services/firestore/userRepository';

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { key: 'question', label: '🙋‍♀️ 질문' },
  { key: 'tip',      label: '🍯 꿀팁' },
  { key: 'deal',     label: '🔥 핫딜' },
  { key: 'review',   label: '📝 후기' },
  { key: 'free',     label: '💬 자유' },
];

const PRODUCT_CATEGORIES = new Set(['review', 'deal']);

// ─── Star Selector ────────────────────────────────────────────────────────────

function StarSelector({ rating, onChange }) {
  return (
    <View style={styles.starRow}>
      {[1, 2, 3, 4, 5].map((n) => (
        <TouchableOpacity
          key={n}
          onPress={() => onChange(n)}
          hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
          activeOpacity={0.7}
        >
          <Text style={[styles.star, n <= rating && styles.starActive]}>★</Text>
        </TouchableOpacity>
      ))}
      {rating > 0 && <Text style={styles.starLabel}>{rating}.0 / 5.0</Text>}
    </View>
  );
}

// ─── Category Bottom Sheet ────────────────────────────────────────────────────

function CategorySheet({ visible, current, onSelect, onClose }) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Dim overlay — tap to dismiss */}
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.sheetOverlay} />
      </TouchableWithoutFeedback>

      {/* Sheet container */}
      <View style={styles.sheetContainer}>
        {/* Drag handle */}
        <View style={styles.sheetHandle} />

        {/* Header */}
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>게시판 선택</Text>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.7}
          >
            <Text style={styles.sheetClose}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Category rows */}
        {CATEGORIES.map(({ key, label }) => {
          const active = key === current;
          return (
            <TouchableOpacity
              key={key}
              style={[styles.sheetItem, active && styles.sheetItemActive]}
              onPress={() => onSelect(key)}
              activeOpacity={0.7}
            >
              <Text style={[styles.sheetItemText, active && styles.sheetItemTextActive]}>
                {label}
              </Text>
              {active && <Text style={styles.sheetItemCheck}>✓</Text>}
            </TouchableOpacity>
          );
        })}

        {/* Safe-area bottom pad */}
        <View style={styles.sheetBottom} />
      </View>
    </Modal>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function WritePostScreen({ navigation }) {
  const [category,          setCategory]          = useState('question');
  const [title,             setTitle]             = useState('');
  const [content,           setContent]           = useState('');
  const [rating,            setRating]            = useState(0);
  const [taggedItem,        setTaggedItem]        = useState(null);
  const [submitting,        setSubmitting]        = useState(false);
  const [error,             setError]             = useState('');
  const [selectedImages,    setSelectedImages]    = useState([]);
  const [showCategorySheet, setShowCategorySheet] = useState(false);

  useEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  const showProductArea = PRODUCT_CATEGORIES.has(category);
  const activeCategory  = CATEGORIES.find((c) => c.key === category) ?? CATEGORIES[0];

  const handleCategorySelect = (key) => {
    setCategory(key);
    setRating(0);
    setTaggedItem(null);
    setShowCategorySheet(false);
  };

  const handleTagProduct = () => {
    Alert.alert('상품 태그', '상품 검색 기능을 준비 중입니다. 제목에 상품명을 적어주세요!');
  };

  // ── Image picker ──
  const handleImagePick = async () => {
    if (selectedImages.length >= 5) {
      Alert.alert('사진 첨부', '최대 5장까지 첨부할 수 있어요.');
      return;
    }
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('권한 필요', '사진 라이브러리 접근 권한이 필요합니다. 설정에서 허용해주세요.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 5 - selectedImages.length,
      quality: 0.8,
    });
    if (!result.canceled) {
      setSelectedImages((prev) => [...prev, ...result.assets.map((a) => a.uri)].slice(0, 5));
    }
  };

  const handleRemoveImage = (uri) => {
    setSelectedImages((prev) => prev.filter((u) => u !== uri));
  };

  // ── Firebase Storage upload (XHR blob — avoids Android fetch-blob bug) ──
  const uploadImages = (uid, uris) =>
    Promise.all(
      uris.map(
        (uri) =>
          new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.responseType = 'blob';
            xhr.onload = async () => {
              try {
                const blob    = xhr.response;
                const ext     = (uri.split('.').pop()?.split('?')[0] || 'jpg').toLowerCase();
                const path    = `post_images/${uid}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
                const fileRef = storageRef(storage, path);
                await uploadBytes(fileRef, blob);
                const url = await getDownloadURL(fileRef);
                resolve(url);
              } catch (err) {
                console.error(
                  '[Storage] upload failed\n',
                  '  code    :', err?.code,
                  '\n  message :', err?.message,
                  '\n  serverResponse:', err?.serverResponse,
                  '\n  full    :', JSON.stringify(err)
                );
                reject(err);
              }
            };
            xhr.onerror = (e) => {
              console.error('[Storage] XHR blob fetch failed. URI:', uri, '\nEvent:', JSON.stringify(e));
              reject(new Error('XHR_BLOB_FETCH_FAILED'));
            };
            xhr.open('GET', uri);
            xhr.send();
          })
      )
    );

  // ── Submit ──
  const handleSubmit = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid)            { setError('로그인이 필요합니다.'); return; }
    if (!title.trim())   { setError('제목을 입력해 주세요.'); return; }
    if (!content.trim()) { setError('내용을 입력해 주세요.'); return; }
    if (showProductArea && rating === 0) { setError('별점을 선택해 주세요.'); return; }
    setError('');
    setSubmitting(true);
    try {
      const nickname   = await getOrCreateNickname(uid);
      const isVerified = category === 'review';

      const imageUrls = selectedImages.length > 0
        ? await uploadImages(uid, selectedImages)
        : [];

      await createPost({
        userId: uid, category, title, content, nickname, isVerified, imageUrls,
        ...(showProductArea && { rating, taggedProductId: taggedItem?.productId ?? null }),
      });
      incrementPostCount(uid).catch(() => {});
      navigation.goBack();
    } catch (err) {
      setError('등록에 실패했습니다. 다시 시도해 주세요.');
      console.error(
        '[WritePost] submit error\n',
        '  code    :', err?.code,
        '\n  message :', err?.message,
        '\n  serverResponse:', err?.serverResponse,
        '\n  full    :', JSON.stringify(err)
      );
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.headerClose}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>글쓰기</Text>
          <TouchableOpacity
            style={[styles.submitPill, submitting && styles.submitPillDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
            activeOpacity={0.85}
          >
            {submitting
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.submitPillText}>등록</Text>
            }
          </TouchableOpacity>
        </View>

        {/* ── Category selector row ── */}
        <TouchableOpacity
          style={styles.categoryRow}
          onPress={() => setShowCategorySheet(true)}
          activeOpacity={0.7}
        >
          <Text style={styles.categoryRowText}>{activeCategory.label}</Text>
          <Text style={styles.categoryRowChevron}>⌄</Text>
        </TouchableOpacity>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Product tag + rating (후기 / 핫딜 only) ── */}
          {showProductArea && (
            <View style={styles.productArea}>
              <TouchableOpacity style={styles.tagBtn} onPress={handleTagProduct} activeOpacity={0.8}>
                {taggedItem ? (
                  <Text style={styles.tagBtnTextActive} numberOfLines={1}>📦 {taggedItem.name}</Text>
                ) : (
                  <Text style={styles.tagBtnText}>📦 상품 태그하기</Text>
                )}
              </TouchableOpacity>
              <View style={styles.ratingBox}>
                <Text style={styles.ratingLabel}>별점</Text>
                <StarSelector rating={rating} onChange={setRating} />
              </View>
            </View>
          )}

          {/* ── Title input ── */}
          <TextInput
            style={styles.titleInput}
            placeholder="제목을 입력해주세요"
            placeholderTextColor="#c0ccd8"
            value={title}
            onChangeText={setTitle}
            maxLength={100}
            returnKeyType="next"
          />

          {/* ── Content input ── */}
          <TextInput
            style={styles.contentInput}
            placeholder={`우리아이 또래 맘들에게 공유하고 싶은 이야기를 적어주세요!\n(상품 후기, 육아 꿀팁 등)`}
            placeholderTextColor="#c0ccd8"
            multiline
            value={content}
            onChangeText={setContent}
            maxLength={2000}
            textAlignVertical="top"
          />

          <Text style={styles.charCount}>{content.length} / 2000</Text>

          {/* ── Image preview strip ── */}
          {selectedImages.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.imagePreviewRow}
              style={styles.imagePreviewScroll}
            >
              {selectedImages.map((uri) => (
                // Wrapper sized to thumb + badge; no overflow needed since badge is inset
                <View key={uri} style={styles.imageThumbWrap}>
                  <Image source={{ uri }} style={styles.imageThumb} />
                  {/* Remove badge: positioned INSIDE the thumb bounds to avoid Android clip */}
                  <TouchableOpacity
                    style={styles.imageRemoveBtn}
                    onPress={() => handleRemoveImage(uri)}
                    hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                  >
                    <Text style={styles.imageRemoveText}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          )}

          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </ScrollView>

        {/* ── Bottom rich toolbar ── */}
        <View style={styles.toolbar}>
          <TouchableOpacity
            style={styles.toolbarIconBtn}
            onPress={handleImagePick}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.7}
          >
            <Text style={styles.toolbarIconEmoji}>📷</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.toolbarIconBtn}
            onPress={() => Alert.alert('태그', '태그 기능을 준비 중입니다.')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.7}
          >
            <Text style={styles.toolbarIconGlyph}>#</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.toolbarIconBtn}
            onPress={() => Alert.alert('멘션', '멘션 기능을 준비 중입니다.')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.7}
          >
            <Text style={styles.toolbarIconGlyph}>@</Text>
          </TouchableOpacity>

          {/* Spacer pushes badge to far right */}
          <View style={styles.toolbarSpacer} />

          {selectedImages.length > 0 && (
            <View style={styles.imgCountBadge}>
              <Text style={styles.imgCountText}>{selectedImages.length}/5</Text>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>

      {/* ── Category bottom sheet (rendered outside KAV so it covers full screen) ── */}
      <CategorySheet
        visible={showCategorySheet}
        current={category}
        onSelect={handleCategorySelect}
        onClose={() => setShowCategorySheet(false)}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#fff' },
  flex:     { flex: 1, backgroundColor: '#fff' },

  // ── Header ──
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) + 12 : 12,
    borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
    backgroundColor: '#fff',
  },
  headerBtn:          { width: 36, alignItems: 'flex-start' },
  headerClose:        { fontSize: 18, color: '#64748b', fontWeight: '600' },
  headerTitle:        { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '800', color: '#0f172a' },
  submitPill:         { backgroundColor: '#1d4ed8', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 6, minWidth: 52, alignItems: 'center' },
  submitPillDisabled: { backgroundColor: '#93c5fd' },
  submitPillText:     { color: '#fff', fontSize: 14, fontWeight: '800' },

  // ── Category selector row ──
  categoryRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  categoryRowText:    { fontSize: 14, fontWeight: '700', color: '#1d4ed8' },
  categoryRowChevron: { fontSize: 18, color: '#64748b', lineHeight: 22 },

  // ── Scroll ──
  scroll:        { flex: 1 },
  scrollContent: { paddingBottom: 80 },

  // ── Product tag + rating ──
  productArea: {
    marginHorizontal: 14, marginTop: 14,
    backgroundColor: '#f8faff', borderRadius: 12,
    borderWidth: 1, borderColor: '#dbeafe', padding: 14, gap: 12,
  },
  tagBtn: {
    backgroundColor: '#fff', borderRadius: 8,
    borderWidth: 1.5, borderColor: '#1d4ed8', borderStyle: 'dashed',
    paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center',
  },
  tagBtnText:       { fontSize: 14, fontWeight: '700', color: '#1d4ed8' },
  tagBtnTextActive: { fontSize: 14, fontWeight: '700', color: '#1d4ed8' },
  ratingBox:        { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ratingLabel:      { fontSize: 13, fontWeight: '700', color: '#334155' },
  starRow:          { flexDirection: 'row', alignItems: 'center', gap: 2 },
  star:             { fontSize: 30, color: '#e2e8f0' },
  starActive:       { color: '#fbbf24' },
  starLabel:        { fontSize: 13, fontWeight: '700', color: '#fbbf24', marginLeft: 8 },

  // ── Inputs ──
  titleInput: {
    fontSize: 18, fontWeight: '700', color: '#0f172a',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  contentInput: {
    fontSize: 15, color: '#334155', lineHeight: 24,
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12,
    minHeight: 220,
  },
  charCount: { fontSize: 12, color: '#94a3b8', textAlign: 'right', paddingRight: 16, marginTop: 8, marginBottom: 16, alignSelf: 'stretch' },
  errorText: { fontSize: 13, color: '#ef4444', paddingHorizontal: 16, marginTop: 6 },

  // ── Image preview strip ──
  // Remove badge is positioned INSIDE the thumb (top:4, right:4) so Android never clips it.
  imagePreviewScroll: { flexGrow: 0, marginTop: 12 },
  imagePreviewRow:    { paddingHorizontal: 16, gap: 10, paddingBottom: 8 },
  imageThumbWrap:     { width: 80, height: 80 },
  imageThumb:         { width: 80, height: 80, borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0' },
  imageRemoveBtn: {
    position: 'absolute',
    top: 4, right: 4,          // inside bounds — Android-safe
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    alignItems: 'center', justifyContent: 'center',
  },
  imageRemoveText: { fontSize: 9, color: '#fff', fontWeight: '900', lineHeight: 11 },

  // ── Bottom rich toolbar ──
  toolbar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 8,
    borderTopWidth: 1, borderTopColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    gap: 2,
    ...Platform.select({
      ios:     { paddingBottom: 24 },
      android: { paddingBottom: 8 },
    }),
  },
  toolbarIconBtn:   { width: 40, height: 40, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  toolbarIconEmoji: { fontSize: 22 },
  toolbarIconGlyph: { fontSize: 18, fontWeight: '800', color: '#475569' },
  toolbarSpacer:    { flex: 1 },
  imgCountBadge:    { backgroundColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  imgCountText:     { fontSize: 11, fontWeight: '700', color: '#475569' },

  // ── Category bottom sheet ──
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheetContainer: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.12, shadowRadius: 12 },
      android: { elevation: 16 },
    }),
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 36, height: 4,
    borderRadius: 2,
    backgroundColor: '#cbd5e1',
    marginBottom: 12,
  },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  sheetTitle:         { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  sheetClose:         { fontSize: 18, color: '#94a3b8', fontWeight: '600', padding: 4 },
  sheetItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: '#f8fafc',
  },
  sheetItemActive:     { backgroundColor: '#eff6ff' },
  sheetItemText:       { fontSize: 15, fontWeight: '600', color: '#334155' },
  sheetItemTextActive: { color: '#1d4ed8', fontWeight: '800' },
  sheetItemCheck:      { fontSize: 16, color: '#1d4ed8', fontWeight: '800' },
  sheetBottom:         { height: Platform.OS === 'ios' ? 32 : 16 },
});
