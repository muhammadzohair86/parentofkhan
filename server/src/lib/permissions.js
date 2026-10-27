// Roles: "customer" (storefront only), "admin" (sub-admin: ONLY the permissions granted to them),
// "master_admin" (the single owner account: everything).
export const ROLES = ["customer", "admin", "master_admin"];
export const STAFF_ROLES = ["admin", "master_admin"];

// Permission catalog. Viewing and modifying are separate permissions.
export const PERMISSION_GROUPS = {
  products: ["view", "create", "edit", "delete"],
  categories: ["view", "create", "edit", "delete"],
  orders: ["view", "update"],
  team: ["view", "manage"],
  newsletter: ["view", "manage"],
  site: ["view", "edit"], // homepage hero images
  shipping: ["view", "edit"], // NLS Xpress domestic/international shipping settings
};
export const ALL_PERMISSIONS = Object.entries(PERMISSION_GROUPS).flatMap(([g, acts]) => acts.map((a) => `${g}.${a}`));

// Granting any action in a group implies being able to view that group (a form is useless without its list).
export function normalizePermissions(input) {
  const set = new Set((Array.isArray(input) ? input : []).filter((p) => ALL_PERMISSIONS.includes(p)));
  for (const p of [...set]) {
    const group = p.split(".")[0];
    if (!p.endsWith(".view")) set.add(`${group}.view`);
  }
  return ALL_PERMISSIONS.filter((p) => set.has(p)); // stable order, no duplicates, nothing unknown
}

export const isStaff = (u) => !!u && u.active !== false && STAFF_ROLES.includes(u.role);

// Evaluated against the CURRENT database record on every request, never against anything the client or a token claims.
export function hasPermission(user, perm) {
  if (!isStaff(user)) return false;
  if (user.role === "master_admin") return true;
  return Array.isArray(user.permissions) && user.permissions.includes(perm);
}
export const hasAnyPermission = (user, perms) => perms.some((p) => hasPermission(user, p));
export const effectivePermissions = (user) => (user?.role === "master_admin" ? ALL_PERMISSIONS : isStaff(user) ? normalizePermissions(user.permissions) : []);

// Who may change whom (team management). Returns { ok: true } or { ok: false, reason }.
//  - nobody changes the master account through the API;
//  - the master may manage every sub-admin;
//  - a sub-admin with team.manage may manage OTHER sub-admins only: never themselves, never someone who also holds
//    team.manage, and may only grant permissions they hold themselves (never team.manage).
export function canManageMember(actor, target, nextPermissions) {
  if (!hasPermission(actor, "team.manage")) return { ok: false, reason: "You do not have permission to manage the team." };
  if (target.role === "master_admin") return { ok: false, reason: "The master admin account cannot be modified." };
  if (target.role !== "admin") return { ok: false, reason: "Only sub-admin accounts can be managed here." };
  if (actor.role === "master_admin") return { ok: true };
  if (String(actor._id) === String(target._id)) return { ok: false, reason: "You cannot change your own access." };
  if (hasPermission(target, "team.manage")) return { ok: false, reason: "Only the master admin can manage a member who can manage the team." };
  if (nextPermissions) {
    const mine = new Set(effectivePermissions(actor));
    if (nextPermissions.includes("team.manage")) return { ok: false, reason: "Only the master admin can grant team management." };
    const over = nextPermissions.filter((p) => !mine.has(p));
    if (over.length) return { ok: false, reason: "You can only grant permissions that you hold yourself." };
  }
  return { ok: true };
}

// Can `actor` hand out exactly these permissions? The master can grant anything; a sub-admin with team.manage can only
// grant permissions they hold themselves and never team.manage.
export function canGrantPermissions(actor, perms) {
  if (!hasPermission(actor, "team.manage")) return { ok: false, reason: "You do not have permission to manage the team." };
  if (actor.role === "master_admin") return { ok: true };
  if (perms.includes("team.manage")) return { ok: false, reason: "Only the master admin can grant team management." };
  const mine = new Set(effectivePermissions(actor));
  if (perms.some((p) => !mine.has(p))) return { ok: false, reason: "You can only grant permissions that you hold yourself." };
  return { ok: true };
}
