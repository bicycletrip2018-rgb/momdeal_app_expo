/**
 * fetchAffiliateAndNavigate
 *
 * Wraps the navigation call to ProductDetail so all entry points (Ranking,
 * search, home feed, etc.) share a single consistent integration path.
 *
 * productId  - Firestore / Coupang product identifier
 * navigation - React Navigation prop
 * source     - caller label ('Ranking' | 'Search' | 'Home' …) used for analytics
 * existingItem - (optional) already-resolved item object to show while Firestore loads
 */
export async function fetchAffiliateAndNavigate(productId, navigation, source, existingItem = null) {
  // Build a mock rich-data object as a placeholder while ProductDetail fetches the real doc.
  // In production this would call the Coupang Partners API for deeplink + price graph data.
  const fetchedItem = existingItem ?? {
    id: productId,
    productId,
    name: '상품',
    price: 0,
    original: 0,
    discount: 0,
    rating: 0,
    reviewCount: 0,
    isRocket: false,
    imageUrl: null,
    priceGraphData: [],
    brand: '',
    emoji: '📦',
    bg: '#f1f5f9',
  };

  navigation.navigate('ProductDetail', {
    productId,
    item: fetchedItem,
    source,
    from: source, // keep backward-compat with existing from checks
  });
}
