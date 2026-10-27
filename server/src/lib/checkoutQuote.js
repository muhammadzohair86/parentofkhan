// Server-side cart pricing + shipping quote. Everything here is pure (data in, data out): the controller loads the
// products / settings / destinations from MongoDB and passes them in, so the rules are unit-tested without a database.
// Nothing the browser sends is trusted except WHAT is being bought (product, color, size, quantity) and WHERE it goes.
import { ApiError } from "../utils/ApiError.js";
import {
  STORE_CURRENCY, DOMESTIC_COUNTRY, kgToGrams, domesticShippingFromGrams, calculateInternationalShipping, isInternationalRateComplete,
  findDestination, cleanEstimate, normalizePlace, toCents, fromCents,
} from "./shippingRules.js";
import { countryName } from "./countries.js";

export const MAX_LINE_QTY = 10;   // same sanity cap as the storefront cart
export const MAX_CART_LINES = 25;

const problem = (status, code, message, details) => new ApiError(status, code, message, details);

// ---- 1. cart lines: validated against the CURRENT database records ----
// `productsById`: Map(String(_id) -> product document with `category` populated). Returns priced lines; throws one
// CART_INVALID error listing every problem so the customer can fix the cart in one go.
export function resolveCartLines(rawItems, productsById) {
  const lines = [];
  const issues = [];
  const seen = new Set();
  (rawItems || []).forEach((raw, i) => {
    const path = `items.${i}`;
    const fail = (message) => issues.push({ path, message });
    const p = productsById.get(String(raw.productId));
    // Same visibility rule as the public catalog: active product in an active category.
    if (!p || p.active === false || !p.category || p.category.active === false) return fail("This product is no longer available.");
    const color = normalizePlace(raw.color), size = normalizePlace(raw.size);
    const variant = (p.variants || []).find((v) => v.available !== false && normalizePlace(v.color) === color);
    if (!variant) return fail(`${p.name}: that color is no longer available.`);
    const sz = (variant.sizes || []).find((s) => normalizePlace(s.size) === size);
    if (!sz) return fail(`${p.name} (${variant.color}): that size is no longer available.`);
    const key = `${p._id}|${variant.color}|${sz.size}`.toLowerCase();
    if (seen.has(key)) return fail(`${p.name} (${variant.color}, ${sz.size}) is listed more than once.`);
    seen.add(key);
    if (!Number.isInteger(raw.quantity) || raw.quantity < 1 || raw.quantity > MAX_LINE_QTY) return fail(`${p.name}: quantity must be between 1 and ${MAX_LINE_QTY}.`);
    const unit = p.salePrice ?? p.price; // current database price; any price the browser sent was never read
    if (typeof unit !== "number" || !Number.isFinite(unit) || unit < 0) return fail(`${p.name}: this product has no valid price.`);
    lines.push({
      productId: String(p._id), slug: p.slug, name: p.name, color: variant.color, size: sz.size, sku: variant.sku || "",
      image: (Array.isArray(variant.images) && variant.images[0]) || null,
      quantity: raw.quantity, unitPriceCents: toCents(unit),
      weightGrams: kgToGrams(p.weightKg), // null = no valid packed weight configured for this product
    });
  });
  if (issues.length) throw problem(422, "CART_INVALID", "Some items in your cart can't be ordered. Please review your cart.", issues);
  return lines;
}

// ---- 2. shipping ----
// Parcel weight in grams: products x quantity plus packaging ONCE per parcel. A missing/invalid product weight is
// reported by name, never guessed. (Not needed at all when Free Shipping is on: the charge is 0 whatever it weighs.)
function parcelGrams(lines, packagingKg) {
  const missing = [...new Set(lines.filter((l) => l.weightGrams === null).map((l) => l.name))];
  if (missing.length) {
    throw problem(422, "SHIPPING_WEIGHT_MISSING", `We can't calculate shipping yet for: ${missing.join(", ")}. Their parcel weight hasn't been set up. Please contact us.`, missing.map((name) => ({ path: "items", message: `${name}: weight not configured.` })));
  }
  const packaging = kgToGrams(packagingKg ?? 0, { allowZero: true });
  if (packaging === null) throw problem(422, "SHIPPING_CONFIG_INVALID", "Shipping can't be calculated right now. Please contact us.");
  return lines.reduce((n, l) => n + l.weightGrams * l.quantity, 0) + packaging;
}

