import { ShippingSettings } from "../models/ShippingSettings.js";
import { ShippingDestination } from "../models/ShippingDestination.js";
import { Product } from "../models/Product.js";
import { DEFAULT_DOMESTIC, DEFAULT_INTERNATIONAL, DEFAULT_DESTINATIONS } from "./shippingDefaults.js";
import { shapeSettings } from "./shippingSettings.js";
import { countryName } from "./countries.js";
import { DOMESTIC_COUNTRY } from "./shippingRules.js";
import { resolveCartLines, buildQuote, assertSubmittedMatches } from "./checkoutQuote.js";

const KEY = { key: "shipping" };
const isDup = (e) => e?.code === 11000;

export async function getShippingSettings() {
  return shapeSettings(await ShippingSettings.findOne(KEY).lean());
}

// Idempotent, run at server start (and by `npm run seed:shipping`). Existing records and rates are never overwritten.
//  - creates the single settings document if missing;
//  - seeds the default destinations ONCE (an atomic flag means a second server instance can't duplicate them,
//    and an admin who later deletes or edits one is never overridden);
//  - one-time migration to weight-based international rates: marks existing destinations as weight_based (their rate
//    fields stay blank until an admin enters real amounts; the old fixed `price` is kept untouched) and adds destinations
//    introduced after the first release (the UK) if they are missing.
const insertDefault = async (d) => {
  const { seedVersion, ...fields } = d;
  try { await new ShippingDestination({ ...fields, countryName: countryName(d.countryCode) }).save(); return 1; }
  catch (e) { if (isDup(e)) return 0; throw e; } // already there (e.g. added by hand): leave it alone
};
export async function ensureShippingDefaults() {
  try {
    await ShippingSettings.updateOne(KEY, { $setOnInsert: { domestic: { ...DEFAULT_DOMESTIC }, international: { ...DEFAULT_INTERNATIONAL }, pkrPerUsd: null, internationalSeeded: false, ratesModelMigrated: false } }, { upsert: true });
  } catch (e) { if (!isDup(e)) throw e; } // two instances raced on first start: the other one created it

  let seeded = 0;
  const claim = await ShippingSettings.updateOne({ ...KEY, internationalSeeded: { $ne: true } }, { $set: { internationalSeeded: true } });
  if (claim.modifiedCount === 1) {
    try { for (const d of DEFAULT_DESTINATIONS) seeded += await insertDefault(d); }
    catch (e) { await ShippingSettings.updateOne(KEY, { $set: { internationalSeeded: false } }); throw e; } // let the next start retry
  }

  const migrate = await ShippingSettings.updateOne({ ...KEY, ratesModelMigrated: { $ne: true } }, { $set: { ratesModelMigrated: true } });
  if (migrate.modifiedCount === 1) {
    try {
      await ShippingDestination.updateMany({ pricingMethod: { $ne: "weight_based" } }, { $set: { pricingMethod: "weight_based" } });
      for (const d of DEFAULT_DESTINATIONS.filter((x) => x.seedVersion >= 2)) seeded += await insertDefault(d);
    } catch (e) { await ShippingSettings.updateOne(KEY, { $set: { ratesModelMigrated: false } }); throw e; }
  }
  return { seeded };
}

// Full checkout pricing: loads the CURRENT products, settings and destinations and prices the cart.
// `items` = [{ productId, color, size, quantity }] (already shape-validated); `destination` = { country, city };
// `submitted` = optional amounts the browser claims, which are only ever compared, never used.
export async function quoteCheckout({ items, destination, submitted }) {
  const ids = [...new Set(items.map((i) => i.productId))];
  const country = String(destination.country).toUpperCase();
  const [products, settings, destinations] = await Promise.all([
    Product.find({ _id: { $in: ids } }).populate("category", "active").lean(),
    getShippingSettings(),
    country === DOMESTIC_COUNTRY ? [] : ShippingDestination.find({ countryCode: country, enabled: true }).lean(),
  ]);
  const lines = resolveCartLines(items, new Map(products.map((p) => [String(p._id), p])));
  const quote = buildQuote({ lines, settings, destinations, country, city: destination.city });
  assertSubmittedMatches(quote, submitted);
  return quote;
}
