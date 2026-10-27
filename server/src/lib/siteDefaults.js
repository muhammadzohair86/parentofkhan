// Defaults used by the idempotent site seed AND as the public fallback when the feature collection is empty,
// so the footer works with zero manual setup. Wording avoids unverified claims (no fabric composition).
export const FEATURE_ICONS = ["shirt", "sparkles", "palette", "leaf", "heart", "truck", "shield-check", "star", "package", "feather"];

// Hard cap on ACTIVE footer feature boxes (enforced by the model and by the public API).
export const MAX_ACTIVE_FEATURES = 3;

export const DEFAULT_HERO_ALT = "Parent Of Khan seasonal campaign";

export const DEFAULT_FEATURES = [
  { key: "comfort-first", title: "Comfort First", description: "Soft, comfortable fabric chosen for easy wear.", icon: "shirt", order: 1 },
  { key: "everyday-wear", title: "Made for Everyday Wear", description: "Designed to fit into your daily rotation.", icon: "sparkles", order: 2 },
  { key: "printed-with-care", title: "Printed with Care", description: "Thoughtfully printed graphic designs.", icon: "palette", order: 3 },
];
