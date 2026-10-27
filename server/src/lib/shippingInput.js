// Validation + normalisation of everything an admin can submit about shipping. Pure functions (no zod, no I/O) so the
// rules are unit-tested directly; validators/shippingValidators.js wraps them for the Express `validate` middleware.
// Each parser returns { value, errors: [{ path, message }] } and never throws.
import { isCountryCode } from "./countries.js";
import { DOMESTIC_COUNTRY, SUPPORTED_SHIPPING_CURRENCIES, PRICING_METHODS, INTERNATIONAL_RATE_FIELDS, kgToGrams, isMoneyAmount } from "./shippingRules.js";

export const MAX_RATE = 10_000_000;
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const blank = (v) => v === undefined || v === null || (typeof v === "string" && v.trim() === "");

function text(raw, path, errors, { required = false, max = 80, label }) {
  if (blank(raw)) { if (required) errors.push({ path, message: `Enter ${label}.` }); return ""; }
  if (typeof raw !== "string") { errors.push({ path, message: "Enter text." }); return ""; }
  const v = raw.trim();
  if (v.length > max) errors.push({ path, message: `Keep it to ${max} characters or fewer.` });
  return v;
}
function bool(raw, path, errors, { required }) {
  if (raw === undefined || raw === null) { if (required) errors.push({ path, message: "Choose on or off." }); return undefined; }
  if (typeof raw !== "boolean") { errors.push({ path, message: "Must be on or off." }); return undefined; }
  return raw;
}
// Money: a real JSON number (never "PKR 300"), finite, >= 0, at most 2 decimals. Blank = null when optional.
function money(raw, path, errors, { required = false, label = "an amount" } = {}) {
  if (blank(raw)) { if (required) errors.push({ path, message: `Enter ${label}.` }); return null; }
  if (typeof raw !== "number" || !Number.isFinite(raw)) { errors.push({ path, message: "Enter a plain number, without currency symbols." }); return null; }
  if (raw < 0) { errors.push({ path, message: "Cannot be negative." }); return null; }
  if (raw > MAX_RATE) { errors.push({ path, message: "That looks too large." }); return null; }
  if (!isMoneyAmount(raw)) { errors.push({ path, message: "Use at most 2 decimal places." }); return null; }
  return raw;
}
function kg(raw, path, errors, { max }) {
  if (blank(raw)) return 0;
  if (typeof raw !== "number" || !Number.isFinite(raw)) { errors.push({ path, message: "Enter a number." }); return 0; }
  if (raw < 0) { errors.push({ path, message: "Cannot be negative." }); return 0; }
  if (raw > max) { errors.push({ path, message: `That is more than ${max} kg.` }); return 0; }
  if (kgToGrams(raw, { allowZero: true }) === null) { errors.push({ path, message: "Use at most 3 decimal places." }); return 0; }
  return raw;
}
const done = (value, errors) => ({ value: errors.length ? null : value, errors });
const notObject = () => ({ value: null, errors: [{ path: "", message: "Invalid request." }] });

