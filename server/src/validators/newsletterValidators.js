import { z } from "zod";

// Only `email` is read; anything else in the body is ignored.
export const subscribeBody = z.object({
  email: z.string().trim().toLowerCase().max(254, "Email is too long.").email("Enter a valid email address."),
});
