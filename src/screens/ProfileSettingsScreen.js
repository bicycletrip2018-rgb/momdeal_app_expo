import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  SafeAreaView, ScrollView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

const INTEREST_CHIPS = ['기저귀', '분유', '물티슈', '완구', '유아식', '이유식', '의류', '바운서', '유모차', '카시트', '젖병', '체온계'];

export default function ProfileSettingsScreen() {
  const navigation = useNavigation();
  const [gender,       setGender]       = useState('female');
  const [selectedChips, setSelectedChips] = useState(new Set(['기저귀', '분유', '물티슈']));

  const toggleChip = (chip) => {
    setSelectedChips((prev) => {
      const next = new Set(prev);
      next.has(chip) ? next.delete(chip) : next.add(chip);
      return next;
    });
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Card 1: Profile ─────────────────────────────────────────── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="person-circle-outline" size={40} color="#6366f1" />
            <View style={{ marginLeft: 12, flex: 1 }}>
              <Text style={styles.cardTitle}>👧 노을 엄마, 안녕하세요!</Text>
              <Text style={styles.cardSub}>아이 프로필을 등록하고 맞춤 추천을 받아보세요</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.outlineBtn}>
            <Text style={styles.outlineBtnText}>아이 프로필 등록</Text>
          </TouchableOpacity>
        </View>

        {/* ── Card 2: Core Info ────────────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>현재 개월 수</Text>
          <View style={styles.rowBetween}>
            <Text style={styles.bigNumber}>67개월</Text>
            <TouchableOpacity style={styles.editBtn}>
              <Text style={styles.editBtnText}>수정</Text>
            </TouchableOpacity>
          </View>
          <Text style={[styles.cardLabel, { marginTop: 16 }]}>성별</Text>
          <View style={styles.genderRow}>
            <TouchableOpacity
              style={[styles.genderBtn, gender === 'female' && styles.genderBtnActive]}
              onPress={() => setGender('female')}
            >
              <Text style={[styles.genderBtnText, gender === 'female' && styles.genderBtnTextActive]}>👧 여아</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.genderBtn, gender === 'male' && styles.genderBtnActive]}
              onPress={() => setGender('male')}
            >
              <Text style={[styles.genderBtnText, gender === 'male' && styles.genderBtnTextActive]}>👦 남아</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Card 3: Physical Stats ───────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>신체 정보</Text>
          <View style={styles.statRow}>
            <View style={styles.statItem}>
              <Text style={styles.statIcon}>⚖️</Text>
              <Text style={styles.statValue}>8 kg</Text>
              <Text style={styles.statUnit}>체중</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statIcon}>📏</Text>
              <Text style={styles.statValue}>72 cm</Text>
              <Text style={styles.statUnit}>키</Text>
            </View>
          </View>
          {/* Slider placeholders */}
          <View style={styles.sliderWrap}>
            <Text style={styles.sliderLabel}>체중 조절</Text>
            <View style={styles.sliderTrack}>
              <View style={[styles.sliderFill, { width: '45%' }]} />
              <View style={styles.sliderThumb} />
            </View>
          </View>
          <View style={styles.sliderWrap}>
            <Text style={styles.sliderLabel}>키 조절</Text>
            <View style={styles.sliderTrack}>
              <View style={[styles.sliderFill, { width: '60%' }]} />
              <View style={styles.sliderThumb} />
            </View>
          </View>
        </View>

        {/* ── Card 4: Interest Categories ─────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>관심 카테고리</Text>
          <Text style={styles.cardSub}>관심 있는 항목을 모두 선택하세요</Text>
          <View style={styles.chipWrap}>
            {INTEREST_CHIPS.map((chip) => {
              const active = selectedChips.has(chip);
              return (
                <TouchableOpacity
                  key={chip}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => toggleChip(chip)}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{chip}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* ── Fixed Bottom CTA ─────────────────────────────────────────── */}
      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.ctaBtn} activeOpacity={0.85} onPress={() => navigation.goBack()}>
          <Text style={styles.ctaBtnText}>완료</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: '#f8fafc' },
  scroll: { paddingHorizontal: 16, paddingTop: 16 },

  // Cards
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 },
      android: { elevation: 2 },
    }),
  },
  cardHeader:  { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  cardTitle:   { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  cardLabel:   { fontSize: 13, fontWeight: '700', color: '#64748b', marginBottom: 6 },
  cardSub:     { fontSize: 12, color: '#94a3b8', marginTop: 2 },

  // Outline button (Card 1)
  outlineBtn:     { borderWidth: 1.5, borderColor: '#6366f1', borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginTop: 4 },
  outlineBtnText: { fontSize: 14, fontWeight: '700', color: '#6366f1' },

  // Age row
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bigNumber:  { fontSize: 36, fontWeight: '900', color: '#0f172a' },
  editBtn:    { backgroundColor: '#f1f5f9', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 14 },
  editBtnText:{ fontSize: 13, fontWeight: '600', color: '#475569' },

  // Gender
  genderRow:          { flexDirection: 'row', gap: 10, marginTop: 4 },
  genderBtn:          { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: '#e2e8f0', alignItems: 'center' },
  genderBtnActive:    { borderColor: '#3b82f6', backgroundColor: '#eff6ff' },
  genderBtnText:      { fontSize: 14, fontWeight: '600', color: '#94a3b8' },
  genderBtnTextActive:{ color: '#2563eb' },

  // Stats
  statRow:    { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 12 },
  statItem:   { alignItems: 'center' },
  statIcon:   { fontSize: 22, marginBottom: 4 },
  statValue:  { fontSize: 22, fontWeight: '900', color: '#0f172a' },
  statUnit:   { fontSize: 12, color: '#94a3b8', marginTop: 2 },
  statDivider:{ width: 1, backgroundColor: '#e2e8f0', alignSelf: 'stretch' },

  // Sliders
  sliderWrap:  { marginTop: 12 },
  sliderLabel: { fontSize: 12, color: '#64748b', marginBottom: 6 },
  sliderTrack: { height: 6, backgroundColor: '#e2e8f0', borderRadius: 3, position: 'relative' },
  sliderFill:  { height: 6, backgroundColor: '#3b82f6', borderRadius: 3 },
  sliderThumb: { position: 'absolute', top: -7, width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff', borderWidth: 2, borderColor: '#3b82f6', left: '43%',
    ...Platform.select({
      ios:     { shadowColor: '#3b82f6', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 3 },
      android: { elevation: 3 },
    }),
  },

  // Chips
  chipWrap:        { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  chip:            { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1.5, borderColor: '#e2e8f0', backgroundColor: '#f8fafc' },
  chipActive:      { borderColor: '#3b82f6', backgroundColor: '#eff6ff' },
  chipText:        { fontSize: 13, fontWeight: '600', color: '#94a3b8' },
  chipTextActive:  { color: '#2563eb' },

  // Bottom CTA
  bottomBar:  { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, paddingBottom: Platform.OS === 'ios' ? 32 : 16, backgroundColor: '#fff', borderTopWidth: 1, borderColor: '#f1f5f9' },
  ctaBtn:     { backgroundColor: '#3b82f6', paddingVertical: 16, borderRadius: 14, alignItems: 'center' },
  ctaBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
