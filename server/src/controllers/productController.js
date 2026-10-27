import { Product } from "../models/Product.js";
import { Category } from "../models/Category.js";
import { buildProductFilter, buildProductSort, parseSearchTerms } from "../lib/productQuery.js";
import { escapeRegex } from "../lib/escapeRegex.js";
import { serializeProduct } from "../lib/serializers.js";
import { ApiError } from "../utils/ApiError.js";

// Resolves the public visibility + search filter shared by the product list and the facets endpoint.
async function resolveFilter(q) {
  const activeCategories = await Category.find({ active: true }).select("_id slug name").lean();
  let categoryIds = activeCategories.map((c) => c._id);
  if (q.category) {
    const match = activeCategories.find((c) => c.slug === q.category);
    categoryIds = match ? [match._id] : []; // unknown or inactive category -> empty result
  }

  // Active categories whose name matches a search word, so "hoodie" also finds products in "Hoodies".
  const searchCategoryIds = {};
  for (const term of parseSearchTerms(q.q)) {
    const rx = new RegExp(escapeRegex(term), "i");
    searchCategoryIds[term] = activeCategories.filter((c) => rx.test(c.name)).map((c) => c._id);
  }
  return buildProductFilter({ categoryIds, featured: q.featured, search: q.q, searchCategoryIds, color: q.color, size: q.size });
}

async function listProducts(query, overrides = {}) {
  const q = { ...query, ...overrides };
  const filter = await resolveFilter(q);
  const [items, total] = await Promise.all([
    Product.find(filter).sort(buildProductSort(q.sort)).skip((q.page - 1) * q.limit).limit(q.limit).populate("category").lean(),
    Product.countDocuments(filter),
  ]);

  return {
    data: items.map((p) => serializeProduct(p)).filter(Boolean),
    meta: { page: q.page, limit: q.limit, total, totalPages: Math.max(1, Math.ceil(total / q.limit)) },
  };
}

// GET /api/products/facets?category=&q=  ->  the colors actually used by visible products (for the color filter).
// Same visibility rules as the list; the color/size filters themselves are not applied so every option stays selectable.
export async function getFacets(req, res) {
  const { category, q } = req.validated.query;
  const filter = await resolveFilter({ category, q });
  const rows = await Product.aggregate([
    { $match: filter },
    { $unwind: "$variants" },
    { $match: { "variants.available": { $ne: false } } },
    { $group: { _id: { $toLower: "$variants.color" }, name: { $first: "$variants.color" }, hex: { $first: "$variants.hex" } } },
    { $sort: { _id: 1 } },
  ]);
  res.json({ success: true, data: rows.map((r) => ({ name: r.name, hex: r.hex })) });
}

export async function getProducts(req, res) {
  const { data, meta } = await listProducts(req.validated.query);
  res.json({ success: true, data, meta });
}

export async function getFeaturedProducts(req, res) {
  const { data, meta } = await listProducts(req.validated.query, { featured: true });
  res.json({ success: true, data, meta });
}

export async function getProductBySlug(req, res) {
  const product = await Product.findOne({ slug: req.validated.params.slug, active: true }).populate("category").lean();
  const serialized = product && product.category?.active ? serializeProduct(product) : null;
  if (!serialized) throw new ApiError(404, "PRODUCT_NOT_FOUND", "Product not found.");
  res.json({ success: true, data: serialized });
}
