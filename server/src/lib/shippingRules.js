// NLS Xpress shipping rules. Pure functions with NO dependencies and NO I/O, so they are unit-tested directly
// and are the ONLY place the tariff is calculated (the storefront and admin screens just display what the API returns).

export const STORE_CURRENCY = "USD";      // the catalog currency (product prices are USD)
export const DOMESTIC_COUNTRY = "PK";
export const SUPPORTED_SHIPPING_CURRENCIES = Object.freeze(["PKR", "USD"]);

// Domestic NLS Xpress tariff. The SHAPE is fixed in code, the two AMOUNTS are admin-editable (stored in ShippingSettings):
//   billable weight <= 3 kg : fixedCharge   (this includes parcels under 1 kg: they are NOT rounded up to 1 kg)
//   billable weight  > 3 kg : fixedCharge + ceil(billable kg - 3) x additionalPerKg
// A fraction of an additional kilogram counts as a full kilogram (rounded up) until NLS Xpress says otherwise.
// The values below are only the INITIAL defaults (PKR 300 / PKR 100) used when nothing has been saved yet.
export const DOMESTIC_TARIFF = Object.freeze({
  currency: "PKR",
  fixedUpToKg: 3,
  fixedCharge: 300,
  additionalPerKg: 100,
  additionalKgRounding: "up_to_next_whole_kg",
});

// International weight-based pricing (per destination, all amounts admin-entered):
//   billable kg = weight rounded UP to a whole kilogram (0.5 kg -> 1 kg, 2.2 kg -> 3 kg)
//   weight <= 20 kg : firstKgPrice + (billable kg - 1) x additionalKgPrice
//   weight  > 20 kg : flatRateOver20Kg, as the ENTIRE charge (nothing is added on top)
export const INTERNATIONAL_FLAT_OVER_KG = 20;
export const INTERNATIONAL_RATE_FIELDS = Object.freeze(["firstKgPrice", "additionalKgPrice", "flatRateOver20Kg"]);

// ---- weights (integer grams internally, so 3.1 + 0.9 style floating-point drift can never change a price) ----

// kg -> integer grams, or null when the value is not a finite number, is negative/zero (unless allowZero), or has
// more than 3 decimal places (finer than a gram is not a real packed weight).
export function kgToGrams(kg, { allowZero = false } = {}) {
  if (typeof kg !== "number" || !Number.isFinite(kg)) return null;
  if (kg < 0 || (kg === 0 && !allowZero)) return null;
  const g = Math.round(kg * 1000);
  if (Math.abs(kg * 1000 - g) > 1e-6) return null;
  return g;
}

// Both tariff amounts must be real money amounts; at least one above 0 (use Free Shipping to ship for free).
export const isValidTariff = (t) => !!t && isMoneyAmount(t.fixedCharge) && isMoneyAmount(t.additionalPerKg) && (t.fixedCharge > 0 || t.additionalPerKg > 0);

export function domesticShippingFromGrams(grams, tariff = DOMESTIC_TARIFF) {
  if (!Number.isInteger(grams) || grams <= 0) throw new RangeError("Billable weight must be a positive whole number of grams.");
  if (!isValidTariff(tariff)) throw new RangeError("The domestic tariff is invalid.");
  const includedGrams = DOMESTIC_TARIFF.fixedUpToKg * 1000;
  const additionalKg = grams <= includedGrams ? 0 : Math.ceil((grams - includedGrams) / 1000);
  const cents = toCents(tariff.fixedCharge) + additionalKg * toCents(tariff.additionalPerKg); // integer cents: no float drift
  return { amount: fromCents(cents), currency: DOMESTIC_TARIFF.currency, billableGrams: grams, billableKg: grams / 1000, additionalKg };
}

// The shared domestic calculation. `weightKg` is the TOTAL billable parcel weight (products + packaging).
export function calculateDomesticShipping(weightKg, tariff = DOMESTIC_TARIFF) {
  const grams = kgToGrams(weightKg);
  if (grams === null) throw new RangeError("Billable weight must be a positive number of kilograms with at most 3 decimal places.");
  return domesticShippingFromGrams(grams, tariff);
}

// ---- international pricing methods (extensible: add an entry here and to the model enum) ----
export const PRICING_METHODS = Object.freeze({
  weight_based: Object.freeze({
    label: "Weight based (first KG + additional KG, flat rate over 20 KG)",
    calculate(dest, grams) {
      if (grams > INTERNATIONAL_FLAT_OVER_KG * 1000) return { cents: toCents(dest.flatRateOver20Kg), billableKg: null, rule: "flat_over_20kg" };
      const billableKg = Math.max(1, Math.ceil(grams / 1000));
      return { cents: toCents(dest.firstKgPrice) + (billableKg - 1) * toCents(dest.additionalKgPrice), billableKg, rule: "per_kg" };
    },
  }),
});

// Which of the three required rate fields are missing or invalid (empty array = the destination is correctly priced).
export function internationalRateIssues(dest) {
  const issues = INTERNATIONAL_RATE_FIELDS.filter((f) => !isMoneyAmount(dest?.[f]));
  if (!PRICING_METHODS[dest?.pricingMethod]) issues.push("pricingMethod");
  if (!SUPPORTED_SHIPPING_CURRENCIES.includes(dest?.currency || "PKR")) issues.push("currency");
  return issues;
}
export const isInternationalRateComplete = (dest) => !!dest && internationalRateIssues(dest).length === 0;

export function calculateInternationalShipping(dest, weightKg) {
  const grams = kgToGrams(weightKg);
  if (grams === null) throw new RangeError("Billable weight must be a positive number of kilograms with at most 3 decimal places.");
  const issues = internationalRateIssues(dest);
  if (issues.length) throw new RangeError(`This destination's rates are incomplete or invalid: ${issues.join(", ")}.`);
  const r = PRICING_METHODS[dest.pricingMethod].calculate(dest, grams);
  return { amount: fromCents(r.cents), currency: dest.currency || "PKR", billableKg: r.billableKg, rule: r.rule };
}

// ---- money ----
export const isMoneyAmount = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0 && Math.abs(v * 100 - Math.round(v * 100)) < 1e-6;
export const toCents = (v) => Math.round(v * 100);
export const fromCents = (c) => c / 100;

// ---- destinations ----
// Lower-cased, accent-stripped, single-spaced: "  Dubaï  " and "dubai" are the same place.
export const normalizePlace = (s) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
export const cleanEstimate = (s) => (typeof s === "string" && s.trim() ? s.trim() : null); // blank => no delivery claim at all

// The enabled configuration that serves this country + city, or null. A city-specific entry wins over a country-wide one.
// Nothing is ever inferred: no entry => not serviceable (other cities of a country are NOT assumed to be covered).
export function findDestination(destinations, countryCode, city) {
  const cc = String(countryCode || "").toUpperCase();
  const key = normalizePlace(city);
  const open = (destinations || []).filter((d) => d && d.enabled !== false && String(d.countryCode).toUpperCase() === cc);
  return (key && open.find((d) => d.cityKey === key)) || open.find((d) => !d.cityKey) || null;
}
