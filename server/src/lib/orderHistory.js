// Constructors for status-history entries (pure). Every entry has a `kind`:
//   "status"   a fulfilment status change (pending -> confirmed -> processing -> shipped -> delivered | cancelled)
//   "payment"  a VERIFIED payment event (written in the same atomic update that marks the order paid/refunded, so retries can't duplicate it)
//   "shipment" courier tracking details added/changed after dispatch
// `note` and `byName` are INTERNAL audit data: the customer-facing view (orderView.js) never reads them.
export const placedEntry = (at = new Date()) => ({ kind: "status", to: "pending", byName: "Customer", note: "Order placed; awaiting payment.", at });
export const paymentPaidEntry = (tracker, at = new Date()) => ({ kind: "payment", key: `payment:paid:${tracker}`, byName: "System (Safepay)", note: "Payment verified with Safepay.", at });
export const paymentRefundedEntry = (at = new Date()) => ({ kind: "payment", key: "payment:refunded", byName: "System (Safepay)", note: "Refund verified with Safepay.", at });
export const statusEntry = ({ from, to, by = null, byName = "", note = "", at = new Date() }) => ({ kind: "status", from, to, by, byName, note, at });
export const shipmentEntry = ({ by = null, byName = "", note = "", at = new Date() }) => ({ kind: "shipment", by, byName, note, at });
