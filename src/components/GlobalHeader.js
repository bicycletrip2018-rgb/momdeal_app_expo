import React, { useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// ─── Per-tab guide content ────────────────────────────────────────────────────

const GUIDE = {
  Home: {
    emoji: '🏠',
    title: '세이브루 활용법',
    text: '아이 정보를 등록하면 또래 엄마들의 실시간 인기 육아템과 개인 맞춤 핫딜을 추천받을 수 있어요!',
  },
  Ranking: {
    emoji: '🏆',
    title: '랭킹 탭 활용법',
    text: '우리 아이 또래 엄마들이 가장 많이 담은 육아템을 실시간으로 확인하고, 내 맞춤 랭킹으로 필터링해보세요!',
  },
  Community: {
    emoji: '💬',
    title: '커뮤니티 활용법',
    text: "궁금한 점을 질문하거나 핫딜 정보를 공유하세요! 꿀팁을 많이 공유하면 '핫딜 요정' 뱃지를 얻을 수 있어요.",
  },
  Benefits: {
    emoji: '🎁',
    title: '혜택 탭 활용법',
    text: '매일 업데이트되는 쿠팡 타임세일과 세이브루 전용 시크릿 핫딜을 놓치지 마세요!',
  },
};

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * GlobalHeader — shared top bar used across all main tabs.
 *
 * Props:
 *   placeholder  {string}  Search bar hint text (tab-specific).
 *   tabName      {string}  'Home' | 'Ranking' | 'Community' | 'Benefits'
 *   navigation   {object}  React Navigation prop (required for Home tab actions).
 */
export default function GlobalHeader({ placeholder, tabName = 'Home', navigation }) {
  const { top } = useSafeAreaInsets();
  const [guideVisible, setGuideVisible] = useState(false);
  const guide = GUIDE[tabName] ?? GUIDE.Home;

  const handleSearchPress = () => {
    if (tabName === 'Home' && navigation) {
      navigation.navigate('Search');
    } else {
      Alert.alert('', '검색 기능 준비 중이에요! 🔍');
    }
  };

  return (
    <View style={[styles.header, { paddingTop: top + 8 }]}>

      {/* ── Left: brand logo ── */}
      <Text style={styles.logo}>세이브루</Text>

      {/* ── Centre: tappable search pill ── */}
      <TouchableOpacity
        style={styles.searchBar}
        activeOpacity={0.85}
        onPress={handleSearchPress}
      >
        <Text style={styles.searchIcon}>🔍</Text>
        <Text style={styles.searchPlaceholder} numberOfLines={1}>{placeholder}</Text>
      </TouchableOpacity>

      {/* ── Right: bell (Home only) + contextual guide ── */}
      <View style={styles.rightIcons}>
        {tabName === 'Home' && navigation && (
          <TouchableOpacity
            onPress={() => navigation.navigate('Notifications')}
            hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
          >
            <Text style={styles.iconBtn}>🔔</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={() => setGuideVisible(true)}
          hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
        >
          <Text style={styles.iconBtn}>💡</Text>
        </TouchableOpacity>
      </View>

      {/* ── Contextual guide modal ── */}
      <Modal
        visible={guideVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setGuideVisible(false)}
      >
        {/* Darkened backdrop — tap outside card to dismiss */}
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={() => setGuideVisible(false)}
        >
          {/* Card — onStartShouldSetResponder stops touches propagating to backdrop */}
          <View
            style={styles.modalCard}
            onStartShouldSetResponder={() => true}
          >
            <Text style={styles.modalEmoji}>{guide.emoji}</Text>
            <Text style={styles.modalTitle}>{guide.title}</Text>
            <Text style={styles.modalText}>{guide.text}</Text>
            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => setGuideVisible(false)}
              activeOpacity={0.85}
            >
              <Text style={styles.modalCloseBtnText}>확인했어요!</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Header bar
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingBottom: 10,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 },
      android: { elevation: 3 },
    }),
  },

  // Logo
  logo: {
    fontSize: 18,
    fontWeight: '900',
    color: '#1d4ed8',
    letterSpacing: -0.3,
    flexShrink: 0,
  },

  // Search pill
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 22,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 6,
  },
  searchIcon:        { fontSize: 13, color: '#94a3b8' },
  searchPlaceholder: { flex: 1, fontSize: 12, color: '#94a3b8', fontWeight: '500' },

  // Right icon group
  rightIcons: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 },
  iconBtn:    { fontSize: 21 },

  // Modal backdrop
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },

  // Modal card
  modalCard: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    gap: 10,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 20 },
      android: { elevation: 10 },
    }),
  },
  modalEmoji: { fontSize: 36, marginBottom: 2 },
  modalTitle: { fontSize: 17, fontWeight: '900', color: '#0f172a', textAlign: 'center' },
  modalText:  { fontSize: 14, color: '#475569', lineHeight: 22, textAlign: 'center' },
  modalCloseBtn: {
    marginTop: 6,
    backgroundColor: '#1d4ed8',
    borderRadius: 12,
    paddingHorizontal: 32,
    paddingVertical: 13,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  modalCloseBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },
});
