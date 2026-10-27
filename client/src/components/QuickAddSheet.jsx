import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { X } from "lucide-react";
import ProductImage from "./ProductImage.jsx";
import { usePresence, useScrollLock, useModal } from "../hooks/overlay.js";
import { useCart } from "../store/useCart.js";
import { useUI } from "../store/useUI.js";
import { money, variantAvailable, cardImages } from "../lib.js";

// Mobile quick add: a bottom sheet with the selected color's image, price, color + size pickers,
// Add to cart and More details. Uses the existing cart store; stock never blocks a made-to-order item.
export default function QuickAddSheet({ product, open, onClose, vi, onColorChange }) {
  const { mounted, shown } = usePresence(open, 260);
  const panel = useRef(null);
  const add = useCart((s) => s.add);
  const openDrawer = useUI((s) => s.openDrawer);
  const [size, setSize] = useState("");
  const [err, setErr] = useState("");
  const busy = useRef(false);
  useScrollLock(open);
  useModal(open, panel, onClose);
  useEffect(() => { if (open) { setSize(""); setErr(""); busy.current = false; } }, [open]);
  if (!mounted) return null;

  const available = product.variants.filter(variantAvailable);
  const index = Math.min(vi, available.length - 1);
  const v = available[index];
  const sizes = Object.keys(v.sizes);
  const onSale = product.salePrice != null;
  const img = cardImages(product, v, index)[0];

  const pickColor = (i) => { onColorChange(i); const next = available[i]; if (size && !(size in next.sizes)) setSize(""); };
  const submit = () => {
    if (busy.current) return; // ignore repeated taps
    if (!size) return setErr("Please select a size.");
    busy.current = true;
    if (add(product, v, size)) {
      onClose();
      setTimeout(() => openDrawer("cart"), 300); // after the sheet has finished closing, so scroll locks don't overlap
    } else { setErr("Could not add this item. Please try again."); busy.current = false; }
  };

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div onClick={onClose} className={`absolute inset-0 touch-none bg-black/40 transition-opacity duration-300 ${shown ? "opacity-100" : "opacity-0"}`} />
      <div ref={panel} role="dialog" aria-modal="true" aria-label={`Quick add ${product.name}`}
        className={`absolute inset-x-0 bottom-0 max-h-[88dvh] overflow-y-auto overscroll-contain border-t border-base-300 bg-base-100 px-5 pt-4 shadow-2xl transition-transform duration-300 ease-out ${shown ? "translate-y-0" : "translate-y-full"}`}
        style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}>
        <div className="flex items-start gap-4">
          <div className="h-28 w-24 shrink-0 overflow-hidden bg-base-200"><ProductImage src={img} hex={v.hex} alt={`${product.name} in ${v.color}`} eager widths={[96, 192, 288]} sizes="96px" /></div>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-3xl leading-tight">{product.name}</h2>
            <p className="mt-1">
              {onSale ? (<><span className="mr-2 line-through opacity-50">{money(product.price)}</span><span className="text-accent">{money(product.salePrice)}</span></>) : money(product.price)}
              <span className="ml-2 text-xs opacity-60">USD</span>
            </p>
          </div>
          <button onClick={onClose} aria-label="Close quick add" data-autofocus className="-mr-2 -mt-2 p-3 hover:opacity-60"><X size={22} /></button>
        </div>

        {available.length > 1 && (
          <fieldset className="mt-5">
            <legend className="eyebrow mb-3">Color — {v.color}</legend>
            <div className="flex flex-wrap gap-3">
              {available.map((x, i) => (
                <button key={x.color} onClick={() => pickColor(i)} aria-label={x.color} aria-pressed={i === index}
                  className={`h-9 w-9 border border-black/30 ${i === index ? "outline outline-2 outline-offset-2 outline-black" : ""}`} style={{ background: x.hex }} />
              ))}
            </div>
          </fieldset>
        )}

        <fieldset className="mt-5">
          <legend className="eyebrow mb-3">Size</legend>
          <div className="flex flex-wrap gap-2">
            {sizes.map((s) => (
              <button key={s} onClick={() => { setSize(s); setErr(""); }} aria-pressed={size === s}
                className={`min-h-11 min-w-14 border px-4 text-sm ${size === s ? "border-black bg-neutral text-neutral-content" : "border-black/30"}`}>{s}</button>
            ))}
          </div>
        </fieldset>

        {err && <p role="alert" className="mt-3 text-sm text-error">{err}</p>}
        <button onClick={submit} className="btn-khan mt-5 w-full">Add to cart</button>
        <Link to={`/product/${product.slug}`} onClick={onClose} className="link-u mt-4 block text-center text-sm">More details</Link>
      </div>
    </div>,
    document.body
  );
}
