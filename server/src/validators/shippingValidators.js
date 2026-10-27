import { z } from "zod";
import { isCountryCode } from "../lib/countries.js";
import { parseSettingsInput, parseInternationalSettingsInput, parseDestinationInput } from "../lib/shippingInput.js";
import { MAX_LINE_QTY, MAX_CART_LINES } from "../lib/checkoutQuote.js";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid id.");
const country = z.string().trim().toUpperCase().refine(isCountryCode, "Choose a country from the list.");

// ---- public: POST /api/checkout/quote ----
export const quoteBody = z.object({
  items: z.array(z.object({
    productId: objectId,
    color: z.string().trim().min(1).max(40),
    size: z.string().trim().min(1).max(10),
    quantity: z.number().int().min(1).max(MAX_LINE_QTY),
  })).min(1, "Your cart is empty.").max(MAX_CART_LINES),
  destination: z.object({ country, city: z.string().trim().max(80).default("") }),
  // Optional claims from the browser. They are compared with the server's own calculation and rejected on any difference.
  submitted: z.object({
    shippingAmount: z.number().finite().optional(),
    subtotal: z.number().finite().optional(),
    total: z.number().finite().optional(),
  }).optional(),
});

// ---- admin ----
// The rules live in lib/shippingInput.js (pure, unit-tested). These wrappers only adapt them to the `validate` middleware:
// every error becomes a zod issue with its field path (so the admin form shows a message under the right field), and on success
// the cleaned, normalised value is what reaches the controller.
const wrap = (parse) =>
  z.any()
    .superRefine((raw, ctx) => { for (const e of parse(raw).errors) ctx.addIssue({ code: z.ZodIssueCode.custom, path: e.path ? e.path.split(".") : [], message: e.message }); })
    .transform((raw) => parse(raw).value);

export const shippingSettingsBody = wrap(parseSettingsInput);
export const internationalSettingsBody = wrap(parseInternationalSettingsInput);
export const destinationCreateBody = wrap((raw) => parseDestinationInput(raw, { partial: false }));
export const destinationPatchBody = wrap((raw) => parseDestinationInput(raw, { partial: true }));
