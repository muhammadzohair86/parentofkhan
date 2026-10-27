import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import crypto from "node:crypto";
import { parseSafepayConfig, publicPaymentInfo, SAFEPAY_CURRENCIES } from "../src/lib/safepayConfig.js";
import { verifyWebhookSignature, signWebhookBody } from "../src/lib/safepaySignature.js";
import { createSafepayClient, SafepayError, isTrackerToken } from "../src/lib/safepayClient.js";
import { evaluateTracker, checkWebhookClaims, trackerPhase, toMinor } from "../src/lib/paymentRules.js";
import { parseCheckoutInput, parseOrderAccess, isOrderNumber } from "../src/lib/checkoutInput.js";
import { createPaymentService, sha256, newOrderNumber, fingerprintOf } from "../src/lib/paymentService.js";
import { resolveCartLines, buildQuote, assertSubmittedMatches } from "../src/lib/checkoutQuote.js";
import { DEFAULT_DOMESTIC, DEFAULT_INTERNATIONAL } from "../src/lib/shippingDefaults.js";
import { ApiError } from "../src/utils/ApiError.js";
import { fakeSafepayApi, fakeRepo } from "./helpers/paymentFakes.js";
import { runSafepayCheck } from "../src/lib/safepayCheck.js";

// ------------------------------------------------------------------ fixtures
const PUBLIC_KEY = "sec_0a1b2c3d-1111-4222-8333-444455556666";
const SECRET_KEY = "s3cr3t_api_key_" + "a".repeat(40);
const WEBHOOK_SECRET = "whsec_" + "b".repeat(40);
const ENV = { SAFEPAY_ENV: "sandbox", SAFEPAY_PUBLIC_KEY: PUBLIC_KEY, SAFEPAY_SECRET_KEY: SECRET_KEY, SAFEPAY_WEBHOOK_SECRET: WEBHOOK_SECRET };
const parsed = () => parseSafepayConfig(ENV);
const TOKEN = "11111111-1111-4111-8111-111111111111";
const PID = "aaaaaaaaaaaaaaaaaaaaaaaa";
const SITE = "http://localhost:5173";
const category = { _id: "c1", active: true };
const product = (over = {}) => ({ _id: PID, name: "Khan Tee", slug: "khan-tee", price: 20, salePrice: null, weightKg: 0.5, active: true, category,
  variants: [{ color: "Black", sku: "KT-B", available: true, images: ["/img/front.jpg"], sizes: [{ size: "M" }, { size: "L" }] }], ...over });

const rawInput = (over = {}) => ({
  clientRequestId: TOKEN, items: [{ productId: PID, color: "Black", size: "M", quantity: 2 }], country: "PK",
  customer: { name: "Ayesha Khan", email: "Ayesha@Example.com", phone: "+92 300 1234567" },
  address: { line1: "12 Garden Road", line2: "", city: "Karachi", region: "Sindh", postalCode: "74000" }, ...over,
});
const input = (over) => { const r = parseCheckoutInput(rawInput(over)); assert.deepEqual(r.errors, [], "fixture input must be valid"); return r.value; };
const code = async (p) => { try { await p; } catch (e) { return e; } assert.fail("expected an error"); };

// ---- the whole system under test: real client + service + REAL shipping/pricing, fake Safepay HTTP + fake DB ----
function setup({ settings = {}, products = [product()], destinations = [], config = parsed().config, clock } = {}) {
  const api = fakeSafepayApi(config || parsed().config);
  const repo = fakeRepo();
  const sp = config ? createSafepayClient(config, { fetchImpl: api.fetchImpl, timeoutMs: 500 }) : null;
  const shipSettings = { domestic: { ...DEFAULT_DOMESTIC, ...(settings.domestic || {}) }, international: { ...DEFAULT_INTERNATIONAL }, pkrPerUsd: "pkrPerUsd" in settings ? settings.pkrPerUsd : 276.87 };
  const priceCart = async ({ items, destination, submitted }) => {
    const lines = resolveCartLines(items, new Map(products.map((p) => [String(p._id), p])));
    const quote = buildQuote({ lines, settings: shipSettings, destinations, country: destination.country, city: destination.city });
    assertSubmittedMatches(quote, submitted);
    return quote;
  };
  const logs = [];
  const now = clock ? () => new Date(clock.t) : () => new Date();
  const service = createPaymentService({ repo, safepay: sp, config, priceCart, publicSiteUrl: SITE, now, log: (e, f) => logs.push([e, f]) });
  const order = () => [...repo._orders.values()][0];
  const hook = (body, secret = WEBHOOK_SECRET, sig) => { const raw = Buffer.from(typeof body === "string" ? body : JSON.stringify(body)); return { rawBody: raw, signature: sig === undefined ? signWebhookBody(raw, secret) : sig }; };
  return { api, repo, service, logs, order, hook, sp, priceCart };
}
const startOk = async (ctx, over) => { const r = await ctx.service.startCheckout(input(over)); assert.equal(r.status, "redirect"); return r; };
const eventFor = (tracker, over = {}) => ({ token: `evt_${crypto.randomUUID()}`, version: "2.0.0", merchant_api_key: PUBLIC_KEY, type: "payment.succeeded", endpoint: "https://x.example/api/webhooks/safepay",
  data: { tracker, intent: "CYBERSOURCE", state: "TRACKER_ENDED", amount: 4109, currency: "USD", metadata: { order_id: over.orderId, source: "parents-of-khan" }, ...(over.data || {}) }, created_at: { seconds: 1700000000, nanos: 1 }, ...over.top });
const status = (ctx, o = ctx.order()) => ctx.service.getStatus({ orderNumber: o.orderNumber, token: TOKEN });

// ================================================================== configuration + credentials
test("config: not configured => disabled (the shop still works); partial/invalid => reported by NAME only, never by value", () => {
  assert.equal(parseSafepayConfig({}).status, "disabled");
  assert.equal(parseSafepayConfig({ SAFEPAY_ENV: "sandbox" }).status, "disabled");
  const partial = parseSafepayConfig({ SAFEPAY_PUBLIC_KEY: PUBLIC_KEY });
  assert.equal(partial.status, "invalid");
  assert.ok(partial.problems.some((p) => p.includes("SAFEPAY_SECRET_KEY")));
  assert.equal(partial.config, null);
  for (const bad of [{ SAFEPAY_PUBLIC_KEY: "your_public_key", SAFEPAY_SECRET_KEY: SECRET_KEY }, { SAFEPAY_PUBLIC_KEY: SECRET_KEY, SAFEPAY_SECRET_KEY: SECRET_KEY }, { SAFEPAY_PUBLIC_KEY: PUBLIC_KEY, SAFEPAY_SECRET_KEY: "short" },
    { SAFEPAY_PUBLIC_KEY: PUBLIC_KEY, SAFEPAY_SECRET_KEY: PUBLIC_KEY }]) {
    const r = parseSafepayConfig(bad);
    assert.equal(r.status, "invalid", JSON.stringify(Object.keys(bad)));
    assert.ok(!JSON.stringify(r.problems).includes(SECRET_KEY), "problem text must never contain a secret value");
  }
});
test("config: production is refused (sandbox only); a missing webhook secret only warns", () => {
  const prod = parseSafepayConfig({ ...ENV, SAFEPAY_ENV: "production" });
  assert.equal(prod.status, "invalid");
  assert.match(prod.problems[0], /only "sandbox"/);
  assert.equal(prod.config, null);
  const noHook = parseSafepayConfig({ ...ENV, SAFEPAY_WEBHOOK_SECRET: "" });
  assert.equal(noHook.status, "enabled");
  assert.equal(noHook.config.webhookSecret, null);
  assert.ok(noHook.warnings.some((w) => w.includes("SAFEPAY_WEBHOOK_SECRET")));
  const ok = parsed();
  assert.deepEqual([ok.status, ok.config.environment, ok.config.apiBase, ok.config.checkoutBase], ["enabled", "sandbox", "https://sandbox.api.getsafepay.com", "https://sandbox.api.getsafepay.com/embedded"]);
  assert.ok(SAFEPAY_CURRENCIES.includes("USD") && SAFEPAY_CURRENCIES.includes("PKR"));
});
test("what the browser may learn about payments contains no key or secret", () => {
  const info = publicPaymentInfo(parsed());
  assert.deepEqual(info, { enabled: true, provider: "safepay", environment: "sandbox", testMode: true, reason: "ready" });
  const s = JSON.stringify(info) + JSON.stringify(publicPaymentInfo(parseSafepayConfig({})));
  for (const v of [PUBLIC_KEY, SECRET_KEY, WEBHOOK_SECRET]) assert.ok(!s.includes(v));
  assert.equal(publicPaymentInfo(parseSafepayConfig({})).enabled, false);
});

