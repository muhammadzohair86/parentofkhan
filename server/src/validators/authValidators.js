import { z } from "zod";

// Only these fields are read from the body. Anything else (including "role") is stripped and ignored.
const email = z.string().trim().toLowerCase().max(254, "Email is too long.").email("Enter a valid email address.");

export const signupBody = z
  .object({
    name: z.string().trim().min(1, "Enter your name.").max(80, "Name is too long."),
    email,
    password: z.string().min(8, "Password must be at least 8 characters.").max(128, "Password must be at most 128 characters."),
  })
  .refine((d) => d.password.toLowerCase() !== d.email, { path: ["password"], message: "Password must not be your email address." });

export const loginBody = z.object({
  email: z.string().trim().toLowerCase().max(254),
  password: z.string().min(1, "Enter your password.").max(128),
});
