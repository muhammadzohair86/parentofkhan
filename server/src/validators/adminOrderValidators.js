import { z } from "zod";
import { ORDER_STATUSES } from "../lib/orderStatus.js";
import { wrap } from "./wrap.js";
import { parseStatusChangeInput, parseShipmentInput } from "../lib/shipmentInput.js";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.").refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), "Invalid date.");
export const listOrdersQuery = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(ORDER_STATUSES).optional(),
  from: day.optional(),
  to: day.optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
// Status change: { status, note?, shipment?: {...}, allowWithoutTracking?, acknowledgeUnpaid? }. Rules live in lib/shipmentInput.js + lib/orderFulfilment.js (pure, unit-tested).
export const updateOrderStatusBody = wrap((raw) => parseStatusChangeInput(raw, ORDER_STATUSES));
// Shipment details only (add the tracking number later, fix a typo). Only the fields sent are changed.
export const updateOrderShipmentBody = wrap((raw) => { const r = parseShipmentInput(raw ?? {}); return r.errors.length || !r.value || Object.keys(r.value).length ? r : { value: null, errors: [{ path: "", message: "Nothing to update." }] }; });
