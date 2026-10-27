import { Link } from "react-router-dom";
import { Minus, Plus, Trash2 } from "lucide-react";
import ProductImage from "./ProductImage.jsx";
import { useCart } from "../store/useCart.js";
import { useUI } from "../store/useUI.js";
import { money } from "../lib.js";

export default function CartLines() {
  const { items, setQty, remove } = useCart();
  const close = useUI((s) => s.closeDrawer);
  return (
    <ul className="divide-y divide-base-300">
      {items.map((i) => (
        <li key={i.key} className={`flex gap-4 py-5 ${i.unavailable ? "opacity-60" : ""}`}>
          <Link to={`/product/${i.slug}`} onClick={close} className="h-28 w-24 shrink-0 overflow-hidden bg-base-200">
            <ProductImage src={i.image} hex={i.hex} alt={i.name} widths={[96, 192]} sizes="64px" />
          </Link>
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex justify-between gap-3">
              <Link to={`/product/${i.slug}`} onClick={close} className="font-medium">{i.name}</Link>
              <p className="text-sm">{i.unavailable ? "—" : money(i.price * i.qty)}</p>
            </div>
            <p className="mt-1 flex items-center gap-2 text-sm opacity-70">
              <span className="inline-block h-3 w-3 border border-black/30" style={{ background: i.hex }} aria-hidden="true" />
              {i.color} · {i.size} · {money(i.price)} each
            </p>
            {i.unavailable && <p role="status" className="mt-1 text-xs text-error">No longer available. Remove it to continue.</p>}
            <div className="mt-auto flex items-center justify-between pt-3">
              <div className="inline-flex items-center border border-base-300">
                <button aria-label={`Decrease quantity of ${i.name}`} onClick={() => setQty(i.key, i.qty - 1)} disabled={i.unavailable || i.qty <= 1} className="p-2 disabled:opacity-30"><Minus size={14} /></button>
                <span className="w-8 text-center text-sm" aria-live="polite">{i.qty}</span>
                <button aria-label={`Increase quantity of ${i.name}`} onClick={() => setQty(i.key, i.qty + 1)} disabled={i.unavailable || i.qty >= i.max} className="p-2 disabled:opacity-30"><Plus size={14} /></button>
              </div>
              <button onClick={() => remove(i.key)} aria-label={`Remove ${i.name}`} className="p-2 opacity-60 hover:opacity-100"><Trash2 size={16} /></button>
            </div>
            {i.qty >= i.max && <p className="mt-1 text-xs opacity-60">Maximum quantity per order.</p>}
          </div>
        </li>
      ))}
    </ul>
  );
}
