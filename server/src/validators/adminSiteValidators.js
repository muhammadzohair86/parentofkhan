import { z } from "zod";
import { parseAnnouncementInput } from "../lib/announcement.js";
import { isImageUrl } from "../lib/imageUrl.js";

const img = z.preprocess((v) => (v === "" ? null : v), z.string().trim().refine(isImageUrl, "Use an uploaded image or an https:// / site-relative image path.").nullable().optional());
// Only these four fields can be written. Leaving an image empty means "use the built-in default hero image".
export const heroBody = z.object({
  desktopImage: img,
  mobileImage: img,
  alt: z.string().trim().max(200).default(""),
  active: z.boolean().default(true),
});

// Rules live in lib/announcement.js (pure, unit-tested); each error becomes a zod issue with its field path.
export const announcementBody = z.any()
  .superRefine((raw, ctx) => { for (const e of parseAnnouncementInput(raw).errors) ctx.addIssue({ code: z.ZodIssueCode.custom, path: e.path ? e.path.split(".") : [], message: e.message }); })
  .transform((raw) => parseAnnouncementInput(raw).value);
