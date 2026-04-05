const normalizeText = (value) => String(value || '').toLowerCase();

const hasAnyKeyword = (text, keywords) =>
  keywords.some((keyword) => text.includes(keyword));

// ---------------------------------------------------------------------------
// Stage-keyword map — aligned with childStageUtils.js getMvpChildStage()
// Each entry yields one stage tag when ANY of its keywords match the product
// name/category. A product can accumulate multiple stage tags (additive).
// ---------------------------------------------------------------------------
const STAGE_KEYWORD_MAP = [
  {
    stage: 'pregnancy',
    keywords: ['임신', '태교', '산전', '태아', '출산준비', '임부', '산모'],
  },
  {
    stage: 'newborn',
    keywords: [
      '신생아', '1단계', '0개월', '1개월', '2개월',
      'newborn', '갓난', '초신생아',
    ],
  },
  {
    stage: 'early_infant',
    keywords: [
      '2단계', '3개월', '4개월', '5개월', '백일',
    ],
  },
  {
    stage: 'infant',
    keywords: [
      '3단계', '6개월', '7개월', '8개월', '9개월', '10개월', '11개월',
      '이유식', '초기이유식', '중기이유식', '후기이유식',
    ],
  },
  {
    stage: 'toddler',
    keywords: [
      '4단계', '돌', '12개월', '13개월', '14개월', '15개월',
      '16개월', '17개월', '18개월', '걸음마', '첫돌', '1세', '유아',
    ],
  },
  {
    stage: 'early_child',
    keywords: [
      '5단계', '24개월', '2세', '3세', '두돌', '세돌',
      '어린이집', '유치원준비',
    ],
  },
  {
    stage: 'child',
    keywords: ['4세', '5세', '6세', '7세', '어린이', '초등', '6단계'],
  },
];

// ---------------------------------------------------------------------------
// Category-keyword map
// Primary rule: first match wins for categoryTags and default stageTags.
// Supplemental KEYWORD_DICT below can add extra categoryTags afterwards.
// ---------------------------------------------------------------------------
const CATEGORY_RULES = [
  {
    keywords: ['기저귀', 'diaper'],
    categoryTags: ['diaper'],
    defaultStageTags: ['newborn', 'early_infant', 'infant', 'toddler'],
    problemTags: ['diaper_leak', 'night_diaper'],
  },
  {
    keywords: ['물티슈', 'wipes', 'wipe'],
    categoryTags: ['diaper'],
    defaultStageTags: ['newborn', 'early_infant', 'infant', 'toddler'],
    problemTags: ['diaper_leak'],
  },
  {
    keywords: ['분유', 'formula'],
    categoryTags: ['feeding'],
    defaultStageTags: ['newborn', 'early_infant', 'infant'],
    problemTags: [],
  },
  {
    keywords: ['이유식', 'baby food'],
    categoryTags: ['feeding'],
    defaultStageTags: ['infant', 'toddler'],
    problemTags: [],
  },
  {
    keywords: ['수유', '젖병', 'feeding', 'milk', 'bottle', 'breast'],
    categoryTags: ['feeding'],
    defaultStageTags: ['newborn', 'early_infant'],
    problemTags: [],
  },
  {
    keywords: ['목욕', '위생', 'bath', 'wash', '샴푸', '바디워시'],
    categoryTags: ['bath'],
    defaultStageTags: ['newborn', 'early_infant', 'infant'],
    problemTags: [],
  },
  {
    keywords: ['놀이', '완구', 'play', 'toy', '장난감', '블록'],
    categoryTags: ['play'],
    defaultStageTags: ['infant', 'toddler', 'early_child'],
    problemTags: [],
  },
  {
    keywords: ['외출', '유모차', '카시트', 'stroller', 'carseat'],
    categoryTags: ['outing'],
    defaultStageTags: ['newborn', 'early_infant', 'infant', 'toddler'],
    problemTags: [],
  },
  {
    keywords: ['침대', '바운서', '요람', '아기침대'],
    categoryTags: ['sleep'],
    defaultStageTags: ['newborn', 'early_infant', 'infant'],
    problemTags: [],
  },
  {
    keywords: ['안전', '가드', '모서리', '안전문'],
    categoryTags: ['safety'],
    defaultStageTags: ['toddler', 'early_child'],
    problemTags: [],
  },
];

// Supplemental dictionary — merges additional categoryTags regardless of primary rule
const KEYWORD_DICT = [
  { keywords: ['피부', '예민', '트러블'], tags: ['hygiene'] },
  { keywords: ['냄새', '흡수'],           tags: ['diaper'] },
  { keywords: ['수유', '분유'],           tags: ['feeding'] },
  { keywords: ['놀이', '장난감'],         tags: ['play'] },
];

export function generateProductTags(product) {
  const categoryText = normalizeText(product?.category);
  const nameText = normalizeText(product?.name);
  const combined = `${categoryText} ${nameText}`;

  // ── Step 1: stage-keyword scan (additive — collects all matching stages) ──
  const stageTagSet = new Set();
  STAGE_KEYWORD_MAP.forEach(({ stage, keywords }) => {
    if (hasAnyKeyword(combined, keywords)) {
      stageTagSet.add(stage);
    }
  });

  // ── Step 2: category-rule scan (first match wins for category + defaults) ──
  let categoryTags = [];
  let problemTags = [];
  let defaultStageTags = [];

  const matchedRule = CATEGORY_RULES.find(({ keywords }) =>
    hasAnyKeyword(combined, keywords)
  );

  if (matchedRule) {
    categoryTags = matchedRule.categoryTags;
    problemTags = matchedRule.problemTags;
    defaultStageTags = matchedRule.defaultStageTags;
  } else {
    categoryTags = ['general'];
    defaultStageTags = ['infant'];
  }

  // ── Step 3: merge stages — explicit keyword hits take priority;
  //    fall back to category defaults only when nothing was detected ──
  const stageTags =
    stageTagSet.size > 0
      ? [...stageTagSet]
      : defaultStageTags;

  // ── Step 4: supplemental category tags ──
  const extraTags = new Set();
  KEYWORD_DICT.forEach(({ keywords, tags }) => {
    if (hasAnyKeyword(combined, keywords)) {
      tags.forEach((t) => extraTags.add(t));
    }
  });

  const mergedCategoryTags = [...new Set([...categoryTags, ...extraTags])];

  return {
    stageTags,
    problemTags,
    categoryTags: mergedCategoryTags,
  };
}
