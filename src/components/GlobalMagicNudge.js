import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  AppState,
  Linking,
  Text,
  ToastAndroid,
  TouchableOpacity,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { CommonActions } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import { auth } from '../firebase/config';
import { consumeExpectingCoupangReturn } from '../utils/coupangIntentFlag';
import { useTutorial } from '../context/TutorialContext';
import { registerProductFromClient } from '../services/clientProductRegistrar';
import { useShareIntentHandler } from '../hooks/useShareIntentHandler';

const MOBILE_UA =
  'Mozilla/5.0 (Linux; Android 13; SM-S918N) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

const ORIGIN_WHITELIST = ['*'];

function blockIntents(request) {
  const url = request.url;
  if (
    url.startsWith('intent://') ||
    url.startsWith('coupang://') ||
    url.startsWith('android-app://')
  ) {
    return false;
  }
  return true;
}

const WV_STYLE = {
  position: 'absolute',
  width: 1,
  height: 1,
  top: 0,
  left: 0,
  opacity: 0.01,
  backgroundColor: 'transparent',
};

// Plain string concatenation — no template literals.
// Price strategy: the selected-option table's own price DOM element first
// (.option-table-list__option--selected ... — confirmed reliably populated
// in this webview since the sibling-option click-simulation below already
// depends on the same table). Falls back to a raw-HTML regex scan ONLY when
// there's no option table at all (single-SKU product) — that scan is a
// known accuracy risk (it matches the first "price"-shaped JSON key or
// "NN,NNN원" text ANYWHERE on the page, which can belong to an unrelated
// recommended-item widget rather than the product actually being viewed;
// confirmed live via a 16,900원 mis-scrape on an 8,550원 product), kept only
// as a last resort for pages the primary selector can't reach.
// Readiness gate: only og:title meta tag — it is in the <head> and available
// the moment the HTML is parsed, before any JS executes. Once it exists we scrape.
// Price fallback order (when no option table exists):
//   1. JSON field "salePrice", "price", or "originalPrice" — approximate at best.
//   2. Fallback: any "NN,NNN원" pattern in raw HTML — covers text rendered into
//      script blocks or data attributes.
// Wow price: tried via real rendered DOM selectors first (this WebView actually
// renders the page, unlike the old server-side regex-only scraper), then the
// same inline-JSON key fallback. Absent entirely for non-Wow-eligible products —
// that's fine, the UI never invents a Wow price when this comes back 0.
// Soft exit: Linking.openURL("coupang://") shifts OS focus to the Coupang app
// without killing the Saveroo process, so state and nav history are preserved.
const SCRAPE_SCRIPT =
  'let attempts=0;' +
  'let scrapeInterval=setInterval(function(){' +
    'attempts++;' +
    'if(attempts>20){clearInterval(scrapeInterval);return;}' +
    'if(window.location.href==="about:blank"||window.location.href.indexOf("coupang.com")===-1)return;' +
    'let pathMatch=window.location.href.match(/products\\/(\\d+)/);' +
    'let itemIdMatch=window.location.href.match(/itemId=(\\d+)/);' +
    'let pidMatch=pathMatch||itemIdMatch;' +
    'if(!pidMatch)return;' +
    'let nameEl=document.querySelector("meta[property=\'og:title\']");' +
    'if(!nameEl)return;' +
    'clearInterval(scrapeInterval);' +
    'let productId=pidMatch[1];' +
    // vendorItemId = the specific ordered option/SKU (color/size/quantity),
    // distinct from productId (the parent page). Only trust the explicit
    // vendorItemId= param, or itemId= when it rode alongside a real
    // products/(\d+) path (i.e. genuinely a second, option-level id) —
    // when itemId= was itself used as the productId fallback above there's
    // no real parent+child pair to report. Server-side tryV4Api resolves
    // this into a human-readable option name later (scheduledPriceUpdate),
    // so the client only needs the raw id, never a guessed label.
    'let vendorItemIdMatch=window.location.href.match(/vendorItemId=(\\d+)/);' +
    'let vendorItemId=vendorItemIdMatch?vendorItemIdMatch[1]:((pathMatch&&itemIdMatch)?itemIdMatch[1]:null);' +
    'let priceStr="0";' +
    'let rawHtml=document.body.innerHTML||document.documentElement.innerHTML;' +
    // Selected-option DOM price FIRST — the same element the sibling-option
    // click-simulation below already reads successfully on every run, so
    // it's confirmed populated in this webview despite being off-screen
    // (the "DOM is unreliable off-screen" concern below is real for OTHER
    // elements, just not this one). Scoped to the actual product being
    // viewed, unlike the JSON/regex fallbacks — those scan the ENTIRE raw
    // HTML for the first "price"-shaped value on the page, which is often a
    // DIFFERENT product entirely (a recommended-item carousel, a related-
    // products widget, etc. rendered elsewhere on the same page). Confirmed
    // live: a real registration came back 16,900원 for a product actually
    // selling at 8,550원 — a recommendation widget's price, not the target
    // product's.
    'let selectedPriceEl=document.querySelector(".option-table-list__option--selected .option-table-list__option-price span");' +
    'if(selectedPriceEl&&selectedPriceEl.textContent&&selectedPriceEl.textContent.trim()){' +
      'priceStr=selectedPriceEl.textContent;' +
    '}else{' +
      'let jsonMatch=rawHtml.match(/"(?:salePrice|price|originalPrice)"\\s*:\\s*["\']?([\\d,]+)["\']?/i);' +
      'if(jsonMatch){' +
        'priceStr=jsonMatch[1];' +
      '}else{' +
        'let fallbackMatch=rawHtml.match(/([\\d,]+)\\s*원/);' +
        'if(fallbackMatch)priceStr=fallbackMatch[1];' +
      '}' +
    '}' +
    'let price=parseInt(priceStr.replace(/[^0-9]/g,""),10);' +
    'if(isNaN(price))price=0;' +
    'let wowSelectors=[".members-price-txt",".coupon-price-txt",".wow-price",".coupon-discount-price","[class*=\'members-price\']","[class*=\'wow-price\']","[class*=\'coupon-price\']"];' +
    'let wowPriceStr=null;' +
    'for(let i=0;i<wowSelectors.length;i++){' +
      'let wEl=document.querySelector(wowSelectors[i]);' +
      'if(wEl&&wEl.textContent&&wEl.textContent.trim()){wowPriceStr=wEl.textContent;break;}' +
    '}' +
    'let wowPrice=0;' +
    'if(wowPriceStr){' +
      'wowPrice=parseInt(wowPriceStr.replace(/[^0-9]/g,""),10)||0;' +
    '}' +
    'if(!wowPrice){' +
      'let wowJsonMatch=rawHtml.match(/"(?:wowPrice|couponPrice|membersPrice|wowMemberPrice)"\\s*:\\s*["\']?([\\d,]+)["\']?/i);' +
      'if(wowJsonMatch)wowPrice=parseInt(wowJsonMatch[1].replace(/[^0-9]/g,""),10)||0;' +
    '}' +
    'let name=nameEl.content||document.title;' +
    'let imgEl=document.querySelector("meta[property=\'og:image\']");' +
    'let image=imgEl?imgEl.content:"";' +
    'if(image&&image.startsWith("//"))image="https:"+image;' +
    // Delivery badge — checked against the page's VISIBLE text first (what
    // the screenshot actually shows: "🚀 판매자로켓" or "🚀 로켓배송"), since
    // that's more reliable than guessing JSON key names we can't verify live
    // (coupang.com browsing is blocked for direct inspection here). The old
    // isRocket/rocketDelivery JSON-key check stays as a secondary fallback —
    // it only ever covers Coupang's own 로켓배송, never 판매자로켓, which is
    // why it was previously missing sellers using Coupang's merchant-rocket
    // program despite them showing a rocket badge on the real page.
    'let bodyText=document.body.innerText||"";' +
    'let deliveryType="normal";' +
    'if(/판매자\\s*로켓/.test(bodyText)){deliveryType="rocketSeller";}' +
    'else if(/로켓\\s*프레시/.test(bodyText)||/"isFresh"\\s*:\\s*true/.test(rawHtml)){deliveryType="fresh";}' +
    'else if(/로켓\\s*배송/.test(bodyText)||/"isRocket"\\s*:\\s*true/.test(rawHtml)||/"rocketDelivery"\\s*:\\s*true/.test(rawHtml)){deliveryType="rocket";}' +
    'let isRocket=deliveryType==="rocket"||deliveryType==="rocketSeller";' +
    'let specMatch=name.match(/\\d+\\.?\\d*\\s*(g|ml|kg|L|리터|개|롤|매|팩|정|캡슐|포|박스)/ig);' +
    'let spec=specMatch?Array.from(new Set(specMatch)).join(" / "):null;' +
    'let brandSelectors=["[class*=\'brand-name\']","[class*=\'seller-name\']","[class*=\'prod-brand\']"];' +
    'let brand=null;' +
    'for(let i=0;i<brandSelectors.length;i++){' +
      'let bEl=document.querySelector(brandSelectors[i]);' +
      'if(bEl&&bEl.textContent&&bEl.textContent.trim()){brand=bEl.textContent.trim();break;}' +
    '}' +
    'if(!brand){' +
      'let brandJsonMatch=rawHtml.match(/"(?:brandName|sellerName)"\\s*:\\s*"([^"]{1,60})"/);' +
      'if(brandJsonMatch)brand=brandJsonMatch[1].trim();' +
    '}' +
    'if(!window.hasScraped){' +
      'window.hasScraped=true;' +
      // Discover sibling options (other quantities of the same product,
      // e.g. 1개/24개/72개/120개) by actually clicking through them one at
      // a time and watching the URL's vendorItemId change — confirmed live
      // that m.coupang.com renders every sibling's name+price up front in
      // .option-table-list__option, but NOT its vendorItemId (that only
      // shows up in the URL after a real click, since it's a Next.js SPA
      // navigation). Slower than guessing from an embedded JSON blob, but
      // each vendorItemId is verified against a real navigation rather
      // than proximity-matched against unrelated price text. Scoped to the
      // options table for whichever capacity tab (190ml/950ml/etc.) is
      // already selected — .option-table-list__option only ever contains
      // that tab's own quantity options, not every tab's.
      '(async function(){' +
        'let siblingOptions=[];' +
        'try{' +
          'let optionEls=Array.from(document.querySelectorAll(".option-table-list__option"));' +
          'let selectedIdx=-1;' +
          'for(let i=0;i<optionEls.length&&i<10;i++){' +
            'let el=optionEls[i];' +
            'let nameEl=el.querySelector(".option-table-list__option-name");' +
            'let priceEl=el.querySelector(".option-table-list__option-price span");' +
            'let label=nameEl?nameEl.textContent.trim():null;' +
            'let priceText=priceEl?priceEl.textContent.trim():null;' +
            'if((el.className||"").indexOf("--selected")!==-1)selectedIdx=i;' +
            'siblingOptions.push({label:label,priceText:priceText,vendorItemId:null});' +
          '}' +
          'for(let i=0;i<siblingOptions.length;i++){' +
            'if(i===selectedIdx){siblingOptions[i].vendorItemId=vendorItemId;continue;}' +
            'let freshEls=document.querySelectorAll(".option-table-list__option");' +
            'if(!freshEls[i])continue;' +
            'freshEls[i].click();' +
            'await new Promise(function(r){setTimeout(r,600);});' +
            'let m=window.location.href.match(/vendorItemId=(\\d+)/);' +
            'siblingOptions[i].vendorItemId=m?m[1]:null;' +
          '}' +
          'if(selectedIdx>=0){' +
            'let restoreEls=document.querySelectorAll(".option-table-list__option");' +
            'if(restoreEls[selectedIdx]){' +
              'restoreEls[selectedIdx].click();' +
              'await new Promise(function(r){setTimeout(r,300);});' +
            '}' +
          '}' +
        '}catch(e){}' +
        'window.ReactNativeWebView.postMessage(JSON.stringify({type:"SCRAPE_SUCCESS",payload:{productId:productId,vendorItemId:vendorItemId,name:name,price:price,wowPrice:wowPrice,image:image,isRocket:isRocket,deliveryType:deliveryType,spec:spec,brand:brand,siblingOptions:siblingOptions}}));' +
      '})();' +
    '}' +
  '},500);' +
  'true;';

