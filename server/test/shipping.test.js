import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  DOMESTIC_TARIFF, INTERNATIONAL_FLAT_OVER_KG, kgToGrams, calculateDomesticShipping, domesticShippingFromGrams, isValidTariff,
  calculateInternationalShipping, internationalRateIssues, isInternationalRateComplete, findDestination, normalizePlace, cleanEstimate, isMoneyAmount,
} from "../src/lib/shippingRules.js";
import { COUNTRY_CODES, isCountryCode, countryName, listCountries } from "../src/lib/countries.js";
import { DEFAULT_DOMESTIC, DEFAULT_INTERNATIONAL, DEFAULT_DESTINATIONS } from "../src/lib/shippingDefaults.js";
import { shapeSettings } from "../src/lib/shippingSettings.js";
import { parseSettingsInput, parseInternationalSettingsInput, parseDestinationInput } from "../src/lib/shippingInput.js";
import { resolveCartLines, buildQuote, assertSubmittedMatches, buildOrderPricing, shippingCentsInStoreCurrency, MAX_LINE_QTY } from "../src/lib/checkoutQuote.js";
import { ALL_PERMISSIONS, normalizePermissions, hasPermission } from "../src/lib/permissions.js";

// ---------- helpers ----------
const read = (p) => readFile(new URL(p, import.meta.url), "utf8");
const settings = (over = {}) => ({
  domestic: { ...DEFAULT_DOMESTIC, ...(over.domestic || {}) },
  international: { ...DEFAULT_INTERNATIONAL, ...(over.international || {}) },
  pkrPerUsd: over.pkrPerUsd ?? null,
});
// Symbolic, deliberately different amounts per destination so a mix-up between destinations or formulas cannot pass unnoticed.
const rates = (first, additional, flat) => ({ firstKgPrice: first, additionalKgPrice: additional, flatRateOver20Kg: flat });
const dest = (over = {}) => ({ _id: "d1", countryCode: "AE", countryName: "United Arab Emirates", city: "Dubai", cityKey: "dubai", displayName: "Dubai, UAE", courier: "NLS Xpress International", pricingMethod: "weight_based", ...rates(1000, 300, 7000), currency: "PKR", deliveryEstimate: "", enabled: true, ...over });
const uk = (over = {}) => dest({ _id: "d2", countryCode: "GB", countryName: "United Kingdom", city: "", cityKey: "", displayName: "United Kingdom (UK)", ...rates(2500, 900, 20000), ...over });
const category = { _id: "c1", active: true };
const product = (over = {}) => ({
  _id: "p1", name: "Khan Tee", slug: "khan-tee", price: 20, salePrice: null, weightKg: 0.5, active: true, category,
  variants: [{ color: "Black", hex: "#151515", sku: "KT-B", available: true, sizes: [{ size: "M", stock: 0 }, { size: "L", stock: 0 }] }], ...over,
});
const catalog = (...ps) => new Map(ps.map((p) => [String(p._id), p]));
const item = (over = {}) => ({ productId: "p1", color: "Black", size: "M", quantity: 1, ...over });
const priced = (items, ps = [product()]) => resolveCartLines(items, catalog(...ps));
const code = (fn) => { try { fn(); } catch (e) { return e; } assert.fail("expected an error"); };
const ship = ({ items = [item()], ps, s = settings(), destinations = [], country, city = "" }) => buildQuote({ lines: priced(items, ps), settings: s, destinations, country, city });
const errPaths = (r) => r.errors.map((e) => e.path);

// ---------- domestic: formula (initial values 300 / 100) ----------
test("domestic: PKR 300 fixed from 0.5 kg up to and including 3 kg (parcels under 1 kg are NOT rounded up or charged per kg)", () => {
  for (const kg of [0.001, 0.25, 0.5, 1, 2, 2.999, 3]) assert.equal(calculateDomesticShipping(kg).amount, 300, `${kg} kg`);
});
test("domestic: the exact table from the brief", () => {
  const table = { 0.5: 300, 1: 300, 2: 300, 3: 300, 3.1: 400, 4: 400, 4.5: 500, 5: 500, 6: 600 };
  for (const [kg, charge] of Object.entries(table)) assert.equal(calculateDomesticShipping(Number(kg)).amount, charge, `${kg} kg`);
});
test("domestic: any fraction of an additional kilogram is billed as the next whole kilogram", () => {
  assert.equal(calculateDomesticShipping(3.001).amount, 400);
  assert.equal(calculateDomesticShipping(3.999).amount, 400);
  assert.equal(calculateDomesticShipping(4.001).amount, 500);
  assert.equal(calculateDomesticShipping(10.5).amount, 300 + 8 * 100);
  assert.deepEqual(calculateDomesticShipping(4.5), { amount: 500, currency: "PKR", billableGrams: 4500, billableKg: 4.5, additionalKg: 2 });
});
test("domestic: weights are summed in integer grams, so floating-point drift cannot change a price", () => {
  assert.equal(calculateDomesticShipping(3.3).amount, 400);
  assert.equal(domesticShippingFromGrams(3000).amount, 300);
  assert.equal(domesticShippingFromGrams(3001).amount, 400);
});
test("domestic: invalid, negative, zero, non-finite or over-precise weights are rejected (never guessed)", () => {
  for (const bad of [0, -1, NaN, Infinity, "2", null, undefined, 1.2345, {}]) assert.throws(() => calculateDomesticShipping(bad), RangeError, String(bad));
  assert.equal(kgToGrams(0.5), 500);
  assert.equal(kgToGrams(0, { allowZero: true }), 0);
  assert.equal(kgToGrams(-0.1, { allowZero: true }), null);
});

