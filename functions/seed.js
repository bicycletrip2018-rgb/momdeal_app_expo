/**
 * seed.js — One-time script to seed initial monetization products.
 *
 * Run from the functions/ directory:
 *   node seed.js
 *
 * Prerequisites:
 *   firebase login          (Firebase CLI must be installed and authenticated)
 *   firebase use momdeal-494c4
 *
 *   OR set GOOGLE_APPLICATION_CREDENTIALS to a service account key JSON path.
 *
 * After seeding, replace each `affiliateUrl` value in Firestore with a real
 * Coupang Partners short link:
 *   → https://partners.coupang.com → [링크 생성] → 단축 URL 복사
 *
 * Products with `affiliateUrl` set will use that link immediately when the
 * purchase button is tapped — no API key required.
 */

'use strict';

const admin = require('firebase-admin');

admin.initializeApp({ projectId: 'momdeal-494c4' });
const db = admin.firestore();
const NOW = admin.firestore.FieldValue.serverTimestamp();

// ─── Product catalog ──────────────────────────────────────────────────────────
//
// Focus categories (per monetization strategy):
//   - 육아 필수 소비재: diapers, wipes, formula, skincare
//   - 가격 변동 상품:   formula, diapers (promo cycles), branded skincare
//   - 반복 구매 상품:   diapers, wipes, formula, laundry detergent, storage bags
//
// stageTags must match the stage ladder:
//   pregnancy | newborn | early_infant | infant | toddler | early_child | child
//
// categoryTags must match productTagService keywords:
//   diaper | feeding | bath | play | outing | general

