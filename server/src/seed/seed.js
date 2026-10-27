import { loadEnv } from "../config/env.js";
import { connectDB, disconnectDB } from "../config/db.js";
import { Category } from "../models/Category.js";
import { Product } from "../models/Product.js";
import { seedCategories, seedProducts } from "./seedData.js";

// npm run seed         -> inserts demo records that do not exist yet (never overwrites anything)
// npm run seed:remove  -> deletes ONLY records flagged isDemo: true (requires --yes, which the script supplies)
const args = new Set(process.argv.slice(2));

async function main() {
  const env = loadEnv();

  if (args.has("--remove") && !args.has("--yes")) {
    console.error("Refusing to delete without confirmation. Run: npm run seed:remove");
    process.exit(1);
  }

  await connectDB(env.mongoUri);
  try {
    if (args.has("--remove")) {
      const p = await Product.deleteMany({ isDemo: true });
      const c = await Category.deleteMany({ isDemo: true });
      console.log(`[seed] removed ${p.deletedCount} demo products and ${c.deletedCount} demo categories (real data untouched).`);
      return;
    }

    const bySlug = {};
    let added = 0, skipped = 0;
    for (const { slug, ...rest } of seedCategories) {
      let doc = await Category.findOne({ slug });
      if (doc) skipped++;
      else { doc = await Category.create({ slug, ...rest, isDemo: true }); added++; }
      bySlug[slug] = doc;
    }
    for (const { categorySlug, slug, ...rest } of seedProducts) {
      const category = bySlug[categorySlug];
      if (!category) { console.warn(`[seed] skipped ${slug}: category "${categorySlug}" missing`); continue; }
      if (await Product.exists({ slug })) { skipped++; continue; }
      await Product.create({ slug, ...rest, category: category._id, isDemo: true }); // create() runs validation + effectivePrice hook
      added++;
    }
    console.log(`[seed] added ${added} records, skipped ${skipped} that already existed. Existing data was not modified.`);
  } finally {
    await disconnectDB();
  }
}

main().catch((e) => { console.error(`[seed] failed: ${e.message}`); process.exit(1); });
