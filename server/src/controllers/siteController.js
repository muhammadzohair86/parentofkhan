import { SiteSetting } from "../models/SiteSetting.js";
import { FeatureBox } from "../models/FeatureBox.js";
import { PaymentMethod } from "../models/PaymentMethod.js";
import { DEFAULT_FEATURES, DEFAULT_HERO_ALT, MAX_ACTIVE_FEATURES } from "../lib/siteDefaults.js";

// Public, read-only. Each endpoint exposes only what the storefront renders.
const cache = (res) => res.set("Cache-Control", "public, max-age=30");

// null images mean "not configured": the storefront then uses its built-in local hero assets.
export async function getHero(_req, res) {
  const doc = await SiteSetting.findOne({ key: "site" }).lean();
  const h = doc?.hero;
  const on = !!h && h.active !== false;
  cache(res);
  res.json({ success: true, data: { desktopImage: (on && h.desktopImage) || null, mobileImage: (on && h.mobileImage) || null, alt: (on && h.alt) || DEFAULT_HERO_ALT } });
}

// An empty collection returns the built-in defaults. Once any box exists (even inactive), the database is in charge.
export async function getFeatures(_req, res) {
  cache(res);
  if ((await FeatureBox.countDocuments({})) === 0) {
    return res.json({ success: true, data: DEFAULT_FEATURES.map(({ key, title, description, icon }) => ({ id: key, title, description, icon })) });
  }
  const items = await FeatureBox.find({ active: true }).sort({ order: 1, _id: 1 }).limit(MAX_ACTIVE_FEATURES).lean(); // never more than 3, even if the database holds more
  res.json({ success: true, data: items.map((f) => ({ id: String(f._id), title: f.title, description: f.description || "", icon: f.icon })) });
}

export async function getPaymentMethods(_req, res) {
  const items = await PaymentMethod.find({ active: true }).sort({ order: 1, _id: 1 }).lean();
  cache(res);
  res.json({ success: true, data: items.map((m) => ({ id: String(m._id), name: m.name, logoUrl: m.logoUrl || null, altText: m.altText || m.name })) });
}
