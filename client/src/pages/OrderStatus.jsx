import { useCallback } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import OrderStatusView from "../components/OrderStatusView.jsx";
import { getPaymentStatus, retryPayment } from "../services/payments.js";
import { rememberOrder } from "../lib/recentOrders.js";

// /order/<reference>/<token>: where Safepay sends the customer back after paying, and the private link a customer can bookmark, reopen later,
// or get from "Track Order". The URL (including ?tracker=... or ?cancelled=1) is only a HINT: the server decides what is true.
export default function OrderStatus() {
  const { orderNumber, token } = useParams();
  const [params] = useSearchParams();
  const loader = useCallback(() => getPaymentStatus(orderNumber, token), [orderNumber, token]);
  const retryer = useCallback(() => retryPayment(orderNumber, token), [orderNumber, token]);
  const onSeen = useCallback(() => rememberOrder(orderNumber, token), [orderNumber, token]); // only remembered once the server confirmed the link is valid
  return <OrderStatusView loader={loader} retryer={retryer} onSeen={onSeen} cancelledHint={params.get("cancelled") === "1"} />;
}