test("config: only the Public and Secret keys are REQUIRED; a bad webhook secret or an unusual key shape never switches payments off", () => {
  const base = { SAFEPAY_PUBLIC_KEY: PUBLIC_KEY, SAFEPAY_SECRET_KEY: SECRET_KEY };
  for (const [label, hook] of [["same as API secret", SECRET_KEY], ["too short", "abc"], ["has spaces", "has some spaces in it"]]) {
    const r = parseSafepayConfig({ ...base, SAFEPAY_WEBHOOK_SECRET: hook });
    assert.equal(r.status, "enabled", label);
    assert.equal(r.config.webhookSecret, null, `${label}: webhooks are disabled, payments are not`);
    assert.ok(r.warnings.some((w) => w.includes("SAFEPAY_WEBHOOK_SECRET")), label);
    assert.ok(!JSON.stringify(r.warnings).includes(SECRET_KEY));
  }
  assert.equal(parseSafepayConfig({ ...base, SAFEPAY_PUBLIC_KEY: "sec_abc_def_12345678" }).status, "enabled"); // an underscore in the key is fine
  assert.equal(parseSafepayConfig({ SAFEPAY_SECRET_KEY: SECRET_KEY }).status, "invalid");                       // but the public key IS required
  assert.equal(parseSafepayConfig({ SAFEPAY_PUBLIC_KEY: PUBLIC_KEY }).status, "invalid");
});
test("config: the browser is told WHY payments are off (a code), and a development server also names the setting to fix, never a value", () => {
  const codes = [[parseSafepayConfig({}), "not_configured"], [parseSafepayConfig({ SAFEPAY_PUBLIC_KEY: PUBLIC_KEY }), "invalid_configuration"], [parseSafepayConfig({ ...ENV, SAFEPAY_ENV: "production" }), "invalid_configuration"], [parsed(), "ready"]];
  for (const [p, reason] of codes) assert.equal(publicPaymentInfo(p).reason, reason);
  assert.ok(!("diagnostics" in publicPaymentInfo(parseSafepayConfig({}))), "production default: no diagnostics are ever sent");
  const dev = publicPaymentInfo(parseSafepayConfig({}), { diagnostics: true });
  assert.equal(dev.enabled, false);
  assert.match(dev.diagnostics.join(" "), /SAFEPAY_PUBLIC_KEY/);
  assert.match(dev.diagnostics.join(" "), /RESTART the API/);                  // the most common cause is named explicitly
  assert.match(dev.diagnostics.join(" "), /server\/\.env/);
  const partial = publicPaymentInfo(parseSafepayConfig({ SAFEPAY_PUBLIC_KEY: PUBLIC_KEY }), { diagnostics: true });
  assert.match(partial.diagnostics[0], /SAFEPAY_SECRET_KEY is missing/);
  for (const v of [PUBLIC_KEY, SECRET_KEY, WEBHOOK_SECRET]) assert.ok(!JSON.stringify([dev, partial]).includes(v));
  assert.ok(!("diagnostics" in publicPaymentInfo(parsed(), { diagnostics: true })), "nothing to report when enabled");
});

