import React, { useState } from 'react';
import {
  Modal, ScrollView, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../constants/theme';

const NOTICES = [
  {
    id: '1',
    date: '2026.04.28',
    title: '🎉 세이브루 베타 서비스 오픈 안내',
    body: '우리 아이 맞춤 핫딜 큐레이션, 세이브루가 드디어 첫 선을 보입니다. 많은 기대 부탁드립니다!',
  },
];

function NoticeDetailModal({ notice, onClose }) {
  if (!notice) return null;
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={modal.container} edges={['top', 'bottom']}>
        <View style={modal.header}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={modal.close}>닫기</Text>
          </TouchableOpacity>
          <Text style={modal.headerTitle}>공지사항</Text>
          <View style={{ width: 36 }} />
        </View>
        <ScrollView contentContainerStyle={modal.content} showsVerticalScrollIndicator={false}>
          <Text style={modal.date}>{notice.date}</Text>
          <Text style={modal.title}>{notice.title}</Text>
          <View style={modal.divider} />
          <Text style={modal.body}>{notice.body}</Text>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

export default function NoticeScreen() {
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState(null);

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {NOTICES.map((item, index) => (
          <TouchableOpacity
            key={item.id}
            style={[styles.row, index < NOTICES.length - 1 && styles.rowBorder]}
            onPress={() => setSelected(item)}
            activeOpacity={0.72}
          >
            <Text style={styles.date}>{item.date}</Text>
            <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
          </TouchableOpacity>
        ))}

        {NOTICES.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>등록된 공지사항이 없습니다.</Text>
          </View>
        )}
      </ScrollView>

      {selected && (
        <NoticeDetailModal notice={selected} onClose={() => setSelected(null)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },

  row: {
    backgroundColor: '#fff',
    paddingHorizontal: 20, paddingVertical: 18,
  },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },

  date:  { fontSize: 12, color: '#94a3b8', fontWeight: '500', marginBottom: 6 },
  title: { fontSize: 15, fontWeight: '700', color: '#0f172a', lineHeight: 22 },

  empty: { alignItems: 'center', paddingTop: 80 },
  emptyText: { fontSize: 14, color: '#94a3b8' },
});

const modal = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  close:       { fontSize: 15, color: '#64748b', fontWeight: '600' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#0f172a' },

  content:  { padding: 24 },
  date:     { fontSize: 12, color: '#94a3b8', fontWeight: '500', marginBottom: 10 },
  title:    { fontSize: 18, fontWeight: '800', color: '#0f172a', lineHeight: 26, marginBottom: 16 },
  divider:  { height: 1, backgroundColor: '#f1f5f9', marginBottom: 20 },
  body:     { fontSize: 15, color: '#374151', lineHeight: 24 },
});
