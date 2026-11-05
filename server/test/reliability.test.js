import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { waitForDb, isTransientDbError } from "../src/lib/dbReadiness.js";

const src = (p) => readFile(new URL(p, import.meta.url), "utf8");

test("waitForDb: returns at once when ready; absorbs a short reconnect; gives up (false) after the timeout", async () => {
  assert.equal(await waitForDb(1000, { ready: () => true }), true);
  let n = 0;
  const t0 = Date.now();
  assert.equal(await waitForDb(2000, { ready: () => ++n > 3, pollMs: 10 }), true);
  assert.ok(Date.now() - t0 < 1000);
  const t1 = Date.now();
  assert.equal(await waitForDb(150, { ready: () => false, pollMs: 10 }), false);
  assert.ok(Date.now() - t1 >= 140 && Date.now() - t1 < 1000, "bounded wait, no endless loop");
});

test("transient database errors are recognised; ordinary bugs and validation errors are not", () => {
  for (const name of ["MongoNetworkError", "MongoNetworkTimeoutError", "MongoServerSelectionError", "MongoPoolClearedError", "MongoTopologyClosedError"]) {
    assert.equal(isTransientDbError(Object.assign(new Error("x"), { name })), true, name);
  }
  assert.equal(isTransientDbError(Object.assign(new Error("Operation `products.find()` buffering timed out after 10000ms"), { name: "MongooseError" })), true);
  assert.equal(isTransientDbError(Object.assign(new Error("not primary"), { name: "MongoServerError", code: 91 })), true);
  for (const e of [new TypeError("x is undefined"), Object.assign(new Error("dup"), { name: "MongoServerError", code: 11000 }), Object.assign(new Error("bad"), { name: "ValidationError" }), null, undefined]) assert.equal(isTransientDbError(e), false);
});

test("requireDb waits for the database; errorHandler reports driver failures as a retryable 503 (not a vague 500)", async () => {
  const mw = await src("../src/middleware/requireDb.js");
  assert.match(mw, /waitForDb\(DB_WAIT_MS\)/); assert.match(mw, /Retry-After/);
  const eh = await src("../src/middleware/errorHandler.js");
  assert.match(eh, /isTransientDbError\(err\)/); assert.match(eh, /DB_UNAVAILABLE/);
});

test("server: connects with retries before listening; liveness endpoint exists; the API limiter answers in JSON", async () => {
  const server = await src("../src/server.js");
  assert.ok(server.indexOf("await connectDB(") < server.indexOf(".listen("), "no traffic before the database is connected");
  const db = await src("../src/config/db.js");
  assert.match(db, /attempts = 5/); assert.match(db, /maxIdleTimeMS/); assert.match(db, /heartbeatFrequencyMS/);
  const app = await src("../src/app.js");
  assert.match(app, /\/api\/healthz/); assert.match(app, /limiter\(60_000, 300/);
});

test("the Safepay integration is preserved but unreachable while ENABLE_ONLINE_PAYMENTS is off", async () => {
  const server = await src("../src/server.js");
  assert.match(server, /const gatewaysOn = env\.onlinePaymentsEnabled && sp\.status === "enabled"/);
  assert.match(server, /safepayClient = gatewaysOn \? createSafepayClient\(sp\.config\) : null/);
  const env = await src("../src/config/env.js");
  assert.match(env, /ENABLE_ONLINE_PAYMENTS/); assert.match(env, /=== "true"/, "off unless explicitly 'true'");
  for (const f of ["../src/lib/safepayClient.js", "../src/lib/safepayConfig.js", "../src/lib/safepaySignature.js", "../src/lib/paymentService.js", "../src/routes/paymentRoutes.js", "../src/models/Payment.js", "../src/scripts/checkSafepay.js"]) {
    assert.ok((await src(f)).length > 200, `${f} still exists`);
  }
  const app = await src("../src/app.js");
  assert.match(app, /app\.use\("\/api\/webhooks"/, "webhook route code is still mounted");
});
