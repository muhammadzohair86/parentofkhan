import { z } from "zod";

// Control characters become spaces (newlines are kept in the message body only).
const oneLine = (max, label) => z.string({ required_error: `${label} is required.` }).transform((v) => v.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim()).pipe(z.string().min(1, `${label} is required.`).max(max, `${label} is too long.`));
const body = z.string({ required_error: "Message is required." }).transform((v) => v.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim()).pipe(z.string().min(10, "Message should be at least 10 characters.").max(5000, "Message is too long (5000 characters maximum)."));

// `website` is a hidden "honeypot" field: people never see it, simple bots fill it in.
export const contactBody = z.object({
  name: oneLine(100, "Name").pipe(z.string().min(2, "Please enter your name.")),
  email: z.string({ required_error: "Email is required." }).trim().toLowerCase().max(254, "Email is too long.").email("Please enter a valid email."),
  subject: oneLine(150, "Subject"),
  message: body,
  website: z.string().max(200).optional().default(""),
});

export const listMessagesQuery = z.object({
  status: z.enum(["new", "read", "replied"]).optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export const updateMessageBody = z.object({ status: z.enum(["new", "read", "replied"]) });

// POST /api/analytics/visit
export const visitBody = z.object({ vid: z.string().max(64) });
