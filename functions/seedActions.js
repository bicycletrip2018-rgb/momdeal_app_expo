/**
 * seedActions.js — Inserts synthetic user_product_actions for testing
 *                  collaborative filtering and recommendation scoring.
 *
 * Run from the functions/ directory:
 *   node seedActions.js
 *
 * Prerequisites:
 *   firebase login && firebase use momdeal-494c4
 *   OR set GOOGLE_APPLICATION_CREDENTIALS to a service account key JSON.
 *
 * Safe to re-run: skips documents that already exist (idempotent via doc ID).
 */

'use strict';

const admin = require('firebase-admin');

admin.initializeApp({ projectId: 'momdeal-494c4' });
const db = admin.firestore();

// ─── Fake users grouped by child stage ────────────────────────────────────────
// Each user represents a parent whose child is at the given stage.
// Similarity is computed from same-stage and close-ageMonth overlap.

const USERS = [
  // newborn parents
  { userId: 'test-user-nb-1', stage: 'newborn' },
  { userId: 'test-user-nb-2', stage: 'newborn' },
  { userId: 'test-user-nb-3', stage: 'newborn' },
  // early_infant parents
  { userId: 'test-user-ei-1', stage: 'early_infant' },
  { userId: 'test-user-ei-2', stage: 'early_infant' },
  { userId: 'test-user-ei-3', stage: 'early_infant' },
  // infant parents
  { userId: 'test-user-in-1', stage: 'infant' },
  { userId: 'test-user-in-2', stage: 'infant' },
  // toddler parents
  { userId: 'test-user-td-1', stage: 'toddler' },
  { userId: 'test-user-td-2', stage: 'toddler' },
];

// ─── Actions per stage ────────────────────────────────────────────────────────
// productId values must match documents already in Firestore (from seed.js or real registrations).
// actionType: 'view' | 'click' | 'purchase'

const ACTIONS_BY_STAGE = {
  newborn: [
    { productId: 'seed-pampers-nb',       actionType: 'purchase' },
    { productId: 'seed-pampers-nb',       actionType: 'click' },
    { productId: 'seed-koala-wipes',      actionType: 'purchase' },
    { productId: 'seed-koala-wipes',      actionType: 'click' },
    { productId: 'seed-hiqq-1',           actionType: 'purchase' },
    { productId: 'seed-hiqq-1',           actionType: 'click' },
    { productId: 'seed-avent-glass-120',  actionType: 'click' },
    { productId: 'seed-nuk-fc-150',       actionType: 'click' },
    { productId: 'seed-johnsons-lotion',  actionType: 'click' },
    { productId: 'seed-boryung-oil',      actionType: 'click' },
    { productId: 'seed-coconut-bag',      actionType: 'purchase' },
    { productId: 'seed-braun-thermometer',actionType: 'click' },
    { productId: 'seed-pigeon-brush-set', actionType: 'purchase' },
    { productId: 'seed-nature-wipes',     actionType: 'click' },
    { productId: 'seed-pigeon-detergent', actionType: 'click' },
  ],
  early_infant: [
    { productId: 'seed-huggies-sm',       actionType: 'purchase' },
    { productId: 'seed-huggies-sm',       actionType: 'click' },
    { productId: 'seed-koala-wipes',      actionType: 'purchase' },
    { productId: 'seed-bebbian-wipes',    actionType: 'click' },
    { productId: 'seed-maeil-2',          actionType: 'purchase' },
    { productId: 'seed-maeil-2',          actionType: 'click' },
    { productId: 'seed-nuk-fc-150',       actionType: 'click' },
    { productId: 'seed-johnsons-lotion',  actionType: 'purchase' },
    { productId: 'seed-iangel-cushion',   actionType: 'click' },
    { productId: 'seed-boryung-oil',      actionType: 'purchase' },
    { productId: 'seed-pigeon-detergent', actionType: 'click' },
    { productId: 'seed-braun-thermometer',actionType: 'click' },
    { productId: 'seed-nature-wipes',     actionType: 'purchase' },
  ],
  infant: [
    { productId: 'seed-mamypoko-m',       actionType: 'purchase' },
    { productId: 'seed-mamypoko-m',       actionType: 'click' },
    { productId: 'seed-koala-wipes',      actionType: 'purchase' },
    { productId: 'seed-namyang-3',        actionType: 'click' },
    { productId: 'seed-maeil-2',          actionType: 'click' },
    { productId: 'seed-babybon-weaning',  actionType: 'purchase' },
    { productId: 'seed-babybon-weaning',  actionType: 'click' },
    { productId: 'seed-johnsons-lotion',  actionType: 'click' },
    { productId: 'seed-iangel-cushion',   actionType: 'purchase' },
    { productId: 'seed-braun-thermometer',actionType: 'click' },
    { productId: 'seed-pigeon-detergent', actionType: 'click' },
  ],
  toddler: [
    { productId: 'seed-mamypoko-xl-pants',actionType: 'purchase' },
    { productId: 'seed-mamypoko-xl-pants',actionType: 'click' },
    { productId: 'seed-koala-wipes',      actionType: 'purchase' },
    { productId: 'seed-bebbian-wipes',    actionType: 'click' },
    { productId: 'seed-namyang-3',        actionType: 'purchase' },
    { productId: 'seed-namyang-3',        actionType: 'click' },
    { productId: 'seed-babybon-weaning',  actionType: 'purchase' },
    { productId: 'seed-pigeon-detergent', actionType: 'purchase' },
    { productId: 'seed-braun-thermometer',actionType: 'click' },
  ],
};

// ─── Runner ───────────────────────────────────────────────────────────────────

async function seedActions() {
  const now = admin.firestore.Timestamp.now();

  // Spread createdAt across the last 7 days so trendScore picks them up.
  const spreadMs = (index, total) =>
    now.toMillis() - Math.floor((index / total) * 7 * 24 * 60 * 60 * 1000);

  const batch = [];

  for (const { userId, stage } of USERS) {
    const actions = ACTIONS_BY_STAGE[stage] || [];
    actions.forEach(({ productId, actionType }, idx) => {
      batch.push({
        docId: `seed-action-${userId}-${productId}-${actionType}`,
        data: {
          userId,
          productId,
          actionType,
          createdAt: admin.firestore.Timestamp.fromMillis(
            spreadMs(idx, actions.length)
          ),
        },
      });
    });
  }

  console.log(`Seeding ${batch.length} actions → Firestore project: momdeal-494c4\n`);

  let created = 0;
  let skipped = 0;

  for (const { docId, data } of batch) {
    const ref = db.collection('user_product_actions').doc(docId);
    const existing = await ref.get();

    if (existing.exists) {
      console.log(`  SKIP   ${docId}`);
      skipped++;
      continue;
    }

    await ref.set(data);
    console.log(`  OK     ${docId}`);
    created++;
  }

  console.log(`\n✓ Done. ${created} created, ${skipped} already existed.\n`);
}

seedActions().catch(console.error).finally(() => process.exit());
