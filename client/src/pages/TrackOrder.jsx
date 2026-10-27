import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../store/useAuth.js";
import { useTitle } from "../hooks/useAsync.js";
import { lookupOrder, getMyOrders } from "../services/payments.js";
import { getRecentOrders, rememberOrder, forgetOrder } from "../lib/recentOrders.js";
import { money } from "../lib.js";

const PAY = { paid: "Paid", pending: "Pending", failed: "Failed", refunded: "Refunded" };
const date = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" }) : "");

export default function TrackOrder() {
  useTitle("Track your order");
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const init = useAuth((s) => s.init);
  useEffect(() => { init(); }, [init]);

  // Signed-in customers: their own orders (the server returns only orders placed under this account).
  const [mine, setMine] = useState({ status: "idle", rows: [] });
  useEffect(() => {
    if (!user) { setMine({ status: "idle", rows: [] }); return undefined; }
    let live = true;
    setMine({ status: "loading", rows: [] });
    getMyOrders().then((rows) => live && setMine({ status: "ready", rows }), () => live && setMine({ status: "error", rows: [] }));
    return () => { live = false; };
  }, [user]);

  // Guests (and anyone): order reference + the email used at checkout. The server answers any mismatch with the same message.
  const [f, setF] = useState({ orderNumber: "", email: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrs, setFieldErrs] = useState({});
  const set = (k, v) => { setF((s) => ({ ...s, [k]: v })); setError(""); setFieldErrs({}); };
  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError(""); setFieldErrs({});
    try {
      const r = await lookupOrder({ orderNumber: f.orderNumber.trim(), email: f.email.trim() });
      rememberOrder(r.orderNumber, r.token);
      navigate(r.path);
    } catch (err) {
      setBusy(false);
      if (err?.code === "VALIDATION_ERROR" && Array.isArray(err.details)) setFieldErrs(Object.fromEntries(err.details.filter((d) => d.path).map((d) => [d.path, d.message])));
      else if (err?.status === 404 || err?.status === 429) setError(err.message);
      else setError("We couldn't check that right now. Please try again in a moment.");
    }
  };

  // Orders opened on this device (a shortcut only: each one is still loaded from the server).
  const [recent, setRecent] = useState(() => getRecentOrders());
  const remove = (n) => { forgetOrder(n); setRecent(getRecentOrders()); };

  return (
    <div className="mx-auto max-w-3xl px-5 py-12 lg:px-10">
      <h1 className="font-display text-5xl md:text-6xl">Track your order</h1>
      <p className="mt-4 text-sm opacity-70">Check where your order is, see its payment status and follow your shipment.</p>

      {user && (
        <section className="mt-10" aria-labelledby="to-mine">
          <h2 id="to-mine" className="eyebrow mb-3">Your orders</h2>
          {mine.status === "loading" && <p role="status" className="text-sm opacity-70">Loading your orders…</p>}
          {mine.status === "error" && <p role="alert" className="text-sm text-error">We couldn't load your orders. Please try again in a moment.</p>}
          {mine.status === "ready" && mine.rows.length === 0 && <p className="text-sm opacity-70">No orders are linked to your account yet. If you checked out as a guest, find that order below.</p>}
          {mine.rows.length > 0 && (
            <ul className="divide-y divide-base-300 border border-base-300">
              {mine.rows.map((o) => (
                <li key={o.orderNumber}>
                  <Link to={`/account/orders/${o.orderNumber}`} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm hover:bg-base-200">
                    <span><span className="block font-medium">{o.orderNumber}</span><span className="block text-xs opacity-60">{date(o.placedAt)} · {o.itemCount} item{o.itemCount === 1 ? "" : "s"}</span></span>
                    <span className="text-right"><span className="block font-medium">{o.statusLabel}</span><span className="block text-xs opacity-60">{PAY[o.paymentStatus] || "Pending"} · {money(o.total)} {o.currency}</span></span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="mt-10" aria-labelledby="to-find">
        <h2 id="to-find" className="eyebrow mb-3">Find an order</h2>
        <form onSubmit={submit} noValidate className="space-y-4 border border-base-300 p-5">
          <label className="block">
            <span className="eyebrow mb-2 block">Order reference</span>
            <input className="field" autoComplete="off" autoCapitalize="characters" placeholder="POK-261024-ABC123" value={f.orderNumber} maxLength={24} aria-invalid={!!fieldErrs.orderNumber} onChange={(e) => set("orderNumber", e.target.value)} />
            {fieldErrs.orderNumber && <span role="alert" className="mt-1 block text-xs text-error">{fieldErrs.orderNumber}</span>}
          </label>
          <label className="block">
            <span className="eyebrow mb-2 block">Email used at checkout</span>
            <input className="field" type="email" autoComplete="email" value={f.email} maxLength={254} aria-invalid={!!fieldErrs.email} onChange={(e) => set("email", e.target.value)} />
            {fieldErrs.email && <span role="alert" className="mt-1 block text-xs text-error">{fieldErrs.email}</span>}
          </label>
          {error && <p role="alert" className="border border-error p-3 text-sm text-error">{error}</p>}
          <button className="btn-khan" disabled={busy}>{busy ? "Checking…" : "Track order"}</button>
        </form>
      </section>

      {recent.length > 0 && (
        <section className="mt-10" aria-labelledby="to-recent">
          <h2 id="to-recent" className="eyebrow mb-3">Orders on this device</h2>
          <ul className="divide-y divide-base-300 border border-base-300">
            {recent.map((o) => (
              <li key={o.orderNumber} className="flex items-center justify-between gap-3 p-4 text-sm">
                <Link to={`/order/${o.orderNumber}/${o.token}`} className="link-u font-medium">{o.orderNumber}</Link>
                <span className="flex items-center gap-4"><span className="text-xs opacity-60">{date(o.at)}</span><button type="button" className="text-xs underline opacity-70" onClick={() => remove(o.orderNumber)} aria-label={`Remove ${o.orderNumber} from this device`}>Remove</button></span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs opacity-60">These links are saved only in this browser. On a shared computer, remove them when you're done.</p>
        </section>
      )}
    </div>
  );
}
