import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { getSavedProductsWithPriceSignals } from '../services/priceAlertService';

export default function RewardClaimScreen({ navigation }) {
  const [savedItems, setSavedItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedProductId, setSelectedProductId] = useState(null);
  const [orderNumber, setOrderNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) { setLoading(false); return; }
    getSavedProductsWithPriceSignals(uid)
      .then(setSavedItems)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const selectedItem = savedItems.find((i) => i.productId === selectedProductId);

  const handleSubmit = async () => {
    if (!selectedProductId) {
      Alert.alert('상품 선택', '적립 신청할 상품을 선택해주세요.');
      return;
    }
    if (!orderNumber.trim()) {
      Alert.alert('주문번호 입력', '주문번호를 입력해주세요.');
      return;
    }

    const uid = auth.currentUser?.uid;
    if (!uid) {
      Alert.alert('로그인 필요', '로그인 후 이용해주세요.');
      return;
    }

    setSubmitting(true);
    try {
      await addDoc(collection(db, 'reward_claims'), {
        userId: uid,
        productGroupId: selectedProductId,
        productName: selectedItem?.name ?? '',
        orderNumber: orderNumber.trim(),
        status: 'pending',
        createdAt: serverTimestamp(),
      });
      Alert.alert(
        '신청 완료 🎉',
        '적립 신청이 접수되었습니다.\n검토 후 포인트가 지급될 예정이에요.',
        [{ text: '확인', onPress: () => navigation.goBack() }]
      );
    } catch {
      Alert.alert('오류', '신청에 실패했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#f472b6" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

      {/* Info Banner */}
      <View style={styles.infoBanner}>
        <Text style={styles.infoBannerIcon}>ℹ️</Text>
        <Text style={styles.infoBannerText}>
          쿠팡 정책상 자동 적립이 불가하여{'\n'}
          주문번호를 직접 입력해주세요.{'\n'}
          검토 후 영업일 기준 3일 이내 포인트가 지급됩니다.
        </Text>
      </View>

      {/* Step 1: Product select */}
      <View style={styles.stepBlock}>
        <Text style={styles.stepLabel}>STEP 1 &nbsp; 구매한 상품 선택</Text>
        {savedItems.length === 0 ? (
          <Text style={styles.emptyText}>추적 중인 상품이 없습니다. 먼저 상품을 추가해주세요.</Text>
        ) : (
          savedItems.map((item) => {
            const selected = item.productId === selectedProductId;
            return (
              <TouchableOpacity
                key={item.productId}
                style={[styles.productRow, selected && styles.productRowSelected]}
                onPress={() => setSelectedProductId(item.productId)}
                activeOpacity={0.8}
              >
                <View style={[styles.radioCircle, selected && styles.radioCircleSelected]}>
                  {selected ? <View style={styles.radioDot} /> : null}
                </View>
                <View style={styles.productInfo}>
                  <Text style={styles.productName} numberOfLines={2}>{item.name || '이름 없음'}</Text>
                  {typeof item.currentPrice === 'number' && item.currentPrice > 0 ? (
                    <Text style={styles.productPrice}>₩{item.currentPrice.toLocaleString('ko-KR')}</Text>
                  ) : null}
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </View>

      {/* Step 2: Order number */}
      <View style={styles.stepBlock}>
        <Text style={styles.stepLabel}>STEP 2 &nbsp; 쿠팡 주문번호 입력</Text>
        <Text style={styles.stepHint}>쿠팡 앱 → 마이쿠팡 → 주문내역에서 확인하세요</Text>
        <TextInput
          style={styles.orderInput}
          value={orderNumber}
          onChangeText={setOrderNumber}
          placeholder="예) 1234567890-01"
          placeholderTextColor="#aaa"
          keyboardType="default"
          autoCorrect={false}
          editable={!submitting}
        />
      </View>

      {/* Submit */}
      <TouchableOpacity
        style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
        onPress={handleSubmit}
        disabled={submitting}
        activeOpacity={0.85}
      >
        {submitting ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={styles.submitBtnText}>🔑 포인트 적립 신청하기</Text>
        )}
      </TouchableOpacity>

      <Text style={styles.footerNote}>
        * 허위 신청 시 서비스 이용이 제한될 수 있습니다.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7fb' },
  content: { padding: 16, gap: 16, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  infoBanner: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: '#eff6ff', borderRadius: 12,
    borderWidth: 1, borderColor: '#bfdbfe', padding: 14,
  },
  infoBannerIcon: { fontSize: 18, marginTop: 1 },
  infoBannerText: { flex: 1, fontSize: 13, color: '#1e40af', lineHeight: 20 },

  stepBlock: {
    backgroundColor: '#fff', borderRadius: 12,
    borderWidth: 1, borderColor: '#e4e7ed', padding: 16, gap: 10,
  },
  stepLabel: { fontSize: 14, fontWeight: '800', color: '#0f172a' },
  stepHint: { fontSize: 12, color: '#64748b', marginTop: -4 },

  productRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 10, borderRadius: 10,
    borderWidth: 1, borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  productRowSelected: {
    borderColor: '#f472b6', backgroundColor: '#fdf2f8',
  },
  radioCircle: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: '#cbd5e1',
    alignItems: 'center', justifyContent: 'center',
  },
  radioCircleSelected: { borderColor: '#f472b6' },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#f472b6' },
  productInfo: { flex: 1, gap: 2 },
  productName: { fontSize: 13, color: '#0f172a', fontWeight: '600' },
  productPrice: { fontSize: 12, color: '#f472b6', fontWeight: '700' },

  emptyText: { fontSize: 13, color: '#94a3b8', textAlign: 'center', paddingVertical: 8 },

  orderInput: {
    backgroundColor: '#f8fafc', borderRadius: 10,
    borderWidth: 1, borderColor: '#e2e8f0',
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, color: '#0f172a',
  },

  submitBtn: {
    backgroundColor: '#f472b6', borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
    shadowColor: '#f472b6', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  submitBtnDisabled: { backgroundColor: '#fbb6ce' },
  submitBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },

  footerNote: { fontSize: 11, color: '#94a3b8', textAlign: 'center' },
});
