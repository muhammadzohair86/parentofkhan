import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import OrderDetails from "./OrderDetails.jsx";
import { useCart } from "../store/useCart.js";
import { useTitle } from "../hooks/useAsync.js";
import { isSafepayUrl } from "../services/payments.js";
import { money } from "../lib.js";

// Shows what really happened to an order's payment, plus the order itself (items, totals, delivery, history). Used for the private order link
// (/order/<ref>/<token>, also where Safepay sends the customer back) and for a signed-in customer's own order. It never declares success on its
// own: `loader` asks OUR server, which asks Safepay. Every visit and refresh re-reads the saved order.
const POLL_MS = 3000, MAX_POLLS = 15;

const COPY = {
  paid: { title: "Payment received", body: "Your payment has been verified. Thank you for your order." },
  pending: { title: "Confirming your payment…", body: "We're waiting for Safepay to confirm your payment. This usually takes a few seconds. Please don't pay again." },
  failed: { title: "Your payment didn't go through", body: "Nothing was charged for this attempt. You can try again." },
  cancelled: { title: "Payment cancelled", body: "You cancelled the payment, so nothing was charged. Your order is saved and you can pay when you're ready." },
  expired: { title: "Payment session expired", body: "The payment page timed out and nothing was charged. You can start a new payment for the same order." },
  review: { title: "We need to check your payment", body: "Something about this payment needs a manual check, so we've paused it. Please contact us with your order reference below. Please don't pay again." },
  refunded: { title: "This payment was refunded", body: "The payment for this order has been refunded." },
  unpaid: { title: "Payment not completed", body: "This order hasn't been paid yet. You can pay now." },
};

const Shell = ({ children }) => <div className="mx-auto max-w-3xl px-5 py-12 lg:px-10">{children}</div>;

