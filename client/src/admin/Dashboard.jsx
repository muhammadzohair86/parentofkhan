import { Link } from "react-router-dom";
import { useAsync } from "../hooks/useAsync.js";
import { A } from "./adminApi.js";
import { useAdminAuth, can } from "./useAdminAuth.js";
import { PageHeader, Loading, Notice, money, useReload, btnSm } from "./ui.jsx";

const num = (n) => new Intl.NumberFormat("en-US").format(n);

// Visitors = different people (browsers) counted once per period; page views = every storefront page opened. Last 14 days as bars.
function Visitors({ v }) {
  const max = Math.max(1, ...v.last14.map((d) => d.value));
  const rows = [["Today", "today"], ["Last 7 days", "last7"], ["Last 30 days", "last30"], ["All time", "allTime"]];
  return (
    <section className="mt-8 border border-base-300 p-5" aria-labelledby="visitors-h">
      <h2 id="visitors-h" className="font-display text-2xl">Store visitors</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {rows.map(([label, k]) => (
          <div key={k}><p className="eyebrow opacity-70">{label}</p><p className="mt-2 font-display text-4xl leading-none">{num(v.visitors[k])}</p><p className="mt-1 text-xs opacity-60">{num(v.pageViews[k])} page views</p></div>
        ))}
      </div>
      <figure className="mt-6">
        <figcaption className="eyebrow mb-2 opacity-70">Visitors per day, last 14 days</figcaption>
        <div className="flex h-28 items-end gap-1" role="img" aria-label={`Visitors per day: ${v.last14.map((d) => `${d.day} ${d.value}`).join(", ")}`}>
          {v.last14.map((d) => (
            <div key={d.day} className="flex h-full flex-1 flex-col justify-end" title={`${d.day}: ${d.value} visitor${d.value === 1 ? "" : "s"}, ${d.pageViews} page views`}>
              <div className="bg-neutral" style={{ height: `${Math.max(d.value ? 4 : 1, (d.value / max) * 100)}%`, opacity: d.value ? 1 : 0.2 }} />
            </div>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[0.65rem] opacity-60"><span>{v.last14[0].day}</span><span>{v.last14[13].day}</span></div>
      </figure>
      <p className="mt-4 text-xs opacity-60">Approximate: each browser counts once per day. Crawlers, visitors who block tracking or send Do Not Track, and admin pages are not counted. Counting started when this feature was deployed.</p>
    </section>
  );
}

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
  const [tick, reload] = useReload();
  const { data, loading, error } = useAsync(() => A.get("/dashboard"), [tick]);
  const d = data?.data;
  return (
    <>
      <PageHeader title="Dashboard" subtitle={`Welcome back, ${user.name}.`} />
      {loading ? <Loading /> : error ? <Notice tone="error">Could not load the overview. {error.message} <button className={`${btnSm} ml-2`} onClick={reload}>Try again</button></Notice> : !d || !Object.keys(d).length ? (
        <Notice>Your account does not have access to any reports yet. Ask the master admin to grant permissions.</Notice>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {d.products && <Card label="Active products" value={d.products.active} to={can(user, "products.view") ? "/admin/products" : undefined} note={`${d.products.inactive} inactive · ${d.products.featured} featured`} />}
          {d.categories && <Card label="Categories" value={d.categories.total} to="/admin/categories" note={`${d.categories.active} active`} />}
          {d.orders && <Card label="Orders" value={d.orders.total} to="/admin/orders" note={`${d.orders.inProgress} in progress`} />}
          {d.orders && <Card label="Pending orders" value={d.orders.pending} to="/admin/orders?status=pending" note="Waiting to be confirmed" />}
          {d.messages && <Card label="New messages" value={d.messages.unread} to="/admin/messages?status=new" note={`${d.messages.total} in total`} />}
          {d.visitors && <Card label="Visitors today" value={num(d.visitors.visitors.today)} note={`${num(d.visitors.visitors.last7)} in the last 7 days`} />}
          {d.orders?.revenue && <Card label="Paid revenue" value={money(d.orders.revenue.amount)} note={`${d.orders.revenue.paidOrders} paid order${d.orders.revenue.paidOrders === 1 ? "" : "s"}`} />}
        </div>
      )}
      {d?.visitors && <Visitors v={d.visitors} />}
      {d?.orders && d.orders.total === 0 && (
        <Notice className="mt-6">No orders yet. Orders placed through WhatsApp checkout appear here as soon as they are created. Revenue is shown only for orders marked as paid.</Notice>
      )}
    </>
  );
}
