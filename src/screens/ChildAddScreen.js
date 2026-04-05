import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { auth } from '../firebase/config';
import { createChild, updateChild } from '../services/firestore/childrenRepository';

// ─── Age Groups ──────────────────────────────────────────────────────────────

const AGE_GROUP = {
  PREGNANT:  'PREGNANT',
  INFANT:    'INFANT',    // 0–2 years  (0–35 months)
  TODDLER:   'TODDLER',  // 3–6 years  (36–83 months)
  KIDS:      'KIDS',      // 7–12 years (84–155 months)
  TEEN_PLUS: 'TEEN_PLUS', // 13+ years (156+ months)
};

const AGE_GROUP_LABEL = {
  PREGNANT:  { emoji: '🤰', label: '임신 맞춤' },
  INFANT:    { emoji: '👶', label: '영아 맞춤 (0–2세)' },
  TODDLER:   { emoji: '🧒', label: '유아 맞춤 (3–6세)' },
  KIDS:      { emoji: '🎒', label: '초등 맞춤 (7–12세)' },
  TEEN_PLUS: { emoji: '🎓', label: '청소년 맞춤 (13세+)' },
};

// ─── Constants ──────────────────────────────────────────────────────────────

const TOTAL_STEPS = 4;
const PICKER_ITEM_H = 44;
const PICKER_VISIBLE = 5;

const REGIONS = [
  '서울', '경기', '인천', '부산', '대구', '광주', '대전', '울산',
  '세종', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주',
];

const CARE_ENV_OPTIONS = [
  '엄마+아빠', '엄마 혼자', '아빠 혼자', '조부모 도움', '시터/도우미', '기관 이용',
];

// ─── Age-specific Step 3 field definitions ───────────────────────────────────

const STEP3_FIELDS = {
  [AGE_GROUP.PREGNANT]: [
    {
      id: 'birthPrep',
      label: '출산 준비 단계',
      type: 'multi',
      options: ['병원 선택 완료', '출산용품 준비 중', '산후조리원 예약', '수유 준비 중', '신생아 용품 구매 중'],
    },
  ],
  [AGE_GROUP.INFANT]: [
    {
      id: 'feedingType',
      label: '수유 방식',
      type: 'single',
      options: ['모유', '분유', '혼합', '이유식', '미정'],
    },
    {
      id: 'skinType',
      label: '피부 타입',
      type: 'single',
      options: ['정상', '건성', '민감성', '아토피성', '태열'],
    },
  ],
  [AGE_GROUP.TODDLER]: [
    {
      id: 'pottyTraining',
      label: '배변 훈련 상태',
      type: 'single',
      options: ['기저귀 착용 중', '훈련 중', '완료'],
    },
    {
      id: 'mainActivity',
      label: '주 활동',
      type: 'multi',
      options: ['실내 놀이', '야외 놀이', '유아 체육', '언어/독서', '음악/미술', '기관 이용'],
    },
  ],
  [AGE_GROUP.KIDS]: [
    {
      id: 'digitalUsage',
      label: '하루 디지털 기기 사용 시간',
      type: 'single',
      options: ['거의 안 함', '1시간 미만', '1–2시간', '2시간 이상'],
    },
    {
      id: 'mainInterests',
      label: '주요 관심사',
      type: 'multi',
      options: ['교과 학습', '예체능', '독서', '스포츠', '게임/미디어', '과학/탐구'],
    },
  ],
  [AGE_GROUP.TEEN_PLUS]: [
    {
      id: 'independenceLevel',
      label: '독립성 수준',
      type: 'single',
      options: ['부모 의존적', '일부 독립', '상당히 독립적'],
    },
    {
      id: 'parentConcerns',
      label: '부모의 고민',
      type: 'multi',
      options: ['사춘기 소통', '학업/진로', '교우 관계', '정서/심리', '건강 관리', '디지털 사용 관리'],
    },
  ],
};

// ─── Age-specific Step 4: product interest options ───────────────────────────

