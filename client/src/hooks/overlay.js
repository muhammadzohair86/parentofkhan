import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { mediaStore } from "../lib/mediaStore.js";
import { lockScroll, unlockScroll } from "../lib/scrollLock.js";

const FOCUSABLE = 'a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])';

// Live result of a CSS media query (shared store, see lib/mediaStore.js).
export function useMediaQuery(query) {
  const store = mediaStore(query);
  return useSyncExternalStore(store.subscribe, store.getSnapshot, () => false);
}

// Phone layout. This MUST stay width-only and match Tailwind's `md` breakpoint (768px), so JavaScript-chosen
// layouts always flip at exactly the same width as the CSS ones and react instantly to resizing.
// (It used to also test `(hover: none)`: an input-capability query that browsers/DevTools do not re-evaluate
// when you toggle device emulation, which left the layout stale until a page reload.)
export const PHONE_QUERY = "(max-width: 767px)";
export const usePhone = () => useMediaQuery(PHONE_QUERY);

// Keeps an element mounted long enough to play its exit transition. `shown` drives the CSS classes.
export function usePresence(open, ms = 250) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (open) {
      setMounted(true);
      let r2;
      const r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => setShown(true)); });
      return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2); };
    }
    setShown(false);
    const t = setTimeout(() => setMounted(false), ms);
    return () => clearTimeout(t);
  }, [open, ms]);
  return { mounted, shown };
}

// Page scroll lock (see lib/scrollLock.js for why it only touches <body>).
export function useScrollLock(active) {
  useEffect(() => {
    if (!active) return;
    lockScroll();
    return () => unlockScroll();
  }, [active]);
}

// Dialog behavior: Escape closes, Tab stays inside the panel, the page behind is inert, focus moves in on
// open and returns to the opener on close.
// Options: `inert` = CSS selector of what to make inert while open (default: the whole app);
// `modal: false` skips the Tab trap (used when part of the page, e.g. the navbar, must stay usable).
export function useModal(open, panelRef, onClose, { inert = "#root", modal = true } = {}) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const returnTo = document.activeElement;
    const inerted = [...document.querySelectorAll(inert)];
    inerted.forEach((el) => el.setAttribute("inert", ""));
    const t = setTimeout(() => {
      const el = panelRef.current;
      (el?.querySelector("[data-autofocus]") || el?.querySelector(FOCUSABLE))?.focus({ preventScroll: true });
    }, 50);
    const onKey = (e) => {
      if (e.key === "Escape") return closeRef.current();
      if (!modal || e.key !== "Tab" || !panelRef.current) return;
      const els = [...panelRef.current.querySelectorAll(FOCUSABLE)];
      if (!els.length) return;
      const first = els[0], last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      inerted.forEach((el) => el.removeAttribute("inert"));
      returnTo?.focus?.({ preventScroll: true });
    };
  }, [open, panelRef, inert, modal]);
}

// true while the browser tab is visible (used to pause decorative animation in background tabs).
export function usePageVisible() {
  return useSyncExternalStore(
    (cb) => { document.addEventListener("visibilitychange", cb); return () => document.removeEventListener("visibilitychange", cb); },
    () => document.visibilityState !== "hidden",
    () => true
  );
}