// ================================================================== setup check (npm run check:safepay)
test("check script: finds the stale-environment / wrong-folder situation and says what to do, without printing any value", async () => {
  const r = await runSafepayCheck({ env: {}, cwd: "C:\\proj\\server", envFileFound: false });
  assert.equal(r.ok, false);
  const text = r.lines.join("\n");
  assert.match(text, /\.env file in this directory: NOT FOUND/);
  assert.match(text, /SAFEPAY_PUBLIC_KEY: NOT set/);
  assert.match(text, /Configuration: DISABLED/);
  assert.match(text, /restart the API/i);
  const ok = await runSafepayCheck({ env: ENV, cwd: "/srv", envFileFound: true });
  const okText = ok.lines.join("\n");
  assert.deepEqual([ok.ok, /Configuration: ENABLED/.test(okText), /SAFEPAY_SECRET_KEY: set/.test(okText)], [true, true, true]);
  for (const v of [PUBLIC_KEY, SECRET_KEY, WEBHOOK_SECRET]) assert.ok(!okText.includes(v) && !text.includes(v), "values are never printed");
});
test("check script (live): exercises the same three Safepay calls as checkout and reports status/diagnostics safely", async () => {
  const api = fakeSafepayApi(parsed().config);
  const good = await runSafepayCheck({ env: ENV, live: true, fetchImpl: api.fetchImpl });
  assert.equal(good.ok, true);
  const t = good.lines.join("\n");
  assert.match(t, /OK {3}create payment session/);
  assert.match(t, /OK {3}create authentication token/);
  assert.match(t, /OK {3}build hosted checkout URL: https:\/\/sandbox\.api\.getsafepay\.com\/embedded\//);
  assert.match(t, /OK {3}read the session back: state TRACKER_STARTED, amount 1000 USD/);
  assert.deepEqual(api.calls.map((c) => c.path.replace(/track_[\w-]+/, "T")), ["/order/payments/v3/", "/client/passport/v1/token", "/reporter/api/v1/payments/T"]);
  // Safepay rejects the credentials: the report says so, by status code, and nothing secret is printed even if Safepay echoed it back
  const echo = async () => ({ ok: false, status: 401, json: async () => ({ status: { message: `bad key ${SECRET_KEY}` } }) });
  const bad = await runSafepayCheck({ env: ENV, live: true, fetchImpl: echo });
  const bt = bad.lines.join("\n");
  assert.equal(bad.ok, false);
  assert.match(bt, /FAIL create payment session.*HTTP 401.*Safepay rejected the credentials/);
  for (const v of [PUBLIC_KEY, SECRET_KEY, WEBHOOK_SECRET]) assert.ok(!bt.includes(v));
  const net = await runSafepayCheck({ env: ENV, live: true, fetchImpl: async () => { throw new TypeError("fetch failed"); } });
  assert.match(net.lines.join("\n"), /FAIL create payment session.*: network/);
  assert.equal((await runSafepayCheck({ env: {}, live: true, fetchImpl: async () => assert.fail("must not call Safepay without valid config") })).ok, false);
});

// ================================================================== provider errors: useful in development, silent in production
test("provider errors: a development server adds a short secret-free reason; production adds nothing; secrets are redacted either way", async () => {
  const mk = (diagnostics) => { const ctx = setup(); ctx.api.st.fail = 401; return { ctx, svc: createPaymentService({ repo: ctx.repo, safepay: ctx.sp, config: parsed().config, priceCart: ctx.priceCart, publicSiteUrl: SITE, diagnostics, log: (e, f) => ctx.logs.push([e, f]) }) }; };
  const dev = mk(true); const e1 = await code(dev.svc.startCheckout(input()));
  assert.deepEqual([e1.status, e1.code], [502, "PAYMENT_PROVIDER_ERROR"]);
  assert.match(e1.details[0].message, /Safepay api HTTP 401/);
  const prod = mk(false); const e2 = await code(prod.svc.startCheckout(input()));
  assert.equal(e2.details, undefined);
  // Safepay echoes our secret in its error text: it must be redacted in the response AND in the log
  const echo = setup(); const realFetch = echo.api.fetchImpl;
  const svc = createPaymentService({ repo: echo.repo, safepay: createSafepayClient(parsed().config, { fetchImpl: async () => ({ ok: false, status: 400, json: async () => ({ status: { message: `invalid key ${SECRET_KEY} / ${PUBLIC_KEY} / ${WEBHOOK_SECRET}` } }) }) }), config: parsed().config, priceCart: echo.priceCart, publicSiteUrl: SITE, diagnostics: true, log: (e, f) => echo.logs.push([e, f]) });
  const e3 = await code(svc.startCheckout(input()));
  const blob = JSON.stringify({ d: e3.details, m: e3.message, l: echo.logs });
  for (const v of [SECRET_KEY, PUBLIC_KEY, WEBHOOK_SECRET]) assert.ok(!blob.includes(v));
  assert.match(blob, /\[redacted\]/);
  void realFetch;
});
test("a misconfigured webhook secret does not stop payments from being created; webhooks alone are refused", async () => {
  const cfg = parseSafepayConfig({ ...ENV, SAFEPAY_WEBHOOK_SECRET: SECRET_KEY }).config; // same value as the API secret: webhooks off, payments on
  const ctx = setup({ config: cfg });
  assert.equal(ctx.service.enabled, true);
  assert.equal((await startOk(ctx)).status, "redirect");
  assert.equal((await ctx.service.handleWebhook(ctx.hook({ type: "payment.succeeded" }, SECRET_KEY))).status, 503);
});

// ================================================================== webhook signature
test("signature: HMAC-SHA512 hex over the raw body; accepts the documented canonical form too; rejects everything else", () => {
  const raw = Buffer.from(JSON.stringify({ type: "payment.succeeded", data: { tracker: "track_x" } }));
  const sig = signWebhookBody(raw, WEBHOOK_SECRET);
  assert.equal(sig.length, 128);
  assert.equal(verifyWebhookSignature(raw, sig, WEBHOOK_SECRET), true);
  assert.equal(verifyWebhookSignature(raw, sig.toUpperCase(), WEBHOOK_SECRET), true);
  const pretty = Buffer.from(JSON.stringify(JSON.parse(raw.toString()), null, 2)); // whitespace differs from what was signed (canonical compact form)
  assert.equal(verifyWebhookSignature(pretty, sig, WEBHOOK_SECRET), true);
  assert.equal(verifyWebhookSignature(Buffer.from(raw.toString().replace("track_x", "track_y")), sig, WEBHOOK_SECRET), false); // tampered
  assert.equal(verifyWebhookSignature(raw, sig, SECRET_KEY), false);          // the API secret is NOT the webhook secret
  assert.equal(verifyWebhookSignature(raw, signWebhookBody(raw, "other"), WEBHOOK_SECRET), false);
  for (const bad of [undefined, null, "", "abc", "z".repeat(128), sig.slice(1), sig + "0"]) assert.equal(verifyWebhookSignature(raw, bad, WEBHOOK_SECRET), false, String(bad));
  assert.equal(verifyWebhookSignature(raw, sig, ""), false);
  assert.equal(verifyWebhookSignature(raw.toString(), sig, WEBHOOK_SECRET), false); // must be raw bytes
});

// ================================================================== Safepay API client (against the fake HTTP API)
test("client: createTracker sends exactly what Safepay documents, in MINOR units, with the secret only in the auth header", async () => {
  const api = fakeSafepayApi(parsed().config); const c = createSafepayClient(parsed().config, { fetchImpl: api.fetchImpl });
  const { token } = await c.createTracker({ amountMinor: 4109, currency: "USD", orderNumber: "POK-260101-ABCDEF" });
  assert.ok(isTrackerToken(token));
  const call = api.calls[0];
  assert.deepEqual([call.method, call.path], ["POST", "/order/payments/v3/"]);
  assert.equal(call.url, "https://sandbox.api.getsafepay.com/order/payments/v3/");
  assert.equal(call.headers["X-SFPY-MERCHANT-SECRET"], SECRET_KEY);
  assert.deepEqual(call.body, { merchant_api_key: PUBLIC_KEY, intent: "CYBERSOURCE", mode: "payment", entry_mode: "raw", currency: "USD", amount: 4109, include_fees: false, metadata: { order_id: "POK-260101-ABCDEF", source: "parents-of-khan" } });
  assert.ok(!call.url.includes(SECRET_KEY) && !JSON.stringify(call.body).includes(SECRET_KEY));
  for (const bad of [0, -1, 41.09, "4109", NaN]) assert.equal((await code(c.createTracker({ amountMinor: bad, currency: "USD", orderNumber: "x" }))).kind, "bad_request", String(bad));
  assert.equal((await code(c.createTracker({ amountMinor: 100, currency: "XXX", orderNumber: "x" }))).kind, "bad_request");
});
test("client: auth token, hosted checkout URL and tracker fetch (both documented response shapes)", async () => {
  const api = fakeSafepayApi(parsed().config); const c = createSafepayClient(parsed().config, { fetchImpl: api.fetchImpl });
  const { token } = await c.createTracker({ amountMinor: 2000, currency: "USD", orderNumber: "POK-260101-ABCDEF" });
  const tbt = await c.createAuthToken();
  assert.match(tbt, /^tbt_/);
  const url = new URL(c.buildCheckoutUrl({ tracker: token, tbt, redirectUrl: `${SITE}/order/POK-1/${TOKEN}`, cancelUrl: `${SITE}/order/POK-1/${TOKEN}?cancelled=1` }));
  assert.equal(url.origin + url.pathname, "https://sandbox.api.getsafepay.com/embedded/");
  assert.deepEqual([...url.searchParams.keys()], ["environment", "tracker", "tbt", "source", "redirect_url", "cancel_url"]);
  assert.equal(url.searchParams.get("environment"), "sandbox");
  assert.equal(url.searchParams.get("source"), "hosted");
  assert.equal(url.searchParams.get("cancel_url"), `${SITE}/order/POK-1/${TOKEN}?cancelled=1`); // round-trips intact (properly encoded)
  assert.ok(!url.toString().includes(SECRET_KEY) && !url.toString().includes(WEBHOOK_SECRET));
  for (const shape of ["nested", "flat"]) {
    api.st.shape = shape;
    assert.deepEqual(await c.fetchTracker(token), { token, state: "TRACKER_STARTED", amountMinor: 2000, currency: "USD" }, shape);
  }
  api.set(token, { hideAmount: true });
  assert.equal((await c.fetchTracker(token)).amountMinor, null);
  assert.equal((await code(c.fetchTracker("nope"))).kind, "bad_request");
});
test("client: provider failures are classified, carry no secret, and are flagged retryable correctly", async () => {
  const api = fakeSafepayApi(parsed().config); const c = createSafepayClient(parsed().config, { fetchImpl: api.fetchImpl });
  api.st.fail = 401; let e = await code(c.createAuthToken());
  assert.deepEqual([e.kind, e.status, e.retryable], ["api", 401, false]);
  api.st.fail = 503; e = await code(c.createAuthToken()); assert.deepEqual([e.kind, e.retryable], ["api", true]);
  api.st.fail = "network"; e = await code(c.createAuthToken()); assert.deepEqual([e.kind, e.retryable], ["network", true]);
  for (const err of [e, await code(c.fetchTracker("track_00000000-0000-0000-0000-000000000000"))]) for (const secret of [SECRET_KEY, PUBLIC_KEY, WEBHOOK_SECRET]) assert.ok(!JSON.stringify({ m: err.message, s: err.stack, p: err.providerMessage }).includes(secret));
  api.st.fail = null;
  const bad = createSafepayClient(parsed().config, { fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ data: {} }) }) });
  assert.equal((await code(bad.createTracker({ amountMinor: 100, currency: "USD", orderNumber: "x" }))).kind, "invalid_response");
  const slow = createSafepayClient(parsed().config, { fetchImpl: (u, o) => new Promise((_, rej) => o.signal.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" })))), timeoutMs: 20 });
  assert.match((await code(slow.createAuthToken())).message, /did not respond in time/);
  const other = createSafepayClient(parsed().config, { fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ data: { tracker: { token: "track_11111111-aaaa-4aaa-8aaa-111111111111", state: "TRACKER_ENDED" } } }) }) });
  assert.equal((await code(other.fetchTracker("track_22222222-bbbb-4bbb-8bbb-222222222222"))).kind, "invalid_response"); // a different tracker than asked for
});

