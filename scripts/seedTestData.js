/**
 * MomDeal — Development Data Seeder
 *
 * Populates Firestore with realistic test data for local development.
 * Safe to run multiple times — each run appends new documents.
 *
 * Requirements: Node.js >= 18
 * Usage:        node scripts/seedTestData.js
 */

import { initializeApp } from 'firebase/app';
import {
  addDoc,
  collection,
  getFirestore,
  serverTimestamp,
  Timestamp,
  writeBatch,
  doc,
} from 'firebase/firestore';

// ─── Firebase config (same project as the app) ────────────────────────────────

const firebaseConfig = {
  apiKey: 'AIzaSyDO081nwtD1v5nZviQRheffDQhEDNyInZs',
  authDomain: 'momdeal-494c4.firebaseapp.com',
  projectId: 'momdeal-494c4',
  storageBucket: 'momdeal-494c4.firebasestorage.app',
  messagingSenderId: '518827684990',
  appId: '1:518827684990:web:4fca533bb22ab8d53d142f',
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ─── Static data ──────────────────────────────────────────────────────────────

const PRODUCTS = [
  {
    name: '하기스 맥시드라이 기저귀 신생아용',
    category: '기저귀',
    stageTags: ['newborn', 'early_infant'],
    categoryTags: ['diaper'],
    currentPrice: 29800,
  },
  {
    name: '마이센스 분유 1단계',
    category: '분유',
    stageTags: ['newborn', 'early_infant'],
    categoryTags: ['feeding'],
    currentPrice: 35000,
  },
  {
    name: '닥터브라운 젖병 세트 4종',
    category: '수유용품',
    stageTags: ['newborn', 'early_infant', 'infant'],
    categoryTags: ['feeding'],
    currentPrice: 42000,
  },
  {
    name: '피죤 아기 목욕용품 세트',
    category: '목욕용품',
    stageTags: ['newborn', 'early_infant', 'infant'],
    categoryTags: ['bath'],
    currentPrice: 18500,
  },
  {
    name: '젠지 수유패드 100매',
    category: '수유용품',
    stageTags: ['pregnancy', 'newborn'],
    categoryTags: ['feeding'],
    currentPrice: 12000,
  },
  {
    name: '베이비 범보 의자',
    category: '의자',
    stageTags: ['early_infant', 'infant'],
    categoryTags: ['play'],
    currentPrice: 55000,
  },
  {
    name: '바운서 베이비 캐리어',
    category: '이동용품',
    stageTags: ['early_infant', 'infant'],
    categoryTags: ['outing'],
    currentPrice: 89000,
  },
  {
    name: '프리미엄 유아 낮잠 이불 세트',
    category: '침구류',
    stageTags: ['newborn', 'early_infant', 'infant'],
    categoryTags: ['general'],
    currentPrice: 68000,
  },
  {
    name: '아기 이유식 제조기 믹서',
    category: '이유식',
    stageTags: ['infant', 'toddler'],
    categoryTags: ['feeding'],
    currentPrice: 79000,
  },
  {
    name: '아기 손잡이 학습 컵',
    category: '식기류',
    stageTags: ['infant', 'toddler'],
    categoryTags: ['feeding'],
    currentPrice: 8900,
  },
  {
    name: '유아 유모차 접이식 경량형',
    category: '유모차',
    stageTags: ['infant', 'toddler', 'early_child'],
    categoryTags: ['outing'],
    currentPrice: 199000,
  },
  {
    name: '레인보우 팝업 텐트',
    category: '장난감',
    stageTags: ['toddler', 'early_child'],
    categoryTags: ['play'],
    currentPrice: 38000,
  },
  {
    name: '모래놀이 완구 세트',
    category: '장난감',
    stageTags: ['toddler', 'early_child'],
    categoryTags: ['play', 'outing'],
    currentPrice: 22000,
  },
  {
    name: '유아 크록스 샌들',
    category: '신발',
    stageTags: ['toddler', 'early_child', 'child'],
    categoryTags: ['outing'],
    currentPrice: 34000,
  },
  {
    name: '어린이 자전거 헬멧',
    category: '안전용품',
    stageTags: ['early_child', 'child'],
    categoryTags: ['outing', 'play'],
    currentPrice: 28000,
  },
  {
    name: '신생아 배냇저고리 세트',
    category: '의류',
    stageTags: ['newborn'],
    categoryTags: ['general'],
    currentPrice: 24000,
  },
  {
    name: '태교 음악 플레이어',
    category: '임신용품',
    stageTags: ['pregnancy'],
    categoryTags: ['general'],
    currentPrice: 45000,
  },
];

const USER_IDS = [
  'seed_user_001',
  'seed_user_002',
  'seed_user_003',
  'seed_user_004',
  'seed_user_005',
];

const REVIEW_CONTENTS = [
  '아이가 정말 좋아해요. 강력 추천합니다!',
  '품질이 생각보다 훨씬 좋아요.',
  '가성비 최고! 두 번째 구매입니다.',
  '배송도 빠르고 만족스러워요.',
  '처음엔 반신반의했는데 대만족입니다.',
  '오래 쓸 것 같아요. 내구성이 좋네요.',
  '디자인도 예쁘고 기능도 좋아요.',
  '아이가 사용하기 편리해 보여요.',
  '친구한테도 추천했어요.',
  '가격 대비 퀄리티 훌륭합니다.',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

// Returns a Firestore Timestamp for a random moment within the last `days` days.
const randomTimestampInLastDays = (days = 7) => {
  const ageMs = Math.random() * days * 24 * 60 * 60 * 1000;
  return Timestamp.fromMillis(Date.now() - ageMs);
};

const pickActionType = () => {
  const r = Math.random();
  if (r < 0.70) return 'click';   // 70%
  if (r < 0.90) return 'view';    // 20%
  return 'purchase';               // 10%
};

// Write documents in Firestore batches of 400 (limit is 500).
const batchWrite = async (colPath, docs) => {
  const BATCH_SIZE = 400;
  let count = 0;
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    docs.slice(i, i + BATCH_SIZE).forEach((data) => {
      batch.set(doc(collection(db, colPath)), data);
    });
    await batch.commit();
    count += Math.min(BATCH_SIZE, docs.length - i);
    console.log(`  wrote ${count}/${docs.length} to ${colPath}`);
  }
};

// ─── Seeding steps ────────────────────────────────────────────────────────────

async function seedProducts() {
  console.log('\n[1/3] Seeding products...');
  const productIds = [];
  const docs = PRODUCTS.map((p) => ({
    ...p,
    brand: '',
    image: '',
    tags: [],
    problemTags: [],
    ageMinMonth: null,
    ageMaxMonth: null,
    source: 'seed',
    status: 'active',
    createdAt: randomTimestampInLastDays(30),
    updatedAt: randomTimestampInLastDays(7),
  }));

  // Use addDoc to get auto-generated IDs back (needed for actions + reviews).
  for (const data of docs) {
    const ref = await addDoc(collection(db, 'products'), data);
    productIds.push(ref.id);
    process.stdout.write('.');
  }
  console.log(`\n  ✓ ${productIds.length} products`);
  return productIds;
}

async function seedActions(productIds) {
  console.log('\n[2/3] Seeding user_product_actions...');
  const purchaseSet = new Set(); // "userId:productId"
  const actions = [];

  for (let i = 0; i < 100; i++) {
    const userId = pick(USER_IDS);
    const productId = pick(productIds);
    const actionType = pickActionType();

    if (actionType === 'purchase') {
      purchaseSet.add(`${userId}:${productId}`);
    }

    actions.push({
      userId,
      productId,
      actionType,
      createdAt: randomTimestampInLastDays(7),
    });
  }

  await batchWrite('user_product_actions', actions);
  console.log(`  ✓ 100 actions (purchases: ${purchaseSet.size} unique pairs)`);
  return purchaseSet;
}

async function seedReviews(productIds, purchaseSet) {
  console.log('\n[3/3] Seeding reviews...');
  const reviews = Array.from({ length: 30 }, () => {
    const userId = pick(USER_IDS);
    const productId = pick(productIds);
    const verifiedPurchase = purchaseSet.has(`${userId}:${productId}`);

    return {
      userId,
      productId,
      rating: randomInt(3, 5),
      content: pick(REVIEW_CONTENTS),
      images: [],
      verifiedPurchase,
      createdAt: randomTimestampInLastDays(7),
    };
  });

  await batchWrite('reviews', reviews);
  const verified = reviews.filter((r) => r.verifiedPurchase).length;
  console.log(`  ✓ 30 reviews (${verified} verified purchases)`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('━━━ MomDeal seed script ━━━');
  console.log(`Project: ${firebaseConfig.projectId}`);

  const productIds = await seedProducts();
  const purchaseSet = await seedActions(productIds);
  await seedReviews(productIds, purchaseSet);

  console.log('\n✅ Seed complete.');
  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌ Seed failed:', err);
  process.exit(1);
});