const AGE_INTERESTS = {
  [AGE_GROUP.PREGNANT]: [
    '임부복', '출산준비물', '신생아 케어', '수유용품', '유모차/카시트', '아기 가구', '태교 용품',
  ],
  [AGE_GROUP.INFANT]: [
    '기저귀/물티슈', '분유/이유식', '아기 스킨케어', '장난감/발달교구', '아기 의류', '유모차/힙시트', '아기 가전',
  ],
  [AGE_GROUP.TODDLER]: [
    '장난감/교구', '아동 의류', '간식/영양제', '안전용품', '독서/교육', '야외 놀이용품', '원아복/가방',
  ],
  [AGE_GROUP.KIDS]: [
    '학용품/문구', '아동복/신발', '스포츠/취미용품', '장난감/게임', '학습교재', '책가방/스쿨용품', '음악·미술 도구',
  ],
  [AGE_GROUP.TEEN_PLUS]: [
    '주니어 패션', '스킨케어/뷰티', '스포츠용품', '학습/진로 도서', '디지털기기·악세서리', '간식/건강식품',
  ],
};

const STEP3_HEADING = {
  [AGE_GROUP.PREGNANT]:  '출산을 어떻게\n준비하고 계세요?',
  [AGE_GROUP.INFANT]:    '아기의 생활 패턴을\n알려주세요',
  [AGE_GROUP.TODDLER]:   '아이의 현재 상태를\n알려주세요',
  [AGE_GROUP.KIDS]:      '아이의 생활 패턴을\n알려주세요',
  [AGE_GROUP.TEEN_PLUS]: '요즘 어떤 부분이\n가장 신경 쓰이세요?',
};

const STEP4_HEADING = {
  [AGE_GROUP.PREGNANT]:  '출산 준비에\n관심 있는 카테고리를 골라주세요',
  [AGE_GROUP.INFANT]:    '육아 특가 중\n주로 찾으시는 카테고리는요?',
  [AGE_GROUP.TODDLER]:   '아이 성장에\n관심 있는 카테고리를 골라주세요',
  [AGE_GROUP.KIDS]:      '우리 아이 위해\n주로 구매하는 카테고리는요?',
  [AGE_GROUP.TEEN_PLUS]: '청소년 자녀를 위해\n관심 있는 카테고리를 골라주세요',
};

// ─── Helper: compute ageGroup from birthDate ─────────────────────────────────

