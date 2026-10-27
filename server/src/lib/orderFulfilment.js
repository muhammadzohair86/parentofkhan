// Pure planning of admin order changes. The controller loads the order, asks for a plan, then applies it with ONE conditional update.
// Rules: the existing status workflow is unchanged (only legal moves); a status change never touches payment; shipping needs a tracking
// number unless the admin explicitly confirms otherwise; shipping an UNPAID order needs an explicit confirmation; "delivered" is only ever
// reachable from "shipped" by an explicit admin action (a tracking number or link never changes the status).
import { ApiError } from "../utils/ApiError.js";
import { canTransition } from "./orderStatus.js";
import { DEFAULT_CARRIER } from "./shipmentInput.js";
import { statusEntry, shipmentEntry } from "./orderHistory.js";

const VISIBLE = ["carrier", "trackingNumber", "trackingUrl", "estimatedDelivery"]; // changes to these are meaningful to the customer
export const isDispatched = (status) => status === "shipped" || status === "delivered";
const norm = (s) => ({ carrier: s?.carrier || DEFAULT_CARRIER, trackingNumber: s?.trackingNumber || "", trackingUrl: s?.trackingUrl || "", dispatchedAt: s?.dispatchedAt || null, estimatedDelivery: s?.estimatedDelivery || "", internalNote: s?.internalNote || "" });
const merge = (current, patch) => ({ ...norm(current), ...(patch || {}) });
const setShipment = (before, after, only) => Object.fromEntries(Object.keys(after).filter((k) => (only ? only.includes(k) : true) && JSON.stringify(after[k]) !== JSON.stringify(before[k])).map((k) => [`shipment.${k}`, after[k]]));

// order: { status, payment: { status }, shipment }, input: parseStatusChangeInput().value, actor: { id, name }
export function planStatusChange({ order, input, actor, now = new Date() }) {
  const to = input.status;
  if (!canTransition(order.status, to)) throw new ApiError(409, "INVALID_TRANSITION", `An order that is "${order.status}" cannot be moved to "${to}".`);
  const before = norm(order.shipment);
  const after = merge(order.shipment, input.shipment);
  const set = { status: to };

  if (to === "shipped") {
    if ((order.payment?.status || "unpaid") !== "paid" && !input.acknowledgeUnpaid) {
      throw new ApiError(409, "PAYMENT_REQUIRED", "This order has not been paid online. Confirm that payment was received another way before shipping it.");
    }
    if (!after.trackingNumber && !input.allowWithoutTracking) {
      throw new ApiError(400, "VALIDATION_ERROR", "Enter the tracking number, or confirm that you want to ship without one.", [{ path: "shipment.trackingNumber", message: "Enter the tracking number, or confirm that you want to ship without one." }]);
    }
    if (!after.dispatchedAt) after.dispatchedAt = now; // dispatch date defaults to the moment it is marked shipped
    Object.assign(set, setShipment(before, after));
    if (!order.shipment?.carrier) set["shipment.carrier"] = after.carrier; // record the carrier (default NLS Xpress) on first dispatch
  } else if (Object.keys(input.shipment || {}).length) {
    Object.assign(set, setShipment(before, after)); // details typed alongside another move (e.g. an internal note) are saved, never invented
  }
  return { set, history: statusEntry({ from: order.status, to, by: actor.id, byName: actor.name, note: input.note, at: now }) };
}

// Editing shipment details without changing the status (add the tracking number later, correct a typo).
export function planShipmentUpdate({ order, input, actor, now = new Date() }) {
  if (order.status === "cancelled") throw new ApiError(409, "ORDER_CANCELLED", "A cancelled order has no shipment.");
  const before = norm(order.shipment), after = merge(order.shipment, input);
  const set = setShipment(before, after);
  if (!order.shipment?.carrier && Object.keys(set).length) set["shipment.carrier"] = after.carrier;
  if (Object.keys(set).length === 0) return { noop: true, set: {}, history: null };
  // Only changes the customer can see, and only once the order has really been dispatched, become a timeline entry.
  const visibleChange = VISIBLE.filter((k) => before[k] !== after[k]);
  let history = null;
  if (isDispatched(order.status) && visibleChange.length) {
    history = shipmentEntry({ by: actor.id, byName: actor.name, at: now, note: !before.trackingNumber && after.trackingNumber ? "Tracking details added." : "Tracking details updated." });
  }
  return { noop: false, set, history };
}
