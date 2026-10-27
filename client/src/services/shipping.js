// Shipping + checkout pricing. Every number shown to the customer comes from the server; nothing is calculated here.
import { apiGet, apiPost } from "./api.js";

let countries = null;
// [{ code, name }] — one list for every country picker. Fetched once; a failed fetch is retried next time.
export function getCountries() {
  countries ??= apiGet("/shipping/countries").then((r) => r.data).catch((e) => { countries = null; throw e; });
  return countries;
}

// What checkout may offer RIGHT NOW, straight from the admin configuration:
// { domestic: { enabled, name, countryCode, countryName }, international: [{ id, countryCode, countryName, city, displayName, courier }] }
// (only enabled, correctly priced destinations are listed; no prices).
export async function getShippingOptions() {
  const { data } = await apiGet("/shipping/options");
  return data;
}

// Prices the cart and shipping on the server. `lines` are cart lines ({ productId, color, size, qty }); only WHAT and WHERE are sent,
// never prices or totals. Throws ApiError (422 SHIPPING_UNAVAILABLE / SHIPPING_WEIGHT_MISSING / CART_INVALID, ...).
// `signal` lets the caller cancel a request that a newer one has made obsolete.
export async function quoteCheckout(lines, { country, city }, signal) {
  const { data } = await apiPost("/checkout/quote", {
    items: lines.map((l) => ({ productId: l.productId, color: l.color, size: l.size, quantity: l.qty })),
    destination: { country, city: city || "" },
  }, signal);
  return data;
}