// ================================================================== pure rules
test("rules: a tracker only counts as paid when ENDED for exactly the saved amount and currency", () => {
  const exp = { amountMinor: 4109, currency: "USD" };
  assert.equal(evaluateTracker({ state: "TRACKER_ENDED", amountMinor: 4109, currency: "USD" }, exp).outcome, "paid");
  assert.equal(evaluateTracker({ state: "TRACKER_ENDED", amountMinor: 4108, currency: "USD" }, exp).reason, "amount_mismatch");
  assert.equal(evaluateTracker({ state: "TRACKER_ENDED", amountMinor: 4109, currency: "PKR" }, exp).reason, "currency_mismatch");
  assert.equal(evaluateTracker({ state: "TRACKER_ENDED", amountMinor: null, currency: "USD" }, exp).reason, "amount_unverifiable");
  assert.equal(evaluateTracker({ state: "TRACKER_ENDED", amountMinor: 410900, currency: "USD" }, exp).outcome, "mismatch"); // wrong units (x100)
  for (const [state, outcome] of [["TRACKER_STARTED", "pending"], ["TRACKER_ENROLLED", "pending"], ["TRACKER_AUTHORIZED", "pending"], ["TRACKER_CANCELLED", "cancelled"], ["TRACKER_EXPIRED", "expired"], ["TRACKER_PARTIAL_REFUND", "attention"], ["TRACKER_DISPUTED", "attention"], ["TRACKER_VOIDED", "attention"], ["SOMETHING_NEW", "attention"], [undefined, "attention"]])
    assert.equal(evaluateTracker({ state, amountMinor: 4109, currency: "USD" }, exp).outcome, outcome, String(state));
  assert.equal(trackerPhase("TRACKER_STARTED") === "paid", false);
  assert.deepEqual([toMinor(41.09), toMinor(0.1 + 0.2), toMinor(20), toMinor(4.83)], [4109, 30, 2000, 483]);
});
test("rules: webhook claims that contradict the saved order are rejected", () => {
  const order = { orderNumber: "POK-260101-ABCDEF", paymentCurrency: "USD", paymentAmountMinor: 4109 };
  const ev = (d, top = {}) => ({ merchant_api_key: PUBLIC_KEY, data: { metadata: { order_id: order.orderNumber }, amount: 4109, currency: "USD", ...d }, ...top });
  assert.equal(checkWebhookClaims(ev({}), order, { publicKey: PUBLIC_KEY }).ok, true);
  assert.equal(checkWebhookClaims(ev({ amount: 1 }), order, { publicKey: PUBLIC_KEY }).reason, "amount_mismatch");
  assert.equal(checkWebhookClaims(ev({ metadata: { order_id: "POK-OTHER" } }), order, { publicKey: PUBLIC_KEY }).reason, "order_reference_mismatch");
  assert.equal(checkWebhookClaims(ev({}, { merchant_api_key: "sec_other" }), order, { publicKey: PUBLIC_KEY }).reason, "wrong_merchant");
  assert.equal(checkWebhookClaims(ev({ amount: 1150000, currency: "PKR" }), order, { publicKey: PUBLIC_KEY }).ok, true); // settlement-currency figure can't be compared: Safepay's tracker is the authority
});

// ================================================================== checkout input
test("checkout input: valid input is normalised; every invalid field gets a field-specific error", () => {
  const ok = parseCheckoutInput(rawInput({ customer: { name: "  Ayesha   Khan ", email: " Ayesha@Example.COM ", phone: "" } }));
  assert.deepEqual(ok.errors, []);
  assert.deepEqual([ok.value.customer.name, ok.value.customer.email, ok.value.customer.phone, ok.value.clientRequestId], ["Ayesha Khan", "ayesha@example.com", "", TOKEN]);
  const paths = (over) => parseCheckoutInput(rawInput(over)).errors.map((e) => e.path);
  assert.deepEqual(paths({ clientRequestId: "abc" }), ["clientRequestId"]);
  assert.deepEqual(paths({ clientRequestId: "11111111-1111-1111-1111-111111111111" }), ["clientRequestId"]); // not a v4 UUID
  assert.deepEqual(paths({ items: [] }), ["items"]);
  assert.deepEqual(paths({ items: [{ productId: "x", color: "Black", size: "M", quantity: 1 }] }), ["items.0"]);
  assert.deepEqual(paths({ items: [{ productId: PID, color: "Black", size: "M", quantity: 0 }] }), ["items.0"]);
  assert.deepEqual(paths({ country: "XX" }), ["country"]);
  assert.deepEqual(paths({ customer: { name: "A", email: "a@b.co" } }), ["customer.name"]);
  assert.deepEqual(paths({ customer: { name: "Ayesha", email: "nope" } }), ["customer.email"]);
  assert.deepEqual(paths({ customer: { name: "Ayesha", email: "a@b.co", phone: "abc" } }), ["customer.phone"]);
  assert.deepEqual(paths({ address: { line1: "", city: "" } }), ["address.line1", "address.city"]);
  assert.deepEqual(paths({ submitted: { total: "41" } }), ["submitted.total"]);
  assert.deepEqual(paths({ submitted: { total: NaN } }), ["submitted.total"]);
  assert.equal(parseCheckoutInput(null).value, null);
  assert.equal(parseOrderAccess({ token: TOKEN }).value.token, TOKEN);
  assert.equal(parseOrderAccess({ token: "x" }).value, null);
  assert.ok(isOrderNumber("POK-260101-ABCDEF") && !isOrderNumber("x") && isOrderNumber(newOrderNumber()));
});

// ================================================================== payment session creation
test("start: creates ONE unpaid order, ONE Safepay session for the exact server total in USD minor units, and returns the hosted-checkout URL", async () => {
  const ctx = setup();
  const r = await startOk(ctx, { submitted: undefined });
  // 2 x $20 = $40.00 ; domestic shipping PKR 300 at the admin's rate 276.87 => $1.09 (rounded up) ; total $41.09 = 4109 cents
  assert.deepEqual([r.amountMinor, r.currency], [4109, "USD"]);
  const o = ctx.order();
  assert.deepEqual([o.total, o.subtotal, o.shipping, o.currency, o.payment.status, o.payment.method, o.payment.environment, o.payment.amountMinor, o.payment.currency], [41.09, 40, 1.09, "USD", "unpaid", "safepay", "sandbox", 4109, "USD"]);
  assert.equal(o.shippingDetails.amount, 300);                       // the existing NLS Xpress snapshot is preserved on the order
  assert.deepEqual([o.shippingDetails.currency, o.shippingDetails.courier, o.shippingDetails.exchangeRatePkrPerUsd], ["PKR", "NLS Xpress Domestic", 276.87]);
  assert.equal(o.shippingAddress.country, "Pakistan");
  assert.deepEqual([o.items[0].name, o.items[0].quantity, o.items[0].unitPrice, o.items[0].sku], ["Khan Tee", 2, 20, "KT-B"]);
  assert.equal(o.checkoutTokenHash, sha256(TOKEN));
  assert.ok(!JSON.stringify(o).includes(TOKEN), "the plain checkout token is never stored");
  const create = ctx.api.calls.find((c) => c.path === "/order/payments/v3/");
  assert.deepEqual([create.body.amount, create.body.currency, create.body.metadata.order_id], [4109, "USD", o.orderNumber]);
  assert.equal(ctx.repo._payments.length, 1);
  assert.deepEqual([ctx.repo._payments[0].status, ctx.repo._payments[0].amountMinor, ctx.repo._payments[0].currency], ["pending", 4109, "USD"]);
  const u = new URL(r.redirectUrl);
  assert.equal(u.origin + u.pathname, "https://sandbox.api.getsafepay.com/embedded/");
  assert.equal(u.searchParams.get("tracker"), ctx.repo._payments[0].tracker);
  assert.equal(u.searchParams.get("redirect_url"), `${SITE}/order/${o.orderNumber}/${TOKEN}`);
  assert.equal(u.searchParams.get("cancel_url"), `${SITE}/order/${o.orderNumber}/${TOKEN}?cancelled=1`);
});
test("start: the charge uses the REAL shipping charge: Free Shipping, international weight-based rates and the product sale price all flow into the amount", async () => {
  let ctx = setup({ settings: { domestic: { freeShipping: true } } });
  assert.equal((await startOk(ctx)).amountMinor, 4000);                       // free shipping: subtotal only, no exchange rate needed
  ctx = setup({ settings: { pkrPerUsd: null, domestic: { freeShipping: true } } });
  assert.equal((await startOk(ctx)).amountMinor, 4000);
  ctx = setup({ products: [product({ salePrice: 15 })], settings: { domestic: { fixedCharge: 420, additionalPerKg: 150 } } });
  assert.equal((await startOk(ctx)).amountMinor, 3000 + 152);                // 2 x $15 + ceil(420/276.87 cents = 151.69) = 152
  const dubai = { _id: "d1", countryCode: "AE", city: "Dubai", cityKey: "dubai", displayName: "Dubai, UAE", courier: "NLS Xpress International", pricingMethod: "weight_based", firstKgPrice: 1000, additionalKgPrice: 300, flatRateOver20Kg: 7000, currency: "PKR", enabled: true };
  ctx = setup({ destinations: [dubai], settings: { pkrPerUsd: 280 } });
  const r = await startOk(ctx, { country: "AE", address: { line1: "Marina Walk 1", city: "Dubai" } });
  assert.equal(r.amountMinor, 4000 + 358);                                   // 1 kg => PKR 1000 / 280 = $3.5714 => $3.58
  assert.equal(ctx.order().shippingDetails.scope, "international");
});
test("start: no combined total (no PKR/USD rate), unsupported destination, or changed price => no order and no Safepay session", async () => {
  let ctx = setup({ settings: { pkrPerUsd: null } });
  let e = await code(ctx.service.startCheckout(input()));
  assert.deepEqual([e.status, e.code], [422, "TOTAL_UNAVAILABLE"]);
  assert.deepEqual([ctx.repo._orders.size, ctx.api.calls.length], [0, 0]);
  ctx = setup();
  e = await code(ctx.service.startCheckout(input({ country: "DE", address: { line1: "Hauptstr 1", city: "Berlin" } })));
  assert.equal(e.code, "SHIPPING_UNAVAILABLE");
  assert.deepEqual([ctx.repo._orders.size, ctx.api.calls.length], [0, 0]);
  for (const submitted of [{ total: 1 }, { shippingAmount: 0 }, { subtotal: 39 }]) {
    e = await code(ctx.service.startCheckout(input({ submitted })));
    assert.deepEqual([e.status, e.code], [409, "TOTALS_MISMATCH"], JSON.stringify(submitted));
  }
  assert.deepEqual([ctx.repo._orders.size, ctx.api.calls.length], [0, 0]);
  const ok = await ctx.service.startCheckout(input({ submitted: { shippingAmount: 300, subtotal: 40, total: 41.09 } })); // the amounts the customer saw
  assert.equal(ok.status, "redirect");
  e = await code(setup().service.startCheckout(input({ items: [{ productId: "bbbbbbbbbbbbbbbbbbbbbbbb", color: "Black", size: "M", quantity: 1 }] })));
  assert.equal(e.code, "CART_INVALID");
});
test("start: missing/invalid credentials => payments unavailable, nothing is created, the provider is never called", async () => {
  const ctx = setup({ config: null });
  assert.equal(ctx.service.enabled, false);
  const e = await code(ctx.service.startCheckout(input()));
  assert.deepEqual([e.status, e.code], [503, "PAYMENTS_UNAVAILABLE"]);
  assert.equal(ctx.repo._orders.size, 0);
  assert.equal((await code(ctx.service.retryPayment({ orderNumber: "POK-260101-ABCDEF", token: TOKEN }))).code, "PAYMENTS_UNAVAILABLE");
  assert.deepEqual((await ctx.service.handleWebhook(ctx.hook({ type: "payment.succeeded" }))).status, 503);
  // wrong secret at Safepay => a generic provider error for the customer, details only in the server log, no secret anywhere
  const bad = setup(); bad.api.st.fail = 401;
  const e2 = await code(bad.service.startCheckout(input()));
  assert.deepEqual([e2.status, e2.code], [502, "PAYMENT_PROVIDER_ERROR"]);
  const leaked = JSON.stringify({ m: e2.message, d: e2.details, l: bad.logs });
  for (const secret of [SECRET_KEY, WEBHOOK_SECRET]) assert.ok(!leaked.includes(secret));
  assert.ok(bad.logs.some(([ev, f]) => ev === "safepay_error" && f.status === 401));
});

