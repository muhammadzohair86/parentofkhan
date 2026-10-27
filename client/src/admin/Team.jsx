import { useState } from "react";
import { Plus, Pencil } from "lucide-react";
import { useAsync } from "../hooks/useAsync.js";
import { A } from "./adminApi.js";
import { useAdminAuth, can } from "./useAdminAuth.js";
import { PageHeader, Loading, Notice, Badge, Modal, Field, Check, btnSm, dateTime, useReload } from "./ui.jsx";

const GROUP_LABEL = { products: "Products", categories: "Categories", orders: "Orders", team: "Team", newsletter: "Newsletter subscribers", site: "Homepage (hero images)", shipping: "Shipping settings" };
const ACTION_LABEL = { view: "View", create: "Create", edit: "Edit", delete: "Delete", update: "Update status", manage: "Manage" };

// Permission checkboxes. Anything the signed-in admin cannot grant is disabled (the server enforces the same rule).
function PermissionPicker({ groups, value, onChange, actor }) {
  const mine = new Set(actor.permissions);
  const isMaster = actor.role === "master_admin";
  const toggle = (perm, on) => {
    const next = new Set(value);
    on ? next.add(perm) : next.delete(perm);
    if (on && !perm.endsWith(".view")) next.add(`${perm.split(".")[0]}.view`); // any action implies "view"
    if (!on && perm.endsWith(".view")) [...next].forEach((p) => p.startsWith(`${perm.split(".")[0]}.`) && next.delete(p)); // removing "view" removes the rest
    onChange([...next]);
  };
  return (
    <div className="space-y-4">
      {Object.entries(groups).map(([g, actions]) => (
        <fieldset key={g} className="border border-base-300 p-3">
          <legend className="eyebrow px-1">{GROUP_LABEL[g] || g}</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {actions.map((a) => {
              const perm = `${g}.${a}`;
              const locked = !isMaster && (!mine.has(perm) || perm === "team.manage");
              return <Check key={perm} label={ACTION_LABEL[a] || a} checked={value.includes(perm)} disabled={locked} onChange={(on) => toggle(perm, on)} />;
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}

function MemberForm({ member, groups, actor, onDone, onCancel }) {
  const isNew = !member;
  const [f, setF] = useState({ name: member?.name || "", email: member?.email || "", password: "", permissions: member?.permissions || [], active: member ? member.active : true });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setErr(null);
    try {
      if (isNew) await A.post("/team", { name: f.name.trim(), email: f.email.trim(), password: f.password, permissions: f.permissions });
      else await A.patch(`/team/${member.id}`, { name: f.name.trim(), permissions: f.permissions, active: f.active, ...(f.password ? { password: f.password } : {}) });
      onDone();
    } catch (e2) { setErr(e2); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {err && <Notice tone="error"><p>{err.message}</p>{err.details?.length > 0 && <ul className="mt-1 list-disc pl-5">{err.details.map((d, i) => <li key={i}>{d.path}: {d.message}</li>)}</ul>}</Notice>}
      <Field label="Name"><input className="field" value={f.name} maxLength={80} onChange={(e) => set("name", e.target.value)} required data-autofocus /></Field>
      <Field label="Email" hint={isNew ? undefined : "The email cannot be changed."}><input className="field" type="email" value={f.email} maxLength={254} onChange={(e) => set("email", e.target.value)} disabled={!isNew} required /></Field>
      <Field label={isNew ? "Temporary password" : "Reset password (optional)"} hint="At least 10 characters. Share it privately; resetting signs the member out everywhere."><input className="field" type="password" autoComplete="new-password" value={f.password} maxLength={128} onChange={(e) => set("password", e.target.value)} required={isNew} /></Field>
      {!isNew && <Check label="Account active" checked={f.active} onChange={(v) => set("active", v)} />}
      <div><p className="eyebrow mb-2">Permissions</p><PermissionPicker groups={groups} value={f.permissions} onChange={(v) => set("permissions", v)} actor={actor} /></div>
      <div className="flex justify-end gap-3 pt-2"><button type="button" className={btnSm} onClick={onCancel}>Cancel</button><button className="btn-khan !py-2 !text-xs" disabled={busy}>{busy ? "Saving…" : isNew ? "Create member" : "Save changes"}</button></div>
    </form>
  );
}

export default function Team() {
  const user = useAdminAuth((s) => s.user);
  const [tick, reload] = useReload();
  const { data, loading, error } = useAsync(() => A.get("/team"), [tick]);
  const [editing, setEditing] = useState(null);
  const manage = can(user, "team.manage");
  const rows = data?.data, groups = data?.meta?.permissionGroups;

  // Mirrors the server rules: nobody edits the master; non-master managers cannot edit themselves or other team managers.
  const editable = (m) => manage && m.role === "admin" && (user.role === "master_admin" || (m.id !== user.id && !m.permissions.includes("team.manage")));

  return (
    <>
      <PageHeader title="Team" subtitle="Sub-admins and what each one is allowed to do.">
        {manage && <button className="btn-khan !py-2.5" onClick={() => setEditing("new")}><Plus size={16} /> Add member</button>}
      </PageHeader>
      {loading && !rows ? <Loading /> : error ? <Notice tone="error">Could not load the team. {error.message}</Notice> : (
        <div className="overflow-x-auto border border-base-300">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-base-300 bg-base-200 text-xs uppercase tracking-wider"><tr><th className="p-3">Member</th><th className="p-3">Access</th><th className="p-3">Status</th><th className="p-3">Last sign-in</th><th className="p-3 text-right">Actions</th></tr></thead>
            <tbody className="divide-y divide-base-300 align-top">
              {rows.map((m) => (
                <tr key={m.id}>
                  <td className="p-3"><p className="font-medium">{m.name}</p><p className="text-xs opacity-60">{m.email}</p></td>
                  <td className="p-3 max-w-md">{m.role === "master_admin" ? <Badge tone="green">Master admin · full access</Badge> : m.permissions.length ? <div className="flex flex-wrap gap-1">{m.permissions.map((p) => <Badge key={p}>{p}</Badge>)}</div> : <span className="text-xs opacity-60">No permissions yet</span>}</td>
                  <td className="p-3"><Badge tone={m.active ? "green" : "red"}>{m.active ? "Active" : "Inactive"}</Badge></td>
                  <td className="p-3 whitespace-nowrap">{dateTime(m.lastLoginAt)}</td>
                  <td className="p-3 text-right">{editable(m) && <button className={btnSm} onClick={() => setEditing(m)} aria-label={`Edit ${m.name}`}><Pencil size={14} /></button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal open={!!editing} wide title={editing === "new" ? "Add team member" : "Edit team member"} onClose={() => setEditing(null)}>
        {editing && groups && <MemberForm member={editing === "new" ? null : editing} groups={groups} actor={user} onCancel={() => setEditing(null)} onDone={() => { setEditing(null); reload(); }} />}
      </Modal>
    </>
  );
}
