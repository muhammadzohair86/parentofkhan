import { Link } from "react-router-dom";
import { money, formatAmount } from "../lib.js";

// The customer-facing order: only what is needed to check the order and follow its delivery. It renders the server's allowlisted view
// (see server/src/lib/orderView.js); it never receives addresses, e-mail, payment references or internal notes.
const PAYMENT_LABEL = { paid: "Paid", pending: "Pending", unpaid: "Not paid yet", failed: "Failed", cancelled: "Cancelled", expired: "Session expired", review: "Under review", refunded: "Refunded" };
const fmt = (iso, withTime = true) => (iso ? new Date(iso).toLocaleString(undefined, withTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" }) : "");
// The server only stores https links, but a link is only ever rendered as one if it still is https here too.
const safeHttps = (u) => { try { return new URL(u).protocol === "https:" ? u : null; } catch { return null; } };

function Shipment({ order }) {
  const s = order.shipment;
  if (!s) {
    if (order.status === "cancelled") return null;
    return <p className="text-sm opacity-70">Tracking details will appear here once your order has shipped.</p>;
  }
  const url = s.trackingUrl && safeHttps(s.trackingUrl);
  return (
    <div className="space-y-2 text-sm">
      <p>Carrier: <span className="font-medium">{s.carrier}</span></p>
      {s.trackingNumber && <p>Tracking number: <span className="font-medium select-all">{s.trackingNumber}</span></p>}
      {s.awaitingTracking && <p>Your order has been shipped. The tracking number will appear here as soon as it is available.</p>}
      {s.dispatchedAt && <p>Shipped on {fmt(s.dispatchedAt, false)}</p>}
      {s.estimatedDelivery && <p>Estimated delivery: {s.estimatedDelivery}</p>}
      {url ? (
        <a className="btn-khan mt-2 inline-flex" href={url} target="_blank" rel="noopener noreferrer nofollow">Track Shipment</a>
      ) : s.trackingNumber && (
        <p className="opacity-70">You can follow your parcel with this number on {s.carrier}’s official tracking service.</p>
      )}
    </div>
  );
}

export default function OrderDetails({ order }) {
  if (!order) return null;
  const { shipping } = order;
  return (
    <div className="mt-10 space-y-10">
      <section aria-labelledby="od-summary">
        <h2 id="od-summary" className="eyebrow mb-3">Your order</h2>
        <dl className="grid gap-x-8 gap-y-2 border border-base-300 p-5 text-sm sm:grid-cols-2">
          <div className="flex justify-between gap-4"><dt className="opacity-60">Order reference</dt><dd className="font-medium">{order.orderNumber}</dd></div>
          <div className="flex justify-between gap-4"><dt className="opacity-60">Placed</dt><dd>{fmt(order.placedAt)}</dd></div>
          <div className="flex justify-between gap-4"><dt className="opacity-60">Order status</dt><dd className="font-medium">{order.statusLabel}</dd></div>
          <div className="flex justify-between gap-4"><dt className="opacity-60">Payment</dt><dd className="font-medium">{PAYMENT_LABEL[order.paymentStatus] || "Pending"}</dd></div>
        </dl>
      </section>

      <section aria-labelledby="od-items">
        <h2 id="od-items" className="eyebrow mb-3">Items</h2>
        <ul className="divide-y divide-base-300 border border-base-300">
          {order.items.map((i, n) => (
            <li key={n} className="flex items-center justify-between gap-4 p-4 text-sm">
              <div className="min-w-0"><p className="font-medium">{i.name}</p><p className="opacity-70">{i.color} · {i.size} · Qty {i.quantity}</p></div>
              <div className="shrink-0 text-right"><p>{money(i.lineTotal)}</p>{i.quantity > 1 && <p className="text-xs opacity-60">{money(i.unitPrice)} each</p>}</div>
            </li>
          ))}
        </ul>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between"><dt className="opacity-70">Subtotal ({order.currency})</dt><dd>{money(order.subtotal)}</dd></div>
          <div className="flex justify-between"><dt className="opacity-70">Shipping{shipping.method ? ` · ${shipping.method}` : ""}</dt><dd>{shipping.free ? "Free Shipping" : formatAmount(shipping.amount, shipping.currency)}</dd></div>
          {shipping.destination && <div className="flex justify-between"><dt className="opacity-70">Delivering to</dt><dd>{shipping.destination}</dd></div>}
          {shipping.deliveryEstimate && <div className="flex justify-between"><dt className="opacity-70">Estimated delivery</dt><dd>{shipping.deliveryEstimate}</dd></div>}
          <div className="flex justify-between border-t border-base-300 pt-3"><dt className="eyebrow">Total</dt><dd className="font-display text-2xl">{money(order.total)} {order.currency}</dd></div>
        </dl>
      </section>

      <section aria-labelledby="od-ship">
        <h2 id="od-ship" className="eyebrow mb-3">Delivery</h2>
        <Shipment order={order} />
      </section>

      {order.timeline.length > 0 && (
        <section aria-labelledby="od-timeline">
          <h2 id="od-timeline" className="eyebrow mb-3">Order history</h2>
          <ol className="space-y-4 border-l border-base-300 pl-5">
            {order.timeline.map((t, n) => (
              <li key={n} className="relative text-sm">
                <span className="absolute -left-[26px] top-1.5 h-2 w-2 rounded-full bg-current" aria-hidden="true" />
                <p className="font-medium">{t.label}</p>
                <p className="opacity-70">{t.text}</p>
                <p className="text-xs opacity-60"><time dateTime={t.at}>{fmt(t.at)}</time></p>
              </li>
            ))}
          </ol>
        </section>
      )}

      <p className="text-sm">Questions about your order? <Link to="/contact" className="link-u">Contact us</Link> and quote your order reference.</p>
    </div>
  );
}
