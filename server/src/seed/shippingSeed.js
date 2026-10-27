import { loadEnv } from "../config/env.js";
import { connectDB, disconnectDB } from "../config/db.js";
import { ensureShippingDefaults } from "../lib/shippingStore.js";

// npm run seed:shipping
// Idempotent. Creates the shipping settings document and the default Dubai destination if they are missing.
// The server does the same at start-up; this script is for running it by hand. Existing records are never modified.
async function main() {
  const env = loadEnv();
  await connectDB(env.mongoUri);
  try {
    const r = await ensureShippingDefaults();
    console.log(`[seed:shipping] ${r.seeded ? `added ${r.seeded} default destination(s)` : "nothing to add"}; existing records untouched.`);
  } finally {
    await disconnectDB();
  }
}
main().catch((e) => { console.error(`[seed:shipping] failed: ${e.message}`); process.exit(1); });
