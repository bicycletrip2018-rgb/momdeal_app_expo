const MS_PER_DAY = 86_400_000;

function parseDateMs(dateValue) {
  if (!dateValue) return null;
  if (typeof dateValue.toMillis === 'function') return dateValue.toMillis();
  if (typeof dateValue.seconds === 'number') return dateValue.seconds * 1000;
  if (typeof dateValue === 'number') return dateValue;
  if (dateValue instanceof Date) return dateValue.getTime();
  return null;
}

function calcDiscountPct(item) {
  if (typeof item.marketingDiscountPct === 'number' && item.marketingDiscountPct !== 0)
    return item.marketingDiscountPct;
  if (typeof item.discount === 'number' && item.discount > 0) return item.discount;
  const price = item.currentPrice ?? item.price ?? 0;
  const orig  = item.averagePrice ?? item.originalPrice ?? item.original ?? 0;
  if (!orig || !price || orig <= price) return null;
  return Math.round(((orig - price) / orig) * 100);
}

// Returns a price display descriptor for a product card.
// mode='blind'  — tracking < 7 days: hide discount, show plain price + reveal-date hint
// mode='active' — tracking >= 7 days or no tracking date: show discount%, price, strikethrough avg
export function resolveAgingPriceDisplay(item) {
  const startMs = parseDateMs(
    item.trackingStartDate ?? item.savedAt ?? item.createdAt ?? null
  );

  const currentPrice = item.currentPrice ?? item.price ?? null;
  const averagePrice = item.averagePrice ?? item.originalPrice ?? item.original ?? null;

  if (startMs !== null) {
    const daysTracked = Math.floor((Date.now() - startMs) / MS_PER_DAY);
    if (daysTracked < 7) {
      const revealDate = new Date(startMs + 7 * MS_PER_DAY);
      return {
        mode: 'blind',
        currentPrice,
        revealLabel: `${revealDate.getMonth() + 1}월 ${revealDate.getDate()}일`,
      };
    }
  }

  return {
    mode: 'active',
    currentPrice,
    averagePrice,
    discountPct: calcDiscountPct(item),
  };
}
