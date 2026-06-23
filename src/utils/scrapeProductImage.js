export async function scrapeRealCoupangImage(productUrl) {
  if (!productUrl) return null;
  try {
    const safeUrl = productUrl.startsWith('http://')
      ? productUrl.replace('http://', 'https://')
      : productUrl;
    const res = await fetch(safeUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
      },
    });
    const html = await res.text();
    const match = html.match(/<meta property="og:image" content="(.*?)"/);
    if (!match) return null;
    const img = match[1];
    return img.startsWith('http://') ? img.replace('http://', 'https://') : img;
  } catch {
    return null;
  }
}
