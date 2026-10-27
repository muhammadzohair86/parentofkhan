import { User } from "../models/User.js";
import { Session } from "../models/Session.js";
import { hashPassword } from "../lib/password.js";
import { STAFF_ROLES, PERMISSION_GROUPS, normalizePermissions, effectivePermissions, canManageMember, canGrantPermissions } from "../lib/permissions.js";
import { ApiError } from "../utils/ApiError.js";

const member = (u) => ({
  id: String(u._id), name: u.name, email: u.email, role: u.role, active: u.active !== false,
  permissions: effectivePermissions(u), lastLoginAt: u.lastLoginAt || null, createdAt: u.createdAt,
});

export async function listTeam(_req, res) {
  const users = await User.find({ role: { $in: STAFF_ROLES } }).sort({ role: -1, createdAt: 1 }).lean(); // master first
  res.set("Cache-Control", "no-store");
  res.json({ success: true, data: users.map(member), meta: { permissionGroups: PERMISSION_GROUPS } });
}

export async function createMember(req, res) {
  const { name, email, password, permissions } = req.validated.body;
  const perms = normalizePermissions(permissions);
  const grant = canGrantPermissions(req.user, perms);
  if (!grant.ok) throw new ApiError(403, "FORBIDDEN", grant.reason);
  if (await User.exists({ email })) throw new ApiError(409, "EMAIL_TAKEN", "An account with this email already exists.");
  try {
    // role is fixed to "admin" (sub-admin) here: this endpoint can never create a master admin or promote a customer.
    const user = await User.create({ name, email, passwordHash: await hashPassword(password), role: "admin", permissions: perms, active: true, createdBy: req.user._id });
    res.status(201).json({ success: true, data: member(user.toObject()) });
  } catch (e) {
    if (e?.code === 11000) throw new ApiError(409, "EMAIL_TAKEN", "An account with this email already exists.");
    throw e;
  }
}

export async function updateMember(req, res) {
  const { id } = req.validated.params;
  const d = req.validated.body;
  const target = await User.findById(id);
  if (!target) throw new ApiError(404, "MEMBER_NOT_FOUND", "Team member not found.");
  const nextPerms = d.permissions ? normalizePermissions(d.permissions) : undefined;
  const check = canManageMember(req.user, target, nextPerms);
  if (!check.ok) throw new ApiError(403, "FORBIDDEN", check.reason);

  if (d.name !== undefined) target.name = d.name;
  if (nextPerms) target.permissions = nextPerms;
  if (d.active !== undefined) target.active = d.active;
  if (d.password) target.passwordHash = await hashPassword(d.password);
  await target.save();
  // Deactivation and password resets sign the member out everywhere. (Permission changes need no sign-out: they are
  // read from the database on every request.)
  if (d.active === false || d.password) await Session.deleteMany({ user: target._id });
  res.json({ success: true, data: member(target.toObject()) });
}
