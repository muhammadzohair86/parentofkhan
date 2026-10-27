import { loadEnv } from "../config/env.js";
import { connectDB, disconnectDB } from "../config/db.js";
import { FeatureBox } from "../models/FeatureBox.js";
import { SiteSetting } from "../models/SiteSetting.js";
import { DEFAULT_FEATURES, MAX_ACTIVE_FEATURES } from "../lib/siteDefaults.js";

// npm run seed:site
// Idempotent: creates the default feature boxes and the single site-settings document only when they are
// missing. Existing records (including anything an admin has edited) are never modified or duplicated.
async function main() {
  const env = loadEnv();
  await connectDB(env.mongoUri);
  try {
    let added = 0;
    let activeCount = await FeatureBox.countDocuments({ active: true });
    for (const f of DEFAULT_FEATURES) {
      if (await FeatureBox.exists({ key: f.key })) continue; // already there (possibly edited): leave it alone
      const active = activeCount < MAX_ACTIVE_FEATURES; // never push the active count past the cap
      await FeatureBox.create({ ...f, active });
      if (active) activeCount++;
      added++;
    }
    const s = await SiteSetting.updateOne({ key: "site" }, { $setOnInsert: { key: "site" } }, { upsert: true });
    console.log(`[seed:site] added ${added} feature box(es)${s.upsertedCount ? " and the site settings document" : ""}; existing records untouched.`);
  } finally {
    await disconnectDB();
  }
}
main().catch((e) => { console.error(`[seed:site] failed: ${e.message}`); process.exit(1); });
