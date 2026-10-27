// What a CUSTOMER may see about an order. Everything is copied field by field (an explicit allowlist): a new field added to the Order model
// is invisible to customers until it is deliberately listed here. Never exposed: email, phone, street address, database ids, payment tracker /
// reference, environment details, billable weight, exchange rate, internal notes, admin names, history notes.
import { customerPaymentStatus } from "./paymentRules.js";
import { isDispatched } from "./orderFulfilment.js";

export const STATUS_TEXT = Object.freeze({
  pending: { label: "Order received", text: "We received your order." },
  confirmed: { label: "Order confirmed", text: "Your order has been confirmed." },
  processing: { label: "Being prepared", text: "Your order is being prepared." },
  shipped: { label: "Shipped", text: "Your order has been handed to the courier." },
  delivered: { label: "Delivered", text: "Your order has been delivered." },
  cancelled: { label: "Cancelled", text: "This order was cancelled." },
});
const PAYMENT_EVENT = Object.freeze({ paid: { label: "Payment received", text: "Your payment was verified." }, refunded: { label: "Payment refunded", text: "Your payment was refunded." } });
const iso = (d) => (d ? new Date(d).toISOString() : null);
const money2 = (n) => Math.round(Number(n) * 100) / 100;

// Customer-friendly timeline from the SAVED history only. Descriptions are fixed text per event type: the admin's notes and names are never used.
// A legacy order with no history gets an empty timeline (nothing is invented); the current status is shown separately.
export function buildTimeline(history) {
  const out = [];
  for (const h of Array.isArray(history) ? history : []) {
    const kind = h.kind || "status"; // entries saved before `kind` existed are status changes
    let e = null;
    if (kind === "status" && STATUS_TEXT[h.to]) e = { type: h.to, ...STATUS_TEXT[h.to] };
    else if (kind === "payment") e = { type: h.key === "payment:refunded" ? "refunded" : "paid", ...(h.key === "payment:refunded" ? PAYMENT_EVENT.refunded : PAYMENT_EVENT.paid) };
    else if (kind === "shipment") e = { type: "tracking", label: "Tracking updated", text: "Courier tracking details were added or updated." };
    if (e && h.at) out.push({ ...e, at: iso(h.at) });
  }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

export function customerShipment(order) {
  if (!isDispatched(order.status)) return null; // tracking only becomes visible once the order has actually been shipped
  const s = order.shipment || {};
  const trackingNumber = s.trackingNumber || "";
  return {
    carrier: s.carrier || "NLS Xpress",
    trackingNumber: trackingNumber || null,
    trackingUrl: s.trackingUrl || null,                // only ever what the admin entered; nothing is generated
    dispatchedAt: iso(s.dispatchedAt),
    estimatedDelivery: s.estimatedDelivery || null,
    awaitingTracking: !trackingNumber,                 // shipped without a number yet: the page says so instead of inventing one
  };
}

// latestPayment: the newest Payment attempt (or null), used only to word the payment state.
export function customerOrderView(order, latestPayment = null) {
  const sd = order.shippingDetails?.courier ? order.shippingDetails : null;
  const free = !!sd?.freeShipping || (!sd && !(order.shipping > 0));
  const paymentStatus = customerPaymentStatus({ paymentStatus: order.payment?.status || "unpaid" }, latestPayment);
  const items = (order.items || []).map((i) => ({ name: i.name, color: i.color, size: i.size, quantity: i.quantity, unitPrice: money2(i.unitPrice), lineTotal: money2(i.unitPrice * i.quantity), image: i.image || null }));
  return {
    orderNumber: order.orderNumber,
    placedAt: iso(order.createdAt),
    status: order.status,
    statusLabel: STATUS_TEXT[order.status]?.label || order.status,
    paymentStatus,
    currency: order.currency || "USD",
    items,
    itemCount: items.reduce((n, i) => n + i.quantity, 0),
    subtotal: money2(order.subtotal),
    shipping: { method: sd?.courier || null, destination: sd?.destinationName || null, free, amount: free ? 0 : sd ? sd.amount : money2(order.shipping), currency: sd?.currency || order.currency || "USD", deliveryEstimate: sd?.deliveryEstimate || null },
    total: money2(order.total),
    shipment: customerShipment(order),
    timeline: buildTimeline(order.statusHistory),
    testMode: order.payment?.environment === "sandbox",
  };
}

// A row in "My orders".
export function customerOrderRow(order) {
  const p = order.payment?.status || "unpaid";
  return {
    orderNumber: order.orderNumber, placedAt: iso(order.createdAt), status: order.status, statusLabel: STATUS_TEXT[order.status]?.label || order.status,
    paymentStatus: p === "paid" ? "paid" : p === "refunded" ? "refunded" : p === "failed" ? "failed" : "pending",
    total: money2(order.total), currency: order.currency || "USD", itemCount: (order.items || []).reduce((n, i) => n + i.quantity, 0),
  };
}
