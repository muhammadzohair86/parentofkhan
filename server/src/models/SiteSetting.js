import mongoose from "mongoose";
import { optionalImageUrl } from "../lib/imageUrl.js";

const img = { type: String, trim: true, default: null, set: (v) => v || null, validate: optionalImageUrl };

const heroSchema = new mongoose.Schema(
  {
    desktopImage: img,
    mobileImage: img, // optional; shown below the md breakpoint
    alt: { type: String, trim: true, maxlength: 200, default: "" },
    active: { type: Boolean, default: true }, // false -> storefront uses the built-in default hero
  },
  { _id: false }
);

// Exactly one document can exist: `key` only allows "site" and is unique, so a second
// settings document (and therefore a second "active" hero) cannot be created by accident.
const siteSettingSchema = new mongoose.Schema(
  {
    key: { type: String, enum: ["site"], default: "site", unique: true, immutable: true },
    hero: { type: heroSchema, default: () => ({}) },
  },
  { timestamps: true }
);

export const SiteSetting = mongoose.models.SiteSetting || mongoose.model("SiteSetting", siteSettingSchema);
