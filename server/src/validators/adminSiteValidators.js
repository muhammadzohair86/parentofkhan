import { z } from "zod";
import { isImageUrl } from "../lib/imageUrl.js";

const img = z.preprocess((v) => (v === "" ? null : v), z.string().trim().refine(isImageUrl, "Use an uploaded image or an https:// / site-relative image path.").nullable().optional());
// Only these four fields can be written. Leaving an image empty means "use the built-in default hero image".
export const heroBody = z.object({
  desktopImage: img,
  mobileImage: img,
  alt: z.string().trim().max(200).default(""),
  active: z.boolean().default(true),
});
