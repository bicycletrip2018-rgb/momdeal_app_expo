import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { auth } from '../firebase/config';
import { submitReview } from '../services/reviewService';

function StarRating({ value, onChange }) {
  return (
    <View style={styles.starRow}>
      {[1, 2, 3, 4, 5].map((star) => (
        <TouchableOpacity key={star} onPress={() => onChange(star)} activeOpacity={0.7}>
          <Text style={[styles.star, star <= value && styles.starFilled]}>★</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export default function ReviewWriteScreen({ route, navigation }) {
  const productId = route?.params?.productId || '';
  const productName = route?.params?.productName || '상품';
  const currentPrice = route?.params?.currentPrice ?? null;

  const [rating, setRating] = useState(0);
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (rating === 0) {
      setError('별점을 선택해 주세요.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      await submitReview({
        userId: auth.currentUser?.uid,
        productGroupId: productId,
        rating,
        content: content.trim(),
        purchasePrice: typeof currentPrice === 'number' && currentPrice > 0 ? currentPrice : undefined,
      });
      navigation.goBack();
    } catch (err) {
      setError('리뷰 등록에 실패했습니다. 다시 시도해 주세요.');
      console.log('ReviewWriteScreen submit error:', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.productName} numberOfLines={2}>
          {productName}
        </Text>

        <Text style={styles.label}>별점</Text>
        <StarRating value={rating} onChange={setRating} />

        <Text style={styles.label}>리뷰 내용</Text>
        <TextInput
          style={styles.input}
          placeholder="상품에 대한 솔직한 리뷰를 남겨 주세요."
          placeholderTextColor="#94a3b8"
          multiline
          value={content}
          onChangeText={setContent}
          maxLength={500}
        />
        <Text style={styles.charCount}>{content.length} / 500</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.button, submitting && styles.buttonDisabled]}
          onPress={handleSubmit}
          activeOpacity={0.85}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.buttonText}>리뷰 등록</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: '#f5f7fb',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 8,
  },
  productName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
    marginTop: 8,
  },
  starRow: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 4,
  },
  star: {
    fontSize: 36,
    color: '#e2e8f0',
  },
  starFilled: {
    color: '#f59e0b',
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e4e7ed',
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: '#0f172a',
    minHeight: 120,
    textAlignVertical: 'top',
    marginTop: 4,
  },
  charCount: {
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'right',
  },
  error: {
    fontSize: 13,
    color: '#ef4444',
    marginTop: 4,
  },
  button: {
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  buttonDisabled: {
    backgroundColor: '#cbd5e1',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
