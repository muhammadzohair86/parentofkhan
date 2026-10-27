import { Product } from "../models/Product.js";
import { Category } from "../models/Category.js";
import { escapeRegex } from "../lib/escapeRegex.js";
import { generateSlug, assertSlugFree, isDuplicateKey } from "../lib/slugDb.js";
import { ApiError } from "../utils/ApiError.js";
import { releaseImages, productImageUrls } from "../lib/media.js";

const SORTS = {
  updated: { updatedAt: -1, _id: -1 }, created: { createdAt: -1, _id: -1 }, name: { name: 1, _id: 1 },
  price: { effectivePrice: 1, _id: 1 }, "price-desc": { effectivePrice: -1, _id: 1 }, order: { sortOrder: 1, createdAt: -1, _id: 1 },
};

const detail = (p) => ({
  id: String(p._id), name: p.name, slug: p.slug, description: p.description || "", price: p.price, salePrice: p.salePrice ?? null, effectivePrice: p.effectivePrice, weightKg: p.weightKg ?? null,
  category: p.category ? String(p.category._id ?? p.category) : "", frontImage: p.frontImage || null, backImage: p.backImage || null, galleryImages: p.galleryImages || [],
  variants: (p.variants || []).map((v) => ({ color: v.color, hex: v.hex, sku: v.sku || "", available: v.available !== false, sizes: (v.sizes || []).map((s) => ({ size: s.size, stock: s.stock ?? 0 })), images: v.images || [] })),
  featured: !!p.featured, active: !!p.active, sortOrder: p.sortOrder ?? 0, tags: p.tags || [], seoTitle: p.seoTitle || "", seoDescription: p.seoDescription || "", isDemo: !!p.isDemo,
  createdAt: p.createdAt, updatedAt: p.updatedAt,
});

const row = (p) => ({
  id: String(p._id), name: p.name, slug: p.slug, price: p.price, salePrice: p.salePrice ?? null, effectivePrice: p.effectivePrice,
  active: !!p.active, featured: !!p.featured, sortOrder: p.sortOrder ?? 0, isDemo: !!p.isDemo,
  category: p.category ? { id: String(p.category._id), name: p.category.name } : null,
  image: p.frontImage || p.variants?.[0]?.images?.[0] || null,
  colors: (p.variants || []).map((v) => ({ color: v.color, hex: v.hex })), updatedAt: p.updatedAt,
});

async function assertCategory(id) {
  if (!(await Category.exists({ _id: id }))) throw new ApiError(400, "INVALID_CATEGORY", "Choose an existing category.");
}

export async function listProducts(req, res) {
  const { q, category, active, featured, sort, page, limit } = req.validated.query;
  const filter = {};
  if (q) { const rx = new RegExp(escapeRegex(q), "i"); filter.$or = [{ name: rx }, { slug: rx }, { tags: rx }]; }
  if (category) filter.category = category;
  if (active !== undefined) filter.active = active;
  if (featured !== undefined) filter.featured = featured;
  const [items, total] = await Promise.all([
    Product.find(filter).sort(SORTS[sort]).skip((page - 1) * limit).limit(limit).populate("category", "name").lean(),
    Product.countDocuments(filter),
  ]);
  res.set("Cache-Control", "no-store");
  res.json({ success: true, data: items.map(row), meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } });
}

export async function getProduct(req, res) {
  const p = await Product.findById(req.validated.params.id).lean();
  if (!p) throw new ApiError(404, "PRODUCT_NOT_FOUND", "Product not found.");
  res.set("Cache-Control", "no-store");
  res.json({ success: true, data: detail(p) });
}

export async function createProduct(req, res) {
  const d = req.validated.body;
  await assertCategory(d.category);
  const slug = d.slug ? await assertSlugFree(Product, d.slug) : await generateSlug(Product, d.name, "product");
  try {
    // save() (not insertMany/update) so the model's validation hook keeps effectivePrice correct for price sorting.
    const doc = new Product({ ...d, slug, salePrice: d.salePrice ?? null, isDemo: false });
    await doc.save();
    res.status(201).json({ success: true, data: detail(doc.toObject()) });
  } catch (e) {
    if (isDuplicateKey(e)) throw new ApiError(409, "SLUG_TAKEN", "That URL name (slug) is already in use. Choose another.");
    throw e;
  }
}

export async function updateProduct(req, res) {
  const { id } = req.validated.params;
  const d = req.validated.body; // partial: only the fields that were sent
  const doc = await Product.findById(id);
  if (!doc) throw new ApiError(404, "PRODUCT_NOT_FOUND", "Product not found.");
  if (d.category) await assertCategory(d.category);
  if (d.slug && d.slug !== doc.slug) await assertSlugFree(Product, d.slug, id);
  const before = productImageUrls(doc.toObject());
  for (const [k, v] of Object.entries(d)) doc.set(k, v);
  try {
    await doc.save(); // runs validators + recomputes effectivePrice
  } catch (e) {
    if (isDuplicateKey(e)) throw new ApiError(409, "SLUG_TAKEN", "That URL name (slug) is already in use. Choose another.");
    throw e;
  }
  await releaseImages(before); // images this edit dropped are deleted only if nothing else still uses them
  res.json({ success: true, data: detail(doc.toObject()) });
}

export async function deleteProduct(req, res) {
  const doc = await Product.findByIdAndDelete(req.validated.params.id).lean();
  if (!doc) throw new ApiError(404, "PRODUCT_NOT_FOUND", "Product not found.");
  await releaseImages(productImageUrls(doc));
  res.json({ success: true, data: null });
}
