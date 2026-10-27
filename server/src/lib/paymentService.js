// Payment orchestration: order creation, Safepay session creation, verification, retries and webhooks.
// No database or HTTP code lives here: it receives a `repo` (persistence) and a `safepay` client, so every branch is unit-tested
// with fakes. The ONLY thing that can mark an order paid is `settle()`, and it requires Safepay itself (fetched server-side) to say
// the tracker is ended for exactly the amount and currency we saved. A redirect, a query string or a webhook payload alone never can.
import crypto from "node:crypto";
import { ApiError } from "../utils/ApiError.js";
import { buildOrderPricing } from "./checkoutQuote.js";
import { evaluateTracker, checkWebhookClaims, customerPaymentStatus, toMinor } from "./paymentRules.js";
import { countryName } from "./countries.js";
import { SafepayError, isTrackerToken } from "./safepayClient.js";
import { verifyWebhookSignature } from "./safepaySignature.js";
import { isOrderNumber } from "./checkoutInput.js";
import { customerOrderView } from "./orderView.js";

export const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");
const WEBHOOK_PROVIDER_TIMEOUT_MS = 5_000; // Safepay wants an acknowledgement within 10 s or it queues ALL events for retry
const LEASE_MS = 30_000;            // one payment-session setup per order at a time
const SESSION_TTL_MS = 50 * 60_000; // Safepay's authentication token (and so the hosted page) lasts about an hour
const RECHECK_MS = 2_000;           // never ask Safepay about the same payment more than once per 2 seconds
const MAX_ATTEMPTS = 10;
const ORDER_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I/L

export const newOrderNumber = (date = new Date()) => {
  const d = date.toISOString().slice(2, 10).replace(/-/g, ""); // YYMMDD
  let r = ""; for (let i = 0; i < 6; i++) r += ORDER_ALPHABET[crypto.randomInt(ORDER_ALPHABET.length)];
  return `POK-${d}-${r}`;
};

// Same cart + destination + customer + address => same fingerprint (the amounts the browser claims are deliberately excluded).
export const fingerprintOf = (input) => sha256(JSON.stringify({
  items: [...input.items].map((i) => [i.productId, i.color.toLowerCase(), i.size.toLowerCase(), i.quantity]).sort(),
  country: input.country, customer: input.customer, address: input.address,
}));

