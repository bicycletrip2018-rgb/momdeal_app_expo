import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { auth } from '../firebase/config';
import { createChild } from '../services/firestore/childrenRepository';
import { updateSelectedChild } from '../services/firestore/userRepository';

// ─── Constants ────────────────────────────────────────────────────────────────

const TOTAL_STEPS = 4;

const PICKER_ITEM_H = 44;
const PICKER_VISIBLE = 5;

const REGIONS = [
  '서울', '경기', '인천', '부산', '대구', '광주', '대전', '울산',
  '세종', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주',
];

const PARENTING_ENV_OPTIONS = ['워킹맘', '전업맘', '조부모 양육', '한부모', '다자녀'];

const CONCERN_OPTIONS = [
  { label: '피부/기저귀',        emoji: '🧴' },
  { label: '수면/재우기',        emoji: '😴' },
  { label: '수유/이유식',        emoji: '🍼' },
  { label: '발달/놀이',          emoji: '🧸' },
  { label: '안전/외출',          emoji: '🚗' },
  { label: '아토피/피부트러블',   emoji: '🌸' },
  { label: '민감성 피부',         emoji: '🫧' },
  { label: '태열',               emoji: '🌡' },
  { label: '소화불량',            emoji: '🤱' },
  { label: '알레르기',            emoji: '⚠️' },
  { label: '언어발달',            emoji: '💬' },
  { label: '훈육/떼쓰기',         emoji: '🧩' },
  { label: '기타 (직접 입력)',     emoji: '✏️' },
];

