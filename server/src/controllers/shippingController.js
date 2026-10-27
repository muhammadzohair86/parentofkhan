import { ShippingDestination } from "../models/ShippingDestination.js";
import { getShippingSettings, quoteCheckout } from "../lib/shippingStore.js";
import { listCountries, countryName } from "../lib/countries.js";
import { DOMESTIC_COUNTRY } from "../lib/shippingRules.js";
import { isInternationalRateComplete } from "../lib/shippingRules.js";

// Public, read-only. Prices are not listed here: a customer only ever gets a price from the quote for THEIR cart + destination.

// GET /api/shipping/countries -> [{ code, name }] (one searchable list used by the storefront and the admin form)
export async function getCountries(_req, res) {
  res.set("Cache-Control", "public, max-age=86400");
  res.json({ success: true, data: listCountries() });
}

// GET /api/shipping/options -> what can currently be shipped where. This is the checkout's ONLY source of destinations:
// the domestic service (when enabled) plus the international destinations that are enabled AND correctly priced.
// Anything an admin disabled, deleted, or hasn't finished pricing is simply absent. No prices, estimates or rates are listed.
export async function getOptions(_req, res) {
  const [settings, dests] = await Promise.all([getShippingSettings(), ShippingDestination.find({ enabled: true }).sort({ countryName: 1, displayName: 1 }).lean()]);
  res.set("Cache-Control", "no-store");
  res.json({
    success: true,
    data: {
      domestic: { enabled: settings.domestic.enabled, name: settings.domestic.name, countryCode: DOMESTIC_COUNTRY, countryName: countryName(DOMESTIC_COUNTRY) },
      international: dests.filter(isInternationalRateComplete).map((d) => ({ id: String(d._id), countryCode: d.countryCode, countryName: d.countryName, city: d.city || "", displayName: d.displayName, courier: d.courier })),
    },
  });
}

// POST /api/checkout/quote { items:[{productId,color,size,quantity}], destination:{country,city}, submitted? }
// The server prices the cart from the database and calculates shipping itself. Browser-supplied amounts are only compared.
export async function quote(req, res) {
  const { items, destination, submitted } = req.validated.body;
  const data = await quoteCheckout({ items, destination, submitted });
  res.set("Cache-Control", "no-store");
  res.json({ success: true, data });
}
