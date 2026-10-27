import { z } from "zod";

export const slug = z.string().trim().toLowerCase().min(1).max(140).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Invalid slug.");
export const boolString = z.enum(["true", "false"]).transform((v) => v === "true");
export const slugParams = z.object({ slug });
