import { DEFAULT_DOMESTIC, DEFAULT_INTERNATIONAL } from "./shippingDefaults.js";

// Settings as the rest of the app sees them: stored values layered over safe defaults (never throws on an empty database).
export function shapeSettings(doc) {
  const d = doc?.domestic || {};
  const i = doc?.international || {};
  return {
    domestic: {
      enabled: d.enabled ?? DEFAULT_DOMESTIC.enabled,
      freeShipping: d.freeShipping ?? false,
      name: d.name || DEFAULT_DOMESTIC.name,
      deliveryEstimate: d.deliveryEstimate || "",
      packagingWeightKg: d.packagingWeightKg ?? DEFAULT_DOMESTIC.packagingWeightKg,
      // Settings saved before the tariff became editable have no amounts: they read as the original 300 / 100 (nothing is overwritten).
      fixedCharge: d.fixedCharge ?? DEFAULT_DOMESTIC.fixedCharge,
      additionalPerKg: d.additionalPerKg ?? DEFAULT_DOMESTIC.additionalPerKg,
    },
    international: { freeShipping: i.freeShipping ?? DEFAULT_INTERNATIONAL.freeShipping, packagingWeightKg: i.packagingWeightKg ?? DEFAULT_INTERNATIONAL.packagingWeightKg },
    pkrPerUsd: doc?.pkrPerUsd ?? null,
    updatedAt: doc?.updatedAt || null,
  };
}