// ---------- domestic: the two amounts are editable ----------
test("domestic: the fixed charge and the per-additional-KG charge are independent and drive the formula", () => {
  assert.equal(calculateDomesticShipping(2, { fixedCharge: 450, additionalPerKg: 100 }).amount, 450);          // only the fixed charge changed
  assert.equal(calculateDomesticShipping(5, { fixedCharge: 450, additionalPerKg: 100 }).amount, 450 + 2 * 100);
  assert.equal(calculateDomesticShipping(2, { fixedCharge: 300, additionalPerKg: 250 }).amount, 300);          // only the additional charge changed
  assert.equal(calculateDomesticShipping(5, { fixedCharge: 300, additionalPerKg: 250 }).amount, 300 + 2 * 250);
  assert.equal(calculateDomesticShipping(3.1, { fixedCharge: 350, additionalPerKg: 120.5 }).amount, 470.5);
  assert.equal(calculateDomesticShipping(4.5, { fixedCharge: 350, additionalPerKg: 120.5 }).amount, 591);      // 350 + 2 x 120.5, exact cents
  assert.equal(calculateDomesticShipping(8, { fixedCharge: 0, additionalPerKg: 100 }).amount, 500);            // a 0 fixed charge is allowed if the other is above 0
});
test("domestic: an invalid stored tariff is refused rather than used", () => {
  for (const t of [{ fixedCharge: -1, additionalPerKg: 100 }, { fixedCharge: 300, additionalPerKg: NaN }, { fixedCharge: "300", additionalPerKg: 100 }, { fixedCharge: 0, additionalPerKg: 0 }, { fixedCharge: 300.123, additionalPerKg: 100 }, null])
    assert.throws(() => calculateDomesticShipping(2, t), RangeError, JSON.stringify(t));
  assert.equal(isValidTariff({ fixedCharge: 300, additionalPerKg: 100 }), true);
  assert.equal(DOMESTIC_TARIFF.fixedUpToKg, 3);
  assert.equal(DOMESTIC_TARIFF.fixedCharge, 300);
  assert.equal(DOMESTIC_TARIFF.additionalPerKg, 100);
});
test("domestic quote uses the SAVED, admin-edited tariff", () => {
  const s = settings({ domestic: { fixedCharge: 420, additionalPerKg: 150, packagingWeightKg: 0 } });
  assert.equal(ship({ items: [item({ quantity: 4 })], s, country: "PK" }).shipping.amount, 420);                // 2 kg
  assert.equal(ship({ items: [item({ quantity: 9 })], s, country: "PK" }).shipping.amount, 420 + 2 * 150);     // 4.5 kg -> 2 extra kg
});

// ---------- international: weight-based formula ----------
test("international: first KG + additional KG, with weights rounded UP to whole kilograms (0.5 -> 1, 2.2 -> 3)", () => {
  const d = dest(); // first 1000, additional 300, flat 7000
  const at = (kg) => calculateInternationalShipping(d, kg);
  assert.equal(at(0.5).amount, 1000);
  assert.equal(at(1).amount, 1000);
  assert.equal(at(1.001).amount, 1300);
  assert.equal(at(2).amount, 1000 + 300);
  assert.equal(at(2.2).amount, 1000 + 2 * 300);      // 2.2 kg is billed as 3 kg
  assert.equal(at(2.2).billableKg, 3);
  assert.equal(at(3).amount, 1000 + 2 * 300);
  assert.equal(at(20).amount, 1000 + 19 * 300);      // exactly 20 kg is still per-kg
  assert.equal(at(20).rule, "per_kg");
});
test("international: over 20 kg the flat rate is the ENTIRE charge, never added to the per-kg amount", () => {
  const d = dest();
  for (const kg of [20.001, 20.5, 21, 25, 50]) {
    const r = calculateInternationalShipping(d, kg);
    assert.equal(r.amount, 7000, `${kg} kg`);
    assert.equal(r.rule, "flat_over_20kg");
  }
  assert.equal(INTERNATIONAL_FLAT_OVER_KG, 20);
  // a flat rate lower than the 20 kg per-kg charge is honoured as configured (no invented minimum or surcharge)
  assert.equal(calculateInternationalShipping(dest({ flatRateOver20Kg: 100 }), 21).amount, 100);
});
test("international: Dubai and the UK are priced from their OWN three independent values", () => {
  const dubai = dest(), gb = uk();
  assert.deepEqual([dubai, gb].map((d) => calculateInternationalShipping(d, 1).amount), [1000, 2500]);
  assert.deepEqual([dubai, gb].map((d) => calculateInternationalShipping(d, 4).amount), [1000 + 3 * 300, 2500 + 3 * 900]);
  assert.deepEqual([dubai, gb].map((d) => calculateInternationalShipping(d, 30).amount), [7000, 20000]);
  // changing one field of one destination changes only that term of that destination
  assert.equal(calculateInternationalShipping(dest({ additionalKgPrice: 301 }), 3).amount, 1000 + 2 * 301);
  assert.equal(calculateInternationalShipping(dest({ firstKgPrice: 1001 }), 1).amount, 1001);
  assert.equal(calculateInternationalShipping(dest({ flatRateOver20Kg: 7001 }), 21).amount, 7001);
  assert.equal(calculateInternationalShipping(dest({ currency: "USD" }), 1).currency, "USD");
});
test("international pricing never reuses the domestic tariff", () => {
  const s = settings({ domestic: { fixedCharge: 999, additionalPerKg: 999 } });
  assert.equal(ship({ items: [item({ quantity: 2 })], s, destinations: [dest()], country: "AE", city: "Dubai" }).shipping.amount, 1000); // 1 kg -> Dubai first-KG price
});
test("international: missing or invalid rate fields are detected and no price is ever produced", () => {
  assert.deepEqual(internationalRateIssues(dest()), []);
  assert.deepEqual(internationalRateIssues(dest({ firstKgPrice: null })), ["firstKgPrice"]);
  assert.deepEqual(internationalRateIssues(dest({ additionalKgPrice: undefined })), ["additionalKgPrice"]);
  assert.deepEqual(internationalRateIssues(dest({ flatRateOver20Kg: NaN })), ["flatRateOver20Kg"]);
  assert.deepEqual(internationalRateIssues(dest({ firstKgPrice: "1000", additionalKgPrice: -1 })), ["firstKgPrice", "additionalKgPrice"]);
  assert.deepEqual(internationalRateIssues(dest({ pricingMethod: "fixed" })), ["pricingMethod"]);
  assert.deepEqual(internationalRateIssues(dest({ currency: "EUR" })), ["currency"]);
  assert.equal(isInternationalRateComplete(dest({ firstKgPrice: null, additionalKgPrice: null, flatRateOver20Kg: null })), false);
  assert.equal(isInternationalRateComplete(dest({ additionalKgPrice: 0 })), true); // 0 is a legitimate admin-entered value
  for (const bad of [{ firstKgPrice: null }, { additionalKgPrice: -5 }, { flatRateOver20Kg: Infinity }, { firstKgPrice: 10.123 }])
    assert.throws(() => calculateInternationalShipping(dest(bad), 1), RangeError, JSON.stringify(bad));
  for (const w of [0, -1, NaN, 1.2345]) assert.throws(() => calculateInternationalShipping(dest(), w), RangeError, String(w));
});