const tokenMatches = (token, hash) => {
  const a = Buffer.from(sha256(token)), b = Buffer.from(String(hash || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

// `diagnostics` (development only): add a short, secret-free reason (HTTP status / error kind) to provider errors so you can see WHAT failed.
export function createPaymentService({ repo, safepay, config, priceCart, publicSiteUrl, now = () => new Date(), log = () => {}, diagnostics = false }) {
  const enabled = !!(safepay && config);
  const assertEnabled = () => {
    if (!enabled) throw new ApiError(503, "PAYMENTS_UNAVAILABLE", "Online payment isn't available right now. Please try again later.");
  };
  // Provider problems become one generic message; the detail (HTTP status, kind) goes to the server log only. Never a secret.
  const redact = (text) => { // belt and braces: no credential value can ever leave through a message
    let out = String(text ?? "");
    for (const v of [config?.secretKey, config?.webhookSecret, config?.publicKey]) if (v) out = out.split(v).join("[redacted]");
    return out;
  };
  const providerError = (e, where) => {
    if (e instanceof ApiError) return e;
    if (e instanceof SafepayError) {
      const detail = redact(`Safepay ${e.kind}${e.status ? ` HTTP ${e.status}` : ""}${e.providerMessage ? `: ${e.providerMessage}` : ""} (during ${where})`);
      log("safepay_error", { where, kind: e.kind, status: e.status, providerMessage: redact(e.providerMessage) });
      const details = diagnostics ? [{ path: "provider", message: detail }] : undefined;
      return e.kind === "bad_request"
        ? new ApiError(500, "PAYMENT_SETUP_ERROR", "We couldn't start the payment. Please contact us.", details)
        : new ApiError(502, "PAYMENT_PROVIDER_ERROR", "We couldn't reach the payment provider. Please try again in a moment.", details);
    }
    return e;
  };

  // ---- the single place an order can become paid ----
  async function applyOutcome(order, payment, ev) {
    const stamp = now();
    const common = { lastCheckedAt: stamp };
    switch (ev.outcome) {
      case "paid": {
        const r = await repo.markOrderPaid(order.id, { tracker: payment.tracker, paidAt: stamp });
        if (r.applied || r.reference === payment.tracker) await repo.updatePayment(payment.id, { ...common, status: "paid", paidAt: stamp, reason: "verified" }, { unlessStatus: ["paid"] });
        else await repo.updatePayment(payment.id, { ...common, status: "review", reason: "duplicate_payment" }, { unlessStatus: ["paid"] }); // charged twice: needs a manual refund
        break;
      }
      // "failed" is kept while Safepay still shows the tracker open: the customer is told the attempt failed and may retry on the same session.
      case "pending": await repo.updatePayment(payment.id, { ...common, status: "pending" }, { unlessStatus: ["paid", "review", "failed"] }); break;
      case "cancelled": await repo.updatePayment(payment.id, { ...common, status: "cancelled", reason: ev.reason }, { unlessStatus: ["paid", "review"] }); break;
      case "expired": await repo.updatePayment(payment.id, { ...common, status: "expired", reason: ev.reason }, { unlessStatus: ["paid", "review"] }); break;
      case "refunded":
        if (order.paymentStatus === "paid" && order.paymentReference === payment.tracker) {
          await repo.setOrderPaymentStatus(order.id, "refunded", { from: ["paid"] });
          await repo.updatePayment(payment.id, { ...common, status: "refunded", reason: ev.reason }, {});
        } else await repo.updatePayment(payment.id, { ...common, status: "review", reason: "unexpected_refund_state" }, { unlessStatus: ["paid", "review"] });
        break;
      default: // "mismatch" | "attention": never paid; a person must look
        await repo.updatePayment(payment.id, { ...common, status: "review", reason: ev.reason }, { unlessStatus: ["paid", "review"] });
        log("payment_flagged", { order: order.orderNumber, reason: ev.reason });
    }
  }
  async function settle(order, payment, tracker) {
    const ev = evaluateTracker(tracker, { amountMinor: order.paymentAmountMinor, currency: order.paymentCurrency });
    await applyOutcome(order, payment, ev);
    return ev;
  }

  // Two kinds of private link token open an order: the checkout token (random per checkout, hash stored on the order) or an expiring
  // access token issued by a successful guest lookup. A wrong token and an unknown order look exactly the same.
  async function authorize(orderNumber, token) {
    const order = isOrderNumber(orderNumber) ? await repo.findOrderByNumber(orderNumber) : null;
    if (order && (tokenMatches(token, order.tokenHash) || (await repo.hasAccess(order.id, sha256(token), now())))) return order;
    throw new ApiError(404, "ORDER_NOT_FOUND", "We couldn't find that order.");
  }
  // A signed-in customer may only open their OWN orders (matched by the account that placed the order, never by e-mail address).
  async function authorizeUser(orderNumber, userId) {
    const order = isOrderNumber(orderNumber) && userId ? await repo.findOrderByNumber(orderNumber) : null;
    if (order && order.userId && String(order.userId) === String(userId)) return order;
    throw new ApiError(404, "ORDER_NOT_FOUND", "We couldn't find that order.");
  }

  // ---- hosted-checkout session (create, or safely reuse the live one) ----
  async function ensureSession(order, returnPath) {
    if (order.paymentStatus === "paid") return { paid: true };
    if (!(await repo.acquireLease(order.id, new Date(now().getTime() + LEASE_MS), now()))) {
      throw new ApiError(409, "PAYMENT_IN_PROGRESS", "Your payment is already being set up. Please wait a moment and try again.");
    }
    try {
      const attempts = await repo.listPayments(order.id); // newest first
      if (attempts.some((a) => a.status === "review")) throw new ApiError(409, "PAYMENT_UNDER_REVIEW", "This payment needs a manual check before it can continue. Please contact us.");
      let payment = null;
      const latest = attempts[0];
      if (latest && ["created", "pending", "failed"].includes(latest.status)) {
        // Always ask Safepay first: the customer may already have paid, or the old session may be dead.
        const ev = await settle(order, latest, await safepay.fetchTracker(latest.tracker));
        if (ev.outcome === "paid") return { paid: true };
        if (["mismatch", "attention", "refunded"].includes(ev.outcome)) throw new ApiError(409, "PAYMENT_UNDER_REVIEW", "This payment needs a manual check before it can continue. Please contact us.");
        if (ev.outcome === "pending" && now().getTime() - new Date(latest.createdAt).getTime() < SESSION_TTL_MS) payment = latest; // reuse: no second tracker, no second charge
      }
      if (!payment) {
        if (attempts.length >= MAX_ATTEMPTS) throw new ApiError(429, "TOO_MANY_ATTEMPTS", "There have been too many payment attempts for this order. Please contact us.");
        // The amount is the one saved on the order when it was created: a retry can never change it.
        const tr = await safepay.createTracker({ amountMinor: order.paymentAmountMinor, currency: order.paymentCurrency, orderNumber: order.orderNumber });
        payment = await repo.createPayment({ orderId: order.id, orderNumber: order.orderNumber, tracker: tr.token, amountMinor: order.paymentAmountMinor, currency: order.paymentCurrency, environment: safepay.environment, status: "created", attempt: attempts.length + 1, createdAt: now() });
      }
      const tbt = await safepay.createAuthToken(); // short-lived; deliberately never stored
      const base = `${publicSiteUrl}${returnPath}`; // where Safepay sends the customer back (the order's private page)
      const redirectUrl = safepay.buildCheckoutUrl({ tracker: payment.tracker, tbt, redirectUrl: base, cancelUrl: `${base}?cancelled=1` });
      await repo.updatePayment(payment.id, { status: "pending", redirectedAt: now() }, { unlessStatus: ["paid", "review"] });
      await repo.setOrderPaymentStatus(order.id, "unpaid", { from: ["failed", "unpaid"] });
      return { redirectUrl };
    } catch (e) { throw providerError(e, "ensureSession"); }
    finally { await repo.releaseLease(order.id); }
  }

  const sessionResponse = async (order, returnPath) => {
    const s = await ensureSession(order, returnPath);
    return s.paid
      ? { status: "paid", orderNumber: order.orderNumber }
      : { status: "redirect", orderNumber: order.orderNumber, redirectUrl: s.redirectUrl, amountMinor: order.paymentAmountMinor, currency: order.paymentCurrency };
  };

  // `order` (domain, for payment decisions) + `doc` (full record, only ever passed through customerOrderView's allowlist).
  const publicView = (order, doc, latest, extra = {}) => {
    const status = customerPaymentStatus(order, latest);
    return {
      orderNumber: order.orderNumber, status, total: order.total, currency: order.paymentCurrency,
      canRetry: ["failed", "cancelled", "expired", "unpaid"].includes(status),
      testMode: order.paymentEnvironment === "sandbox", ...extra,
      order: doc ? customerOrderView(doc, latest) : null, // the customer-safe order: items, totals, shipment, timeline (see orderView.js)
    };
  };

  // What really happened to this order's payment (asks Safepay about an open session), plus the customer-safe order. Used for both link-token and signed-in access.
  async function statusFor(order0) {
    let order = order0;
    let latest = (await repo.listPayments(order.id))[0];
    let delayed = false;
    if (order.paymentStatus !== "paid" && latest && ["created", "pending", "failed"].includes(latest.status)) {
      const recent = latest.lastCheckedAt && now().getTime() - new Date(latest.lastCheckedAt).getTime() < RECHECK_MS;
      if (!recent) {
        try {
          if (!safepay) throw new SafepayError("network", "Payments are not configured.");
          await settle(order, latest, await safepay.fetchTracker(latest.tracker));
        } catch (e) {
          if (!(e instanceof SafepayError)) throw e;
          log("safepay_error", { where: "getStatus", kind: e.kind, status: e.status });
          delayed = true; // couldn't confirm just now: say so, never guess
        }
        order = await repo.findOrderByNumber(order0.orderNumber);
        latest = (await repo.listPayments(order.id))[0];
      }
    }
    return publicView(order, await repo.findOrderDocById(order.id), latest, { verificationDelayed: delayed });
  }

  return {
    enabled,

    // POST /api/checkout/pay
    async startCheckout(input, { userId = null } = {}) {
      assertEnabled();
      const tokenHash = sha256(input.clientRequestId);
      const fingerprint = fingerprintOf(input);
      let order = await repo.findOrderByTokenHash(tokenHash);
      if (!order) {
        // The server prices EVERYTHING itself. Amounts the browser claims are only compared (priceCart rejects a difference).
        const quote = await priceCart({ items: input.items, destination: { country: input.country, city: input.address.city }, submitted: input.submitted });
        const pricing = buildOrderPricing(quote); // throws if no single-currency total can be computed: nothing is created
        const amountMinor = toMinor(pricing.total);
        if (!(amountMinor > 0)) throw new ApiError(422, "NOTHING_TO_PAY", "There is nothing to pay for this order.");
        for (let tries = 0; tries < 5 && !order; tries++) {
          try {
            order = await repo.createOrder({
              orderNumber: newOrderNumber(now()), tokenHash, fingerprint, userId,
              customer: input.customer,
              shippingAddress: { ...input.address, country: countryName(input.country) },
              items: quote.items.map((i) => ({ product: i.productId, slug: i.slug, name: i.name, color: i.color, size: i.size, sku: i.sku || "", image: i.image || null, unitPrice: i.unitPrice, quantity: i.quantity })),
              subtotal: pricing.subtotal, shipping: pricing.shipping, shippingDetails: pricing.shippingDetails, discount: 0, total: pricing.total, currency: pricing.currency,
              payment: { method: "safepay", provider: "safepay", environment: safepay.environment, status: "unpaid", reference: "", amountMinor, currency: pricing.currency },
            });
          } catch (e) {
            if (e?.code !== "DUPLICATE_KEY") throw e;
            if (e.field === "checkoutTokenHash") { order = await repo.findOrderByTokenHash(tokenHash); break; } // a parallel identical request won the race
            // else the random order number collided: try another
          }
        }
        if (!order) throw new ApiError(500, "ORDER_CREATE_FAILED", "We couldn't create your order. Please try again.");
      }
      if (order.fingerprint !== fingerprint) throw new ApiError(409, "CHECKOUT_CHANGED", "Your order details changed after payment was started. Please review your order and press Pay again.");
      return sessionResponse(order, `/order/${order.orderNumber}/${input.clientRequestId}`);
    },

    // POST /api/orders/:orderNumber/payment-status : what really happened, checked with Safepay (never from the URL)
    async getStatus({ orderNumber, token }) { return statusFor(await authorize(orderNumber, token)); },
    // Signed-in customer opening one of THEIR orders.
    async getStatusForUser({ orderNumber, userId }) { return statusFor(await authorizeUser(orderNumber, userId)); },

    // POST /api/orders/:orderNumber/retry-payment : same order, same saved amount; reuses the live session or makes a new one
    async retryPayment({ orderNumber, token }) {
      assertEnabled();
      const order = await authorize(orderNumber, token);
      return sessionResponse(order, `/order/${order.orderNumber}/${token}`);
    },
    async retryPaymentForUser({ orderNumber, userId }) {
      assertEnabled();
      const order = await authorizeUser(orderNumber, userId);
      return sessionResponse(order, `/account/orders/${order.orderNumber}`);
    },

    // POST /api/webhooks/safepay (raw body). Returns { status, body } for the controller to send.
    async handleWebhook({ rawBody, signature }) {
      if (!enabled || !config.webhookSecret) return { status: 503, body: { success: false, code: "WEBHOOKS_NOT_CONFIGURED" } };
      if (!verifyWebhookSignature(rawBody, signature, config.webhookSecret)) {
        log("webhook_rejected", { reason: "invalid_signature" });
        return { status: 401, body: { success: false, code: "INVALID_SIGNATURE" } }; // not acknowledged, as Safepay recommends
      }
      let event;
      try { event = JSON.parse(rawBody.toString("utf8")); } catch { return { status: 400, body: { success: false, code: "INVALID_JSON" } }; }
      if (!event || typeof event !== "object" || typeof event.type !== "string") return { status: 400, body: { success: false, code: "INVALID_EVENT" } };

      const tracker = event.data?.tracker;
      if (!["payment.succeeded", "payment.failed", "payment.refunded"].includes(event.type) || !isTrackerToken(tracker)) {
        return { status: 200, body: { success: true, ignored: true } }; // other event types (we only act on payment events); acknowledge so they aren't retried
      }
      const eventToken = typeof event.token === "string" && event.token ? event.token : `${event.type}:${tracker}:${event.created_at?.seconds ?? ""}`;
      const rec = await repo.recordEvent({ token: eventToken, type: event.type, tracker });
      if (!rec.inserted && rec.processed) return { status: 200, body: { success: true, duplicate: true } }; // repeated delivery: nothing to do

      const done = async (body) => { await repo.markEventProcessed(eventToken, body.outcome || "ok"); return { status: 200, body: { success: true, ...body } }; };
      const payment = await repo.findPaymentByTracker(tracker);
      if (!payment) return done({ outcome: "unknown_tracker" }); // not ours (or not recorded): acknowledged, never acted on
      const order = await repo.findOrderById(payment.orderId);
      if (!order) return done({ outcome: "unknown_order" });

      const claims = checkWebhookClaims(event, order, { publicKey: config.publicKey });
      if (!claims.ok) {
        await repo.updatePayment(payment.id, { status: "review", reason: claims.reason, lastCheckedAt: now() }, { unlessStatus: ["paid", "review"] });
        log("payment_flagged", { order: order.orderNumber, reason: claims.reason });
        return done({ outcome: "flagged" }); // acknowledged (a retry can't fix it) but NOT paid
      }

      try {
        if (event.type === "payment.failed") {
          const d = event.data || {};
          const failure = { category: /^[A-Z_]{1,40}$/.test(d.category || "") ? d.category : "", code: Number.isInteger(d.code) ? d.code : null }; // no free text, no card details
          await repo.updatePayment(payment.id, { status: "failed", failure }, { unlessStatus: ["paid", "review", "cancelled", "expired"] }); // (not a Safepay check, so lastCheckedAt is left alone)
          await repo.setOrderPaymentStatus(order.id, "failed", { from: ["unpaid"] });
          return done({ outcome: "failed" });
        }
        // payment.succeeded / payment.refunded: the payload is only a nudge. Ask Safepay for the real state.
        const ev = await settle(order, payment, await safepay.fetchTracker(tracker, { timeoutMs: WEBHOOK_PROVIDER_TIMEOUT_MS }));
        if (ev.outcome === "pending") return { status: 503, body: { success: false, code: "NOT_SETTLED_YET" } }; // Safepay hasn't caught up: let it retry
        return done({ outcome: ev.outcome });
      } catch (e) {
        if (e instanceof SafepayError) { log("safepay_error", { where: "webhook", kind: e.kind, status: e.status }); return { status: 503, body: { success: false, code: "TEMPORARY_ERROR" } }; }
        throw e; // database trouble etc.: a 5xx makes Safepay retry
      }
    },
  };
}
