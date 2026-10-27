import { User } from "../models/User.js";
import { Session } from "../models/Session.js";
import { hashPassword, verifyPassword, dummyHash } from "../lib/password.js";
import { effectivePermissions, isStaff } from "../lib/permissions.js";
import { startSession } from "./authController.js";
import { ApiError } from "../utils/ApiError.js";

const ADMIN_SESSION_MS = 8 * 60 * 60 * 1000; // admin sessions last 8 hours (customers: 14 days)

// What the dashboard needs. The permission list is computed from the CURRENT record, and the server re-checks on every call anyway.
export const serializeStaff = (u) => ({ id: String(u._id), name: u.name, email: u.email, role: u.role, permissions: effectivePermissions(u) });

export const adminLogin = (isProd) => async (req, res) => {
  const { email, password } = req.validated.body;
  const user = await User.findOne({ email }).select("+passwordHash");
  const ok = await verifyPassword(password, user ? user.passwordHash : await dummyHash()); // same work for unknown emails
  // Customers, deactivated accounts and wrong passwords all get the SAME message: nothing about the account leaks.
  if (!user || !ok || !isStaff(user)) throw new ApiError(401, "INVALID_CREDENTIALS", "Incorrect email or password.");
  user.lastLoginAt = new Date();
  await user.save();
  await startSession(res, user, isProd, ADMIN_SESSION_MS);
  res.json({ success: true, data: serializeStaff(user) });
};

export const adminMe = (req, res) => res.json({ success: true, data: req.user && isStaff(req.user) ? serializeStaff(req.user) : null });

export async function changeOwnPassword(req, res) {
  const { currentPassword, newPassword } = req.validated.body;
  const user = await User.findById(req.user._id).select("+passwordHash");
  if (!(await verifyPassword(currentPassword, user.passwordHash))) throw new ApiError(400, "WRONG_PASSWORD", "Your current password is incorrect.");
  if (newPassword === currentPassword) throw new ApiError(400, "SAME_PASSWORD", "Choose a different password.");
  user.passwordHash = await hashPassword(newPassword);
  await user.save();
  await Session.deleteMany({ user: user._id, tokenHash: { $ne: req.sessionTokenHash } }); // sign out every other device
  res.json({ success: true, data: null });
}