// ---------- international: availability ----------
test("defaults: Dubai and the UK are seeded with NO invented amounts and no estimates; domestic starts at 300 / 100 with free shipping off", () => {
  assert.deepEqual(DEFAULT_DESTINATIONS.map((d) => [d.countryCode, d.city, d.seedVersion]), [["AE", "Dubai", 1], ["GB", "", 2]]);
  for (const d of DEFAULT_DESTINATIONS) {
    assert.deepEqual([d.firstKgPrice, d.additionalKgPrice, d.flatRateOver20Kg], [null, null, null]);
    assert.equal(d.deliveryEstimate, "");
    assert.equal(d.pricingMethod, "weight_based");
    assert.equal(isInternationalRateComplete(d), false); // so neither is offered at checkout until an admin enters real rates
    assert.ok(!("price" in d));
  }
  assert.deepEqual([DEFAULT_DOMESTIC.fixedCharge, DEFAULT_DOMESTIC.additionalPerKg, DEFAULT_DOMESTIC.freeShipping], [300, 100, false]);
  assert.deepEqual({ ...DEFAULT_INTERNATIONAL }, { freeShipping: false, packagingWeightKg: 0 });
});
test("settings saved before this release keep working: missing fields read as safe defaults, saved values are never replaced", () => {
  const old = shapeSettings({ domestic: { enabled: false, name: "Old name", deliveryEstimate: "2-3 days", packagingWeightKg: 0.2 }, pkrPerUsd: 276.87 });
  assert.deepEqual(old.domestic, { enabled: false, freeShipping: false, name: "Old name", deliveryEstimate: "2-3 days", packagingWeightKg: 0.2, fixedCharge: 300, additionalPerKg: 100 });
  assert.deepEqual(old.international, { freeShipping: false, packagingWeightKg: 0 });
  assert.equal(old.pkrPerUsd, 276.87);
  const edited = shapeSettings({ domestic: { fixedCharge: 350, additionalPerKg: 0, freeShipping: true }, international: { freeShipping: true, packagingWeightKg: 0.1 } });
  assert.deepEqual([edited.domestic.fixedCharge, edited.domestic.additionalPerKg, edited.domestic.freeShipping, edited.international.freeShipping], [350, 0, true, true]); // 0 is kept, not replaced by 100
  assert.equal(shapeSettings(null).domestic.fixedCharge, 300);
});
test("destination matching: only configured, enabled places are serviceable; nothing is assumed from a neighbour", () => {
  const list = [dest()];
  assert.ok(findDestination(list, "AE", "Dubai"));
  assert.ok(findDestination(list, "ae", "  DUBAI "));
  assert.equal(findDestination(list, "AE", "Abu Dhabi"), null);
  assert.equal(findDestination(list, "AE", ""), null);
  assert.equal(findDestination(list, "GB", "London"), null);
  assert.equal(findDestination([dest({ enabled: false })], "AE", "Dubai"), null);
  assert.equal(normalizePlace("  Dubaï "), "dubai");
});
test("destination matching: a country-wide entry covers the whole country, a city entry wins for its city", () => {
  const london = uk({ _id: "u2", city: "London", cityKey: "london", displayName: "London, UK", ...rates(1, 1, 1) });
  assert.equal(findDestination([uk()], "GB", "Leeds")._id, "d2");
  assert.equal(findDestination([uk(), london], "GB", "london")._id, "u2");
  assert.equal(findDestination([uk(), london], "GB", "Leeds")._id, "d2");
  assert.equal(findDestination([london], "GB", "Leeds"), null);
});
test("an unconfigured, disabled or INCOMPLETE destination is unavailable: a clear error and never a fabricated price", () => {
  const cases = [
    [[dest({ enabled: false })], "AE", "Dubai"], [[dest()], "AE", "Sharjah"], [[], "GB", "London"], [[dest()], "US", "Austin"],
    [[dest({ firstKgPrice: null })], "AE", "Dubai"], [[dest({ additionalKgPrice: null })], "AE", "Dubai"], [[dest({ flatRateOver20Kg: null })], "AE", "Dubai"],
  ];
  for (const free of [false, true]) for (const [destinations, country, city] of cases) {
    const e = code(() => ship({ s: settings({ international: { freeShipping: free } }), destinations, country, city }));
    assert.equal(e.status, 422);
    assert.equal(e.code, "SHIPPING_UNAVAILABLE", `free=${free} ${JSON.stringify([country, city])}`);
    assert.match(e.message, /International shipping is currently unavailable for/);
  }
  assert.match(code(() => ship({ destinations: [dest()], country: "AE", city: "Sharjah" })).message, /Available in United Arab Emirates: Dubai, UAE/);
  assert.ok(!/Available in/.test(code(() => ship({ destinations: [dest({ firstKgPrice: null })], country: "AE", city: "Sharjah" })).message)); // incomplete ones are not advertised
});
test("an incomplete city rate is not silently replaced by the country-wide rate", () => {
  const ae = dest({ _id: "w", city: "", cityKey: "", displayName: "UAE", ...rates(5, 5, 5) });
  const dubaiIncomplete = dest({ additionalKgPrice: null });
  assert.equal(code(() => ship({ destinations: [ae, dubaiIncomplete], country: "AE", city: "Dubai" })).code, "SHIPPING_UNAVAILABLE");
  assert.equal(ship({ destinations: [ae, dubaiIncomplete], country: "AE", city: "Ajman" }).shipping.amount, 5);
});

