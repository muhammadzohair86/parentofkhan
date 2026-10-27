// Dependency-free so it can be unit-tested.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Reads MASTER_ADMIN_EMAIL / MASTER_ADMIN_INITIAL_PASSWORD. Returns null when neither is set.
// Throws (without echoing the values) when they are set but invalid.
export function readMasterConfig(env = process.env) {
  const email = (env.MASTER_ADMIN_EMAIL || "").trim().toLowerCase();
  const password = env.MASTER_ADMIN_INITIAL_PASSWORD || "";
  if (!email && !password) return null;
  if (!email || !password) throw new Error("Set BOTH MASTER_ADMIN_EMAIL and MASTER_ADMIN_INITIAL_PASSWORD (or neither).");
  if (!EMAIL.test(email) || email.length > 254) throw new Error("MASTER_ADMIN_EMAIL is not a valid email address.");
  if (password.length < 12 || password.length > 128) throw new Error("MASTER_ADMIN_INITIAL_PASSWORD must be 12 to 128 characters.");
  if (password.toLowerCase() === email) throw new Error("MASTER_ADMIN_INITIAL_PASSWORD must not equal the email.");
  return { email, password };
}