function deriveAgeGroup(birthDate, type) {
  if (type === 'pregnancy') return AGE_GROUP.PREGNANT;
  if (!birthDate) return null;
  const now = new Date();
  // Future birthdate = still pregnant
  if (birthDate > now) return AGE_GROUP.PREGNANT;
  const ageMonths =
    (now.getFullYear() - birthDate.getFullYear()) * 12 +
    (now.getMonth() - birthDate.getMonth());
  if (ageMonths < 36)  return AGE_GROUP.INFANT;
  if (ageMonths < 84)  return AGE_GROUP.TODDLER;
  if (ageMonths < 156) return AGE_GROUP.KIDS;
  return AGE_GROUP.TEEN_PLUS;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const formatDateDisplay = (date) => {
  if (!date) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}년 ${Number(m)}월 ${Number(d)}일`;
};

const parseBirthDateParam = (val) => {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (typeof val === 'string') {
    const d = new Date(val);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
};

// ─── ScrollPickerColumn ─────────────────────────────────────────────────────

function ScrollPickerColumn({ data, selectedIndex, onIndexChange, width }) {
  const scrollRef    = useRef(null);
  const isScrolling  = useRef(false);
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
      const idx     = Math.round(e.nativeEvent.contentOffset.y / PICKER_ITEM_H);
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
          position: 'absolute', top: PICKER_ITEM_H * 2, left: 4, right: 4,
          height: PICKER_ITEM_H, backgroundColor: '#eff6ff',
          borderRadius: 8, borderWidth: 1, borderColor: '#bfdbfe', zIndex: 0,
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
              <Text style={isSelected
                ? { fontSize: 18, fontWeight: '800', color: '#1d4ed8' }
                : { fontSize: 15, fontWeight: '500', color: '#94a3b8' }
              }>
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

// ─── DatePickerModal ─────────────────────────────────────────────────────────

function DatePickerModal({ visible, initialDate, onConfirm, onCancel }) {
  const NOW = new Date();

  const years = useMemo(() => {
    const list = [];
    for (let y = 1980; y <= NOW.getFullYear(); y++) list.push({ value: y, label: `${y}년` });
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
    onConfirm(new Date(selectedYear, monthIdx, clampedDayIdx + 1));
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
          <ScrollPickerColumn data={months} selectedIndex={monthIdx}       onIndexChange={setMonthIdx} width={80}  />
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

// ─── RegionPickerModal ───────────────────────────────────────────────────────

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
              <Text style={[styles.regionItemText, selected === r && styles.regionItemTextActive]}>{r}</Text>
              {selected === r && <Text style={{ fontSize: 16, color: '#2563eb' }}>✓</Text>}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── ChoiceChip ──────────────────────────────────────────────────────────────

function ChoiceChip({ label, selected, onPress }) {
  return (
    <TouchableOpacity
      style={[styles.chip, selected && styles.chipActive]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <Text style={[styles.chipText, selected && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── SectionLabel ────────────────────────────────────────────────────────────

function SectionLabel({ text, required = false, note }) {
  return (
    <View style={styles.sectionLabelRow}>
      <Text style={styles.sectionLabel}>
        {text}
        {required && <Text style={styles.requiredAsterisk}> *</Text>}
      </Text>
      {note ? <Text style={styles.sectionLabelNote}>{note}</Text> : null}
    </View>
  );
}

// ─── ProgressBar ─────────────────────────────────────────────────────────────

function ProgressBar({ step }) {
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${(step / TOTAL_STEPS) * 100}%` }]} />
    </View>
  );
}

// ─── Screen ─────────────────────────────────────────────────────────────────

