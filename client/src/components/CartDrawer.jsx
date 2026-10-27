import { Link } from "react-router-dom";
import Drawer from "./Drawer.jsx";
import CartLines from "./CartLines.jsx";
import CartSummary from "./CartSummary.jsx";
import { useCart } from "../store/useCart.js";
import { useUI } from "../store/useUI.js";

function Body() {
  const count = useCart((s) => s.items.length);
  const close = useUI((s) => s.closeDrawer);
  if (!count) {
    return (
      <div className="p-8 text-center">
        <p className="font-display text-3xl">Your cart is empty.</p>
        <p className="mt-2 text-sm opacity-70">Find a design you like and it will land here.</p>
        <Link to="/shop" onClick={close} className="btn-khan mt-6" data-autofocus>Browse the shop</Link>
      </div>
    );
  }
  return (
    <div className="flex min-h-full flex-col">
      <div className="flex-1 px-6"><CartLines /></div>
      <div className="sticky bottom-0 space-y-3 border-t border-base-300 bg-base-100 p-6">
        <CartSummary />
        <Link to="/cart" onClick={close} className="link-u block text-center text-sm">View full cart</Link>
      </div>
    </div>
  );
}

export default function CartDrawer() {
  return <Drawer id="cart" title="Cart"><Body /></Drawer>;
}
