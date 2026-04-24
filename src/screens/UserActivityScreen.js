import React, { useState } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { COLORS } from '../constants/theme';

const TABS = [
  { key: '작성글',    label: '작성글' },
  { key: '작성댓글',  label: '작성댓글' },
  { key: '댓글단 글', label: '댓글단 글' },
  { key: '좋아요한 글', label: '좋아요한 글' },
];

const EMPTY_MESSAGES = {
  '작성글':     '작성한 글이 없습니다.',
  '작성댓글':   '작성한 댓글이 없습니다.',
  '댓글단 글':  '댓글을 단 글이 없습니다.',
  '좋아요한 글': '좋아요한 글이 없습니다.',
};

function FileTextIcon({ size = 40, color = '#cbd5e1' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/>
      <Path d="M14 2v6h6" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/>
      <Path d="M16 13H8M16 17H8M10 9H8" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/>
    </Svg>
  );
}

export default function UserActivityScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const initialTab = route?.params?.activeTab ?? '작성글';
  const [activeTab, setActiveTab] = useState(initialTab);

  return (
    <View style={styles.container}>
      {/* Custom Naver Cafe-style horizontal top tab bar */}
      <View style={styles.tabBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabBarContent}
        >
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={styles.tabItem}
                onPress={() => setActiveTab(tab.key)}
                activeOpacity={0.7}
              >
                <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                  {tab.label}
                </Text>
                {isActive && <View style={styles.tabIndicator} />}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Content area */}
      <View style={styles.content}>
        <FileTextIcon size={44} color="#e2e8f0" />
        <Text style={styles.emptyTitle}>{EMPTY_MESSAGES[activeTab]}</Text>
        <Text style={styles.emptyBody}>커뮤니티에서 활동하면 여기에 표시됩니다.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },

  // ── Tab bar (Naver Cafe style) ──
  tabBar: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  tabBarContent: {
    flexDirection: 'row',
    paddingHorizontal: 8,
  },
  tabItem: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 13,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 64,
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#94a3b8',
    letterSpacing: 0.1,
  },
  tabLabelActive: {
    fontWeight: '800',
    color: '#0f172a',
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2.5,
    backgroundColor: COLORS.primary,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
  },

  // ── Empty state ──
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#94a3b8',
    marginTop: 4,
  },
  emptyBody: {
    fontSize: 13,
    fontWeight: '400',
    color: '#cbd5e1',
    textAlign: 'center',
    lineHeight: 19,
  },
});
