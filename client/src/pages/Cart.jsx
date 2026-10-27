import { Link } from "react-router-dom";
import CartLines from "../components/CartLines.jsx";
import CartSummary from "../components/CartSummary.jsx";
import { useCart } from "../store/useCart.js";
import { useTitle } from "../hooks/useAsync.js";

export default function Cart() {
  useTitle("Cart");
  const count = useCart((s) => s.items.length);
  return (
    <div className="mx-auto max-w-5xl px-5 py-12 lg:px-10">
      <h1 className="font-display text-5xl md:text-6xl">Cart</h1>
      {!count ? (
        <div className="py-16 text-center"><p className="font-display text-3xl">Your cart is empty.</p><Link to="/shop" className="btn-khan mt-6">Browse the shop</Link></div>
      ) : (
        <div className="mt-8 grid gap-12 md:grid-cols-[1.6fr_1fr]">
          <CartLines />
          <div className="self-start border border-base-300 p-6"><CartSummary /></div>
        </div>
      )}
    </div>
  );
}