// ================================================================== duplicates / idempotency
test("idempotency: pressing Pay again (same checkout token) returns the same order and the same Safepay session", async () => {
  const ctx = setup();
  const a = await startOk(ctx), b = await startOk(ctx), c = await startOk(ctx);
  assert.deepEqual([ctx.repo._orders.size, ctx.repo._payments.length, ctx.api.count("/order/payments/v3/")], [1, 1, 1]);
  assert.deepEqual([a.orderNumber === b.orderNumber, b.orderNumber === c.orderNumber], [true, true]);
  assert.equal(new URL(a.redirectUrl).searchParams.get("tracker"), new URL(c.redirectUrl).searchParams.get("tracker"));
  assert.notEqual(new URL(a.redirectUrl).searchParams.get("tbt"), new URL(c.redirectUrl).searchParams.get("tbt")); // a fresh short-lived auth token each time
});
test("idempotency: five simultaneous requests (double click / refresh storm) create exactly one order and one session", async () => {
  const ctx = setup();
  const results = await Promise.allSettled(Array.from({ length: 5 }, () => ctx.service.startCheckout(input())));
  assert.deepEqual([ctx.repo._orders.size, ctx.repo._payments.length, ctx.api.count("/order/payments/v3/")], [1, 1, 1]);
  const ok = results.filter((r) => r.status === "fulfilled"), failed = results.filter((r) => r.status === "rejected");
  assert.ok(ok.length >= 1);
  for (const f of failed) assert.deepEqual([f.reason.status, f.reason.code], [409, "PAYMENT_IN_PROGRESS"]); // the others are told to wait a moment, never double-charged
  const again = await startOk(ctx); // after the burst a normal retry works and still reuses
  assert.equal(ctx.repo._payments.length, 1);
  assert.ok(again.redirectUrl);
});
test("idempotency: the same token with a DIFFERENT cart or address is refused (never silently re-priced)", async () => {
  const ctx = setup();
  await startOk(ctx);
  for (const over of [{ items: [{ productId: PID, color: "Black", size: "M", quantity: 3 }] }, { address: { line1: "Another street 9", city: "Karachi" } }, { customer: { name: "Someone Else", email: "x@y.co" } }]) {
    const e = await code(ctx.service.startCheckout(input(over)));
    assert.deepEqual([e.status, e.code], [409, "CHECKOUT_CHANGED"]);
  }
  assert.deepEqual([ctx.repo._orders.size, ctx.api.count("/order/payments/v3/")], [1, 1]);
  assert.equal(fingerprintOf(input()), fingerprintOf(input({ items: [{ productId: PID, color: "black", size: "m", quantity: 2 }] }))); // same cart in a different spelling
});

// ================================================================== verifying the real outcome (return page / polling)
test("status: a freshly started payment is PENDING; a return URL alone (even with a tracker) never makes it paid", async () => {
  const ctx = setup(); await startOk(ctx);
  const s = await status(ctx);
  assert.deepEqual([s.status, s.canRetry, s.testMode, s.total, s.currency], ["pending", false, true, 41.09, "USD"]);
  assert.equal(ctx.order().payment.status, "unpaid");
  // there is no API that accepts a tracker/'success' flag from the browser: the status request carries only the order link
  assert.deepEqual(Object.keys(parseOrderAccess({ token: TOKEN, tracker: "track_x", status: "paid", success: true }).value), ["token"]);
});
test("status: paid ONLY after Safepay itself reports the tracker ended for the exact amount and currency", async () => {
  const ctx = setup(); await startOk(ctx);
  const tr = ctx.repo._payments[0].tracker;
  ctx.api.set(tr, { state: "TRACKER_ENDED" });
  const s = await status(ctx);
  assert.equal(s.status, "paid");
  const o = ctx.order();
  assert.deepEqual([o.payment.status, o.payment.reference, o.status], ["paid", tr, "pending"]);   // fulfilment status is untouched
  assert.ok(o.payment.paidAt instanceof Date);
  const paidAt = o.payment.paidAt;
  await status(ctx); await status(ctx);
  assert.deepEqual([o._paidCount, o.payment.paidAt === paidAt], [1, true]);                       // polling again changes nothing
  assert.equal(ctx.repo._payments[0].status, "paid");
});
test("status: wrong amount / wrong currency / unverifiable amount from Safepay => NOT paid, flagged for review", async () => {
  for (const patch of [{ reportedAmount: 4108 }, { reportedAmount: 410900 }, { reportedCurrency: "PKR" }, { hideAmount: true }]) {
    const ctx = setup(); await startOk(ctx);
    ctx.api.set(ctx.repo._payments[0].tracker, { state: "TRACKER_ENDED", ...patch });
    const s = await status(ctx);
    assert.equal(s.status, "review", JSON.stringify(patch));
    assert.equal(ctx.order().payment.status, "unpaid");
    assert.equal(s.canRetry, false);
    assert.ok(ctx.logs.some(([e]) => e === "payment_flagged"));
    assert.equal((await code(ctx.service.retryPayment({ orderNumber: ctx.order().orderNumber, token: TOKEN }))).code, "PAYMENT_UNDER_REVIEW"); // no further charging until a person has checked
  }
});
test("status: cancelled and expired sessions are reported accurately and can be retried", async () => {
  for (const [state, expected] of [["TRACKER_CANCELLED", "cancelled"], ["TRACKER_EXPIRED", "expired"]]) {
    const ctx = setup(); await startOk(ctx);
    ctx.api.set(ctx.repo._payments[0].tracker, { state });
    const s = await status(ctx);
    assert.deepEqual([s.status, s.canRetry], [expected, true]);
    assert.equal(ctx.order().payment.status, "unpaid");
  }
});
test("status: if Safepay can't be reached the customer is told it couldn't be confirmed yet; nothing is guessed", async () => {
  const ctx = setup(); await startOk(ctx);
  ctx.api.set(ctx.repo._payments[0].tracker, { state: "TRACKER_ENDED" });
  ctx.api.st.fail = "network";
  const s = await status(ctx);
  assert.deepEqual([s.status, s.verificationDelayed], ["pending", true]);
  assert.equal(ctx.order().payment.status, "unpaid");                 // even though it WAS paid: we only mark what we have verified
  ctx.api.st.fail = null;
  assert.equal((await status(ctx)).status, "paid");                   // the next check succeeds
});
test("status: an order is only visible with its own link token; unknown order and wrong token look identical", async () => {
  const ctx = setup(); await startOk(ctx);
  const o = ctx.order();
  const wrong = await code(ctx.service.getStatus({ orderNumber: o.orderNumber, token: "22222222-2222-4222-8222-222222222222" }));
  const unknown = await code(ctx.service.getStatus({ orderNumber: "POK-260101-ZZZZZZ", token: TOKEN }));
  const malformed = await code(ctx.service.getStatus({ orderNumber: "../etc", token: TOKEN }));
  for (const e of [wrong, unknown, malformed]) assert.deepEqual([e.status, e.code, e.message], [404, "ORDER_NOT_FOUND", "We couldn't find that order."]);
});
test("status polling never hammers Safepay (at most one check per 2 seconds per payment)", async () => {
  const clock = { t: Date.now() }; const ctx = setup({ clock }); await startOk(ctx);
  await status(ctx); await status(ctx); await status(ctx);
  assert.equal(ctx.api.count(`/reporter/api/v1/payments/${ctx.repo._payments[0].tracker}`), 1);
  clock.t += 2500; await status(ctx);
  assert.equal(ctx.api.calls.filter((c) => c.method === "GET").length, 2);
});

