import { z } from "zod";
import { slug, boolString } from "./common.js";

export const listProductsQuery = z.object({
  category: slug.optional(),
  q: z.string().trim().min(2, "Search must be at least 2 characters.").max(60).optional(),
  sort: z.enum(["newest", "price-asc", "price-desc"]).optional(),
  featured: boolString.optional(),
  color: z.string().trim().min(1).max(40).optional(),
  size: z.string().trim().min(1).max(10).optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(24),
});

export const facetsQuery = z.object({
  category: slug.optional(),
  q: z.string().trim().min(2).max(60).optional(),
});
