import mongoose from "mongoose";

// Exactly one document (`key` only allows "shipping" and is unique), like SiteSetting.
// The domestic TARIFF is not stored here on purpose (see DOMESTIC_TARIFF in lib/shippingRules.js).
const shippingSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, enum: ["shipping"], default: "shipping", unique: true, immutable: true },
    domestic: {
      enabled: { type: Boolean, default: true },
      name: { type: String, trim: true, maxlength: 80, default: "NLS Xpress Domestic" },
      deliveryEstimate: { type: String, trim: true, maxlength: 80, default: "" }, // optional free text, shown exactly as written
      packagingWeightKg: { type: Number, min: 0, max: 20, default: 0, validate: { validator: Number.isFinite, message: "Packaging weight must be a number." } },
      freeShipping: { type: Boolean, default: false }, // domestic orders ship for PKR 0 (computed by the server, never trusted from the browser)
      // The two editable tariff amounts. Records saved before these existed simply lack them and fall back to 300 / 100 when read.
      fixedCharge: { type: Number, min: 0, validate: { validator: (v) => v == null || (Number.isFinite(v) && Math.abs(v * 100 - Math.round(v * 100)) < 1e-6), message: "Must be a valid amount." } },
      additionalPerKg: { type: Number, min: 0, validate: { validator: (v) => v == null || (Number.isFinite(v) && Math.abs(v * 100 - Math.round(v * 100)) < 1e-6), message: "Must be a valid amount." } },
    },
    // International settings are independent of the domestic ones.
    international: {
      freeShipping: { type: Boolean, default: false }, // applies only to destinations that are enabled AND correctly priced
      packagingWeightKg: { type: Number, min: 0, max: 20, default: 0, validate: { validator: Number.isFinite, message: "Packaging weight must be a number." } },
    },
    // Product prices are USD and shipping is PKR. This admin-entered rate is the only way the two are ever combined into one total.
    pkrPerUsd: { type: Number, default: null, validate: { validator: (v) => v == null || (Number.isFinite(v) && v > 0), message: "The rate must be greater than 0." } },
    internationalSeeded: { type: Boolean, default: false }, // the default Dubai record is created once; deleting it later sticks
    ratesModelMigrated: { type: Boolean, default: false },  // one-time move from fixed international prices to weight-based rates (adds the UK record)
  },
  { timestamps: true }
);

export const ShippingSettings = mongoose.models.ShippingSettings || mongoose.model("ShippingSettings", shippingSettingsSchema);
