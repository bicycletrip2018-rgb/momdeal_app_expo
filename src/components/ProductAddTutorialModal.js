import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const STEPS = [
  {
    icon: '📋',
    title: '링크 복사',
    desc: "쿠팡에서 맘에 드는 상품의 '공유하기 → 링크 복사' 클릭",
  },
  {
    icon: '📱',
    title: '세이브루 열기',
    desc: '세이브루 앱을 열기',
  },
  {
    icon: '🪄',
    title: '매직 넛지 클릭',
    desc: "화면 아래에 뜨는 '최저가 추적하기' 매직 넛지 클릭!",
  },
  {
    icon: '🎉',
    title: '추적 시작!',
    desc: '자동으로 최저가 추적 시작',
  },
];

export default function ProductAddTutorialModal({ visible, onClose }) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>상품 추가 방법</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={22} color="#475569" />
            </TouchableOpacity>
          </View>

          <View style={styles.divider} />

          {/* Steps */}
          <ScrollView
            contentContainerStyle={styles.body}
            showsVerticalScrollIndicator={false}
          >
            {STEPS.map((step, idx) => (
              <View key={idx} style={styles.stepRow}>
                <View style={styles.stepBadge}>
                  <Text style={styles.stepNumber}>{idx + 1}</Text>
                </View>
                <View style={styles.stepIcon}>
                  <Text style={{ fontSize: 22 }}>{step.icon}</Text>
                </View>
                <View style={styles.stepText}>
                  <Text style={styles.stepTitle}>{step.title}</Text>
                  <Text style={styles.stepDesc}>{step.desc}</Text>
                </View>
              </View>
            ))}
          </ScrollView>

          {/* CTA */}
          <View style={styles.footer}>
            <TouchableOpacity style={styles.ctaBtn} onPress={onClose} activeOpacity={0.85}>
              <Text style={styles.ctaBtnText}>알겠어요!</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '75%',
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.1, shadowRadius: 8 },
      android: { elevation: 8 },
    }),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#0f172a' },
  divider:     { height: 1, backgroundColor: '#f1f5f9', marginHorizontal: 20 },
  body:        { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },

  stepRow:   { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 20 },
  stepBadge: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: '#3b82f6', alignItems: 'center', justifyContent: 'center',
    marginRight: 10, marginTop: 2, flexShrink: 0,
  },
  stepNumber: { fontSize: 12, fontWeight: '800', color: '#fff' },
  stepIcon:   { marginRight: 10, flexShrink: 0 },
  stepText:   { flex: 1 },
  stepTitle:  { fontSize: 14, fontWeight: '700', color: '#0f172a', marginBottom: 2 },
  stepDesc:   { fontSize: 13, color: '#64748b', lineHeight: 18 },

  footer: {
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 32 : 16,
    borderTopWidth: 1,
    borderColor: '#f1f5f9',
  },
  ctaBtn:     { backgroundColor: '#3b82f6', paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  ctaBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
