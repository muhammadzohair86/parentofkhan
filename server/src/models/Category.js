import mongoose from "mongoose";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, match: SLUG, maxlength: 100 },
    description: { type: String, trim: true, maxlength: 300, default: "" },
    image: { type: String, trim: true, default: null },
    active: { type: Boolean, default: true, index: true },
    showOnHomepage: { type: Boolean, default: true },
    showInNavbar: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
    isDemo: { type: Boolean, default: false }, // true only for seeded demo records
  },
  { timestamps: true }
);

categorySchema.index({ active: 1, order: 1 });

export const Category = mongoose.models.Category || mongoose.model("Category", categorySchema);
