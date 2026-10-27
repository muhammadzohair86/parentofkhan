// Minimal Safepay API client built on Node's global fetch (no dependency). Endpoints and schemas follow Safepay's current
// "Express Checkout" guide, "Fetch Tracker" and "Money" pages:
//   POST {api}/order/payments/v3/          create a payment session (tracker). amount is in MINOR units (cents for USD)
//   POST {api}/client/passport/v1/token    create a short-lived authentication token (valid ~1 hour)
//   GET  {api}/reporter/api/v1/payments/{tracker}   read the tracker's real state (TRACKER_ENDED = paid)
//   hosted checkout page at {checkoutBase}/?environment=&tracker=&tbt=&source=hosted&redirect_url=&cancel_url=
// Server-side requests authenticate with the header  X-SFPY-MERCHANT-SECRET: <secret key>.
// Nothing here ever puts the secret in a URL, a log line or an error message.
import { SAFEPAY_CURRENCIES } from "./safepayConfig.js";

export class SafepayError extends Error {
  // kind: "network" (could not reach / timed out), "api" (non-2xx), "invalid_response" (2xx but not what the docs promise), "bad_request" (our own input)
  constructor(kind, message, { status = null, providerMessage = "" } = {}) {
    super(message);
    this.name = "SafepayError";
    this.kind = kind;
    this.status = status;
    this.providerMessage = providerMessage; // short, for server logs only; never sent to customers
    this.retryable = kind === "network" || (kind === "api" && (status >= 500 || status === 429)) || kind === "invalid_response";
  }
}

const TRACKER = /^track_[A-Za-z0-9-]{8,64}$/;
export const isTrackerToken = (t) => typeof t === "string" && TRACKER.test(t);

export function createSafepayClient(config, { fetchImpl = globalThis.fetch, timeoutMs = 10_000 } = {}) {
  if (!config?.secretKey || !config?.publicKey) throw new Error("Safepay client needs a validated config.");

  async function call(method, path, body, limitMs = timeoutMs) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), limitMs);
    let res;
    try {
      res = await fetchImpl(`${config.apiBase}${path}`, {
        method, signal: ctl.signal,
        headers: { "Content-Type": "application/json", Accept: "application/json", "X-SFPY-MERCHANT-SECRET": config.secretKey },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (e) {
      throw new SafepayError("network", e?.name === "AbortError" ? "Safepay did not respond in time." : "Could not reach Safepay.");
    } finally { clearTimeout(timer); }

    let json = null;
    try { json = await res.json(); } catch { /* handled below */ }
    if (!res.ok) {
      const pm = String(json?.status?.message ?? json?.message ?? "").slice(0, 160);
      throw new SafepayError("api", `Safepay responded with HTTP ${res.status}.`, { status: res.status, providerMessage: pm });
    }
    if (json === null || typeof json !== "object") throw new SafepayError("invalid_response", "Safepay returned an unreadable response.", { status: res.status });
    return json;
  }

  return {
    environment: config.environment,

    // -> { token }  (the tracker token, e.g. "track_...")
    async createTracker({ amountMinor, currency, orderNumber }) {
      if (!Number.isInteger(amountMinor) || amountMinor <= 0) throw new SafepayError("bad_request", "Payment amount must be a positive whole number of minor units.");
      if (!SAFEPAY_CURRENCIES.includes(currency)) throw new SafepayError("bad_request", `Currency ${currency} is not supported by Safepay.`);
      if (typeof orderNumber !== "string" || !orderNumber) throw new SafepayError("bad_request", "An order reference is required.");
      const json = await call("POST", "/order/payments/v3/", {
        merchant_api_key: config.publicKey, intent: "CYBERSOURCE", mode: "payment", entry_mode: "raw",
        currency, amount: amountMinor, include_fees: false,
        metadata: { order_id: orderNumber, source: "parents-of-khan" },
      });
      const token = json?.data?.tracker?.token;
      if (!isTrackerToken(token)) throw new SafepayError("invalid_response", "Safepay did not return a payment session token.");
      return { token };
    },

    // -> string (the "tbt" authentication token). Short-lived: do not store it.
    async createAuthToken() {
      const json = await call("POST", "/client/passport/v1/token", {});
      const tbt = json?.data;
      if (typeof tbt !== "string" || tbt.length < 8) throw new SafepayError("invalid_response", "Safepay did not return an authentication token.");
      return tbt;
    },

    buildCheckoutUrl({ tracker, tbt, redirectUrl, cancelUrl }) {
      if (!isTrackerToken(tracker)) throw new SafepayError("bad_request", "Invalid tracker.");
      const u = new URL(`${config.checkoutBase}/`);
      u.searchParams.set("environment", config.environment);
      u.searchParams.set("tracker", tracker);
      u.searchParams.set("tbt", tbt);
      u.searchParams.set("source", "hosted");
      u.searchParams.set("redirect_url", redirectUrl);
      u.searchParams.set("cancel_url", cancelUrl);
      return u.toString();
    },

    // -> { token, state, amountMinor, currency }  The tracker's REAL state straight from Safepay.
    // The docs show two shapes for this response (data.tracker.* and data.*); both are accepted.
    async fetchTracker(token, { timeoutMs: limitMs } = {}) {
      if (!isTrackerToken(token)) throw new SafepayError("bad_request", "Invalid tracker.");
      const json = await call("GET", `/reporter/api/v1/payments/${encodeURIComponent(token)}`, undefined, limitMs);
      const d = json?.data;
      const t = d && typeof d === "object" ? (d.tracker && typeof d.tracker === "object" ? d.tracker : d) : null;
      if (!t || typeof t.state !== "string" || !t.state) throw new SafepayError("invalid_response", "Safepay returned an unexpected payment record.");
      if (t.token !== undefined && t.token !== token) throw new SafepayError("invalid_response", "Safepay returned a different payment record than requested.");
      const q = t.purchase_totals?.quote_amount; // the amount in the currency we asked to charge
      return {
        token, state: t.state,
        amountMinor: Number.isInteger(q?.amount) ? q.amount : null,
        currency: typeof q?.currency === "string" ? q.currency.toUpperCase() : null,
      };
    },
  };
}
