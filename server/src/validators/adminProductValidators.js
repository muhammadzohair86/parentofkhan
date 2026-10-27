import { z } from "zod";
import { isImageUrl } from "../lib/imageUrl.js";
import { findProductProblems } from "../lib/productRules.js";
import { boolString } from "./common.js";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid id.");
const money = z.number({ invalid_type_error: "Enter a number." }).min(0).max(1_000_000).refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, "At most 2 decimal places.");
// Packed weight of ONE unit in kg (used for domestic shipping). At most 3 decimals = whole grams.
const weightKg = z.number({ invalid_type_error: "Enter a number." }).positive("Must be above 0.").max(50, "That is more than 50 kg.").refine((v) => Math.abs(v * 1000 - Math.round(v * 1000)) < 1e-6, "At most 3 decimal places.");
const img = z.string().trim().refine(isImageUrl, "Use an uploaded image or an https:// / site-relative image path.");
const optImg = z.preprocess((v) => (v === "" ? null : v), img.nullable().optional());
const hex = z.string().trim().regex(/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i, "Use a hex color such as #151515.");
const slugField = z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().toLowerCase().max(140).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Letters, numbers and single hyphens only.").optional());

const size = z.object({ size: z.string().trim().min(1, "Enter a size.").max(10), stock: z.coerce.number().int().min(0).max(1_000_000).default(0) });
const variant = z.object({
  color: z.string().trim().min(1, "Enter a color name.").max(40),
  hex,
  sku: z.string().trim().max(60).default(""),
  available: z.boolean().default(true),
  sizes: z.array(size).min(1, "Add at least one size.").max(20),
  images: z.array(img).max(12).default([]), // [front, back, ...extras]
});

// Only these keys are ever read from the request (everything else, e.g. isDemo or effectivePrice, is dropped).
const shape = z.object({
  name: z.string().trim().min(1, "Enter a product name.").max(120),
  slug: slugField,
  description: z.string().trim().max(4000).default(""),
  price: money,
  salePrice: money.nullable().optional(),
  weightKg: weightKg.nullable().optional(), // null/absent = not configured (domestic shipping can't be quoted for it)
  category: objectId,
  frontImage: optImg,
  backImage: optImg,
  galleryImages: z.array(img).max(12).default([]),
  variants: z.array(variant).min(1, "Add at least one color.").max(12),
  featured: z.boolean().default(false),
  active: z.boolean().default(true),
  sortOrder: z.number().int().min(-100000).max(100000).default(0),
  tags: z.array(z.string().trim().toLowerCase().min(1).max(40)).max(20).default([]),
  seoTitle: z.string().trim().max(70).default(""),
  seoDescription: z.string().trim().max(160).default(""),
});

const rules = (d, ctx) => findProductProblems(d).forEach((p) => ctx.addIssue({ code: "custom", path: p.path, message: p.message }));
export const productCreateBody = shape.superRefine(rules);
export const productPatchBody = shape.partial().superRefine(rules); // absent fields are left untouched

export const listAdminProductsQuery = z.object({
  q: z.string().trim().max(100).optional(),
  category: objectId.optional(),
  active: boolString.optional(),
  featured: boolString.optional(),
  sort: z.enum(["updated", "created", "name", "price", "price-desc", "order"]).default("updated"),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