// ================================================================== retries
test("retry: after a cancelled attempt the SAME order gets a NEW session for the SAME saved amount", async () => {
  const ctx = setup(); await startOk(ctx);
  ctx.api.set(ctx.repo._payments[0].tracker, { state: "TRACKER_CANCELLED" });
  const r = await ctx.service.retryPayment({ orderNumber: ctx.order().orderNumber, token: TOKEN });
  assert.equal(r.status, "redirect");
  assert.deepEqual([ctx.repo._orders.size, ctx.repo._payments.length], [1, 2]);
  assert.deepEqual(ctx.repo._payments.map((p) => [p.attempt, p.amountMinor, p.currency]), [[1, 4109, "USD"], [2, 4109, "USD"]]);
  assert.equal(ctx.repo._payments[0].status, "cancelled");
  assert.equal(ctx.api.calls.filter((c) => c.path === "/order/payments/v3/").at(-1).body.amount, 4109);
  assert.equal(new URL(r.redirectUrl).searchParams.get("tracker"), ctx.repo._payments[1].tracker);
});
test("retry: the amount can't change on retry even if the shop's prices or shipping change meanwhile", async () => {
  const products = [product()]; const ctx = setup({ products }); await startOk(ctx);
  products[0].price = 500; ctx.api.set(ctx.repo._payments[0].tracker, { state: "TRACKER_EXPIRED" });
  await ctx.service.retryPayment({ orderNumber: ctx.order().orderNumber, token: TOKEN });
  assert.equal(ctx.repo._payments[1].amountMinor, 4109);
});
test("retry: a still-live session is reused (no second tracker); an old one (past the 1-hour token life) is replaced", async () => {
  const clock = { t: Date.now() }; const ctx = setup({ clock }); await startOk(ctx);
  const first = ctx.repo._payments[0].tracker;
  const r1 = await ctx.service.retryPayment({ orderNumber: ctx.order().orderNumber, token: TOKEN });
  assert.deepEqual([ctx.repo._payments.length, new URL(r1.redirectUrl).searchParams.get("tracker")], [1, first]);
  clock.t += 55 * 60_000;
  const r2 = await ctx.service.retryPayment({ orderNumber: ctx.order().orderNumber, token: TOKEN });
  assert.equal(ctx.repo._payments.length, 2);
  assert.notEqual(new URL(r2.redirectUrl).searchParams.get("tracker"), first);
});
test("retry: if the customer actually PAID on the old session (webhook delayed), retry confirms it instead of creating a second charge", async () => {
  const ctx = setup(); await startOk(ctx);
  ctx.api.set(ctx.repo._payments[0].tracker, { state: "TRACKER_ENDED" });
  const r = await ctx.service.retryPayment({ orderNumber: ctx.order().orderNumber, token: TOKEN });
  assert.deepEqual([r.status, ctx.repo._payments.length, ctx.api.count("/order/payments/v3/"), ctx.order().payment.status], ["paid", 1, 1, "paid"]);
  const again = await ctx.service.retryPayment({ orderNumber: ctx.order().orderNumber, token: TOKEN });
  assert.equal(again.status, "paid");
  assert.equal(ctx.api.count("/order/payments/v3/"), 1);
  assert.equal((await ctx.service.startCheckout(input())).status, "paid");     // even a re-submitted checkout of a paid order never makes a new session
});
test("retry: wrong token is refused; attempts are capped", async () => {
  const ctx = setup(); await startOk(ctx);
  assert.equal((await code(ctx.service.retryPayment({ orderNumber: ctx.order().orderNumber, token: "22222222-2222-4222-8222-222222222222" }))).code, "ORDER_NOT_FOUND");
  for (let i = 0; i < 9; i++) {
    ctx.api.set(ctx.repo._payments.at(-1).tracker, { state: "TRACKER_CANCELLED" });
    await ctx.service.retryPayment({ orderNumber: ctx.order().orderNumber, token: TOKEN });
  }
  assert.equal(ctx.repo._payments.length, 10);
  ctx.api.set(ctx.repo._payments.at(-1).tracker, { state: "TRACKER_CANCELLED" });
  const e = await code(ctx.service.retryPayment({ orderNumber: ctx.order().orderNumber, token: TOKEN }));
  assert.deepEqual([e.status, e.code], [429, "TOO_MANY_ATTEMPTS"]);
});

