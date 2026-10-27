import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import Pagination from "../components/Pagination.jsx";
import { useAsync } from "../hooks/useAsync.js";
import { formatAmount } from "../lib.js";
import { A } from "./adminApi.js";
import { useAdminAuth, can } from "./useAdminAuth.js";
import { PageHeader, Loading, Notice, Badge, Confirm, Modal, Field, Check, btnSm, dateTime, money, useReload } from "./ui.jsx";

const STATUSES = ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled"];
const TONE = { pending: "amber", confirmed: "grey", processing: "grey", shipped: "grey", delivered: "green", cancelled: "red" };
const PAY_TONE = { paid: "green", unpaid: "amber", failed: "red", refunded: "grey" };
const LABEL = { processing: "printing" };
export const StatusBadge = ({ status }) => <Badge tone={TONE[status]}>{LABEL[status] || status}</Badge>;
const sel = "border border-base-300 bg-transparent px-2 py-2 text-sm";

export function OrderList() {
  const [sp, setSp] = useSearchParams();
  const q = sp.get("q") || "", status = sp.get("status") || "", from = sp.get("from") || "", to = sp.get("to") || "";
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10) || 1);
  const [text, setText] = useState(q);
  const set = (k, v) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); n.delete("page"); setSp(n, { replace: k === "q" }); };
  useEffect(() => { const t = setTimeout(() => { if (text.trim() !== q) set("q", text.trim()); }, 350); return () => clearTimeout(t); /* eslint-disable-next-line */ }, [text]);
  useEffect(() => { setText(q); }, [q]);
  const { data, loading, error } = useAsync(() => A.get("/orders", { q, status, from, to, page, limit: 20 }), [q, status, from, to, page]);
  const rows = data?.data, meta = data?.meta;
  const filtered = !!(q || status || from || to);
  return (
    <>
      <PageHeader title="Orders" subtitle="Customer orders and their progress." />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Order number, name or email…" aria-label="Search orders" className="field !w-72 !py-2" />
        <select aria-label="Filter by status" value={status} onChange={(e) => set("status", e.target.value)} className={sel}><option value="">Any status</option>{STATUSES.map((s) => <option key={s} value={s}>{LABEL[s] || s}</option>)}</select>
        <label className="flex items-center gap-2 text-sm">From <input type="date" value={from} max={to || undefined} onChange={(e) => set("from", e.target.value)} className={sel} /></label>
        <label className="flex items-center gap-2 text-sm">To <input type="date" value={to} min={from || undefined} onChange={(e) => set("to", e.target.value)} className={sel} /></label>
      </div>
      {loading && !rows ? <Loading /> : error ? <Notice tone="error">Could not load orders. {error.message}</Notice> : !rows?.length ? (
        <Notice>{filtered ? "No orders match these filters." : "No orders yet. Orders will appear here once the storefront checkout (a later phase) starts creating them."}</Notice>
      ) : (
        <div className="overflow-x-auto border border-base-300">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-base-300 bg-base-200 text-xs uppercase tracking-wider"><tr><th className="p-3">Order</th><th className="p-3">Customer</th><th className="p-3">Date</th><th className="p-3">Items</th><th className="p-3">Total</th><th className="p-3">Payment</th><th className="p-3">Status</th></tr></thead>
            <tbody className="divide-y divide-base-300">
              {rows.map((o) => (
                <tr key={o.id} className="hover:bg-base-200/60">
                  <td className="p-3"><Link to={`/admin/orders/${o.id}`} className="link-u font-medium">{o.orderNumber}</Link></td>
                  <td className="p-3"><p>{o.customerName}</p><p className="text-xs opacity-60">{o.customerEmail}</p></td>
                  <td className="p-3 whitespace-nowrap">{dateTime(o.createdAt)}</td><td className="p-3">{o.itemCount}</td><td className="p-3 whitespace-nowrap">{money(o.total)}</td>
                  <td className="p-3"><Badge tone={PAY_TONE[o.paymentStatus]}>{o.paymentStatus}</Badge></td><td className="p-3"><StatusBadge status={o.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {meta && <Pagination page={meta.page} totalPages={meta.totalPages} onChange={(p) => { const n = new URLSearchParams(sp); p > 1 ? n.set("page", String(p)) : n.delete("page"); setSp(n); }} />}
    </>
  );
}

// ---- Courier details (entered by hand: fulfilment is manual, so nothing here is ever generated) ----
const dateOnly = (iso) => (iso ? new Date(iso).toISOString().slice(0, 10) : "");
const errorsByField = (e) => Object.fromEntries((e?.details || []).filter((d) => d.path).map((d) => [d.path.replace(/^shipment\./, ""), d.message]));

// mode "dispatch": marks the order as shipped together with these details. mode "edit": saves the details only; the status is never touched.
function ShipmentForm({ order, mode, onDone, onCancel }) {
  const s = order.shipment;
  const [f, setF] = useState({ carrier: s.carrier || "NLS Xpress", trackingNumber: s.trackingNumber, trackingUrl: s.trackingUrl, dispatchedAt: dateOnly(s.dispatchedAt) || (mode === "dispatch" ? new Date().toISOString().slice(0, 10) : ""), estimatedDelivery: s.estimatedDelivery, internalNote: s.internalNote });
  const [noTracking, setNoTracking] = useState(false);
  const [unpaidOk, setUnpaidOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const errs = errorsByField(err);
  const set = (k, v) => { setErr(null); setF((x) => ({ ...x, [k]: v })); };
  const dispatch = mode === "dispatch";
  const unpaid = order.payment.status !== "paid";
  const missingTracking = dispatch && !f.trackingNumber.trim();
  const blocked = (missingTracking && !noTracking) || (dispatch && unpaid && !unpaidOk);

  const submit = async (e) => {
    e.preventDefault();
    if (busy || blocked) return;
    setBusy(true); setErr(null);
    const shipment = { carrier: f.carrier, trackingNumber: f.trackingNumber, trackingUrl: f.trackingUrl, dispatchedAt: f.dispatchedAt, estimatedDelivery: f.estimatedDelivery, internalNote: f.internalNote };
    try {
      if (dispatch) await A.patch(`/orders/${order.id}/status`, { status: "shipped", shipment, allowWithoutTracking: noTracking, acknowledgeUnpaid: unpaidOk });
      else await A.patch(`/orders/${order.id}/shipment`, shipment);
      onDone(dispatch ? "Order marked as shipped." : "Shipment details saved.");
    } catch (e2) { setErr(e2); setBusy(false); }
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {err && <Notice tone="error">{err.details?.length ? "Please check the highlighted fields." : err.message}</Notice>}
      {dispatch && <p className="text-xs opacity-70">Fulfilment is manual: enter the tracking number NLS Xpress gave you. Customers see it (and the link) once the order is shipped. Nothing is generated automatically.</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Carrier / service" error={errs.carrier}><input className="field" value={f.carrier} maxLength={60} onChange={(e) => set("carrier", e.target.value)} /></Field>
        <Field label="Tracking / consignment number" error={errs.trackingNumber}><input className="field" value={f.trackingNumber} maxLength={60} onChange={(e) => set("trackingNumber", e.target.value)} autoComplete="off" /></Field>
      </div>
      <Field label="Tracking link (optional)" error={errs.trackingUrl} hint="A full https:// link to the courier's tracking page for this parcel. Leave it empty if you have none: customers will then just see the number.">
        <input className="field" type="url" inputMode="url" value={f.trackingUrl} maxLength={500} onChange={(e) => set("trackingUrl", e.target.value)} placeholder="https://" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Dispatch date" error={errs.dispatchedAt}><input className="field" type="date" value={f.dispatchedAt} onChange={(e) => set("dispatchedAt", e.target.value)} /></Field>
        <Field label="Estimated delivery (optional)" error={errs.estimatedDelivery} hint="Text shown to the customer, e.g. “3-5 working days”."><input className="field" value={f.estimatedDelivery} maxLength={80} onChange={(e) => set("estimatedDelivery", e.target.value)} /></Field>
      </div>
      <Field label="Internal note (only admins see this)" error={errs.internalNote}><textarea className="field !py-2" rows={2} maxLength={500} value={f.internalNote} onChange={(e) => set("internalNote", e.target.value)} /></Field>
      {missingTracking && (
        <div className="space-y-2 border border-error p-3 text-sm">
          <p>No tracking number entered. Customers will see that the order has shipped, with a note that the tracking number will appear later.</p>
          <Check label="Ship without a tracking number (I'll add it later)" checked={noTracking} onChange={setNoTracking} />
        </div>
      )}
      {dispatch && unpaid && (
        <div className="space-y-2 border border-error p-3 text-sm">
          <p>This order has <strong>not been paid online</strong> (payment: {order.payment.status}). Abandoned checkouts also look like this.</p>
          <Check label="I have confirmed payment was received another way" checked={unpaidOk} onChange={setUnpaidOk} />
        </div>
      )}
      <div className="flex justify-end gap-3 pt-2">
        <button type="button" className={btnSm} onClick={onCancel} disabled={busy}>Cancel</button>
        <button className="btn-khan !py-2 !text-xs" disabled={busy || blocked}>{busy ? "Saving…" : dispatch ? "Mark as shipped" : "Save shipment details"}</button>
      </div>
    </form>
  );
}

export function OrderDetail() {
  const { id } = useParams();
  const user = useAdminAuth((s) => s.user);
  const [tick, reload] = useReload();
  const { data, loading, error } = useAsync(() => A.get(`/orders/${id}`), [id, tick]);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(null); // status awaiting confirmation
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ship, setShip] = useState(null);   // null | "dispatch" | "edit": the courier-details dialog
  const [done, setDone] = useState("");
  const o = data?.data;
  if (loading && !o) return <Loading />;
  if (error) return <Notice tone="error">{error.status === 404 ? "Order not found." : error.message} <Link to="/admin/orders" className="link-u">Back to orders</Link></Notice>;

  const apply = async () => {
    setBusy(true); setErr("");
    try { await A.patch(`/orders/${id}/status`, { status: pending, note }); setPending(null); setNote(""); reload(); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };
  const canUpdate = can(user, "orders.update");
  const a = o.shippingAddress || {};
  return (
    <>
      <PageHeader title={o.orderNumber} subtitle={`Placed ${dateTime(o.createdAt)}`}><Link to="/admin/orders" className={btnSm}>Back</Link></PageHeader>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="border border-base-300">
            <h2 className="border-b border-base-300 bg-base-200 p-3 text-xs uppercase tracking-wider">Items</h2>
            <ul className="divide-y divide-base-300">
              {o.items.map((i, n) => (
                <li key={n} className="flex items-center gap-4 p-3">
                  <div className="h-16 w-12 shrink-0 overflow-hidden bg-base-200">{i.image && <img src={i.image} alt="" className="h-full w-full object-cover" />}</div>
                  <div className="min-w-0 flex-1"><p className="truncate font-medium">{i.name}</p><p className="text-xs opacity-60">{i.color} · {i.size}{i.sku ? ` · ${i.sku}` : ""} · {money(i.unitPrice)} × {i.quantity}</p></div>
                  <p className="text-sm">{money(i.lineTotal)}</p>
                </li>
              ))}
            </ul>
            <dl className="space-y-1 border-t border-base-300 p-3 text-sm">
              <div className="flex justify-between"><dt>Subtotal</dt><dd>{money(o.subtotal)}</dd></div>
              <div className="flex justify-between"><dt>Shipping</dt><dd>{money(o.shipping)}</dd></div>
              {o.shippingDetails && (
                <div>
                  <dt className="sr-only">Shipping details</dt>
                  <dd className="text-xs opacity-70">
                    {o.shippingDetails.courier} · {o.shippingDetails.destinationName} · {o.shippingDetails.freeShipping ? "Free Shipping" : `charged ${formatAmount(o.shippingDetails.amount, o.shippingDetails.currency)}`}
                    {o.shippingDetails.billableWeightKg != null ? ` · ${o.shippingDetails.billableWeightKg} kg billable` : ""}
                    {o.shippingDetails.deliveryEstimate ? ` · estimate: ${o.shippingDetails.deliveryEstimate}` : ""}
                  </dd>
                </div>
              )}
              {o.discount > 0 && <div className="flex justify-between"><dt>Discount</dt><dd>−{money(o.discount)}</dd></div>}
              <div className="flex justify-between border-t border-base-300 pt-2 font-medium"><dt>Total</dt><dd>{money(o.total)} {o.currency}</dd></div>
            </dl>
          </section>
          <section className="border border-base-300">
            <h2 className="border-b border-base-300 bg-base-200 p-3 text-xs uppercase tracking-wider">History</h2>
            <ol className="divide-y divide-base-300 text-sm">
              {o.statusHistory.length === 0 && <li className="p-3 opacity-60">No status changes recorded yet.</li>}
              {[...o.statusHistory].reverse().map((h, n) => <li key={n} className="p-3"><p>{h.kind === "payment" ? <strong>Payment</strong> : h.kind === "shipment" ? <strong>Shipment details</strong> : <>{h.from ? <>{LABEL[h.from] || h.from} → </> : null}<strong>{LABEL[h.to] || h.to}</strong></>} <span className="opacity-60">· {dateTime(h.at)}{h.byName ? ` · ${h.byName}` : ""}</span></p>{h.note && <p className="mt-1 opacity-70">{h.note}</p>}</li>)}
            </ol>
          </section>
        </div>
        <div className="space-y-6">
          <section className="space-y-3 border border-base-300 p-4 text-sm">
            <p className="eyebrow opacity-70">Status</p>
            <div className="flex flex-wrap items-center gap-2"><StatusBadge status={o.status} /><Badge tone={PAY_TONE[o.payment.status]}>payment: {o.payment.status}</Badge></div>
            {o.payment.method && <p className="text-xs opacity-70">Payment method: {o.payment.method}{o.payment.environment === "sandbox" ? " (sandbox: test payment, not real money)" : ""}{o.payment.reference ? ` (${o.payment.reference})` : ""}{o.payment.paidAt ? ` · paid ${new Date(o.payment.paidAt).toLocaleString()}` : ""}</p>}
            <p className="text-xs opacity-60">Changing the order status never marks it as paid.</p>
            {canUpdate && o.allowedNext.length > 0 && (
              <div className="space-y-2 border-t border-base-300 pt-3">
                <label className="block"><span className="eyebrow mb-1 block">Note (optional)</span><textarea className="field !py-2" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></label>
                <div className="flex flex-wrap gap-2">{o.allowedNext.map((s) => <button key={s} className={s === "cancelled" ? `${btnSm} !border-error !text-error` : btnSm} onClick={() => { setErr(""); setDone(""); if (s === "shipped") setShip("dispatch"); else setPending(s); }}>Mark {LABEL[s] || s}</button>)}</div>
              </div>
            )}
            {o.allowedNext.length === 0 && <p className="text-xs opacity-60">This order is {o.status}; no further changes are possible.</p>}
          </section>
          {o.status !== "cancelled" && (
            <section className="space-y-2 border border-base-300 p-4 text-sm">
              <p className="eyebrow opacity-70">Shipment</p>
              {done && <Notice tone="success">{done}</Notice>}
              {o.shipment.trackingNumber || o.shipment.trackingUrl || o.shipment.carrier ? (
                <dl className="space-y-1">
                  <div className="flex justify-between gap-3"><dt className="opacity-60">Carrier</dt><dd>{o.shipment.carrier || "NLS Xpress"}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="opacity-60">Tracking no.</dt><dd className="select-all">{o.shipment.trackingNumber || "not entered"}</dd></div>
                  {o.shipment.trackingUrl && <div className="flex justify-between gap-3"><dt className="opacity-60">Link</dt><dd className="min-w-0 truncate"><a className="link-u" href={o.shipment.trackingUrl} target="_blank" rel="noopener noreferrer nofollow">{o.shipment.trackingUrl}</a></dd></div>}
                  {o.shipment.dispatchedAt && <div className="flex justify-between gap-3"><dt className="opacity-60">Dispatched</dt><dd>{dateTime(o.shipment.dispatchedAt)}</dd></div>}
                  {o.shipment.estimatedDelivery && <div className="flex justify-between gap-3"><dt className="opacity-60">Estimate</dt><dd>{o.shipment.estimatedDelivery}</dd></div>}
                  {o.shipment.internalNote && <div><dt className="opacity-60">Internal note</dt><dd>{o.shipment.internalNote}</dd></div>}
                </dl>
              ) : <p className="text-xs opacity-60">No courier details yet. Add them when you ship the order.</p>}
              {(o.status === "shipped" || o.status === "delivered") && !o.shipment.trackingNumber && <p className="text-xs text-error">Shipped without a tracking number: the customer sees that it will appear later.</p>}
              {(o.status === "pending" || o.status === "confirmed" || o.status === "processing") && <p className="text-xs opacity-60">Customers see tracking details only after the order is marked shipped.</p>}
              {canUpdate && <button className={btnSm} onClick={() => { setDone(""); setShip("edit"); }}>{o.shipment.trackingNumber ? "Edit shipment details" : "Add shipment details"}</button>}
            </section>
          )}
          <section className="space-y-1 border border-base-300 p-4 text-sm"><p className="eyebrow mb-2 opacity-70">Customer</p><p>{o.customer.name}</p><p><a className="link-u" href={`mailto:${o.customer.email}`}>{o.customer.email}</a></p>{o.customer.phone && <p>{o.customer.phone}</p>}</section>
          <section className="space-y-1 border border-base-300 p-4 text-sm"><p className="eyebrow mb-2 opacity-70">Ship to</p><p>{a.line1}</p>{a.line2 && <p>{a.line2}</p>}<p>{[a.city, a.region, a.postalCode].filter(Boolean).join(", ")}</p><p>{a.country}</p></section>
        </div>
      </div>
      <Modal open={!!ship} title={ship === "dispatch" ? `Mark ${o.orderNumber} as shipped` : "Shipment details"} onClose={() => setShip(null)}>
        {ship && <ShipmentForm key={ship} order={o} mode={ship} onCancel={() => setShip(null)} onDone={(msg) => { setShip(null); setDone(msg); reload(); }} />}
      </Modal>
      <Confirm open={!!pending} title="Update order status?" busy={busy} error={err} confirmLabel="Confirm"
        message={pending ? `Move ${o.orderNumber} from “${LABEL[o.status] || o.status}” to “${LABEL[pending] || pending}”?${pending === "cancelled" ? " Cancelled orders cannot be reopened." : ""}` : ""}
        onConfirm={apply} onCancel={() => setPending(null)} />
    </>
  );
}
