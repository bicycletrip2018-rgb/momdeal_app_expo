/**
 * crawlerService.js
 *
 * Backend Coupang product crawler for MomDeal.
 * Fetches real HTML from Coupang mobile pages using rotating User-Agents,
 * extracts spec / wow-price / deepLink via cheerio + regex,
 * and writes enriched fields to Firestore products collection.
 *
 * Firestore products schema (fields written by this crawler):
 *   brand        {string}        — extracted brand / seller name
 *   name         {string}        — clean product title
 *   spec         {string}        — e.g. "190ml / 30개"
 *   regularPrice {number}        — current sale price (no Wow)
 *   wowPrice     {number|null}   — Wow-member price; null if unavailable
 *   deepLink     {string}        — coupang://vp/products/${pageKey}?vendorItemId=${vendorItemId}
 *   crawledAt    {Timestamp}     — server timestamp of last successful crawl
 */

'use strict';

const axios   = require('axios');
const cheerio = require('cheerio');
const admin   = require('firebase-admin');

// ─── Rotating User-Agents ─────────────────────────────────────────────────────

const USER_AGENTS = [
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 13; SM-S908B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
];

function pickUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// ─── Spec regex ───────────────────────────────────────────────────────────────

const SPEC_REGEX = /\d+\.?\d*\s*(g|ml|kg|L|리터|개|롤|매|팩|정|캡슐|포|박스)/ig;

function extractSpec(text) {
  if (!text) return null;
  const matches = text.match(SPEC_REGEX);
  return matches ? [...new Set(matches.map((m) => m.trim()))].join(' / ') : null;
}

// ─── Wow-price selectors (tried in order) ─────────────────────────────────────
// Coupang renders the Wow-member price in various elements depending on
// A/B test cohort. We try all known patterns and return the first valid number.

const WOW_SELECTORS = [
  '.members-price-txt',
  '.coupon-price-txt',
  '.wow-price',
  '.coupon-discount-price',
  '[class*="members-price"]',
  '[class*="wow-price"]',
  '[class*="coupon-price"]',
];

const WOW_INLINE_PATTERNS = [
  /"wowPrice"\s*:\s*([0-9]+)/,
  /"couponPrice"\s*:\s*([0-9]+)/,
  /"membersPrice"\s*:\s*([0-9]+)/,
  /"wowMemberPrice"\s*:\s*([0-9]+)/,
];

function parsePrice(raw) {
  if (!raw) return null;
  const n = Number(String(raw).replace(/[^0-9]/g, ''));
  return n > 0 ? n : null;
}

function extractWowPrice($, html) {
  // 1. Try cheerio DOM selectors
  for (const sel of WOW_SELECTORS) {
    const el = $(sel).first();
    if (el.length) {
      const price = parsePrice(el.text());
      if (price) return price;
    }
  }

  // 2. Try inline JS patterns
  for (const pattern of WOW_INLINE_PATTERNS) {
    const m = html.match(pattern);
    if (m) {
      const price = parsePrice(m[1]);
      if (price) return price;
    }
  }

  return null;
}

// ─── Regular price selectors ──────────────────────────────────────────────────

const PRICE_SELECTORS = [
  '.total-price strong',
  '.prod-price .total-price',
  '[class*="total-price"]',
  '.price-info .total-price',
];

const REGULAR_PRICE_INLINE = [
  /"finalPrice"\s*:\s*([0-9]+)/,
  /"salePrice"\s*:\s*([0-9]+)/,
  /"salesPrice"\s*:\s*([0-9]+)/,
  /"priceValue"\s*:\s*([0-9]+)/,
  /"currentPrice"\s*:\s*([0-9]+)/,
];

function extractRegularPrice($, html) {
  for (const sel of PRICE_SELECTORS) {
    const el = $(sel).first();
    if (el.length) {
      const price = parsePrice(el.text());
      if (price) return price;
    }
  }
  for (const pattern of REGULAR_PRICE_INLINE) {
    const m = html.match(pattern);
    if (m) {
      const price = parsePrice(m[1]);
      if (price) return price;
    }
  }
  // JSON-LD fallback
  for (const block of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(block[1]);
      const offers = Array.isArray(data?.offers) ? data.offers[0] : data?.offers;
      const price = parsePrice(offers?.price);
      if (price) return price;
    } catch (_) {}
  }
  return null;
}

// ─── Brand extraction ─────────────────────────────────────────────────────────

function extractBrand($, html) {
  const brandEl = $('[class*="brand-name"]').first()
    || $('[class*="seller-name"]').first()
    || $('[class*="prod-brand"]').first();
  if (brandEl && brandEl.length) {
    const t = brandEl.text().trim();
    if (t) return t;
  }
  // Inline JS
  const m = html.match(/"brandName"\s*:\s*"([^"]{1,60})"/)
    || html.match(/"sellerName"\s*:\s*"([^"]{1,60})"/);
  return m ? m[1].trim() : null;
}

// ─── Core crawl function ──────────────────────────────────────────────────────

/**
 * Crawls a single Coupang product page and returns enriched fields.
 *
 * @param {string} pageKey     — Coupang product ID (numeric string)
 * @param {string} [vendorItemId]  — optional vendor item ID for the deepLink
 * @returns {Promise<{brand, name, spec, regularPrice, wowPrice, deepLink}>}
 */
