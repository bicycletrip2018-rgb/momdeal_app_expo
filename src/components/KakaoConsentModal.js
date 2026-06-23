import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MessageCircle } from 'lucide-react-native';

export default function KakaoConsentModal({ visible, onClose, onConfirm, navigation }) {
  const [termsAgreed,     setTermsAgreed]     = useState(false);
  const [privacyAgreed,   setPrivacyAgreed]   = useState(false);
  const [marketingAgreed, setMarketingAgreed] = useState(false);
  const [channelAgreed,   setChannelAgreed]   = useState(false);

  const isAllSelected = termsAgreed && privacyAgreed && marketingAgreed && channelAgreed;
  const canConfirm    = termsAgreed && privacyAgreed;

  const toggleAll = () => {
    const v = !isAllSelected;
    setTermsAgreed(v); setPrivacyAgreed(v); setMarketingAgreed(v); setChannelAgreed(v);
  };

  const handleClose = () => {
    setTermsAgreed(false); setPrivacyAgreed(false);
    setMarketingAgreed(false); setChannelAgreed(false);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={handleClose} />
        <View style={s.sheet}>
          <View style={s.handle} />

          {/* Header */}
          <Text style={s.title}>카카오 계정 연동을{'\n'}위해 약관에 동의해 주세요</Text>
          <Text style={s.subtitle}>데이터를 안전하게 보관하고 기기 분실 시 복구할 수 있어요.</Text>

          {/* Select All */}
          <TouchableOpacity onPress={toggleAll} style={s.selectAllRow}>
            <View style={[s.circleL, isAllSelected && s.circleActive]}>
              {isAllSelected && <Text style={s.checkMark}>✓</Text>}
            </View>
            <Text style={s.selectAllText}>약관 전체 동의하기</Text>
          </TouchableOpacity>
          <View style={s.divider} />

          {/* 필수: Terms */}
          <View style={s.itemWrap}>
            <TouchableOpacity onPress={() => setTermsAgreed(!termsAgreed)} style={s.itemRow}>
              <View style={[s.circleS, termsAgreed && s.circleActive]}>
                {termsAgreed && <Text style={s.checkMarkS}>✓</Text>}
              </View>
              <Text style={s.itemText}>(필수) 서비스 이용약관 동의</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation?.navigate('TermsDetail', { title: '서비스 이용약관', type: 'terms' })}>
              <Text style={s.viewLink}>보기 {'>'}</Text>
            </TouchableOpacity>
          </View>

          {/* 필수: Privacy */}
          <View style={s.itemWrap}>
            <TouchableOpacity onPress={() => setPrivacyAgreed(!privacyAgreed)} style={s.itemRow}>
              <View style={[s.circleS, privacyAgreed && s.circleActive]}>
                {privacyAgreed && <Text style={s.checkMarkS}>✓</Text>}
              </View>
              <Text style={s.itemText}>(필수) 개인정보 수집 및 이용 동의</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation?.navigate('TermsDetail', { title: '개인정보 처리방침', type: 'privacy' })}>
              <Text style={s.viewLink}>보기 {'>'}</Text>
            </TouchableOpacity>
          </View>
          <Text style={s.itemHint}>초개인화 큐레이션을 위한 연령 및 양육 환경 수집</Text>

          {/* 선택: Marketing */}
          <View style={s.itemWrap}>
            <TouchableOpacity onPress={() => setMarketingAgreed(!marketingAgreed)} style={s.itemRow}>
              <View style={[s.circleS, marketingAgreed && s.circleActive]}>
                {marketingAgreed && <Text style={s.checkMarkS}>✓</Text>}
              </View>
              <Text style={s.itemText}>(선택) 혜택 및 특가 알림 수신 동의</Text>
            </TouchableOpacity>
          </View>
          <Text style={[s.itemHint, { marginTop: -8, marginBottom: 8 }]}>관심 상품 최저가 도달 및 맞춤 혜택 PUSH 알림</Text>

          {/* 선택: Kakao Channel */}
          <View style={[s.itemWrap, { marginBottom: 4 }]}>
            <TouchableOpacity onPress={() => setChannelAgreed(!channelAgreed)} style={s.itemRow}>
              <View style={[s.circleS, channelAgreed && s.circleActive]}>
                {channelAgreed && <Text style={s.checkMarkS}>✓</Text>}
              </View>
              <Text style={s.itemText}>(선택) 세이브루 카카오톡 채널 추가 동의</Text>
            </TouchableOpacity>
          </View>
          <Text style={[s.itemHint, { marginBottom: 28 }]}>단독 시크릿 특가 및 이벤트 당첨 소식 알림</Text>

          {/* CTA */}
          <TouchableOpacity
            disabled={!canConfirm}
            onPress={() => onConfirm(marketingAgreed, channelAgreed)}
            style={[s.cta, canConfirm ? s.ctaActive : s.ctaDisabled]}
          >
            <MessageCircle size={18} color={canConfirm ? '#191919' : '#9CA3AF'} strokeWidth={0} fill={canConfirm ? '#191919' : '#9CA3AF'} style={{ marginRight: 8 }} />
            <Text style={[s.ctaText, !canConfirm && s.ctaTextDisabled]}>
              동의하고 카카오로 시작하기
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet:           { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 24, paddingBottom: 36, paddingTop: 16 },
  handle:          { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', marginBottom: 24 },
  title:           { fontSize: 22, fontWeight: 'bold', color: '#111827', lineHeight: 30, marginBottom: 8 },
  subtitle:        { fontSize: 14, color: '#6B7280', lineHeight: 20, marginBottom: 28 },
  selectAllRow:    { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  circleL:         { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: '#D1D5DB', backgroundColor: 'transparent', marginRight: 12, justifyContent: 'center', alignItems: 'center' },
  circleS:         { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#D1D5DB', backgroundColor: 'transparent', marginRight: 12, justifyContent: 'center', alignItems: 'center' },
  circleActive:    { borderColor: '#3C1E1E', backgroundColor: '#3C1E1E' },
  checkMark:       { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  checkMarkS:      { color: '#fff', fontWeight: 'bold', fontSize: 11 },
  selectAllText:   { fontSize: 17, fontWeight: 'bold', color: '#111827' },
  divider:         { height: 1, backgroundColor: '#F3F4F6', marginBottom: 20 },
  itemWrap:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  itemRow:         { flexDirection: 'row', alignItems: 'center', flex: 1 },
  itemText:        { fontSize: 15, color: '#374151', flex: 1 },
  itemHint:        { fontSize: 12, color: '#9CA3AF', marginLeft: 34, marginBottom: 16 },
  viewLink:        { fontSize: 13, color: '#9CA3AF' },
  cta:             { flexDirection: 'row', height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  ctaActive:       { backgroundColor: '#FEE500' },
  ctaDisabled:     { backgroundColor: '#F3F4F6' },
  ctaText:         { color: '#191919', fontSize: 16, fontWeight: 'bold' },
  ctaTextDisabled: { color: '#9CA3AF' },
});
