// ─── Tier system (SSOT for all community + profile badge rendering) ──────────

export const TIER_LIST = [
  { number: 1, name: '일반맘', color: '#475569' },
  { number: 2, name: '성실맘', color: '#047857' },
  { number: 3, name: '열심맘', color: '#B45309' },
  { number: 4, name: '우수맘', color: '#1E40AF' },
];

export function getTierBySeed(seed) {
  if (!seed) return TIER_LIST[0];
  const n = String(seed).split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return TIER_LIST[n % TIER_LIST.length];
}

export function getTierByNumber(number) {
  return TIER_LIST.find((t) => t.number === number) ?? TIER_LIST[0];
}