const PRODUCTS = [

  // ─── 기저귀 (4종) ─────────────────────────────────────────────────────────
  {
    productId: 'seed-pampers-nb',
    name: '팸퍼스 하이얀 기저귀 신생아 소형 76매',
    brand: 'Pampers',
    category: '기저귀',
    currentPrice: 28900,
    stageTags: ['newborn'],
    categoryTags: ['diaper'],
    problemTags: ['diaper_rash'],
    image: 'https://picsum.photos/seed/pampers-nb/300/300',
    affiliateUrl: 'https://link.coupang.com/a/REPLACE_ME_1',
  },
  {
    productId: 'seed-huggies-sm',
    name: '하기스 맥스드라이 소형 기저귀 60매',
    brand: 'Huggies',
    category: '기저귀',
    currentPrice: 24900,
    stageTags: ['early_infant'],
    categoryTags: ['diaper'],
    problemTags: ['diaper_rash', 'diaper_leak'],
    image: 'https://picsum.photos/seed/huggies-sm/300/300',
    affiliateUrl: 'https://link.coupang.com/a/REPLACE_ME_2',
  },
  {
    productId: 'seed-mamypoko-m',
    name: '마미포코 오리지날 기저귀 M형 50매',
    brand: 'Mamypoko',
    category: '기저귀',
    currentPrice: 22900,
    stageTags: ['infant'],
    categoryTags: ['diaper'],
    problemTags: ['diaper_rash'],
    image: 'https://picsum.photos/seed/mamypoko-m/300/300',
    affiliateUrl: 'https://link.coupang.com/a/REPLACE_ME_3',
  },
  {
    productId: 'seed-mamypoko-xl-pants',
    name: '마미포코 팬티형 기저귀 XL 36매',
    brand: 'Mamypoko',
    category: '기저귀',
    currentPrice: 21900,
    stageTags: ['toddler'],
    categoryTags: ['diaper'],
    problemTags: [],
    image: 'https://picsum.photos/seed/mamypoko-xl/300/300',
    affiliateUrl: 'https://link.coupang.com/a/REPLACE_ME_4',
  },

  // ─── 물티슈 (3종) ─────────────────────────────────────────────────────────
  {
    productId: 'seed-koala-wipes',
    name: '코얼라 아기물티슈 100매 × 10팩',
    brand: '코얼라',
    category: '물티슈',
    currentPrice: 19900,
    stageTags: ['newborn', 'early_infant', 'infant', 'toddler'],
    categoryTags: ['general'],
    problemTags: [],
    image: 'https://picsum.photos/seed/koala-wipes/300/300',
    affiliateUrl: 'https://link.coupang.com/a/REPLACE_ME_5',
  },
  {
    productId: 'seed-bebbian-wipes',
    name: '베비안 순수 물티슈 70매 × 10팩',
    brand: '베비안',
    category: '물티슈',
    currentPrice: 17900,
    stageTags: ['newborn', 'early_infant', 'infant', 'toddler'],
    categoryTags: ['general'],
    problemTags: [],
    image: 'https://picsum.photos/seed/bebbian-wipes/300/300',
    affiliateUrl: 'https://link.coupang.com/a/REPLACE_ME_6',
  },
  {
    productId: 'seed-nature-wipes',
    name: '네이처러브메레 무형광 아기물티슈 80매 × 10팩',
    brand: '네이처러브메레',
    category: '물티슈',
    currentPrice: 22900,
    stageTags: ['newborn', 'early_infant', 'infant'],
    categoryTags: ['general'],
    problemTags: [],
    image: 'https://picsum.photos/seed/nature-wipes/300/300',
    affiliateUrl: 'https://link.coupang.com/a/REPLACE_ME_7',
  },

  // ─── 분유 (3종) ───────────────────────────────────────────────────────────
  {
    productId: 'seed-hiqq-1',
    name: '일동후디스 하이큐 1단계 분유 800g',
    brand: '일동후디스',
    category: '분유',
    currentPrice: 34900,
    stageTags: ['newborn', 'early_infant'],
    categoryTags: ['feeding'],
    problemTags: [],
    image: 'https://picsum.photos/seed/hiqq-1/300/300',
    affiliateUrl: 'https://link.coupang.com/a/REPLACE_ME_8',
  },
  {
    productId: 'seed-maeil-2',
    name: '매일 앱솔루트 명작 분유 2단계 800g',
    brand: '매일유업',
    category: '분유',
    currentPrice: 36900,
    stageTags: ['early_infant', 'infant'],
    categoryTags: ['feeding'],
    problemTags: [],
    image: 'https://picsum.photos/seed/maeil-2/300/300',
    affiliateUrl: 'https://link.coupang.com/a/REPLACE_ME_9',
  },
  {
    productId: 'seed-namyang-3',
    name: '남양 아이엠마더 분유 3단계 800g',
    brand: '남양유업',
    category: '분유',
    currentPrice: 32900,
    stageTags: ['infant', 'toddler'],
    categoryTags: ['feeding'],
    problemTags: [],
    image: 'https://picsum.photos/seed/namyang-3/300/300',
    affiliateUrl: 'https://link.coupang.com/a/REPLACE_ME_10',
  },

  // ─── 젖병 (2종) ───────────────────────────────────────────────────────────
  {
    productId: 'seed-avent-glass-120',
    name: 'Philips Avent 자연감지 유리젖병 120ml',
    brand: 'Philips Avent',
    category: '젖병',
    currentPrice: 18900,
    stageTags: ['newborn'],
    categoryTags: ['feeding'],
    problemTags: [],
    image: 'https://picsum.photos/seed/avent-glass/300/300',
    affiliateUrl: 'https://link.coupang.com/a/REPLACE_ME_11',
  },
  {
    productId: 'seed-nuk-fc-150',
    name: 'NUK 퍼스트초이스+ 젖병 150ml',
    brand: 'NUK',
    category: '젖병',
    currentPrice: 16900,
    stageTags: ['newborn', 'early_infant'],
    categoryTags: ['feeding'],
    problemTags: [],
    image: 'https://picsum.photos/seed/nuk-fc/300/300',
    affiliateUrl: 'https://link.coupang.com/a/REPLACE_ME_12',
  },

  // ─── 목욕·스킨케어 (3종) ─────────────────────────────────────────────────
  {
    productId: 'seed-johnsons-lotion',
    name: '존슨즈베이비 베이비로션 500ml',
    brand: "Johnson's",
    category: '스킨케어',
    currentPrice: 11900,
    stageTags: ['newborn', 'early_infant', 'infant'],
    categoryTags: ['bath'],
    problemTags: ['skin_dry'],
    image: 'https://picsum.photos/seed/johnsons-lotion/300/300',
    affiliateUrl: 'https://link.coupang.com/a/REPLACE_ME_13',
  },
  {
    productId: 'seed-pigeon-detergent',
    name: '피죤 아기 베이비 세탁세제 2.5L',
    brand: '피죤',
    category: '세탁세제',
    currentPrice: 14900,
    stageTags: ['newborn', 'early_infant', 'infant', 'toddler'],
    categoryTags: ['general'],
    problemTags: [],
    image: 'https://picsum.photos/seed/pigeon-detergent/300/300',
    affiliateUrl: 'https://link.coupang.com/a/REPLACE_ME_14',
  },
  {
    productId: 'seed-boryung-oil',
    name: '보령메디앙스 아토오일 베이비 200ml',
    brand: '보령메디앙스',
    category: '스킨케어',
    currentPrice: 16900,
    stageTags: ['newborn', 'early_infant'],
    categoryTags: ['bath'],
    problemTags: ['skin_dry'],
    image: 'https://picsum.photos/seed/boryung-oil/300/300',
    affiliateUrl: 'https://link.coupang.com/a/REPLACE_ME_15',
  },

  // ─── 모유·이유식 (2종) ───────────────────────────────────────────────────
  {
    productId: 'seed-coconut-bag',
    name: '코코넛 모유저장팩 200ml 30매',
    brand: '코코넛',
    category: '모유용품',
    currentPrice: 8900,
    stageTags: ['newborn', 'early_infant'],
    categoryTags: ['feeding'],
    problemTags: [],
    image: 'https://picsum.photos/seed/coconut-bag/300/300',
    affiliateUrl: 'https://link.coupang.com/a/REPLACE_ME_16',
  },
  {
    productId: 'seed-babybon-weaning',
    name: '베이비본죽 완료기 이유식 세트 6팩',
    brand: '베이비본죽',
    category: '이유식',
    currentPrice: 29900,
    stageTags: ['infant', 'toddler'],
    categoryTags: ['feeding'],
    problemTags: [],
    image: 'https://picsum.photos/seed/babybon-weaning/300/300',
    affiliateUrl: 'https://link.coupang.com/a/REPLACE_ME_17',
  },

  // ─── 건강·안전 (3종) ─────────────────────────────────────────────────────
  {
    productId: 'seed-braun-thermometer',
    name: 'Braun 귀체온계 IRT-6520',
    brand: 'Braun',
    category: '체온계',
    currentPrice: 49900,
    stageTags: ['newborn', 'early_infant', 'infant', 'toddler'],
    categoryTags: ['general'],
    problemTags: [],
    image: 'https://picsum.photos/seed/braun-thermo/300/300',
    affiliateUrl: 'https://link.coupang.com/a/REPLACE_ME_18',
  },
  {
    productId: 'seed-pigeon-brush-set',
    name: '피죤 젖병세정제 + 젖병솔 세트',
    brand: '피죤',
    category: '젖병세정',
    currentPrice: 13900,
    stageTags: ['newborn', 'early_infant'],
    categoryTags: ['feeding'],
    problemTags: [],
    image: 'https://picsum.photos/seed/pigeon-brush/300/300',
    affiliateUrl: 'https://link.coupang.com/a/REPLACE_ME_19',
  },
  {
    productId: 'seed-iangel-cushion',
    name: '아이엔젤 소프트 쿠션 범퍼침대 M',
    brand: '아이엔젤',
    category: '침대·범퍼',
    currentPrice: 89000,
    stageTags: ['early_infant', 'infant'],
    categoryTags: ['play'],
    problemTags: [],
    image: 'https://picsum.photos/seed/iangel-cushion/300/300',
    affiliateUrl: 'https://link.coupang.com/a/REPLACE_ME_20',
  },

];