// ---- domestic settings + currency rate: PUT /admin/shipping/settings ----
export function parseSettingsInput(raw) {
  if (!isObj(raw) || !isObj(raw.domestic)) return notObject();
  const e = [], d = raw.domestic;
  const value = {
    domestic: {
      enabled: bool(d.enabled, "domestic.enabled", e, { required: true }),
      freeShipping: bool(d.freeShipping, "domestic.freeShipping", e, { required: true }),
      name: text(d.name, "domestic.name", e, { required: true, label: "a shipping name" }),
      deliveryEstimate: text(d.deliveryEstimate, "domestic.deliveryEstimate", e, { label: "an estimate" }),
      packagingWeightKg: kg(d.packagingWeightKg, "domestic.packagingWeightKg", e, { max: 20 }),
      fixedCharge: money(d.fixedCharge, "domestic.fixedCharge", e, { required: true, label: "the fixed charge" }),
      additionalPerKg: money(d.additionalPerKg, "domestic.additionalPerKg", e, { required: true, label: "the charge per additional KG" }),
    },
    pkrPerUsd: null,
  };
  if (value.domestic.fixedCharge === 0 && value.domestic.additionalPerKg === 0) {
    e.push({ path: "domestic.fixedCharge", message: "Both charges can't be 0. To ship for free, turn on Free Shipping instead." });
  }
  if (!blank(raw.pkrPerUsd)) {
    const r = raw.pkrPerUsd;
    if (typeof r !== "number" || !Number.isFinite(r)) e.push({ path: "pkrPerUsd", message: "Enter a number." });
    else if (r <= 0) e.push({ path: "pkrPerUsd", message: "Must be greater than 0." });
    else if (r > 100000) e.push({ path: "pkrPerUsd", message: "That looks too large." });
    else if (Math.abs(r * 10000 - Math.round(r * 10000)) > 1e-6) e.push({ path: "pkrPerUsd", message: "Use at most 4 decimal places." });
    else value.pkrPerUsd = r;
  }
  return done(value, e);
}

// ---- international settings: PUT /admin/shipping/international-settings ----
export function parseInternationalSettingsInput(raw) {
  if (!isObj(raw)) return notObject();
  const e = [];
  const value = { freeShipping: bool(raw.freeShipping, "freeShipping", e, { required: true }), packagingWeightKg: kg(raw.packagingWeightKg, "packagingWeightKg", e, { max: 20 }) };
  return done(value, e);
}

// ---- one international destination: create (all fields) or patch (only the fields sent) ----
export function parseDestinationInput(raw, { partial = false } = {}) {
  if (!isObj(raw)) return notObject();
  const e = [], v = {};
  const has = (k) => !partial || raw[k] !== undefined;

  if (has("countryCode")) {
    const c = typeof raw.countryCode === "string" ? raw.countryCode.trim().toUpperCase() : "";
    if (!isCountryCode(c)) e.push({ path: "countryCode", message: "Choose a country from the list." });
    else if (c === DOMESTIC_COUNTRY) e.push({ path: "countryCode", message: "Pakistan is covered by domestic shipping." });
    else v.countryCode = c;
  }
  if (has("city")) v.city = text(raw.city, "city", e, { label: "a city" });
  if (has("displayName")) v.displayName = text(raw.displayName, "displayName", e, { label: "a name" }); // blank = generated by the controller
  if (has("courier")) v.courier = text(raw.courier, "courier", e, { required: true, label: "the courier / shipping method name" });
  if (has("pricingMethod")) {
    const m = raw.pricingMethod === undefined ? Object.keys(PRICING_METHODS)[0] : raw.pricingMethod;
    if (!PRICING_METHODS[m]) e.push({ path: "pricingMethod", message: "Choose a pricing method from the list." }); else v.pricingMethod = m;
  }
  for (const f of INTERNATIONAL_RATE_FIELDS) {
    // Rates may be left blank while an admin is still gathering them: the destination is then flagged incomplete and is NOT offered at checkout.
    if (has(f)) v[f] = money(raw[f], f, e, {});
  }
  if (has("currency")) {
    const c = raw.currency === undefined || raw.currency === null || raw.currency === "" ? "PKR" : raw.currency;
    if (!SUPPORTED_SHIPPING_CURRENCIES.includes(c)) e.push({ path: "currency", message: `Choose ${SUPPORTED_SHIPPING_CURRENCIES.join(" or ")}.` }); else v.currency = c;
  }
  if (has("deliveryEstimate")) v.deliveryEstimate = text(raw.deliveryEstimate, "deliveryEstimate", e, { label: "an estimate" });
  if (has("enabled")) { const b = bool(raw.enabled === undefined ? true : raw.enabled, "enabled", e, { required: false }); if (b !== undefined) v.enabled = b; }
  return done(v, e);
}
