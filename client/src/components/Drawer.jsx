import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useUI } from "../store/useUI.js";

const FOCUSABLE = "a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex=\"-1\"])";

// One shared drawer for search / account / cart.
export default function Drawer({ id, title, children }) {
  const open = useUI((s) => s.drawer === id);
  const close = useUI((s) => s.closeDrawer);
  const panel = useRef(null);
  const returnTo = useRef(null);

  useEffect(() => {
    if (!open) return;
    returnTo.current = document.activeElement;
    const root = document.getElementById("root");
    root?.setAttribute("inert", "");
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = setTimeout(() => (panel.current?.querySelector("[data-autofocus]") || panel.current?.querySelector(FOCUSABLE))?.focus(), 50);
    const onKey = (e) => {
      if (e.key === "Escape") return close();
      if (e.key !== "Tab") return;
      const els = [...panel.current.querySelectorAll(FOCUSABLE)];
      if (!els.length) return;
      const first = els[0], last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      root?.removeAttribute("inert");
      document.body.style.overflow = prevOverflow;
      returnTo.current?.focus?.();
    };
  }, [open, close]);

  return createPortal(
    <div className={`fixed inset-0 z-50 ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
      <div onClick={close} className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0"}`} />
      <aside ref={panel} role="dialog" aria-modal="true" aria-label={title}
        className={`absolute right-0 top-0 flex h-full w-full flex-col bg-base-100 shadow-2xl transition-transform duration-300 ease-out sm:w-[70vw] lg:w-[45vw] lg:min-w-[480px] lg:max-w-[760px] ${open ? "translate-x-0" : "translate-x-full"}`}
        inert={!open}>
        <header className="flex items-center justify-between border-b border-base-300 px-6 py-5">
          <h2 className="font-display text-3xl">{title}</h2>
          <button onClick={close} aria-label={`Close ${title.toLowerCase()}`} className="p-2 hover:opacity-60"><X size={22} /></button>
        </header>
        <div className="flex-1 overflow-y-auto">{open && children}</div>
      </aside>
    </div>,
    document.body
  );
}
