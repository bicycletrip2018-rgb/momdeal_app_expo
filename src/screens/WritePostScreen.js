import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, storage } from '../firebase/config';
import { createPost } from '../services/communityService';
import { getOrCreateNickname, incrementPostCount } from '../services/firestore/userRepository';
import { Image as ImageIcon, Link, X, Search, Camera } from 'lucide-react-native';

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { key: 'question', label: '이유식/식단' },
  { key: 'tip',      label: '육아꿀템' },
  { key: 'deal',     label: '특가제보' },
  { key: 'free',     label: '자유/고민' },
];

const PRODUCT_CATEGORIES = new Set(['review', 'deal']);

const MOCK_PRODUCTS = [
  { id: 'p1', brand: '하기스', name: '하기스 매직팬티 5단계 (남아) 40매', price: 28900 },
  { id: 'p2', brand: '마미포코', name: '마미포코 팬티형 기저귀 XL 60매', price: 32500 },
  { id: 'p3', brand: '노리플레이', name: '노리플레이 소프트 블록 세트 48P', price: 45000 },
  { id: 'p4', brand: '매일유업', name: '앱솔루트 명작 분유 2단계 800g', price: 39800 },
];

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

// ─── Category Pill Row ────────────────────────────────────────────────────────

function CategoryPillRow({ current, onSelect }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.pillRowContent}
      style={styles.pillRow}
    >
      {CATEGORIES.map(({ key, label }) => {
        const active = key === current;
        return (
          <TouchableOpacity
            key={key}
            style={[styles.pill, active && styles.pillActive]}
            onPress={() => onSelect(key)}
            activeOpacity={0.75}
          >
            <Text style={[styles.pillText, active && styles.pillTextActive]}>{label}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

// ─── Product Search Modal ─────────────────────────────────────────────────────

function ProductSearchModal({ visible, onClose, onSelect }) {
  const { top: topInset } = useSafeAreaInsets();
  const [query, setQuery] = useState('');

  const filtered = MOCK_PRODUCTS.filter(
    (p) =>
      query.trim() === '' ||
      p.name.includes(query.trim()) ||
      p.brand.includes(query.trim())
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView edges={['bottom']} style={modalStyles.container}>
        {/* Header */}
        <View style={[modalStyles.header, { paddingTop: topInset + 12 }]}>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={modalStyles.headerBtn}
          >
            <X size={24} color="#334155" />
          </TouchableOpacity>
          <Text style={modalStyles.headerTitle}>상품 검색</Text>
          <View style={modalStyles.headerBtn} />
        </View>

        {/* Search bar */}
        <View style={modalStyles.searchBarWrap}>
          <Search size={18} color="#94A3B8" style={{ marginRight: 8 }} />
          <TextInput
            style={modalStyles.searchInput}
            placeholder="쿠팡 상품을 검색해보세요"
            placeholderTextColor="#B0B8C8"
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            autoFocus
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <X size={16} color="#94A3B8" />
            </TouchableOpacity>
          )}
        </View>

        {/* Results */}
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <Text style={modalStyles.emptyText}>검색 결과가 없어요</Text>
          }
          renderItem={({ item }) => (
            <View style={modalStyles.resultRow}>
              {/* Thumbnail placeholder */}
              <View style={modalStyles.thumb} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={modalStyles.brand}>{item.brand}</Text>
                <Text style={modalStyles.name} numberOfLines={2}>{item.name}</Text>
                <Text style={modalStyles.price}>₩{item.price.toLocaleString('ko-KR')}</Text>
              </View>
              <TouchableOpacity
                style={modalStyles.selectBtn}
                onPress={() => { onSelect(item); onClose(); }}
                activeOpacity={0.85}
              >
                <Text style={modalStyles.selectBtnText}>선택</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      </SafeAreaView>
    </Modal>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function WritePostScreen({ navigation, route }) {
  const { editMode, postData } = route?.params || {};
  const { top: topInset } = useSafeAreaInsets();

  const [category,             setCategory]             = useState('question');
  const [title,                setTitle]                = useState('');
  const [content,              setContent]              = useState('');
  const [rating,               setRating]               = useState(0);
  const [submitting,           setSubmitting]           = useState(false);
  const [error,                setError]                = useState('');
  const [selectedImages,       setSelectedImages]       = useState([]);
  const [isSearchModalVisible, setIsSearchModalVisible] = useState(false);
  const [taggedProduct,        setTaggedProduct]        = useState(null);

  useEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  useEffect(() => {
    if (editMode && postData) {
      if (postData.category)          setCategory(postData.category);
      if (postData.title)             setTitle(postData.title);
      if (postData.content)           setContent(postData.content);
      if (postData.imageUrls?.length) setSelectedImages(postData.imageUrls);
    }
  }, []);

  const showProductArea = PRODUCT_CATEGORIES.has(category);

  const handleCategorySelect = (key) => {
    setCategory(key);
    setRating(0);
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
                console.error('[Storage] upload failed', err?.code, err?.message);
                reject(err);
              }
            };
            xhr.onerror = (e) => {
              console.error('[Storage] XHR blob fetch failed. URI:', uri);
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
        taggedProductId: taggedProduct?.id ?? null,
        ...(showProductArea && { rating }),
      });
      incrementPostCount(uid).catch(() => {});
      navigation.goBack();
    } catch (err) {
      setError('등록에 실패했습니다. 다시 시도해 주세요.');
      console.error('[WritePost] submit error', err?.code, err?.message);
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <SafeAreaView edges={['bottom']} style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {/* ── Header ── */}
        <View style={[styles.header, { paddingTop: topInset + 12 }]}>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.headerClose}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{editMode ? '글 수정' : '글쓰기'}</Text>
          <TouchableOpacity
            style={[styles.submitPill, submitting && styles.submitPillDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
            activeOpacity={0.85}
          >
            {submitting
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.submitPillText}>{editMode ? '수정완료' : '등록'}</Text>
            }
          </TouchableOpacity>
        </View>

        {/* ── Category pill row ── */}
        <CategoryPillRow current={category} onSelect={handleCategorySelect} />

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Product tag + rating (후기 / 핫딜 only) ── */}
          {showProductArea && (
            <View style={styles.productArea}>
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
            maxLength={40}
            returnKeyType="next"
          />
          <Text style={styles.titleCharCount}>{title.length}/40</Text>

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

          {/* ── Image preview strip (always shown; first slot is Add button) ── */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.imagePreviewRow}
            style={styles.imagePreviewScroll}
          >
            {/* Add-image skeleton — always first */}
            <TouchableOpacity
              style={styles.addImageBox}
              onPress={handleImagePick}
              activeOpacity={0.7}
            >
              <Camera size={24} color="#94A3B8" />
              <Text style={styles.addImageCount}>{selectedImages.length}/5</Text>
            </TouchableOpacity>

            {selectedImages.map((uri) => (
              <View key={uri} style={styles.imageThumbWrap}>
                <Image source={{ uri }} style={styles.imageThumb} />
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

          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </ScrollView>

        {/* ── Tagged product mini-card ── */}
        {taggedProduct && (
          <View style={styles.taggedCard}>
            <View style={styles.taggedThumb} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.taggedName} numberOfLines={1}>{taggedProduct.name}</Text>
              <Text style={styles.taggedPrice}>₩{taggedProduct.price.toLocaleString('ko-KR')}</Text>
            </View>
            <TouchableOpacity
              onPress={() => setTaggedProduct(null)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <X size={18} color="#94A3B8" />
            </TouchableOpacity>
          </View>
        )}

        {/* ── Bottom toolbar ── */}
        <View style={styles.toolbar}>
          <TouchableOpacity
            style={styles.toolbarIconBtn}
            onPress={handleImagePick}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.7}
          >
            <ImageIcon size={24} color="#64748B" />
          </TouchableOpacity>

          <View style={styles.toolbarSpacer} />

          <TouchableOpacity
            style={styles.toolbarTagBtn}
            onPress={() => setIsSearchModalVisible(true)}
            activeOpacity={0.85}
          >
            <Link size={20} color="#FFF" />
            <Text style={styles.toolbarTagText}>상품 검색/태그</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* ── Product search modal ── */}
      <ProductSearchModal
        visible={isSearchModalVisible}
        onClose={() => setIsSearchModalVisible(false)}
        onSelect={(product) => setTaggedProduct(product)}
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
    paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
    backgroundColor: '#fff',
  },
  headerBtn:          { width: 36, alignItems: 'flex-start' },
  headerClose:        { fontSize: 18, color: '#64748b', fontWeight: '600' },
  headerTitle:        { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '800', color: '#0f172a' },
  submitPill:         { backgroundColor: '#1d4ed8', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 6, minWidth: 52, alignItems: 'center' },
  submitPillDisabled: { backgroundColor: '#93c5fd' },
  submitPillText:     { color: '#fff', fontSize: 14, fontWeight: '800' },

  // ── Category pill row ──
  pillRow:        { flexGrow: 0, borderBottomWidth: 1, borderBottomColor: '#F1F5F9', backgroundColor: '#fff' },
  pillRowContent: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  pill: {
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6,
    borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFF',
  },
  pillActive:     { borderColor: '#2E6FF2', backgroundColor: '#EFF6FF' },
  pillText:       { fontSize: 13, fontWeight: '600', color: '#64748B' },
  pillTextActive: { color: '#2E6FF2', fontWeight: '700' },

  // ── Scroll ──
  scroll:        { flex: 1 },
  scrollContent: { paddingTop: 0, paddingBottom: 40 },

  // ── Product tag + rating ──
  productArea: {
    marginHorizontal: 14, marginTop: 14,
    backgroundColor: '#f8faff', borderRadius: 12,
    borderWidth: 1, borderColor: '#dbeafe', padding: 14,
  },
  ratingBox:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ratingLabel: { fontSize: 13, fontWeight: '700', color: '#334155' },
  starRow:     { flexDirection: 'row', alignItems: 'center', gap: 2 },
  star:        { fontSize: 30, color: '#e2e8f0' },
  starActive:  { color: '#fbbf24' },
  starLabel:   { fontSize: 13, fontWeight: '700', color: '#fbbf24', marginLeft: 8 },

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
  titleCharCount: { fontSize: 12, color: '#94A3B8', textAlign: 'right', paddingRight: 16, paddingBottom: 8, marginTop: -6 },
  charCount:      { fontSize: 12, color: '#94a3b8', textAlign: 'right', paddingRight: 16, marginTop: 8, marginBottom: 16 },
  errorText:      { fontSize: 13, color: '#ef4444', paddingHorizontal: 16, marginTop: 6 },

  // ── Image preview strip ──
  imagePreviewScroll: { flexGrow: 0, marginTop: 12 },
  imagePreviewRow:    { paddingHorizontal: 16, gap: 10, paddingBottom: 8 },
  addImageBox: {
    width: 72, height: 72, borderRadius: 8,
    borderWidth: 1, borderColor: '#CBD5E1', borderStyle: 'dashed',
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
  addImageCount: { fontSize: 12, color: '#94A3B8', marginTop: 4 },
  imageThumbWrap: { width: 72, height: 72 },
  imageThumb:     { width: 72, height: 72, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0' },
  imageRemoveBtn: {
    position: 'absolute', top: 4, right: 4,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    alignItems: 'center', justifyContent: 'center',
  },
  imageRemoveText: { fontSize: 9, color: '#fff', fontWeight: '900', lineHeight: 11 },

  // ── Tagged product mini-card ──
  taggedCard: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 16, marginBottom: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1, borderColor: '#CBD5E1',
    borderRadius: 10, padding: 10, gap: 10,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07, shadowRadius: 4 },
      android: { elevation: 2 },
    }),
  },
  taggedThumb:  { width: 48, height: 48, borderRadius: 8, backgroundColor: '#E2E8F0', flexShrink: 0 },
  taggedName:   { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  taggedPrice:  { fontSize: 13, fontWeight: '700', color: '#2E6FF2' },

  // ── Bottom toolbar ──
  toolbar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 16,
    borderTopWidth: 1, borderTopColor: '#F1F5F9',
    backgroundColor: '#fff',
    ...Platform.select({
      ios:     { paddingBottom: 24 },
      android: { paddingBottom: 12 },
    }),
  },
  toolbarIconBtn: { width: 40, height: 40, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  toolbarTagBtn:  { flexDirection: 'row', alignItems: 'center', backgroundColor: '#2E6FF2', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 16, gap: 6 },
  toolbarTagText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
  toolbarSpacer:  { flex: 1 },
});

// ─── Modal Styles ─────────────────────────────────────────────────────────────

const modalStyles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#fff' },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  headerBtn:   { width: 36, alignItems: 'flex-start' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '800', color: '#0f172a' },

  searchBarWrap: {
    flexDirection: 'row', alignItems: 'center',
    margin: 16,
    backgroundColor: '#F8FAFC',
    borderWidth: 1, borderColor: '#E2E8F0',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
  },
  searchInput: { flex: 1, fontSize: 15, color: '#0f172a', padding: 0 },

  resultRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#F8FAFC',
    gap: 12,
  },
  thumb:    { width: 56, height: 56, borderRadius: 8, backgroundColor: '#E2E8F0', flexShrink: 0 },
  brand:    { fontSize: 11, color: '#94A3B8', fontWeight: '600' },
  name:     { fontSize: 14, fontWeight: '600', color: '#0f172a', lineHeight: 20 },
  price:    { fontSize: 13, fontWeight: '700', color: '#2E6FF2', marginTop: 2 },

  selectBtn:     { backgroundColor: '#2E6FF2', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  selectBtnText: { color: '#FFF', fontSize: 13, fontWeight: '700' },

  emptyText: { textAlign: 'center', color: '#94A3B8', marginTop: 48, fontSize: 14 },
});
