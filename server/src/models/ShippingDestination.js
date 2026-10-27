import mongoose from "mongoose";
import { normalizePlace, SUPPORTED_SHIPPING_CURRENCIES, PRICING_METHODS, isMoneyAmount } from "../lib/shippingRules.js";

// null = "not entered yet" (the destination is incomplete and not offered at checkout). Never defaulted to an invented amount.
const rate = () => ({ type: Number, default: null, validate: { validator: (v) => v == null || isMoneyAmount(v), message: "Must be a valid amount with at most 2 decimals." } });

// One serviceable international destination: a country, optionally narrowed to a city/area (e.g. Dubai within the UAE).
// A destination that is not in this collection (or is disabled) is NOT serviceable and never gets a price.
const destinationSchema = new mongoose.Schema(
  {
    countryCode: { type: String, required: true, uppercase: true, trim: true, match: /^[A-Z]{2}$/ },
    countryName: { type: String, required: true, trim: true },
    city: { type: String, trim: true, maxlength: 80, default: "" },   // "" = the whole country
    cityKey: { type: String, default: "" },                            // normalized city, set on save; part of the unique key
    displayName: { type: String, required: true, trim: true, maxlength: 80 },
    courier: { type: String, required: true, trim: true, maxlength: 80, default: "NLS Xpress International" },
    pricingMethod: { type: String, enum: Object.keys(PRICING_METHODS), default: "weight_based" },
    firstKgPrice: rate(),        // charge for the first billable kilogram
    additionalKgPrice: rate(),   // charge for each further billable kilogram
    flatRateOver20Kg: rate(),    // the WHOLE charge for a shipment heavier than 20 kg
    price: { type: Number, default: null },  // DEPRECATED: the old fixed per-shipment price. Kept untouched for reference, no longer used.
    currency: { type: String, enum: SUPPORTED_SHIPPING_CURRENCIES, default: "PKR" },
    deliveryEstimate: { type: String, trim: true, maxlength: 80, default: "" },
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true }
);

destinationSchema.pre("validate", function () { this.cityKey = normalizePlace(this.city); });
// One configuration per country+city (enabled or not): two entries for the same place would make the price ambiguous.
destinationSchema.index({ countryCode: 1, cityKey: 1 }, { unique: true });

export const ShippingDestination = mongoose.models.ShippingDestination || mongoose.model("ShippingDestination", destinationSchema);
