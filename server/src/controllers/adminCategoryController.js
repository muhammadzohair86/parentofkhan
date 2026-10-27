import { Category } from "../models/Category.js";
import { Product } from "../models/Product.js";
import { generateSlug, assertSlugFree, isDuplicateKey } from "../lib/slugDb.js";
import { ApiError } from "../utils/ApiError.js";
import { releaseImages } from "../lib/media.js";

const shape = (c, count) => ({
  id: String(c._id), name: c.name, slug: c.slug, description: c.description || "", image: c.image || null,
  active: !!c.active, showOnHomepage: !!c.showOnHomepage, showInNavbar: !!c.showInNavbar, order: c.order ?? 0, isDemo: !!c.isDemo,
  ...(count !== undefined ? { productCount: count } : {}),
});

export async function listCategories(_req, res) {
  const [cats, counts] = await Promise.all([
    Category.find({}).sort({ order: 1, name: 1 }).lean(),
    Product.aggregate([{ $group: { _id: "$category", n: { $sum: 1 } } }]),
  ]);
  const byId = new Map(counts.map((c) => [String(c._id), c.n]));
  res.set("Cache-Control", "no-store");
  res.json({ success: true, data: cats.map((c) => shape(c, byId.get(String(c._id)) || 0)) });
}

// Minimal list for dropdowns (product form, filters).
export async function categoryOptions(_req, res) {
  const cats = await Category.find({}).sort({ order: 1, name: 1 }).select("name slug active").lean();
  res.json({ success: true, data: cats.map((c) => ({ id: String(c._id), name: c.name, slug: c.slug, active: !!c.active })) });
}

export async function createCategory(req, res) {
  const d = req.validated.body;
  const slug = d.slug ? await assertSlugFree(Category, d.slug) : await generateSlug(Category, d.name, "category");
  try {
    const doc = await Category.create({ ...d, slug, image: d.image ?? null, isDemo: false });
    res.status(201).json({ success: true, data: shape(doc.toObject(), 0) });
  } catch (e) {
    if (isDuplicateKey(e)) throw new ApiError(409, "SLUG_TAKEN", "That URL name (slug) is already in use. Choose another.");
    throw e;
  }
}

export async function updateCategory(req, res) {
  const { id } = req.validated.params;
  const d = req.validated.body;
  const doc = await Category.findById(id);
  if (!doc) throw new ApiError(404, "CATEGORY_NOT_FOUND", "Category not found.");
  if (d.slug && d.slug !== doc.slug) await assertSlugFree(Category, d.slug, id);
  const oldImage = doc.image;
  for (const [k, v] of Object.entries(d)) doc.set(k, v);
  try { await doc.save(); } catch (e) {
    if (isDuplicateKey(e)) throw new ApiError(409, "SLUG_TAKEN", "That URL name (slug) is already in use. Choose another.");
    throw e;
  }
  if (oldImage && oldImage !== doc.image) await releaseImages([oldImage]);
  res.json({ success: true, data: shape(doc.toObject(), await Product.countDocuments({ category: id })) });
}

// A category that still has products is never deleted silently: either move them (reassignTo) or deactivate instead.
export async function deleteCategory(req, res) {
  const { id } = req.validated.params;
  const { reassignTo } = req.validated.query;
  const doc = await Category.findById(id).lean();
  if (!doc) throw new ApiError(404, "CATEGORY_NOT_FOUND", "Category not found.");
  const count = await Product.countDocuments({ category: id });
  if (count > 0) {
    if (!reassignTo) throw new ApiError(409, "CATEGORY_HAS_PRODUCTS", `This category has ${count} product${count === 1 ? "" : "s"}. Move them to another category first, or deactivate the category instead.`, { productCount: count });
    if (reassignTo === id || !(await Category.exists({ _id: reassignTo }))) throw new ApiError(400, "INVALID_CATEGORY", "Choose a different, existing category to move the products to.");
    await Product.updateMany({ category: id }, { $set: { category: reassignTo } }); // category only: prices and effectivePrice are untouched
  }
  await Category.deleteOne({ _id: id });
  await releaseImages([doc.image]);
  res.json({ success: true, data: { moved: count } });
}