// ─── Runner ───────────────────────────────────────────────────────────────────

async function seed() {
  console.log(`Seeding ${PRODUCTS.length} products → Firestore project: momdeal-494c4\n`);

  let created = 0;
  let skipped = 0;

  for (const product of PRODUCTS) {
    const { productId, ...data } = product;
    const ref = db.collection('products').doc(productId);
    const existing = await ref.get();

    if (existing.exists) {
      console.log(`  SKIP   ${productId}`);
      skipped++;
      continue;
    }

    await ref.set({
      ...data,
      productId,
      status: 'active',
      source: 'manual',
      ageMinMonth: null,
      ageMaxMonth: null,
      createdAt: NOW,
      updatedAt: NOW,
    });

    console.log(`  OK     ${productId} — ${data.name}`);
    created++;
  }

  console.log(`\n✓ Done. ${created} created, ${skipped} already existed.\n`);
  console.log('Next steps:');
  console.log('  1. Go to https://partners.coupang.com → [링크 생성] → 단축 URL 복사');
  console.log('  2. In Firestore console, open each seed-* product document');
  console.log('  3. Replace the REPLACE_ME_N placeholder in affiliateUrl with the real short link');
  console.log('  4. Once replaced, purchase taps will route to the real affiliate URL immediately');
}

seed().catch(console.error).finally(() => process.exit());