// ---------- international quote from a real cart ----------
test("international quote: weights x quantity + international packaging, rounded up to whole kg, priced by THAT destination", () => {
  const s = settings({ international: { packagingWeightKg: 0.3 } });
  const q = ship({ items: [item({ quantity: 5 })], s, destinations: [dest()], country: "AE", city: "Dubai" }); // 2.5 + 0.3 = 2.8 kg -> 3 kg
  assert.equal(q.shipping.amount, 1000 + 2 * 300);
  assert.equal(q.shipping.billableWeightKg, 3);
  assert.equal(q.shipping.courier, "NLS Xpress International");
  assert.equal(q.shipping.destinationName, "Dubai, UAE");
  assert.equal(ship({ items: [item({ quantity: 10 })], destinations: [uk()], country: "GB", city: "Leeds" }).shipping.amount, 2500 + 4 * 900); // 5 kg
});
test("international quote: over 20 kg uses the flat rate", () => {
  const heavy = ship({ items: [item({ quantity: 10 }), item({ size: "L", quantity: 10 })], ps: [product({ weightKg: 1.1 })], destinations: [dest()], country: "AE", city: "Dubai" }); // 22 kg
  assert.equal(heavy.shipping.amount, 7000);
});
test("international quote: a missing product weight is reported, not guessed", () => {
  for (const weightKg of [undefined, null, 0, -1, NaN]) {
    const e = code(() => ship({ ps: [product({ weightKg })], destinations: [dest()], country: "AE", city: "Dubai" }));
    assert.equal(e.code, "SHIPPING_WEIGHT_MISSING", String(weightKg));
  }
});
test("international quote: an invalid stored packaging weight is refused", () => {
  assert.equal(code(() => ship({ s: settings({ international: { packagingWeightKg: -1 } }), destinations: [dest()], country: "AE", city: "Dubai" })).code, "SHIPPING_CONFIG_INVALID");
});

// ---------- Free Shipping ----------
test("domestic Free Shipping: the server computes PKR 0, with or without product weights", () => {
  const s = settings({ domestic: { freeShipping: true } });
  const q = ship({ items: [item({ quantity: 10 })], s, country: "PK", city: "Lahore" });
  assert.equal(q.shipping.amount, 0);
  assert.equal(q.shipping.freeShipping, true);
  assert.equal(q.shipping.currency, "PKR");
  assert.equal(q.total, q.subtotal);                       // total uses a zero shipping charge, even with NO exchange rate configured
  assert.equal(q.shippingInStoreCurrency, 0);
  assert.equal(ship({ ps: [product({ weightKg: undefined })], s, country: "PK" }).shipping.amount, 0);
  assert.equal(ship({ s: settings({ domestic: { freeShipping: false } }), country: "PK" }).shipping.amount, 300); // off = the normal formula again
});
test("international Free Shipping: PKR 0 for an enabled, correctly priced destination only", () => {
  const s = settings({ international: { freeShipping: true } });
  const q = ship({ items: [item({ quantity: 6 })], s, destinations: [dest()], country: "AE", city: "Dubai" });
  assert.deepEqual([q.shipping.amount, q.shipping.freeShipping, q.shipping.currency], [0, true, "PKR"]);
  assert.equal(q.total, q.subtotal);
  assert.equal(q.exchangeRatePkrPerUsd, null);
  assert.equal(ship({ items: [item({ quantity: 6 })], s: settings({ international: { freeShipping: false } }), destinations: [dest()], country: "AE", city: "Dubai" }).shipping.amount, 1000 + 2 * 300);
});
test("Free Shipping switches are independent of each other", () => {
  const domOnly = settings({ domestic: { freeShipping: true } });
  assert.equal(ship({ s: domOnly, country: "PK" }).shipping.amount, 0);
  assert.equal(ship({ s: domOnly, destinations: [dest()], country: "AE", city: "Dubai" }).shipping.amount, 1000);   // international still charged
  const intlOnly = settings({ international: { freeShipping: true } });
  assert.equal(ship({ s: intlOnly, country: "PK" }).shipping.amount, 300);                                          // domestic still charged
  assert.equal(ship({ s: intlOnly, destinations: [dest()], country: "AE", city: "Dubai" }).shipping.amount, 0);
});
test("Free Shipping does not make a disabled domestic service available", () => {
  const e = code(() => ship({ s: settings({ domestic: { enabled: false, freeShipping: true } }), country: "PK" }));
  assert.equal(e.code, "SHIPPING_UNAVAILABLE");
});

