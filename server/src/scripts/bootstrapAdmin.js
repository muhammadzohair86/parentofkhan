import { loadEnv } from "../config/env.js";
import { connectDB, disconnectDB } from "../config/db.js";
import { readMasterConfig, ensureMasterAdmin } from "../lib/bootstrap.js";

// npm run bootstrap-admin
// Creates the Master Admin from MASTER_ADMIN_EMAIL / MASTER_ADMIN_INITIAL_PASSWORD in server/.env if no master exists.
// Safe to run repeatedly. Never prints the password.
let cfg;
try { cfg = readMasterConfig(); } catch (e) { console.error(`[bootstrap-admin] ${e.message}`); process.exit(1); }
if (!cfg) { console.error("[bootstrap-admin] Set MASTER_ADMIN_EMAIL and MASTER_ADMIN_INITIAL_PASSWORD in server/.env first."); process.exit(1); }

const env = loadEnv();
await connectDB(env.mongoUri);
try {
  const r = await ensureMasterAdmin(cfg);
  console.log({
    created: "[bootstrap-admin] Master admin created. Sign in at /admin/login, then remove MASTER_ADMIN_INITIAL_PASSWORD from .env.",
    exists: "[bootstrap-admin] A master admin already exists. Nothing changed (the password is never reset by this script).",
    email_taken: "[bootstrap-admin] That email already belongs to another account. Nothing changed. Use a different MASTER_ADMIN_EMAIL.",
  }[r.status]);
  process.exitCode = r.status === "email_taken" ? 1 : 0;
} finally {
  await disconnectDB();
}
