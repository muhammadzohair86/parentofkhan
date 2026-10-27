import { slugify, nextFreeSlug } from "./slug.js";
import { escapeRegex } from "./escapeRegex.js";
import { ApiError } from "../utils/ApiError.js";

// Next free slug for a model (Product/Category): "tee", "tee-2", "tee-3"...
export async function generateSlug(Model, name, fallback, excludeId) {
  const base = slugify(name) || fallback;
  const rows = await Model.find({ slug: new RegExp(`^${escapeRegex(base)}(-\\d+)?$`), ...(excludeId ? { _id: { $ne: excludeId } } : {}) }).select("slug").lean();
  return nextFreeSlug(base, rows.map((r) => r.slug));
}

export async function assertSlugFree(Model, slug, excludeId) {
  if (await Model.exists({ slug, ...(excludeId ? { _id: { $ne: excludeId } } : {}) })) {
    throw new ApiError(409, "SLUG_TAKEN", "That URL name (slug) is already in use. Choose another.");
  }
  return slug;
}

export const isDuplicateKey = (e) => e?.code === 11000;
