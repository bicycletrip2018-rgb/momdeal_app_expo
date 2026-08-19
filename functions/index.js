const crypto = require("crypto");
const axios = require("axios");
const functions = require("firebase-functions");
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const corsMiddleware = require("cors")({ origin: true });
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
const fetch = require("node-fetch");
const cheerio = require("cheerio");

// ─── RULE-12: Segment derivation (server-side mirror of saveService.js) ───────
// Format: "{stage}_{YYYY}-{MM|QN|HN}"
function deriveSegmentFromBirthDate(birthDate, userType) {
  if (userType === "pregnancy" || userType === "planning") return `${userType}_segment`;
  if (!birthDate) return "unknown_segment";

  const birth = birthDate.toDate ? birthDate.toDate() : new Date(birthDate);
  if (isNaN(birth.getTime())) return "unknown_segment";

  const ageMs     = Date.now() - birth.getTime();
  const ageMonths = ageMs / (1000 * 60 * 60 * 24 * 30.4375);
  const yyyy      = birth.getFullYear();
  const mm        = String(birth.getMonth() + 1).padStart(2, "0");

  if (ageMonths < 1)  return `newborn_${yyyy}-${mm}`;
  if (ageMonths < 6)  return `early_infant_${yyyy}-${mm}`;
  if (ageMonths < 12) return `infant_${yyyy}-${mm}`;
  if (ageMonths < 36) return `toddler_${yyyy}-${mm}`;
  if (ageMonths < 60) {
    const q = Math.ceil((birth.getMonth() + 1) / 3);
    return `early_child_${yyyy}-Q${q}`;
  }
  const half = birth.getMonth() < 6 ? "H1" : "H2";
  return `child_${yyyy}-${half}`;
}

admin.initializeApp();

// ─── In-memory cache for home-screen API calls (TTL: 20 minutes) ─────────────
const CACHE_TTL_MS = 20 * 60 * 1000;
const _cache = {};
function cacheGet(key) {
  const entry = _cache[key];
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) { delete _cache[key]; return null; }
  return entry.value;
}
function cacheSet(key, value) { _cache[key] = { value, ts: Date.now() }; }

// Wraps a promise with a hard timeout; clears timer after race settles
function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

const forceHttps = (url) => url ? String(url).replace(/^http:\/\//i, 'https://') : null;
const pickImage  = (item) => forceHttps(item.productImage || item.image || item.imageUrl || null);
const cleanName  = (raw)  => String(raw || '쿠팡 상품').replace(/\[LIVE서버\]|\[API 브릿지 우회\]/g, '').trim() || '쿠팡 상품';

// Server-side mirror of priceTrackingService.js's _updateDailyPrice — keeps
// products/{id}/daily_prices/{date} populated from scheduled price checks too,
// not just the client registration path, so DetailScreen's 60-day chart and
// getMarketingAverage() actually have data for products that were never
// opened in-app after being tracked.
async function updateDailyPriceBucket(productGroupId, price) {
  const dateKey = new Date().toISOString().slice(0, 10);
  const ref = admin.firestore().collection("products").doc(productGroupId)
    .collection("daily_prices").doc(dateKey);
  const snap = await ref.get();
  if (snap.exists) {
    const existing = snap.data();
    const newMax = Math.max(existing.maxPrice, price);
    const newMin = Math.min(existing.minPrice, price);
    if (newMax !== existing.maxPrice || newMin !== existing.minPrice) {
      await ref.set({ maxPrice: newMax, minPrice: newMin, date: dateKey }, { merge: true });
    }
  } else {
    await ref.set({ maxPrice: price, minPrice: price, date: dateKey });
  }
}

const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1";

// Chrome 124 on Windows — used for HTML scraping to avoid bot detection
const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const SCRAPE_HEADERS = {
  "User-Agent":                DESKTOP_UA,
  "Accept":                    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language":           "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
  "Accept-Encoding":           "gzip, deflate, br",
  "Connection":                "keep-alive",
  "Cache-Control":             "max-age=0",
  "Upgrade-Insecure-Requests": "1",
  "Referer":                   "https://www.coupang.com/",
  "sec-ch-ua":                 '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
  "sec-ch-ua-mobile":          "?0",
  "sec-ch-ua-platform":        '"Windows"',
  "sec-fetch-dest":            "document",
  "sec-fetch-mode":            "navigate",
  "sec-fetch-site":            "same-origin",
  "sec-fetch-user":            "?1",
};

const DEEPLINK_PATH =
  "/v2/providers/affiliate_open_api/apis/openapi/v1/deeplink";

const SEARCH_PATH =
  "/v2/providers/affiliate_open_api/apis/openapi/products/search";

const BEST_CATEGORY_PATH =
  "/v2/providers/affiliate_open_api/apis/openapi/products/bestcategories";

const GOLDBOX_PATH =
  "/v2/providers/affiliate_open_api/apis/openapi/v1/products/goldbox";

const RECO_V2_PATH =
  "/v2/providers/affiliate_open_api/apis/openapi/v2/products/reco";

// ---------------------------------------------------------------------------
// Partners API (primary)
// Endpoint: POST https://api-gateway.coupang.com/v2/.../deeplink
// Auth:     HMAC-SHA256 signed with access key + secret key from Coupang Partners
// Returns:  productName, productPrice, productImage, shortUrl
// Docs:     https://developers.coupang.com
// ---------------------------------------------------------------------------

/**
 * Generates the CEA HMAC-SHA256 Authorization header required by the
 * Coupang Partners API.
 *
 * Signing format (confirmed from mahlernim/coupang_price and uju777/coupang-mcp):
 *   datetime  = YYMMDDTHHMMSSZ  (UTC, 2-digit year)
 *   message   = datetime + METHOD + /path?query
 *   signature = HMAC-SHA256(secretKey, message).hexdigest()
 *   header    = "CEA algorithm=HmacSHA256, access-key=…, signed-date=…, signature=…"
 */
const buildPartnersAuth = (method, path, accessKey, secretKey) => {
  const now = new Date();
  const p = (n) => String(n).padStart(2, "0");
  const datetime =
    String(now.getUTCFullYear()).slice(-2) +
    p(now.getUTCMonth() + 1) +
    p(now.getUTCDate()) +
    "T" +
    p(now.getUTCHours()) +
    p(now.getUTCMinutes()) +
    p(now.getUTCSeconds()) +
    "Z";

  const signature = crypto
    .createHmac("sha256", secretKey)
    .update(datetime + method + path)
    .digest("hex");

  return `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${datetime}, signature=${signature}`;
};

/**
 * generateHmac(method, url, secretKey, accessKey)
 * V2-spec HMAC helper — matches CPO API spec parameter order.
 * Identical signing logic to buildPartnersAuth above; exists as a named alias
 * so the V2 callable functions read more clearly alongside the spec.
 */
const generateHmac = (method, url, secretKey, accessKey) =>
  buildPartnersAuth(method, url, accessKey, secretKey);

/**
 * Calls the Coupang Partners deep link API with the product URL.
 * The API accepts a Coupang product URL and returns product metadata
 * including productName, productPrice, and productImage.
 *
 * Returns { name, price, image } or null on failure.
 */
const tryPartnersApi = async (productId, accessKey, secretKey) => {
  const productUrl = `https://www.coupang.com/vp/products/${productId}`;

  const response = await fetch(
    `https://api-gateway.coupang.com${DEEPLINK_PATH}`,
    {
      method: "POST",
      headers: {
        Authorization: buildPartnersAuth("POST", DEEPLINK_PATH, accessKey, secretKey),
        "Content-Type": "application/json;charset=UTF-8",
      },
      body: JSON.stringify({ coupangUrls: [productUrl] }),
    }
  );

  if (!response.ok) {
    console.log(`Partners API HTTP ${response.status}: productId=${productId}`);
    return null;
  }

  const json = await response.json();

  if (json?.rCode !== "0") {
    console.log(`Partners API rCode=${json?.rCode}: ${json?.rMessage}`);
    return null;
  }

  const item = json?.data?.[0];
  if (!item) return null;

  return {
    name: typeof item.productName === "string" ? item.productName : "쿠팡 상품",
    price: typeof item.productPrice === "number" ? item.productPrice : null,
    image: typeof item.productImage === "string" ? item.productImage : null,
  };
};

// ---------------------------------------------------------------------------
// vm/v4 JSON API (secondary — used for soldOut when Partners is primary,
// or as standalone fallback when Partners keys are not configured)
// Confirmed endpoint from mahlernim/coupang_price (Home Assistant integration).
// May be blocked by Akamai depending on GCP region.
// ---------------------------------------------------------------------------

const tryV4Api = async (productId, itemId) => {
  const itemQuery = itemId ? `?itemId=${itemId}` : "";
  const response = await fetch(
    `https://m.coupang.com/vm/v4/enhanced-pdp/products/${productId}${itemQuery}`,
    {
      headers: {
        "User-Agent": MOBILE_UA,
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "ko-KR",
        Referer: `https://m.coupang.com/vm/products/${productId}`,
      },
    }
  );

  if (!response.ok) {
    console.log(`v4 API blocked: ${response.status}`);
    return null;
  }

  const json = await response.json();
  const item = json?.rData?.vendorItemDetail?.item ?? json?.rData?.item;
  if (!item) return null;

  const rawPrice = item.couponPrice || item.salesPrice;
  const itemIsRocket = item.isRocket === true || item.rocketDelivery === true;
  const itemIsFresh = item.isFresh === true;
  const itemDelivery = itemIsFresh ? "fresh" : itemIsRocket ? "rocket" : "normal";
  const rawSellerName = typeof item.sellerName === "string" ? item.sellerName : "";
  const itemSellerType =
    item.sellerType === "COUPANG" || rawSellerName.includes("쿠팡") || itemIsRocket
      ? "coupang"
      : rawSellerName
        ? "seller"
        : "unknown";
  const rawOptName = item.vendorItemName ?? item.itemName ?? null;

  return {
    name: item.productName || "쿠팡 상품",
    price: typeof rawPrice === "number" && rawPrice > 0 ? rawPrice : null,
    isOutOfStock: item.soldOut === true,
    optionName: typeof rawOptName === "string" && rawOptName.trim() ? rawOptName.trim() : null,
    sellerType: itemSellerType,
    deliveryType: itemDelivery,
    isRocket: itemIsRocket,
  };
};

// ---------------------------------------------------------------------------
// HTML scraping (last resort)
// Sub-strategies: exports.sdp → JSON-LD → inline JS keys → OG meta tag
// ---------------------------------------------------------------------------

const extractJsonObject = (html, startIndex) => {
  let depth = 0;
  for (let i = startIndex; i < html.length; i++) {
    if (html[i] === "{") depth++;
    else if (html[i] === "}") {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(html.slice(startIndex, i + 1)); }
        catch (_) { return null; }
      }
    }
  }
  return null;
};