// ================================================================== webhooks
const deliver = (ctx, ev, opts = {}) => ctx.service.handleWebhook(ctx.hook(ev, opts.secret, opts.sig));
test("webhook: invalid / missing / wrong-secret signatures are rejected with 401 and change nothing", async () => {
  const ctx = setup(); await startOk(ctx);
  const tr = ctx.repo._payments[0].tracker; ctx.api.set(tr, { state: "TRACKER_ENDED" });
  const ev = eventFor(tr, { orderId: ctx.order().orderNumber });
  for (const opts of [{ sig: "0".repeat(128) }, { sig: "" }, { sig: undefined, secret: SECRET_KEY }, { sig: undefined, secret: "other-secret-value-12345" }]) {
    const out = await deliver(ctx, ev, opts.sig === undefined ? { secret: opts.secret } : { sig: opts.sig });
    assert.equal(out.status, 401, JSON.stringify(opts));
  }
  const raw = Buffer.from(JSON.stringify(ev));
  assert.equal((await ctx.service.handleWebhook({ rawBody: raw, signature: undefined })).status, 401);
  const tampered = Buffer.from(JSON.stringify({ ...ev, data: { ...ev.data, amount: 1 } }));
  assert.equal((await ctx.service.handleWebhook({ rawBody: tampered, signature: signWebhookBody(raw, WEBHOOK_SECRET) })).status, 401);
  assert.equal(ctx.order().payment.status, "unpaid");
  assert.equal(ctx.repo._events.size, 0);
});
test("webhook: a verified payment.succeeded is CONFIRMED with Safepay, then marks the order paid", async () => {
  const ctx = setup(); await startOk(ctx);
  const tr = ctx.repo._payments[0].tracker; ctx.api.set(tr, { state: "TRACKER_ENDED" });
  const out = await deliver(ctx, eventFor(tr, { orderId: ctx.order().orderNumber }));
  assert.deepEqual([out.status, out.body.outcome], [200, "paid"]);
  assert.deepEqual([ctx.order().payment.status, ctx.order().payment.reference], ["paid", tr]);
  assert.ok(ctx.api.calls.some((c) => c.method === "GET" && c.path.endsWith(tr)), "it must have asked Safepay, not just trusted the payload");
});
test("webhook: a validly SIGNED 'succeeded' event does not mark paid when Safepay says the tracker is not ended (retry requested)", async () => {
  const ctx = setup(); await startOk(ctx);
  const tr = ctx.repo._payments[0].tracker;                     // still TRACKER_STARTED at Safepay
  const ev = eventFor(tr, { orderId: ctx.order().orderNumber });
  const out = await deliver(ctx, ev);
  assert.deepEqual([out.status, out.body.code], [503, "NOT_SETTLED_YET"]);   // 5xx => Safepay retries later
  assert.equal(ctx.order().payment.status, "unpaid");
  ctx.api.set(tr, { state: "TRACKER_ENDED" });                  // Safepay catches up and re-delivers the SAME event
  const retry = await deliver(ctx, ev);
  assert.deepEqual([retry.status, retry.body.outcome, ctx.order().payment.status], [200, "paid", "paid"]);
});
test("webhook: repeated deliveries of the same event are acknowledged and applied exactly once", async () => {
  const ctx = setup(); await startOk(ctx);
  const tr = ctx.repo._payments[0].tracker; ctx.api.set(tr, { state: "TRACKER_ENDED" });
  const ev = eventFor(tr, { orderId: ctx.order().orderNumber });
  const first = await deliver(ctx, ev);
  const getsAfterFirst = ctx.api.calls.filter((c) => c.method === "GET").length;
  const second = await deliver(ctx, ev), third = await deliver(ctx, ev);
  assert.deepEqual([first.body.outcome, second.body.duplicate, third.body.duplicate, second.status, third.status], ["paid", true, true, 200, 200]);
  assert.equal(ctx.order()._paidCount, 1);
  assert.equal(ctx.api.calls.filter((c) => c.method === "GET").length, getsAfterFirst);       // duplicates cost nothing
  const concurrent = await Promise.all(Array.from({ length: 4 }, () => deliver(ctx, eventFor(tr, { orderId: ctx.order().orderNumber }))));  // distinct events racing for the same tracker
  assert.ok(concurrent.every((r) => r.status === 200));
  assert.equal(ctx.order()._paidCount, 1);
});
test("webhook: payloads that contradict the saved order (amount, currency-matched amount, order reference, merchant) are flagged and NEVER pay", async () => {
  const cases = [
    ["amount", { data: { amount: 4000 } }], ["order reference", { orderId: "POK-260101-OTHER1" }], ["merchant", { top: { merchant_api_key: "sec_someone_else" } }],
  ];
  for (const [label, over] of cases) {
    const ctx = setup(); await startOk(ctx);
    const tr = ctx.repo._payments[0].tracker; ctx.api.set(tr, { state: "TRACKER_ENDED" });   // Safepay WOULD confirm it
    const out = await deliver(ctx, eventFor(tr, { orderId: ctx.order().orderNumber, ...over }));
    assert.deepEqual([out.status, out.body.outcome], [200, "flagged"], label);              // acknowledged (a retry can't fix it) but not paid
    assert.equal(ctx.order().payment.status, "unpaid", label);
    assert.equal(ctx.repo._payments[0].status, "review", label);
  }
  const ctx = setup(); await startOk(ctx);                                                  // Safepay's own record disagrees with our order
  const tr = ctx.repo._payments[0].tracker; ctx.api.set(tr, { state: "TRACKER_ENDED", reportedAmount: 100 });
  const out = await deliver(ctx, eventFor(tr, { orderId: ctx.order().orderNumber }));
  assert.deepEqual([out.status, out.body.outcome, ctx.order().payment.status, ctx.repo._payments[0].reason], [200, "mismatch", "unpaid", "amount_mismatch"]);
  const ctx2 = setup(); await startOk(ctx2);
  const t2 = ctx2.repo._payments[0].tracker; ctx2.api.set(t2, { state: "TRACKER_ENDED", reportedCurrency: "PKR" });
  assert.equal((await deliver(ctx2, eventFor(t2, { orderId: ctx2.order().orderNumber }))).body.outcome, "mismatch");
});
test("webhook: unknown trackers, other event types and unusable payloads are acknowledged without acting; bad JSON is a 400", async () => {
  const ctx = setup(); await startOk(ctx);
  const unknown = await deliver(ctx, eventFor("track_99999999-9999-4999-8999-999999999999", { orderId: "x" }));
  assert.deepEqual([unknown.status, unknown.body.outcome], [200, "unknown_tracker"]);
  assert.equal((await deliver(ctx, { ...eventFor("track_x"), type: "subscription.created" })).body.ignored, true);
  assert.equal((await deliver(ctx, eventFor("not-a-tracker", { orderId: "x" }))).body.ignored, true);
  assert.equal((await ctx.service.handleWebhook(ctx.hook("{not json"))).status, 400);
  assert.equal((await ctx.service.handleWebhook(ctx.hook('["array"]'))).status, 400);
  assert.equal(ctx.order().payment.status, "unpaid");
});
test("webhook: payment.failed records only a category/code; the shopper can still pay on the same session afterwards", async () => {
  const ctx = setup(); await startOk(ctx);
  const tr = ctx.repo._payments[0].tracker;
  const failed = { type: "payment.failed", data: { tracker: tr, state: "TRACKER_ENROLLED", category: "PAYMENT_METHOD_ERROR", code: 403, message: "The card you have used has been flagged as stolen", metadata: {} } };
  const out = await deliver(ctx, { ...eventFor(tr, { orderId: ctx.order().orderNumber }), ...failed });
  assert.deepEqual([out.status, out.body.outcome, ctx.order().payment.status, ctx.repo._payments[0].status], [200, "failed", "failed", "failed"]);
  assert.ok(!JSON.stringify(ctx.repo._payments[0]).includes("stolen"), "card-network free text is never stored");
  const st = await status(ctx);                                  // Safepay still reports STARTED, but the customer is told the attempt failed and may retry on the SAME session
  assert.deepEqual([st.status, st.canRetry], ["failed", true]);
  const retried = await ctx.service.retryPayment({ orderNumber: ctx.order().orderNumber, token: TOKEN });
  assert.deepEqual([retried.status, ctx.repo._payments.length, ctx.repo._payments[0].status, ctx.order().payment.status], ["redirect", 1, "pending", "unpaid"]); // reused, no second tracker; back to pending
  ctx.api.set(tr, { state: "TRACKER_ENDED" });
  const ok = await deliver(ctx, eventFor(tr, { orderId: ctx.order().orderNumber }));
  assert.deepEqual([ok.body.outcome, ctx.order().payment.status], ["paid", "paid"]);
  const late = await deliver(ctx, { ...eventFor(tr, { orderId: ctx.order().orderNumber }), ...failed });   // a late failure event must not undo a verified payment
  assert.equal(ctx.order().payment.status, "paid");
  assert.equal(late.status, 200);
});
test("delayed webhook: the return-page check pays the order first; the late webhook then changes nothing", async () => {
  const ctx = setup(); await startOk(ctx);
  const tr = ctx.repo._payments[0].tracker; ctx.api.set(tr, { state: "TRACKER_ENDED" });
  assert.equal((await status(ctx)).status, "paid");
  const out = await deliver(ctx, eventFor(tr, { orderId: ctx.order().orderNumber }));
  assert.equal(out.status, 200);
  assert.equal(ctx.order()._paidCount, 1);
});
test("webhook: a second successful charge on a different tracker (duplicate payment) is flagged, the order stays paid by the first", async () => {
  const ctx = setup(); await startOk(ctx);
  const first = ctx.repo._payments[0].tracker; ctx.api.set(first, { state: "TRACKER_ENDED" });
  await status(ctx);
  const second = await ctx.api.fetchImpl(`${"https://sandbox.api.getsafepay.com"}/order/payments/v3/`, { method: "POST", headers: { "X-SFPY-MERCHANT-SECRET": SECRET_KEY }, body: JSON.stringify({ merchant_api_key: PUBLIC_KEY, intent: "CYBERSOURCE", mode: "payment", currency: "USD", amount: 4109, metadata: { order_id: ctx.order().orderNumber } }) }).then((r) => r.json());
  const t2 = second.data.tracker.token; ctx.api.set(t2, { state: "TRACKER_ENDED" });
  await ctx.repo.createPayment({ orderId: ctx.order()._id, orderNumber: ctx.order().orderNumber, tracker: t2, amountMinor: 4109, currency: "USD", environment: "sandbox", status: "pending", attempt: 2 });
  const out = await deliver(ctx, eventFor(t2, { orderId: ctx.order().orderNumber }));
  assert.equal(out.status, 200);
  assert.deepEqual([ctx.order().payment.reference, ctx.order()._paidCount, ctx.repo._payments[1].status, ctx.repo._payments[1].reason], [first, 1, "review", "duplicate_payment"]);
});
test("webhook: a verified refund moves a paid order to refunded; provider trouble during confirmation asks Safepay to retry (503)", async () => {
  const ctx = setup(); await startOk(ctx);
  const tr = ctx.repo._payments[0].tracker; ctx.api.set(tr, { state: "TRACKER_ENDED" }); await status(ctx);
  ctx.api.set(tr, { state: "TRACKER_REFUNDED" });
  const out = await deliver(ctx, { ...eventFor(tr, { orderId: ctx.order().orderNumber }), type: "payment.refunded" });
  assert.deepEqual([out.status, ctx.order().payment.status], [200, "refunded"]);
  const c2 = setup(); await startOk(c2);
  c2.api.st.fail = "network";
  const r = await deliver(c2, eventFor(c2.repo._payments[0].tracker, { orderId: c2.order().orderNumber }));
  assert.deepEqual([r.status, r.body.code, c2.order().payment.status], [503, "TEMPORARY_ERROR", "unpaid"]);
  c2.api.st.fail = null; c2.api.set(c2.repo._payments[0].tracker, { state: "TRACKER_ENDED" });
  assert.equal((await deliver(c2, eventFor(c2.repo._payments[0].tracker, { orderId: c2.order().orderNumber, top: { token: [...c2.repo._events.keys()][0] } }))).body.outcome, "paid"); // the SAME event token re-delivered after the failure is processed (it was never marked done)
});
test("webhook: confirming with Safepay uses a short timeout so the 10-second acknowledgement window is respected", async () => {
  const ctx = setup(); await startOk(ctx);
  const tr = ctx.repo._payments[0].tracker; ctx.api.set(tr, { state: "TRACKER_ENDED" });
  const seen = []; const real = ctx.sp.fetchTracker.bind(ctx.sp);
  const spied = createPaymentService({ repo: ctx.repo, safepay: { ...ctx.sp, environment: "sandbox", fetchTracker: (t, o) => { seen.push(o?.timeoutMs); return real(t, o); } }, config: parsed().config, priceCart: ctx.priceCart, publicSiteUrl: SITE });
  assert.equal((await spied.handleWebhook(ctx.hook(eventFor(tr, { orderId: ctx.order().orderNumber })))).status, 200);
  assert.deepEqual(seen, [5000]);
  const slow = createSafepayClient(parsed().config, { fetchImpl: (u, o) => new Promise((_, rej) => o.signal.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" })))), timeoutMs: 10_000 });
  const started = Date.now();
  assert.match((await code(slow.fetchTracker("track_11111111-aaaa-4aaa-8aaa-111111111111", { timeoutMs: 30 }))).message, /did not respond in time/);
  assert.ok(Date.now() - started < 2000, "a per-call timeout overrides the client default");
});
test("webhook: without a configured webhook secret every delivery is refused (503)", async () => {
  const cfg = { ...parsed().config, webhookSecret: null };
  const ctx = setup({ config: cfg });
  assert.equal((await ctx.service.handleWebhook(ctx.hook({ type: "payment.succeeded" }, "anything"))).status, 503);
});

// ================================================================== source-level guarantees
const src = (p) => readFile(new URL(p, import.meta.url), "utf8");
async function files(dir, ext, out = []) { for (const e of await readdir(new URL(dir, import.meta.url), { withFileTypes: true })) { const p = `${dir}${e.name}`; if (e.isDirectory()) await files(`${p}/`, ext, out); else if (ext.some((x) => p.endsWith(x))) out.push(p); } return out; }
test("secrets never reach the browser: no Safepay secret names or VITE_ Safepay variables anywhere in the client", async () => {
  for (const f of await files("../../client/src/", [".js", ".jsx"])) {
    const c = await src(f);
    assert.ok(!/SAFEPAY_SECRET|SAFEPAY_WEBHOOK|X-SFPY-MERCHANT-SECRET|VITE_SAFEPAY|webhookSecret|secretKey/i.test(c), f);
  }
  for (const f of ["../../client/.env.example", "../../client/vite.config.js"]) { try { assert.ok(!/SAFEPAY/i.test(await src(f)), f); } catch (e) { if (e.code !== "ENOENT") throw e; } }
});
test("checkout availability: a FAILED availability check never disables Pay; only the server saying 'disabled' does; clicks are guarded by a ref", async () => {
  const c = await src("../../client/src/pages/Checkout.jsx");
  assert.ok(!/setPayCfg\(\{\s*enabled:\s*false/.test(c), "a failed check must not be treated as 'disabled'");
  assert.match(c, /status: "error"/);
  assert.match(c, /const payOff = payCfg\.status === "ready" && !payCfg\.enabled/);
  assert.match(c, /const canPay = !payOff &&/);
  assert.match(c, /window\.addEventListener\("focus", loadPayCfg\)/);
  assert.match(c, /inFlight\.current/);
  assert.match(c, /Check again/);
  const pkg = JSON.parse(await src("../package.json"));
  assert.equal(pkg.scripts["check:safepay"], "node src/scripts/checkSafepay.js");
  assert.equal(pkg.scripts["check:safepay:live"], "node src/scripts/checkSafepay.js --live");
});
test("the webhook route is mounted BEFORE express.json (raw body preserved) and uses express.raw", async () => {
  const app = await src("../src/app.js");
  assert.ok(app.indexOf('app.use("/api/webhooks"') > 0 && app.indexOf('app.use("/api/webhooks"') < app.indexOf("express.json({"), "webhook must be mounted before the JSON parser");
  assert.ok(app.indexOf('app.use("/api/webhooks"') < app.indexOf("rateLimit({ windowMs: 60_000, limit: 300"));
  assert.match(await src("../src/routes/paymentRoutes.js"), /express\.raw\(/);
  assert.match(await src("../src/routes/paymentRoutes.js"), /checkout\.post\("\/pay", limiter\(.*validate\(\{ body: payBody \}\)/);
});
test(".env.example documents the four variables with EMPTY values (no real-looking credentials) and sandbox", async () => {
  const env = await src("../.env.example");
  assert.match(env, /^SAFEPAY_ENV=sandbox$/m);
  for (const k of ["SAFEPAY_PUBLIC_KEY", "SAFEPAY_SECRET_KEY", "SAFEPAY_WEBHOOK_SECRET"]) assert.match(env, new RegExp(`^${k}=$`, "m"));
  assert.ok(!/sec_[0-9a-f]{8}-/.test(env));
  assert.match(env, /^PUBLIC_SITE_URL=|^# PUBLIC_SITE_URL=/m);
});
test("Safepay is the ONLY payment method: no COD and no other gateway anywhere in the payment code or checkout page", async () => {
  const names = ["../src/lib/safepayConfig.js", "../src/lib/safepayClient.js", "../src/lib/safepaySignature.js", "../src/lib/paymentRules.js", "../src/lib/paymentService.js", "../src/lib/paymentRepo.js", "../src/lib/checkoutInput.js",
    "../src/controllers/paymentController.js", "../src/routes/paymentRoutes.js", "../src/models/Payment.js", "../../client/src/pages/Checkout.jsx", "../../client/src/pages/OrderStatus.jsx", "../../client/src/services/payments.js"];
  for (const f of names) {
    const code = (await src(f)).replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    assert.ok(!/easypaisa|jazzcash|payoneer|stripe|paypal|cash on delivery|\bcod\b|2checkout|razorpay/i.test(code), f);
  }
  const m = await src("../src/models/Payment.js");
  assert.match(m, /provider: \{ type: String, default: "safepay" \}/);
});
test("nothing outside the payment service can mark an order paid (and no controller or admin route does)", async () => {
  for (const f of await files("../src/", [".js"])) {
    if (f.endsWith("paymentService.js") || f.endsWith("paymentRepo.js") || f.endsWith("models/Order.js") || f.endsWith("seed/seed.js")) continue;
    const c = (await src(f)).replace(/\/\/.*$/gm, "");
    assert.ok(!/payment\.status["']?\s*[:=]\s*["']paid["']|"payment\.status":\s*"paid"|setOrderPaymentStatus\([^)]*"paid"/.test(c.replace(/\$match[^}]*\}/g, "")), `${f} must not set an order to paid`);
  }
  const svc = await src("../src/lib/paymentService.js");
  assert.equal((svc.match(/markOrderPaid\(/g) || []).length, 1, "exactly one call site can mark an order paid");
});
