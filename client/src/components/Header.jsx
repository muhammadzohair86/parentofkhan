import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, NavLink, useLocation } from "react-router-dom";
import { Menu, Search, ShoppingBag, User, X } from "lucide-react";
import { useUI } from "../store/useUI.js";
import { useCart, cartCount } from "../store/useCart.js";
import { useAsync } from "../hooks/useAsync.js";
import { getCategories } from "../services/catalog.js";
import { usePresence, useScrollLock, useModal } from "../hooks/overlay.js";

const navCls = ({ isActive }) => `link-u py-1 ${isActive ? "font-medium" : ""}`;

// Mobile menu: a left drawer that opens directly BELOW the navbar (the navbar stays visible and usable).
// It is an overlay (portal to <body>), so opening it never moves the page. Same timing/easing/backdrop as the
// Search, Account and Cart sidebars (300ms ease-out, black/40 backdrop).
function MobileMenu({ open, onClose, categories, headerRef }) {
  const { mounted, shown } = usePresence(open, 300);
  const panel = useRef(null);
  const [top, setTop] = useState(64);
  useScrollLock(open);
  useModal(open, panel, onClose, { modal: false, inert: "main, footer" }); // navbar stays interactive: it holds the close button
  useLayoutEffect(() => { // align exactly with the bottom edge of the (sticky) navbar, whatever its height
    if (!open) return;
    let raf = 0;
    const measure = () => setTop(Math.round(headerRef.current?.getBoundingClientRect().bottom ?? 64));
    const onResize = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(measure); }; // at most once per frame
    measure();
    window.addEventListener("resize", onResize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", onResize); };
  }, [open, headerRef]);
  useEffect(() => { // leaving phone width while open: just close it
    if (!open) return;
    const mq = window.matchMedia("(min-width: 768px)");
    const on = () => mq.matches && onClose();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [open, onClose]);
  if (!mounted) return null;
  const link = ({ isActive }) => `block py-3 font-display text-4xl ${isActive ? "italic" : ""}`;
  return createPortal(
    <div className="fixed inset-x-0 bottom-0 z-[35] overflow-hidden md:hidden" style={{ top }}>
      <div onClick={onClose} aria-hidden="true" className={`absolute inset-0 touch-none bg-black/40 transition-opacity duration-300 ${shown ? "opacity-100" : "opacity-0"}`} />
      <nav id="mobile-menu" ref={panel} aria-label="Mobile"
        className={`absolute left-0 top-0 h-full w-[85vw] max-w-sm overflow-y-auto overscroll-contain border-r border-base-300 bg-base-100 px-6 py-6 shadow-2xl transition-transform duration-300 ease-out ${shown ? "translate-x-0" : "-translate-x-full"}`}
        style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}>
        <ul>
          <li><NavLink to="/" end onClick={onClose} data-autofocus className={link}>Home</NavLink></li>
          <li><NavLink to="/shop" end onClick={onClose} className={link}>All Items</NavLink></li>
          {categories?.map((c) => <li key={c.id}><NavLink to={`/shop/${c.slug}`} onClick={onClose} className={link}>{c.name}</NavLink></li>)}
          <li><NavLink to="/track-order" onClick={onClose} className={link}>Track Order</NavLink></li>
        </ul>
      </nav>
    </div>,
    document.body
  );
}

export default function Header() {
  const openDrawer = useUI((s) => s.openDrawer);
  const count = useCart(cartCount);
  const { data: categories } = useAsync(() => getCategories({ navbar: true }), []);
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();
  const headerRef = useRef(null);

  useEffect(() => { setMenuOpen(false); }, [pathname]);

  const iconBtn = "relative p-2 hover:opacity-60";
  return (
    <header ref={headerRef} className="sticky top-0 z-40 border-b border-base-300 bg-base-100/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1600px] items-center justify-between px-5 lg:px-10">
        <div className="flex items-center gap-10">
          <button className="p-2 md:hidden" aria-label={menuOpen ? "Close menu" : "Open menu"} aria-expanded={menuOpen} aria-controls="mobile-menu" onClick={() => setMenuOpen((o) => !o)}>
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
          <Link to="/" className="flex shrink-0 items-center" aria-label="Parent Of Khan — home">
            <img src="/assets/brand/parentsofkhan.png" alt="Parent Of Khan" className="h-8 w-auto max-w-[40vw] object-contain md:h-9" />
          </Link>
          <nav aria-label="Primary" className="hidden items-center gap-8 text-sm md:flex">
            <NavLink to="/" end className={navCls}>Home</NavLink>
            <NavLink to="/shop" end className={navCls}>All Items</NavLink>
            {categories?.map((c) => (
              <NavLink key={c.id} to={`/shop/${c.slug}`} className={navCls}>{c.name}</NavLink>
            ))}
            <NavLink to="/track-order" className={navCls}>Track Order</NavLink>
          </nav>
        </div>
        <div className="flex items-center gap-1">
          <button className={iconBtn} aria-label="Search" onClick={() => openDrawer("search")}><Search size={20} /></button>
          <button className={iconBtn} aria-label="Account" onClick={() => openDrawer("account")}><User size={20} /></button>
          <button className={iconBtn} aria-label={`Cart, ${count} ${count === 1 ? "item" : "items"}`} onClick={() => openDrawer("cart")}>
            <ShoppingBag size={20} />
            {count > 0 && (
              <span aria-hidden="true" className={`absolute -right-1 -top-1 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-neutral font-medium leading-none tracking-tighter text-neutral-content ring-2 ring-base-100 ${count > 99 ? "text-[0.5rem]" : "text-[0.65rem]"}`}>{count > 99 ? "99+" : count}</span>
            )}
          </button>
        </div>
      </div>
      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} categories={categories} headerRef={headerRef} />
    </header>
  );
}
