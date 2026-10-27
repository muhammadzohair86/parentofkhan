import { loadEnv } from "./config/env.js";
import { connectDB, disconnectDB } from "./config/db.js";
import { createApp } from "./app.js";
import { readMasterConfig, ensureMasterAdmin } from "./lib/bootstrap.js";
import { initMedia } from "./lib/media.js";
import { ensureShippingDefaults, quoteCheckout } from "./lib/shippingStore.js";
import { createSafepayClient } from "./lib/safepayClient.js";
import { publicPaymentInfo } from "./lib/safepayConfig.js";
import { createPaymentService } from "./lib/paymentService.js";
import fs from "node:fs";
import path from "node:path";
import { paymentRepo } from "./lib/paymentRepo.js";
import { createOrderAccessService } from "./lib/orderAccessService.js";
import dns from 'dns';

dns.setServers(['8.8.8.8', '8.8.4.4']);

let env;
try {
  env = loadEnv();
} catch (e) {
  console.error(`\n[config] ${e.message}\n`);
  process.exit(1);
}

// Do not accept traffic until the database is actually connected.
try {
  await connectDB(env.mongoUri);
} catch (e) {
  console.error(
    `\n[db] Could not connect to MongoDB Atlas: ${e.message}\n` +
      "     Check: (1) the connection string and password, (2) your IP is allowed under Atlas > Network Access,\n" +
      "     (3) special characters in the password are URL-encoded.\n"
  );
  process.exit(1);
}

// If the master admin variables are set and no master exists yet, create it (idempotent; never resets a password).
try {
  const cfg = readMasterConfig();
  if (cfg) {
    const r = await ensureMasterAdmin(cfg);
    if (r.status === "created") console.log("[admin] Master admin created. Remove MASTER_ADMIN_INITIAL_PASSWORD from .env now.");
    if (r.status === "email_taken") console.error("[admin] MASTER_ADMIN_EMAIL already belongs to another account; no master admin was created.");
  }
} catch (e) {
  console.error(`[admin] ${e.message} (master admin bootstrap skipped)`);
}

// Shipping: create the settings document and the default Dubai destination once (idempotent; never overwrites admin edits).
try {
  const r = await ensureShippingDefaults();
  if (r.seeded) console.log(`[shipping] seeded ${r.seeded} default destination(s). Manage them in Admin > Shipping.`);
} catch (e) {
  console.error(`[shipping] could not seed shipping defaults: ${e.message}`);
}

// Image store: Cloudinary if its credentials are set, otherwise local disk. Fails loudly on a half-configured setup.
const media = await initMedia(env);
console.log(`[media] image storage: ${media.provider}`);

// Safepay (sandbox). Log WHICH settings are wrong by name only; never print a value.
const sp = env.safepay;
if (sp.status === "enabled") {
  console.log(`[safepay] SANDBOX payments enabled (test mode: no real money moves).${sp.warnings.map((w) => `\n[safepay] warning: ${w}`).join("")}`);
} else {
  // Say WHERE we looked: the usual causes are a wrong folder, a wrong file name, or editing .env without restarting (npm run dev does not reload it).
  const envFile = path.join(process.cwd(), ".env");
  const header = sp.status === "disabled" ? "online payment is OFF: no Safepay credentials were found." : "NOT enabled because of configuration problems:";
  console.error(`[safepay] ${header}\n${sp.problems.map((p) => `  - ${p}`).join("\n")}\n  - working directory: ${process.cwd()} (.env ${fs.existsSync(envFile) ? "found there" : "NOT found there"})\n  - to test your setup without checkout: npm run check:safepay  (add :live to call the Safepay sandbox)${sp.warnings.map((w) => `\n[safepay] warning: ${w}`).join("")}`);
}
const safepayClient = sp.status === "enabled" ? createSafepayClient(sp.config) : null;
const paymentService = createPaymentService({
  repo: paymentRepo, safepay: safepayClient, config: sp.config, publicSiteUrl: env.publicSiteUrl,
  diagnostics: !env.isProd, // development: provider errors carry a short secret-free reason
  priceCart: quoteCheckout, // the same server-side pricing the quote endpoint uses (also rejects browser-sent amounts that differ)
  log: (event, fields) => console.error(`[payments] ${event} ${JSON.stringify(fields)}`), // fields are ids/states only, never secrets or customer data
});
const orderAccess = createOrderAccessService({ repo: paymentRepo, log: (event, fields) => console.error(`[orders] ${event} ${JSON.stringify(fields)}`) });
const payments = { service: paymentService, orderAccess, info: publicPaymentInfo(sp, { diagnostics: !env.isProd }) };

const server = createApp({ ...env, payments }).listen(env.port, () => console.log(`[server] API listening on http://localhost:${env.port}/api`));
server.on("error", (e) => {
  console.error(e.code === "EADDRINUSE" ? `[server] Port ${env.port} is already in use. Set a different PORT in server/.env.` : `[server] ${e.message}`);
  process.exit(1);
});

let closing = false;
async function shutdown(signal) {
  if (closing) return;
  closing = true;
  console.log(`\n[server] ${signal} received, shutting down...`);
  server.close(async () => {
    await disconnectDB().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
