/**
 * test-connection.js — Saveroo backend diagnostics
 * Run from the functions/ directory:
 *   node test-connection.js
 *
 * Reads COUPANG_ACCESS_KEY, COUPANG_SECRET_KEY, PROXY_URL from .env
 */

const crypto = require("crypto");
const https  = require("https");
const http   = require("http");
const fs     = require("fs");
const path   = require("path");

// ── Load .env manually (no dotenv dependency needed) ─────────────────────────
const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, "utf8")
    .split("\n")
    .forEach((line) => {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim();
    });
  console.log("✅ .env loaded");
} else {
  console.warn("⚠️  No .env file found — using process.env as-is");
}

const ACCESS_KEY = process.env.COUPANG_ACCESS_KEY;
const SECRET_KEY = process.env.COUPANG_SECRET_KEY;
const PROXY_URL  = process.env.PROXY_URL;

// ── HMAC auth (mirrors index.js buildPartnersAuth) ────────────────────────────
function buildAuth(method, urlPath) {
  const now = new Date();
  const p   = (n) => String(n).padStart(2, "0");
  const dt  =
    String(now.getUTCFullYear()).slice(-2) +
    p(now.getUTCMonth() + 1) +
    p(now.getUTCDate()) +
    "T" +
    p(now.getUTCHours()) +
    p(now.getUTCMinutes()) +
    p(now.getUTCSeconds()) +
    "Z";
  const sig = crypto.createHmac("sha256", SECRET_KEY).update(dt + method + urlPath).digest("hex");
  return `CEA algorithm=HmacSHA256, access-key=${ACCESS_KEY}, signed-date=${dt}, signature=${sig}`;
}

