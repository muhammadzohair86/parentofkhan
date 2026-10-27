import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Download, Trash2 } from "lucide-react";
import Pagination from "../components/Pagination.jsx";
import { useAsync } from "../hooks/useAsync.js";
import { API_BASE } from "../services/api.js";
import { A } from "./adminApi.js";
import { useAdminAuth, can } from "./useAdminAuth.js";
import { PageHeader, Loading, Notice, Badge, Confirm, btnSm, dateTime, useReload } from "./ui.jsx";

const sel = "border border-base-300 bg-transparent px-2 py-2 text-sm";
const Stat = ({ label, value }) => <div className="border border-base-300 p-4"><p className="eyebrow opacity-70">{label}</p><p className="mt-2 font-display text-4xl leading-none">{value}</p></div>;

export default function Subscribers() {
  const user = useAdminAuth((s) => s.user);
  const [sp, setSp] = useSearchParams();
  const q = sp.get("q") || "", status = sp.get("status") || "";
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10) || 1);
  const [text, setText] = useState(q);
  const [tick, reload] = useReload();
  const [toDelete, setToDelete] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k, v) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); n.delete("page"); setSp(n, { replace: k === "q" }); };
  useEffect(() => { const t = setTimeout(() => { if (text.trim() !== q) set("q", text.trim()); }, 350); return () => clearTimeout(t); /* eslint-disable-next-line */ }, [text]);
  useEffect(() => { setText(q); }, [q]);

  const { data, loading, error } = useAsync(() => A.get("/subscribers", { q, status, page, limit: 25 }), [q, status, page, tick]);
  const rows = data?.data, meta = data?.meta;
  const manage = can(user, "newsletter.manage");
  const exportHref = `${API_BASE}/admin/subscribers/export?${new URLSearchParams({ ...(q ? { q } : {}), ...(status ? { status } : {}) })}`;

  const toggle = async (s) => {
    setErr("");
    try { await A.patch(`/subscribers/${s.id}`, { status: s.status === "subscribed" ? "unsubscribed" : "subscribed" }); reload(); }
    catch (e) { setErr(e.message); }
  };
  const remove = async () => {
    setBusy(true); setErr("");
    try { await A.del(`/subscribers/${toDelete.id}`); setToDelete(null); reload(); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader title="Newsletter subscribers" subtitle="People who signed up in the store footer.">
        <a href={exportHref} download className={`${btnSm} inline-flex items-center gap-2`}><Download size={14} /> Export CSV</a>
      </PageHeader>
      {meta && (
        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          <Stat label="Total subscribers" value={meta.counts.all} /><Stat label="Subscribed" value={meta.counts.subscribed} /><Stat label="Unsubscribed" value={meta.counts.unsubscribed} />
        </div>
      )}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Search by email…" aria-label="Search subscribers by email" className="field !w-72 !py-2" />
        <select aria-label="Filter by status" value={status} onChange={(e) => set("status", e.target.value)} className={sel}><option value="">Any status</option><option value="subscribed">Subscribed</option><option value="unsubscribed">Unsubscribed</option></select>
      </div>
      {err && !toDelete && <Notice tone="error" className="mb-4">{err}</Notice>}
      {loading && !rows ? <Loading /> : error ? <Notice tone="error">Could not load subscribers. {error.message}</Notice> : !rows?.length ? (
        <Notice>{q || status ? "No subscribers match these filters." : "No subscribers yet. Sign-ups from the store footer will appear here."}</Notice>
      ) : (
        <div className="overflow-x-auto border border-base-300">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-base-300 bg-base-200 text-xs uppercase tracking-wider"><tr><th className="p-3">Email</th><th className="p-3">Subscribed</th><th className="p-3">Status</th>{manage && <th className="p-3 text-right">Actions</th>}</tr></thead>
            <tbody className="divide-y divide-base-300">
              {rows.map((s) => (
                <tr key={s.id}>
                  <td className="p-3 break-all font-medium">{s.email}</td>
                  <td className="p-3 whitespace-nowrap">{dateTime(s.createdAt)}</td>
                  <td className="p-3"><Badge tone={s.status === "subscribed" ? "green" : "grey"}>{s.status}</Badge>{s.unsubscribedAt && <span className="ml-2 text-xs opacity-60">{dateTime(s.unsubscribedAt)}</span>}</td>
                  {manage && <td className="p-3"><div className="flex justify-end gap-2">
                    <button className={btnSm} onClick={() => toggle(s)}>{s.status === "subscribed" ? "Unsubscribe" : "Resubscribe"}</button>
                    <button className={`${btnSm} !border-error !text-error`} onClick={() => { setErr(""); setToDelete(s); }} aria-label={`Delete ${s.email}`}><Trash2 size={14} /></button>
                  </div></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {meta && <Pagination page={meta.page} totalPages={meta.totalPages} onChange={(p) => { const n = new URLSearchParams(sp); p > 1 ? n.set("page", String(p)) : n.delete("page"); setSp(n); }} />}
      {meta && <p className="mt-3 text-center text-xs opacity-60">{meta.total} shown by the current filters</p>}
      <Confirm open={!!toDelete} title="Delete subscriber?" busy={busy} error={toDelete ? err : ""} confirmLabel="Delete subscriber"
        message={toDelete ? `${toDelete.email} will be permanently removed from the list. If you only want to stop emailing them, use Unsubscribe instead.` : ""} onConfirm={remove} onCancel={() => setToDelete(null)} />
    </>
  );
}
