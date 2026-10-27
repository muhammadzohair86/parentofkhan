import { Category } from "../models/Category.js";
import { serializeCategory } from "../lib/serializers.js";
import { ApiError } from "../utils/ApiError.js";

export async function getCategories(req, res) {
  const { navbar, homepage } = req.validated.query;
  const filter = { active: true };
  if (navbar !== undefined) filter.showInNavbar = navbar;
  if (homepage !== undefined) filter.showOnHomepage = homepage;
  const items = await Category.find(filter).sort({ order: 1, name: 1 }).lean();
  res.json({ success: true, data: items.map(serializeCategory) });
}

export async function getCategoryBySlug(req, res) {
  const category = await Category.findOne({ slug: req.validated.params.slug, active: true }).lean();
  if (!category) throw new ApiError(404, "CATEGORY_NOT_FOUND", "Category not found.");
  res.json({ success: true, data: serializeCategory(category) });
}