// ---------- delivery estimates (still stored and returned by the API; checkout no longer prints them) ----------
test("delivery estimates are returned only when configured, with the admin's wording", () => {
  const dom = (deliveryEstimate) => ship({ s: settings({ domestic: { deliveryEstimate } }), country: "PK", city: "Lahore" }).shipping.deliveryEstimate;
  assert.deepEqual([dom(""), dom("   "), dom(undefined), dom("  2-3 working days ")], [null, null, null, "2-3 working days"]);
  const intl = (deliveryEstimate) => ship({ destinations: [dest({ deliveryEstimate })], country: "AE", city: "Dubai" }).shipping.deliveryEstimate;
  assert.deepEqual([intl(""), intl("4-5 working days")], [null, "4-5 working days"]);
  assert.equal(cleanEstimate(null), null);
});

// ---------- domestic quote from a real cart ----------
test("domestic quote: weights x quantity plus packaging ONCE per parcel", () => {
  const items = [item({ quantity: 2 }), item({ size: "L", quantity: 3 })]; // 5 x 0.5 = 2.5 kg
  const none = ship({ items, country: "PK", city: "Karachi" });
  assert.deepEqual([none.shipping.billableWeightKg, none.shipping.amount], [2.5, 300]);
  const withPack = ship({ items, s: settings({ domestic: { packagingWeightKg: 0.6 } }), country: "PK", city: "Karachi" });
  assert.deepEqual([withPack.shipping.billableWeightKg, withPack.shipping.amount], [3.1, 400]);
  assert.deepEqual([withPack.shipping.scope, withPack.shipping.courier, withPack.shipping.currency], ["domestic", "NLS Xpress Domestic", "PKR"]);
});
test("domestic quote: missing weight reported; disabled service unavailable; invalid stored values refused", () => {
  for (const weightKg of [undefined, null, 0, -1, NaN]) {
    const e = code(() => ship({ ps: [product({ weightKg })], country: "PK" }));
    assert.equal(e.code, "SHIPPING_WEIGHT_MISSING");
    assert.match(e.message, /Khan Tee/);
  }
  assert.equal(code(() => ship({ s: settings({ domestic: { enabled: false } }), country: "PK" })).code, "SHIPPING_UNAVAILABLE");
  assert.equal(code(() => ship({ s: settings({ domestic: { packagingWeightKg: -2 } }), country: "PK" })).code, "SHIPPING_CONFIG_INVALID");
  assert.equal(code(() => ship({ s: settings({ domestic: { fixedCharge: -5 } }), country: "PK" })).code, "SHIPPING_CONFIG_INVALID");
});

// ---------- cart validation against the database ----------
test("cart: prices and weights come from the database; browser-supplied prices are ignored", () => {
  const lines = resolveCartLines([{ ...item({ quantity: 2 }), price: 0.01, unitPrice: 0.01, weightKg: 0.001, shipping: 1 }], catalog(product({ salePrice: 15 })));
  assert.equal(lines[0].unitPriceCents, 1500);
  assert.equal(lines[0].weightGrams, 500);
});
test("cart: unknown / inactive products, hidden categories, unavailable colors or sizes, duplicates and bad quantities are all rejected", () => {
  const bad = (items, ps = [product()]) => code(() => resolveCartLines(items, catalog(...ps)));
  assert.equal(bad([item({ productId: "nope" })]).code, "CART_INVALID");
  assert.equal(bad([item()], [product({ active: false })]).code, "CART_INVALID");
  assert.equal(bad([item()], [product({ category: { active: false } })]).code, "CART_INVALID");
  assert.equal(bad([item({ color: "Pink" })]).code, "CART_INVALID");
  assert.equal(bad([item({ size: "XXL" })]).code, "CART_INVALID");
  assert.equal(bad([item(), item()]).code, "CART_INVALID");
  for (const quantity of [0, -1, 1.5, MAX_LINE_QTY + 1, NaN, "2"]) assert.equal(bad([item({ quantity })]).code, "CART_INVALID", String(quantity));
  assert.equal(bad([item({ productId: "x" }), item({ color: "Pink" })]).details.length, 2);
});

// ---------- totals and currency ----------
test("totals: USD subtotal + PKR shipping are combined ONLY with the admin-configured rate; otherwise no total is invented", () => {
  const items = [item({ quantity: 2 })]; // $40
  const none = ship({ items, country: "PK", city: "Lahore" });
  assert.deepEqual([none.subtotal, none.shipping.amount, none.total, none.shippingInStoreCurrency], [40, 300, null, null]);
  const rated = ship({ items, s: settings({ pkrPerUsd: 300 }), country: "PK", city: "Lahore" });
  assert.deepEqual([rated.shippingInStoreCurrency, rated.total, rated.exchangeRatePkrPerUsd], [1, 41, 300]);
  const odd = ship({ items, s: settings({ pkrPerUsd: 276.87 }), country: "PK", city: "Lahore" });
  assert.equal(odd.shippingInStoreCurrency, 1.09);       // 300 / 276.87 = 1.0836 -> rounded UP to the next cent
  assert.equal(odd.total, 41.09);                        // subtotal + converted shipping, to the cent
  const intl = ship({ items, s: settings({ pkrPerUsd: 280 }), destinations: [dest()], country: "AE", city: "Dubai" }); // PKR 1000 / 280 = 3.5714
  assert.deepEqual([intl.shippingInStoreCurrency, intl.total], [3.58, 43.58]);
});
test("totals: a destination priced in USD needs no conversion; unusable rates give no combined total", () => {
  assert.equal(shippingCentsInStoreCurrency({ amount: 12.5, currency: "USD" }, null), 1250);
  assert.equal(shippingCentsInStoreCurrency({ amount: 0, currency: "PKR" }, null), 0);
  for (const rate of [0, -1, NaN, Infinity, "280"]) assert.equal(shippingCentsInStoreCurrency({ amount: 300, currency: "PKR" }, rate), null, String(rate));
  const q = ship({ destinations: [dest({ currency: "USD", ...rates(25, 5, 100) })], country: "AE", city: "Dubai" });
  assert.deepEqual([q.shipping.amount, q.total], [25, 45]);
});

