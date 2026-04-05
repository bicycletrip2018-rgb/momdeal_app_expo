const crypto = require("crypto");
const functions = require("firebase-functions");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
const fetch = require("node-fetch");

admin.initializeApp();

const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1";

const DEEPLINK_PATH =
  "/v2/providers/affiliate_open_api/apis/openapi/v1/deeplink";

const SEARCH_PATH =
  "/v2/providers/affiliate_open_api/apis/openapi/products/search";

const BEST_CATEGORY_PATH =
  "/v2/providers/affiliate_open_api/apis/openapi/products/bestcategories";

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
  let price = null;
  let isOutOfStock = false;
  let name = null;
  let optionName = null;
  let sellerType = "unknown";
  let deliveryType = "normal";
  let isRocket = false;

  // exports.sdp embedded object
  const sdpIdx = html.indexOf("exports.sdp");
  if (sdpIdx !== -1) {
    const braceIdx = html.indexOf("{", sdpIdx);
    if (braceIdx !== -1) {
      const sdp = extractJsonObject(html, braceIdx);
      if (sdp) {
        const base = sdp?.quantityBase?.[0]?.price;
        const raw = base?.salePrice ?? base?.originPrice ?? null;
        if (typeof raw === "number" && raw > 0) price = raw;
        if (sdp.soldOut === true) isOutOfStock = true;
        if (sdp.productName || sdp.title) name = sdp.productName || sdp.title;

        // option name: first vendor item
        const vendorItem = sdp.vendorItems?.[0] ?? sdp.quantityBase?.[0];
        const rawOptName = vendorItem?.vendorItemName ?? vendorItem?.itemName ?? null;
        if (typeof rawOptName === "string" && rawOptName.trim()) {
          optionName = rawOptName.trim();
        }

        // isRocket / deliveryType
        if (sdp.isRocket === true || sdp.rocketDelivery === true) isRocket = true;
        if (sdp.isFresh === true) deliveryType = "fresh";
        else if (isRocket) deliveryType = "rocket";

        // sellerType
        const sellerName = typeof sdp.sellerName === "string" ? sdp.sellerName : "";
        if (sdp.sellerType === "COUPANG" || sellerName.includes("쿠팡") || isRocket) {
          sellerType = "coupang";
        } else if (sellerName) {
          sellerType = "seller";
        }
      }
    }
  }

  // JSON-LD
  if (price === null) {
    for (const block of html.matchAll(
      /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
    )) {
      try {
        const data = JSON.parse(block[1]);
        const offers = Array.isArray(data?.offers) ? data.offers[0] : data?.offers;
        const raw = offers?.price;
        if (raw != null) {
          const parsed = Number(String(raw).replace(/[^0-9]/g, ""));
          if (parsed > 0) {
            price = parsed;
            if (offers?.availability?.includes("OutOfStock")) isOutOfStock = true;
            break;
          }
        }
      } catch (_) {}
    }
  }

  // Inline JS price keys
  if (price === null) {
    for (const pattern of [
      /"finalPrice"\s*:\s*([0-9]+)/,
      /"salePrice"\s*:\s*([0-9]+)/,
      /"salesPrice"\s*:\s*([0-9]+)/,
      /"priceValue"\s*:\s*([0-9]+)/,
      /"discountPrice"\s*:\s*([0-9]+)/,
      /"currentPrice"\s*:\s*([0-9]+)/,
    ]) {
      const match = html.match(pattern);
      if (match) {
        const parsed = Number(match[1]);
        if (parsed > 0) { price = parsed; break; }
      }
    }
  }

  // OG meta tag
  if (price === null) {
    const m =
      html.match(/<meta[^>]+property=["']og:price:amount["'][^>]+content=["']([0-9,]+)["']/i) ||
      html.match(/<meta[^>]+content=["']([0-9,]+)["'][^>]+property=["']og:price:amount["']/i);
    if (m) {
      const parsed = Number(m[1].replace(/,/g, ""));
      if (parsed > 0) price = parsed;
    }
  }

  if (!isOutOfStock) {
    if (/"isSoldOut"\s*:\s*true/.test(html)) isOutOfStock = true;
    else if (/"soldOut"\s*:\s*true/.test(html)) isOutOfStock = true;
    else if (/"outOfStock"\s*:\s*true/.test(html)) isOutOfStock = true;
    else if (html.includes("품절")) isOutOfStock = true;
  }

  // Inline JS fallbacks for new fields
  if (!isRocket) {
    isRocket =
      /"isRocket"\s*:\s*true/.test(html) ||
      /"rocketDelivery"\s*:\s*true/.test(html);
    if (isRocket && deliveryType === "normal") deliveryType = "rocket";
  }
  if (deliveryType === "normal" && /"isFresh"\s*:\s*true/.test(html)) {
    deliveryType = "fresh";
  }
  if (optionName === null) {
    const m =
      html.match(/"vendorItemName"\s*:\s*"([^"]{1,100})"/) ||
      html.match(/"itemName"\s*:\s*"([^"]{1,100})"/);
    if (m) optionName = m[1].trim() || null;
  }
  if (sellerType === "unknown") {
    if (/"sellerType"\s*:\s*"COUPANG"/.test(html) || isRocket) {
      sellerType = "coupang";
    } else if (/"sellerName"\s*:\s*"[^"]*쿠팡[^"]*"/.test(html)) {
      sellerType = "coupang";
    } else if (/"sellerName"\s*:\s*"[^"]+"/.test(html)) {
      sellerType = "seller";
    }
  }

  return { price, isOutOfStock, name, optionName, sellerType, deliveryType, isRocket };
};

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// searchProducts
// GET /v2/providers/affiliate_open_api/apis/openapi/products/search
// Input:  { keyword: string, limit?: number (1-100, default 20) }
// Output: { products: [{ productId, name, price, image, affiliateUrl, isRocket }] }
// ---------------------------------------------------------------------------

