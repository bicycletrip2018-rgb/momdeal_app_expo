import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView, KeyboardAvoidingView, Platform, Modal, Keyboard, ActivityIndicator, Switch } from 'react-native';
import { useUser } from '../context/UserContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { createChild } from '../services/firestore/childrenRepository';
import { updateSelectedChild } from '../services/firestore/userRepository';

// Onboarding is the very first screen — anonymous sign-in (useAuthSync, App.js)
// may still be in flight when the user finishes it, so wait for a uid instead
// of assuming auth.currentUser is already set (unlike deeper screens such as
// ChildAddScreen, which can safely assume auth has long since resolved).
function getUid() {
  if (auth.currentUser?.uid) return Promise.resolve(auth.currentUser.uid);
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) { unsub(); resolve(user.uid); }
    });
  });
}

const REGIONS            = ['서울', '경기', '인천', '부산', '대구', '광주', '대전', '울산', '세종', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'];
const PLANNING_PERIODS   = ['6개월 이내', '1년 이내', '1~2년 후', '아직 미정'];
// Stored value is always the same 4 canonical tags — only the *label* changes
// by status, since "워킹맘" (present tense) reads oddly to someone who has no
// child yet. Storing the same canonical value regardless of label means a
// pregnant "복직 예정" parent still matches with an already-born "워킹맘" for
// segment purposes (arguably a *more* useful match — advice from someone a
// step ahead), and matching logic never needs to special-case status.
const PARENTING_ENV_OPTS = ['워킹맘', '전업맘', '조부모 도움', '기타'];
const PARENTING_ENV_LABEL = {
  born: { '워킹맘': '워킹맘', '전업맘': '전업맘', '조부모 도움': '조부모 도움', '기타': '기타' },
  preBirth: { '워킹맘': '복직 예정', '전업맘': '전업 계획', '조부모 도움': '조부모 도움 예정', '기타': '기타' },
};
const UNDECIDED_ENV = '아직 미정';
const FEEDING_TYPES      = [
  { key: 'breast',  label: '모유' },
  { key: 'formula', label: '분유' },
  { key: 'mixed',   label: '혼합' },
  { key: 'weaned',  label: '이유식/유아식' },
];
const ALLERGY_TAGS = [
  '우유·유제품', '계란', '땅콩·견과류', '밀·글루텐', '대두', '갑각류', '아토피·민감성피부', '기타', '없음',
];
const INTEREST_AREAS = [
  { key: 'travel',       label: '여행' },
  { key: 'education',    label: '교육' },
  { key: 'finance',      label: '자녀 금융/저축' },
  { key: 'home_service',  label: '돌봄·생활서비스' },
  { key: 'health',       label: '건강·의료' },
  { key: 'resale',       label: '중고거래·나눔' },
];
const CONCERNS_BORN      = ['피부/기저귀', '수면/재우기', '수유/이유식', '발달/놀이', '안전/외출', '건강/면역', '교육/언어', '육아비용 절약', '기타', '없음'];
const CONCERNS_PREGNANT  = ['출산 준비물', '산모 건강/회복', '태아 발달/검사', '산후조리/도우미', '육아비용 절약', '기타', '없음'];
const CONCERNS_PLANNING  = ['임신 준비/영양제', '배란/가임기 확인', '난임/병원 검사', '생활습관/체력 관리', '육아비용 절약', '기타', '없음'];
const TOTAL_DATA_STEPS   = 3;

function Chip({ label, active, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={{
        paddingVertical: 10, paddingHorizontal: 16, borderRadius: 20,
        borderWidth: 1.5,
        borderColor: active ? '#2E6FF2' : '#e2e8f0',
        backgroundColor: active ? '#EFF6FF' : '#F8FAFC',
        marginRight: 8, marginBottom: 10,
      }}
    >
      <Text style={{ fontSize: 14, fontWeight: active ? '700' : '500', color: active ? '#2E6FF2' : '#334155' }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function NavBar({ onPrev, onNext, nextDisabled, nextLabel = '다음' }) {
  return (
    <View style={{ flexDirection: 'row', paddingHorizontal: 24, paddingBottom: 20, paddingTop: 12, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f1f5f9' }}>
      {onPrev ? (
        <TouchableOpacity onPress={onPrev} style={{ padding: 18, borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0', marginRight: 12, alignItems: 'center', width: 80 }}>
          <Text style={{ color: '#64748b', fontSize: 16, fontWeight: 'bold' }}>이전</Text>
        </TouchableOpacity>
      ) : null}
      <TouchableOpacity
        disabled={nextDisabled}
        onPress={onNext}
        style={{ flex: 1, backgroundColor: nextDisabled ? '#cbd5e1' : '#2E6FF2', padding: 18, borderRadius: 16, alignItems: 'center' }}
      >
        <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>{nextLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}

function YesNoToggle({ question, value, onSelect }) {
  return (
    <View style={{ marginBottom: 20 }}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: '#64748b', marginBottom: 10 }}>{question}</Text>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {[{ val: true, label: '네' }, { val: false, label: '아니요' }].map(({ val, label }) => (
          <TouchableOpacity
            key={String(val)}
            onPress={() => onSelect(prev => prev === val ? null : val)}
            style={{ flex: 1, padding: 14, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', borderColor: value === val ? '#2E6FF2' : '#e2e8f0', backgroundColor: value === val ? '#EFF6FF' : '#F8FAFC' }}
          >
            <Text style={{ fontSize: 15, fontWeight: value === val ? 'bold' : '500', color: value === val ? '#2E6FF2' : '#334155' }}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function SpinnerPicker({ selectedDate, onSelect, minimumDate, maximumDate }) {
  const today    = new Date();
  const initDate = selectedDate ?? minimumDate ?? new Date(2023, 0, 1);

  const minYear = minimumDate ? minimumDate.getFullYear() : 2015;
  const maxYear = maximumDate
    ? maximumDate.getFullYear()
    : minimumDate ? today.getFullYear() + 2 : today.getFullYear();
  const YEARS   = Array.from({ length: maxYear - minYear + 1 }, (_, i) => minYear + i);
  const MONTHS  = Array.from({ length: 12 }, (_, i) => i + 1);

  const [selYear,  setSelYear]  = useState(initDate.getFullYear());
  const [selMonth, setSelMonth] = useState(initDate.getMonth() + 1);
  const [selDay,   setSelDay]   = useState(initDate.getDate());

  const daysInMonth = new Date(selYear, selMonth, 0).getDate();
  const DAYS = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const clampedDay = Math.min(selDay, daysInMonth);

  const notify = (y, m, d) => {
    const clamped = Math.min(d, new Date(y, m, 0).getDate());
    const built = new Date(y, m - 1, clamped);
    if (minimumDate && built < minimumDate) return;
    if (maximumDate && built > maximumDate) return;
    onSelect(built);
  };

  const colStyle = { flex: 1, maxHeight: 200 };
  const itemStyle = (active) => ({
    paddingVertical: 10, alignItems: 'center',
    backgroundColor: active ? '#EFF6FF' : 'transparent',
    borderRadius: 8, marginHorizontal: 2,
  });
  const itemText = (active) => ({
    fontSize: 16, fontWeight: active ? '700' : '400',
    color: active ? '#2E6FF2' : '#334155',
  });

  return (
    <View style={{ flexDirection: 'row', gap: 4 }}>
      <ScrollView style={colStyle} showsVerticalScrollIndicator={false}>
        {YEARS.map(y => (
          <TouchableOpacity key={y} style={itemStyle(selYear === y)} onPress={() => { setSelYear(y); notify(y, selMonth, clampedDay); }}>
            <Text style={itemText(selYear === y)}>{y}년</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <ScrollView style={colStyle} showsVerticalScrollIndicator={false}>
        {MONTHS.map(m => (
          <TouchableOpacity key={m} style={itemStyle(selMonth === m)} onPress={() => { setSelMonth(m); notify(selYear, m, clampedDay); }}>
            <Text style={itemText(selMonth === m)}>{String(m).padStart(2, '0')}월</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <ScrollView style={colStyle} showsVerticalScrollIndicator={false}>
        {DAYS.map(d => (
          <TouchableOpacity key={d} style={itemStyle(selDay === d)} onPress={() => { setSelDay(d); notify(selYear, selMonth, d); }}>
            <Text style={itemText(selDay === d)}>{String(d).padStart(2, '0')}일</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

export default function OnboardingScreen() {
  const navigation  = useNavigation();
  const { isWowMember, setIsWowMember } = useUser();
  const [step, setStep] = useState(0);

  // Step 1 — child status
  const [childStatus,    setChildStatus]    = useState(null);
  const [lastName,       setLastName]       = useState('');
  const [firstName,      setFirstName]      = useState('');
  const [gender,         setGender]         = useState(null);
  const [birthDate,      setBirthDate]      = useState(null);
  const [isPremature,    setIsPremature]    = useState(null);
  const [taemyeong,      setTaemyeong]      = useState('');
  const [dueDate,        setDueDate]        = useState(null);
  const [planningPeriod, setPlanningPeriod] = useState(null);

  // Step 2 — environment & segment signals
  const [region,        setRegion]        = useState('');
  const [parentingEnv,  setParentingEnv]  = useState([]);
  const [feedingType,   setFeedingType]   = useState(null);
  const [allergyTags,   setAllergyTags]   = useState([]);
  const [allergyOtherNote, setAllergyOtherNote] = useState('');

  // Step 3 — interests
  const [selectedInterests, setSelectedInterests] = useState([]);
  const [interestAreas,     setInterestAreas]     = useState([]);
  const [isCurating,        setIsCurating]        = useState(false);

  // Modals
  const [showDatePicker,   setShowDatePicker]   = useState(false);
  const [datePickerTarget, setDatePickerTarget] = useState(null);
  const [tempDate,         setTempDate]         = useState(null);
  const [showRegionPicker, setShowRegionPicker] = useState(false);

  const formatDate = (d) =>
    d ? `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}` : null;

  const openDatePicker = (target) => {
    setDatePickerTarget(target);
    setTempDate((target === 'born' ? birthDate : dueDate) ?? new Date(2023, 0, 1));
    setShowDatePicker(true);
  };

  const confirmDate = () => {
    if (datePickerTarget === 'born') setBirthDate(tempDate);
    else if (datePickerTarget === 'pregnant') setDueDate(tempDate);
    setShowDatePicker(false);
  };

  // T6: mutually exclusive '기타' / '아직 미정' in parentingEnv
  const toggleParentingEnv = (val) => {
    if (val === '기타' || val === UNDECIDED_ENV) {
      setParentingEnv([val]);
    } else {
      setParentingEnv(prev => {
        const cleared = prev.filter(v => v !== '기타' && v !== UNDECIDED_ENV);
        return cleared.includes(val)
          ? cleared.filter(v => v !== val)
          : [...cleared, val];
      });
    }
  };

  // T8: max 3 + RULE-03 ('없음' mutual exclusion)
  const toggleInterest = (label) => {
    if (label === '없음') {
      setSelectedInterests(prev => prev.includes('없음') ? [] : ['없음']);
      return;
    }
    setSelectedInterests(prev => {
      const without없음 = prev.filter(c => c !== '없음');
      if (without없음.includes(label)) return without없음.filter(c => c !== label);
      if (without없음.length >= 3) return without없음;
      return [...without없음, label];
    });
  };

  // Same '없음' mutual-exclusion pattern as concerns, no max count.
  const toggleAllergy = (label) => {
    if (label === '없음') {
      setAllergyTags(prev => prev.includes('없음') ? [] : ['없음']);
      setAllergyOtherNote('');
      return;
    }
    setAllergyTags(prev => {
      const without없음 = prev.filter(c => c !== '없음');
      const next = without없음.includes(label) ? without없음.filter(c => c !== label) : [...without없음, label];
      if (label === '기타' && !next.includes('기타')) setAllergyOtherNote('');
      return next;
    });
  };

  // Lightweight interest signal for future verticals — no '없음', no cap; skippable.
  const toggleInterestArea = (key) => {
    setInterestAreas(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  const finishOnboarding = () => {
    setIsCurating(true);
    setTimeout(async () => {
      try {
        const userId = await getUid();

        const childPayload = {
          userId,
          type: childStatus === 'born' ? 'child' : childStatus === 'pregnant' ? 'pregnancy' : 'planning',
          firstName: (childStatus === 'born' ? firstName : taemyeong).trim(),
          lastName: childStatus === 'born' ? lastName.trim() : '',
          gender,
          birthDate: childStatus === 'born' ? birthDate : null,
          dueDate: childStatus === 'pregnant' ? dueDate : null,
          planningPeriod: childStatus === 'planning' ? planningPeriod : null,
          concerns: selectedInterests,
          careEnvironment: parentingEnv,
          allergyTags,
          allergyOtherNote: allergyTags.includes('기타') ? allergyOtherNote.trim() : '',
          ...(childStatus === 'born' ? {
            feedingType: feedingType || 'unknown',
            isPremature: Boolean(isPremature),
          } : {}),
        };

        const { id: childId } = await createChild(childPayload);
        await updateSelectedChild(userId, childId);
        if (region || interestAreas.length > 0) {
          await updateDoc(doc(db, 'users', userId), {
            ...(region ? { region } : {}),
            ...(interestAreas.length > 0 ? { interestAreas } : {}),
          }).catch(() => {});
        }
      } catch (error) {
        // Non-blocking — the user should still reach the app even if the
        // profile write fails (e.g. transient network error); ChildAddScreen
        // remains available as a manual retry path from My Page.
        console.log('[Onboarding] failed to persist child profile:', error?.message || error);
      }

      await AsyncStorage.setItem('@onboarding_completed', 'true');
      navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
    }, 2000);
  };

  // Validations
  // T1: lastName is optional — not included in born validation
  const step1Valid = (() => {
    if (!childStatus) return false;
    if (childStatus === 'born')     return !!birthDate && !!gender && firstName.trim().length > 0;
    if (childStatus === 'pregnant') return !!dueDate;
    if (childStatus === 'planning') return !!planningPeriod;
    return false;
  })();

  // 수유방식/알레르기는 자녀있음 상태에서만 노출되는 질문이라 그때만 필수.
  // 육아환경은 매칭 가중치에서 감쇠 대상(§5.4)이라 선택 사항 — 미입력 시 매칭에서만 제외.
  const bornOnlyFieldsRequired = childStatus === 'born';
  const step2Valid = !bornOnlyFieldsRequired || (allergyTags.length > 0 && !!feedingType);

  // ── Labor Illusion Loading Screen ────────────────────────────────────────────
  if (isCurating) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', padding: 32 }}>
        <ActivityIndicator size="large" color="#2E6FF2" />
        <Text style={{ marginTop: 20, fontSize: 16, fontWeight: '600', color: '#334155', textAlign: 'center', lineHeight: 26 }}>
          입력하신 정보를 바탕으로{"\n"}맞춤 핫딜을 세팅 중입니다...
        </Text>
      </SafeAreaView>
    );
  }

  // ── Step 0: Intro ────────────────────────────────────────────────────────────
  if (step === 0) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#2E6FF2', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <Text style={{ fontSize: 40, marginBottom: 20 }}>🎁</Text>
        <Text style={{ fontSize: 28, fontWeight: 'bold', color: '#fff', textAlign: 'center', marginBottom: 16 }}>
          육아 필수템 핫딜,{"\n"}이제 놓치지 마세요!
        </Text>
        <Text style={{ fontSize: 16, color: '#DBEAFE', textAlign: 'center', lineHeight: 24 }}>
          우리아이 월령에 딱 맞는 맞춤 추천부터{"\n"}최저가 알림까지 세이브루가 도와드릴게요.
        </Text>
        <TouchableOpacity
          onPress={() => setStep(1)}
          style={{ backgroundColor: '#fff', width: '100%', padding: 18, borderRadius: 16, alignItems: 'center', position: 'absolute', bottom: 40 }}
        >
          <Text style={{ color: '#2E6FF2', fontSize: 18, fontWeight: 'bold' }}>다음으로</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // ── Step 1: Child Status + Progressive Disclosure ────────────────────────────
  if (step === 1) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingBottom: 300 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={{ fontSize: 13, color: '#94a3b8', textAlign: 'right', marginTop: 20 }}>1 / {TOTAL_DATA_STEPS}</Text>
            <Text style={{ fontSize: 26, fontWeight: 'bold', color: '#0f172a', marginTop: 8, marginBottom: 8, lineHeight: 36 }}>
              지금 우리 아이는{"\n"}어떤 시기인가요?
            </Text>
            <Text style={{ fontSize: 15, color: '#64748b', marginBottom: 28 }}>
              내 아이 정보에 맞춰 인기, 적합, 최저가 상품을 알려드릴게요.
            </Text>

            <Text style={{ fontSize: 13, fontWeight: '700', color: '#64748b', marginBottom: 10 }}>현재 상태</Text>
            {[
              { key: 'born',     label: '이미 태어났어요' },
              { key: 'pregnant', label: '임신 중이에요' },
              { key: 'planning', label: '임신을 계획 중이에요' },
            ].map(({ key, label }) => (
              <TouchableOpacity
                key={key}
                onPress={() => setChildStatus(key)}
                style={{
                  padding: 18, borderRadius: 12, borderWidth: 1.5, marginBottom: 10, alignItems: 'center',
                  borderColor: childStatus === key ? '#2E6FF2' : '#e2e8f0',
                  backgroundColor: childStatus === key ? '#EFF6FF' : '#F8FAFC',
                }}
              >
                <Text style={{ fontSize: 16, fontWeight: childStatus === key ? 'bold' : '500', color: childStatus === key ? '#2E6FF2' : '#334155' }}>
                  {label}
                </Text>
              </TouchableOpacity>
            ))}

            {/* born — progressive disclosure: Name → Gender → Birthdate */}
            {childStatus === 'born' && (
              <View style={{ marginTop: 20, gap: 14 }}>
                {/* T1: lastName marked (선택), CTA enabled without it */}
                <View>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#64748b', marginBottom: 8 }}>이름</Text>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TextInput
                      style={{ flex: 1, borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: '#0f172a', backgroundColor: '#F8FAFC' }}
                      placeholder="성 (선택)"
                      placeholderTextColor="#94a3b8"
                      value={lastName}
                      onChangeText={setLastName}
                      returnKeyType="done"
                      onSubmitEditing={Keyboard.dismiss}
                    />
                    <TextInput
                      style={{ flex: 2, borderWidth: 1.5, borderColor: firstName.trim().length > 0 ? '#2E6FF2' : '#e2e8f0', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: '#0f172a', backgroundColor: '#F8FAFC' }}
                      placeholder="이름 (필수)"
                      placeholderTextColor="#94a3b8"
                      value={firstName}
                      onChangeText={setFirstName}
                      returnKeyType="done"
                      onSubmitEditing={Keyboard.dismiss}
                    />
                  </View>
                </View>

                {firstName.trim().length > 0 && (
                  <View>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#64748b', marginBottom: 8 }}>성별 <Text style={{ color: '#ef4444' }}>*</Text></Text>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      {[{ val: 'female', label: '여아' }, { val: 'male', label: '남아' }].map(g => (
                        <TouchableOpacity
                          key={g.val}
                          onPress={() => setGender(g.val)}
                          style={{ flex: 1, padding: 14, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', borderColor: gender === g.val ? '#2E6FF2' : '#e2e8f0', backgroundColor: gender === g.val ? '#EFF6FF' : '#F8FAFC' }}
                        >
                          <Text style={{ fontSize: 15, fontWeight: gender === g.val ? 'bold' : '500', color: gender === g.val ? '#2E6FF2' : '#334155' }}>{g.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}

                {(firstName.trim().length > 0 && gender) && (
                  <View>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#64748b', marginBottom: 8 }}>생년월일 <Text style={{ color: '#ef4444' }}>*</Text></Text>
                    <TouchableOpacity
                      onPress={() => openDatePicker('born')}
                      style={{ borderWidth: 1.5, borderColor: birthDate ? '#2E6FF2' : '#e2e8f0', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#F8FAFC', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                    >
                      <Text style={{ fontSize: 16, color: birthDate ? '#0f172a' : '#94a3b8' }}>{formatDate(birthDate) || '날짜를 선택해 주세요'}</Text>
                      <Text style={{ fontSize: 16, color: '#94a3b8' }}>{'>'}</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* 조산 여부 — WHO 기준(37주 미만) 보정연령 계산용, 선택 사항 */}
                {(firstName.trim().length > 0 && gender && birthDate) && (
                  <YesNoToggle question="예정일보다 일찍 태어났나요? (조산)" value={isPremature} onSelect={setIsPremature} />
                )}
              </View>
            )}

            {/* pregnant — T2&T3: KAV wrap for nickname, maximumDate, microcopy */}
            {childStatus === 'pregnant' && (
              <View style={{ marginTop: 20, gap: 14 }}>
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#64748b', marginBottom: 8 }}>태명 (선택)</Text>
                  <TextInput
                    style={{ borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: '#0f172a', backgroundColor: '#F8FAFC' }}
                    placeholder="예: 햇살이"
                    placeholderTextColor="#94a3b8"
                    value={taemyeong}
                    onChangeText={setTaemyeong}
                  />
                </KeyboardAvoidingView>
                <View>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#64748b', marginBottom: 8 }}>출산 예정일 <Text style={{ color: '#ef4444' }}>*</Text></Text>
                  <TouchableOpacity
                    onPress={() => openDatePicker('pregnant')}
                    style={{ borderWidth: 1.5, borderColor: dueDate ? '#2E6FF2' : '#e2e8f0', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#F8FAFC', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                  >
                    <Text style={{ fontSize: 16, color: dueDate ? '#0f172a' : '#94a3b8' }}>{formatDate(dueDate) || '날짜를 선택해 주세요'}</Text>
                    <Text style={{ fontSize: 16, color: '#94a3b8' }}>{'>'}</Text>
                  </TouchableOpacity>
                  <Text style={{ fontSize: 12, color: '#94a3b8', marginTop: 6, lineHeight: 18 }}>
                    정확하지 않아도 괜찮아요! 대략적인 날짜로 맞춤 상품을 찾아드릴게요.
                  </Text>
                </View>
              </View>
            )}

            {/* planning */}
            {childStatus === 'planning' && (
              <View style={{ marginTop: 20 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#64748b', marginBottom: 10 }}>계획 시기</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                  {PLANNING_PERIODS.map(p => (
                    <Chip key={p} label={p} active={planningPeriod === p} onPress={() => setPlanningPeriod(p)} />
                  ))}
                </View>
              </View>
            )}
          </ScrollView>

          <NavBar onPrev={() => setStep(0)} onNext={() => setStep(2)} nextDisabled={!step1Valid} />
        </KeyboardAvoidingView>

        {/* Date Picker Bottom Sheet */}
        <Modal transparent visible={showDatePicker} animationType="slide" onRequestClose={() => setShowDatePicker(false)}>
          <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} activeOpacity={1} onPress={() => setShowDatePicker(false)} />
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 }}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: '#0f172a', textAlign: 'center', marginBottom: 16 }}>날짜 선택</Text>
            <SpinnerPicker
              key={datePickerTarget}
              selectedDate={tempDate}
              onSelect={setTempDate}
              minimumDate={datePickerTarget === 'pregnant' ? new Date() : undefined}
              maximumDate={datePickerTarget === 'pregnant' ? new Date(Date.now() + 300 * 24 * 60 * 60 * 1000) : undefined}
            />
            <TouchableOpacity onPress={confirmDate} style={{ backgroundColor: '#2E6FF2', padding: 16, borderRadius: 14, alignItems: 'center', marginTop: 20 }}>
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>확인</Text>
            </TouchableOpacity>
          </View>
        </Modal>
      </SafeAreaView>
    );
  }

  // ── Step 2: Parenting Environment + Pets ─────────────────────────────────────
  if (step === 2) {
    // T4: dynamic header copy
    const step2Header = childStatus === 'born'
      ? "어떤 환경에서\n육아하고 계세요?"
      : "현재 어떤 환경에서\n지내고 계세요?";

    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView
            contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 120 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={{ fontSize: 13, color: '#94a3b8', textAlign: 'right', marginTop: 20 }}>2 / {TOTAL_DATA_STEPS}</Text>
            <Text style={{ fontSize: 26, fontWeight: 'bold', color: '#0f172a', marginTop: 8, marginBottom: 8, lineHeight: 36 }}>
              {step2Header}
            </Text>
            <Text style={{ fontSize: 15, color: '#64748b', marginBottom: 28 }}>
              비슷한 환경의 부모님이 선택한 제품을 추천해 드릴게요.
            </Text>

            <Text style={{ fontSize: 13, fontWeight: '700', color: '#64748b', marginBottom: 10 }}>거주 지역</Text>
            <TouchableOpacity
              onPress={() => setShowRegionPicker(true)}
              style={{ borderWidth: 1.5, borderColor: region ? '#2E6FF2' : '#e2e8f0', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#F8FAFC', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}
            >
              <Text style={{ fontSize: 16, color: region ? '#0f172a' : '#94a3b8' }}>{region || '지역을 선택해 주세요'}</Text>
              <Text style={{ fontSize: 16, color: '#94a3b8' }}>{'>'}</Text>
            </TouchableOpacity>

            {/* 육아환경 — 전체 상태 공통으로 묻되, 라벨은 상태에 맞게 다르게.
                "워킹맘"처럼 현재형 단어를 임신중/계획중에 그대로 쓰면 어색해서
                저장값은 동일하게 유지한 채 표시 라벨만 상태별로 분기한다.
                복직 여부 등은 시간이 지나며 바뀌기 쉬운데(§5.4 가중치 감쇠 대상)
                재입력을 강제할 만큼 중요한 매칭 축은 아니라 선택 사항으로 둔다. */}
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#64748b', marginBottom: 10 }}>
              {childStatus === 'born' ? '육아 환경' : '출산 후 육아 계획'} (복수 선택 가능, 선택)
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 28 }}>
              {PARENTING_ENV_OPTS.map(opt => (
                <Chip
                  key={opt}
                  label={(childStatus === 'born' ? PARENTING_ENV_LABEL.born : PARENTING_ENV_LABEL.preBirth)[opt]}
                  active={parentingEnv.includes(opt)}
                  onPress={() => toggleParentingEnv(opt)}
                />
              ))}
              {childStatus !== 'born' && (
                <Chip label={UNDECIDED_ENV} active={parentingEnv.includes(UNDECIDED_ENV)} onPress={() => toggleParentingEnv(UNDECIDED_ENV)} />
              )}
            </View>

            {/* 수유방식/알레르기 — 둘 다 '아이가 실제로 존재해야' 답할 수
                있는 질문이라 자녀있음 상태에서만 노출한다. 임신중/계획중인
                유저에게 "아이 알레르기"를 물어보는 건 원리적으로 불가능한
                질문이었다. */}
            {childStatus === 'born' && (
              <>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#64748b', marginBottom: 10 }}>수유 방식 <Text style={{ color: '#ef4444' }}>*</Text></Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 28 }}>
                  {FEEDING_TYPES.map(ft => (
                    <Chip key={ft.key} label={ft.label} active={feedingType === ft.key} onPress={() => setFeedingType(ft.key)} />
                  ))}
                </View>

                <Text style={{ fontSize: 13, fontWeight: '700', color: '#64748b', marginBottom: 10 }}>알레르기/특이사항 (복수 선택 가능) <Text style={{ color: '#ef4444' }}>*</Text></Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 }}>
                  {ALLERGY_TAGS.map(tag => (
                    <Chip key={tag} label={tag} active={allergyTags.includes(tag)} onPress={() => toggleAllergy(tag)} />
                  ))}
                </View>
                {/* '기타' 선택 시에만 — 프리셋에 없는 알레르기는 매칭에서 '기타'
                    태그만으로는 아무 변별력이 없어서, 구체적인 텍스트를 받아둔다. */}
                {allergyTags.includes('기타') && (
                  <TextInput
                    style={{ borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, color: '#0f172a', backgroundColor: '#F8FAFC', marginBottom: 20 }}
                    placeholder="어떤 알레르기인지 적어주세요 (예: 복숭아)"
                    placeholderTextColor="#94a3b8"
                    value={allergyOtherNote}
                    onChangeText={setAllergyOtherNote}
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                  />
                )}
              </>
            )}

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16, marginTop: 8, borderTopWidth: 1, borderTopColor: '#F1F5F9' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '600', color: '#0F172A' }}>쿠팡 와우 회원이신가요?</Text>
                <Text style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>와우 회원가로 가격을 표시합니다</Text>
              </View>
              <Switch
                value={isWowMember}
                onValueChange={setIsWowMember}
                trackColor={{ false: '#E2E8F0', true: '#BFDBFE' }}
                thumbColor={isWowMember ? '#2E6FF2' : '#94A3B8'}
              />
            </View>
          </ScrollView>

          <NavBar onPrev={() => setStep(1)} onNext={() => setStep(3)} nextDisabled={!step2Valid} />
        </KeyboardAvoidingView>

        {/* Region Picker Bottom Sheet */}
        <Modal transparent visible={showRegionPicker} animationType="slide" onRequestClose={() => setShowRegionPicker(false)}>
          <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} activeOpacity={1} onPress={() => setShowRegionPicker(false)} />
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40, maxHeight: '60%' }}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: '#0f172a', textAlign: 'center', marginBottom: 16 }}>거주 지역 선택</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {REGIONS.map(r => (
                <TouchableOpacity key={r} onPress={() => { setRegion(r); setShowRegionPicker(false); }} style={{ paddingVertical: 14, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 16, color: region === r ? '#2E6FF2' : '#0f172a', fontWeight: region === r ? '700' : '400' }}>{r}</Text>
                  {region === r && <Text style={{ color: '#2E6FF2', fontSize: 16 }}>✓</Text>}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </Modal>
      </SafeAreaView>
    );
  }

  // ── Step 3: Interest Categories ──────────────────────────────────────────────
  if (step === 3) {
    const step3Valid  = selectedInterests.length > 0;
    // T7: planning path uses CONCERNS_PLANNING
    const concernList = childStatus === 'born'
      ? CONCERNS_BORN
      : childStatus === 'planning'
        ? CONCERNS_PLANNING
        : CONCERNS_PREGNANT;

    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
        >
          <Text style={{ fontSize: 13, color: '#94a3b8', textAlign: 'right', marginTop: 20 }}>3 / {TOTAL_DATA_STEPS}</Text>
          <Text style={{ fontSize: 26, fontWeight: 'bold', color: '#0f172a', marginTop: 8, marginBottom: 8, lineHeight: 36 }}>
            요즘 가장 관심갖고{"\n"}있는 내용
          </Text>
          <Text style={{ fontSize: 15, color: '#64748b', marginBottom: 28 }}>
            관심 카테고리 (최대 3개 선택, 없다면 '없음' 선택)
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
            {concernList.map(label => {
              const active = selectedInterests.includes(label);
              return (
                <TouchableOpacity
                  key={label}
                  onPress={() => toggleInterest(label)}
                  activeOpacity={0.8}
                  style={{
                    width: '48%', paddingVertical: 16, borderRadius: 12,
                    borderWidth: 1.5,
                    borderColor: active ? '#2E6FF2' : '#e2e8f0',
                    backgroundColor: active ? '#EFF6FF' : '#F8FAFC',
                    alignItems: 'center', marginBottom: 12,
                  }}
                >
                  <Text style={{ fontSize: 14, fontWeight: active ? '700' : '500', color: active ? '#2E6FF2' : '#334155' }}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* 관심 확장 영역 — 가볍게, 건너뛰어도 되는 의향 신호 (스킵 가능, 필수 아님) */}
          <Text style={{ fontSize: 15, fontWeight: '700', color: '#0f172a', marginTop: 12, marginBottom: 4 }}>
            앞으로 어떤 정보를 더 받아보고 싶으세요?
          </Text>
          <Text style={{ fontSize: 13, color: '#94a3b8', marginBottom: 14 }}>
            선택하지 않아도 괜찮아요. 나중에 마이페이지에서 바꿀 수 있어요.
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {INTEREST_AREAS.map(area => (
              <Chip
                key={area.key}
                label={area.label}
                active={interestAreas.includes(area.key)}
                onPress={() => toggleInterestArea(area.key)}
              />
            ))}
          </View>
        </ScrollView>

        <View style={{ paddingHorizontal: 24, paddingBottom: 20, paddingTop: 12, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f1f5f9', flexDirection: 'row' }}>
          <TouchableOpacity onPress={() => setStep(2)} style={{ padding: 18, borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0', marginRight: 12, alignItems: 'center', width: 80 }}>
            <Text style={{ color: '#64748b', fontSize: 16, fontWeight: 'bold' }}>이전</Text>
          </TouchableOpacity>
          <TouchableOpacity
            disabled={!step3Valid}
            onPress={finishOnboarding}
            style={{ flex: 1, backgroundColor: step3Valid ? '#2E6FF2' : '#E2E8F0', padding: 18, borderRadius: 16, alignItems: 'center' }}
          >
            <Text style={{ color: step3Valid ? '#fff' : '#94a3b8', fontSize: 18, fontWeight: 'bold' }}>맞춤 추천 시작하기</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }
}