const STEP_COPY = {
  1: {
    heading: '우리 아이 이야기부터\n들려주세요 🧡',
    sub: '작은 정보 하나로도 아이에게 꼭 맞는\n제품을 찾아드릴게요.',
  },
  2: {
    heading: '지금 우리 아이는\n어떤 시기인가요?',
    sub: '아이의 월령에 따라 필요한 제품은 완전히 달라요.\n지금 시기에 딱 맞는 선택만 골라드릴게요.',
  },
  3: {
    heading: '어떤 환경에서\n육아하고 계세요?',
    sub: '비슷한 환경의 엄마들이 선택한 제품을\n우선적으로 추천해 드릴게요.',
  },
  4: {
    heading: '요즘 가장 신경 쓰이는 건\n무엇인가요?',
    sub: '비슷한 고민을 가진 엄마들이 실제로 선택한\n제품만 모아서 보여드릴게요.\n혼자 고민하지 않으셔도 괜찮아요.',
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatDateDisplay = (date) => {
  if (!date) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}년 ${Number(m)}월 ${Number(d)}일`;
};

// ─── ScrollPickerColumn ───────────────────────────────────────────────────────

function ScrollPickerColumn({ data, selectedIndex, onIndexChange, width }) {
  const scrollRef = useRef(null);
  const isScrolling = useRef(false);
  const prevIndexRef = useRef(selectedIndex);

  useEffect(() => {
    const t = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: selectedIndex * PICKER_ITEM_H, animated: false });
    }, 120);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isScrolling.current && prevIndexRef.current !== selectedIndex) {
      prevIndexRef.current = selectedIndex;
      scrollRef.current?.scrollTo({ y: selectedIndex * PICKER_ITEM_H, animated: true });
    }
  }, [selectedIndex]);

  const handleMomentumScrollEnd = useCallback(
    (e) => {
      isScrolling.current = false;
      const idx = Math.round(e.nativeEvent.contentOffset.y / PICKER_ITEM_H);
      const clamped = Math.max(0, Math.min(idx, data.length - 1));
      prevIndexRef.current = clamped;
      onIndexChange(clamped);
    },
    [data.length, onIndexChange]
  );

  return (
    <View style={{ width, height: PICKER_ITEM_H * PICKER_VISIBLE, position: 'relative' }}>
      <View
        style={{
          position: 'absolute',
          top: PICKER_ITEM_H * 2, left: 4, right: 4,
          height: PICKER_ITEM_H,
          backgroundColor: '#fdf2f8',
          borderRadius: 8, borderWidth: 1, borderColor: '#f9a8d4',
          zIndex: 0,
        }}
        pointerEvents="none"
      />
      <ScrollView
        ref={scrollRef}
        snapToInterval={PICKER_ITEM_H}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        onScrollBeginDrag={() => { isScrolling.current = true; }}
        onMomentumScrollEnd={handleMomentumScrollEnd}
      >
        <View style={{ height: PICKER_ITEM_H * 2 }} />
        {data.map((item, i) => {
          const isSelected = i === selectedIndex;
          return (
            <View
              key={item.value}
              style={{ height: PICKER_ITEM_H, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text
                style={
                  isSelected
                    ? { fontSize: 18, fontWeight: '800', color: '#db2777' }
                    : { fontSize: 15, fontWeight: '500', color: '#94a3b8' }
                }
              >
                {item.label}
              </Text>
            </View>
          );
        })}
        <View style={{ height: PICKER_ITEM_H * 2 }} />
      </ScrollView>
    </View>
  );
}

// ─── DatePickerModal ──────────────────────────────────────────────────────────

function DatePickerModal({ visible, initialDate, onConfirm, onCancel }) {
  const NOW = new Date();

  const years = useMemo(() => {
    const list = [];
    for (let y = 2013; y <= NOW.getFullYear(); y++) list.push({ value: y, label: `${y}년` });
    return list;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const months = useMemo(
    () => Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: `${i + 1}월` })),
    []
  );

  const initYear  = initialDate ? initialDate.getFullYear() : NOW.getFullYear() - 1;
  const initMonth = initialDate ? initialDate.getMonth()    : 0;
  const initDay   = initialDate ? initialDate.getDate() - 1 : 0;

  const [yearIdx,  setYearIdx]  = useState(() => Math.max(0, years.findIndex((y) => y.value === initYear)));
  const [monthIdx, setMonthIdx] = useState(initMonth);
  const [dayIdx,   setDayIdx]   = useState(initDay);

  const selectedYear     = years[yearIdx]?.value ?? NOW.getFullYear();
  const selectedMonthNum = monthIdx + 1;

  const daysInMonth = useMemo(
    () => new Date(selectedYear, selectedMonthNum, 0).getDate(),
    [selectedYear, selectedMonthNum]
  );

  const days = useMemo(
    () => Array.from({ length: daysInMonth }, (_, i) => ({ value: i + 1, label: `${i + 1}일` })),
    [daysInMonth]
  );

  const clampedDayIdx = Math.min(dayIdx, days.length - 1);

  useEffect(() => {
    if (dayIdx >= daysInMonth) setDayIdx(daysInMonth - 1);
  }, [daysInMonth, dayIdx]);

  const handleConfirm = () => {
    const date = new Date(selectedYear, monthIdx, clampedDayIdx + 1);
    onConfirm(date);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <TouchableWithoutFeedback onPress={onCancel}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }} />
      </TouchableWithoutFeedback>
      <View style={styles.pickerSheet}>
        <View style={styles.pickerHandle} />
        <View style={styles.pickerHeader}>
          <TouchableOpacity onPress={onCancel} style={{ padding: 4 }}>
            <Text style={styles.pickerCancelText}>취소</Text>
          </TouchableOpacity>
          <Text style={styles.pickerTitle}>생년월일</Text>
          <TouchableOpacity onPress={handleConfirm} style={{ padding: 4 }}>
            <Text style={styles.pickerConfirmText}>확인</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.pickerColumns}>
          <ScrollPickerColumn data={years}  selectedIndex={yearIdx}        onIndexChange={setYearIdx}  width={110} />
          <ScrollPickerColumn data={months} selectedIndex={monthIdx}       onIndexChange={setMonthIdx} width={80} />
          <ScrollPickerColumn
            key={`days-${daysInMonth}`}
            data={days}
            selectedIndex={clampedDayIdx}
            onIndexChange={setDayIdx}
            width={80}
          />
        </View>
      </View>
    </Modal>
  );
}

// ─── RegionPickerModal ────────────────────────────────────────────────────────

function RegionPickerModal({ visible, selected, onSelect, onClose }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }} />
      </TouchableWithoutFeedback>
      <View style={styles.pickerSheet}>
        <View style={styles.pickerHandle} />
        <View style={styles.pickerHeader}>
          <View style={{ width: 48 }} />
          <Text style={styles.pickerTitle}>사는 곳</Text>
          <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
            <Text style={styles.pickerCancelText}>닫기</Text>
          </TouchableOpacity>
        </View>
        <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
          {REGIONS.map((r) => (
            <TouchableOpacity
              key={r}
              style={[styles.regionItem, selected === r && styles.regionItemActive]}
              onPress={() => { onSelect(r); onClose(); }}
              activeOpacity={0.7}
            >
              <Text style={[styles.regionItemText, selected === r && styles.regionItemTextActive]}>
                {r}
              </Text>
              {selected === r && <Text style={{ fontSize: 16, color: '#db2777' }}>✓</Text>}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── ProgressBar ──────────────────────────────────────────────────────────────

function ProgressBar({ step }) {
  return (
    <View style={styles.progressWrap}>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${(step / TOTAL_STEPS) * 100}%` }]} />
      </View>
      <Text style={styles.progressLabel}>{step} / {TOTAL_STEPS}</Text>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function OnboardingScreen({ navigation, onComplete, onSkip }) {
  const [step, setStep] = useState(1);

  // Step 1 — name + gender
  const [name,   setName]   = useState('');
  const [gender, setGender] = useState('female');

  // Step 2 — type + date + measurements
  const [type,          setType]          = useState('child');
  const [birthDate,     setBirthDate]     = useState(null);
  const [pregnancyWeek, setPregnancyWeek] = useState('');
  const [height,        setHeight]        = useState('');
  const [weight,        setWeight]        = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Step 3 — parenting environment + region
  const [parentingEnv,     setParentingEnv]     = useState([]);
  const [region,           setRegion]           = useState('');
  const [showRegionPicker, setShowRegionPicker] = useState(false);

  // Step 4 — concerns
  const [concerns,     setConcerns]     = useState([]);
  const [concernNote,  setConcernNote]  = useState('');

  const [saving, setSaving] = useState(false);

  const hasCustomConcern = concerns.includes('기타 (직접 입력)');

  const toggleConcern = (label) =>
    setConcerns((prev) =>
      prev.includes(label) ? prev.filter((c) => c !== label) : [...prev, label]
    );

  const toggleParentingEnv = (opt) =>
    setParentingEnv((prev) =>
      prev.includes(opt) ? prev.filter((e) => e !== opt) : [...prev, opt]
    );

  const handleSkip = () => {
    if (onSkip) { onSkip(); return; }
    navigation?.replace?.('Main');
  };

  const handleBack = () => setStep((s) => s - 1);

  const handleNext = () => {
    if (step === 1) {
      if (!name.trim()) {
        Alert.alert('안내', '아이 이름 또는 별명을 입력해 주세요.');
        return;
      }
      setStep(2);
      return;
    }
    if (step === 2) {
      if (type === 'child' && !birthDate) {
        Alert.alert('안내', '생년월일을 선택해 주세요.');
        return;
      }
      if (type === 'pregnancy' && !pregnancyWeek.trim()) {
        Alert.alert('안내', '임신 주차를 입력해 주세요.');
        return;
      }
      setStep(3);
      return;
    }
    if (step === 3) {
      setStep(4);
    }
  };

  const handleComplete = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) { handleSkip(); return; }

    setSaving(true);
    try {
      const result = await createChild({
        userId: uid,
        name: name.trim(),
        gender,
        type,
        birthDate:     type === 'child'     ? birthDate : null,
        pregnancyWeek: type === 'pregnancy' ? Number(pregnancyWeek) : null,
        dueDate:       null,
        birthOrder:    null,
        feedingType:   'unknown',
        height:        height.trim()  ? Number(height)  : null,
        weight:        weight.trim()  ? Number(weight)  : null,
        region:        region.trim(),
        parentingEnv,
        concerns,
        concernNote:   concernNote.trim(),
      });

      if (result?.id) {
        await updateSelectedChild(uid, result.id).catch(() => {});
      }

      if (onComplete) { onComplete(); return; }
      navigation?.replace?.('Main');
    } catch (error) {
      console.log('OnboardingScreen createChild error:', error);
      Alert.alert('오류', '정보 저장에 실패했습니다. 다시 시도해 주세요.');
    } finally {
      setSaving(false);
    }
  };

  const { heading, sub } = STEP_COPY[step];

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Top bar */}
        <View style={styles.topBar}>
          <ProgressBar step={step} />
          <TouchableOpacity
            onPress={handleSkip}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={styles.skipText}>나중에 하기</Text>
          </TouchableOpacity>
        </View>

        {/* Scrollable content */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.heading}>{heading}</Text>
          <Text style={styles.sub}>{sub}</Text>

          {/* ── Step 1: Name + Gender ── */}
          {step === 1 && (
            <View style={styles.stepContent}>
              <View>
                <Text style={styles.label}>아이 이름 / 별명</Text>
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                  placeholder="예: 하준이, 우리 공주"
                  placeholderTextColor="#aaa"
                  autoFocus
                  returnKeyType="next"
                />
              </View>

              <View>
                <Text style={styles.label}>성별</Text>
                <View style={styles.genderRow}>
                  {[
                    { val: 'female', label: '👧', name: '여아', activeBg: '#fdf2f8', activeBorder: '#f472b6', activeText: '#db2777' },
                    { val: 'male',   label: '👦', name: '남아', activeBg: '#eff6ff', activeBorder: '#60a5fa', activeText: '#2563eb' },
                  ].map((g) => (
                    <TouchableOpacity
                      key={g.val}
                      style={[
                        styles.genderBtn,
                        gender === g.val && { backgroundColor: g.activeBg, borderColor: g.activeBorder },
                      ]}
                      onPress={() => setGender(g.val)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.genderEmoji}>{g.label}</Text>
                      <Text style={[styles.genderText, gender === g.val && { color: g.activeText }]}>
                        {g.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>
          )}

          {/* ── Step 2: Type + Birthdate + Measurements ── */}
          {step === 2 && (
            <View style={styles.stepContent}>
              {/* Child / Pregnancy toggle */}
              <View style={styles.typeRow}>
                {[
                  { val: 'child',     label: '👶 아이' },
                  { val: 'pregnancy', label: '🤰 출산 예정 (태아)' },
                ].map((t) => (
                  <TouchableOpacity
                    key={t.val}
                    style={[styles.typeBtn, type === t.val && styles.typeBtnActive]}
                    onPress={() => setType(t.val)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.typeBtnText, type === t.val && styles.typeBtnTextActive]}>
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {type === 'child' ? (
                <>
                  {/* Date picker trigger */}
                  <View>
                    <Text style={styles.label}>생년월일 <Text style={styles.required}>*</Text></Text>
                    <TouchableOpacity
                      style={styles.datePickerTrigger}
                      onPress={() => setShowDatePicker(true)}
                      activeOpacity={0.8}
                    >
                      <Text style={birthDate ? styles.datePickerValue : styles.datePickerPlaceholder}>
                        {birthDate ? formatDateDisplay(birthDate) : '날짜를 선택해 주세요'}
                      </Text>
                      <Text style={styles.datePickerIcon}>📅</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Height + Weight */}
                  <View>
                    <Text style={styles.label}>
                      신체 정보 <Text style={styles.optionalTag}>(선택)</Text>
                    </Text>
                    <View style={styles.measureRow}>
                      <View style={{ flex: 1 }}>
                        <TextInput
                          style={styles.input}
                          value={height}
                          onChangeText={setHeight}
                          keyboardType="decimal-pad"
                          placeholder="키 (cm)  예: 66.5"
                          placeholderTextColor="#aaa"
                        />
                      </View>
                      <View style={{ width: 12 }} />
                      <View style={{ flex: 1 }}>
                        <TextInput
                          style={styles.input}
                          value={weight}
                          onChangeText={setWeight}
                          keyboardType="decimal-pad"
                          placeholder="몸무게 (kg)  예: 7.2"
                          placeholderTextColor="#aaa"
                        />
                      </View>
                    </View>
                  </View>
                </>
              ) : (
                <View>
                  <Text style={styles.label}>임신 주차 <Text style={styles.required}>*</Text></Text>
                  <TextInput
                    style={styles.input}
                    value={pregnancyWeek}
                    onChangeText={setPregnancyWeek}
                    placeholder="예: 28"
                    placeholderTextColor="#aaa"
                    keyboardType="number-pad"
                    autoFocus
                  />
                </View>
              )}
            </View>
          )}

          {/* ── Step 3: Parenting Environment + Region ── */}
          {step === 3 && (
            <View style={styles.stepContent}>
              {/* Parenting environment chips */}
              <View>
                <Text style={styles.label}>
                  양육 환경 <Text style={styles.optionalTag}>(복수 선택 가능)</Text>
                </Text>
                <View style={styles.chipWrap}>
                  {PARENTING_ENV_OPTIONS.map((opt) => {
                    const active = parentingEnv.includes(opt);
                    return (
                      <TouchableOpacity
                        key={opt}
                        style={[styles.chip, active && styles.chipActive]}
                        onPress={() => toggleParentingEnv(opt)}
                        activeOpacity={0.85}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Region */}
              <View>
                <Text style={styles.label}>
                  사는 곳 <Text style={styles.optionalTag}>(선택)</Text>
                </Text>
                <TouchableOpacity
                  style={styles.datePickerTrigger}
                  onPress={() => setShowRegionPicker(true)}
                  activeOpacity={0.8}
                >
                  <Text style={region ? styles.datePickerValue : styles.datePickerPlaceholder}>
                    {region || '지역을 선택해 주세요'}
                  </Text>
                  <Text style={{ fontSize: 14, color: '#94a3b8' }}>›</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* ── Step 4: Concerns ── */}
          {step === 4 && (
            <View style={styles.stepContent}>
              <View style={styles.concernGrid}>
                {CONCERN_OPTIONS.map((opt) => {
                  const selected = concerns.includes(opt.label);
                  return (
                    <TouchableOpacity
                      key={opt.label}
                      style={[styles.concernCard, selected && styles.concernCardActive]}
                      onPress={() => toggleConcern(opt.label)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.concernEmoji}>{opt.emoji}</Text>
                      <Text style={[styles.concernLabel, selected && styles.concernLabelActive]}>
                        {opt.label}
                      </Text>
                      {selected ? <Text style={styles.concernCheck}>✓</Text> : null}
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* 기타 text input — shown only when "기타 (직접 입력)" chip is selected */}
              {hasCustomConcern && (
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={concernNote}
                  onChangeText={setConcernNote}
                  placeholder="구체적인 고민이나 특이사항을 자유롭게 적어주세요"
                  placeholderTextColor="#aaa"
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                  autoFocus
                />
              )}

              <Text style={styles.concernHint}>
                {concerns.length === 0
                  ? '선택하지 않아도 괜찮아요 😊'
                  : `${concerns.filter((c) => c !== '기타 (직접 입력)').length + (hasCustomConcern ? 1 : 0)}개 선택됨`}
              </Text>
            </View>
          )}
        </ScrollView>

        {/* Bottom action bar */}
        <View style={styles.bottomBar}>
          {step > 1 ? (
            <TouchableOpacity style={styles.backBtn} onPress={handleBack} activeOpacity={0.7}>
              <Text style={styles.backBtnText}>← 이전</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={[styles.nextBtn, saving && styles.nextBtnDisabled]}
            onPress={step < TOTAL_STEPS ? handleNext : handleComplete}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.nextBtnText}>
                {step < TOTAL_STEPS ? '다음  →' : '맞춤 추천 시작하기 🎉'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* ── Modals (outside KeyboardAvoidingView to avoid layout shift) ── */}
      <DatePickerModal
        visible={showDatePicker}
        initialDate={birthDate}
        onConfirm={(date) => { setBirthDate(date); setShowDatePicker(false); }}
        onCancel={() => setShowDatePicker(false)}
      />
      <RegionPickerModal
        visible={showRegionPicker}
        selected={region}
        onSelect={setRegion}
        onClose={() => setShowRegionPicker(false)}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },

  // Top bar
  topBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8, gap: 12,
  },
  progressWrap:  { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  progressTrack: { flex: 1, height: 4, borderRadius: 2, backgroundColor: '#f1f5f9' },
  progressFill:  { height: 4, borderRadius: 2, backgroundColor: '#f472b6' },
  progressLabel: { fontSize: 12, color: '#94a3b8', fontWeight: '600', minWidth: 32 },
  skipText:      { fontSize: 14, color: '#94a3b8', fontWeight: '600' },

  // Scroll
  scrollContent: { paddingHorizontal: 24, paddingTop: 28, paddingBottom: 40 },
  heading: { fontSize: 30, fontWeight: '900', color: '#0f172a', lineHeight: 40, marginBottom: 10 },
  sub:     { fontSize: 15, color: '#64748b', lineHeight: 22, marginBottom: 36 },

  // Step content wrapper
  stepContent: { gap: 24 },

  // Labels
  label:       { fontSize: 15, fontWeight: '700', color: '#334155', marginBottom: 8 },
  required:    { color: '#ef4444', fontSize: 13 },
  optionalTag: { fontSize: 13, fontWeight: '500', color: '#94a3b8' },

  // Text inputs
  input: {
    backgroundColor: '#f8fafc', borderRadius: 14,
    borderWidth: 1.5, borderColor: '#e2e8f0',
    paddingHorizontal: 16, paddingVertical: 15,
    fontSize: 16, color: '#0f172a',
  },
  textArea: { minHeight: 84, paddingTop: 12 },

  // Step 1: Gender
  genderRow: { flexDirection: 'row', gap: 14 },
  genderBtn: {
    flex: 1, paddingVertical: 22, alignItems: 'center', gap: 6,
    borderRadius: 18, borderWidth: 2, borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  genderEmoji: { fontSize: 32 },
  genderText:  { fontSize: 16, fontWeight: '700', color: '#475569' },

  // Step 2: Type toggle
  typeRow:           { flexDirection: 'row', gap: 10 },
  typeBtn:           { flex: 1, paddingVertical: 14, alignItems: 'center', borderRadius: 14, borderWidth: 1.5, borderColor: '#e2e8f0', backgroundColor: '#f8fafc' },
  typeBtnActive:     { borderColor: '#f472b6', backgroundColor: '#fdf2f8' },
  typeBtnText:       { fontSize: 14, fontWeight: '600', color: '#475569' },
  typeBtnTextActive: { color: '#db2777', fontWeight: '700' },

  // Step 2: Date picker trigger
  datePickerTrigger: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#f8fafc', borderWidth: 1.5, borderColor: '#e2e8f0',
    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 15,
  },
  datePickerValue:       { fontSize: 16, color: '#0f172a', fontWeight: '600' },
  datePickerPlaceholder: { fontSize: 16, color: '#aaa' },
  datePickerIcon:        { fontSize: 20 },

  // Step 2: Measurements row
  measureRow: { flexDirection: 'row' },

  // Step 3: Chips
  chipWrap:     { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip:         { borderWidth: 1.5, borderColor: '#cbd5e1', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9, backgroundColor: '#fff' },
  chipActive:   { borderColor: '#f472b6', backgroundColor: '#fdf2f8' },
  chipText:     { color: '#334155', fontWeight: '600', fontSize: 14 },
  chipTextActive: { color: '#db2777' },

  // Step 4: Concerns grid
  concernGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  concernCard: {
    width: '30%', paddingVertical: 18, alignItems: 'center', gap: 7,
    borderRadius: 16, borderWidth: 1.5, borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc', position: 'relative',
  },
  concernCardActive:  { borderColor: '#f472b6', backgroundColor: '#fdf2f8' },
  concernEmoji:       { fontSize: 26 },
  concernLabel:       { fontSize: 11, fontWeight: '600', color: '#475569', textAlign: 'center' },
  concernLabelActive: { color: '#db2777' },
  concernCheck: {
    position: 'absolute', top: 6, right: 8,
    fontSize: 12, color: '#f472b6', fontWeight: '800',
  },
  concernHint: { fontSize: 14, color: '#94a3b8', textAlign: 'center', marginTop: 4 },

  // Bottom bar
  bottomBar: {
    flexDirection: 'row', gap: 10,
    paddingHorizontal: 20, paddingVertical: 16,
    borderTopWidth: 1, borderTopColor: '#f1f5f9',
    backgroundColor: '#fff',
  },
  backBtn:         { paddingHorizontal: 18, paddingVertical: 16, borderRadius: 14, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
  backBtnText:     { fontSize: 15, fontWeight: '600', color: '#475569' },
  nextBtn:         { flex: 1, paddingVertical: 16, alignItems: 'center', borderRadius: 14, backgroundColor: '#f472b6', shadowColor: '#f472b6', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  nextBtnDisabled: { backgroundColor: '#fbb6ce', shadowOpacity: 0 },
  nextBtnText:     { fontSize: 16, fontWeight: '800', color: '#fff' },

  // Picker sheet (bottom sheet for date + region)
  pickerSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 32,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.1, shadowRadius: 12 },
      android: { elevation: 16 },
    }),
  },
  pickerHandle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: '#cbd5e1', marginBottom: 8 },
  pickerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  pickerTitle:       { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  pickerCancelText:  { fontSize: 15, color: '#94a3b8' },
  pickerConfirmText: { fontSize: 15, color: '#db2777', fontWeight: '700' },
  pickerColumns:     { flexDirection: 'row', justifyContent: 'center' },

  // Region list
  regionItem:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f8fafc' },
  regionItemActive:    { backgroundColor: '#fdf2f8' },
  regionItemText:      { fontSize: 15, color: '#334155', fontWeight: '600' },
  regionItemTextActive:{ color: '#db2777', fontWeight: '700' },
});
