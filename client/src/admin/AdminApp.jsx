import { useEffect } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useAdminAuth, can } from "./useAdminAuth.js";
import AdminLayout from "./AdminLayout.jsx";
import Login from "./Login.jsx";
import Dashboard from "./Dashboard.jsx";
import Products from "./Products.jsx";
import ProductForm from "./ProductForm.jsx";
import Categories from "./Categories.jsx";
import { OrderList, OrderDetail } from "./Orders.jsx";
import Team from "./Team.jsx";
import SiteHero from "./SiteHero.jsx";
import Subscribers from "./Subscribers.jsx";
import Shipping from "./Shipping.jsx";
import { Loading, Notice } from "./ui.jsx";

// Redirects visitors without a session to the login screen.
function RequireSession() {
  const { user, ready } = useAdminAuth();
  const loc = useLocation();
  if (!ready) return <Loading label="Checking your session…" />;
  if (!user) return <Navigate to="/admin/login" replace state={{ from: loc.pathname + loc.search }} />;
  return <AdminLayout />;
}

// Shows a clear message (instead of a broken page) when the account lacks a permission. The server enforces the same rule.
function Need({ perm, children }) {
  const user = useAdminAuth((s) => s.user);
  return can(user, perm) ? children : <Notice tone="error">You do not have access to this section. Ask the master admin for the “{perm}” permission.</Notice>;
}

export default function AdminApp() {
  const init = useAdminAuth((s) => s.init);
  useEffect(() => {
    init();
    document.title = "Admin — Parent Of Khan";
    const meta = Object.assign(document.createElement("meta"), { name: "robots", content: "noindex,nofollow" });
    document.head.appendChild(meta);
    return () => meta.remove();
  }, [init]);
  return (
    <Routes>
      <Route path="login" element={<Login />} />
      <Route element={<RequireSession />}>
        <Route index element={<Dashboard />} />
        <Route path="products" element={<Need perm="products.view"><Products /></Need>} />
        <Route path="products/new" element={<Need perm="products.create"><ProductForm /></Need>} />
        <Route path="products/:id" element={<Need perm="products.view"><ProductForm /></Need>} />
        <Route path="categories" element={<Need perm="categories.view"><Categories /></Need>} />
        <Route path="orders" element={<Need perm="orders.view"><OrderList /></Need>} />
        <Route path="orders/:id" element={<Need perm="orders.view"><OrderDetail /></Need>} />
        <Route path="homepage" element={<Need perm="site.view"><SiteHero /></Need>} />
        <Route path="shipping" element={<Need perm="shipping.view"><Shipping /></Need>} />
        <Route path="subscribers" element={<Need perm="newsletter.view"><Subscribers /></Need>} />
        <Route path="team" element={<Need perm="team.view"><Team /></Need>} />
        <Route path="*" element={<Notice>That admin page does not exist.</Notice>} />
      </Route>
    </Routes>
  );
}
