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
// Price strategy: DOM elements are unreliable when the WebView is off-screen
// (lazy-load, obfuscation, layout culling). We extract price exclusively from
// the raw HTML string which is always fully present regardless of rendering state.
// Readiness gate: only og:title meta tag — it is in the <head> and available
// the moment the HTML is parsed, before any JS executes. Once it exists we scrape.
// Price regex order:
//   1. JSON field "salePrice", "price", or "originalPrice" — most accurate.
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
    'let pidMatch=window.location.href.match(/products\\/(\\d+)/)||window.location.href.match(/itemId=(\\d+)/);' +
    'if(!pidMatch)return;' +
    'let nameEl=document.querySelector("meta[property=\'og:title\']");' +
    'if(!nameEl)return;' +
    'clearInterval(scrapeInterval);' +
    'let productId=pidMatch[1];' +
    'let priceStr="0";' +
    'let rawHtml=document.body.innerHTML||document.documentElement.innerHTML;' +
    'let jsonMatch=rawHtml.match(/"(?:salePrice|price|originalPrice)"\\s*:\\s*["\']?([\\d,]+)["\']?/i);' +
    'if(jsonMatch){' +
      'priceStr=jsonMatch[1];' +
    '}else{' +
      'let fallbackMatch=rawHtml.match(/([\\d,]+)\\s*원/);' +
      'if(fallbackMatch)priceStr=fallbackMatch[1];' +
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
      'window.ReactNativeWebView.postMessage(JSON.stringify({type:"SCRAPE_SUCCESS",payload:{productId:productId,name:name,price:price,wowPrice:wowPrice,image:image,isRocket:isRocket,deliveryType:deliveryType,spec:spec,brand:brand}}));' +
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
      console.log('[MagicNudge] Scrape success:', data.payload);
      try {
        await registerProductFromClient(
          data.payload.productId,
          data.payload,
          auth.currentUser?.uid,
        );
        ToastAndroid.show('세이브루에 등록 완료!', ToastAndroid.SHORT);
        clearAll();
        // Route internal UI to the saved list, then softly shift OS focus to
        // Coupang without killing the Saveroo process (Polsent UX, no cold start).
        navigationRef?.current?.navigate('관심상품');
        setTimeout(() => { Linking.openURL('coupang://').catch(() => {}); }, 300);
      } catch (_) {
        ToastAndroid.show('등록 중 오류가 발생했습니다.', ToastAndroid.SHORT);
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
