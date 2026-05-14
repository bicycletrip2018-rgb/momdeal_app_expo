import React from 'react';
import {
  Alert,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

/**
 * GlobalHeader — shared top bar used across all main tabs.
 *
 * Props:
 *   placeholder  {string}  Search bar hint text (tab-specific).
 *   tabName      {string}  'Home' | 'Ranking' | 'Community' | 'Benefits'
 *   navigation   {object}  React Navigation prop (required for Home tab actions).
 */
export default function GlobalHeader({ placeholder, tabName = 'Home', navigation, unreadCount = 0, onSearchPress }) {
  const { top } = useSafeAreaInsets();

  const handleSearchPress = () => {
    if (onSearchPress) { onSearchPress(); return; }
    if ((tabName === 'Home' || tabName === 'Ranking') && navigation) {
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

      {/* ── Right: bell (Home + Ranking + Community) ── */}
      {(tabName === 'Home' || tabName === 'Ranking' || tabName === 'Community') && navigation && (
        <View style={styles.rightIcons}>
          <TouchableOpacity
            onPress={() => navigation.navigate('Notifications')}
            hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
            style={{ position: 'relative' }}
          >
            <Ionicons name="notifications-outline" size={24} color="#334155" />
            {unreadCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unreadCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
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

  logo: {
    fontSize: 18,
    fontWeight: '900',
    color: '#1d4ed8',
    letterSpacing: -0.3,
    flexShrink: 0,
  },

  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    backgroundColor: '#f8fafc',
    borderRadius: 24,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 6,
  },
  searchIcon:        { fontSize: 14, color: '#94a3b8' },
  searchPlaceholder: { flex: 1, fontSize: 14, color: '#b0b8c8', fontWeight: '500' },

  rightIcons: { flexDirection: 'row', alignItems: 'center', flexShrink: 0 },

  badge: {
    position: 'absolute', top: -2, right: -2,
    backgroundColor: '#ef4444', borderRadius: 8,
    minWidth: 16, height: 16,
    justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 4,
  },
  badgeText: { fontSize: 9, fontWeight: '900', color: '#fff', lineHeight: 11 },
});
