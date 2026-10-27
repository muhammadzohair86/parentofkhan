import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Plus, Pencil, Trash2, ExternalLink } from "lucide-react";
import Pagination from "../components/Pagination.jsx";
import { useAsync } from "../hooks/useAsync.js";
import { A } from "./adminApi.js";
import { useAdminAuth, can } from "./useAdminAuth.js";
import { PageHeader, Loading, Notice, Badge, Confirm, Check, btnSm, useReload, money } from "./ui.jsx";

const sel = "border border-base-300 bg-transparent px-2 py-2 text-sm";

function Thumb({ src }) {
  const [bad, setBad] = useState(false);
  return <div className="h-14 w-11 shrink-0 overflow-hidden bg-base-200">{src && !bad && <img src={src} alt="" onError={() => setBad(true)} className="h-full w-full object-cover" />}</div>;
}

export default function Products() {
  const user = useAdminAuth((s) => s.user);
  const [sp, setSp] = useSearchParams();
  const q = sp.get("q") || "", category = sp.get("category") || "", active = sp.get("active") || "", featured = sp.get("featured") || "";
  const sort = sp.get("sort") || "updated";
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10) || 1);
  const [text, setText] = useState(q);
  const [tick, reload] = useReload();
  const [busyId, setBusyId] = useState("");
  const [toDelete, setToDelete] = useState(null);
  const [actionError, setActionError] = useState("");
  const [deleting, setDeleting] = useState(false);

  const set = (k, v) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); n.delete("page"); setSp(n, { replace: k === "q" }); };
  useEffect(() => { const t = setTimeout(() => { if (text.trim() !== q) set("q", text.trim()); }, 350); return () => clearTimeout(t); /* eslint-disable-next-line */ }, [text]);
  useEffect(() => { setText(q); }, [q]);

  const list = useAsync(() => A.get("/products", { q, category, active, featured, sort, page, limit: 20 }), [q, category, active, featured, sort, page, tick]);
  const cats = useAsync(() => A.get("/categories/options").catch(() => ({ data: [] })), []); // view-only accounts may not see categories: the filter just hides
  const rows = list.data?.data, meta = list.data?.meta;

  const patch = async (p, body) => {
    setBusyId(p.id); setActionError("");
    try { await A.patch(`/products/${p.id}`, body); reload(); }
    catch (e) { setActionError(`${p.name}: ${e.message}`); }
    finally { setBusyId(""); }
  };
  const remove = async () => {
    setDeleting(true); setActionError("");
    try { await A.del(`/products/${toDelete.id}`); setToDelete(null); reload(); }
    catch (e) { setActionError(e.message); }
    finally { setDeleting(false); }
  };
  const setPage = (p) => { const n = new URLSearchParams(sp); p > 1 ? n.set("page", String(p)) : n.delete("page"); setSp(n); };

  return (
    <>
      <PageHeader title="Products" subtitle="Manage everything shown in the store.">
        {can(user, "products.create") && <Link to="/admin/products/new" className="btn-khan !py-2.5"><Plus size={16} /> New product</Link>}
      </PageHeader>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Search name, slug or tag…" aria-label="Search products" className="field !w-64 !py-2" />
        {cats.data?.data?.length > 0 && (
          <select aria-label="Filter by category" value={category} onChange={(e) => set("category", e.target.value)} className={sel}>
            <option value="">All categories</option>{cats.data.data.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        <select aria-label="Filter by status" value={active} onChange={(e) => set("active", e.target.value)} className={sel}><option value="">Any status</option><option value="true">Active</option><option value="false">Inactive</option></select>
        <select aria-label="Filter by featured" value={featured} onChange={(e) => set("featured", e.target.value)} className={sel}><option value="">Featured or not</option><option value="true">Featured</option><option value="false">Not featured</option></select>
        <select aria-label="Sort" value={sort} onChange={(e) => set("sort", e.target.value === "updated" ? "" : e.target.value)} className={sel}>
          <option value="updated">Recently updated</option><option value="created">Newest</option><option value="name">Name A–Z</option>
          <option value="price">Price: low to high</option><option value="price-desc">Price: high to low</option><option value="order">Store order</option>
        </select>
      </div>

      {actionError && <Notice tone="error" className="mb-4">{actionError}</Notice>}
      {list.loading && !rows ? <Loading /> : list.error ? <Notice tone="error">Could not load products. {list.error.message}</Notice> : !rows?.length ? (
        <Notice>{q || category || active || featured ? "No products match these filters." : "No products yet. Create your first product."}</Notice>
      ) : (
        <div className="overflow-x-auto border border-base-300">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="border-b border-base-300 bg-base-200 text-xs uppercase tracking-wider"><tr>
              <th className="p-3">Product</th><th className="p-3">Category</th><th className="p-3">Price</th><th className="p-3">Colors</th>
              <th className="p-3">Active</th><th className="p-3">Featured</th><th className="p-3">Order</th><th className="p-3 text-right">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-base-300">
              {rows.map((p) => (
                <tr key={p.id} className={busyId === p.id ? "opacity-50" : ""}>
                  <td className="p-3"><div className="flex items-center gap-3"><Thumb src={p.image} />
                    <div className="min-w-0"><p className="truncate font-medium">{p.name} {p.isDemo && <Badge>Demo</Badge>}</p><p className="truncate text-xs opacity-60">/{p.slug}</p></div></div></td>
                  <td className="p-3">{p.category?.name || <span className="text-error">—</span>}</td>
                  <td className="p-3 whitespace-nowrap">{p.salePrice != null ? <><span className="mr-1 line-through opacity-50">{money(p.price)}</span>{money(p.salePrice)}</> : money(p.price)}</td>
                  <td className="p-3"><div className="flex gap-1">{p.colors.map((c) => <span key={c.color} title={c.color} className="h-4 w-4 border border-black/30" style={{ background: c.hex }} />)}</div></td>
                  <td className="p-3"><Check label={<span className="sr-only">Active</span>} checked={p.active} disabled={!can(user, "products.edit") || busyId === p.id} onChange={(v) => patch(p, { active: v })} /></td>
                  <td className="p-3"><Check label={<span className="sr-only">Featured</span>} checked={p.featured} disabled={!can(user, "products.edit") || busyId === p.id} onChange={(v) => patch(p, { featured: v })} /></td>
                  <td className="p-3">
                    <input type="number" aria-label={`Store order for ${p.name}`} defaultValue={p.sortOrder} disabled={!can(user, "products.edit")} className="w-16 border border-base-300 bg-transparent px-2 py-1"
                      onBlur={(e) => { const v = parseInt(e.target.value, 10); if (Number.isInteger(v) && v !== p.sortOrder) patch(p, { sortOrder: v }); }} />
                  </td>
                  <td className="p-3"><div className="flex flex-wrap justify-end gap-2">
                    <a href={`/product/${p.slug}`} target="_blank" rel="noreferrer" className={btnSm} aria-label={`View ${p.name} on the store`} title={p.active ? "View on store" : "Inactive products are not visible on the store"}><ExternalLink size={14} /></a>
                    {can(user, "products.edit") && <Link to={`/admin/products/${p.id}`} className={btnSm} aria-label={`Edit ${p.name}`}><Pencil size={14} /></Link>}
                    {can(user, "products.delete") && <button className={`${btnSm} !border-error !text-error`} onClick={() => { setActionError(""); setToDelete(p); }} aria-label={`Delete ${p.name}`}><Trash2 size={14} /></button>}
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {meta && <Pagination page={meta.page} totalPages={meta.totalPages} onChange={setPage} />}
      {meta && <p className="mt-3 text-center text-xs opacity-60">{meta.total} product{meta.total === 1 ? "" : "s"}</p>}

      <Confirm open={!!toDelete} title="Delete product?" busy={deleting} error={toDelete ? actionError : ""} confirmLabel="Delete product"
        message={toDelete ? `“${toDelete.name}” will be permanently removed from the store. This cannot be undone. To hide it instead, switch it to inactive.` : ""}
        onConfirm={remove} onCancel={() => setToDelete(null)} />
    </>
  );
}