async function crawlProduct(pageKey, vendorItemId) {
  const url = `https://m.coupang.com/vm/products/${pageKey}`;

  const response = await axios.get(url, {
    headers: {
      'User-Agent':      pickUserAgent(),
      'Accept-Language': 'ko-KR,ko;q=0.9',
      'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Referer':         'https://m.coupang.com/',
    },
    timeout: 12000,
    maxRedirects: 5,
  });

  const html = response.data;

  if (typeof html !== 'string' || html.includes('Access Denied') || html.includes('access denied')) {
    throw new Error(`Bot-blocked: pageKey=${pageKey}`);
  }

  const $ = cheerio.load(html);

  // Title → clean name + spec
  const titleEl = $('title').text() || '';
  const cleanTitle = titleEl.replace(/\s*[:\|]\s*쿠팡.*$/i, '').trim();
  const ogTitle = $('meta[property="og:title"]').attr('content') || '';
  const rawName = cleanTitle || ogTitle;

  const spec = extractSpec(rawName)
    || extractSpec($('[class*="prod-attr"]').text())
    || null;

  const regularPrice = extractRegularPrice($, html);
  const wowPrice     = extractWowPrice($, html);
  const brand        = extractBrand($, html);

  const deepLink = `coupang://vp/products/${pageKey}${vendorItemId ? `?vendorItemId=${vendorItemId}` : ''}`;

  return {
    brand:        brand || null,
    name:         rawName || null,
    spec:         spec || null,
    regularPrice: regularPrice || null,
    wowPrice:     wowPrice || null,
    deepLink,
  };
}

// ─── Firestore write helper ───────────────────────────────────────────────────

async function upsertProductCrawlData(productGroupId, fields) {
  const db = admin.firestore();
  await db.collection('products').doc(productGroupId).set(
    {
      ...fields,
      crawledAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

// ─── Batch crawl pipeline ─────────────────────────────────────────────────────

const BATCH_SIZE  = 5;
const DELAY_MS    = 1500; // conservative — avoid rate-limit 429s

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Crawls all products in the given Firestore query snapshot and enriches them.
 * Products that fail (bot-blocked, timeout) are logged and skipped.
 */
async function crawlAndEnrich(docs) {
  let success = 0;
  let failed  = 0;

  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = docs.slice(i, i + BATCH_SIZE);

    await Promise.all(batch.map(async (docSnap) => {
      const data           = docSnap.data();
      const productGroupId = docSnap.id;
      const pageKey        = data.originalId || data.pageKey || productGroupId.replace(/^coupang_/, '');
      const vendorItemId   = data.vendorItemId || null;

      if (!pageKey) { failed++; return; }

      try {
        const fields = await crawlProduct(pageKey, vendorItemId);
        await upsertProductCrawlData(productGroupId, fields);
        success++;
        console.log(`[crawler] ✅ ${productGroupId} — spec="${fields.spec}" wow=${fields.wowPrice}`);
      } catch (err) {
        failed++;
        console.warn(`[crawler] ❌ ${productGroupId}: ${err.message}`);
      }
    }));

    if (i + BATCH_SIZE < docs.length) {
      await sleep(DELAY_MS);
    }
  }

  return { success, failed, total: docs.length };
}

// ─── Exported sync functions ──────────────────────────────────────────────────

/**
 * Tier 1 — High-priority: products with user tracking / recent views.
 * Called by crawlerTier1 (every 1 hour).
 */
async function syncHighPriority() {
  const db  = admin.firestore();
  const now = Date.now();
  const MS_24H = 24 * 60 * 60 * 1000;

  // Find products recently clicked / saved
  const cutoff = admin.firestore.Timestamp.fromMillis(now - MS_24H);
  const actionsSnap = await db.collection('user_product_actions')
    .where('createdAt', '>=', cutoff)
    .get();

  const priorityIds = new Set();
  actionsSnap.docs.forEach((d) => {
    const { actionType, productGroupId, productId } = d.data();
    if (['product_click', 'product_view', 'product_purchase_click'].includes(actionType)) {
      const pid = productGroupId || productId;
      if (pid) priorityIds.add(pid);
    }
  });

  if (priorityIds.size === 0) {
    console.log('[crawlerTier1] no high-priority products');
    return { success: 0, failed: 0, total: 0 };
  }

  // Firestore whereIn is limited to 30 IDs; chunk if needed
  const ids   = [...priorityIds];
  const CHUNK = 30;
  const docs  = [];

  for (let i = 0; i < ids.length; i += CHUNK) {
    const snap = await db.collection('products')
      .where(admin.firestore.FieldPath.documentId(), 'in', ids.slice(i, i + CHUNK))
      .get();
    docs.push(...snap.docs);
  }

  const result = await crawlAndEnrich(docs);
  console.log(`[crawlerTier1] done — ${JSON.stringify(result)}`);
  return result;
}

/**
 * Tier 2 — Category best items: products in active status, stale > 6 h.
 * Called by crawlerTier2 (every 6 hours).
 */
async function syncCategoryBest() {
  const db = admin.firestore();
  const MS_6H = 6 * 60 * 60 * 1000;
  const staleThreshold = admin.firestore.Timestamp.fromMillis(Date.now() - MS_6H);

  const snap = await db.collection('products')
    .where('status', '==', 'active')
    .get();

  const docs = snap.docs.filter((d) => {
    const crawledAt = d.data().crawledAt;
    if (!crawledAt) return true;
    return crawledAt.toMillis() < staleThreshold.toMillis();
  }).slice(0, 100); // cap at 100 per run

  const result = await crawlAndEnrich(docs);
  console.log(`[crawlerTier2] done — ${JSON.stringify(result)}`);
  return result;
}

/**
 * Global sync — all active products, regardless of crawl age.
 * Called by globalSync (daily at 00:05 KST).
 */
async function syncAllProducts() {
  const db = admin.firestore();

  const snap = await db.collection('products')
    .where('status', '==', 'active')
    .get();

  const result = await crawlAndEnrich(snap.docs);
  console.log(`[globalSync] done — ${JSON.stringify(result)}`);
  return result;
}

module.exports = { syncHighPriority, syncCategoryBest, syncAllProducts };
