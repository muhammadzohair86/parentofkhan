import { z } from "zod";

// PATCH /api/admin/orders/:id/payment : manual payment verification (WhatsApp orders only; enforced in the repo update).
const text = (max) => z.preprocess((v) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim() : v), z.string().max(max)).optional().default("");
export const updateOrderPaymentBody = z.object({
  paid: z.boolean(),
  reference: text(80), // e.g. a bank transfer / Easypaisa / JazzCash transaction reference the admin saw
  note: text(300),
});
