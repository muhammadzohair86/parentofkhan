// MongoDB persistence for payments (implements the `repo` interface lib/paymentService.js expects).
// Every state change is a single conditional update (e.g. "set paid only if not already paid"), so concurrent requests, repeated
// webhooks and return-page polls can never apply the same transition twice.
import { Order } from "../models/Order.js";
import { Payment } from "../models/Payment.js";
import { PaymentEvent } from "../models/PaymentEvent.js";
import { OrderAccess } from "../models/OrderAccess.js";
import { LookupThrottle } from "../models/LookupThrottle.js";
import crypto from "node:crypto";
import { placedEntry, paymentPaidEntry, paymentRefundedEntry } from "./orderHistory.js";

const id = (x) => String(x);
const sha = (t) => crypto.createHash("sha256").update(t).digest("hex");
const orderOut = (o) => o && ({
  id: id(o._id), orderNumber: o.orderNumber, tokenHash: o.checkoutTokenHash || "", fingerprint: o.checkoutFingerprint || "", total: o.total,
  paymentStatus: o.payment?.status || "unpaid", paymentReference: o.payment?.reference || "",
  paymentAmountMinor: o.payment?.amountMinor, paymentCurrency: o.payment?.currency || o.currency, paymentEnvironment: o.payment?.environment || "",
  userId: o.user ? id(o.user) : null,
  emailHash: o.customer?.email ? sha(String(o.customer.email).trim().toLowerCase()) : "", // lets guest lookup compare emails without ever returning the address
});
const payOut = (p) => p && ({ id: id(p._id), orderId: id(p.order), orderNumber: p.orderNumber, tracker: p.tracker, status: p.status, createdAt: p.createdAt, lastCheckedAt: p.lastCheckedAt, paidAt: p.paidAt });
const dup = (e) => {
  if (e?.code !== 11000) return null;
  const field = Object.keys(e.keyPattern || e.keyValue || {})[0] || "";
  return Object.assign(new Error("Duplicate key"), { code: "DUPLICATE_KEY", field: field === "orderNumber" ? "orderNumber" : field === "checkoutTokenHash" ? "checkoutTokenHash" : field });
};

export const paymentRepo = {
  findOrderByTokenHash: async (hash) => orderOut(await Order.findOne({ checkoutTokenHash: hash }).lean()),
  findOrderByNumber: async (n) => orderOut(await Order.findOne({ orderNumber: n }).lean()),
  findOrderById: async (i) => orderOut(await Order.findById(i).lean()),

  async createOrder(d) {
    try {
      const o = await new Order({
        orderNumber: d.orderNumber, checkoutTokenHash: d.tokenHash, checkoutFingerprint: d.fingerprint, user: d.userId || null,
        customer: d.customer, shippingAddress: d.shippingAddress, items: d.items, subtotal: d.subtotal, shipping: d.shipping ?? 0,
        shippingDetails: d.shippingDetails, discount: d.discount, total: d.total, currency: d.currency, payment: d.payment,
        status: "pending", statusHistory: [placedEntry()],
      }).save();
      return orderOut(o.toObject());
    } catch (e) { throw dup(e) || e; }
  },

  async acquireLease(orderId, until, nowDate) {
    const r = await Order.updateOne({ _id: orderId, $or: [{ paymentLeaseUntil: null }, { paymentLeaseUntil: { $exists: false } }, { paymentLeaseUntil: { $lt: nowDate } }] }, { $set: { paymentLeaseUntil: until } });
    return r.modifiedCount === 1;
  },
  releaseLease: async (orderId) => { await Order.updateOne({ _id: orderId }, { $set: { paymentLeaseUntil: null } }); },

  // Atomic: only one caller ever gets { applied: true }.
  async markOrderPaid(orderId, { tracker, paidAt }) {
    const r = await Order.updateOne({ _id: orderId, "payment.status": { $ne: "paid" } }, { $set: { "payment.status": "paid", "payment.reference": tracker, "payment.paidAt": paidAt }, $push: { statusHistory: paymentPaidEntry(tracker, paidAt) } });
    if (r.modifiedCount === 1) return { applied: true, reference: tracker };
    const o = await Order.findById(orderId).select("payment.reference").lean();
    return { applied: false, reference: o?.payment?.reference || "" };
  },
  async setOrderPaymentStatus(orderId, status, { from }) {
    const update = { $set: { "payment.status": status } };
    if (status === "refunded") update.$push = { statusHistory: paymentRefundedEntry() }; // same atomic update as the change: a repeat finds the status already moved
    await Order.updateOne({ _id: orderId, "payment.status": { $in: from } }, update);
  },

  // ---- customer order access (read side) ----
  findOrderDocById: async (i) => Order.findById(i).lean(),
  listOrdersForUser: async (userId, limit) => Order.find({ user: userId }).sort({ createdAt: -1, _id: -1 }).limit(limit).lean(),
  async hasAccess(orderId, tokenHash, now) { return !!(await OrderAccess.exists({ order: orderId, tokenHash, expiresAt: { $gt: now } })); },
  createAccess: async ({ orderId, tokenHash, expiresAt }) => { await OrderAccess.create({ order: orderId, tokenHash, expiresAt }); },
  async lookupFailures(key, now) { const r = await LookupThrottle.findOne({ key, expiresAt: { $gt: now } }).lean(); return r?.count || 0; },
  async recordLookupFailure(key, ttlMs, now) {
    const bump = () => LookupThrottle.findOneAndUpdate({ key, expiresAt: { $gt: now } }, { $inc: { count: 1 } }, { new: true }).lean();
    const r = await bump();
    if (r) return r.count;
    await LookupThrottle.deleteOne({ key, expiresAt: { $lte: now } }); // a stale row from an earlier window
    try { await LookupThrottle.create({ key, count: 1, expiresAt: new Date(now.getTime() + ttlMs) }); return 1; }
    catch (e) { if (e?.code !== 11000) throw e; return (await bump())?.count ?? 1; } // a parallel attempt created it first
  },

  async createPayment(d) {
    return payOut((await Payment.create({ order: d.orderId, orderNumber: d.orderNumber, tracker: d.tracker, environment: d.environment, amountMinor: d.amountMinor, currency: d.currency, status: d.status, attempt: d.attempt })).toObject());
  },
  listPayments: async (orderId) => (await Payment.find({ order: orderId }).sort({ createdAt: -1 }).lean()).map(payOut),
  findPaymentByTracker: async (t) => payOut(await Payment.findOne({ tracker: t }).lean()),
  async updatePayment(paymentId, patch, { unlessStatus } = {}) {
    const filter = { _id: paymentId };
    if (unlessStatus?.length) filter.status = { $nin: unlessStatus };
    return (await Payment.updateOne(filter, { $set: patch })).modifiedCount === 1;
  },

  async recordEvent({ token, type, tracker }) {
    try { await PaymentEvent.create({ token, type, tracker }); return { inserted: true, processed: false }; }
    catch (e) {
      if (e?.code !== 11000) throw e;
      const ex = await PaymentEvent.findOne({ token }).lean();
      return { inserted: false, processed: !!ex?.processedAt };
    }
  },
  markEventProcessed: async (token, outcome) => { await PaymentEvent.updateOne({ token }, { $set: { processedAt: new Date(), outcome } }); },
};