export default function GlobalMagicNudge({ navigationRef }) {
  const { tutorialActive } = useTutorial();

  const [webviewUrl,    setWebviewUrl]    = useState(null);
  const [globalLoading, setGlobalLoading] = useState(false);

  const [nudgeUrl,   setNudgeUrl]   = useState('');
  const [showBanner, setShowBanner] = useState(false);

  const bannerAnim       = useRef(new Animated.Value(80)).current;
  const listenerReadyRef = useRef(false);

  const triggerScrape = (rawUrl) => {
    if (!rawUrl || !rawUrl.includes('coupang.com')) return;
    setWebviewUrl(rawUrl);
    setGlobalLoading(true);
  };

  // ─── Behavior A: Share Intent ─────────────────────────────────────────────
  useShareIntentHandler((url) => {
    triggerScrape(url);
  });

  // ─── Behavior B: Clipboard ────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => { listenerReadyRef.current = true; }, 2000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') return;
      if (!listenerReadyRef.current) return;
      if (!consumeExpectingCoupangReturn()) return;

      setTimeout(async () => {
        try {
          const text = (await Clipboard.getStringAsync()) || '';
          await Clipboard.setStringAsync('');
          if (!text || !text.includes('coupang.com')) return;
          const urlMatch = text.match(/(https?:\/\/[^\s]+)/);
          const extracted = urlMatch ? urlMatch[1] : null;
          if (!extracted) return;
          setNudgeUrl(extracted);
          setShowBanner(true);
        } catch (_) {}
      }, 500);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    Animated.timing(bannerAnim, {
      toValue: showBanner ? 0 : 80,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [showBanner, bannerAnim]);

  const dismiss = () => { setShowBanner(false); setNudgeUrl(''); };

  const handleTrack = () => {
    if (!nudgeUrl) return;
    setShowBanner(false);
    triggerScrape(nudgeUrl);
  };

  // ─── WebView message handler ──────────────────────────────────────────────
  const clearAll = () => {
    setWebviewUrl(null);
    setGlobalLoading(false);
  };

  const handleWebViewMessage = async (event) => {
    let data;
    try { data = JSON.parse(event.nativeEvent.data); }
    catch { clearAll(); return; }

    if (data.type === 'SCRAPE_SUCCESS') {
      console.log(
        '[MagicNudge] Scrape success:',
        { ...data.payload, siblingOptions: `[${data.payload.siblingOptions?.length ?? 0} options]` },
      );
      try {
        await registerProductFromClient(
          data.payload.productId,
          data.payload,
          auth.currentUser?.uid,
        );
        ToastAndroid.show('세이브루에 등록 완료!', ToastAndroid.SHORT);
        clearAll();
        // Route internal UI to the saved list's ROOT screen, then softly shift
        // OS focus to Coupang without killing the Saveroo process (Polsent UX,
        // no cold start). 관심상품 is itself a nested stack (TrackingListMain →
        // CurationDetail/Detail, under MainTabs under RootStack) — navigating
        // to just the tab name only switches tab focus and leaves that nested
        // stack wherever it was (e.g. still on a Detail screen pushed earlier),
        // and even navigate('관심상품', {screen:'TrackingListMain'}) was found to
        // PUSH a fresh instance rather than pop back to the existing one,
        // leaving the stale Detail screen one back-tap away. Explicitly reset
        // that nested stack's own state (found via its key on the tab route)
        // before focusing the tab, so 관심상품 always opens clean at its root.
        const rootState = navigationRef?.current?.getRootState();
        const mainTabsRoute = rootState?.routes?.find((r) => r.name === 'MainTabs');
        const trackingTabRoute = mainTabsRoute?.state?.routes?.find((r) => r.name === '관심상품');
        if (trackingTabRoute?.state?.key) {
          navigationRef.current?.dispatch({
            ...CommonActions.reset({ index: 0, routes: [{ name: 'TrackingListMain' }] }),
            target: trackingTabRoute.state.key,
          });
        }
        navigationRef?.current?.navigate('관심상품');
        setTimeout(() => { Linking.openURL('coupang://').catch(() => {}); }, 300);
      } catch (err) {
        console.error('[MagicNudge] Registration failed:', err?.code, err?.message);
        // submitScrapedProduct throws HttpsError with a Korean, user-facing
        // message for the two expected failure modes (Bright Data unreachable,
        // price mismatch) — surface that instead of a generic toast so a
        // rejected registration doesn't look identical to a network blip.
        ToastAndroid.show(err?.message || '등록 중 오류가 발생했습니다.', ToastAndroid.LONG);
        clearAll();
      }
    } else if (data.type === 'SCRAPE_ERROR') {
      console.error('[MagicNudge] Scrape error:', data.error);
      ToastAndroid.show('상품 정보를 읽어오지 못했습니다.', ToastAndroid.SHORT);
      clearAll();
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999 }}>

      {/* Clipboard nudge banner */}
      {showBanner && !tutorialActive && (
        <Animated.View
          pointerEvents="auto"
          style={{
            position: 'absolute', bottom: 90, left: 16, right: 16,
            backgroundColor: '#1e293b', borderRadius: 12, padding: 14,
            flexDirection: 'row', alignItems: 'center', elevation: 12,
            shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3, shadowRadius: 8,
            transform: [{ translateY: bannerAnim }],
          }}
        >
          <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: '#fff', lineHeight: 19, marginRight: 10 }}>
            복사하신 쿠팡 상품의 최저가를 추적할까요?
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <TouchableOpacity
              onPress={handleTrack}
              style={{ backgroundColor: '#2E6FF2', paddingVertical: 7, paddingHorizontal: 14, borderRadius: 8 }}
              activeOpacity={0.85}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>추적하기</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={dismiss} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={{ fontSize: 18, color: '#94a3b8' }}>✕</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}

      {/* Absolute overlay — single natural-flow WebView with polling scraper */}
      {!tutorialActive && globalLoading && (
        <View
          pointerEvents="auto"
          style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.6)',
            justifyContent: 'center', alignItems: 'center',
            zIndex: 9999, elevation: 9999,
          }}
        >
          <WebView
            style={WV_STYLE}
            source={{ uri: webviewUrl || 'about:blank' }}
            userAgent={MOBILE_UA}
            javaScriptEnabled={true}
            originWhitelist={ORIGIN_WHITELIST}
            onShouldStartLoadWithRequest={blockIntents}
            injectedJavaScript={SCRAPE_SCRIPT}
            onMessage={handleWebViewMessage}
          />

          <View style={{
            backgroundColor: '#ffffff', borderRadius: 20,
            paddingVertical: 32, paddingHorizontal: 40,
            alignItems: 'center', gap: 16, elevation: 8,
            shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.25, shadowRadius: 12,
          }}>
            <ActivityIndicator size="large" color="#2E6FF2" />
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#1e293b', textAlign: 'center' }}>
              세이브루에 등록 중입니다...
            </Text>
          </View>

        </View>
      )}

    </View>
  );
}
