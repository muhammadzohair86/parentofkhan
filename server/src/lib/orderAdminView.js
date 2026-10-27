// How the ADMIN API presents an order (pure, so the controller and the tests share one implementation).
// This is staff-only data: the customer-facing allowlist lives in lib/orderView.js and is deliberately separate.
import { allowedNext } from "./orderStatus.js";

export const rowOf = (o) => ({
  id: String(o._id), orderNumber: o.orderNumber, customerName: o.customer?.name || "", customerEmail: o.customer?.email || "",
  total: o.total, currency: o.currency || "USD", status: o.status, paymentStatus: o.payment?.status || "unpaid",
  itemCount: (o.items || []).reduce((n, i) => n + i.quantity, 0), createdAt: o.createdAt,
});

export const detailOf = (o) => ({
  ...rowOf(o), updatedAt: o.updatedAt, customer: o.customer, shippingAddress: o.shippingAddress,
  items: (o.items || []).map((i) => ({ slug: i.slug || null, name: i.name, color: i.color, size: i.size, sku: i.sku || "", image: i.image || null, unitPrice: i.unitPrice, quantity: i.quantity, lineTotal: Math.round(i.unitPrice * i.quantity * 100) / 100 })),
  shippingDetails: o.shippingDetails?.courier ? { ...o.shippingDetails } : null, // frozen courier/destination/charge/estimate from order time
  subtotal: o.subtotal, shipping: o.shipping || 0, discount: o.discount || 0,
  payment: { method: o.payment?.method || "", status: o.payment?.status || "unpaid", reference: o.payment?.reference || "", environment: o.payment?.environment || "", paidAt: o.payment?.paidAt || null },
  // Admin-only: includes internalNote. (The customer-facing view in lib/orderView.js is a separate allowlist and never includes it.)
  shipment: { carrier: o.shipment?.carrier || "", trackingNumber: o.shipment?.trackingNumber || "", trackingUrl: o.shipment?.trackingUrl || "", dispatchedAt: o.shipment?.dispatchedAt || null, estimatedDelivery: o.shipment?.estimatedDelivery || "", internalNote: o.shipment?.internalNote || "" },
  statusHistory: (o.statusHistory || []).map((h) => ({ kind: h.kind || "status", from: h.from || null, to: h.to || null, byName: h.byName || "", note: h.note || "", at: h.at })),
  allowedNext: allowedNext(o.status),
});