function domesticQuote(lines, settings, city) {
  const d = settings.domestic;
  if (!d.enabled) throw problem(422, "SHIPPING_UNAVAILABLE", "Domestic shipping is currently unavailable.");
  const base = { scope: "domestic", courier: d.name, destinationName: countryName(DOMESTIC_COUNTRY), countryCode: DOMESTIC_COUNTRY, city: city || "", pricingMethod: "nls_domestic_tariff", currency: "PKR", deliveryEstimate: cleanEstimate(d.deliveryEstimate) };
  // Free Shipping is the admin's DOMESTIC switch. The server decides the 0 itself; a browser-sent amount is never read.
  if (d.freeShipping) return { ...base, amount: 0, freeShipping: true, billableWeightKg: null, additionalKg: null };
  const grams = parcelGrams(lines, d.packagingWeightKg);
  let result;
  try { result = domesticShippingFromGrams(grams, { fixedCharge: d.fixedCharge, additionalPerKg: d.additionalPerKg }); } // the admin-edited tariff
  catch { throw problem(422, "SHIPPING_CONFIG_INVALID", "Shipping can't be calculated right now. Please contact us."); }
  return { ...base, amount: result.amount, freeShipping: false, billableWeightKg: result.billableKg, additionalKg: result.additionalKg };
}

function internationalQuote(lines, settings, destinations, countryCode, city) {
  const unavailable = () => {
    const where = [city, countryName(countryCode)].filter(Boolean).join(", ");
    const open = (destinations || []).filter((d) => d.enabled !== false && String(d.countryCode).toUpperCase() === countryCode && d.cityKey && isInternationalRateComplete(d)).map((d) => d.displayName);
    const hint = open.length ? ` Available in ${countryName(countryCode)}: ${open.join("; ")}.` : "";
    return problem(422, "SHIPPING_UNAVAILABLE", `International shipping is currently unavailable for ${where || "this destination"}.${hint}`);
  };
  // The matched destination must be enabled AND correctly priced. An incomplete record is never replaced by a different
  // record's rate and never gets a made-up price; Free Shipping does not make it available either.
  const dest = findDestination(destinations, countryCode, city);
  if (!dest || !isInternationalRateComplete(dest)) throw unavailable();
  const i = settings.international || {};
  const base = {
    scope: "international", courier: dest.courier, destinationName: dest.displayName, destinationId: dest._id ? String(dest._id) : null,
    countryCode: String(dest.countryCode).toUpperCase(), city: city || "", pricingMethod: dest.pricingMethod, currency: dest.currency || "PKR", deliveryEstimate: cleanEstimate(dest.deliveryEstimate),
  };
  if (i.freeShipping) return { ...base, amount: 0, freeShipping: true, billableWeightKg: null, additionalKg: null };
  const grams = parcelGrams(lines, i.packagingWeightKg);
  let price;
  try { price = calculateInternationalShipping(dest, grams / 1000); } // this destination's OWN first-KG / additional-KG / over-20-KG rates
  catch { throw problem(422, "SHIPPING_CONFIG_INVALID", "Shipping can't be calculated for this destination right now. Please contact us."); }
  return { ...base, amount: price.amount, freeShipping: false, billableWeightKg: price.billableKg, additionalKg: null };
}

