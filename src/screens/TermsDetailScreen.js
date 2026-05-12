import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const TERMS_CONTENT = `제 1 조 (목적)
본 약관은 세이브루(이하 '회사')가 제공하는 맞춤형 육아/생필품 큐레이션 서비스 및 관련 제반 서비스의 이용조건 및 절차를 규정합니다.

제 2 조 (서비스의 제공 및 변경)
① 회사는 회원이 입력한 자녀 데이터 바탕의 상품 추천 및 가격 추이 정보 서비스를 제공합니다.
② 회사는 제휴 링크를 제공할 수 있으며, 상품의 실제 거래 및 배송, 환불에 대한 책임은 해당 제휴 쇼핑몰에 있습니다.

제 3 조 (회원의 의무)
회원은 비정상적인 방법(욕설, 비방 등)으로 서비스를 이용할 경우 이용이 제한될 수 있습니다.`;

const PRIVACY_CONTENT = `1. 수집하는 개인정보의 항목
- [필수] 기기 식별값, 자녀 및 임신 상태, 생년월일, 성별, 양육 환경, 고민 카테고리.
- [선택] 자녀 신체 정보(키, 몸무게).

2. 개인정보의 이용 목적
- 초개인화 맞춤 큐레이션 알고리즘(LAL) 가동 및 특가 알림 발송.

3. 개인정보의 보유 및 파기 (30일 유예 정책)
- 탈퇴 요청 시 CS 분쟁 방지를 위해 30일간 계정 데이터가 비활성화 보관됩니다.
- 30일 경과 후 프로필 데이터는 영구 파기되며, 작성된 커뮤니티 게시글은 익명화되어 보존됩니다.`;

export default function TermsDetailScreen({ route }) {
  const insets = useSafeAreaInsets();
  const type   = route?.params?.type ?? 'terms';
  const body   = type === 'privacy' ? PRIVACY_CONTENT : TERMS_CONTENT;

  const paragraphs = body.split('\n\n');

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.card}>
        {paragraphs.map((para, i) => {
          const lines = para.split('\n');
          const heading = lines[0];
          const rest    = lines.slice(1).join('\n');
          return (
            <View key={i} style={[styles.para, i > 0 && styles.paraSep]}>
              <Text style={styles.heading}>{heading}</Text>
              {rest.length > 0 && <Text style={styles.body}>{rest}</Text>}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content:   { padding: 20 },

  card: {
    backgroundColor: '#fff', borderRadius: 14,
    borderWidth: 1, borderColor: '#f1f5f9',
    paddingHorizontal: 20, paddingVertical: 24,
  },

  para:    {},
  paraSep: { marginTop: 24, paddingTop: 24, borderTopWidth: 1, borderTopColor: '#f1f5f9' },

  heading: { fontSize: 14, fontWeight: '800', color: '#0f172a', marginBottom: 8 },
  body:    { fontSize: 14, color: '#334155', lineHeight: 24 },
});
