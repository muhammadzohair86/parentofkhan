import { z } from "zod";
import { ALL_PERMISSIONS } from "../lib/permissions.js";

const perms = z.array(z.enum(ALL_PERMISSIONS)).max(ALL_PERMISSIONS.length);
const password = z.string().min(10, "Password must be at least 10 characters.").max(128);
export const teamCreateBody = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(80),
  email: z.string().trim().toLowerCase().max(254).email("Enter a valid email address."),
  password,
  permissions: perms.default([]),
});
// Only these keys can be changed. Role, email and createdBy can never be edited here.
export const teamPatchBody = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  permissions: perms.optional(),
  active: z.boolean().optional(),
  password: password.optional(),
});
export const changePasswordBody = z.object({ currentPassword: z.string().min(1).max(128), newPassword: password });
export const adminLoginBody = z.object({ email: z.string().trim().toLowerCase().max(254), password: z.string().min(1).max(128) });
