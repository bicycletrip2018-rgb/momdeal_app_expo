import React, { createContext, useCallback, useContext, useState } from 'react';

// Default status flags applied to every tracked item.
const DEFAULT_STATUS = {
  isPriceAlertOn:   true,
  isRestockAlertOn: false,
  isFavorite:       false,
};

// ─── Context ──────────────────────────────────────────────────────────────────

const TrackingContext = createContext(null);

export function TrackingProvider({ children }) {
  const [globalTrackedItems, setGlobalTrackedItems] = useState([]);

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
