import { escapeRegex } from "./escapeRegex.js";

const MAX_TERMS = 5;

// Splits a raw search string into at most MAX_TERMS lower-cased words. Pure; unit-testable.
export function parseSearchTerms(search) {
  if (!search) return [];
  return [...new Set(String(search).toLowerCase().split(/\s+/).filter(Boolean))].slice(0, MAX_TERMS);
}

// Builds the public-storefront Mongo filter. Pure function (no DB access) so it is unit-testable.
// Visibility depends ONLY on: product.active, an active category, and explicit variant availability.
// Recorded stock is deliberately ignored (on-demand printing).
//
// Search: every word must match at least one of name, description, tags, a color name, or the name of
// a matching category ("black hoodie" finds the black Hoodies). Words are regex-escaped.
// `searchCategoryIds` = ids of active categories whose name matches any search word (computed by the caller).
export function buildProductFilter({ categoryIds, featured, search, searchCategoryIds, color, size } = {}) {
  const filter = { active: true, category: { $in: categoryIds ?? [] } };
  if (featured !== undefined) filter.featured = featured;

  const terms = parseSearchTerms(search);
  if (terms.length) {
    const allowed = new Set((categoryIds ?? []).map(String));
    filter.$and = terms.map((t) => {
      const rx = new RegExp(escapeRegex(t), "i");
      const or = [{ name: rx }, { description: rx }, { tags: rx }, { "variants.color": rx }];
      const matched = (searchCategoryIds?.[t] ?? []).filter((id) => allowed.has(String(id)));
      if (matched.length) or.push({ category: { $in: matched } });
      return { $or: or };
    });
  }

  const variant = { available: { $ne: false } }; // at least one variant must be explicitly available
  if (color) variant.color = new RegExp(`^${escapeRegex(color)}$`, "i");
  if (size) variant.sizes = { $elemMatch: { size: new RegExp(`^${escapeRegex(size)}$`, "i") } };
  filter.variants = { $elemMatch: variant };

  return filter;
}

export function buildProductSort(sort) {
  switch (sort) {
    case "newest": return { createdAt: -1, _id: -1 };
    case "price-asc": return { effectivePrice: 1, _id: 1 };
    case "price-desc": return { effectivePrice: -1, _id: 1 };
    default: return { sortOrder: 1, createdAt: -1, _id: 1 };
  }
}
