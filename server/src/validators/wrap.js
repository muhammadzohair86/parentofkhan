import { z } from "zod";

// Adapts a pure parser ({ value, errors:[{path,message}] }) to the `validate` middleware: each error becomes a zod issue carrying its
// field path (so forms can show it under the right input), and on success the cleaned value is what reaches the controller.
export const wrap = (parse) =>
  z.any()
    .superRefine((raw, ctx) => { for (const e of parse(raw).errors) ctx.addIssue({ code: z.ZodIssueCode.custom, path: e.path ? e.path.split(".") : [], message: e.message }); })
    .transform((raw) => parse(raw).value);
