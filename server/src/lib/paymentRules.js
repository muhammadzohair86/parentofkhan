// Pure payment decision rules. No I/O, so every branch is unit-tested.

// Safepay tracker states (docs: "Tracker states") -> what they mean for an order.
const PHASE = Object.freeze({
  TRACKER_ENDED: "paid",
  TRACKER_STARTED: "pending", TRACKER_ENROLLED: "pending", TRACKER_AUTHORIZED: "pending",
  TRACKER_CANCELLED: "cancelled", TRACKER_EXPIRED: "expired",
  TRACKER_REFUNDED: "refunded",
  TRACKER_PARTIAL_REFUND: "attention", TRACKER_DISPUTED: "attention", TRACKER_REVERSED: "attention", TRACKER_VOIDED: "attention",
});
export const trackerPhase = (state) => PHASE[state] || "attention"; // an unknown state is never treated as paid

export const toMinor = (amount) => Math.round(amount * 100);

// Decide what a tracker read from Safepay means for OUR saved order. `expected` = { amountMinor, currency } from the order.
// "paid" is returned ONLY when the tracker is ended AND Safepay's own amount and currency equal what we saved.
//   -> { outcome: "paid"|"pending"|"cancelled"|"expired"|"refunded"|"attention"|"mismatch", reason: string }
export function evaluateTracker(tracker, expected) {
  const phase = trackerPhase(tracker?.state);
  if (phase !== "paid" && phase !== "refunded") return { outcome: phase, reason: `tracker_${String(tracker?.state || "unknown").toLowerCase()}` };
  if (tracker.currency !== expected.currency) return { outcome: "mismatch", reason: "currency_mismatch" };
  if (!Number.isInteger(tracker.amountMinor)) return { outcome: "mismatch", reason: "amount_unverifiable" };
  if (tracker.amountMinor !== expected.amountMinor) return { outcome: "mismatch", reason: "amount_mismatch" };
  return { outcome: phase, reason: "verified" };
}

// A webhook payload's own claims. They are NOT proof of payment (that always comes from fetching the tracker), but a payload that
// contradicts the saved order is rejected outright. Amount is only compared when the payload states the order's own currency, because
// a USD session can be reported by Safepay in its settlement currency.
export function checkWebhookClaims(event, order, { publicKey } = {}) {
  const d = event?.data || {};
  if (publicKey && typeof event?.merchant_api_key === "string" && event.merchant_api_key !== publicKey) return { ok: false, reason: "wrong_merchant" };
  const ref = d.metadata?.order_id;
  if (ref !== undefined && ref !== null && String(ref) !== order.orderNumber) return { ok: false, reason: "order_reference_mismatch" };
  if (typeof d.currency === "string" && d.currency.toUpperCase() === order.paymentCurrency && Number.isFinite(d.amount) && d.amount !== order.paymentAmountMinor) {
    return { ok: false, reason: "amount_mismatch" };
  }
  return { ok: true, reason: "" };
}

// What the customer-facing status page may say.
export function customerPaymentStatus(order, latestPayment) {
  if (order.paymentStatus === "paid") return "paid";
  if (order.paymentStatus === "refunded") return "refunded";
  if (!latestPayment) return "unpaid";
  return { created: "pending", pending: "pending", failed: "failed", cancelled: "cancelled", expired: "expired", review: "review" }[latestPayment.status] || "pending";
}
