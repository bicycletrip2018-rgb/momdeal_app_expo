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
import { COLORS } from '../constants/theme';

// ─── Age Groups ──────────────────────────────────────────────────────────────

const AGE_GROUP = {
  PREGNANT:     'PREGNANT',
  INFANT:       'INFANT',        // 0–2 years   (0–35 months)
  TODDLER:      'TODDLER',       // 3–7 years   (36–95 months)
  KIDS_LOWER:   'KIDS_LOWER',   // 8–10 years  (96–131 months)
  KIDS_UPPER:   'KIDS_UPPER',   // 11–13 years (132–167 months)
  TEEN:         'TEEN',          // 14–19 years (168–239 months)
  ADULT_CHILD:  'ADULT_CHILD',  // 20+ years   (240+ months)
};

const AGE_GROUP_LABEL = {
  PREGNANT:    '임신 맞춤',
  INFANT:      '영아 맞춤 (0–2세)',
  TODDLER:     '유아 맞춤 (3–7세)',
  KIDS_LOWER:  '초등 저학년 맞춤 (8~10세)',
  KIDS_UPPER:  '초등 고학년 맞춤 (11~13세)',
  TEEN:        '청소년 맞춤 (14~19세)',
  ADULT_CHILD: '성인 자녀/가구 맞춤 (20세 이상)',
};

// ─── Concern Categories (mirrors InitialOnboardingScreen) ────────────────────

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

const CARE_ENV_OPTIONS = ['엄마+아빠', '엄마 혼자', '아빠 혼자', '조부모 도움', '시터/도우미', '기관 이용'];

// ─── Constants ──────────────────────────────────────────────────────────────

const PICKER_ITEM_H = 44;
const PICKER_VISIBLE = 5;

// ─── Helper: compute ageGroup from birthDate ─────────────────────────────────