// ---------- tampering ----------
test("manipulated shipping charges and totals sent by the browser are rejected with the server's figures", () => {
  const q = ship({ items: [item({ quantity: 2 })], s: settings({ pkrPerUsd: 300 }), country: "PK", city: "Lahore" });
  assert.doesNotThrow(() => assertSubmittedMatches(q, undefined));
  assert.doesNotThrow(() => assertSubmittedMatches(q, { shippingAmount: 300, subtotal: 40, total: 41 }));
  for (const bad of [{ shippingAmount: 0 }, { shippingAmount: 1 }, { subtotal: 1 }, { total: 0.01 }, { total: 40 }]) {
    const e = code(() => assertSubmittedMatches(q, bad));
    assert.deepEqual([e.status, e.code], [409, "TOTALS_MISMATCH"], JSON.stringify(bad));
    assert.ok(e.details.every((d) => "expected" in d));
  }
});
test("a browser-claimed zero shipping is only accepted when the server itself says Free Shipping is on", () => {
  const paid = ship({ s: settings({ pkrPerUsd: 300 }), country: "PK" });
  assert.equal(code(() => assertSubmittedMatches(paid, { shippingAmount: 0, total: 20 })).code, "TOTALS_MISMATCH");
  const free = ship({ s: settings({ domestic: { freeShipping: true } }), country: "PK" });
  assert.doesNotThrow(() => assertSubmittedMatches(free, { shippingAmount: 0, total: 20 }));
  assert.equal(code(() => assertSubmittedMatches(free, { shippingAmount: 300 })).code, "TOTALS_MISMATCH");
  const intl = ship({ destinations: [dest()], country: "AE", city: "Dubai" });
  assert.equal(code(() => assertSubmittedMatches(intl, { shippingAmount: 0 })).code, "TOTALS_MISMATCH");
});

// ---------- order snapshot ----------
test("order pricing keeps a frozen snapshot of courier, destination, charge, currency, estimate and free-shipping flag", () => {
  const q = ship({ s: settings({ pkrPerUsd: 280 }), destinations: [dest({ deliveryEstimate: "4-5 working days" })], country: "AE", city: "Dubai" });
  const o = buildOrderPricing(q);
  assert.deepEqual(o.shippingDetails, { scope: "international", courier: "NLS Xpress International", destinationName: "Dubai, UAE", countryCode: "AE", city: "Dubai", pricingMethod: "weight_based", amount: 1000, currency: "PKR", freeShipping: false, deliveryEstimate: "4-5 working days", billableWeightKg: 1, exchangeRatePkrPerUsd: 280 });
  assert.deepEqual([o.currency, o.subtotal, o.shipping, o.total], ["USD", 20, 3.58, 23.58]);
  q.shipping.amount = 1;
  assert.equal(o.shippingDetails.amount, 1000);
  const free = buildOrderPricing(ship({ s: settings({ international: { freeShipping: true } }), destinations: [dest()], country: "AE", city: "Dubai" }));
  assert.deepEqual([free.shippingDetails.amount, free.shippingDetails.freeShipping, free.shipping, free.total], [0, true, 0, 20]);
  assert.equal(code(() => buildOrderPricing(ship({ destinations: [dest()], country: "AE", city: "Dubai" }))).code, "TOTAL_UNAVAILABLE");
});

