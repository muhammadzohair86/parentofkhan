// Safepay configuration. Pure (reads only the object you pass in), so it is unit-tested and never touches the network.
//
// Three DIFFERENT credentials exist and are not interchangeable (Safepay docs, "Find your API keys"):
//   SAFEPAY_PUBLIC_KEY     Public API Key, starts with "sec_" (identifies the account; sent in the payment-session request)
//   SAFEPAY_SECRET_KEY     Private API Secret Key (authenticates our server's API calls: header X-SFPY-MERCHANT-SECRET)
//   SAFEPAY_WEBHOOK_SECRET Webhook "shared secret" from Developers > Endpoints > View shared secret (verifies webhook signatures)
// Sandbox and Production each have their OWN set of all three. This build supports SANDBOX ONLY.
export const SAFEPAY_ENVIRONMENTS = Object.freeze({
  sandbox: Object.freeze({
    apiBase: "https://sandbox.api.getsafepay.com",
    checkoutBase: "https://sandbox.api.getsafepay.com/embedded",
  }),
  // production: deliberately absent. Live payments are not enabled in this phase and are never switched on automatically.
});
export const SAFEPAY_CURRENCIES = Object.freeze(["PKR", "USD", "GBP", "EUR", "CAD", "AED", "SAR"]); // Safepay docs, "Money"

const PLACEHOLDER = /^(your[_-]|<|changeme|change[_-]me|xxx|todo|example|sec_x+$)/i;
const present = (v) => typeof v === "string" && v.trim() !== "" && !PLACEHOLDER.test(v.trim());

// -> { status: "enabled" | "disabled" | "invalid", reason, problems: string[], warnings: string[], config: {...} | null }
//   disabled = no credentials reached this process (the shop works, the Pay button is unavailable)
//   invalid  = a REQUIRED setting is wrong (production requested, public/secret key missing or malformed); payments stay OFF
// Only the Public key and Secret key are required to START a payment. A bad or missing webhook secret never switches payments off: it
// only disables webhook processing (payments are still confirmed by the return-page check) and is reported as a warning.
// Every message names variables only, never a value.
export function parseSafepayConfig(env = {}) {
  const get = (k) => String(env[k] ?? "").trim();
  const problems = [], warnings = [];
  const requested = (get("SAFEPAY_ENV") || "sandbox").toLowerCase();
  if (requested !== "sandbox") {
    problems.push(`SAFEPAY_ENV is "${requested}" but only "sandbox" is supported in this build. Live payments are intentionally not enabled.`);
  }
  const publicKey = get("SAFEPAY_PUBLIC_KEY"), secretKey = get("SAFEPAY_SECRET_KEY"), webhookSecret = get("SAFEPAY_WEBHOOK_SECRET");
  const anySet = [publicKey, secretKey, webhookSecret].some(present);

  if (!anySet && problems.length === 0) {
    return { status: "disabled", reason: "not_configured", warnings,
      problems: ["None of SAFEPAY_PUBLIC_KEY, SAFEPAY_SECRET_KEY or SAFEPAY_WEBHOOK_SECRET reached the API process. If you just added them to server/.env, RESTART the API (npm run dev does not reload .env), and check the file is server/.env and the API was started from the server folder."], config: null };
  }

  if (!present(publicKey)) problems.push("SAFEPAY_PUBLIC_KEY is missing or still a placeholder.");
  else if (!/^sec_[\w-]{8,}$/.test(publicKey)) problems.push('SAFEPAY_PUBLIC_KEY is not a valid public key (it should start with "sec_"). Did you paste the secret key here?');
  if (!present(secretKey)) problems.push("SAFEPAY_SECRET_KEY is missing or still a placeholder.");
  else if (/\s/.test(secretKey) || secretKey.length < 16) problems.push("SAFEPAY_SECRET_KEY does not look like a valid secret key.");
  else if (secretKey === publicKey) problems.push("SAFEPAY_SECRET_KEY must not be the same value as SAFEPAY_PUBLIC_KEY.");

  let hook = null;
  if (present(webhookSecret)) {
    if (/\s/.test(webhookSecret) || webhookSecret.length < 8) warnings.push("SAFEPAY_WEBHOOK_SECRET does not look like a valid webhook shared secret, so webhooks are disabled until it is fixed. Payments still work.");
    else if (webhookSecret === secretKey) warnings.push("SAFEPAY_WEBHOOK_SECRET is the same value as SAFEPAY_SECRET_KEY. It must be the shared secret from Developers > Endpoints, so webhooks are disabled until it is fixed. Payments still work.");
    else hook = webhookSecret;
  } else {
    warnings.push("SAFEPAY_WEBHOOK_SECRET is not set: webhooks will be rejected. Payments are then only confirmed by the return-page check.");
  }
  if (problems.length) return { status: "invalid", reason: "invalid_configuration", problems, warnings, config: null };

  const env0 = SAFEPAY_ENVIRONMENTS.sandbox;
  return {
    status: "enabled", reason: "ready", problems: [], warnings,
    config: { environment: "sandbox", apiBase: env0.apiBase, checkoutBase: env0.checkoutBase, publicKey, secretKey, webhookSecret: hook },
  };
}

// What the browser is allowed to know. NEVER includes any key or secret.
// `reason` is a plain code. In development only (diagnostics = true) it also carries the configuration problems (variable NAMES, no values)
// so the checkout page can say exactly what to fix; in production the browser only ever sees the generic "unavailable".
export function publicPaymentInfo(parsed, { diagnostics = false } = {}) {
  const enabled = parsed?.status === "enabled";
  const info = {
    enabled,
    provider: "safepay",
    environment: "sandbox",
    testMode: true, // this build only talks to the Safepay sandbox: no real money moves
    reason: enabled ? "ready" : parsed?.status === "invalid" ? "invalid_configuration" : "not_configured",
  };
  if (diagnostics && !enabled) info.diagnostics = [...(parsed?.problems ?? [])];
  return info;
}
