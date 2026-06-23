import { useEffect, useCallback } from 'react';
import { useShareIntent } from 'expo-share-intent';

function extractCoupangUrl(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const urlMatch = raw.match(/(https?:\/\/[^\s]+)/);
  if (!urlMatch) return null;
  const url = urlMatch[1];
  if (!url.includes('coupang.com')) return null;
  return url;
}

export function useShareIntentHandler(onCoupangUrl) {
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntent();

  const handleIntent = useCallback(() => {
    if (!hasShareIntent || !shareIntent) return;
    resetShareIntent();
    const raw = shareIntent.text ?? shareIntent.webUrl ?? '';
    const url = extractCoupangUrl(raw);
    if (!url) return;
    onCoupangUrl(url);
  }, [hasShareIntent, shareIntent, resetShareIntent, onCoupangUrl]);

  useEffect(() => { handleIntent(); }, [handleIntent]);
}