// ---------- admin input validation (the rules the API enforces) ----------
const goodSettings = () => ({ domestic: { enabled: true, freeShipping: false, name: " NLS Xpress Domestic ", deliveryEstimate: " 2-3 working days ", packagingWeightKg: 0.1, fixedCharge: 300, additionalPerKg: 100 }, pkrPerUsd: 276.87 });
test("settings input: valid values are trimmed and accepted; both tariff amounts are editable", () => {
  const r = parseSettingsInput(goodSettings());
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.value.domestic, { enabled: true, freeShipping: false, name: "NLS Xpress Domestic", deliveryEstimate: "2-3 working days", packagingWeightKg: 0.1, fixedCharge: 300, additionalPerKg: 100 });
  assert.equal(r.value.pkrPerUsd, 276.87);
  const g = goodSettings(); g.domestic.fixedCharge = 350.5; g.domestic.additionalPerKg = 0; g.domestic.freeShipping = true; g.pkrPerUsd = null;
  const e = parseSettingsInput(g);
  assert.deepEqual([e.errors.length, e.value.domestic.fixedCharge, e.value.domestic.additionalPerKg, e.value.domestic.freeShipping, e.value.pkrPerUsd], [0, 350.5, 0, true, null]);
});
test("settings input: bad tariff values get field-specific errors", () => {
  const bad = (patch, extra = {}) => { const g = goodSettings(); Object.assign(g.domestic, patch); Object.assign(g, extra); return parseSettingsInput(g); };
  assert.deepEqual(errPaths(bad({ fixedCharge: -1 })), ["domestic.fixedCharge"]);
  assert.deepEqual(errPaths(bad({ additionalPerKg: -0.01 })), ["domestic.additionalPerKg"]);
  assert.deepEqual(errPaths(bad({ fixedCharge: "PKR 300" })), ["domestic.fixedCharge"]);   // a string with a currency symbol is not a number
  assert.deepEqual(errPaths(bad({ additionalPerKg: "100" })), ["domestic.additionalPerKg"]);
  assert.deepEqual(errPaths(bad({ fixedCharge: NaN })), ["domestic.fixedCharge"]);
  assert.deepEqual(errPaths(bad({ additionalPerKg: Infinity })), ["domestic.additionalPerKg"]);
  assert.deepEqual(errPaths(bad({ fixedCharge: 300.123 })), ["domestic.fixedCharge"]);
  assert.deepEqual(errPaths(bad({ fixedCharge: 10_000_001 })), ["domestic.fixedCharge"]);
  assert.deepEqual(errPaths(bad({ fixedCharge: null })), ["domestic.fixedCharge"]);          // required: blank must not become 0 or a default
  assert.deepEqual(errPaths(bad({ additionalPerKg: undefined })), ["domestic.additionalPerKg"]);
  assert.deepEqual(errPaths(bad({ fixedCharge: 0, additionalPerKg: 0 })), ["domestic.fixedCharge"]);
  assert.deepEqual(errPaths(bad({ name: "  " })), ["domestic.name"]);
  assert.deepEqual(errPaths(bad({ enabled: "yes" })), ["domestic.enabled"]);
  assert.deepEqual(errPaths(bad({ freeShipping: undefined })), ["domestic.freeShipping"]);   // must be explicit: an old client can't silently switch it off
  assert.deepEqual(errPaths(bad({ packagingWeightKg: -1 })), ["domestic.packagingWeightKg"]);
  assert.deepEqual(errPaths(bad({ packagingWeightKg: 0.0001 })), ["domestic.packagingWeightKg"]);
  assert.deepEqual(errPaths(bad({}, { pkrPerUsd: 0 })), ["pkrPerUsd"]);
  assert.deepEqual(errPaths(bad({}, { pkrPerUsd: "280" })), ["pkrPerUsd"]);
  for (const nonObj of [null, undefined, "x", [], 5]) assert.equal(parseSettingsInput(nonObj).value, null);
});
test("international settings input: explicit boolean + packaging weight", () => {
  assert.deepEqual(parseInternationalSettingsInput({ freeShipping: true, packagingWeightKg: 0.25 }).value, { freeShipping: true, packagingWeightKg: 0.25 });
  assert.deepEqual(errPaths(parseInternationalSettingsInput({ packagingWeightKg: 0 })), ["freeShipping"]);
  assert.deepEqual(errPaths(parseInternationalSettingsInput({ freeShipping: "on" })), ["freeShipping"]);
  assert.deepEqual(errPaths(parseInternationalSettingsInput({ freeShipping: false, packagingWeightKg: 21 })), ["packagingWeightKg"]);
});
const goodDest = () => ({ countryCode: "gb", city: "", displayName: "", courier: " NLS Xpress International ", firstKgPrice: 2500, additionalKgPrice: 900, flatRateOver20Kg: 20000, currency: "PKR", deliveryEstimate: "", enabled: true });
test("destination input (create): normalised; rates may be left blank (saved as incomplete, never defaulted)", () => {
  const r = parseDestinationInput(goodDest());
  assert.deepEqual(r.errors, []);
  assert.deepEqual([r.value.countryCode, r.value.courier, r.value.pricingMethod, r.value.firstKgPrice, r.value.additionalKgPrice, r.value.flatRateOver20Kg], ["GB", "NLS Xpress International", "weight_based", 2500, 900, 20000]);
  const blank = parseDestinationInput({ countryCode: "GB", courier: "NLS", firstKgPrice: "", additionalKgPrice: null, flatRateOver20Kg: undefined });
  assert.deepEqual(blank.errors, []);
  assert.deepEqual([blank.value.firstKgPrice, blank.value.additionalKgPrice, blank.value.flatRateOver20Kg, blank.value.currency, blank.value.enabled, blank.value.city], [null, null, null, "PKR", true, ""]);
  assert.equal(isInternationalRateComplete({ ...blank.value }), false);
});
test("destination input: field-specific errors for every invalid value", () => {
  const bad = (patch) => parseDestinationInput({ ...goodDest(), ...patch });
  assert.deepEqual(errPaths(bad({ countryCode: "XX" })), ["countryCode"]);
  assert.deepEqual(errPaths(bad({ countryCode: "" })), ["countryCode"]);
  assert.deepEqual(errPaths(bad({ countryCode: "PK" })), ["countryCode"]);
  assert.deepEqual(errPaths(bad({ courier: "" })), ["courier"]);
  assert.deepEqual(errPaths(bad({ firstKgPrice: -1 })), ["firstKgPrice"]);
  assert.deepEqual(errPaths(bad({ additionalKgPrice: "PKR 900" })), ["additionalKgPrice"]);
  assert.deepEqual(errPaths(bad({ flatRateOver20Kg: NaN })), ["flatRateOver20Kg"]);
  assert.deepEqual(errPaths(bad({ firstKgPrice: 10.005 })), ["firstKgPrice"]);
  assert.deepEqual(errPaths(bad({ firstKgPrice: Infinity, flatRateOver20Kg: -3 })), ["firstKgPrice", "flatRateOver20Kg"]);
  assert.deepEqual(errPaths(bad({ currency: "EUR" })), ["currency"]);
  assert.deepEqual(errPaths(bad({ pricingMethod: "fixed" })), ["pricingMethod"]);
  assert.deepEqual(errPaths(bad({ enabled: "yes" })), ["enabled"]);
  assert.deepEqual(errPaths(bad({ deliveryEstimate: "x".repeat(81) })), ["deliveryEstimate"]);
});
test("destination input (patch): only the fields sent are returned, so nothing else is overwritten", () => {
  assert.deepEqual(parseDestinationInput({ enabled: false }, { partial: true }).value, { enabled: false });
  assert.deepEqual(parseDestinationInput({ additionalKgPrice: 950 }, { partial: true }).value, { additionalKgPrice: 950 });
  assert.deepEqual(parseDestinationInput({ firstKgPrice: null }, { partial: true }).value, { firstKgPrice: null }); // explicit clear
  assert.deepEqual(parseDestinationInput({}, { partial: true }).value, {});
  assert.deepEqual(errPaths(parseDestinationInput({ flatRateOver20Kg: -1, enabled: true }, { partial: true })), ["flatRateOver20Kg"]);
});