// ── Generic raw HTTP request (no 3rd-party deps) ──────────────────────────────
function rawRequest(urlStr, options = {}) {
  return new Promise((resolve, reject) => {
    const u    = new URL(urlStr);
    const mod  = u.protocol === "https:" ? https : http;
    const opts = {
      hostname: u.hostname,
      port:     u.port || (u.protocol === "https:" ? 443 : 80),
      path:     u.pathname + u.search,
      method:   options.method || "GET",
      headers:  options.headers || {},
      timeout:  10000,
      ...( options.agent ? { agent: options.agent } : {} ),
    };
    const req = mod.request(opts, (res) => {
      let body = "";
      res.on("data", (c) => { body += c; });
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on("timeout", () => { req.destroy(); reject(new Error("Request timed out after 10s")); });
    req.on("error",   reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

// ── Build proxy tunnel agent ───────────────────────────────────────────────────
function buildProxyAgent(targetUrl, proxyUrlStr) {
  return new Promise((resolve, reject) => {
    const proxy  = new URL(proxyUrlStr);
    const target = new URL(targetUrl);
    const isSsl  = target.protocol === "https:";
    const targetPort = target.port || (isSsl ? 443 : 80);

    const connectReq = http.request({
      hostname: proxy.hostname,
      port:     Number(proxy.port) || 3128,
      method:   "CONNECT",
      path:     `${target.hostname}:${targetPort}`,
      headers: {
        "Proxy-Authorization":
          "Basic " + Buffer.from(`${proxy.username}:${proxy.password}`).toString("base64"),
        Host: `${target.hostname}:${targetPort}`,
      },
      timeout: 10000,
    });

    connectReq.on("connect", (res, socket) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`CONNECT failed: HTTP ${res.statusCode}`));
      }
      const agent = isSsl
        ? new https.Agent({ socket, rejectUnauthorized: false })
        : new http.Agent({ socket });
      resolve(agent);
    });
    connectReq.on("timeout", () => { connectReq.destroy(); reject(new Error("CONNECT tunnel timed out")); });
    connectReq.on("error",   reject);
    connectReq.end();
  });
}

// ── separator helper ──────────────────────────────────────────────────────────
const SEP = "─".repeat(60);
function section(title) { console.log(`\n${SEP}\n  ${title}\n${SEP}`); }

// ═════════════════════════════════════════════════════════════════════════════
async function main() {
  // ── TEST 1: Coupang Partners API (Goldbox) ──────────────────────────────────
  section("TEST 1 — Coupang Partners API (Goldbox, no proxy)");

  if (!ACCESS_KEY || !SECRET_KEY) {
    console.error("❌ COUPANG_ACCESS_KEY or COUPANG_SECRET_KEY missing in .env — skipping test 1");
  } else {
    const GOLDBOX_PATH = "/v2/providers/affiliate_open_api/apis/openapi/v1/products/goldbox";
    try {
      console.log(`   URL : https://api-gateway.coupang.com${GOLDBOX_PATH}`);
      const auth = buildAuth("GET", GOLDBOX_PATH);
      console.log(`   Auth: ${auth.slice(0, 80)}…`);

      const result = await rawRequest(`https://api-gateway.coupang.com${GOLDBOX_PATH}`, {
        headers: {
          Authorization:  auth,
          "Content-Type": "application/json;charset=UTF-8",
        },
      });

      console.log(`\n   HTTP Status : ${result.status}`);
      console.log(`   Headers     : ${JSON.stringify(result.headers, null, 2)}`);
      console.log(`   Body (first 500 chars):\n   ${result.body.slice(0, 500)}`);

      if (result.status === 200)  console.log("\n   ✅ Partners API is reachable");
      else if (result.status === 429) console.log("\n   🚫 429 RATE LIMIT — quota exhausted");
      else if (result.status === 401) console.log("\n   🔑 401 UNAUTHORIZED — check HMAC keys");
      else console.log(`\n   ⚠️  Unexpected status ${result.status}`);
    } catch (err) {
      console.error("   ❌ Request failed:", err.message);
    }
  }

  // ── TEST 2: Bright Data proxy → lumtest.com/myip.json ──────────────────────
  section("TEST 2 — Bright Data proxy connectivity (lumtest.com/myip.json)");

  if (!PROXY_URL) {
    console.error("❌ PROXY_URL missing in .env — skipping test 2");
  } else {
    const proxyPreview = PROXY_URL.replace(/:\/\/([^:]+:[^@]+)@/, "://***:***@");
    console.log(`   Proxy: ${proxyPreview}`);

    try {
      const agent = await buildProxyAgent("https://lumtest.com", PROXY_URL);
      console.log("   ✅ CONNECT tunnel established");

      const result = await rawRequest("https://lumtest.com/myip.json", { agent });
      console.log(`\n   HTTP Status : ${result.status}`);
      console.log(`   Body        : ${result.body.slice(0, 400)}`);
      if (result.status === 200) console.log("\n   ✅ Proxy is working — residential IP confirmed");
      else console.log(`\n   ⚠️  Unexpected status ${result.status}`);
    } catch (err) {
      console.error("   ❌ Proxy test failed:", err.message);
    }
  }

  // ── TEST 3: Bright Data proxy → Coupang product page ───────────────────────
  section("TEST 3 — Bright Data proxy → Coupang product page (HTTP title check)");

  if (!PROXY_URL) {
    console.log("   Skipped (no PROXY_URL)");
  } else {
    try {
      const TEST_URL = "https://www.coupang.com/vp/products/7332570616";
      console.log(`   URL: ${TEST_URL}`);

      const agent  = await buildProxyAgent(TEST_URL, PROXY_URL);
      const result = await rawRequest(TEST_URL, {
        agent,
        headers: {
          "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept-Language": "ko-KR,ko;q=0.9",
          Accept:            "text/html,application/xhtml+xml,*/*;q=0.8",
        },
      });

      console.log(`\n   HTTP Status   : ${result.status}`);
      const titleMatch = result.body.match(/<title[^>]*>(.*?)<\/title>/i);
      console.log(`   Page <title>  : ${titleMatch ? titleMatch[1].trim() : "(not found)"}`);
      console.log(`   Body length   : ${result.body.length} bytes`);
      if (result.body.length > 100) console.log(`   Body preview  : ${result.body.slice(0, 300)}`);

      if (result.status === 200 && titleMatch) console.log("\n   ✅ Coupang product page reachable via proxy");
      else if (result.status === 403)          console.log("\n   🚫 403 — Coupang WAF blocking this proxy IP");
      else if (result.status === 429)          console.log("\n   🚫 429 — Rate limited by Coupang via proxy");
      else                                     console.log(`\n   ⚠️  Status ${result.status} — investigate body above`);
    } catch (err) {
      console.error("   ❌ Proxy→Coupang test failed:", err.message);
    }
  }

  section("DIAGNOSTICS COMPLETE");
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
