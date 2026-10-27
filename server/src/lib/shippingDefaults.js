// Initial shipping configuration. These are SEEDED INTO THE DATABASE once (see lib/shippingStore.js) and are then
// managed from Admin > Shipping; nothing here is read at checkout time except as a fallback for missing domestic fields.
// No shipping AMOUNTS are invented for international destinations: the rate fields start blank, so a destination is
// "incomplete" (and not offered at checkout) until an admin enters its real rates. No delivery estimates are invented either.
export const DEFAULT_DOMESTIC = Object.freeze({
  enabled: true,
  freeShipping: false,
  name: "NLS Xpress Domestic",
  deliveryEstimate: "",
  packagingWeightKg: 0, // no packaging weight is assumed; set it in Admin > Shipping once you have measured it
  fixedCharge: 300,     // the NLS Xpress domestic tariff you gave (initial values; editable in Admin > Shipping)
  additionalPerKg: 100,
});
export const DEFAULT_INTERNATIONAL = Object.freeze({ freeShipping: false, packagingWeightKg: 0 });

// Destinations you have rate information for. `seedVersion` says which release introduced them, so an existing database
// only gets the NEW ones added (once), and a destination an admin deleted is never put back.
const blankRates = { pricingMethod: "weight_based", firstKgPrice: null, additionalKgPrice: null, flatRateOver20Kg: null, currency: "PKR", deliveryEstimate: "", enabled: true };
export const DEFAULT_DESTINATIONS = Object.freeze([
  Object.freeze({ seedVersion: 1, countryCode: "AE", city: "Dubai", displayName: "Dubai, UAE", courier: "NLS Xpress International", ...blankRates }),
  Object.freeze({ seedVersion: 2, countryCode: "GB", city: "", displayName: "United Kingdom (UK)", courier: "NLS Xpress International", ...blankRates }),
]);
