import { Link } from "react-router-dom";
import { useAsync } from "../hooks/useAsync.js";
import { A } from "./adminApi.js";
import { useAdminAuth, can } from "./useAdminAuth.js";
import { PageHeader, Loading, Notice, money } from "./ui.jsx";

function Card({ label, value, note, to }) {
  const body = (
    <div className="h-full border border-base-300 p-5">
      <p className="eyebrow opacity-70">{label}</p>
      <p className="mt-3 font-display text-5xl leading-none">{value}</p>
      {note && <p className="mt-2 text-xs opacity-60">{note}</p>}
    </div>
  );
  return to ? <Link to={to} className="block hover:bg-base-200">{body}</Link> : body;
}

export default function Dashboard() {
  const user = useAdminAuth((s) => s.user);
  const { data, loading, error } = useAsync(() => A.get("/dashboard"), []);
  const d = data?.data;
  return (
    <>
      <PageHeader title="Dashboard" subtitle={`Welcome back, ${user.name}.`} />
      {loading ? <Loading /> : error ? <Notice tone="error">Could not load the overview. {error.message}</Notice> : !d || !Object.keys(d).length ? (
        <Notice>Your account does not have access to any reports yet. Ask the master admin to grant permissions.</Notice>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {d.products && <Card label="Active products" value={d.products.active} to={can(user, "products.view") ? "/admin/products" : undefined} note={`${d.products.inactive} inactive · ${d.products.featured} featured`} />}
          {d.categories && <Card label="Categories" value={d.categories.total} to="/admin/categories" note={`${d.categories.active} active`} />}
          {d.orders && <Card label="Orders" value={d.orders.total} to="/admin/orders" note={`${d.orders.inProgress} in progress`} />}
          {d.orders && <Card label="Pending orders" value={d.orders.pending} to="/admin/orders?status=pending" note="Waiting to be confirmed" />}
          {d.orders?.revenue && <Card label="Paid revenue" value={money(d.orders.revenue.amount)} note={`${d.orders.revenue.paidOrders} paid order${d.orders.revenue.paidOrders === 1 ? "" : "s"}`} />}
        </div>
      )}
      {d?.orders && d.orders.total === 0 && (
        <Notice className="mt-6">No orders yet. Orders appear here once the storefront checkout (a later phase) starts creating them. Revenue is shown only when orders are confirmed as paid.</Notice>
      )}
    </>
  );
}
