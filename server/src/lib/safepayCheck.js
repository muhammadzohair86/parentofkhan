// Step-by-step diagnosis of the Safepay SANDBOX setup, used by `npm run check:safepay`. It prints what it found and where it stopped, and
// NEVER prints a credential value (only "set" / "NOT set", HTTP status codes and Safepay's own short error text, with secrets redacted).
// With live = true it also makes the same three calls checkout makes (create session, auth token, read session) against the sandbox.
import { parseSafepayConfig } from "./safepayConfig.js";
import { createSafepayClient, SafepayError } from "./safepayClient.js";

export async function runSafepayCheck({ env, cwd = "", envFileFound = null, live = false, fetchImpl = globalThis.fetch }) {
  const lines = []; let ok = true;
  const say = (t) => lines.push(t);
  say(`Working directory: ${cwd || "(unknown)"}`);
  if (envFileFound !== null) say(`.env file in this directory: ${envFileFound ? "found" : "NOT FOUND (the API must be started from the server folder, where server/.env lives)"}`);
  for (const k of ["SAFEPAY_ENV", "SAFEPAY_PUBLIC_KEY", "SAFEPAY_SECRET_KEY", "SAFEPAY_WEBHOOK_SECRET"]) {
    const v = String(env[k] ?? "").trim();
    say(`  ${k}: ${v ? (k === "SAFEPAY_ENV" ? `set (${v})` : "set") : "NOT set"}`);
  }
  const parsed = parseSafepayConfig(env);
  say(`Configuration: ${parsed.status.toUpperCase()}`);
  for (const p of parsed.problems) say(`  problem: ${p}`);
  for (const w of parsed.warnings) say(`  warning: ${w}`);
  if (parsed.status !== "enabled") { say("Payments are OFF until the problem(s) above are fixed. After editing server/.env, restart the API."); return { ok: false, lines }; }
  if (!live) { say("Configuration looks valid. Run with --live (npm run check:safepay:live) to also test the connection to Safepay's sandbox."); return { ok: true, lines }; }

  const c = parsed.config;
  const redact = (t) => [c.secretKey, c.webhookSecret, c.publicKey].filter(Boolean).reduce((x, v) => x.split(v).join("[redacted]"), String(t ?? ""));
  const client = createSafepayClient(c, { fetchImpl });
  const step = async (label, fn) => {
    try { const r = await fn(); say(`  OK   ${label}${r ? `: ${r}` : ""}`); return true; }
    catch (e) {
      ok = false;
      if (e instanceof SafepayError) say(`  FAIL ${label}: ${e.kind}${e.status ? `, HTTP ${e.status}` : ""}${e.providerMessage ? `, "${redact(e.providerMessage)}"` : ""}${e.status === 401 || e.status === 403 ? "  -> Safepay rejected the credentials: check SAFEPAY_SECRET_KEY / SAFEPAY_PUBLIC_KEY are the SANDBOX ones" : ""}`);
      else say(`  FAIL ${label}: ${redact(e?.message)}`);
      return false;
    }
  };
  say(`Live sandbox test (${c.apiBase}):`);
  let tracker;
  if (!(await step("create payment session (US$10.00, unpaid test session)", async () => { tracker = (await client.createTracker({ amountMinor: 1000, currency: "USD", orderNumber: `POK-CHECK-${Date.now().toString(36).toUpperCase()}` })).token; return "tracker created"; }))) return { ok, lines };
  let tbt;
  if (!(await step("create authentication token", async () => { tbt = await client.createAuthToken(); return "received"; }))) return { ok, lines };
  await step("build hosted checkout URL", async () => { const u = new URL(client.buildCheckoutUrl({ tracker, tbt, redirectUrl: "https://example.com/r", cancelUrl: "https://example.com/c" })); return `${u.origin}${u.pathname}`; });
  await step("read the session back", async () => { const t = await client.fetchTracker(tracker); return `state ${t.state}, amount ${t.amountMinor} ${t.currency}`; });
  say(ok ? "All sandbox calls succeeded. (The test session stays unpaid and expires on its own.)" : "One or more sandbox calls failed: see above.");
  return { ok, lines };
}
