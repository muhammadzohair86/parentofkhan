import { User } from "../models/User.js";
import { hashPassword } from "./password.js";
export { readMasterConfig } from "./masterConfig.js";

// Idempotent. Creates the master admin ONLY if none exists. It never touches an existing master's password, and
// it never promotes an existing account: someone could have registered that email first, so promoting it would
// hand the master role to whoever knows that account's password.
export async function ensureMasterAdmin(config) {
  if (await User.exists({ role: "master_admin" })) return { status: "exists" };
  if (await User.exists({ email: config.email })) {
    return { status: "email_taken" };
  }
  try {
    await User.create({ name: "Master Admin", email: config.email, passwordHash: await hashPassword(config.password), role: "master_admin", permissions: [], active: true });
    return { status: "created" };
  } catch (e) {
    if (e?.code === 11000) return { status: "exists" }; // lost a race with another instance: the unique index held
    throw e;
  }
}
