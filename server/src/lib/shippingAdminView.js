// How the admin API presents shipping data. Pure (no database), so the controller and the tests share exactly one implementation.
import { DOMESTIC_TARIFF, INTERNATIONAL_FLAT_OVER_KG, PRICING_METHODS, SUPPORTED_SHIPPING_CURRENCIES, STORE_CURRENCY, calculateDomesticShipping, internationalRateIssues, isValidTariff } from "./shippingRules.js";

export const shape = (d) => {
  const rateIssues = internationalRateIssues(d); // which rate fields are missing/invalid; non-empty => NOT offered at checkout
  return {
    id: String(d._id), countryCode: d.countryCode, countryName: d.countryName, city: d.city || "", displayName: d.displayName, courier: d.courier,
    pricingMethod: d.pricingMethod, firstKgPrice: d.firstKgPrice ?? null, additionalKgPrice: d.additionalKgPrice ?? null, flatRateOver20Kg: d.flatRateOver20Kg ?? null,
    currency: d.currency, deliveryEstimate: d.deliveryEstimate || "", enabled: !!d.enabled, rateIssues, complete: rateIssues.length === 0,
    legacyFixedPrice: d.price ?? null, // the previous fixed per-shipment price (reference only, no longer used)
    updatedAt: d.updatedAt,
  };
};

// Worked examples come from the SAME function checkout uses, from the SAVED tariff, so the admin screen can never disagree with it.
const examples = (tariff) => (isValidTariff(tariff) ? [0.5, 1, 3, 3.1, 4, 4.5, 6].map((kg) => ({ kg, charge: calculateDomesticShipping(kg, tariff).amount })) : []);

export function buildSnapshot(settings, dests) {
  const tariff = { currency: DOMESTIC_TARIFF.currency, fixedUpToKg: DOMESTIC_TARIFF.fixedUpToKg, fixedCharge: settings.domestic.fixedCharge, additionalPerKg: settings.domestic.additionalPerKg };
  return {
    domestic: settings.domestic, international: settings.international, pkrPerUsd: settings.pkrPerUsd, updatedAt: settings.updatedAt,
    tariff, tariffExamples: examples(tariff), internationalRule: { flatOverKg: INTERNATIONAL_FLAT_OVER_KG },
    pricingMethods: Object.entries(PRICING_METHODS).map(([value, m]) => ({ value, label: m.label })),
    currencies: SUPPORTED_SHIPPING_CURRENCIES, storeCurrency: STORE_CURRENCY,
    destinations: dests.map(shape),
  };
}
