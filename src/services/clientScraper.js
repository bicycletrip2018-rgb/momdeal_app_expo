const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const DESKTOP_HEADERS = {
  'User-Agent':                DESKTOP_UA,
  'Accept':                    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language':           'ko-KR,ko;q=0.9,en-US;q=0.8',
  'Cache-Control':             'max-age=0',
  'Sec-Ch-Ua':                 '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
  'Sec-Ch-Ua-Mobile':          '?0',
  'Sec-Ch-Ua-Platform':        '"Windows"',
  'Sec-Fetch-Dest':            'document',
  'Sec-Fetch-Mode':            'navigate',
  'Sec-Fetch-Site':            'none',
  'Sec-Fetch-User':            '?1',
  'Upgrade-Insecure-Requests': '1',
};

const MOBILE_HEADERS = {
  'User-Agent':                'Mozilla/5.0 (Linux; Android 13; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  'Accept':                    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language':           'ko-KR,ko;q=0.9,en-US;q=0.8',
  'Cache-Control':             'no-cache',
  'Pragma':                    'no-cache',
  'Sec-Ch-Ua':                 '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
  'Sec-Ch-Ua-Mobile':          '?1',
  'Sec-Ch-Ua-Platform':        '"Android"',
  'Sec-Fetch-Dest':            'document',
  'Sec-Fetch-Mode':            'navigate',
  'Sec-Fetch-Site':            'none',
  'Sec-Fetch-User':            '?1',
  'Upgrade-Insecure-Requests': '1',
};

async function expandUrl(url) {
  try {
    const res = await fetch(url, { method: 'GET', headers: { 'User-Agent': DESKTOP_UA } });
    console.log('[Client] Expanded URL:', res.url);
    return res.url;
  } catch {
    return url;
  }
}

function extractProductId(url) {
  const pathMatch = url.match(/products\/(\d+)/);
  if (pathMatch) return pathMatch[1];
  const queryMatch = url.match(/[?&]pageKey=(\d+)/);
  return queryMatch ? queryMatch[1] : null;
}

async function fetchMobileHtml(productId) {
  const url = `https://m.coupang.com/vm/products/${productId}`;
  const res = await fetch(url, { headers: MOBILE_HEADERS });
  if (!res.ok) throw new Error(`Coupang HTTP ${res.status}`);
  return res.text();
}

function parseProductHtml(html) {
  // Strategy A: JSON-LD schema.org
  const jsonLdRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = jsonLdRegex.exec(html)) !== null) {
    try {
      const parsed  = JSON.parse(match[1]);
      const nodes   = Array.isArray(parsed) ? parsed : [parsed];
      const product = nodes.find((n) => n['@type'] === 'Product');
      if (product) {
        const offerNode = Array.isArray(product.offers) ? product.offers[0] : product.offers;
        const rawPrice  = offerNode?.price ?? null;
        const imageVal  = product.image;
        return {
          name:  (product.name || '').replace(/\s*[-|｜]\s*쿠팡.*$/i, '').trim() || null,
          price: rawPrice ? parseInt(String(rawPrice).replace(/[^\d]/g, ''), 10) || null : null,
          image: typeof imageVal === 'string' ? imageVal
                 : Array.isArray(imageVal)    ? imageVal[0]
                 : null,
        };
      }
    } catch { /* try next script block */ }
  }

  // Strategy B: Open Graph + product meta tags
  const getMeta = (prop) => {
    const a = html.match(new RegExp(
      `<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i'
    ));
    if (a) return a[1].trim();
    const b = html.match(new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${prop}["']`, 'i'
    ));
    return b ? b[1].trim() : null;
  };

  const ogTitle = getMeta('og:title');
  const ogPrice = getMeta('product:price:amount');
  const ogImage = getMeta('og:image');

  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const titleText  = titleMatch
    ? titleMatch[1].replace(/\s*[-|｜]\s*쿠팡.*$/i, '').trim()
    : null;

  return {
    name:  ogTitle || titleText || null,
    price: ogPrice ? parseInt(ogPrice.replace(/[^\d]/g, ''), 10) || null : null,
    image: ogImage || null,
  };
}

export async function clientScrapeProduct(rawUrl) {
  const expanded  = await expandUrl(rawUrl);
  const productId = extractProductId(expanded);
  if (!productId) throw new Error('상품 ID 추출 실패: ' + expanded);

  const html = await fetchMobileHtml(productId);
  if (!html || html.length < 200) throw new Error('빈 페이지 응답 — 네트워크를 확인해주세요');

  const { name, price, image } = parseProductHtml(html);
  if (!price || price <= 0) throw new Error('가격을 찾지 못했습니다. 다시 시도해주세요.');

  return { productId, name: name || '쿠팡 상품', price, image };
}
