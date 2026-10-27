import { Link } from "react-router-dom";
import { useCart, cartSubtotal } from "../store/useCart.js";
import { useUI } from "../store/useUI.js";
import { money } from "../lib.js";

export default function CartSummary() {
  const subtotal = useCart(cartSubtotal);
  const close = useUI((s) => s.closeDrawer);
  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <span className="eyebrow">Subtotal (USD)</span>
        <span className="font-display text-3xl">{money(subtotal)}</span>
      </div>
      <p className="text-xs opacity-60">Shipping is calculated at checkout.</p>
      <Link to="/checkout" onClick={close} className="btn-khan w-full" aria-describedby="checkout-note">Checkout</Link>
      <p id="checkout-note" className="text-xs opacity-60">Check your shipping charge here. Online payment isn’t available yet.</p>
    </div>
  );
}
