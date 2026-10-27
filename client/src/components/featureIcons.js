import { Shirt, Sparkles, Palette, Leaf, Heart, Truck, ShieldCheck, Star, Package, Feather } from "lucide-react";

// Icon identifiers stored in the database (FeatureBox.icon) -> lucide icons. Keep in sync with
// FEATURE_ICONS in server/src/lib/siteDefaults.js. Unknown identifiers fall back to Sparkles.
const ICONS = {
  shirt: Shirt, sparkles: Sparkles, palette: Palette, leaf: Leaf, heart: Heart,
  truck: Truck, "shield-check": ShieldCheck, star: Star, package: Package, feather: Feather,
};
export const featureIcon = (id) => ICONS[id] || Sparkles;
