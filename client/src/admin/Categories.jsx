import { useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useAsync } from "../hooks/useAsync.js";
import { A } from "./adminApi.js";
import { useAdminAuth, can } from "./useAdminAuth.js";
import { ImageField } from "./ImageField.jsx";
import { PageHeader, Loading, Notice, Badge, Modal, Confirm, Field, Check, btnSm, useReload } from "./ui.jsx";

const blank = { name: "", slug: "", description: "", image: null, active: true, showOnHomepage: true, showInNavbar: true, order: "0" };

function CategoryForm({ initial, onDone, onCancel }) {
  const [f, setF] = useState(initial ? { ...initial, order: String(initial.order), slug: initial.slug } : blank);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setErr(null);
    const body = { name: f.name.trim(), slug: f.slug.trim(), description: f.description, image: f.image, active: f.active, showOnHomepage: f.showOnHomepage, showInNavbar: f.showInNavbar, order: parseInt(f.order || "0", 10) || 0 };
    try { initial ? await A.patch(`/categories/${initial.id}`, body) : await A.post("/categories", body); onDone(); }
    catch (e2) { setErr(e2); }
    finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {err && <Notice tone="error"><p>{err.message}</p>{err.details?.length > 0 && <ul className="mt-1 list-disc pl-5">{err.details.map((d, i) => <li key={i}>{d.path}: {d.message}</li>)}</ul>}</Notice>}
      <Field label="Name"><input className="field" value={f.name} maxLength={80} onChange={(e) => set("name", e.target.value)} required data-autofocus /></Field>
      <Field label="URL name (slug)" hint="Leave empty to generate it from the name."><input className="field" value={f.slug} maxLength={100} onChange={(e) => set("slug", e.target.value)} placeholder="auto-generated" /></Field>
      <Field label="Description" hint={`${f.description.length}/300`}><textarea className="field" rows={2} maxLength={300} value={f.description} onChange={(e) => set("description", e.target.value)} /></Field>
      <ImageField label="Image" value={f.image} onChange={(v) => set("image", v)} />
      <div className="flex flex-wrap gap-5">
        <Check label="Active" checked={f.active} onChange={(v) => set("active", v)} />
        <Check label="Show in navbar" checked={f.showInNavbar} onChange={(v) => set("showInNavbar", v)} />
        <Check label="Show on homepage" checked={f.showOnHomepage} onChange={(v) => set("showOnHomepage", v)} />
      </div>
      <Field label="Order" hint="Lower numbers come first."><input className="field !w-28" type="number" step="1" value={f.order} onChange={(e) => set("order", e.target.value)} /></Field>
      <div className="flex justify-end gap-3 pt-2"><button type="button" className={btnSm} onClick={onCancel}>Cancel</button><button className="btn-khan !py-2 !text-xs" disabled={busy}>{busy ? "Saving…" : "Save category"}</button></div>
    </form>
  );
}

export default function Categories() {
  const user = useAdminAuth((s) => s.user);
  const [tick, reload] = useReload();
  const { data, loading, error } = useAsync(() => A.get("/categories"), [tick]);
  const [editing, setEditing] = useState(null); // null | "new" | category
  const [del, setDel] = useState(null);
  const [reassign, setReassign] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [rowError, setRowError] = useState("");
  const cats = data?.data;

  const toggle = async (c, patch) => { setRowError(""); try { await A.patch(`/categories/${c.id}`, patch); reload(); } catch (e) { setRowError(`${c.name}: ${e.message}`); } };
  const remove = async () => {
    setBusy(true); setErr("");
    try { await A.del(`/categories/${del.id}`, del.productCount > 0 ? { reassignTo: reassign } : undefined); setDel(null); reload(); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader title="Categories" subtitle="Shop and navigation sections.">
        {can(user, "categories.create") && <button className="btn-khan !py-2.5" onClick={() => setEditing("new")}><Plus size={16} /> New category</button>}
      </PageHeader>
      {rowError && <Notice tone="error" className="mb-4">{rowError}</Notice>}
      {loading && !cats ? <Loading /> : error ? <Notice tone="error">Could not load categories. {error.message}</Notice> : !cats?.length ? <Notice>No categories yet.</Notice> : (
        <div className="overflow-x-auto border border-base-300">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-base-300 bg-base-200 text-xs uppercase tracking-wider"><tr>
              <th className="p-3">Category</th><th className="p-3">Products</th><th className="p-3">Active</th><th className="p-3">Navbar</th><th className="p-3">Homepage</th><th className="p-3">Order</th><th className="p-3 text-right">Actions</th></tr></thead>
            <tbody className="divide-y divide-base-300">
              {cats.map((c) => {
                const canEdit = can(user, "categories.edit");
                return (
                  <tr key={c.id}>
                    <td className="p-3"><p className="font-medium">{c.name} {c.isDemo && <Badge>Demo</Badge>}</p><p className="text-xs opacity-60">/{c.slug}</p></td>
                    <td className="p-3">{c.productCount}</td>
                    <td className="p-3"><Check label={<span className="sr-only">Active</span>} checked={c.active} disabled={!canEdit} onChange={(v) => toggle(c, { active: v })} /></td>
                    <td className="p-3"><Check label={<span className="sr-only">In navbar</span>} checked={c.showInNavbar} disabled={!canEdit} onChange={(v) => toggle(c, { showInNavbar: v })} /></td>
                    <td className="p-3"><Check label={<span className="sr-only">On homepage</span>} checked={c.showOnHomepage} disabled={!canEdit} onChange={(v) => toggle(c, { showOnHomepage: v })} /></td>
                    <td className="p-3">{c.order}</td>
                    <td className="p-3"><div className="flex justify-end gap-2">
                      {canEdit && <button className={btnSm} onClick={() => setEditing(c)} aria-label={`Edit ${c.name}`}><Pencil size={14} /></button>}
                      {can(user, "categories.delete") && <button className={`${btnSm} !border-error !text-error`} onClick={() => { setErr(""); setReassign(""); setDel(c); }} aria-label={`Delete ${c.name}`}><Trash2 size={14} /></button>}
                    </div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!editing} title={editing === "new" ? "New category" : "Edit category"} onClose={() => setEditing(null)}>
        {editing && <CategoryForm initial={editing === "new" ? null : editing} onCancel={() => setEditing(null)} onDone={() => { setEditing(null); reload(); }} />}
      </Modal>

      <Confirm open={!!del} title="Delete category?" busy={busy} error={err} confirmLabel="Delete category"
        message={del ? (del.productCount > 0 ? `“${del.name}” still has ${del.productCount} product${del.productCount === 1 ? "" : "s"}. Move them to another category to delete it, or cancel and mark the category inactive instead.` : `“${del.name}” will be permanently removed.`) : ""}
        onConfirm={() => (del.productCount > 0 && !reassign ? setErr("Choose a category to move the products to.") : remove())} onCancel={() => setDel(null)}>
        {del?.productCount > 0 && (
          <Field label="Move products to">
            <select className="field" value={reassign} onChange={(e) => setReassign(e.target.value)}>
              <option value="">Choose a category…</option>
              {cats.filter((c) => c.id !== del.id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        )}
      </Confirm>
    </>
  );
}
