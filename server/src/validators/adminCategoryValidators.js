import { z } from "zod";
import { isImageUrl } from "../lib/imageUrl.js";

const img = z.preprocess((v) => (v === "" ? null : v), z.string().trim().refine(isImageUrl, "Use an uploaded image or an https:// / site-relative image path.").nullable().optional());
const shape = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(80),
  slug: z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().toLowerCase().max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Letters, numbers and single hyphens only.").optional()),
  description: z.string().trim().max(300).default(""),
  image: img,
  active: z.boolean().default(true),
  showOnHomepage: z.boolean().default(true),
  showInNavbar: z.boolean().default(true),
  order: z.number().int().min(-100000).max(100000).default(0),
});
export const categoryCreateBody = shape;
export const categoryPatchBody = shape.partial();
export const deleteCategoryQuery = z.object({ reassignTo: z.string().regex(/^[a-f\d]{24}$/i).optional() });
