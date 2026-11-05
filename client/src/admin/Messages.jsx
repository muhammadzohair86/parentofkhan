import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Trash2 } from "lucide-react";
import Pagination from "../components/Pagination.jsx";
import { useAsync } from "../hooks/useAsync.js";
import { A } from "./adminApi.js";
import { useAdminAuth, can } from "./useAdminAuth.js";
import { PageHeader, Loading, Notice, Badge, Confirm, btnSm, dateTime, useReload } from "./ui.jsx";

const sel = "border border-base-300 bg-transparent px-2 py-2 text-sm";
const TONE = { new: "amber", read: "grey", replied: "green" };

export default function Messages() {
  const user = useAdminAuth((s) => s.user);
  const [sp, setSp] = useSearchParams();
  const q = sp.get("q") || "", status = sp.get("status") || "";
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10) || 1);
  const [text, setText] = useState(q);
  const [tick, reload] = useReload();
  const [open, setOpen] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k, v) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); n.delete("page"); setSp(n, { replace: k === "q" }); };
  useEffect(() => { const t = setTimeout(() => { if (text.trim() !== q) set("q", text.trim()); }, 350); return () => clearTimeout(t); /* eslint-disable-next-line */ }, [text]);

  const { data, loading, error } = useAsync(() => A.get("/messages", { q, status, page, limit: 20 }), [q, status, page, tick]);
  const rows = data?.data, meta = data?.meta;
  const manage = can(user, "messages.manage");

  const mark = async (m, next) => { setErr(""); try { await A.patch(`/messages/${m.id}`, { status: next }); reload(); } catch (e) { setErr(e.message); } };
  const toggle = (m) => { setOpen(open === m.id ? null : m.id); if (open !== m.id && m.status === "new" && manage) mark(m, "read"); };
  const remove = async () => { setBusy(true); setErr(""); try { await A.del(`/messages/${toDelete.id}`); setToDelete(null); setOpen(null); reload(); } catch (e) { setErr(e.message); } finally { setBusy(false); } };

  return (
    <>
      <PageHeader title="Messages" subtitle="Messages sent through the Contact page on the store." />
      {meta && <p className="mb-4 text-sm opacity-70">{meta.counts.new} new · {meta.counts.read} read · {meta.counts.replied} replied · {meta.counts.all} total</p>}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Search name, email, subject, message…" aria-label="Search messages" className="field !w-80 !py-2" />
        <select aria-label="Filter by status" value={status} onChange={(e) => set("status", e.target.value)} className={sel}><option value="">Any status</option><option value="new">New</option><option value="read">Read</option><option value="replied">Replied</option></select>
      </div>
      {err && !toDelete && <Notice tone="error" className="mb-4">{err}</Notice>}
      {loading && !rows ? <Loading /> : error ? <Notice tone="error">Could not load messages. {error.message}</Notice> : !rows?.length ? (
        <Notice>{q || status ? "No messages match these filters." : "No messages yet. Messages sent from the Contact page appear here."}</Notice>
      ) : (
        <ul className="divide-y divide-base-300 border border-base-300">
          {rows.map((m) => (
            <li key={m.id} className="p-4">
              <button type="button" className="flex w-full flex-wrap items-center justify-between gap-2 text-left" onClick={() => toggle(m)} aria-expanded={open === m.id}>
                <span className="min-w-0"><span className={m.status === "new" ? "font-semibold" : ""}>{m.subject}</span><span className="block truncate text-xs opacity-60">{m.name} · {m.email}</span></span>
                <span className="flex items-center gap-3 text-xs opacity-70"><Badge tone={TONE[m.status]}>{m.status}</Badge>{dateTime(m.createdAt)}</span>
              </button>
              {open === m.id && (
                <div className="mt-4 space-y-4">
                  <p className="whitespace-pre-wrap border-l-2 border-base-300 pl-4 text-sm leading-relaxed">{m.message}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <a className={btnSm} href={`mailto:${m.email}?subject=${encodeURIComponent(`Re: ${m.subject}`)}`} onClick={() => manage && m.status !== "replied" && mark(m, "replied")}>Reply by email</a>
                    {manage && m.status !== "replied" && <button className={btnSm} onClick={() => mark(m, "replied")}>Mark as replied</button>}
                    {manage && m.status !== "new" && <button className={btnSm} onClick={() => mark(m, "new")}>Mark as unread</button>}
                    {manage && <button className={`${btnSm} inline-flex items-center gap-1 !border-error !text-error`} onClick={() => { setErr(""); setToDelete(m); }}><Trash2 size={14} /> Delete</button>}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {meta && <Pagination page={meta.page} totalPages={meta.totalPages} onChange={(p) => { const n = new URLSearchParams(sp); p > 1 ? n.set("page", String(p)) : n.delete("page"); setSp(n); }} />}
      <Confirm open={!!toDelete} title="Delete this message?" message={toDelete ? `Permanently delete the message from ${toDelete.name}? This cannot be undone.` : ""} confirmLabel="Delete" busy={busy} error={err} onConfirm={remove} onCancel={() => setToDelete(null)} />
    </>
  );
}
