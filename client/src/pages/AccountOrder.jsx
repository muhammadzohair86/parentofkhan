import { useCallback, useEffect } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import OrderStatusView from "../components/OrderStatusView.jsx";
import { useAuth } from "../store/useAuth.js";
import { getMyOrderStatus, retryMyPayment } from "../services/payments.js";

// /account/orders/<reference>: a signed-in customer's own order. The server only returns orders placed under THIS account.
export default function AccountOrder() {
  const { orderNumber } = useParams();
  const [params] = useSearchParams();
  const user = useAuth((s) => s.user);
  const ready = useAuth((s) => s.ready);
  const init = useAuth((s) => s.init);
  useEffect(() => { init(); }, [init]);
  const loader = useCallback(() => getMyOrderStatus(orderNumber), [orderNumber]);
  const retryer = useCallback(() => retryMyPayment(orderNumber), [orderNumber]);

  if (!ready) return <div className="mx-auto max-w-3xl px-5 py-12 lg:px-10"><p role="status" className="text-sm opacity-70">Loading…</p></div>;
  if (!user) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-12 lg:px-10">
        <h1 className="font-display text-5xl md:text-6xl">Sign in to see this order</h1>
        <p className="mt-6 text-sm">Open the account menu to sign in, or look the order up with its reference and the email you used at checkout.</p>
        <Link to="/track-order" className="btn-khan mt-6 inline-flex">Track an order</Link>
      </div>
    );
  }
  return <OrderStatusView loader={loader} retryer={retryer} cancelledHint={params.get("cancelled") === "1"}
    notFoundExtra={<>This order isn't linked to your account. You can look it up with its reference and email on the <Link to="/track-order" className="link-u">Track Order</Link> page.</>} />;
}