const extractFromHtml = (html) => {
  const $ = cheerio.load(html);

  // ── NAME ──────────────────────────────────────────────────────────────────
  // 1st: og:title  2nd: h2.prod-buy-header__title  3rd: exports.sdp / inline
  let name = null;
  const ogTitle = ($('meta[property="og:title"]').attr("content") || "").trim();
  if (ogTitle) name = ogTitle.replace(/\s*[:|]\s*쿠팡.*$/i, "").trim() || null;
  if (!name) {
    const h2 = $("h2.prod-buy-header__title").first().text().trim();
    if (h2) name = h2;
  }

  // ── IMAGE ─────────────────────────────────────────────────────────────────
  // 1st: og:image  2nd: img.prod-image__detail
  let image = null;
  const ogImage = ($('meta[property="og:image"]').attr("content") || "").trim();
  if (ogImage) image = forceHttps(ogImage);
  if (!image) {
    const imgSrc = ($("img.prod-image__detail").first().attr("src") || "").trim();
    if (imgSrc) image = forceHttps(imgSrc);
  }

  // ── PRICE ─────────────────────────────────────────────────────────────────
  // 1st: product:price:amount meta  2nd: span.total-price strong
  // 3rd: span.major-price  4th: JSON-LD  5th: exports.sdp  6th: inline JS keys
  let price = null;

  const metaPriceRaw = ($('meta[property="product:price:amount"]').attr("content") || "").replace(/[^0-9]/g, "");
  if (metaPriceRaw) { const p = Number(metaPriceRaw); if (p > 0) price = p; }

  if (price === null) {
    const tp = $("span.total-price strong").first().text().replace(/[^0-9]/g, "");
    if (tp) { const p = Number(tp); if (p > 0) price = p; }
  }
  if (price === null) {
    const mp = $("span.major-price").first().text().replace(/[^0-9]/g, "");
    if (mp) { const p = Number(mp); if (p > 0) price = p; }
  }
  // Mobile web selector (m.coupang.com/vm/...)
  if (price === null) {
    const pv = $(".price-value").first().text().replace(/[^0-9]/g, "");
    if (pv) { const p = Number(pv); if (p > 0) price = p; }
  }

  // ── OOS (declare before JSON-LD loop that may set it) ─────────────────────
  let isOutOfStock = false;

  // JSON-LD fallback
  if (price === null) {
    for (const block of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
      try {
        const data = JSON.parse(block[1]);
        const offers = Array.isArray(data?.offers) ? data.offers[0] : data?.offers;
        const raw = offers?.price;
        if (raw != null) {
          const p = Number(String(raw).replace(/[^0-9]/g, ""));
          if (p > 0) {
            price = p;
            if (offers?.availability?.includes("OutOfStock")) isOutOfStock = true;
            break;
          }
        }
      } catch (_) {}
    }
  }

  // exports.sdp embedded object fallback
  if (price === null || !name) {
    const sdpIdx = html.indexOf("exports.sdp");
    if (sdpIdx !== -1) {
      const braceIdx = html.indexOf("{", sdpIdx);
      if (braceIdx !== -1) {
        const sdp = extractJsonObject(html, braceIdx);
        if (sdp) {
          if (price === null) {
            const base = sdp?.quantityBase?.[0]?.price;
            const raw = base?.salePrice ?? base?.originPrice ?? null;
            if (typeof raw === "number" && raw > 0) price = raw;
          }
          if (!name && (sdp.productName || sdp.title)) name = sdp.productName || sdp.title;
          if (sdp.soldOut === true) isOutOfStock = true;
        }
      }
    }
  }

  // Inline JS key fallback
  if (price === null) {
    for (const pattern of [
      /"finalPrice"\s*:\s*([0-9]+)/,
      /"salePrice"\s*:\s*([0-9]+)/,
      /"salesPrice"\s*:\s*([0-9]+)/,
      /"priceValue"\s*:\s*([0-9]+)/,
      /"discountPrice"\s*:\s*([0-9]+)/,
      /"currentPrice"\s*:\s*([0-9]+)/,
    ]) {
      const m = html.match(pattern);
      if (m) { const p = Number(m[1]); if (p > 0) { price = p; break; } }
    }
  }

  // og:price:amount namespace variant (last resort)
  if (price === null) {
    const m =
      html.match(/<meta[^>]+property=["']og:price:amount["'][^>]+content=["']([0-9,]+)["']/i) ||
      html.match(/<meta[^>]+content=["']([0-9,]+)["'][^>]+property=["']og:price:amount["']/i);
    if (m) { const p = Number(m[1].replace(/,/g, "")); if (p > 0) price = p; }
  }

  // ── OOS (additional inline checks) ────────────────────────────────────────
  if (!isOutOfStock) {
    if (/"isSoldOut"\s*:\s*true/.test(html) ||
        /"soldOut"\s*:\s*true/.test(html) ||
        /"outOfStock"\s*:\s*true/.test(html) ||
        html.includes("품절")) isOutOfStock = true;
  }

  // ── isRocket / deliveryType / optionName / sellerType ─────────────────────
  const isRocket = /"isRocket"\s*:\s*true/.test(html) || /"rocketDelivery"\s*:\s*true/.test(html);
  let deliveryType = isRocket ? "rocket" : "normal";
  if (/"isFresh"\s*:\s*true/.test(html)) deliveryType = "fresh";

  let optionName = null;
  const optM = html.match(/"vendorItemName"\s*:\s*"([^"]{1,100})"/) || html.match(/"itemName"\s*:\s*"([^"]{1,100})"/);
  if (optM) optionName = optM[1].trim() || null;

  let sellerType = "unknown";
  if (/"sellerType"\s*:\s*"COUPANG"/.test(html) || isRocket) sellerType = "coupang";
  else if (/"sellerName"\s*:\s*"[^"]*쿠팡[^"]*"/.test(html)) sellerType = "coupang";
  else if (/"sellerName"\s*:\s*"[^"]+"/.test(html)) sellerType = "seller";

  return { price, isOutOfStock, name, image, optionName, sellerType, deliveryType, isRocket };
};

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// searchProducts
// GET /v2/providers/affiliate_open_api/apis/openapi/products/search
// Input:  { keyword: string, limit?: number (1-100, default 20) }
// Output: { products: [{ productId, name, price, image, affiliateUrl, isRocket }] }
// ---------------------------------------------------------------------------

exports.searchProducts = functions.https.onCall(async (request) => {
  console.log("searchProducts invoked!");
  const { keyword, limit = 20 } = request.data;

  if (!keyword || typeof keyword !== "string" || !keyword.trim()) {
    throw new functions.https.HttpsError("invalid-argument", "keyword required");
  }

  const accessKey = process.env.COUPANG_ACCESS_KEY;
  const secretKey = process.env.COUPANG_SECRET_KEY;

  if (!accessKey || !secretKey) {
    throw new functions.https.HttpsError("failed-precondition", "API keys not configured");
  }

  const safeLimit = Math.min(Math.max(1, Number(limit) || 20), 100);
  const qs = `keyword=${encodeURIComponent(keyword.trim())}&limit=${safeLimit}`;
  const pathWithQuery = `${SEARCH_PATH}?${qs}`;

  try {
    const response = await fetch(
      `https://api-gateway.coupang.com${pathWithQuery}`,
      {
        method: "GET",
        headers: {
          Authorization: buildPartnersAuth("GET", pathWithQuery, accessKey, secretKey),
          "Content-Type": "application/json;charset=UTF-8",
        },
      }
    );

    if (!response.ok) {
      console.log(`searchProducts HTTP ${response.status}: keyword=${keyword}`);
      throw new functions.https.HttpsError("unavailable", `API error ${response.status}`);
    }

    const json = await response.json();

    if (json?.rCode !== "0") {
      console.log(`searchProducts rCode=${json?.rCode}: ${json?.rMessage}`);
      throw new functions.https.HttpsError("unavailable", json?.rMessage || "API error");
    }

    const products = (json?.data?.productData ?? [])
      .map((item) => ({
        productId:    String(item.productId ?? ""),
        name:         cleanName(typeof item.productName === "string" ? item.productName : null),
        price:        typeof item.productPrice === "number" ? item.productPrice : null,
        image:        pickImage(item),
        affiliateUrl: typeof item.productUrl === "string" ? item.productUrl : null,
        isRocket:     item.isRocket === true,
      }))
      .filter((p) => p.productId);

    return { products };
  } catch (error) {
    if (error instanceof functions.https.HttpsError) throw error;
    console.error("searchProducts error:", error);
    console.error("Goldbox Error:", error?.message ?? error);
    throw new functions.https.HttpsError("internal", "Search failed");
  }
});

// ---------------------------------------------------------------------------
// getProductDetail
// POST deeplink API → resolve name / price / image / affiliateUrl for one product
// Input:  { productId: string }
// Output: { productId, name, price, image, affiliateUrl }
// ---------------------------------------------------------------------------

exports.getProductDetail = functions.https.onCall(async (request) => {
  const { productId } = request.data;

  if (!productId) {
    throw new functions.https.HttpsError("invalid-argument", "productId required");
  }

  const accessKey = process.env.COUPANG_ACCESS_KEY;
  const secretKey = process.env.COUPANG_SECRET_KEY;

  if (!accessKey || !secretKey) {
    throw new functions.https.HttpsError("failed-precondition", "API keys not configured");
  }

  const productUrl = `https://www.coupang.com/vp/products/${productId}`;

  try {
    const response = await fetch(
      `https://api-gateway.coupang.com${DEEPLINK_PATH}`,
      {
        method: "POST",
        headers: {
          Authorization: buildPartnersAuth("POST", DEEPLINK_PATH, accessKey, secretKey),
          "Content-Type": "application/json;charset=UTF-8",
        },
        body: JSON.stringify({ coupangUrls: [productUrl] }),
      }
    );

    if (!response.ok) {
      console.log(`getProductDetail HTTP ${response.status}: productId=${productId}`);
      throw new functions.https.HttpsError("unavailable", `API error ${response.status}`);
    }

    const json = await response.json();

    if (json?.rCode !== "0") {
      console.log(`getProductDetail rCode=${json?.rCode}: ${json?.rMessage}`);
      throw new functions.https.HttpsError("unavailable", json?.rMessage || "API error");
    }

    const item = json?.data?.[0];
    if (!item) {
      throw new functions.https.HttpsError("not-found", "Product not found");
    }

    return {
      productId: String(productId),
      name: typeof item.productName === "string" ? item.productName : "쿠팡 상품",
      price: typeof item.productPrice === "number" ? item.productPrice : null,
      image: typeof item.productImage === "string" ? item.productImage : null,
      affiliateUrl: typeof item.shortUrl === "string" ? item.shortUrl : null,
    };
  } catch (error) {
    if (error instanceof functions.https.HttpsError) throw error;
    console.error("getProductDetail error:", error);
    throw new functions.https.HttpsError("internal", "Failed to get product detail");
  }
});

// ---------------------------------------------------------------------------
// generateDeeplink
// POST deeplink API → convert Coupang URLs to affiliate links (batch, max 10)
// Input:  { urls: string[] }
// Output: { links: [{ originalUrl, shortUrl, name, price, image }] }
// ---------------------------------------------------------------------------

exports.generateDeeplink = functions.https.onCall(async (request) => {
  const { urls } = request.data;

  if (!Array.isArray(urls) || urls.length === 0) {
    throw new functions.https.HttpsError("invalid-argument", "urls array required");
  }

  const accessKey = process.env.COUPANG_ACCESS_KEY;
  const secretKey = process.env.COUPANG_SECRET_KEY;

  if (!accessKey || !secretKey) {
    throw new functions.https.HttpsError("failed-precondition", "API keys not configured");
  }

  const safeUrls = urls
    .slice(0, 10)
    .filter((u) => typeof u === "string" && u.includes("coupang.com"));

  if (safeUrls.length === 0) {
    throw new functions.https.HttpsError("invalid-argument", "No valid Coupang URLs provided");
  }

  try {
    const response = await fetch(
      `https://api-gateway.coupang.com${DEEPLINK_PATH}`,
      {
        method: "POST",
        headers: {
          Authorization: buildPartnersAuth("POST", DEEPLINK_PATH, accessKey, secretKey),
          "Content-Type": "application/json;charset=UTF-8",
        },
        body: JSON.stringify({ coupangUrls: safeUrls }),
      }
    );

    if (!response.ok) {
      console.log(`generateDeeplink HTTP ${response.status}`);
      throw new functions.https.HttpsError("unavailable", `API error ${response.status}`);
    }

    const json = await response.json();

    if (json?.rCode !== "0") {
      console.log(`generateDeeplink rCode=${json?.rCode}: ${json?.rMessage}`);
      throw new functions.https.HttpsError("unavailable", json?.rMessage || "API error");
    }

    const links = (json?.data ?? []).map((item) => ({
      originalUrl: typeof item.originalUrl === "string" ? item.originalUrl : null,
      shortUrl: typeof item.shortUrl === "string" ? item.shortUrl : null,
      name: typeof item.productName === "string" ? item.productName : null,
      price: typeof item.productPrice === "number" ? item.productPrice : null,
      image: typeof item.productImage === "string" ? item.productImage : null,
    }));

    return { links };
  } catch (error) {
    if (error instanceof functions.https.HttpsError) throw error;
    console.error("generateDeeplink error:", error);
    throw new functions.https.HttpsError("internal", "Deeplink generation failed");
  }
});

// ---------------------------------------------------------------------------
// getBestCategoryProducts
// Primary:   GET /bestcategories/{categoryId}  (bare path, no query — HMAC requirement)
// Fallback:  GET /products/search?keyword=...  (query params included in HMAC path)
//
// Why fallback exists:
//   Coupang's bestcategories endpoint silently returns the "All" (1001) bestseller
//   list for category IDs it doesn't recognise or doesn't have enough ranked data
//   for. Symptom: 가전디지털 (1012) returns milk / strawberries.
//   For those categories we fall back to a keyword search ranked by popularity.
//
// HMAC rule (confirmed via exhaustive local testing):
//   Signed path MUST exactly match the request URL path+query.
//   bestcategories → no query params in either.
//   search         → query params in BOTH signed path and request URL.
// ---------------------------------------------------------------------------

// Baby-relevant keyword fallback — used when bestcategories returns empty or fails.
const CATEGORY_SEARCH_KW = {
  1011: "기저귀",
  1012: "분유",
  1014: "아기물티슈",
};

// Normalise a product item from either bestcategories or search response shape.
const normProduct = (item) => ({
  productId:     String(item.productId ?? ""),
  name:          cleanName(typeof item.productName === "string" ? item.productName : null),
  price:         typeof item.productPrice  === "number" ? item.productPrice : null,
  originalPrice: typeof item.originalPrice === "number" ? item.originalPrice : null,
  discountRate:  typeof item.discountRate  === "number" ? item.discountRate  : null,
  image:         pickImage(item),
  affiliateUrl:  typeof item.productUrl    === "string" ? item.productUrl   : null,
  isRocket:      item.isRocket === true,
  isFreeShipping: item.isFreeShipping === true,
});

// Keyword search fallback used inside getBestCategoryProducts when API returns empty.
const doKeywordSearch = async (keyword, accessKey, secretKey, limit) => {
  try {
    const qs = `keyword=${encodeURIComponent(keyword)}&limit=${limit}`;
    const pathWithQuery = `${SEARCH_PATH}?${qs}`;
    const response = await fetch(`https://api-gateway.coupang.com${pathWithQuery}`, {
      method: "GET",
      headers: {
        Authorization: buildPartnersAuth("GET", pathWithQuery, accessKey, secretKey),
        "Content-Type": "application/json;charset=UTF-8",
      },
    });
    if (!response.ok) return [];
    const json = await response.json();
    if (json?.rCode !== "0") return [];
    return (json?.data?.productData ?? []).map(normProduct).filter((p) => p.productId).slice(0, limit);
  } catch (e) {
    console.warn("[doKeywordSearch] failed:", e?.message);
    return [];
  }
};

exports.getBestCategoryProducts = functions.https.onCall({ invoker: "public", timeoutSeconds: 15 }, async (request) => {
  const { categoryId, limit = 20 } = request.data;

  if (!categoryId || typeof categoryId !== "number") {
    throw new functions.https.HttpsError("invalid-argument", "categoryId (number) required");
  }

  const accessKey = process.env.COUPANG_ACCESS_KEY;
  const secretKey = process.env.COUPANG_SECRET_KEY;

  const safeLimit = Math.min(Math.max(1, Number(limit) || 20), 50);

  // Keys not configured → return ✅ server-side visual fallback to distinguish
  // from the client-local MOCK_REPLENISHMENT array (CPO visual verification).
  if (!accessKey || !secretKey) {
    const serverFallback = categoryId === 1014 ? SERVER_PEER_FALLBACK : (MOCK_CATEGORY_PRODUCTS[categoryId] ?? SERVER_PEER_FALLBACK);
    console.log(`[getBestCategoryProducts] keys not configured — returning ✅ server fallback for categoryId=${categoryId}`);
    return { products: serverFallback.slice(0, safeLimit), source: "server_mock" };
  }

  // Primary path: bestcategories bare-path request.
  const barePath = `${BEST_CATEGORY_PATH}/${categoryId}`;
  const requestUrl = `https://api-gateway.coupang.com${barePath}`;

  console.log(`[bestcategories] GET ${requestUrl}`);

  try {
    const response = await withTimeout(
      fetch(requestUrl, {
        method: "GET",
        headers: {
          Authorization: buildPartnersAuth("GET", barePath, accessKey, secretKey),
          "Content-Type": "application/json;charset=UTF-8",
        },
        signal: AbortSignal.timeout(5000),
      }),
      5000
    );

    console.log(`[bestcategories] status=${response.status} categoryId=${categoryId}`);

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      console.log(`[bestcategories] error body=${errBody.slice(0, 300)}`);
      if (response.status === 429 || response.status >= 500) {
        return { products: [] };
      }
      throw new functions.https.HttpsError("unavailable", `API error ${response.status}`);
    }

    const json = await response.json();
    console.log(`[bestcategories] rCode=${json?.rCode} rMessage=${json?.rMessage} items=${Array.isArray(json?.data) ? json.data.length : "n/a"}`);

    if (json?.rCode !== "0") {
      console.log(`[bestcategories] non-zero rCode — keyword search fallback for categoryId=${categoryId}`);
      const kw       = CATEGORY_SEARCH_KW[categoryId] || "기저귀";
      const fallback = await doKeywordSearch(kw, accessKey, secretKey, safeLimit);
      return { products: fallback.length > 0 ? fallback : SERVER_PEER_FALLBACK.slice(0, safeLimit).map(normProduct), source: fallback.length > 0 ? "search_fallback" : "server_mock" };
    }

    const products = (Array.isArray(json?.data) ? json.data : [])
      .slice(0, safeLimit)
      .map(normProduct)
      .filter((p) => p.productId);

    if (products.length === 0) {
      const kw       = CATEGORY_SEARCH_KW[categoryId] || "기저귀";
      const fallback = await doKeywordSearch(kw, accessKey, secretKey, safeLimit);
      return { products: fallback.length > 0 ? fallback : SERVER_PEER_FALLBACK.slice(0, safeLimit).map(normProduct), source: fallback.length > 0 ? "search_fallback" : "server_mock" };
    }

    console.log(`[bestcategories] categoryId=${categoryId} first="${products[0].name}" count=${products.length}`);
    return { products, source: "bestcategories" };
  } catch (error) {
    if (error instanceof functions.https.HttpsError) throw error;
    console.error("[bestcategories] unexpected error:", error);
    const kw       = CATEGORY_SEARCH_KW[categoryId] || "기저귀";
    const fallback = await doKeywordSearch(kw, accessKey, secretKey, safeLimit).catch(() => []);
    return { products: fallback.length > 0 ? fallback : SERVER_PEER_FALLBACK.slice(0, safeLimit).map(normProduct), source: fallback.length > 0 ? "search_fallback" : "server_mock" };
  }
});

// ---------------------------------------------------------------------------
// Server-side visual fallback arrays (✅ [LIVE서버] prefix proves CF invocation)
// ---------------------------------------------------------------------------

const SERVER_GOLDBOX_FALLBACK = [
  { name: "하기스 네이처메이드 기저귀 신생아 100매", currentPrice: 28900, originalPrice: 52900, discountRate: 45, discount: 45, image: "https://picsum.photos/seed/sg1/200", affiliateUrl: null, categoryName: "출산/유아동", isRocket: true,  isFreeShipping: true  },
  { name: "매일유업 앱솔루트 분유 스텝2 800g×2캔",  currentPrice: 39800, originalPrice: 62000, discountRate: 36, discount: 36, image: "https://picsum.photos/seed/sg2/200", affiliateUrl: null, categoryName: "식품",       isRocket: true,  isFreeShipping: true  },
  { name: "피죤 아기 세탁세제 3L 대용량 무향",       currentPrice: 8900,  originalPrice: 12800, discountRate: 30, discount: 30, image: "https://picsum.photos/seed/sg3/200", affiliateUrl: null, categoryName: "생활용품",   isRocket: false, isFreeShipping: true  },
  { name: "프리미엄베베 순한 아기 로션 400ml 무향",  currentPrice: 13900, originalPrice: 21400, discountRate: 35, discount: 35, image: "https://picsum.photos/seed/sg4/200", affiliateUrl: null, categoryName: "출산/유아동", isRocket: true,  isFreeShipping: false },
];

// Server mock for peer-best / replenishment strip (categoryId 1014 path)
const SERVER_PEER_FALLBACK = [
  { productId: "sp1", productName: "유한킴벌리 하기스 물티슈 100매×10팩",   productPrice: 18900, originalPrice: 26000, discountRate: 27, productImage: "https://picsum.photos/seed/sp1/200", isRocket: true  },
  { productId: "sp2", productName: "탐사 순한 아기 기저귀 신생아 100매",     productPrice: 15900, originalPrice: 22000, discountRate: 28, productImage: "https://picsum.photos/seed/sp2/200", isRocket: true  },
  { productId: "sp3", productName: "피죤 베이비 세탁세제 2.5L 무향",         productPrice: 10900, originalPrice: 15800, discountRate: 31, productImage: "https://picsum.photos/seed/sp3/200", isRocket: false },
  { productId: "sp4", productName: "비즈앤젤 아기 로션 400ml 무향",          productPrice: 7900,  originalPrice: 11800, discountRate: 33, productImage: "https://picsum.photos/seed/sp4/200", isRocket: true  },
];

const SERVER_RECO_FALLBACK = [
  { name: "젤리캣 바쉬풀 버니 M 핑크 애착인형",   currentPrice: 35900, originalPrice: 44900, discountRate: 20, image: "https://picsum.photos/seed/sr1/200", affiliateUrl: null, isRocket: true,  impressionUrl: null },
  { name: "스토케 트립트랩 하이체어 화이트",       currentPrice: 340000, originalPrice: 399000, discountRate: 15, image: "https://picsum.photos/seed/sr2/200", affiliateUrl: null, isRocket: false, impressionUrl: null },
  { name: "타이니러브 수더앤그루브 모빌 공식",     currentPrice: 78000, originalPrice: 92000, discountRate: 15, image: "https://picsum.photos/seed/sr3/200", affiliateUrl: null, isRocket: true,  impressionUrl: null },
  { name: "브이텍 걸음마 학습기 한영버전",         currentPrice: 45000, originalPrice: 56000, discountRate: 20, image: "https://picsum.photos/seed/sr4/200", affiliateUrl: null, isRocket: true,  impressionUrl: null },
];

// ---------------------------------------------------------------------------
// getGoldboxDeals  (v2 onCall)
// GET /v2/providers/affiliate_open_api/apis/openapi/v1/products/goldbox
// ---------------------------------------------------------------------------

exports.getGoldboxDeals = onCall({ invoker: "public", timeoutSeconds: 15 }, async (request) => {
  console.log("getGoldboxDeals invoked!");
  const { limit = 10 } = request.data ?? {};
  const safeLimit = Math.min(Math.max(1, Number(limit) || 10), 50);

  const accessKey = process.env.COUPANG_ACCESS_KEY;
  const secretKey = process.env.COUPANG_SECRET_KEY;

  // Serve from cache if fresh
  const cached = cacheGet("goldbox");
  if (cached) {
    console.log("[getGoldboxDeals] cache hit");
    return { products: cached.slice(0, safeLimit), source: "cache" };
  }

  try {
    if (!accessKey || !secretKey) {
      console.log("[getGoldboxDeals] keys not configured — returning ✅ server visual fallback");
      return { products: SERVER_GOLDBOX_FALLBACK.slice(0, safeLimit), source: "server_mock" };
    }

    const { data: json } = await withTimeout(
      axios.get(`https://api-gateway.coupang.com${GOLDBOX_PATH}`, {
        headers: {
          Authorization: generateHmac("GET", GOLDBOX_PATH, secretKey, accessKey),
          "Content-Type": "application/json;charset=UTF-8",
        },
        timeout: 5000,
      }),
      5000
    );

    console.log(`[getGoldboxDeals] rCode=${json?.rCode} items=${Array.isArray(json?.data) ? json.data.length : "n/a"}`);

    if (json?.rCode !== "0") {
      return { products: SERVER_GOLDBOX_FALLBACK.slice(0, safeLimit), source: "server_mock" };
    }

    const raw = Array.isArray(json?.data) ? json.data : (json?.data?.productData ?? []);
    console.log(`[getGoldboxDeals] rCode=0 raw_count=${raw.length}`);

    const products = raw.slice(0, safeLimit).map((item) => ({
      name:           cleanName(typeof item.productName === "string" ? item.productName : null),
      currentPrice:   typeof item.productPrice  === "number" ? item.productPrice  : null,
      originalPrice:  item.originalPrice != null              ? item.originalPrice : null,
      discountRate:   item.discountRate  != null              ? item.discountRate  : null,
      discount:       item.discountRate  != null              ? item.discountRate  : null,
      image:          pickImage(item),
      affiliateUrl:   typeof item.productUrl    === "string" ? item.productUrl    : null,
      categoryName:   typeof item.categoryName  === "string" ? item.categoryName  : null,
      isRocket:       item.isRocket === true,
      isFreeShipping: item.isFreeShipping === true,
    }));

    const result = products.length > 0 ? products : SERVER_GOLDBOX_FALLBACK.slice(0, safeLimit);
    if (products.length > 0) cacheSet("goldbox", products);
    console.log("Successfully fetched Goldbox data");
    return { products: result.slice(0, safeLimit), source: products.length > 0 ? "goldbox_api" : "server_mock" };
  } catch (error) {
    const is429 = error?.response?.status === 429 || String(error?.message).includes("429");
    console.error("Goldbox Error:", error?.message ?? error);
    console.error(`[getGoldboxDeals] error (429=${is429}):`, error?.message ?? error);
    return { products: SERVER_GOLDBOX_FALLBACK.slice(0, safeLimit), source: "server_mock" };
  }
});

// ---------------------------------------------------------------------------
// getPersonalizedRecoV2  (v2 onCall)
// POST /v2/providers/affiliate_open_api/apis/openapi/v2/products/reco
// Per RULE-13: impressionUrl must be preserved in the response.
// ---------------------------------------------------------------------------

exports.getPersonalizedRecoV2 = onCall({ invoker: "public", timeoutSeconds: 15 }, async (request) => {
  const { limit = 10, deviceId = "mock_device", puid = "mock_user" } = request.data ?? {};
  const safeLimit = Math.min(Math.max(1, Number(limit) || 10), 50);

  const cachedReco = cacheGet("reco_v2");
  if (cachedReco) {
    console.log("[getPersonalizedRecoV2] cache hit");
    return { products: cachedReco.slice(0, safeLimit), source: "cache" };
  }

  const accessKey = process.env.COUPANG_ACCESS_KEY;
  const secretKey = process.env.COUPANG_SECRET_KEY;

  const body = {
    site:   {},
    device: { id: deviceId, lmt: 0 },
    imp:    { imageSize: "512x512" },
    user:   { puid },
  };

  try {
    if (!accessKey || !secretKey) {
      console.log("[getPersonalizedRecoV2] keys not configured — returning ✅ server visual fallback");
      return { products: SERVER_RECO_FALLBACK.slice(0, safeLimit), source: "server_mock" };
    }

    const { data: json } = await withTimeout(
      axios.post(`https://api-gateway.coupang.com${RECO_V2_PATH}`, body, {
        headers: {
          Authorization: generateHmac("POST", RECO_V2_PATH, secretKey, accessKey),
          "Content-Type": "application/json;charset=UTF-8",
        },
        timeout: 5000,
      }),
      5000
    );

    console.log(`[getPersonalizedRecoV2] rCode=${json?.rCode} items=${Array.isArray(json?.data) ? json.data.length : "n/a"}`);

    if (json?.rCode !== "0") {
      return { products: SERVER_RECO_FALLBACK.slice(0, safeLimit), source: "server_mock" };
    }

    const raw = Array.isArray(json?.data) ? json.data : (json?.data?.productData ?? []);
    const products = raw.slice(0, safeLimit).map((item) => ({
      name:          cleanName(typeof item.productName  === "string" ? item.productName  : null),
      currentPrice:  typeof item.productPrice === "number" ? item.productPrice : null,
      originalPrice: typeof item.originalPrice === "number" ? item.originalPrice : null,
      discountRate:  typeof item.discountRate  === "number" ? item.discountRate  : null,
      image:         pickImage(item),
      affiliateUrl:  typeof item.productUrl    === "string" ? item.productUrl    : null,
      isRocket:      item.isRocket === true,
      impressionUrl: typeof item.impressionUrl === "string" ? item.impressionUrl : null,
    }));

    const recoResult = products.length > 0 ? products : SERVER_RECO_FALLBACK.slice(0, safeLimit);
    if (products.length > 0) cacheSet("reco_v2", products);
    return { products: recoResult.slice(0, safeLimit), source: products.length > 0 ? "reco_api" : "server_mock" };
  } catch (error) {
    const is429 = error?.response?.status === 429 || String(error?.message).includes("429");
    console.error(`[getPersonalizedRecoV2] error (429=${is429}):`, error?.message ?? error);
    return { products: SERVER_RECO_FALLBACK.slice(0, safeLimit), source: "server_mock" };
  }
});

// ---------------------------------------------------------------------------
// registerProductFromUrl
// Multi-market URL parser + product registration pipeline
// Input:  { url: string }
// Output: { productGroupId, market, originalId, name, price }
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// tagProduct  —  server-side mirror of src/services/productTagService.js
// Kept in sync manually; logic is identical to the client-side version.
// Cannot import from src/ because functions use CommonJS.
// ---------------------------------------------------------------------------

const _hasAny = (text, kws) => kws.some((k) => text.includes(k));

const STAGE_KW_MAP = [
  { stage: "pregnancy",    keywords: ["임신","태교","산전","태아","출산준비","임부","산모"] },
  { stage: "newborn",      keywords: ["신생아","1단계","0개월","1개월","2개월","newborn","갓난","초신생아"] },
  { stage: "early_infant", keywords: ["2단계","3개월","4개월","5개월","백일"] },
  { stage: "infant",       keywords: ["3단계","6개월","7개월","8개월","9개월","10개월","11개월","이유식","초기이유식","중기이유식","후기이유식"] },
  { stage: "toddler",      keywords: ["4단계","돌","12개월","13개월","14개월","15개월","16개월","17개월","18개월","걸음마","첫돌","1세","유아"] },
  { stage: "early_child",  keywords: ["5단계","24개월","2세","3세","두돌","세돌","어린이집","유치원준비"] },
  { stage: "child",        keywords: ["4세","5세","6세","7세","어린이","초등","6단계"] },
];

const CATEGORY_RULES_CF = [
  { keywords: ["기저귀","diaper"],                          categoryTags: ["diaper"],   defaultStageTags: ["newborn","early_infant","infant","toddler"],  problemTags: ["diaper_leak","night_diaper"] },
  { keywords: ["물티슈","wipes","wipe"],                    categoryTags: ["diaper"],   defaultStageTags: ["newborn","early_infant","infant","toddler"],  problemTags: ["diaper_leak"] },
  { keywords: ["분유","formula"],                           categoryTags: ["feeding"],  defaultStageTags: ["newborn","early_infant","infant"],            problemTags: [] },
  { keywords: ["이유식","baby food"],                       categoryTags: ["feeding"],  defaultStageTags: ["infant","toddler"],                          problemTags: [] },
  { keywords: ["수유","젖병","feeding","milk","bottle","breast"], categoryTags: ["feeding"],  defaultStageTags: ["newborn","early_infant"],             problemTags: [] },
  { keywords: ["목욕","위생","bath","wash","샴푸","바디워시"], categoryTags: ["bath"],   defaultStageTags: ["newborn","early_infant","infant"],            problemTags: [] },
  { keywords: ["놀이","완구","play","toy","장난감","블록"],  categoryTags: ["play"],     defaultStageTags: ["infant","toddler","early_child"],             problemTags: [] },
  { keywords: ["외출","유모차","카시트","stroller","carseat"], categoryTags: ["outing"], defaultStageTags: ["newborn","early_infant","infant","toddler"], problemTags: [] },
  { keywords: ["침대","바운서","요람","아기침대"],           categoryTags: ["sleep"],    defaultStageTags: ["newborn","early_infant","infant"],            problemTags: [] },
  { keywords: ["안전","가드","모서리","안전문"],             categoryTags: ["safety"],   defaultStageTags: ["toddler","early_child"],                     problemTags: [] },
];

const KEYWORD_DICT_CF = [
  { keywords: ["피부","예민","트러블"], tags: ["hygiene"] },
  { keywords: ["냄새","흡수"],          tags: ["diaper"]  },
  { keywords: ["수유","분유"],          tags: ["feeding"] },
  { keywords: ["놀이","장난감"],        tags: ["play"]    },
];

/**
 * Returns { stageTags: string[], categoryTags: string[], problemTags: string[] }
 * Mirror of src/services/productTagService.js — keep in sync.
 */
const tagProduct = (name) => {
  const combined = String(name || "").toLowerCase();

  const stageSet = new Set();
  STAGE_KW_MAP.forEach(({ stage, keywords }) => {
    if (_hasAny(combined, keywords)) stageSet.add(stage);
  });

  const rule = CATEGORY_RULES_CF.find(({ keywords }) => _hasAny(combined, keywords));
  const categoryTags = rule ? rule.categoryTags : ["general"];
  const problemTags  = rule ? rule.problemTags  : [];
  const defaultStages = rule ? rule.defaultStageTags : ["infant"];

  const stageTags = stageSet.size > 0 ? [...stageSet] : defaultStages;

  const extraTags = new Set();
  KEYWORD_DICT_CF.forEach(({ keywords, tags }) => {
    if (_hasAny(combined, keywords)) tags.forEach((t) => extraTags.add(t));
  });

  return {
    stageTags,
    categoryTags: [...new Set([...categoryTags, ...extraTags])],
    problemTags,
  };
};

// ---------------------------------------------------------------------------

/**
 * Resolves a potentially-shortened URL (e.g. link.coupang.com/a/xxxxx)
 * to its final destination by following HTTP redirects.
 * Returns the resolved URL string, or the original if resolution fails.
 */
const resolveRedirect = async (url) => {
  if (!/link\.coupang\.com|coupa\.ng|coupang\.onelink/i.test(url)) return url;
  try {
    const res = await axios.get(url, {
      maxRedirects: 10,
      timeout: 6000,
      headers: { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" },
      validateStatus: () => true,
    });
    // axios follows redirects automatically; res.request.res.responseUrl is the final URL
    const finalUrl = res.request?.res?.responseUrl || res.config?.url || url;
    return finalUrl;
  } catch (_) {
    return url;
  }
};

/**
 * Detects the market and extracts the raw product ID from a URL.
 * Returns { market, originalId } or null if the URL is not supported.
 *
 * Add new markets here (naver, 11st, gmarket, …) without touching other code.
 */
const parseProductFromUrl = (url) => {
  if (/coupang\.com|coupa\.ng/i.test(url)) {
    const match = url.match(/\/v[mp]\/products\/(\d+)/i);
    const originalId = match ? match[1] : null;
    return { market: "coupang", originalId };
  }
  // Future markets:
  // if (/smartstore\.naver\.com|naver\.com\/products/i.test(url)) { ... return { market: 'naver', originalId }; }
  // if (/11st\.co\.kr/i.test(url))  { ... return { market: '11st',  originalId }; }
  return null;
};

/**
 * Fetches product details for a given market + originalId.
 * Coupang: Partners API → v4 JSON API → placeholder fallback.
 * Add new market cases here (naver, 11st, …) without touching other code.
 */
const fetchProductDetailsByMarket = async (market, originalId) => {
  switch (market) {
    case "coupang": {
      const accessKey = process.env.COUPANG_ACCESS_KEY;
      const secretKey = process.env.COUPANG_SECRET_KEY;

      if (accessKey && secretKey) {
        const [pRes, v4Res] = await Promise.allSettled([
          tryPartnersApi(originalId, accessKey, secretKey),
          tryV4Api(originalId, null),
        ]);
        const partners = pRes.status === "fulfilled" ? pRes.value : null;
        const v4 = v4Res.status === "fulfilled" ? v4Res.value : null;

        if (partners) {
          return {
            name: partners.name,
            price: partners.price,
            image: partners.image,
            isOutOfStock: v4?.isOutOfStock ?? false,
          };
        }
        if (v4) {
          return { name: v4.name, price: v4.price, image: null, isOutOfStock: v4.isOutOfStock };
        }
      }

      // Keys not configured or both failed — try v4 alone
      const v4Result = await tryV4Api(originalId, null);
      if (v4Result) {
        return { name: v4Result.name, price: v4Result.price, image: null, isOutOfStock: v4Result.isOutOfStock };
      }

      // Last resort: HTML scraping with cheerio-backed selectors
      try {
        console.log(`[fetchProductDetailsByMarket] HTML scraping fallback for productId=${originalId}`);
        const htmlRes = await axios.get(`https://www.coupang.com/vp/products/${originalId}`, {
          headers: SCRAPE_HEADERS,
          timeout: 10000,
          validateStatus: () => true,
        });
        const rawHtml = typeof htmlRes.data === "string" ? htmlRes.data : "";
        if (rawHtml && !rawHtml.includes("Access Denied")) {
          const scraped = extractFromHtml(rawHtml);
          if (scraped.name || scraped.price) {
            return {
              name: scraped.name || "쿠팡 상품",
              price: scraped.price,
              image: scraped.image ?? null,
              isOutOfStock: scraped.isOutOfStock,
            };
          }
        }
      } catch (_) {}

      return { name: "쿠팡 상품", price: null, image: null, isOutOfStock: false };
    }
    // Future: case "naver": ...
    // Future: case "11st": ...
    default:
      return { name: "상품", price: null, image: null, isOutOfStock: false };
  }
};

exports.registerProductFromUrl = functions.https.onCall(async (request) => {
  const { url } = request.data;

  if (!url || typeof url !== "string" || !url.trim()) {
    throw new functions.https.HttpsError("invalid-argument", "url required");
  }

  const resolvedUrl = await resolveRedirect(url.trim());
  const parsed = parseProductFromUrl(resolvedUrl);
  if (!parsed || !parsed.market) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "지원하지 않는 쇼핑몰 URL입니다"
    );
  }

  const { market, originalId } = parsed;
  if (!originalId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "상품 ID를 추출할 수 없습니다. 쿠팡 상품 URL을 확인해주세요"
    );
  }

  const productGroupId = `${market}_${originalId}`;
  const firestoreDb = admin.firestore();
  const docRef = firestoreDb.collection("products").doc(productGroupId);

  // Deduplication: check if this product is already registered
  const existing = await docRef.get();
  const isNew = !existing.exists;

  const details = await fetchProductDetailsByMarket(market, originalId);

  // Validation guard: reject if real product data could not be retrieved
  if (details.price == null || details.price <= 0 || isNaN(details.price)) {
    throw new functions.https.HttpsError(
      "not-found",
      "상품 정보를 가져오지 못했습니다. 잠시 후 다시 시도해주세요."
    );
  }

  const { stageTags, categoryTags, problemTags } = tagProduct(details.name);

  const baseFields = {
    productGroupId,
    market,
    originalId,
    name: details.name,
    currentPrice: details.price,
    image: details.image ?? null,
    isOutOfStock: details.isOutOfStock ?? false,
    stageTags,
    categoryTags,
    problemTags,
    status: "active",
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (isNew) {
    await docRef.set({
      ...baseFields,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } else {
    // Preserve createdAt; only refresh metadata
    await docRef.set(baseFields, { merge: true });
  }

  // Record a price snapshot on every registration (tracks price history)
  if (details.price != null) {
    await docRef.collection("offers").add({
      price: details.price,
      checkedAt: admin.firestore.FieldValue.serverTimestamp(),
      source: "registration",
    });
  }

  return {
    productGroupId,
    market,
    originalId,
    name: details.name,
    price: details.price,
    stageTags,
    categoryTags,
    isNew,
  };
});

// ---------------------------------------------------------------------------
// registerProductFromHtml
// ---------------------------------------------------------------------------
// scrapeProductDetails — official-API-only product lookup endpoint
//
// Was a Puppeteer + stealth-plugin WAF-bypass scraper; replaced with an
// official-API-only implementation (Partners deeplink API, then Partners
// search-by-ID API as fallback) — no browser automation, no proxy, no
// bot-detection evasion. Returns 503/RETRY_REQUIRED if both fail.
//
// Input:  { url: string }
// Output: { productGroupId, market, originalId, name, price, image,
//           stockStatus, updatedAt, isNew }
// ---------------------------------------------------------------------------


// Shared Firestore write + HTTP 200 return for scrapeProductDetails
const scrapeWriteAndReturn = async (res, originalId, details, source) => {
  const productName    = cleanName(details.name);
  const price          = details.price;
  const image          = typeof details.image === "string" ? details.image : null;
  const stockStatus    = details.isOutOfStock ? "out_of_stock" : "in_stock";
  const updatedAt      = new Date().toISOString();
  const productGroupId = `coupang_${originalId}`;

  const firestoreDb = admin.firestore();
  const docRef      = firestoreDb.collection("products").doc(productGroupId);
  const existing    = await docRef.get();
  const isNew       = !existing.exists;
  const { stageTags, categoryTags, problemTags } = tagProduct(productName);

  const baseFields = {
    productGroupId, market: "coupang", originalId,
    name: productName, currentPrice: price, image,
    isOutOfStock: details.isOutOfStock ?? false, stockStatus,
    stageTags, categoryTags, problemTags,
    status: "active",
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (isNew) {
    await docRef.set({ ...baseFields, createdAt: admin.firestore.FieldValue.serverTimestamp() });
  } else {
    await docRef.set(baseFields, { merge: true });
  }
  await docRef.collection("offers").add({
    price, checkedAt: admin.firestore.FieldValue.serverTimestamp(), source,
  });

  return res.status(200).json({
    productGroupId, market: "coupang", originalId,
    name: productName, price, image,
    stockStatus, updatedAt, stageTags, categoryTags, isNew,
  });
};

exports.scrapeProductDetails = onRequest(
  { timeoutSeconds: 30, memory: "256MiB" },
  (req, res) => {
    const cors = require("cors")({ origin: true });
    cors(req, res, async () => {
      try {
        const accessKey = process.env.COUPANG_ACCESS_KEY;
        const secretKey = process.env.COUPANG_SECRET_KEY;

        const targetUrl = req.body?.url || req.body?.data?.url;
        if (!targetUrl) return res.status(400).json({ error: "Missing URL" });

        const urlMatch = targetUrl.match(/products\/(\d+)/);
        if (!urlMatch || !urlMatch[1]) {
          return res.status(422).json({ error: "상품 ID 추출 실패", debug_url: targetUrl });
        }
        const originalId = urlMatch[1];
        console.log("[scrapeProductDetails] Target productId:", originalId);

        if (!accessKey || !secretKey) {
          return res.status(503).json({ error: "API keys not configured" });
        }

        // ── Step 1: Partners deeplink API ─────────────────────────────────────────
        console.log("[scrapeProductDetails] Trying Partners deeplink API...");
        const partnersResult = await tryPartnersApi(originalId, accessKey, secretKey).catch((err) => { console.error("[scrapeProductDetails] Partners API error:", err.message); return null; });
        if (partnersResult?.price > 0) {
          console.log("[scrapeProductDetails] Partners API success, price:", partnersResult.price);
          return await scrapeWriteAndReturn(res, originalId, partnersResult, "partners_deeplink");
        }

        // ── Step 2: Partners search API fallback ──────────────────────────────────
        // Use explicit versioned path /v1/products/search — the unversioned SEARCH_PATH
        // constant causes a server-side redirect; fetch follows it but the Authorization
        // header carries the signature for the original path → HMAC mismatch → 401.
        console.log("[scrapeProductDetails] Deeplink failed, trying Partners search API for id:", originalId);
        try {
          const SEARCH_PATH_V1 = "/v2/providers/affiliate_open_api/apis/openapi/v1/products/search";
          const searchPath     = `${SEARCH_PATH_V1}?keyword=${encodeURIComponent(originalId)}&limit=5`;
          const searchRes      = await fetch(`https://api-gateway.coupang.com${searchPath}`, {
            redirect: "follow",
            headers: {
              Authorization: buildPartnersAuth("GET", SEARCH_PATH_V1, accessKey, secretKey),
              "Accept":      "application/json;charset=UTF-8",
            },
          });
          console.log("[scrapeProductDetails] Search API HTTP status:", searchRes.status, "final url:", searchRes.url);
          if (searchRes.ok) {
            const searchJson = await searchRes.json();
            console.log("[scrapeProductDetails] Search API rCode:", searchJson?.rCode, "rMessage:", searchJson?.rMessage);
            const items = searchJson?.data?.productData ?? [];
            const match = items.find((i) => String(i.productId) === String(originalId)) ?? items[0] ?? null;
            if (match && match.productPrice > 0) {
              console.log("[scrapeProductDetails] Search API fallback success, price:", match.productPrice);
              return await scrapeWriteAndReturn(res, originalId, {
                name:  match.productName,
                price: match.productPrice,
                image: typeof match.productImage === "string" ? match.productImage : null,
                isOutOfStock: false,
              }, "search_api_fallback");
            }
          } else {
            const errBody = await searchRes.text().catch(() => "");
            console.error("[scrapeProductDetails] Search API HTTP Error:", searchRes.status, errBody.slice(0, 200));
          }
        } catch (searchErr) {
          console.error("[scrapeProductDetails] Search API Network Error:", searchErr.message);
        }

        return res.status(503).json({ error: "RETRY_REQUIRED: 쿠팡 서버가 응답이 느립니다. 다시 한번 시도해주세요." });

      } catch (err) {
        console.error("Scrape error:", err.message);
        res.status(500).json({ error: err.message });
      }
    });
  }
);

// ---------------------------------------------------------------------------
// the HTML string here for zero-HTTP parsing with cheerio.
// Input:  { html: string, url: string }  (url = final URL after client redirects)
// Output: { productGroupId, market, originalId, name, price, image, isNew }
// ---------------------------------------------------------------------------

exports.registerProductFromHtml = functions.https.onCall(async (request) => {
  const { html, url } = request.data;

  if (!html || typeof html !== "string" || !html.trim()) {
    throw new functions.https.HttpsError("invalid-argument", "html required");
  }
  if (!url || typeof url !== "string" || !url.trim()) {
    throw new functions.https.HttpsError("invalid-argument", "url required");
  }

  // Detect redirect/block pages before doing any work — signal client to retry
  const lowerHtml = html.slice(0, 2000).toLowerCase();
  const isRedirectPage =
    lowerHtml.includes("deeplink redirect") ||
    lowerHtml.includes("window.location.replace") ||
    lowerHtml.includes("<title>redirect") ||
    lowerHtml.includes("just a moment") ||      // Cloudflare challenge
    lowerHtml.includes("checking your browser"); // Cloudflare/WAF challenge
  if (isRedirectPage || html.trim().length < 500) {
    throw new functions.https.HttpsError(
      "unavailable",
      "RETRY_REQUIRED: 쿠팡 서버가 응답이 느립니다. 다시 한번 시도해주세요."
    );
  }

  // Derive market + originalId from the resolved URL (already redirect-followed by client)
  const parsed = parseProductFromUrl(url.trim());
  if (!parsed || !parsed.market) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "지원하지 않는 쇼핑몰 URL입니다"
    );
  }

  const { market } = parsed;
  let { originalId } = parsed;

  // Bulletproof ID extraction — 4-tier fallback hierarchy
  if (!originalId) {
    const $ = cheerio.load(html);
    let idMatch;

    // Tier 2: og:url meta tag (Coupang always sets this to the canonical product URL)
    const ogUrl = ($('meta[property="og:url"]').attr("content") || "").trim();
    if (ogUrl) {
      idMatch = ogUrl.match(/products\/(\d+)/);
      if (idMatch) originalId = idMatch[1];
    }

    // Tier 3: <link rel="canonical">
    if (!originalId) {
      const canonical = ($('link[rel="canonical"]').attr("href") || "").trim();
      if (canonical) {
        idMatch = canonical.match(/products\/(\d+)/);
        if (idMatch) originalId = idMatch[1];
      }
    }

    // Tier 4: brute-force raw HTML — catches JS redirects, embedded JSON, query params
    if (!originalId && html) {
      const rawMatch =
        html.match(/products\/(\d+)/) ||
        html.match(/"productId"\s*:\s*(\d+)/) ||
        html.match(/productId=(\d+)/);
      if (rawMatch) originalId = rawMatch[1];
    }
  }

  if (!originalId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "상품 ID를 추출할 수 없습니다. 쿠팡 상품 URL을 확인해주세요."
    );
  }

  // Parse using cheerio — no HTTP calls made here
  const { price, name: rawName, image, isOutOfStock } = extractFromHtml(html);

  if (price == null || price <= 0 || isNaN(price)) {
    throw new functions.https.HttpsError(
      "internal",
      "HTML 파싱 실패: 쿠팡 차단(CAPTCHA)이 의심됩니다. 와이파이를 끄고 LTE/5G 데이터로 다시 시도해주세요."
    );
  }

  const productName   = rawName || "쿠팡 상품";
  const productGroupId = `${market}_${originalId}`;
  const firestoreDb   = admin.firestore();
  const docRef        = firestoreDb.collection("products").doc(productGroupId);

  const existing = await docRef.get();
  const isNew    = !existing.exists;

  const { stageTags, categoryTags, problemTags } = tagProduct(productName);

  const baseFields = {
    productGroupId,
    market,
    originalId,
    name:         productName,
    currentPrice: price,
    image:        image ?? null,
    isOutOfStock: isOutOfStock ?? false,
    stageTags,
    categoryTags,
    problemTags,
    status:    "active",
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (isNew) {
    await docRef.set({ ...baseFields, createdAt: admin.firestore.FieldValue.serverTimestamp() });
  } else {
    await docRef.set(baseFields, { merge: true });
  }

  await docRef.collection("offers").add({
    price,
    checkedAt: admin.firestore.FieldValue.serverTimestamp(),
    source: "registration_html",
  });

  return { productGroupId, market, originalId, name: productName, price, image: image ?? null, stageTags, categoryTags, isNew };
});

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// scheduledPriceUpdate  — runs every 3 hours via Cloud Scheduler
//
// Tiered update logic (minimises Coupang API calls):
//   Tier A — High priority: products someone has actually saved/tracked
//             (user_saved_products), OR that received a product_click /
//             product_purchase_click / product_view action in the last 48 h.
//             → Updated on every 3-hour run (8×/day — frequent enough to
//               catch most Coupang flash-sale/coupon windows without
//               hammering the API for marginal accuracy gains).
//   Tier B — Low priority: all other active products (browsed but never
//             saved and not recently viewed).
//             → Skipped unless priceLastUpdatedAt is null or > 24 h ago.
//
// Rate-limit strategy: 10 products per batch, 1-second delay between batches.
// ---------------------------------------------------------------------------

exports.scheduledPriceUpdate = onSchedule("every 3 hours", async () => {
    const firestoreDb = admin.firestore();
    const now = Date.now();
    const MS_48H = 48 * 60 * 60 * 1000;
    const MS_24H = 24 * 60 * 60 * 1000;

    const tierAIds = new Set();

    // ── Step 1a: build Tier A from actual save/track relationships ───────────
    // This is the primary Tier A signal — a saved item should stay fresh
    // even if the owner hasn't opened the app to "view" it again recently.
    const savedProductsSnap = await firestoreDb
      .collection("user_saved_products")
      .select("productGroupId")
      .get();
    savedProductsSnap.docs.forEach((d) => {
      const pid = d.data().productGroupId;
      if (pid) tierAIds.add(pid);
    });

    // ── Step 1b: also fold in recently-viewed products (browsing signal,   ──
    // not yet saved) — single-field range query on createdAt, no composite
    // index needed.
    const cutoff48h = admin.firestore.Timestamp.fromMillis(now - MS_48H);
    const recentActionsSnap = await firestoreDb
      .collection("user_product_actions")
      .where("createdAt", ">=", cutoff48h)
      .get();

    recentActionsSnap.docs.forEach((d) => {
      const { actionType, productGroupId, productId } = d.data();
      if (
        actionType === "product_click" ||
        actionType === "product_purchase_click" ||
        actionType === "product_view"
      ) {
        const pid = productGroupId || productId;
        if (pid) tierAIds.add(pid);
      }
    });

    // ── Step 2: fetch all active products ────────────────────────────────────
    const productsSnap = await firestoreDb
      .collection("products")
      .where("status", "==", "active")
      .get();

    if (productsSnap.empty) {
      console.log("scheduledPriceUpdate: no active products");
      return null;
    }

    // ── Step 3: apply tiered filter ──────────────────────────────────────────
    const cutoff24hMs = now - MS_24H;
    const docsToProcess = productsSnap.docs.filter((d) => {
      if (tierAIds.has(d.id)) return true; // Tier A — always refresh
      // Tier B — only if never updated or stale (> 24 h)
      const lastUpdated = d.data().priceLastUpdatedAt;
      if (!lastUpdated) return true;
      const lastMs = lastUpdated.toMillis?.() ?? 0;
      return lastMs < cutoff24hMs;
    });

    if (docsToProcess.length === 0) {
      console.log("scheduledPriceUpdate: all products up-to-date, nothing to do");
      return null;
    }

    // ── Step 4: process in batches ───────────────────────────────────────────
    const BATCH_SIZE = 10;
    const DELAY_MS = 1000;

    for (let i = 0; i < docsToProcess.length; i += BATCH_SIZE) {
      const batch = docsToProcess.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (productDoc) => {
          const product = productDoc.data();
          const { market, originalId, currentPrice } = product;

          if (!market || !originalId) return;

          try {
            const details = await fetchProductDetailsByMarket(market, originalId);

            // Always persist OOS state when explicitly detected, even if price unavailable
            const oosNow = details.isOutOfStock === true;
            const wasOos = product.isOutOfStock === true;

            if (details.price == null || details.price <= 0) {
              if (oosNow !== wasOos) {
                await productDoc.ref.update({
                  isOutOfStock: oosNow,
                  priceLastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
                });
              }
              return;
            }

            const newPrice = details.price;

            // Always write to product_price_history (feeds priceIntel bar chart)
            await firestoreDb.collection("product_price_history").add({
              productId: productDoc.id,
              price: newPrice,
              source: "scheduled",
              checkedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            // Also roll into today's daily max/min bucket (feeds the 60-day
            // marketing average — DetailScreen's chart and, via
            // getPriceIntelligence, the 관심상품 thumbnail discount badges).
            await updateDailyPriceBucket(productDoc.id, newPrice).catch(() => {});

            const prevPrice =
              typeof currentPrice === "number" && currentPrice > 0
                ? currentPrice
                : null;
            const dropPct =
              prevPrice !== null && newPrice < prevPrice
                ? (prevPrice - newPrice) / prevPrice
                : 0;

            // Always update priceLastUpdatedAt; sync OOS state; update currentPrice if changed
            const updateFields = {
              priceLastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
              isOutOfStock: oosNow,
            };

            if (newPrice !== currentPrice) {
              updateFields.currentPrice = newPrice;

              if (dropPct > 0.05) {
                // Persist drop signal on doc for MyPage badge — no extra query needed
                updateFields.lastPriceDrop = prevPrice - newPrice;
                updateFields.lastPriceDropPct = Math.round(dropPct * 100);
              } else if (prevPrice !== null && newPrice > prevPrice) {
                // Price rose — clear stale drop badge
                updateFields.lastPriceDrop = 0;
                updateFields.lastPriceDropPct = 0;
              }

              // Snapshot in offers sub-collection (powers ProductDetail recent list)
              await productDoc.ref.collection("offers").add({
                price: newPrice,
                checkedAt: admin.firestore.FieldValue.serverTimestamp(),
                source: "scheduled",
              });

              // Log price_drop_event when drop > 5%
              if (dropPct > 0.05) {
                await firestoreDb.collection("user_product_actions").add({
                  productGroupId: productDoc.id,
                  actionType: "price_drop_event",
                  priceBefore: prevPrice,
                  priceAfter: newPrice,
                  dropPercent: Math.round(dropPct * 100),
                  createdAt: admin.firestore.FieldValue.serverTimestamp(),
                });
                console.log(
                  `scheduledPriceUpdate: 📉 ${Math.round(dropPct * 100)}% drop on ${productDoc.id}`
                );
              }
            }

            await productDoc.ref.update(updateFields);
          } catch (err) {
            console.error(
              `scheduledPriceUpdate: failed for ${productDoc.id}: ${err.message}`
            );
          }
        })
      );

      // Respect Coupang API rate limits between batches
      if (i + BATCH_SIZE < docsToProcess.length) {
        await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
      }
    }

    const tierACount = docsToProcess.filter((d) => tierAIds.has(d.id)).length;
    const tierBCount = docsToProcess.length - tierACount;
    const skipped = productsSnap.docs.length - docsToProcess.length;
    console.log(
      `scheduledPriceUpdate: processed ${docsToProcess.length} products ` +
      `(Tier A: ${tierACount}, Tier B: ${tierBCount}, skipped: ${skipped})`
    );
    return null;
  });

// ---------------------------------------------------------------------------
// onPriceDropNotify  — Firestore onCreate trigger on user_product_actions
//
// Fires when a `price_drop_event` document is created by scheduledPriceUpdate.
// Finds eligible users (saved the product OR viewed it 2+ times in 7 days)
// and writes an in-app notification to
//   notifications/{userId}/user_notifications
//
// No external push SDK required — all Firestore-based.
// productGroupId identity rule is respected throughout.
// ---------------------------------------------------------------------------

exports.onPriceDropNotify = onDocumentCreated("user_product_actions/{docId}", async (event) => {
    const snap = event.data;
    const data = snap.data();
    if (data.actionType !== "price_drop_event") return null;

    const { productGroupId, priceBefore, priceAfter, dropPercent } = data;
    if (!productGroupId) return null;

    const firestoreDb = admin.firestore();

    // Fetch product name for the notification body
    const productDoc = await firestoreDb
      .collection("products")
      .doc(productGroupId)
      .get();
    const productName = productDoc.exists
      ? productDoc.data().name || "관심 상품"
      : "관심 상품";

    const priceDrop =
      typeof priceBefore === "number" && typeof priceAfter === "number"
        ? priceBefore - priceAfter
        : 0;
    const priceDropStr =
      priceDrop > 0
        ? `₩${priceDrop.toLocaleString("ko-KR")}`
        : "일부";
    const body = `📉 [맘딜] 고민하던 상품 가격이 ${priceDropStr} 내려갔어요! 지금 확인해보세요.`;

    // ── Eligible user set ──────────────────────────────────────────────────
    const notifyUserIds = new Set();

    // 1) Users who saved this product for price tracking
    //    NOTE: user_saved_products docs always use `productGroupId`, never
    //    `productId` — this query previously filtered on the wrong field
    //    name and matched zero documents, ever, silently.
    const savedSnap = await firestoreDb
      .collection("user_saved_products")
      .where("productGroupId", "==", productGroupId)
      .get();
    savedSnap.docs.forEach((d) => {
      const uid = d.data().userId;
      if (uid) notifyUserIds.add(uid);
    });

    // 2) Users who viewed this product 2+ times in the last 7 days.
    //    Single-field query on productGroupId only — avoids composite index.
    //    Date + count filter applied client-side.
    const sevenDaysAgoMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const viewsSnap = await firestoreDb
      .collection("user_product_actions")
      .where("productGroupId", "==", productGroupId)
      .get();

    const viewCountByUser = {};
    viewsSnap.docs.forEach((d) => {
      const { userId, actionType, createdAt } = d.data();
      if (!userId || actionType !== "product_view") return;
      const ts = createdAt?.toMillis?.() ?? 0;
      if (ts < sevenDaysAgoMs) return;
      viewCountByUser[userId] = (viewCountByUser[userId] || 0) + 1;
    });
    Object.entries(viewCountByUser).forEach(([uid, count]) => {
      if (count >= 2) notifyUserIds.add(uid);
    });

    if (notifyUserIds.size === 0) {
      console.log(`onPriceDropNotify: no eligible users for ${productGroupId}`);
      return null;
    }

    // ── Write notifications ────────────────────────────────────────────────
    await Promise.all(
      Array.from(notifyUserIds).map((userId) =>
        firestoreDb
          .collection("notifications")
          .doc(userId)
          .collection("user_notifications")
          .add({
            type: "price_drop",
            productGroupId,
            productName,
            priceDrop,
            priceBefore: priceBefore ?? null,
            priceAfter: priceAfter ?? null,
            dropPercent: dropPercent ?? null,
            body,
            isRead: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          })
      )
    );

    console.log(
      `onPriceDropNotify: wrote ${notifyUserIds.size} notifications for ${productGroupId}`
    );
    return null;
  });

// ---------------------------------------------------------------------------

exports.fetchCoupangProduct = functions.https.onCall(async (request) => {

  const { productId, itemId } = request.data;

  if (!productId) {
    throw new functions.https.HttpsError("invalid-argument", "productId required");
  }

  const EMPTY = { name: "쿠팡 상품", price: null, isOutOfStock: false, image: null,
                  optionName: null, sellerType: "unknown", deliveryType: "normal", isRocket: false };

  try {
    const accessKey = process.env.COUPANG_ACCESS_KEY;
    const secretKey = process.env.COUPANG_SECRET_KEY;

    // Strategy 1: Partners API + v4 in parallel (requires keys in .env)
    if (accessKey && secretKey) {
      const [pRes, v4Res] = await Promise.allSettled([
        tryPartnersApi(productId, accessKey, secretKey),
        tryV4Api(productId, itemId),
      ]);

      const partners = pRes.status === "fulfilled" ? pRes.value : null;
      const v4 = v4Res.status === "fulfilled" ? v4Res.value : null;

      if (partners) {
        console.log(`Partners API success: productId=${productId}`);
        return {
          name: partners.name,
          price: partners.price,
          image: partners.image,
          isOutOfStock: v4?.isOutOfStock ?? false,
          optionName: v4?.optionName ?? null,
          sellerType: v4?.sellerType ?? "unknown",
          deliveryType: v4?.deliveryType ?? "normal",
          isRocket: v4?.isRocket ?? false,
        };
      }

      // Partners failed — use v4 result if available
      if (v4) {
        console.log(`Partners failed, v4 fallback: productId=${productId}`);
        return { name: v4.name, price: v4.price, isOutOfStock: v4.isOutOfStock, image: null,
                 optionName: v4.optionName, sellerType: v4.sellerType, deliveryType: v4.deliveryType, isRocket: v4.isRocket };
      }
    }

    // Strategy 2: v4 alone (no Partners keys, or both failed above)
    const v4Result = await tryV4Api(productId, itemId);
    if (v4Result) {
      console.log(`v4 API success: productId=${productId}`);
      return { name: v4Result.name, price: v4Result.price, isOutOfStock: v4Result.isOutOfStock, image: null,
               optionName: v4Result.optionName, sellerType: v4Result.sellerType,
               deliveryType: v4Result.deliveryType, isRocket: v4Result.isRocket };
    }

    // Strategy 3: HTML scraping fallback
    console.log(`HTML scraping fallback: productId=${productId}`);
    const itemQuery = itemId ? `?itemId=${itemId}` : "";
    const response = await fetch(
      `https://www.coupang.com/vp/products/${productId}${itemQuery}`,
      { headers: SCRAPE_HEADERS }
    );
    const html = await response.text();

    const titleMatch = html.match(/<title>(.*?)<\/title>/i);
    const titleName = titleMatch ? titleMatch[1].replace(" : 쿠팡", "").trim() : null;

    if (titleName?.includes("Access Denied")) {
      console.log(`HTML scraping blocked (Access Denied): productId=${productId}`);
      return EMPTY;
    }

    const { price, isOutOfStock, name: sdpName, image: scrapedImage,
            optionName, sellerType, deliveryType, isRocket } = extractFromHtml(html);

    return {
      name: sdpName || titleName || "쿠팡 상품",
      price,
      isOutOfStock,
      image: scrapedImage ?? null,
      optionName,
      sellerType,
      deliveryType,
      isRocket,
    };

  } catch (error) {
    console.error(error);
    return EMPTY;
  }
});

// ---------------------------------------------------------------------------
// handleShareLink
// HTTPS onRequest — web bridge for viral share links.
// Non-app users who click a share link are immediately redirected to the
// Coupang affiliate URL so the commission is tracked.
// URL: https://us-central1-momdeal-494c4.cloudfunctions.net/handleShareLink?p={productGroupId}
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// onReviewCreate
// Firestore onCreate trigger on reviews/{reviewId}
// 1. Recomputes reviewStats (avgRating, reviewCount, positiveRate) on the product doc
// 2. Logs review_written action in user_product_actions
// Uses single-field productGroupId query — no composite index needed
// ---------------------------------------------------------------------------

exports.onReviewCreate = onDocumentCreated("reviews/{reviewId}", async (event) => {
    const snap = event.data;
    const data = snap.data();
    const { productGroupId, userId, rating } = data;
    if (!productGroupId) return null;

    const firestoreDb = admin.firestore();

    try {
      // 1. Full recompute of reviewStats (consistent with client-side updateReviewStats)
      const reviewsSnap = await firestoreDb
        .collection("reviews")
        .where("productGroupId", "==", productGroupId)
        .get();

      const docs = reviewsSnap.docs.map((d) => d.data());
      const reviewCount = docs.length;
      if (reviewCount > 0) {
        const totalRating = docs.reduce(
          (s, r) => s + (typeof r.rating === "number" ? r.rating : 0), 0
        );
        const positiveCount = docs.filter(
          (r) => typeof r.rating === "number" && r.rating >= 4
        ).length;
        await firestoreDb.collection("products").doc(productGroupId).update({
          "reviewStats.avgRating":    totalRating / reviewCount,
          "reviewStats.reviewCount":  reviewCount,
          "reviewStats.positiveRate": positiveCount / reviewCount,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      // 2. Log review_written action
      if (userId) {
        await firestoreDb.collection("user_product_actions").add({
          userId,
          productGroupId,
          productId: productGroupId,
          actionType: "review_written",
          rating: typeof rating === "number" ? rating : null,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    } catch (error) {
      console.error("onReviewCreate error:", error);
    }

    return null;
  });

// ---------------------------------------------------------------------------
// handleShareLink
// HTTPS onRequest — web bridge for viral share links.
// Non-app users who click a share link are immediately redirected to the
// Coupang affiliate URL so the commission is tracked.
// URL: https://us-central1-momdeal-494c4.cloudfunctions.net/handleShareLink?p={productGroupId}
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// scheduledDailyPriceCheck — daily at 02:00 KST (= 17:00 UTC)
// Loops all active products, scrapes current price, appends to priceHistory
// array on the product doc, and flags drops > 5% for push notifications.
// ---------------------------------------------------------------------------

exports.scheduledDailyPriceCheck = onSchedule({ schedule: "0 17 * * *", timeZone: "UTC" }, async () => {
  const firestoreDb = admin.firestore();

  const productsSnap = await firestoreDb
    .collection("products")
    .where("status", "==", "active")
    .get();

  if (productsSnap.empty) {
    console.log("[scheduledDailyPriceCheck] no active products");
    return null;
  }

  const BATCH_SIZE = 10;
  const DELAY_MS = 1000;
  const docs = productsSnap.docs;
  let updated = 0;
  let dropped = 0;

  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = docs.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map(async (productDoc) => {
        const product = productDoc.data();
        const { market, originalId, currentPrice } = product;
        if (!market || !originalId) return;

        try {
          const details = await fetchProductDetailsByMarket(market, originalId);
          if (details.price == null || details.price <= 0) return;

          const newPrice = details.price;
          const checkedAt = admin.firestore.FieldValue.serverTimestamp();

          // Roll into today's daily max/min bucket — see scheduledPriceUpdate
          // for why (feeds the 60-day marketing average).
          await updateDailyPriceBucket(productDoc.id, newPrice).catch(() => {});

          // Append snapshot to priceHistory array on the product doc
          const updateFields = {
            priceHistory: admin.firestore.FieldValue.arrayUnion({
              price: newPrice,
              checkedAt: new Date().toISOString(),
            }),
            currentPrice: newPrice,
            isOutOfStock: details.isOutOfStock ?? false,
            priceLastUpdatedAt: checkedAt,
          };

          const prevPrice = typeof currentPrice === "number" && currentPrice > 0 ? currentPrice : null;
          const dropPct = prevPrice !== null && newPrice < prevPrice
            ? (prevPrice - newPrice) / prevPrice
            : 0;

          if (dropPct > 0.05) {
            updateFields.lastPriceDrop = prevPrice - newPrice;
            updateFields.lastPriceDropPct = Math.round(dropPct * 100);

            // Write price_drop_event to trigger onPriceDropNotify
            await firestoreDb.collection("user_product_actions").add({
              productGroupId: productDoc.id,
              actionType: "price_drop_event",
              priceBefore: prevPrice,
              priceAfter: newPrice,
              dropPercent: Math.round(dropPct * 100),
              createdAt: checkedAt,
            });
            dropped++;
            console.log(`[scheduledDailyPriceCheck] 📉 ${Math.round(dropPct * 100)}% drop on ${productDoc.id}`);
          }

          await productDoc.ref.update(updateFields);
          updated++;
        } catch (err) {
          console.error(`[scheduledDailyPriceCheck] failed for ${productDoc.id}: ${err.message}`);
        }
      })
    );

    if (i + BATCH_SIZE < docs.length) {
      await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
    }
  }

  console.log(`[scheduledDailyPriceCheck] done — updated=${updated} drops=${dropped} total=${docs.length}`);
  return null;
});

// ---------------------------------------------------------------------------

exports.handleShareLink = functions.https.onRequest(async (req, res) => {
  const productGroupId = req.query.p;

  if (!productGroupId || typeof productGroupId !== "string") {
    return res.status(400).send("Missing product ID");
  }

  const firestoreDb = admin.firestore();
  const fallbackUrl = `https://www.coupang.com/vp/products/${encodeURIComponent(productGroupId)}`;

  try {
    // 1. Try offers sub-collection (written by scheduledPriceUpdate — most up-to-date)
    const offersSnap = await firestoreDb
      .collection("products")
      .doc(productGroupId)
      .collection("offers")
      .orderBy("checkedAt", "desc")
      .limit(1)
      .get();

    let affiliateUrl = null;
    if (!offersSnap.empty) {
      affiliateUrl = offersSnap.docs[0].data().affiliateUrl ?? null;
    }

    // 2. Fallback: product doc affiliateUrl field
    if (!affiliateUrl) {
      const productSnap = await firestoreDb.collection("products").doc(productGroupId).get();
      if (productSnap.exists) {
        affiliateUrl = productSnap.data().affiliateUrl ?? null;
      }
    }

    // 3. Fallback: bare Coupang product URL (no affiliate token — still monetizable via Partners)
    if (!affiliateUrl) {
      affiliateUrl = fallbackUrl;
    }

    // Log the web click (fire-and-forget — no await)
    firestoreDb.collection("user_product_actions").add({
      productGroupId,
      productId: productGroupId,
      actionType: "share_link_click",
      source: "web_bridge",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }).catch(() => {});

    return res.redirect(302, affiliateUrl);
  } catch (error) {
    console.error("handleShareLink error:", error);
    return res.redirect(302, fallbackUrl);
  }
});