export default function ChildAddScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();

  const childId    = route?.params?.childId ?? null;
  const initChild  = route?.params?.child   ?? null;
  const isEditMode = Boolean(childId);

  const initBirthDate = parseBirthDateParam(initChild?.birthDate);

  // ── Step state ────────────────────────────────────────────────────────────
  const [step, setStep] = useState(1);

  // Step 1 — basic info
  const [name,       setName]       = useState(initChild?.name     ?? '');
  const [gender,     setGender]     = useState(initChild?.gender   ?? 'female');
  const [type,       setType]       = useState(initChild?.type     ?? 'child');
  const [birthOrder, setBirthOrder] = useState(
    initChild?.birthOrder != null ? String(Math.min(initChild.birthOrder, 3)) : ''
  );

  // Step 2 — age/measurements
  const [birthDate,     setBirthDate]     = useState(initBirthDate);
  const [pregnancyWeek, setPregnancyWeek] = useState(
    initChild?.pregnancyWeek != null ? String(initChild.pregnancyWeek) : ''
  );
  const [height, setHeight] = useState(initChild?.height != null ? String(initChild.height) : '');
  const [weight, setWeight] = useState(initChild?.weight != null ? String(initChild.weight) : '');
  const [showDatePicker, setShowDatePicker] = useState(false);

  // ── Derived: ageGroup recomputes whenever birthDate or type changes ────────
  const ageGroup = useMemo(
    () => deriveAgeGroup(birthDate, type),
    [birthDate, type]
  );

  // Step 3 — universal
  const [careEnv,          setCareEnv]          = useState(initChild?.careEnv    ?? []);
  const [region,           setRegion]           = useState(initChild?.region     ?? '');
  const [showRegionPicker, setShowRegionPicker] = useState(false);

  // Step 3 — INFANT
  const [feedingType, setFeedingType] = useState(initChild?.feedingType ?? '');
  const [skinType,    setSkinType]    = useState(initChild?.skinType    ?? '');

  // Step 3 — TODDLER
  const [pottyTraining, setPottyTraining] = useState(initChild?.pottyTraining ?? '');
  const [mainActivity,  setMainActivity]  = useState(initChild?.mainActivity  ?? []);

  // Step 3 — KIDS
  const [digitalUsage,  setDigitalUsage]  = useState(initChild?.digitalUsage  ?? '');
  const [mainInterests, setMainInterests] = useState(initChild?.mainInterests ?? []);

  // Step 3 — TEEN_PLUS
  const [independenceLevel, setIndependenceLevel] = useState(initChild?.independenceLevel ?? '');
  const [parentConcerns,    setParentConcerns]    = useState(initChild?.parentConcerns    ?? []);

  // Step 3 — PREGNANT
  const [birthPrep, setBirthPrep] = useState(initChild?.birthPrep ?? []);

  // Step 4 — product interests
  const [productInterests,    setProductInterests]    = useState(initChild?.productInterests    ?? []);
  const [productInterestNote, setProductInterestNote] = useState(initChild?.productInterestNote ?? '');
  const hasCustomInterest = productInterests.includes('기타 (직접 입력)');

  const [saving, setSaving] = useState(false);

  // ── Generic toggle helpers ────────────────────────────────────────────────
  const makeToggleMulti = (setter) => (val) =>
    setter((prev) => prev.includes(val) ? prev.filter((v) => v !== val) : [...prev, val]);

  const toggleCareEnv     = useCallback(makeToggleMulti(setCareEnv),     []);
  const toggleMainAct     = useCallback(makeToggleMulti(setMainActivity), []);
  const toggleMainInt     = useCallback(makeToggleMulti(setMainInterests), []);
  const toggleParentConc  = useCallback(makeToggleMulti(setParentConcerns), []);
  const toggleBirthPrep   = useCallback(makeToggleMulti(setBirthPrep),   []);
  const toggleProductInt  = useCallback(makeToggleMulti(setProductInterests), []);

  // ── Resolve step 3 field state by id ─────────────────────────────────────
  const getFieldState = (fieldId) => {
    switch (fieldId) {
      case 'feedingType':       return [feedingType,        setFeedingType];
      case 'skinType':          return [skinType,           setSkinType];
      case 'pottyTraining':     return [pottyTraining,      setPottyTraining];
      case 'mainActivity':      return [mainActivity,       toggleMainAct];
      case 'digitalUsage':      return [digitalUsage,       setDigitalUsage];
      case 'mainInterests':     return [mainInterests,      toggleMainInt];
      case 'independenceLevel': return [independenceLevel,  setIndependenceLevel];
      case 'parentConcerns':    return [parentConcerns,     toggleParentConc];
      case 'birthPrep':         return [birthPrep,          toggleBirthPrep];
      default:                  return [null, () => {}];
    }
  };

  // ── Navigation ───────────────────────────────────────────────────────────
  const handleBack = () => {
    if (step > 1) { setStep((s) => s - 1); return; }
    navigation.goBack();
  };

  const handleNext = () => {
    if (step === 1) {
      if (!name.trim()) { Alert.alert('안내', '이름을 입력해 주세요.'); return; }
      setStep(2); return;
    }
    if (step === 2) {
      if (type === 'child' && !birthDate) {
        Alert.alert('안내', '생년월일을 선택해 주세요.'); return;
      }
      if (type === 'pregnancy' && !pregnancyWeek.trim()) {
        Alert.alert('안내', '임신 주차를 입력해 주세요.'); return;
      }
      setStep(3); return;
    }
    if (step === 3) {
      setStep(4); return;
    }
    // step 4 → submit
    handleSubmit();
  };

  // ── Build Firestore payload ───────────────────────────────────────────────
  const buildPayload = () => {
    const base = {
      name:          name.trim(),
      gender,
      type,
      birthOrder:    birthOrder ? Number(birthOrder) : null,
      birthDate:     type === 'child'     ? birthDate : null,
      pregnancyWeek: type === 'pregnancy' ? Number(pregnancyWeek) : null,
      dueDate:       null,
      height:        height.trim()  ? Number(height)  : null,
      weight:        weight.trim()  ? Number(weight)  : null,
      ageGroup,
      careEnv,
      region:        region.trim(),
      // age-specific fields (stored even if empty — only relevant group will be non-empty)
      feedingType:       feedingType      || null,
      skinType:          skinType         || null,
      pottyTraining:     pottyTraining    || null,
      mainActivity,
      digitalUsage:      digitalUsage     || null,
      mainInterests,
      independenceLevel: independenceLevel || null,
      parentConcerns,
      birthPrep,
      // step 4
      productInterests,
      productInterestNote: productInterestNote.trim(),
      // backward-compat aliases used by recommendation engine
      concerns:          productInterests,
      concernNote:       productInterestNote.trim(),
      familyComposition: careEnv,
    };
    return base;
  };

  const handleSubmit = async () => {
    try {
      setSaving(true);
      const payload = buildPayload();
      if (isEditMode) {
        await updateChild(childId, payload);
        Alert.alert('수정 완료', '아이 정보가 업데이트되었습니다.', [
          { text: '확인', onPress: () => navigation.goBack() },
        ]);
      } else {
        await createChild({ userId: auth.currentUser?.uid || '', ...payload });
        Alert.alert('등록 완료', '아이 정보가 저장되었습니다.', [
          { text: '확인', onPress: () => navigation.goBack() },
        ]);
      }
    } catch (error) {
      console.log('ChildAddScreen submit error:', error);
      Alert.alert('오류', isEditMode ? '수정에 실패했습니다.' : '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  // ── Render step 3 age-specific section ───────────────────────────────────
  const renderAgeSpecificFields = () => {
    if (!ageGroup) return null;
    const fields = STEP3_FIELDS[ageGroup];
    if (!fields) return null;

    return fields.map((field) => {
      const [value, toggle] = getFieldState(field.id);
      return (
        <View key={field.id}>
          <View style={styles.cardDivider} />
          <SectionLabel text={field.label} note="(선택)" />
          <View style={styles.chipWrap}>
            {field.options.map((opt) => {
              const selected = field.type === 'multi'
                ? Array.isArray(value) && value.includes(opt)
                : value === opt;
              return (
                <ChoiceChip
                  key={opt}
                  label={opt}
                  selected={selected}
                  onPress={() => toggle(opt)}
                />
              );
            })}
          </View>
        </View>
      );
    });
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>

      {/* ── Top bar ── */}
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={handleBack}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.topBarBack}
        >
          <Text style={styles.topBarBackText}>‹</Text>
        </TouchableOpacity>
        <View style={styles.topBarCenter}>
          <Text style={styles.topBarTitle}>{isEditMode ? '아이 정보 수정' : '아이 등록'}</Text>
          <Text style={styles.topBarStep}>{step} / {TOTAL_STEPS}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* ── Progress bar ── */}
      <ProgressBar step={step} />

      {/* ── Step content ── */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >

        {/* ══════════════════════════════════════════════════
            STEP 1 — Basic info
        ══════════════════════════════════════════════════ */}
        {step === 1 && (
          <>
            <Text style={styles.stepHeading}>아이 정보를{'\n'}입력해 주세요</Text>
            <Text style={styles.stepSub}>이름과 기본 정보를 알려주세요.</Text>

            <View style={styles.card}>
              {/* 1. 유형 — first, so type selection immediately affects everything below */}
              <SectionLabel text="유형" required />
              <View style={styles.chipRow}>
                <ChoiceChip
                  label="아이"
                  selected={type === 'child'}
                  onPress={() => { setType('child'); if (gender === 'unknown') setGender('female'); }}
                />
                <ChoiceChip
                  label="임신 중"
                  selected={type === 'pregnancy'}
                  onPress={() => { setType('pregnancy'); setGender('unknown'); }}
                />
              </View>

              <View style={styles.cardDivider} />

              {/* 2. 이름 — label and placeholder both react to type selection above */}
              <SectionLabel
                text={type === 'pregnancy' ? '태명 (또는 애칭)' : '이름 / 별명'}
                required
              />
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder={
                  type === 'pregnancy'
                    ? '예: 튼튼이, 우리 아기 (아직 없다면 편하게 적어주세요)'
                    : '예: 노을이, 우리 공주'
                }
                placeholderTextColor="#aaa"
                autoFocus
              />

              <View style={styles.cardDivider} />

              {/* 3. 성별 — '아직 몰라요' pill appears here when type is pregnancy */}
              <SectionLabel text="성별" required />
              <View style={styles.chipRow}>
                <ChoiceChip label="여아"       selected={gender === 'female'}  onPress={() => setGender('female')} />
                <ChoiceChip label="남아"       selected={gender === 'male'}    onPress={() => setGender('male')} />
                {type === 'pregnancy' && (
                  <ChoiceChip label="아직 몰라요" selected={gender === 'unknown'} onPress={() => setGender('unknown')} />
                )}
              </View>

              {/* 4. 출생 순서 — child only, last */}
              {type === 'child' && (
                <>
                  <View style={styles.cardDivider} />
                  <SectionLabel text="출생 순서" />
                  <View style={styles.chipRow}>
                    <ChoiceChip label="첫째"  selected={birthOrder === '1'} onPress={() => setBirthOrder('1')} />
                    <ChoiceChip label="둘째"  selected={birthOrder === '2'} onPress={() => setBirthOrder('2')} />
                    <ChoiceChip label="셋째+" selected={birthOrder === '3'} onPress={() => setBirthOrder('3')} />
                  </View>
                </>
              )}
            </View>
          </>
        )}

        {/* ══════════════════════════════════════════════════
            STEP 2 — Date / measurements
        ══════════════════════════════════════════════════ */}
        {step === 2 && (
          <>
            <Text style={styles.stepHeading}>아이의 나이를{'\n'}알려주세요</Text>
            <Text style={styles.stepSub}>월령에 따라 맞춤 질문을 준비할게요.</Text>

            <View style={styles.card}>
              {type === 'child' ? (
                <>
                  <SectionLabel text="생년월일" required />
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

                  {/* Live ageGroup badge after date is selected */}
                  {ageGroup && (
                    <View style={styles.ageGroupBadge}>
                      <Text style={styles.ageGroupBadgeText}>
                        {AGE_GROUP_LABEL[ageGroup].emoji} {AGE_GROUP_LABEL[ageGroup].label}로 맞춤 질문을 준비할게요
                      </Text>
                    </View>
                  )}

                  <View style={styles.cardDivider} />

                  <SectionLabel text="신체 정보" note="(선택)" />
                  <View style={styles.bodyRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.measureLabel}>키 (cm)</Text>
                      <TextInput
                        style={styles.input}
                        value={height}
                        onChangeText={setHeight}
                        keyboardType="decimal-pad"
                        placeholder="예: 66.5"
                        placeholderTextColor="#aaa"
                      />
                    </View>
                    <View style={{ width: 12 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.measureLabel}>몸무게 (kg)</Text>
                      <TextInput
                        style={styles.input}
                        value={weight}
                        onChangeText={setWeight}
                        keyboardType="decimal-pad"
                        placeholder="예: 7.2"
                        placeholderTextColor="#aaa"
                      />
                    </View>
                  </View>
                </>
              ) : (
                <>
                  <SectionLabel text="임신 주차" required />
                  <TextInput
                    style={styles.input}
                    value={pregnancyWeek}
                    onChangeText={setPregnancyWeek}
                    keyboardType="number-pad"
                    placeholder="예: 28"
                    placeholderTextColor="#aaa"
                    autoFocus
                  />
                </>
              )}
            </View>
          </>
        )}

        {/* ══════════════════════════════════════════════════
            STEP 3 — Care environment + age-specific
        ══════════════════════════════════════════════════ */}
        {step === 3 && (
          <>
            <Text style={styles.stepHeading}>
              {ageGroup ? STEP3_HEADING[ageGroup] : '양육 환경을\n알려주세요'}
            </Text>
            <Text style={styles.stepSub}>
              {name.trim()
                ? `선택 정보를 입력하시면 ${name.trim()}에게 딱 맞는 핫딜만 쏙쏙 골라드릴게요!`
                : '선택 정보를 입력하시면 아이에게 딱 맞는 핫딜만 쏙쏙 골라드릴게요!'}
            </Text>

            {/* ageGroup badge */}
            {ageGroup && (
              <View style={[styles.ageGroupBadge, { marginBottom: 16 }]}>
                <Text style={styles.ageGroupBadgeText}>
                  {AGE_GROUP_LABEL[ageGroup].emoji} {AGE_GROUP_LABEL[ageGroup].label} 맞춤 화면
                </Text>
              </View>
            )}

            <View style={styles.card}>
              {/* Universal: 주 양육 환경 */}
              <SectionLabel text="주 양육 환경" note="(선택 · 복수 선택 가능)" />
              <View style={styles.chipWrap}>
                {CARE_ENV_OPTIONS.map((opt) => (
                  <ChoiceChip
                    key={opt}
                    label={opt}
                    selected={careEnv.includes(opt)}
                    onPress={() => toggleCareEnv(opt)}
                  />
                ))}
              </View>

              {/* Universal: 사는 곳 */}
              <View style={styles.cardDivider} />
              <SectionLabel text="사는 곳" note="(선택)" />
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

              {/* Age-specific fields */}
              {renderAgeSpecificFields()}
            </View>
          </>
        )}

        {/* ══════════════════════════════════════════════════
            STEP 4 — Product interests
        ══════════════════════════════════════════════════ */}
        {step === 4 && (
          <>
            <Text style={styles.stepHeading}>
              {ageGroup ? STEP4_HEADING[ageGroup] : '관심 있는\n특가 카테고리를 골라주세요'}
            </Text>
            <Text style={styles.stepSub}>
              {name.trim()
                ? `선택 정보를 입력하시면 ${name.trim()}에게 딱 맞는 핫딜만 쏙쏙 골라드릴게요!`
                : '선택 정보를 입력하시면 아이에게 딱 맞는 핫딜만 쏙쏙 골라드릴게요!'}
            </Text>

            <View style={styles.card}>
              <SectionLabel text="관심 카테고리" note="(선택 · 복수 선택 가능)" />
              <View style={styles.chipWrap}>
                {(ageGroup ? AGE_INTERESTS[ageGroup] : []).map((opt) => (
                  <ChoiceChip
                    key={opt}
                    label={opt}
                    selected={productInterests.includes(opt)}
                    onPress={() => toggleProductInt(opt)}
                  />
                ))}
                {/* 기타 chip — always last */}
                <ChoiceChip
                  label="기타 (직접 입력)"
                  selected={hasCustomInterest}
                  onPress={() => toggleProductInt('기타 (직접 입력)')}
                />
              </View>

              {/* 기타 text input — conditional */}
              {hasCustomInterest && (
                <>
                  <View style={styles.cardDivider} />
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    value={productInterestNote}
                    onChangeText={setProductInterestNote}
                    placeholder="관심 있는 카테고리나 제품을 자유롭게 적어주세요"
                    placeholderTextColor="#aaa"
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                    autoFocus
                  />
                </>
              )}
            </View>
          </>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* ── Bottom navigation bar ── */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 8 }]}>
        {step > 1 && (
          <TouchableOpacity style={styles.backBtn} onPress={handleBack} activeOpacity={0.7}>
            <Text style={styles.backBtnText}>← 이전</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.nextBtn, saving && styles.nextBtnDisabled]}
          onPress={handleNext}
          disabled={saving}
          activeOpacity={0.85}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.nextBtnText}>
              {step < TOTAL_STEPS ? '다음  →' : (isEditMode ? '수정 완료' : '아이 등록')}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {/* ── Modals ── */}
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
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7fb' },

  // ── Top bar ──
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff',
    paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  topBarBack:     { width: 40, alignItems: 'center', justifyContent: 'center' },
  topBarBackText: { fontSize: 28, color: '#0f172a', lineHeight: 34 },
  topBarCenter:   { alignItems: 'center' },
  topBarTitle:    { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  topBarStep:     { fontSize: 12, color: '#94a3b8', fontWeight: '600', marginTop: 1 },

  // ── Progress bar ──
  progressTrack: { height: 3, backgroundColor: '#f1f5f9' },
  progressFill:  { height: 3, backgroundColor: '#2563eb' },

  // ── Scroll ──
  scroll:        { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 24 },

  // ── Step heading ──
  stepHeading: { fontSize: 26, fontWeight: '900', color: '#0f172a', lineHeight: 36, marginBottom: 6 },
  stepSub:     { fontSize: 14, color: '#64748b', lineHeight: 20, marginBottom: 20 },

  // ── Age group badge ──
  ageGroupBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#eff6ff',
    borderRadius: 20, borderWidth: 1, borderColor: '#bfdbfe',
    paddingHorizontal: 12, paddingVertical: 6,
    marginTop: 10,
  },
  ageGroupBadgeText: { fontSize: 13, fontWeight: '700', color: '#1d4ed8' },

  // ── Card ──
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6 },
      android: { elevation: 2 },
    }),
  },
  cardDivider: { height: 1, backgroundColor: '#f1f5f9', marginVertical: 16 },

  // ── Section label ──
  sectionLabelRow:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  sectionLabel:     { fontSize: 14, fontWeight: '700', color: '#334155' },
  sectionLabelNote: { fontSize: 12, color: '#94a3b8', fontWeight: '500' },
  requiredAsterisk: { color: '#ef4444', fontSize: 13 },

  // ── Text inputs ──
  input: {
    backgroundColor: '#f8fafc',
    borderWidth: 1, borderColor: '#e2e8f0',
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11,
    fontSize: 15, color: '#0f172a',
  },
  textArea:     { minHeight: 72, paddingTop: 10 },
  bodyRow:      { flexDirection: 'row' },
  measureLabel: { fontSize: 12, fontWeight: '700', color: '#64748b', marginBottom: 6 },

  // ── Chips ──
  chipRow:      { flexDirection: 'row', gap: 8 },
  chipWrap:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:         { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#fff' },
  chipActive:   { borderColor: '#2563eb', backgroundColor: '#dbeafe' },
  chipText:     { color: '#334155', fontWeight: '600', fontSize: 13 },
  chipTextActive: { color: '#1d4ed8' },

  // ── Date/region picker trigger ──
  datePickerTrigger: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0',
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12,
  },
  datePickerValue:       { fontSize: 15, color: '#0f172a', fontWeight: '600' },
  datePickerPlaceholder: { fontSize: 15, color: '#aaa' },
  datePickerIcon:        { fontSize: 18 },

  // ── Bottom nav bar ──
  bottomBar: {
    flexDirection: 'row', gap: 10,
    paddingHorizontal: 16, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: '#f1f5f9',
    backgroundColor: '#fff',
  },
  backBtn:     { paddingHorizontal: 20, paddingVertical: 15, borderRadius: 12, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
  backBtnText: { fontSize: 14, fontWeight: '600', color: '#475569' },
  nextBtn:     { flex: 1, paddingVertical: 15, alignItems: 'center', borderRadius: 12, backgroundColor: '#2563eb' },
  nextBtnDisabled: { opacity: 0.6 },
  nextBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },

  // ── Picker bottom sheet ──
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
  pickerHandle:      { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: '#cbd5e1', marginBottom: 8 },
  pickerHeader:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  pickerTitle:       { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  pickerCancelText:  { fontSize: 15, color: '#94a3b8' },
  pickerConfirmText: { fontSize: 15, color: '#2563eb', fontWeight: '700' },
  pickerColumns:     { flexDirection: 'row', justifyContent: 'center' },

  // ── Region list ──
  regionItem:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f8fafc' },
  regionItemActive:     { backgroundColor: '#eff6ff' },
  regionItemText:       { fontSize: 15, color: '#334155', fontWeight: '600' },
  regionItemTextActive: { color: '#2563eb', fontWeight: '700' },
});
