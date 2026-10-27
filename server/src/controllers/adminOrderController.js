import { Order } from "../models/Order.js";
import { escapeRegex } from "../lib/escapeRegex.js";
import { rowOf, detailOf } from "../lib/orderAdminView.js";
import { planStatusChange, planShipmentUpdate } from "../lib/orderFulfilment.js";
import { ApiError } from "../utils/ApiError.js";

export async function listOrders(req, res) {
  const { q, status, from, to, page, limit } = req.validated.query;
  const filter = {};
  if (status) filter.status = status;
  if (q) { const rx = new RegExp(escapeRegex(q), "i"); filter.$or = [{ orderNumber: rx }, { "customer.email": rx }, { "customer.name": rx }]; }
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(`${from}T00:00:00.000Z`);
    if (to) filter.createdAt.$lte = new Date(`${to}T23:59:59.999Z`);
  }
  const [items, total] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Order.countDocuments(filter),
  ]);
  res.set("Cache-Control", "no-store");
  res.json({ success: true, data: items.map(rowOf), meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } });
}

export async function getOrder(req, res) {
  const o = await Order.findById(req.validated.params.id).lean();
  if (!o) throw new ApiError(404, "ORDER_NOT_FOUND", "Order not found.");
  res.set("Cache-Control", "no-store");
  res.json({ success: true, data: detailOf(o) });
}

// Fulfilment status only (+ the courier details typed in at dispatch). This never touches payment.status: nothing here can mark an order as paid.
// The plan (legal move, tracking/unpaid confirmations, history entry) is computed by lib/orderFulfilment.js and applied with ONE conditional update.
export async function updateOrderStatus(req, res) {
  const { id } = req.validated.params;
  const input = req.validated.body;
  const current = await Order.findById(id).select("status payment.status shipment").lean();
  if (!current) throw new ApiError(404, "ORDER_NOT_FOUND", "Order not found.");
  const { set, history } = planStatusChange({ order: current, input, actor: { id: req.user._id, name: req.user.name } });
  // The filter includes the status we validated against, so two admins cannot both apply a conflicting move.
  const updated = await Order.findOneAndUpdate({ _id: id, status: current.status }, { $set: set, $push: { statusHistory: history } }, { new: true }).lean();
  if (!updated) throw new ApiError(409, "ORDER_CHANGED", "This order was just changed by someone else. Reload it and try again.");
  res.json({ success: true, data: detailOf(updated) });
}

// Add or correct courier details without changing the status (e.g. the tracking number arrives after dispatch).
export async function updateOrderShipment(req, res) {
  const { id } = req.validated.params;
  const current = await Order.findById(id).select("status shipment").lean();
  if (!current) throw new ApiError(404, "ORDER_NOT_FOUND", "Order not found.");
  const plan = planShipmentUpdate({ order: current, input: req.validated.body, actor: { id: req.user._id, name: req.user.name } });
  if (plan.noop) return res.json({ success: true, data: detailOf(await Order.findById(id).lean()) });
  const update = { $set: plan.set };
  if (plan.history) update.$push = { statusHistory: plan.history };
  const updated = await Order.findOneAndUpdate({ _id: id, status: current.status }, update, { new: true }).lean();
  if (!updated) throw new ApiError(409, "ORDER_CHANGED", "This order was just changed by someone else. Reload it and try again.");
  res.json({ success: true, data: detailOf(updated) });
}
