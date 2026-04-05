import React, { createContext, useCallback, useContext, useState } from 'react';

// ─── Initial seed ─────────────────────────────────────────────────────────────
// Mirrors the SearchScreen mock `sr1` so My Page isn't empty on first load.
// All items are stored in the MyPageScreen savedItem shape so both screens can
// consume the context without per-screen normalization in the renderers.

// Default status flags applied to every tracked item.
const DEFAULT_STATUS = {
  isPriceAlertOn:   true,
  isRestockAlertOn: false,
  isFavorite:       false,
};

const INITIAL_TRACKED = [
  {
    productId:    'sr1',
    savedId:      'sr1',
    name:         '팸퍼스 하이드로케어 기저귀 특대형 5단계 88매',
    image:        'https://picsum.photos/seed/saveroo1/200/200',
    currentPrice: 31900,
    priceDrop:    15000,
    targetPrice:  28000,
    coupangUrl:   'https://coupa.ng/blE0dT',
    deliveryType: 'rocket',
    ...DEFAULT_STATUS,
  },
  {
    productId:    'sr2',
    savedId:      'sr2',
    name:         '하기스 맥스드라이 팬티형 3단계 108매',
    image:        'https://picsum.photos/seed/saveroo2/200/200',
    currentPrice: 29900,
    priceDrop:    7000,
    targetPrice:  29900, // already reached
    coupangUrl:   null,
    deliveryType: 'rocket',
    ...DEFAULT_STATUS,
    isFavorite: true,
  },
  {
    productId:    'sr3',
    savedId:      'sr3',
    name:         '마미포코 오가닉 밴드형 신생아 72매',
    image:        'https://picsum.photos/seed/saveroo3/200/200',
    currentPrice: 18500,
    priceDrop:    3500,
    targetPrice:  undefined, // no target set
    coupangUrl:   null,
    deliveryType: 'fresh',
    ...DEFAULT_STATUS,
  },
  {
    productId:    'sr4',
    savedId:      'sr4',
    name:         '보솜이 프리미엄 기저귀 밴드형 2단계 84매',
    image:        'https://picsum.photos/seed/saveroo4/200/200',
    currentPrice: 22000,
    priceDrop:    5000,
    targetPrice:  20000,
    coupangUrl:   null,
    deliveryType: 'rocket',
    ...DEFAULT_STATUS,
    isPriceAlertOn: false,
  },
];

// ─── Context ──────────────────────────────────────────────────────────────────

const TrackingContext = createContext(null);

export function TrackingProvider({ children }) {
  const [globalTrackedItems, setGlobalTrackedItems] = useState(INITIAL_TRACKED);

  // Normalize any incoming item shape (SearchScreen item OR MyPage savedItem)
  // into the canonical savedItem shape used throughout the app.
  const addTrackedItem = useCallback((item) => {
    const normalized = {
      productId:    item.productId    ?? item.id,
      savedId:      item.savedId      ?? item.id,
      name:         item.name         ?? '상품',
      image:        item.image        ?? null,
      currentPrice: item.currentPrice ?? 0,
      priceDrop:    item.priceDrop    ??
                    (item.originalPrice != null
                      ? item.originalPrice - (item.currentPrice ?? 0)
                      : 0),
      coupangUrl:   item.coupangUrl   ?? null,
      deliveryType: item.deliveryType ?? undefined,
      targetPrice:  item.targetPrice  ?? undefined,
      // Status flags — preserve incoming values, fall back to defaults
      isPriceAlertOn:   item.isPriceAlertOn   ?? DEFAULT_STATUS.isPriceAlertOn,
      isRestockAlertOn: item.isRestockAlertOn ?? DEFAULT_STATUS.isRestockAlertOn,
      isFavorite:       item.isFavorite       ?? DEFAULT_STATUS.isFavorite,
    };
    setGlobalTrackedItems((prev) => {
      if (prev.some((i) => i.productId === normalized.productId)) return prev;
      return [normalized, ...prev];
    });
  }, []);

  const removeTrackedItem = useCallback((itemId) => {
    setGlobalTrackedItems((prev) => prev.filter((i) => i.productId !== itemId));
  }, []);

  // Batch-replace — used by MyPageScreen when Firestore returns the full saved list
  const setTrackedItems = useCallback((items) => {
    setGlobalTrackedItems(items);
  }, []);

  // Patch specific fields on a set of items by productId.
  // updates = { isPriceAlertOn: true } etc.
  const updateTrackedItems = useCallback((itemIds, updates) => {
    setGlobalTrackedItems((prev) =>
      prev.map((i) =>
        itemIds.includes(i.productId) ? { ...i, ...updates } : i
      )
    );
  }, []);

  return (
    <TrackingContext.Provider value={{ globalTrackedItems, addTrackedItem, removeTrackedItem, setTrackedItems, updateTrackedItems }}>
      {children}
    </TrackingContext.Provider>
  );
}

export function useTracking() {
  const ctx = useContext(TrackingContext);
  if (!ctx) throw new Error('useTracking must be used within a TrackingProvider');
  return ctx;
}