export default function OrderStatusView({ loader, retryer, cancelledHint = false, onSeen, notFoundExtra = null }) {
  useTitle("Order status");
  const clearCart = useCart((s) => s.clear);

  const [view, setView] = useState({ phase: "loading", data: null, error: null });
  const [polls, setPolls] = useState(0);
  const [again, setAgain] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState("");
  const cleared = useRef(false);

  const data = view.data;
  const status = data?.status;

  // Ask the server (which asks Safepay). While it is still pending, check again every few seconds (a webhook may be late).
  useEffect(() => {
    let live = true, timer;
    loader().then(
      (d) => {
        if (!live) return;
        onSeen?.(d);
        setView({ phase: "ready", data: d, error: null });
        if (d.status === "paid" && !cleared.current) { cleared.current = true; clearCart(); } // only a VERIFIED payment empties the cart
        if (d.status === "pending" && polls < MAX_POLLS) timer = setTimeout(() => live && setPolls((n) => n + 1), POLL_MS);
      },
      (error) => { if (live) setView((v) => ({ phase: "error", data: v.data, error })); },
    );
    return () => { live = false; clearTimeout(timer); };
  }, [loader, onSeen, polls, again, clearCart]);

  const checkAgain = () => { setView((v) => ({ ...v, phase: "loading" })); setPolls(0); setAgain((n) => n + 1); };

  const retry = useCallback(async () => {
    if (retrying) return;
    setRetrying(true); setRetryError("");
    try {
      const r = await retryer();
      if (r.status === "paid") { checkAgain(); setRetrying(false); return; }
      if (isSafepayUrl(r.redirectUrl)) { window.location.assign(r.redirectUrl); return; } // stay "busy" while the browser leaves
      throw new Error("Unexpected response");
    } catch (e) {
      setRetrying(false);
      setRetryError(e?.code === "PAYMENT_IN_PROGRESS" ? "Your payment is already being set up. Please wait a moment and try again." : e?.status && e.status < 500 && e.message ? e.message : "We couldn't restart the payment. Please try again in a moment.");
    }
  }, [retryer, retrying]);

  // ---- render ----
  if (view.phase === "error" && !data) {
    const notFound = view.error?.code === "ORDER_NOT_FOUND";
    return (
      <Shell>
        <h1 className="font-display text-5xl md:text-6xl">{notFound ? "Order not found" : "We couldn't check your order"}</h1>
        <p role="alert" className="mt-6 text-sm">{notFound ? "We couldn't find that order. The link may be incorrect or may have expired." : "We couldn't reach the store just now. If you have just paid, don't pay again: check again in a moment."}</p>
        {notFound && <p className="mt-3 text-sm">{notFoundExtra || <>You can look it up again with your order reference and email on the <Link to="/track-order" className="link-u">Track Order</Link> page.</>}</p>}
        <div className="mt-6 flex gap-4">{!notFound && <button className="btn-khan" onClick={checkAgain}>Check again</button>}<Link to="/shop" className="link-u self-center text-sm">Back to the shop</Link></div>
      </Shell>
    );
  }
  if (!data) return <Shell><h1 className="font-display text-5xl md:text-6xl">Order status</h1><p role="status" className="mt-6 text-sm opacity-70">Checking your payment…</p></Shell>;

  const waitedOut = status === "pending" && polls >= MAX_POLLS;
  const c = COPY[status] || COPY.pending;
  const showRetry = data.canRetry || (status === "pending" && (cancelledHint || waitedOut));
  const pendingTitle = status === "pending" && cancelledHint ? "You left the payment page" : c.title;
  const pendingBody = status === "pending" && cancelledHint
    ? "Your payment hasn't been taken yet. You can go back to Safepay to finish paying, and your order is saved."
    : status === "pending" && waitedOut ? "We still haven't received confirmation from Safepay. If you completed the payment, it may take a little longer: please check again shortly and don't pay twice. If you didn't, you can return to payment."
    : c.body;

  return (
    <Shell>
      <h1 className="font-display text-5xl md:text-6xl" aria-live="polite">{pendingTitle}</h1>
      <p className="mt-6 text-sm" role={status === "paid" ? "status" : undefined}>{pendingBody}</p>

      {!data.order && <dl className="mt-8 space-y-2 border border-base-300 p-5 text-sm">
        <div className="flex justify-between gap-6"><dt className="opacity-60">Order reference</dt><dd className="font-medium">{data.orderNumber}</dd></div>
        <div className="flex justify-between gap-6"><dt className="opacity-60">Total</dt><dd>{money(data.total)} {data.currency}</dd></div>
        <div className="flex justify-between gap-6"><dt className="opacity-60">Payment</dt><dd className="capitalize">{status === "pending" ? "Awaiting confirmation" : status === "review" ? "Under review" : status}</dd></div>
      </dl>}

      {data.testMode && <p className="mt-4 text-xs opacity-70">Test mode: payments use Safepay's sandbox, so no real money is charged and this is not a real order.</p>}
      {data.verificationDelayed && status !== "paid" && <p role="status" className="mt-4 text-sm">We couldn't confirm with Safepay just now. Please check again in a moment.</p>}
      {view.phase === "error" && <p role="alert" className="mt-4 text-sm text-error">We couldn't refresh your status. {" "}<button className="link-u" onClick={checkAgain}>Try again</button></p>}
      {retryError && <p role="alert" className="mt-4 text-sm text-error">{retryError}</p>}

      <div className="mt-8 flex flex-wrap items-center gap-4">
        {showRetry && <button className="btn-khan" disabled={retrying} onClick={retry}>{retrying ? "Opening Safepay…" : status === "pending" ? "Return to payment" : "Try payment again"}</button>}
        {(status === "pending" || waitedOut) && <button className="link-u text-sm" onClick={checkAgain}>Check again</button>}
        {status === "paid" ? <Link to="/shop" className="btn-khan">Continue shopping</Link> : <Link to="/shop" className="link-u text-sm">Back to the shop</Link>}
      </div>
      <OrderDetails order={data.order} />
    </Shell>
  );
}
