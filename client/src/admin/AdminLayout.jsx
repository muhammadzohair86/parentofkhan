import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, Link, useLocation } from "react-router-dom";
import { LayoutDashboard, Shirt, Tags, Package, Users, LogOut, Menu, X, ExternalLink, Image as ImageIcon, Mail, Truck } from "lucide-react";
import { useAdminAuth, can } from "./useAdminAuth.js";
import { useModal, useScrollLock, usePhone } from "../hooks/overlay.js";

const NAV = [
  { to: "/admin", end: true, label: "Dashboard", icon: LayoutDashboard },
  { to: "/admin/products", label: "Products", icon: Shirt, perm: "products.view" },
  { to: "/admin/categories", label: "Categories", icon: Tags, perm: "categories.view" },
  { to: "/admin/orders", label: "Orders", icon: Package, perm: "orders.view" },
  { to: "/admin/shipping", label: "Shipping", icon: Truck, perm: "shipping.view" },
  { to: "/admin/homepage", label: "Homepage", icon: ImageIcon, perm: "site.view" },
  { to: "/admin/subscribers", label: "Subscribers", icon: Mail, perm: "newsletter.view" },
  { to: "/admin/team", label: "Team", icon: Users, perm: "team.view" },
];

function Nav({ items, onNavigate }) {
  const link = ({ isActive }) => `flex items-center gap-3 px-4 py-3 text-sm ${isActive ? "bg-neutral text-neutral-content" : "hover:bg-base-300/50"}`;
  return (
    <nav aria-label="Admin" className="space-y-1">
      {items.map(({ to, end, label, icon: Icon }) => (
        <NavLink key={to} to={to} end={end} onClick={onNavigate} className={link}><Icon size={18} aria-hidden="true" />{label}</NavLink>
      ))}
    </nav>
  );
}

export default function AdminLayout() {
  const user = useAdminAuth((s) => s.user);
  const logout = useAdminAuth((s) => s.logout);
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const phone = usePhone();
  const drawer = useRef(null);
  const items = NAV.filter((n) => !n.perm || can(user, n.perm)); // only what this account may open (the server enforces it too)
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => { if (!phone) setOpen(false); }, [phone]);
  useScrollLock(open);
  useModal(open, drawer, () => setOpen(false), { inert: "main, header" }); // the drawer is not a portal, so only the page behind it goes inert

  const brand = (
    <Link to="/admin" className="block px-4 py-5">
      <span className="font-display text-2xl">Parent Of <span className="italic">Khan</span></span>
      <span className="eyebrow mt-1 block opacity-60">Admin</span>
    </Link>
  );
  const account = (
    <div className="border-t border-base-300 p-4 text-sm">
      <p className="truncate font-medium">{user.name}</p>
      <p className="truncate text-xs opacity-60">{user.role === "master_admin" ? "Master admin" : user.email}</p>
      <div className="mt-3 flex items-center gap-4">
        <a href="/" target="_blank" rel="noreferrer" className="link-u inline-flex items-center gap-1 text-xs">Store <ExternalLink size={12} /></a>
        <button onClick={logout} className="link-u inline-flex items-center gap-1 text-xs"><LogOut size={12} /> Sign out</button>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh md:flex">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-base-300 bg-base-200 md:flex md:sticky md:top-0 md:h-dvh">
        {brand}
        <div className="flex-1 overflow-y-auto px-2"><Nav items={items} /></div>
        {account}
      </aside>

      {/* Mobile top bar + drawer */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-base-300 bg-base-100 px-3 md:hidden">
        <button onClick={() => setOpen(true)} aria-label="Open admin menu" aria-expanded={open} className="p-2"><Menu size={22} /></button>
        <span className="font-display text-xl">Parent Of <span className="italic">Khan</span> · Admin</span>
        <span className="w-10" />
      </header>
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} aria-hidden="true" />
          <aside ref={drawer} role="dialog" aria-modal="true" aria-label="Admin menu" className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-base-200 shadow-2xl">
            <div className="flex items-center justify-between pr-2">{brand}<button onClick={() => setOpen(false)} aria-label="Close menu" data-autofocus className="p-3"><X size={20} /></button></div>
            <div className="flex-1 overflow-y-auto px-2"><Nav items={items} onNavigate={() => setOpen(false)} /></div>
            {account}
          </aside>
        </div>
      )}

      <main className="min-w-0 flex-1 px-4 py-8 md:px-10"><Outlet /></main>
    </div>
  );
}