exports.searchProducts = functions.https.onCall(async (request) => {
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
        productId: String(item.productId ?? ""),
        name: typeof item.productName === "string" ? item.productName : "쿠팡 상품",
        price: typeof item.productPrice === "number" ? item.productPrice : null,
        image: typeof item.productImage === "string" ? item.productImage : null,
        affiliateUrl: typeof item.productUrl === "string" ? item.productUrl : null,
        isRocket: item.isRocket === true,
      }))
      .filter((p) => p.productId);

    return { products };
  } catch (error) {
    if (error instanceof functions.https.HttpsError) throw error;
    console.error("searchProducts error:", error);
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

// Categories where bestcategories silently returns unrelated results → go straight to search.
// Confirmed bad: 1012 returns groceries, 1014 returns baby wipes, 1016 returns cables.
// All non-baby categories are unreliable; only 1011 (출산/유아동) is confirmed correct.
const SEARCH_FALLBACK_KEYWORDS = {
  1010: "여성 뷰티 스킨케어",
  1012: "가전 디지털",
  1013: "스포츠 레저",
  1014: "식품 먹거리",
  1015: "생활용품",
  1016: "여성패션",
  1017: "주방용품",
  1018: "홈인테리어",
};

// Normalise a product item from either bestcategories or search response shape.
const normProduct = (item) => ({
  productId:    String(item.productId ?? ""),
  name:         typeof item.productName  === "string" ? item.productName  : "쿠팡 상품",
  price:        typeof item.productPrice === "number" ? item.productPrice : null,
  image:        typeof item.productImage === "string" ? item.productImage : null,
  affiliateUrl: typeof item.productUrl   === "string" ? item.productUrl   : null,
  isRocket:     item.isRocket === true,
});

// ---------------------------------------------------------------------------
// Plan B: mock data for categories where Coupang search API returns 401.
// fetchSearchProducts removed until HMAC issue with query params is resolved.
// Images use picsum.photos (seeded) so thumbnails always render consistently.
// ---------------------------------------------------------------------------
const MOCK_CATEGORY_PRODUCTS = {
  // 뷰티
  1010: [
    { productId: "m1010_1", productName: "이니스프리 블랙티 유스 앰플 30ml",              productPrice: 28000,  productImage: "https://picsum.photos/seed/beauty1/200", isRocket: true  },
    { productId: "m1010_2", productName: "아누아 어성초 77 토너 패드 250매",               productPrice: 19900,  productImage: "https://picsum.photos/seed/beauty2/200", isRocket: true  },
    { productId: "m1010_3", productName: "닥터지 레드 블레미쉬 클리어 수딩 크림 70ml",     productPrice: 14500,  productImage: "https://picsum.photos/seed/beauty3/200", isRocket: true  },
    { productId: "m1010_4", productName: "라운드랩 자작나무 수분 선크림 SPF50+ 50ml",      productPrice: 12800,  productImage: "https://picsum.photos/seed/beauty4/200", isRocket: false },
  ],
  // 가전디지털
  1012: [
    { productId: "m1012_1", productName: "다이슨 V15 디텍트 컴플리트 무선청소기",           productPrice: 899000, productImage: "https://picsum.photos/seed/elec1/200",   isRocket: true  },
    { productId: "m1012_2", productName: "삼성 갤럭시 버즈2 프로 노이즈캔슬링 이어폰",      productPrice: 159000, productImage: "https://picsum.photos/seed/elec2/200",   isRocket: true  },
    { productId: "m1012_3", productName: "애플 에어팟 프로 2세대 MagSafe 충전",            productPrice: 289000, productImage: "https://picsum.photos/seed/elec3/200",   isRocket: false },
    { productId: "m1012_4", productName: "LG 퓨리케어 360° 공기청정기 AS204DWFA",         productPrice: 349000, productImage: "https://picsum.photos/seed/elec4/200",   isRocket: true  },
  ],
  // 식품
  1014: [
    { productId: "m1014_1", productName: "곰곰 국내산 유기농 현미 10kg",                   productPrice: 34900,  productImage: "https://picsum.photos/seed/food1/200",   isRocket: true  },
    { productId: "m1014_2", productName: "매일유업 상하목장 유기농 멸균 우유 200ml × 24",   productPrice: 26800,  productImage: "https://picsum.photos/seed/food2/200",   isRocket: true  },
    { productId: "m1014_3", productName: "CJ 비비고 왕교자 만두 1.05kg",                   productPrice: 9900,   productImage: "https://picsum.photos/seed/food3/200",   isRocket: true  },
    { productId: "m1014_4", productName: "동원 참치 마일드 150g × 12캔",                   productPrice: 19800,  productImage: "https://picsum.photos/seed/food4/200",   isRocket: false },
  ],
  // 생활용품
  1015: [
    { productId: "m1015_1", productName: "피죤 아기 섬유유연제 무향 2.5L",                  productPrice: 10900,  productImage: "https://picsum.photos/seed/life1/200",   isRocket: true  },
    { productId: "m1015_2", productName: "락앤락 클리어 밀폐용기 18종 세트",                productPrice: 22900,  productImage: "https://picsum.photos/seed/life2/200",   isRocket: true  },
    { productId: "m1015_3", productName: "3M 스카치-브라이트 수세미 10+2입",               productPrice: 6900,   productImage: "https://picsum.photos/seed/life3/200",   isRocket: false },
    { productId: "m1015_4", productName: "유한킴벌리 크리넥스 화장지 30롤 2겹",             productPrice: 18900,  productImage: "https://picsum.photos/seed/life4/200",   isRocket: true  },
  ],
  // 여성패션
  1016: [
    { productId: "m1016_1", productName: "무인양품 여성 저지 와이드 팬츠 블랙",              productPrice: 39900,  productImage: "https://picsum.photos/seed/fashion1/200", isRocket: true  },
    { productId: "m1016_2", productName: "나이키 우먼스 에센셜 풀집 플리스 후디",            productPrice: 69000,  productImage: "https://picsum.photos/seed/fashion2/200", isRocket: true  },
    { productId: "m1016_3", productName: "에잇세컨즈 여성 린넨 와이드 슬랙스",              productPrice: 35900,  productImage: "https://picsum.photos/seed/fashion3/200", isRocket: true  },
    { productId: "m1016_4", productName: "자라 여성 오버사이즈 코튼 셔츠 화이트",            productPrice: 49900,  productImage: "https://picsum.photos/seed/fashion4/200", isRocket: false },
  ],
  // 주방용품
  1017: [
    { productId: "m1017_1", productName: "테팔 인덕션 프라이팬 28cm 티타늄 엑설런스",       productPrice: 39900,  productImage: "https://picsum.photos/seed/kitchen1/200", isRocket: true  },
    { productId: "m1017_2", productName: "쿠쿠 10인용 전기압력밥솥 CRP-LHTS1010FG",        productPrice: 189000, productImage: "https://picsum.photos/seed/kitchen2/200", isRocket: false },
    { productId: "m1017_3", productName: "코렐 순백 4인 식기세트 18피스",                   productPrice: 55000,  productImage: "https://picsum.photos/seed/kitchen3/200", isRocket: true  },
    { productId: "m1017_4", productName: "키친아트 에어프라이어 오븐 12L AK-1200",          productPrice: 69900,  productImage: "https://picsum.photos/seed/kitchen4/200", isRocket: true  },
  ],
  // 홈인테리어
  1018: [
    { productId: "m1018_1", productName: "이케아 KALLAX 4칸 책장 화이트 147×147cm",        productPrice: 149000, productImage: "https://picsum.photos/seed/home1/200",   isRocket: false },
    { productId: "m1018_2", productName: "한샘 패브릭 1인 소파 베이지",                     productPrice: 129000, productImage: "https://picsum.photos/seed/home2/200",   isRocket: true  },
    { productId: "m1018_3", productName: "지누스 킹 그린티 폼 매트리스 25cm",               productPrice: 189000, productImage: "https://picsum.photos/seed/home3/200",   isRocket: true  },
    { productId: "m1018_4", productName: "필립스 E27 LED 벌브 10W 전구색 6팩",             productPrice: 14900,  productImage: "https://picsum.photos/seed/home4/200",   isRocket: true  },
  ],
};

exports.getBestCategoryProducts = functions.https.onCall({ invoker: "public" }, async (request) => {
  const { categoryId, limit = 20 } = request.data;

  if (!categoryId || typeof categoryId !== "number") {
    throw new functions.https.HttpsError("invalid-argument", "categoryId (number) required");
  }

  const accessKey = process.env.COUPANG_ACCESS_KEY;
  const secretKey = process.env.COUPANG_SECRET_KEY;

  if (!accessKey || !secretKey) {
    throw new functions.https.HttpsError("failed-precondition", "API keys not configured");
  }

  const safeLimit = Math.min(Math.max(1, Number(limit) || 20), 50);

  // Return mock data immediately for categories where Coupang search API returns 401.
  const mockProducts = MOCK_CATEGORY_PRODUCTS[categoryId] ?? null;
  if (mockProducts) {
    console.log(`[mock] categoryId=${categoryId} returning ${mockProducts.length} mock products`);
    return { products: mockProducts.slice(0, safeLimit), source: "mock" };
  }

  // Primary path: bestcategories bare-path request.
  const barePath = `${BEST_CATEGORY_PATH}/${categoryId}`;
  const requestUrl = `https://api-gateway.coupang.com${barePath}`;

  console.log(`[bestcategories] GET ${requestUrl}`);

  try {
    const response = await fetch(requestUrl, {
      method: "GET",
      headers: {
        Authorization: buildPartnersAuth("GET", barePath, accessKey, secretKey),
        "Content-Type": "application/json;charset=UTF-8",
      },
    });

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
      console.log(`[bestcategories] non-zero rCode — falling back to search for categoryId=${categoryId}`);
      // Best-effort search fallback using the rCode failure as signal.
      return { products: [] };
    }

    const products = (Array.isArray(json?.data) ? json.data : [])
      .slice(0, safeLimit)
      .map(normProduct)
      .filter((p) => p.productId);

    // Sanity check: if we got results but they look like food for a non-food category,
    // log a warning so we can add the ID to SEARCH_FALLBACK_KEYWORDS.
    if (products.length > 0) {
      const sample = products[0].name;
      console.log(`[bestcategories] categoryId=${categoryId} first result="${sample}" count=${products.length}`);
    }

    return { products, source: "bestcategories" };
  } catch (error) {
    if (error instanceof functions.https.HttpsError) throw error;
    console.error("[bestcategories] unexpected error:", error);
    return { products: [] };
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

  const parsed = parseProductFromUrl(url.trim());
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

// ---------------------------------------------------------------------------
// scheduledPriceUpdate  — runs every 6 hours via Cloud Scheduler
//
// Tiered update logic (minimises Coupang API calls):
//   Tier A — High priority: products that received a product_click or
//             product_purchase_click action in the last 48 h.
//             → Updated on every 6-hour run.
//   Tier B — Low priority: all other active products.
//             → Skipped unless priceLastUpdatedAt is null or > 24 h ago.
//
// Rate-limit strategy: 10 products per batch, 1-second delay between batches.
// ---------------------------------------------------------------------------

exports.scheduledPriceUpdate = onSchedule("every 6 hours", async () => {
    const firestoreDb = admin.firestore();
    const now = Date.now();
    const MS_48H = 48 * 60 * 60 * 1000;
    const MS_24H = 24 * 60 * 60 * 1000;

    // ── Step 1: build Tier A set (recently clicked products) ─────────────────
    // Single-field range query on createdAt → no composite index needed.
    const cutoff48h = admin.firestore.Timestamp.fromMillis(now - MS_48H);
    const recentActionsSnap = await firestoreDb
      .collection("user_product_actions")
      .where("createdAt", ">=", cutoff48h)
      .get();

    const tierAIds = new Set();
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
    const savedSnap = await firestoreDb
      .collection("user_saved_products")
      .where("productId", "==", productGroupId)
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
      `https://m.coupang.com/vm/products/${productId}${itemQuery}`,
      { headers: { "User-Agent": MOBILE_UA, "Accept-Language": "ko-KR" } }
    );
    const html = await response.text();

    const titleMatch = html.match(/<title>(.*?)<\/title>/i);
    const titleName = titleMatch ? titleMatch[1].replace(" : 쿠팡", "").trim() : null;

    if (titleName?.includes("Access Denied")) {
      console.log(`HTML scraping blocked (Access Denied): productId=${productId}`);
      return EMPTY;
    }

    const { price, isOutOfStock, name: sdpName,
            optionName, sellerType, deliveryType, isRocket } = extractFromHtml(html);

    return {
      name: sdpName || titleName || "쿠팡 상품",
      price,
      isOutOfStock,
      image: null,
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
