import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  TextInput, Platform, LayoutAnimation,
  ActivityIndicator, Modal, FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import DateTimePicker from '@react-native-community/datetimepicker';

// ─── Design tokens ────────────────────────────────────────────────────────────
const ACCENT   = '#3B82F6';
const NAVY     = '#111827';
const GRAY     = '#6B7280';
const BORDER   = '#E5E7EB';
const LIGHT_BG = '#F9FAFB';

const TOTAL_STEPS = 5;

// ─── Data ─────────────────────────────────────────────────────────────────────
const REGIONS = [
  '서울', '경기', '인천', '부산', '대구', '광주', '대전',
  '울산', '세종', '강원', '충북', '충남', '전북', '전남',
  '경북', '경남', '제주',
];
const ENVIRONMENTS     = ['워킹맘', '전업맘', '조부모 양육', '한부모', '다자녀', '기타'];
const PLANNING_PERIODS = ['6개월 이내', '1년 이내', '1~2년 후', '아직 미정'];
const PET_TYPES        = ['강아지', '고양이', '기타'];
const NONE_CONCERN = '없음';

const BORN_CONCERNS = [
  '피부/기저귀', '수면/재우기', '수유/이유식', '발달/놀이',
  '안전/외출', '건강/면역', '교육/언어', '육아비용 절약', '기타', NONE_CONCERN,
];
const PREGNANT_CONCERNS = [
  '출산 준비물', '산모 건강/회복', '태아 발달/검사', '산후조리/도우미', '육아비용 절약', '기타', NONE_CONCERN,
];
const PLANNING_CONCERNS = [
  '임신 준비템(영양제)', '배란/건강관리', '임신 정보/팁', '육아비용 절약', '기타', NONE_CONCERN,
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
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

function LocationModal({ visible, onSelect, onClose }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>지역 선택</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.modalClose}>닫기</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={REGIONS}
            keyExtractor={(r) => r}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.modalItem}
                onPress={() => { onSelect(item); onClose(); }}
                activeOpacity={0.7}
              >
                <Text style={styles.modalItemText}>{item}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      </View>
    </Modal>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function InitialOnboardingScreen() {
  const navigation = useNavigation();

  // Navigation
  const [step,         setStep]         = useState(1);
  const [isAnalyzing,  setIsAnalyzing]  = useState(false);
  const [analysisText, setAnalysisText] = useState('소중한 데이터를 수집 중입니다...');
  const [progress,     setProgress]     = useState(0);

  // Step 2 — status
  const [babyStatus,     setBabyStatus]     = useState(null);
  const [lastName,       setLastName]       = useState('');
  const [firstName,      setFirstName]      = useState('');
  const [gender,         setGender]         = useState(null);
  const [dob,            setDob]            = useState(null);
  const [showDobPicker,  setShowDobPicker]  = useState(false);
  const [taemyeong,      setTaemyeong]      = useState('');
  const [dueDate,        setDueDate]        = useState(null);
  const [showDuePicker,  setShowDuePicker]  = useState(false);
  const [planningPeriod, setPlanningPeriod] = useState(null);

  // Step 3 — physical (born only)
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');

  // Step 4 — environment
  const [location,     setLocation]     = useState(null);
  const [showLocModal, setShowLocModal] = useState(false);
  const [environments, setEnvironments] = useState([]);
  const [hasPet,       setHasPet]       = useState(null);
  const [petTypes,     setPetTypes]     = useState([]);

  // Step 5 — concerns (max 3)
  const [concerns, setConcerns] = useState([]);

  // Derive concern options from babyStatus
  const currentConcerns = babyStatus === 'pregnant'
    ? PREGNANT_CONCERNS
    : babyStatus === 'planning'
      ? PLANNING_CONCERNS
      : BORN_CONCERNS;

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const animate = () =>
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

  const toggleArr = (arr, setArr, val) => {
    setArr(arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val]);
  };

  const toggleConcern = (key) => {
    if (concerns.includes(key)) {
      // Deselect
      setConcerns(concerns.filter((v) => v !== key));
    } else if (key === NONE_CONCERN) {
      // "None" is exclusive — clear everything else and select only this
      setConcerns([NONE_CONCERN]);
    } else {
      // Regular item: remove "None" if present, enforce max 3
      const withoutNone = concerns.filter((v) => v !== NONE_CONCERN);
      if (withoutNone.length >= 3) return;
      setConcerns([...withoutNone, key]);
    }
  };

  // Fallback display name based on onboarding status and entered name fields
  const getDisplayName = () => {
    if (babyStatus === 'born')     return firstName.trim() || '우리 아이';
    if (babyStatus === 'pregnant') return taemyeong.trim() || '예비맘/대디';
    return '준비 중인 맘/대디';
  };

  const selectStatus = (val) => {
    animate();
    setBabyStatus(val);
    setLastName(''); setFirstName(''); setGender(null); setDob(null);
    setTaemyeong(''); setDueDate(null); setPlanningPeriod(null);
    setConcerns([]);
  };

  // ── Step mapping: born adds a physical step ──────────────────────────────────
  // Logical steps: 1=Welcome, 2=Status, 3=Physical(born only), 4=Environment, 5=Concerns
  // For non-born, step 3 in UI = step 4 in display, step 4 in UI = step 5 in display
  // We keep raw step numbers and map display separately.
  const skipPhysical = babyStatus && babyStatus !== 'born';
  const effectiveTotal = skipPhysical ? TOTAL_STEPS - 1 : TOTAL_STEPS;

  const displayStep = (() => {
    if (skipPhysical && step >= 3) return step - 1;
    return step;
  })();

  const progressPct = Math.round(((displayStep - 1) / (effectiveTotal - 1)) * 100);

  // ── Validation ───────────────────────────────────────────────────────────────
  const step2Valid = (() => {
    if (!babyStatus) return false;
    if (babyStatus === 'born')     return !!(lastName && firstName && gender && dob);
    if (babyStatus === 'pregnant') return !!dueDate;
    if (babyStatus === 'planning') return !!planningPeriod;
    return false;
  })();

  const step3Valid = height.trim().length > 0 && weight.trim().length > 0;
  const isPetValid = hasPet === false || (hasPet === true && petTypes.length > 0);
  const step4Valid = !!location && isPetValid && (babyStatus === 'planning' || environments.length > 0);
  const step5Valid = concerns.length > 0;

  const canProceed =
    step === 1 ||
    (step === 2 && step2Valid) ||
    (step === 3 && step3Valid) ||
    (step === 4 && step4Valid) ||
    (step === 5 && step5Valid);

  // ── Navigation ───────────────────────────────────────────────────────────────
  const handleNext = () => {
    animate();
    if (step === 2 && skipPhysical) {
      setStep(4); // skip physical step
    } else if (step < TOTAL_STEPS) {
      setStep(step + 1);
    } else {
      startAnalysis();
    }
  };

  const handlePrev = () => {
    animate();
    if (step === 4 && skipPhysical) {
      setStep(2); // skip back over physical
    } else {
      setStep(step - 1);
    }
  };

  const startAnalysis = () => {
    animate();
    setIsAnalyzing(true);
    setProgress(0);
    setTimeout(() => { setAnalysisText('아이의 발달단계와 고민을 분석 중입니다...'); setProgress(40);  }, 800);
    setTimeout(() => { setAnalysisText('맞춤형 육아 큐레이션을 구성 중입니다...');   setProgress(75);  }, 1600);
    setTimeout(() => { setProgress(100); },                                                                2100);
    setTimeout(() => { navigation.navigate('홈'); },                                                       2400);
  };

  // ── Analysis loading ─────────────────────────────────────────────────────────
  if (isAnalyzing) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.analysisWrap}>
          <ActivityIndicator size="large" color={ACCENT} />
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
      {step > 1 && (
        <Text style={styles.stepLabel}>{displayStep - 1} / {effectiveTotal - 1}</Text>
      )}

      <KeyboardAwareScrollView
        contentContainerStyle={styles.scroll}
        enableOnAndroid
        extraScrollHeight={20}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ══════════ STEP 1: Welcome ══════════ */}
        {step === 1 && (
          <View style={styles.welcomeWrap}>
            <Text style={styles.welcomeTitle}>환영합니다.</Text>
            <Text style={styles.welcomeBody}>
              {'육아/생활 용품은 하루에도 여러 번 가격이 변경되고,\n인기 제품은 품절이 잦은 거 알고 계셨나요?\n\n세이브루가 아이(가족) 맞춤으로\n비용 절약을 도와드릴게요!'}
            </Text>
          </View>
        )}

        {/* ══════════ STEP 2: Status ══════════ */}
        {step === 2 && (
          <View>
            <Text style={styles.sectionTitle}>{'지금 우리 아이는\n어떤 시기인가요?'}</Text>
            <Text style={styles.sectionSub}>내 아이 정보에 맞춰 인기, 적합, 최저가 상품을 알려드릴게요.</Text>

            <View style={styles.fieldGroup}>
              <FieldLabel text="현재 상태" />
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

            {/* born fields */}
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
                      placeholder="이름"
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

            {/* pregnant fields */}
            {babyStatus === 'pregnant' && (
              <View>
                <View style={styles.fieldGroup}>
                  <FieldLabel text="태명 (선택)" />
                  <TextInput
                    style={styles.input}
                    placeholder="예: 햇살이"
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

            {/* planning fields */}
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

        {/* ══════════ STEP 3: Physical (born only) ══════════ */}
        {step === 3 && !skipPhysical && (
          <View>
            <Text style={styles.sectionTitle}>{'아이의 신체 정보를\n입력해 주세요.'}</Text>
            <View style={styles.fieldGroup}>
              <FieldLabel text="키 (cm)" />
              <TextInput
                style={styles.input}
                placeholder="예: 72"
                placeholderTextColor="#9CA3AF"
                value={height}
                onChangeText={setHeight}
                keyboardType="numeric"
              />
            </View>
            <View style={styles.fieldGroup}>
              <FieldLabel text="몸무게 (kg)" />
              <TextInput
                style={styles.input}
                placeholder="예: 8.5"
                placeholderTextColor="#9CA3AF"
                value={weight}
                onChangeText={setWeight}
                keyboardType="numeric"
              />
            </View>
          </View>
        )}

        {/* ══════════ STEP 4: Environment ══════════ */}
        {step === 4 && (
          <View>
            <Text style={styles.sectionTitle}>{'어떤 환경에서\n육아하고 계세요?'}</Text>
            <Text style={styles.sectionSub}>비슷한 환경의 엄마들이 선택한 제품을 추천해 드릴게요.</Text>

            <View style={styles.fieldGroup}>
              <FieldLabel text="거주 지역" />
              <TouchableOpacity
                style={styles.pickerBtn}
                onPress={() => setShowLocModal(true)}
                activeOpacity={0.7}
              >
                <Text style={location ? styles.pickerFilled : styles.pickerPlaceholder}>
                  {location || '지역을 선택해 주세요'}
                </Text>
                <Text style={styles.chevron}>›</Text>
              </TouchableOpacity>
              <LocationModal
                visible={showLocModal}
                onSelect={(r) => { animate(); setLocation(r); }}
                onClose={() => setShowLocModal(false)}
              />
            </View>

            {babyStatus !== 'planning' && (
              <View style={styles.fieldGroup}>
                <FieldLabel text="육아 환경 (중복 선택 가능)" />
                <View style={styles.chipWrap}>
                  {ENVIRONMENTS.map((env) => (
                    <SelectChip
                      key={env}
                      label={env}
                      active={environments.includes(env)}
                      onPress={() => toggleArr(environments, setEnvironments, env)}
                    />
                  ))}
                </View>
              </View>
            )}

            <View style={styles.fieldGroup}>
              <FieldLabel text="반려동물과 함께하시나요?" />
              <View style={styles.toggleRow}>
                <SelectChip label="네, 있어요" active={hasPet === true}  onPress={() => { animate(); setHasPet(true);  setPetTypes([]); }} flex />
                <SelectChip label="아니요"    active={hasPet === false} onPress={() => { animate(); setHasPet(false); setPetTypes([]); }} flex />
              </View>

              {hasPet === true && (
                <View style={{ marginTop: 14 }}>
                  <FieldLabel text="어떤 반려동물인가요?" />
                  <View style={styles.chipWrap}>
                    {PET_TYPES.map((pt) => (
                      <SelectChip
                        key={pt}
                        label={pt}
                        active={petTypes.includes(pt)}
                        onPress={() => toggleArr(petTypes, setPetTypes, pt)}
                      />
                    ))}
                  </View>
                </View>
              )}
            </View>
          </View>
        )}

        {/* ══════════ STEP 5: Concerns ══════════ */}
        {step === 5 && (
          <View>
            <Text style={styles.sectionTitle}>{'요즘 가장 신경 쓰이는 건\n무엇인가요?'}</Text>
            <Text style={styles.sectionSub}>관심 카테고리 (최대 3개 선택, 없다면 '없음' 선택)</Text>
            <View style={styles.fieldGroup}>
              <View style={styles.concernGrid}>
                {currentConcerns.map((label) => {
                  const active = concerns.includes(label);
                  const maxed  = !active && concerns.length >= 3;
                  return (
                    <TouchableOpacity
                      key={label}
                      style={[
                        styles.concernCard,
                        active && styles.concernCardActive,
                        maxed  && styles.concernCardDim,
                      ]}
                      onPress={() => toggleConcern(label)}
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
              {concerns.length === 3 && (
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
            {step === 5 ? '맞춤 추천 시작하기' : '다음'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: '#fff' },
  scroll: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 32 },

  // Progress
  progressTrack: { height: 3, backgroundColor: BORDER },
  progressFill:  { height: 3, backgroundColor: ACCENT },
  stepLabel:     { fontSize: 12, fontWeight: '600', color: GRAY, textAlign: 'right', paddingHorizontal: 24, paddingTop: 8, paddingBottom: 4 },

  // Welcome
  welcomeWrap: { flex: 1, paddingTop: 60 },
  welcomeTitle: { fontSize: 32, fontWeight: '900', color: NAVY, marginBottom: 24 },
  welcomeBody:  { fontSize: 16, color: GRAY, lineHeight: 26 },

  // Section header
  sectionTitle: { fontSize: 23, fontWeight: '800', color: NAVY, lineHeight: 31, marginBottom: 8, marginTop: 4 },
  sectionSub:   { fontSize: 14, color: GRAY, lineHeight: 20, marginBottom: 24 },

  // Fields
  fieldGroup: { marginBottom: 22 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: GRAY, marginBottom: 10 },

  // Input
  input: {
    borderWidth: 1, borderColor: BORDER, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 15, color: NAVY, backgroundColor: '#fff',
  },
  nameRow: { flexDirection: 'row' },

  // Status blocks
  statusCol:         { gap: 10 },
  statusBlock:       { paddingVertical: 16, paddingHorizontal: 18, borderRadius: 12, borderWidth: 1.5, borderColor: BORDER, backgroundColor: LIGHT_BG },
  statusBlockActive: { borderColor: ACCENT, backgroundColor: '#EFF6FF' },
  statusText:        { fontSize: 15, fontWeight: '600', color: GRAY, textAlign: 'center' },
  statusTextActive:  { color: ACCENT, fontWeight: '700' },

  // Toggle
  toggleRow: { flexDirection: 'row', gap: 12 },

  // Chips
  chipWrap:       { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip:           { paddingVertical: 10, paddingHorizontal: 18, borderRadius: 12, borderWidth: 1.5, borderColor: BORDER, backgroundColor: LIGHT_BG },
  chipActive:     { borderColor: ACCENT, backgroundColor: '#EFF6FF' },
  chipText:       { fontSize: 14, fontWeight: '600', color: GRAY },
  chipTextActive: { color: ACCENT },

  // Date button
  dateBtn: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: BORDER, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 14, backgroundColor: LIGHT_BG,
  },
  dateBtnFilled:      { flex: 1, fontSize: 15, color: NAVY, fontWeight: '500' },
  dateBtnPlaceholder: { flex: 1, fontSize: 15, color: '#9CA3AF' },
  chevron:            { fontSize: 20, color: '#D1D5DB' },

  // Picker button
  pickerBtn: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: BORDER, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 14, backgroundColor: LIGHT_BG,
  },
  pickerFilled:      { flex: 1, fontSize: 15, color: NAVY, fontWeight: '500' },
  pickerPlaceholder: { flex: 1, fontSize: 15, color: '#9CA3AF' },

  // Location modal
  modalOverlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalSheet:    { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '60%' },
  modalHeader:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 18, borderBottomWidth: 1, borderColor: BORDER },
  modalTitle:    { fontSize: 16, fontWeight: '700', color: NAVY },
  modalClose:    { fontSize: 14, fontWeight: '600', color: GRAY },
  modalItem:     { paddingVertical: 16, paddingHorizontal: 20, borderBottomWidth: 1, borderColor: '#F3F4F6' },
  modalItemText: { fontSize: 15, color: NAVY },

  // Concern grid
  concernGrid:       { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  concernCard:       { width: '47%', paddingVertical: 16, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1.5, borderColor: BORDER, backgroundColor: LIGHT_BG },
  concernCardActive: { borderColor: ACCENT, backgroundColor: '#EFF6FF' },
  concernCardDim:    { opacity: 0.4 },
  concernText:       { fontSize: 14, fontWeight: '600', color: GRAY },
  concernTextActive: { color: ACCENT },
  concernTextDim:    { color: '#9CA3AF' },
  maxNote:           { fontSize: 12, color: ACCENT, marginTop: 10, fontWeight: '500' },

  // Bottom nav
  bottomNav: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'ios' ? 24 : 16,
    paddingTop: 12,
    borderTopWidth: 1, borderTopColor: BORDER, backgroundColor: '#fff',
  },
  prevBtn:         { paddingVertical: 16, paddingHorizontal: 20, borderRadius: 12, borderWidth: 1.5, borderColor: BORDER },
  prevBtnText:     { fontSize: 14, fontWeight: '600', color: GRAY },
  nextBtn:         {
    flex: 1, paddingVertical: 16, borderRadius: 12,
    backgroundColor: ACCENT, alignItems: 'center',
    ...Platform.select({
      ios:     { shadowColor: ACCENT, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.28, shadowRadius: 8 },
      android: { elevation: 5 },
    }),
  },
  nextBtnDisabled: { backgroundColor: '#D1D5DB', ...Platform.select({ ios: { shadowOpacity: 0 }, android: { elevation: 0 } }) },
  nextBtnText:     { fontSize: 16, fontWeight: '800', color: '#fff' },

  // Analysis
  analysisWrap:    { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  analysisTitle:   { fontSize: 22, fontWeight: '800', color: NAVY, textAlign: 'center', lineHeight: 30, marginTop: 30, marginBottom: 12 },
  analysisSub:     { fontSize: 14, color: GRAY, textAlign: 'center', lineHeight: 20, marginBottom: 40, minHeight: 20 },
  analysisTrack:   { width: '100%', height: 6, backgroundColor: BORDER, borderRadius: 3, overflow: 'hidden' },
  analysisFill:    { height: 6, backgroundColor: ACCENT, borderRadius: 3 },
  analysisPercent: { fontSize: 12, color: GRAY, marginTop: 8, fontWeight: '600' },
});
