import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  TextInput, Platform, LayoutAnimation, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import DateTimePicker from '@react-native-community/datetimepicker';
import { COLORS } from '../constants/theme';

// ─── Constants ────────────────────────────────────────────────────────────────

const TOTAL_STEPS = 3;
const NONE_CONCERN = '없음';

const BORN_CONCERNS = [
  '피부/기저귀', '수면/재우기', '수유/이유식', '발달/놀이',
  '안전/외출', '건강/면역', '교육/언어', '육아비용 절약', '기타', NONE_CONCERN,
];
const PREGNANT_CONCERNS = [
  '출산 준비물', '산모 건강/회복', '태아 발달/검사', '산후조리/도우미',
  '육아비용 절약', '기타', NONE_CONCERN,
];
const PLANNING_CONCERNS = [
  '임신 준비템(영양제)', '배란/건강관리', '임신 정보/팁', '육아비용 절약', '기타', NONE_CONCERN,
];

const PLANNING_PERIODS = ['6개월 이내', '1년 이내', '1~2년 후', '아직 미정'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmtDate = (d) => {
  if (!d) return null;
  const yr = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const dy = String(d.getDate()).padStart(2, '0');
  return `${yr}.${mo}.${dy}`;
};

// ─── Shared components ────────────────────────────────────────────────────────

function FieldLabel({ text }) {
  return <Text style={styles.fieldLabel}>{text}</Text>;
}

function SelectChip({ label, active, onPress, flex }) {
  return (
    <TouchableOpacity
      style={[styles.chip, active && styles.chipActive, flex && { flex: 1 }]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function DateButton({ value, onPress }) {
  return (
    <TouchableOpacity style={styles.dateBtn} onPress={onPress} activeOpacity={0.7}>
      <Text style={value ? styles.dateBtnFilled : styles.dateBtnPlaceholder}>
        {value ? fmtDate(value) : '날짜를 선택해 주세요'}
      </Text>
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function InitialOnboardingScreen() {
  const navigation = useNavigation();

  const [step,         setStep]         = useState(1);
  const [isAnalyzing,  setIsAnalyzing]  = useState(false);
  const [analysisText, setAnalysisText] = useState('소중한 데이터를 수집 중입니다...');
  const [progress,     setProgress]     = useState(0);

  // Step 1 — child status
  const [babyStatus,     setBabyStatus]     = useState(null);

  // Step 2 — basic info
  const [lastName,       setLastName]       = useState('');
  const [firstName,      setFirstName]      = useState('');
  const [gender,         setGender]         = useState(null);
  const [dob,            setDob]            = useState(null);
  const [showDobPicker,  setShowDobPicker]  = useState(false);
  const [taemyeong,      setTaemyeong]      = useState('');
  const [dueDate,        setDueDate]        = useState(null);
  const [showDuePicker,  setShowDuePicker]  = useState(false);
  const [planningPeriod, setPlanningPeriod] = useState(null);

  // Step 3 — interests (max 3, '없음' is exclusive)
  const [interests, setInterests] = useState([]);

  const currentConcerns = babyStatus === 'pregnant'
    ? PREGNANT_CONCERNS
    : babyStatus === 'planning'
      ? PLANNING_CONCERNS
      : BORN_CONCERNS;

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const animate = () =>
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

  const selectStatus = (val) => {
    animate();
    setBabyStatus(val);
    setLastName(''); setFirstName(''); setGender(null); setDob(null);
    setTaemyeong(''); setDueDate(null); setPlanningPeriod(null);
    setInterests([]);
  };

  const toggleInterest = (key) => {
    if (interests.includes(key)) {
      setInterests(interests.filter((v) => v !== key));
    } else if (key === NONE_CONCERN) {
      // Mutually exclusive: clear all others, select only '없음'
      setInterests([]);
    } else {
      const withoutNone = interests.filter((v) => v !== NONE_CONCERN);
      if (withoutNone.length >= 3) return;
      setInterests([...withoutNone, key]);
    }
  };

  const getDisplayName = () => {
    if (babyStatus === 'born')     return firstName.trim() || '우리 아이';
    if (babyStatus === 'pregnant') return taemyeong.trim() || '예비맘/대디';
    return '준비 중인 맘/대디';
  };

  // ── Validation ───────────────────────────────────────────────────────────────

  const step1Valid = !!babyStatus;

  const step2Valid = (() => {
    if (babyStatus === 'born')     return !!(lastName && firstName && gender && dob);
    if (babyStatus === 'pregnant') return !!dueDate;
    if (babyStatus === 'planning') return !!planningPeriod;
    return false;
  })();

  const step3Valid = interests.length > 0;

  const canProceed =
    (step === 1 && step1Valid) ||
    (step === 2 && step2Valid) ||
    (step === 3 && step3Valid);

  const progressPct = Math.round(((step - 1) / (TOTAL_STEPS - 1)) * 100);

  // ── Navigation ───────────────────────────────────────────────────────────────

  const handleNext = () => {
    animate();
    if (step < TOTAL_STEPS) {
      setStep(step + 1);
    } else {
      startAnalysis();
    }
  };

  const handlePrev = () => {
    animate();
    setStep(step - 1);
  };

  const startAnalysis = () => {
    animate();
    setIsAnalyzing(true);
    setProgress(0);
    setTimeout(() => { setAnalysisText('아이의 발달단계와 고민을 분석 중입니다...'); setProgress(40);  }, 800);
    setTimeout(() => { setAnalysisText('맞춤형 육아 큐레이션을 구성 중입니다...');   setProgress(75);  }, 1600);
    setTimeout(() => { setProgress(100); },                                                             2100);
    setTimeout(() => { navigation.navigate('홈'); },                                                    2400);
  };

  // ── Analysis loading ─────────────────────────────────────────────────────────

  if (isAnalyzing) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.analysisWrap}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.analysisTitle}>
            {`${getDisplayName()}을(를) 위해\n맞춤 큐레이션을 준비하고 있어요`}
          </Text>
          <Text style={styles.analysisSub}>{analysisText}</Text>
          <View style={styles.analysisTrack}>
            <View style={[styles.analysisFill, { width: `${progress}%` }]} />
          </View>
          <Text style={styles.analysisPercent}>{progress}%</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Progress bar */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
      </View>
      <Text style={styles.stepLabel}>{step} / {TOTAL_STEPS}</Text>

      <KeyboardAwareScrollView
        contentContainerStyle={styles.scroll}
        enableOnAndroid
        extraScrollHeight={20}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >

        {/* ══ STEP 1: Child Status ══ */}
        {step === 1 && (
          <View>
            <Text style={styles.sectionTitle}>{'지금 우리 아이는\n어떤 시기인가요?'}</Text>
            <Text style={styles.sectionSub}>아이 정보에 맞춰 맞춤 상품을 추천해 드릴게요.</Text>
            <View style={styles.statusCol}>
              {[
                { key: 'born',     label: '이미 태어났어요'     },
                { key: 'pregnant', label: '임신 중이에요'        },
                { key: 'planning', label: '임신을 계획 중이에요' },
              ].map((s) => (
                <TouchableOpacity
                  key={s.key}
                  style={[styles.statusBlock, babyStatus === s.key && styles.statusBlockActive]}
                  onPress={() => selectStatus(s.key)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.statusText, babyStatus === s.key && styles.statusTextActive]}>
                    {s.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* ══ STEP 2: Basic Info ══ */}
        {step === 2 && (
          <View>
            <Text style={styles.sectionTitle}>{'아이 기본 정보를\n알려주세요.'}</Text>
            <Text style={styles.sectionSub}>한 명의 아이 정보만 입력해 주세요.</Text>

            {/* born */}
            {babyStatus === 'born' && (
              <View>
                <View style={styles.fieldGroup}>
                  <FieldLabel text="이름" />
                  <View style={styles.nameRow}>
                    <TextInput
                      style={[styles.input, { flex: 1 }]}
                      placeholder="성"
                      placeholderTextColor="#9CA3AF"
                      value={lastName}
                      onChangeText={(v) => { animate(); setLastName(v); }}
                    />
                    <View style={{ width: 10 }} />
                    <TextInput
                      style={[styles.input, { flex: 2 }]}
                      placeholder="이름 (필수)"
                      placeholderTextColor="#9CA3AF"
                      value={firstName}
                      onChangeText={(v) => { animate(); setFirstName(v); }}
                    />
                  </View>
                </View>

                {lastName.trim() && firstName.trim() && (
                  <View style={styles.fieldGroup}>
                    <FieldLabel text="성별" />
                    <View style={styles.toggleRow}>
                      <SelectChip label="여아" active={gender === '여아'} onPress={() => { animate(); setGender('여아'); }} flex />
                      <SelectChip label="남아" active={gender === '남아'} onPress={() => { animate(); setGender('남아'); }} flex />
                    </View>
                  </View>
                )}

                {gender && (
                  <View style={styles.fieldGroup}>
                    <FieldLabel text="생년월일" />
                    <DateButton value={dob} onPress={() => setShowDobPicker(true)} />
                    {showDobPicker && (
                      <DateTimePicker
                        value={dob || new Date(2023, 0, 1)}
                        mode="date"
                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                        maximumDate={new Date()}
                        onChange={(e, date) => {
                          setShowDobPicker(Platform.OS === 'ios');
                          if (date) { animate(); setDob(date); }
                        }}
                      />
                    )}
                  </View>
                )}
              </View>
            )}

            {/* pregnant */}
            {babyStatus === 'pregnant' && (
              <View>
                <View style={styles.fieldGroup}>
                  <FieldLabel text="태명" />
                  <TextInput
                    style={styles.input}
                    placeholder="태명 (선택)"
                    placeholderTextColor="#9CA3AF"
                    value={taemyeong}
                    onChangeText={(v) => { animate(); setTaemyeong(v); }}
                  />
                </View>
                <View style={styles.fieldGroup}>
                  <FieldLabel text="출산 예정일" />
                  <DateButton value={dueDate} onPress={() => setShowDuePicker(true)} />
                  {showDuePicker && (
                    <DateTimePicker
                      value={dueDate || new Date()}
                      mode="date"
                      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                      minimumDate={new Date()}
                      onChange={(e, date) => {
                        setShowDuePicker(Platform.OS === 'ios');
                        if (date) { animate(); setDueDate(date); }
                      }}
                    />
                  )}
                </View>
              </View>
            )}

            {/* planning */}
            {babyStatus === 'planning' && (
              <View style={styles.fieldGroup}>
                <FieldLabel text="임신 계획 시기" />
                <View style={styles.chipWrap}>
                  {PLANNING_PERIODS.map((p) => (
                    <SelectChip
                      key={p}
                      label={p}
                      active={planningPeriod === p}
                      onPress={() => setPlanningPeriod(p)}
                    />
                  ))}
                </View>
              </View>
            )}
          </View>
        )}

        {/* ══ STEP 3: Interests ══ */}
        {step === 3 && (
          <View>
            <Text style={styles.sectionTitle}>{'관심 카테고리를\n선택해 주세요.'}</Text>
            <Text style={styles.sectionSub}>최대 3개 선택, 없다면 '없음' 선택</Text>
            <View style={styles.fieldGroup}>
              <View style={styles.concernGrid}>
                {currentConcerns.map((label) => {
                  const active = interests.includes(label);
                  const maxed  = !active && interests.filter((v) => v !== NONE_CONCERN).length >= 3 && label !== NONE_CONCERN;
                  return (
                    <TouchableOpacity
                      key={label}
                      style={[
                        styles.concernCard,
                        active && styles.concernCardActive,
                        maxed  && styles.concernCardDim,
                      ]}
                      onPress={() => !maxed && toggleInterest(label)}
                      activeOpacity={maxed ? 1 : 0.75}
                    >
                      <Text style={[
                        styles.concernText,
                        active && styles.concernTextActive,
                        maxed  && styles.concernTextDim,
                      ]}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {interests.filter((v) => v !== NONE_CONCERN).length === 3 && (
                <Text style={styles.maxNote}>최대 3개까지 선택할 수 있어요.</Text>
              )}
            </View>
          </View>
        )}

        <View style={{ height: 24 }} />
      </KeyboardAwareScrollView>

      {/* ── Bottom nav ── */}
      <View style={styles.bottomNav}>
        {step > 1 && (
          <TouchableOpacity style={styles.prevBtn} onPress={handlePrev} activeOpacity={0.7}>
            <Text style={styles.prevBtnText}>이전</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.nextBtn, !canProceed && styles.nextBtnDisabled]}
          onPress={canProceed ? handleNext : undefined}
          activeOpacity={0.85}
        >
          <Text style={styles.nextBtnText}>
            {step === TOTAL_STEPS ? '완료' : '다음'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: COLORS.background },
  scroll: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 32 },

  // Progress
  progressTrack: { height: 3, backgroundColor: COLORS.border },
  progressFill:  { height: 3, backgroundColor: COLORS.primary },
  stepLabel:     { fontSize: 12, fontWeight: '600', color: COLORS.textSub, textAlign: 'right', paddingHorizontal: 24, paddingTop: 8, paddingBottom: 4 },

  // Section header
  sectionTitle: { fontSize: 23, fontWeight: '800', color: COLORS.textMain, lineHeight: 31, marginBottom: 8, marginTop: 4 },
  sectionSub:   { fontSize: 14, color: COLORS.textSub, lineHeight: 20, marginBottom: 24 },

  // Fields
  fieldGroup: { marginBottom: 22 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: COLORS.textSub, marginBottom: 10 },

  // Input
  input: {
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 15, color: COLORS.textMain, backgroundColor: COLORS.white,
  },
  nameRow: { flexDirection: 'row' },

  // Status blocks
  statusCol:         { gap: 10 },
  statusBlock:       { paddingVertical: 18, paddingHorizontal: 18, borderRadius: 12, borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.white },
  statusBlockActive: { borderColor: COLORS.primary, backgroundColor: '#EFF6FF' },
  statusText:        { fontSize: 15, fontWeight: '600', color: COLORS.textSub, textAlign: 'center' },
  statusTextActive:  { color: COLORS.primary, fontWeight: '700' },

  // Toggle
  toggleRow: { flexDirection: 'row', gap: 12 },

  // Chips
  chipWrap:       { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip:           { paddingVertical: 10, paddingHorizontal: 18, borderRadius: 12, borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.white },
  chipActive:     { borderColor: COLORS.primary, backgroundColor: '#EFF6FF' },
  chipText:       { fontSize: 14, fontWeight: '600', color: COLORS.textSub },
  chipTextActive: { color: COLORS.primary },

  // Date button
  dateBtn: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 14, backgroundColor: COLORS.white,
  },
  dateBtnFilled:      { flex: 1, fontSize: 15, color: COLORS.textMain, fontWeight: '500' },
  dateBtnPlaceholder: { flex: 1, fontSize: 15, color: '#9CA3AF' },
  chevron:            { fontSize: 20, color: '#D1D5DB' },

  // Concern grid
  concernGrid:       { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  concernCard:       { width: '47%', paddingVertical: 16, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.white },
  concernCardActive: { borderColor: COLORS.primary, backgroundColor: '#EFF6FF' },
  concernCardDim:    { opacity: 0.4 },
  concernText:       { fontSize: 14, fontWeight: '600', color: COLORS.textSub },
  concernTextActive: { color: COLORS.primary },
  concernTextDim:    { color: '#9CA3AF' },
  maxNote:           { fontSize: 12, color: COLORS.primary, marginTop: 10, fontWeight: '500' },

  // Bottom nav
  bottomNav: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'ios' ? 24 : 16,
    paddingTop: 12,
    borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: COLORS.white,
  },
  prevBtn:         { paddingVertical: 16, paddingHorizontal: 20, borderRadius: 12, borderWidth: 1.5, borderColor: COLORS.border },
  prevBtnText:     { fontSize: 14, fontWeight: '600', color: COLORS.textSub },
  nextBtn:         {
    flex: 1, paddingVertical: 16, borderRadius: 12,
    backgroundColor: COLORS.primary, alignItems: 'center',
    ...Platform.select({
      ios:     { shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.28, shadowRadius: 8 },
      android: { elevation: 5 },
    }),
  },
  nextBtnDisabled: { backgroundColor: '#D1D5DB', ...Platform.select({ ios: { shadowOpacity: 0 }, android: { elevation: 0 } }) },
  nextBtnText:     { fontSize: 16, fontWeight: '800', color: COLORS.white },

  // Analysis
  analysisWrap:    { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  analysisTitle:   { fontSize: 22, fontWeight: '800', color: COLORS.textMain, textAlign: 'center', lineHeight: 30, marginTop: 30, marginBottom: 12 },
  analysisSub:     { fontSize: 14, color: COLORS.textSub, textAlign: 'center', lineHeight: 20, marginBottom: 40, minHeight: 20 },
  analysisTrack:   { width: '100%', height: 6, backgroundColor: COLORS.border, borderRadius: 3, overflow: 'hidden' },
  analysisFill:    { height: 6, backgroundColor: COLORS.primary, borderRadius: 3 },
  analysisPercent: { fontSize: 12, color: COLORS.textSub, marginTop: 8, fontWeight: '600' },
});
