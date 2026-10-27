import mongoose from "mongoose";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const isMoney = (v) => v == null || (v >= 0 && Math.abs(v * 100 - Math.round(v * 100)) < 1e-6);

// One size within a color. `stock` is informational only: products are printed on demand,
// so stock (including 0) never hides a product or blocks a sale.
const sizeSchema = new mongoose.Schema(
  { size: { type: String, required: true, trim: true, maxlength: 10 }, stock: { type: Number, default: 0, min: 0, validate: Number.isInteger } },
  { _id: false }
);

const variantSchema = new mongoose.Schema(
  {
    color: { type: String, required: true, trim: true, maxlength: 40 },
    hex: { type: String, required: true, match: HEX },
    sku: { type: String, trim: true, maxlength: 60 },
    sizes: {
      type: [sizeSchema],
      validate: [
        { validator: (a) => a.length > 0, message: "A variant needs at least one size." },
        { validator: (a) => new Set(a.map((s) => s.size.toLowerCase())).size === a.length, message: "Duplicate sizes in a variant." },
      ],
    },
    // images[0] = front, images[1] = back, then any extras (gallery for this color).
    images: { type: [String], default: [] },
    // Explicit production availability. Only false hides this color; stock never does.
    available: { type: Boolean, default: true },
  },
  { _id: false }
);

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, match: SLUG, maxlength: 140 },
    description: { type: String, trim: true, maxlength: 4000, default: "" },
    price: { type: Number, required: true, validate: { validator: isMoney, message: "Price must be a non-negative USD amount with at most 2 decimals." } },
    salePrice: {
      type: Number, default: null,
      validate: [
        { validator: isMoney, message: "Sale price must be a non-negative USD amount with at most 2 decimals." },
        { validator(v) { return v == null || v < this.price; }, message: "Sale price must be lower than the base price." },
      ],
    },
    effectivePrice: { type: Number, index: true }, // salePrice ?? price; kept for price sorting (set on save)
    category: { type: mongoose.Schema.Types.ObjectId, ref: "Category", required: true },
    frontImage: { type: String, trim: true, default: null },
    backImage: { type: String, trim: true, default: null },
    galleryImages: { type: [String], default: [] },
    variants: {
      type: [variantSchema],
      validate: [
        { validator: (a) => a.length > 0, message: "A product needs at least one color variant." },
        { validator: (a) => new Set(a.map((v) => v.color.toLowerCase())).size === a.length, message: "Duplicate colors on a product." },
      ],
    },
    // Packed parcel weight of ONE unit in kilograms (garment + its own bag/tag), used for domestic shipping.
    // null = not configured yet; checkout then refuses a domestic quote for the product instead of guessing a weight.
    weightKg: { type: Number, default: null, validate: { validator: (v) => v == null || (Number.isFinite(v) && v > 0 && v <= 50 && Math.abs(v * 1000 - Math.round(v * 1000)) < 1e-6), message: "Weight must be above 0 kg (at most 50) with at most 3 decimals." } },
    featured: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    tags: { type: [{ type: String, lowercase: true, trim: true, maxlength: 40 }], default: [] },
    seoTitle: { type: String, trim: true, maxlength: 70 },
    seoDescription: { type: String, trim: true, maxlength: 160 },
    isDemo: { type: Boolean, default: false }, // true only for seeded demo records
  },
  { timestamps: true }
);

// NOTE: effectivePrice is recomputed on save()/create(). Admin updates (later phase) must use save(),
// or recompute effectivePrice themselves, so price sorting stays correct.
productSchema.pre("validate", async function () {
  this.effectivePrice = this.salePrice ?? this.price;
});

productSchema.index({ active: 1, featured: 1, sortOrder: 1, createdAt: -1 });
productSchema.index({ category: 1, active: 1 });
productSchema.index({ active: 1, effectivePrice: 1 });
productSchema.index({ tags: 1 });

export const Product = mongoose.models.Product || mongoose.model("Product", productSchema);