// ---------- countries / money ----------
test("country list: all 249 ISO codes, unique, every one has a real name", () => {
  assert.equal(COUNTRY_CODES.length, 249);
  assert.equal(new Set(COUNTRY_CODES).size, 249);
  assert.ok(listCountries().every((c) => c.name && c.name !== c.code));
  assert.deepEqual([countryName("PK"), countryName("AE"), countryName("GB")], ["Pakistan", "United Arab Emirates", "United Kingdom"]);
  for (const bad of ["XX", "ae", "", null, undefined, "UAE", 5]) assert.equal(isCountryCode(bad), false, String(bad));
});
test("isMoneyAmount accepts only finite non-negative numbers with at most 2 decimals", () => {
  for (const ok of [0, 1, 1350, 12.5, 0.01]) assert.equal(isMoneyAmount(ok), true);
  for (const bad of [-1, NaN, Infinity, "5", null, 1.005, 0.001]) assert.equal(isMoneyAmount(bad), false, String(bad));
});

// ---------- permissions ----------
test("shipping permissions: edit implies view; only holders (and the master) pass", () => {
  assert.ok(ALL_PERMISSIONS.includes("shipping.view") && ALL_PERMISSIONS.includes("shipping.edit"));
  assert.deepEqual(normalizePermissions(["shipping.edit"]), ["shipping.view", "shipping.edit"]);
  const staff = (permissions, extra = {}) => ({ _id: "a", role: "admin", active: true, permissions, ...extra });
  assert.equal(hasPermission(staff(["shipping.view"]), "shipping.edit"), false);
  assert.equal(hasPermission(staff(["orders.view", "products.edit"]), "shipping.view"), false);
  assert.equal(hasPermission(staff(["shipping.edit"]), "shipping.edit"), true);
  assert.equal(hasPermission(staff(["shipping.edit"], { active: false }), "shipping.edit"), false);
  assert.equal(hasPermission({ role: "customer", active: true, permissions: ["shipping.edit"] }, "shipping.edit"), false);
  assert.equal(hasPermission(null, "shipping.edit"), false);
  assert.equal(hasPermission({ role: "master_admin", active: true, permissions: [] }, "shipping.edit"), true);
});

// ---------- wiring audits (the Express layer itself needs node_modules, so these read the source) ----------
test("route audit: every admin shipping route demands the right permission on the server; writes need shipping.edit and validation", async () => {
  const src = await read("../src/routes/shippingAdminRoutes.js");
  const routes = src.split("\n").filter((l) => /^\s*r\.(get|post|put|patch|delete)\(/.test(l));
  assert.equal(routes.length, 6);
  for (const line of routes) {
    const isRead = /^\s*r\.get\(/.test(line);
    assert.match(line, isRead ? /requirePermission\("shipping\.view"\)/ : /requirePermission\("shipping\.edit"\)/, line.trim());
    if (!isRead) assert.match(line, /validate\(\{/, `write route without validation: ${line.trim()}`);
  }
  assert.ok(routes.some((l) => /international-settings/.test(l)));
  const admin = await read("../src/routes/adminRoutes.js");
  assert.ok(admin.indexOf("r.use(requireStaff)") < admin.indexOf("mountShippingAdmin(r)"));
});
test("public routes are read-only except the quote, which is validated and rate-limited; the admin validators delegate to the tested parsers", async () => {
  const src = await read("../src/routes/shippingRoutes.js");
  assert.equal((src.match(/\.(post|put|patch|delete)\(/g) || []).length, 1);
  assert.match(src, /checkoutRoutes\.post\("\/quote", limiter\(.*validate\(\{ body: quoteBody \}\)/);
  const v = await read("../src/validators/shippingValidators.js");
  const quoteBlock = v.slice(v.indexOf("export const quoteBody"), v.indexOf("// ---- admin"));
  assert.ok(!/\bprice\b|unitPrice|weightKg|Charge/i.test(quoteBlock.replace(/\/\/.*$/gm, "")), "quote items must not accept price, weight or shipping amounts");
  for (const name of ["shippingSettingsBody", "internationalSettingsBody", "destinationCreateBody", "destinationPatchBody"]) assert.match(v, new RegExp(`export const ${name} = `));
  assert.match(await read("../src/lib/shippingAdminView.js"), /legacyFixedPrice/);
});
test("the public options endpoint lists only enabled, correctly priced destinations and no prices", async () => {
  const c = await read("../src/controllers/shippingController.js");
  assert.match(c, /ShippingDestination\.find\(\{ enabled: true \}\)/);
  assert.match(c, /filter\(isInternationalRateComplete\)/);
  assert.ok(!/firstKgPrice|additionalKgPrice|flatRateOver20Kg|fixedCharge/.test(c.replace(/\/\/.*$/gm, "")));
});
test("no payment gateway or Cash on Delivery was added by the shipping work", async () => {
  const files = ["../src/lib/shippingRules.js", "../src/lib/checkoutQuote.js", "../src/lib/shippingStore.js", "../src/lib/shippingInput.js", "../src/lib/shippingDefaults.js", "../src/controllers/shippingController.js",
    "../src/controllers/adminShippingController.js", "../src/routes/shippingRoutes.js", "../src/routes/shippingAdminRoutes.js", "../src/validators/shippingValidators.js", "../src/models/ShippingSettings.js", "../src/models/ShippingDestination.js"];
  for (const f of files) {
    const code = (await read(f)).replace(/\/\/.*$/gm, "");
    assert.ok(!/easypaisa|jazzcash|payoneer|stripe|paypal|cash on delivery|\bcod\b|mastercard|visa\b/i.test(code), f);
    assert.ok(!/payment\.status\s*=|status:\s*"paid"|paymentStatus/.test(code), `${f} must never mark anything paid`);
  }
});
