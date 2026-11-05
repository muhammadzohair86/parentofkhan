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

// Announcement bar above the storefront header. Existing documents have no `announcement`: the API then serves the defaults (lib/announcement.js).
const announcementSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: true },
    text: { type: String, trim: true, maxlength: 120, default: "FREE DELIVERY ALL OVER PAKISTAN" },
    backgroundColor: { type: String, trim: true, match: /^#[0-9a-f]{6}$/, default: "#151515" },
    textColor: { type: String, trim: true, match: /^#[0-9a-f]{6}$/, default: "#f6f1e7" },
  },
  { _id: false }
);

// Exactly one document can exist: `key` only allows "site" and is unique, so a second
// settings document (and therefore a second "active" hero) cannot be created by accident.
const siteSettingSchema = new mongoose.Schema(
  {
    key: { type: String, enum: ["site"], default: "site", unique: true, immutable: true },
    hero: { type: heroSchema, default: () => ({}) },
  announcement: { type: announcementSchema, default: undefined }, // absent until an admin saves it
  },
  { timestamps: true }
);

export const SiteSetting = mongoose.models.SiteSetting || mongoose.model("SiteSetting", siteSettingSchema);
