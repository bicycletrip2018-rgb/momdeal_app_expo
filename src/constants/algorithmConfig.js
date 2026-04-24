// ─── Pediatric Sliding Window Configuration ──────────────────────────────────
// Defines the ±day window for peer-signal aggregation at each developmental stage.
// Used by the recommendation engine to determine how broadly to sample peer behavior.

export const SLIDING_WINDOW_DAYS = {
  PREGNANCY:          14,  // ±14 days
  NEWBORN_0_1M:        7,  // ±7 days
  INFANT_1_6M:        15,
  LATE_INFANT_6_12M:  30,
  TODDLER_12_36M:     60,
  CHILD_3_5Y:        180,
  SCHOOL_6_9Y:       365,
};

// ─── 3-Layer Blending Ratio ───────────────────────────────────────────────────
// Weights for combining same-segment peer signals, next-stage prediction,
// and global trend data when scoring products.

export const BLENDING_RATIO = {
  SAME_SEGMENT:  0.7,  // Strongest signal: peers at the exact same developmental stage
  NEXT_STAGE:    0.2,  // Predict next developmental needs (forward-looking)
  GLOBAL_TREND:  0.1,  // Broad popularity signal as a floor
};