// Shipping charge expressed in the store currency (USD), in cents, or null when it cannot be done without inventing a rate.
export function shippingCentsInStoreCurrency(shipping, pkrPerUsd) {
  if (shipping.amount === 0) return 0; // free shipping needs no conversion rate
  if (shipping.currency === STORE_CURRENCY) return toCents(shipping.amount);
  if (shipping.currency === "PKR" && typeof pkrPerUsd === "number" && Number.isFinite(pkrPerUsd) && pkrPerUsd > 0) {
    return Math.ceil((shipping.amount / pkrPerUsd) * 100 - 1e-9); // round UP to the next cent, never under-charge
  }
  return null;
}

// ---- 3. the quote ----
export function buildQuote({ lines, settings, destinations, country, city }) {
  const cc = String(country || "").toUpperCase();
  const cleanCity = String(city || "").trim();
  const shipping = cc === DOMESTIC_COUNTRY ? domesticQuote(lines, settings, cleanCity) : internationalQuote(lines, settings, destinations, cc, cleanCity);

  const subtotalCents = lines.reduce((n, l) => n + l.unitPriceCents * l.quantity, 0);
  const shippingCents = shippingCentsInStoreCurrency(shipping, settings.pkrPerUsd);
  const total = shippingCents === null ? null : fromCents(subtotalCents + shippingCents);
  return {
    currency: STORE_CURRENCY,
    items: lines.map((l) => ({ productId: l.productId, slug: l.slug, sku: l.sku, image: l.image, name: l.name, color: l.color, size: l.size, quantity: l.quantity, unitPrice: fromCents(l.unitPriceCents), lineTotal: fromCents(l.unitPriceCents * l.quantity) })),
    subtotal: fromCents(subtotalCents),
    shipping,
    shippingInStoreCurrency: shippingCents === null ? null : fromCents(shippingCents),
    exchangeRatePkrPerUsd: shipping.currency !== STORE_CURRENCY && shipping.amount > 0 && shippingCents !== null ? settings.pkrPerUsd : null,
    total,
    totalNote: total === null ? "The shipping charge is in PKR and no PKR/USD conversion rate has been configured, so the subtotal and shipping are shown separately." : null,
  };
}

// ---- 4. anti-tampering ----
// `submitted` = whatever amounts the browser claims. Any difference from the server's own calculation is rejected.
export function assertSubmittedMatches(quote, submitted) {
  if (!submitted) return;
  const same = (a, b) => typeof a === "number" && typeof b === "number" && Math.abs(a - b) < 0.005;
  const checks = [
    ["shippingAmount", submitted.shippingAmount, quote.shipping.amount],
    ["subtotal", submitted.subtotal, quote.subtotal],
    ["total", submitted.total, quote.total],
  ];
  const mismatches = checks
    .filter(([, sent, real]) => sent !== undefined && !same(sent, real))
    .map(([path, , real]) => ({ path, message: "Does not match the amount calculated by the store.", expected: real }));
  if (mismatches.length) throw problem(409, "TOTALS_MISMATCH", "The shipping charge or total didn't match the store's calculation. Please review your order.", mismatches);
}

// ---- 5. what an order stores ----
// A frozen copy of the courier/destination/charge/currency/estimate, so later admin rate changes never rewrite history.
// (No order-creation API exists yet; the future one must use this and never a browser-supplied number.)
export function buildOrderPricing(quote) {
  if (quote.total === null) throw problem(422, "TOTAL_UNAVAILABLE", quote.totalNote || "The order total can't be calculated.");
  const s = quote.shipping;
  return {
    currency: quote.currency, subtotal: quote.subtotal, shipping: quote.shippingInStoreCurrency, total: quote.total,
    shippingDetails: {
      scope: s.scope, courier: s.courier, destinationName: s.destinationName, countryCode: s.countryCode, city: s.city || "",
      pricingMethod: s.pricingMethod, amount: s.amount, currency: s.currency, freeShipping: !!s.freeShipping, deliveryEstimate: s.deliveryEstimate || "",
      billableWeightKg: s.billableWeightKg ?? null, exchangeRatePkrPerUsd: quote.exchangeRatePkrPerUsd ?? null,
    },
  };
}