function deriveAgeGroup(birthDate, type) {
  if (type === 'pregnancy' || type === 'planning') return AGE_GROUP.PREGNANT;
  if (!birthDate) return null;
  const now = new Date();
  if (birthDate > now) return AGE_GROUP.PREGNANT;
  const ageMonths =
    (now.getFullYear() - birthDate.getFullYear()) * 12 +
    (now.getMonth() - birthDate.getMonth());
  if (ageMonths < 36)  return AGE_GROUP.INFANT;       // 0–2 years
  if (ageMonths < 96)  return AGE_GROUP.TODDLER;      // 3–7 years
  if (ageMonths < 132) return AGE_GROUP.KIDS_LOWER;   // 8–10 years
  if (ageMonths < 168) return AGE_GROUP.KIDS_UPPER;   // 11–13 years
  if (ageMonths < 240) return AGE_GROUP.TEEN;          // 14–19 years
  return AGE_GROUP.ADULT_CHILD;                        // 20+ years
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const formatBirthDateSummary = (date) => {
  if (!date) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}.${m}.${d}`;
};

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

// ─── Screen ─────────────────────────────────────────────────────────────────

export default function ChildAddScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();

  const childId    = route?.params?.childId ?? null;
  const initChild  = route?.params?.child   ?? null;
  const isEditMode = Boolean(childId);

  // The DB's original type — used for one-way ratchet and immutability rules.
  const initType       = initChild?.type ?? 'child';
  // True when the DB record is already a born child (immutable: no rollback, no field changes).
  const isInitiallyBorn = isEditMode && initType === 'child';
  // True when the user is transitioning from pregnancy/planning → child in this session.
  const isTransitioningToBorn = isEditMode && initType !== 'child' && type === 'child';

  const initBirthDate = parseBirthDateParam(initChild?.birthDate);

  // ── Form state ────────────────────────────────────────────────────────────
  // Legacy name auto-split: if DB has old `name` but no structured lastName/firstName, split it.
  const hasStructuredName = !!(initChild?.lastName || initChild?.firstName);
  const legacyName = (initChild?.name || '').trim();
  const [lastName,  setLastName]  = useState(
    initChild?.lastName  ?? (hasStructuredName ? '' : legacyName.length > 1 ? legacyName.charAt(0) : '')
  );
  const [firstName, setFirstName] = useState(
    initChild?.firstName ?? (hasStructuredName ? '' : legacyName.length > 1 ? legacyName.slice(1) : legacyName)
  );
  const [gender, setGender] = useState(initChild?.gender ?? 'female');
  const [type,   setType]   = useState(initChild?.type   ?? 'child');

  // ── Age / measurements ────────────────────────────────────────────────────
  const [birthDate,      setBirthDate]      = useState(initBirthDate);
  const [pregnancyWeek,  setPregnancyWeek]  = useState(
    initChild?.pregnancyWeek != null ? String(initChild.pregnancyWeek) : ''
  );
  const [planningPeriod, setPlanningPeriod] = useState(initChild?.planningPeriod ?? '');
  const [height, setHeight] = useState(initChild?.height != null ? String(initChild.height) : '');
  const [weight, setWeight] = useState(initChild?.weight != null ? String(initChild.weight) : '');
  const [showDatePicker, setShowDatePicker] = useState(false);

  // ── Derived: ageGroup recomputes whenever birthDate or type changes ────────
  const ageGroup = useMemo(
    () => deriveAgeGroup(birthDate, type),
    [birthDate, type]
  );

  // ── Care environment (multi-select) ──────────────────────────────────────
  const [careEnvironment, setCareEnvironment] = useState(initChild?.careEnvironment ?? []);
  const toggleCareEnv = useCallback((val) => {
    setCareEnvironment((prev) =>
      prev.includes(val) ? prev.filter((v) => v !== val) : [...prev, val]
    );
  }, []);

  // ── Concerns (RULE-03: '없음' is mutually exclusive) ─────────────────────
  const [concerns, setConcerns] = useState(initChild?.concerns ?? []);

  const currentConcernOptions = useMemo(() => {
    if (type === 'pregnancy') return PREGNANT_CONCERNS;
    if (type === 'planning')  return PLANNING_CONCERNS;
    return BORN_CONCERNS;
  }, [type]);

  const toggleConcern = useCallback((key) => {
    setConcerns((prev) => {
      if (prev.includes(key)) return prev.filter((v) => v !== key);
      if (key === NONE_CONCERN) return [NONE_CONCERN];
      const withoutNone = prev.filter((v) => v !== NONE_CONCERN);
      if (withoutNone.length >= 3) return prev;
      return [...withoutNone, key];
    });
  }, []);

  // ── Reset concerns when type changes ─────────────────────────────────────
  const prevTypeRef = useRef(type);
  useEffect(() => {
    if (prevTypeRef.current !== type) {
      prevTypeRef.current = type;
      setConcerns([]);
    }
  }, [type]);

  const [saving,           setSaving]           = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage,   setSuccessMessage]   = useState('');

  // ── Navigation ───────────────────────────────────────────────────────────
  const handleBack = () => navigation.goBack();

  const handleNext = () => {
    if (type === 'child' && !lastName.trim())  { Alert.alert('안내', '성(姓)을 입력해 주세요.'); return; }
    if (type === 'child' && !firstName.trim()) { Alert.alert('안내', '이름을 입력해 주세요.'); return; }
    // pregnancy: firstName (태명) is optional — no validation required
    if (type === 'child' && !birthDate) {
      Alert.alert('안내', '생년월일을 선택해 주세요.'); return;
    }
    if (type === 'pregnancy' && !pregnancyWeek.trim()) {
      Alert.alert('안내', '임신 주차를 입력해 주세요.'); return;
    }
    handleSubmit();
  };

  // ── Build Firestore payload ───────────────────────────────────────────────
  const buildPayload = () => ({
    lastName:      lastName.trim(),
    firstName:     firstName.trim(),
    name:          [lastName.trim(), firstName.trim()].filter(Boolean).join(' '),
    gender,
    type,
    birthDate:     type === 'child'     ? birthDate : null,
    pregnancyWeek: type === 'pregnancy' ? Number(pregnancyWeek) : null,
    planningPeriod: type === 'planning' ? planningPeriod : null,
    dueDate:       null,
    height:        height.trim()  ? Number(height)  : null,
    weight:        weight.trim()  ? Number(weight)  : null,
    ageGroup,
    careEnvironment,
    concerns,
    // backward-compat aliases used by recommendation engine
    categoryTags:  concerns,
  });

  const handleSubmit = async () => {
    try {
      setSaving(true);
      const payload = buildPayload();
      if (isEditMode) {
        await updateChild(childId, payload);
        setSuccessMessage('아이 정보가 업데이트되었습니다.');
        setShowSuccessModal(true);
      } else {
        await createChild({ userId: auth.currentUser?.uid || '', ...payload });
        setSuccessMessage('아이 정보가 저장되었습니다.');
        setShowSuccessModal(true);
      }
    } catch (error) {
      console.log('ChildAddScreen submit error:', error);
      Alert.alert('오류', isEditMode ? '수정에 실패했습니다.' : '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
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
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* ── Single-page form ── */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.stepHeading}>
          {isEditMode ? '아이 정보를\n수정해 주세요' : '아이 정보를\n입력해 주세요'}
        </Text>
        <Text style={styles.stepSub}>
          {isEditMode ? '아이의 최신 정보를 업데이트해 주세요.' : '이름과 기본 정보를 알려주세요.'}
        </Text>

        {/* ── 기본 정보 ── */}
        <View style={styles.card}>
          {!isInitiallyBorn && (
            <>
              <SectionLabel text="유형" required />
          {isEditMode ? (
            isInitiallyBorn ? (
              // Born child: type is fully locked — no rollback to pregnancy
              <View style={styles.lockedTypeRow}>
                <Text style={styles.lockedTypeText}>아이</Text>
              </View>
            ) : (
              // Pregnancy/planning: one-way ratchet — can upgrade to child only
              <View>
                <View style={styles.chipRow}>
                  <ChoiceChip
                    label="아이"
                    selected={type === 'child'}
                    onPress={() => { setType('child'); setBirthDate(null); setGender('female'); }}
                  />
                  <ChoiceChip
                    label={initType === 'pregnancy' ? '임신 중' : '임신 준비 중'}
                    selected={type !== 'child'}
                    onPress={() => setType(initType)}
                  />
                </View>
                {type === 'child' && (
                  <Text style={styles.ratchetHint}>출산 후 아이 정보로 전환돼요. 저장 후 되돌릴 수 없어요.</Text>
                )}
              </View>
            )
          ) : (
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
              <ChoiceChip
                label="임신 준비 중"
                selected={type === 'planning'}
                onPress={() => { setType('planning'); setGender('unknown'); }}
              />
            </View>
          )}
            </>
          )}

          {type !== 'planning' && (
            <>
              {!isInitiallyBorn && <View style={styles.cardDivider} />}
              <SectionLabel
                text={type === 'pregnancy' ? '태명' : '이름'}
                note={type === 'pregnancy' ? '(선택)' : undefined}
                required={type === 'child'}
              />
              {type === 'child' ? (
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    value={lastName}
                    onChangeText={setLastName}
                    placeholder="성 (필수)"
                    placeholderTextColor="#aaa"
                  />
                  <TextInput
                    style={[styles.input, { flex: 2 }]}
                    value={firstName}
                    onChangeText={setFirstName}
                    placeholder="이름 (필수)"
                    placeholderTextColor="#aaa"
                  />
                </View>
              ) : (
                <TextInput
                  style={styles.input}
                  value={firstName}
                  onChangeText={setFirstName}
                  placeholder="태명 (선택)"
                  placeholderTextColor="#aaa"
                />
              )}
            </>
          )}

          {type === 'child' && (
            <>
              <View style={styles.cardDivider} />
              <SectionLabel text="성별" required />
              <View style={styles.chipRow}>
                <ChoiceChip label="여아" selected={gender === 'female'} onPress={() => setGender('female')} />
                <ChoiceChip label="남아" selected={gender === 'male'}   onPress={() => setGender('male')} />
              </View>
            </>
          )}
        </View>

        {/* ── 날짜 / 신체 정보 — hidden for planning ── */}
        {type !== 'planning' && <View style={[styles.card, { marginTop: 12 }]}>
          {type === 'child' ? (
            <>
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
                    <Text style={styles.datePickerIcon}>›</Text>
                  </TouchableOpacity>
                  {ageGroup && (
                    <View style={styles.ageGroupBadge}>
                      <Text style={styles.ageGroupBadgeText}>
                        {AGE_GROUP_LABEL[ageGroup]}로 맞춤 추천을 준비할게요
                      </Text>
                    </View>
                  )}
                  <View style={styles.cardDivider} />
                </>

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
          ) : type === 'pregnancy' ? (
            <>
              <SectionLabel text="임신 주차" required />
              <TextInput
                style={styles.input}
                value={pregnancyWeek}
                onChangeText={setPregnancyWeek}
                keyboardType="number-pad"
                placeholder="예: 28"
                placeholderTextColor="#aaa"
              />
            </>
          ) : null}
        </View>}

        {/* ── 주 양육 환경 — child only ── */}
        {type === 'child' && <View style={[styles.card, { marginTop: 12 }]}>
          <SectionLabel text="주 양육 환경" note="(선택 · 복수 선택 가능)" />
          <View style={styles.chipWrap}>
            {CARE_ENV_OPTIONS.map((opt) => (
              <ChoiceChip
                key={opt}
                label={opt}
                selected={careEnvironment.includes(opt)}
                onPress={() => toggleCareEnv(opt)}
              />
            ))}
          </View>
        </View>}

        {/* ── 관심사 / 고민 ── */}
        <View style={[styles.card, { marginTop: 12 }]}>
          <Text style={styles.stepHeading2}>
            {type === 'pregnancy'
              ? '임신 중 가장\n관심 있는 분야는요?'
              : type === 'planning'
                ? '임신 준비에서\n가장 관심 있는 분야는요?'
                : '육아에서 가장\n관심 있는 분야는요?'
            }
          </Text>
          <SectionLabel text="관심사 / 고민" note="(선택 · 최대 3개)" />
          <View style={styles.chipWrap}>
            {currentConcernOptions.map((opt) => (
              <ChoiceChip
                key={opt}
                label={opt}
                selected={concerns.includes(opt)}
                onPress={() => toggleConcern(opt)}
              />
            ))}
          </View>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* ── Single submit button ── */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 8 }]}>
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
              {isEditMode ? '수정 완료' : '아이 등록'}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {/* ── Date Picker Modal ── */}
      <DatePickerModal
        visible={showDatePicker}
        initialDate={birthDate}
        onConfirm={(date) => { setBirthDate(date); setShowDatePicker(false); }}
        onCancel={() => setShowDatePicker(false)}
      />

      {/* ── Success Modal ── */}
      <Modal
        visible={showSuccessModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSuccessModal(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 20, padding: 28, width: '100%', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 8 }}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#dcfce7', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <Text style={{ fontSize: 32 }}>✅</Text>
            </View>
            <Text style={{ fontWeight: 'bold', fontSize: 18, color: '#0f172a', textAlign: 'center', marginBottom: 24 }}>
              {successMessage}
            </Text>
            <TouchableOpacity
              style={{ backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 14, width: '100%', alignItems: 'center' }}
              activeOpacity={0.85}
              onPress={() => { setShowSuccessModal(false); navigation.goBack(); }}
            >
              <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>확인</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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

  // ── Scroll ──
  scroll:        { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 24 },

  // ── Step heading ──
  stepHeading:  { fontSize: 22, fontWeight: '900', color: '#0f172a', lineHeight: 30, marginBottom: 4 },
  stepHeading2: { fontSize: 16, fontWeight: '800', color: '#0f172a', lineHeight: 22, marginBottom: 10 },
  stepSub:      { fontSize: 13, color: '#64748b', lineHeight: 18, marginBottom: 14 },

  // ── Immutable summary card ──
  summaryCard: {
    backgroundColor: '#f8fafc', borderRadius: 12,
    borderWidth: 1, borderColor: '#e2e8f0',
    paddingHorizontal: 14, paddingVertical: 12,
    marginBottom: 12,
  },
  summaryRow:      { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  summaryBadge:    { backgroundColor: '#e2e8f0', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  summaryBadgeText:{ fontSize: 13, fontWeight: '700', color: '#334155' },
  summarySep:      { fontSize: 13, color: '#94a3b8', fontWeight: '400' },
  summaryNote:     { fontSize: 11, color: '#94a3b8', marginTop: 8 },

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
  bodyRow:      { flexDirection: 'row' },
  measureLabel: { fontSize: 12, fontWeight: '700', color: '#64748b', marginBottom: 6 },

  // ── Locked / disabled field display ──
  lockedTypeRow:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
  lockedTypeText:  { fontSize: 15, fontWeight: '700', color: '#64748b', backgroundColor: '#f1f5f9', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  lockedTypeNote:  { fontSize: 12, color: '#94a3b8' },
  lockedFieldRow:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  lockedFieldText: { fontSize: 15, fontWeight: '600', color: '#64748b', backgroundColor: '#f1f5f9', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  disabledField:   { backgroundColor: '#f1f5f9', borderColor: '#e2e8f0', opacity: 0.7 },
  ratchetHint:     { fontSize: 12, color: '#f59e0b', marginTop: 8, fontWeight: '600' },

  // ── Chips ──
  chipRow:        { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chipWrap:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:           { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#fff' },
  chipActive:     { borderColor: COLORS.primary, backgroundColor: '#dbeafe' },
  chipText:       { color: '#334155', fontWeight: '600', fontSize: 13 },
  chipTextActive: { color: COLORS.primary },

  // ── Date picker trigger ──
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
  nextBtn:         { flex: 1, paddingVertical: 15, alignItems: 'center', borderRadius: 12, backgroundColor: COLORS.primary },
  nextBtnDisabled: { opacity: 0.6 },
  nextBtnText:     { fontSize: 15, fontWeight: '800', color: '#fff' },

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
  pickerConfirmText: { fontSize: 15, color: COLORS.primary, fontWeight: '700' },
  pickerColumns:     { flexDirection: 'row', justifyContent: 'center' },
});
