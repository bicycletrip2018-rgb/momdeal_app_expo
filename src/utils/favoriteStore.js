// Global in-memory favorite store — syncs heart state across screens without Redux.
// Keys are productId strings. Add/remove here, then mirror into local component state.
export const globalFavorites = new Set();
