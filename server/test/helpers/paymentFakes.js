// In-memory stand-ins used by the payment tests (and the browser test harness):
//  - fakeSafepayApi: behaves like Safepay's documented HTTP API (auth header, minor units, tracker states, both tracker response shapes)
//  - fakeRepo: same atomic semantics as lib/paymentRepo.js (unique token hash, lease, conditional updates)
import crypto from "node:crypto";
import { placedEntry, paymentPaidEntry, paymentRefundedEntry } from "../../src/lib/orderHistory.js";
const sha = (t) => crypto.createHash("sha256").update(t).digest("hex");

// ---- in-memory Safepay HTTP API (mirrors the documented contract: auth header, minor units, tracker states) ----
export function fakeSafepayApi(config) {
  const trackers = new Map(); const calls = []; const st = { fail: null, shape: "nested", slow: false };
  const resp = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
  const fetchImpl = async (url, opts) => {
    const u = new URL(url); const body = opts.body ? JSON.parse(opts.body) : null;
    calls.push({ method: opts.method, path: u.pathname, headers: opts.headers, body, url });
    if (st.fail === "network") throw new TypeError("fetch failed");
    if (typeof st.fail === "number") return resp(st.fail, { status: { message: `failure ${st.fail}`, errors: [] } });
    if (opts.headers["X-SFPY-MERCHANT-SECRET"] !== config.secretKey) return resp(401, { status: { message: "Unauthorized" } });
    if (opts.method === "POST" && u.pathname === "/order/payments/v3/") {
      if (body.merchant_api_key !== config.publicKey || !Number.isInteger(body.amount) || body.mode !== "payment" || body.intent !== "CYBERSOURCE") return resp(400, { status: { message: "bad request" } });
      const token = `track_${crypto.randomUUID()}`;
      trackers.set(token, { state: "TRACKER_STARTED", amount: body.amount, currency: body.currency, metadata: body.metadata });
      return resp(200, { data: { tracker: { token, state: "TRACKER_STARTED" } }, status: { errors: [], message: "success" } });
    }
    if (opts.method === "POST" && u.pathname === "/client/passport/v1/token") return resp(200, { data: `tbt_${crypto.randomBytes(24).toString("base64url")}` });
    const m = u.pathname.match(/^\/reporter\/api\/v1\/payments\/(track_[\w-]+)$/);
    if (opts.method === "GET" && m) {
      const t = trackers.get(m[1]); if (!t) return resp(404, { status: { message: "not found" } });
      const core = { token: m[1], state: t.state, purchase_totals: { quote_amount: { currency: t.currency, amount: t.reportedAmount ?? t.amount }, base_amount: { currency: "PKR", amount: 999999 } } };
      if (t.hideAmount) delete core.purchase_totals.quote_amount;
      if (t.reportedCurrency) core.purchase_totals.quote_amount.currency = t.reportedCurrency;
      return resp(200, st.shape === "nested" ? { data: { tracker: core }, status: { errors: [], message: "success" } } : { ok: true, data: core });
    }
    return resp(404, {});
  };
  return { fetchImpl, trackers, calls, st, set: (token, patch) => Object.assign(trackers.get(token), patch), count: (path) => calls.filter((c) => c.path === path).length };
}

// ---- in-memory repository with the same atomic semantics as lib/paymentRepo.js ----
export function fakeRepo() {
  const orders = new Map(), payments = [], events = new Map(); let seq = 0;
  const tick = () => new Promise((r) => setImmediate(r)); // yield so concurrent requests really interleave
  const out = (o) => o && ({ id: o._id, orderNumber: o.orderNumber, tokenHash: o.checkoutTokenHash, fingerprint: o.checkoutFingerprint, total: o.total,
    paymentStatus: o.payment.status, paymentReference: o.payment.reference, paymentAmountMinor: o.payment.amountMinor, paymentCurrency: o.payment.currency, paymentEnvironment: o.payment.environment, userId: o.userId ?? null, emailHash: o.customer?.email ? sha(String(o.customer.email).trim().toLowerCase()) : "" });
  const pout = (p) => p && ({ id: p._id, orderId: p.order, orderNumber: p.orderNumber, tracker: p.tracker, status: p.status, createdAt: p.createdAt, lastCheckedAt: p.lastCheckedAt, paidAt: p.paidAt });
  const dup = (field) => Object.assign(new Error("dup"), { code: "DUPLICATE_KEY", field });
  return {
    _orders: orders, _payments: payments, _events: events,
    async findOrderByTokenHash(h) { await tick(); return out([...orders.values()].find((o) => o.checkoutTokenHash === h)); },
    async findOrderByNumber(n) { await tick(); return out([...orders.values()].find((o) => o.orderNumber === n)); },
    async findOrderById(id) { await tick(); return out(orders.get(id)); },
    async createOrder(d) {
      await tick();
      const all = [...orders.values()];
      if (all.some((o) => o.checkoutTokenHash === d.tokenHash)) throw dup("checkoutTokenHash");
      if (all.some((o) => o.orderNumber === d.orderNumber)) throw dup("orderNumber");
      const o = { _id: `o${++seq}`, orderNumber: d.orderNumber, checkoutTokenHash: d.tokenHash, checkoutFingerprint: d.fingerprint, ...d, status: "pending", leaseUntil: null, createdAt: new Date(), statusHistory: [placedEntry()] };
      orders.set(o._id, o); return out(o);
    },
    async acquireLease(id, until, now) { await tick(); const o = orders.get(id); if (o.leaseUntil && o.leaseUntil > now) return false; o.leaseUntil = until; return true; },
    async releaseLease(id) { await tick(); orders.get(id).leaseUntil = null; },
    async markOrderPaid(id, { tracker, paidAt }) { await tick(); const o = orders.get(id); if (o.payment.status !== "paid") { Object.assign(o.payment, { status: "paid", reference: tracker, paidAt }); o.statusHistory.push(paymentPaidEntry(tracker, paidAt)); o._paidCount = (o._paidCount || 0) + 1; return { applied: true, reference: tracker }; } return { applied: false, reference: o.payment.reference }; },
    async setOrderPaymentStatus(id, status, { from }) { await tick(); const o = orders.get(id); if (from.includes(o.payment.status)) { o.payment.status = status; if (status === "refunded") o.statusHistory.push(paymentRefundedEntry()); } },
    async findOrderDocById(id) { await tick(); return orders.get(id) || null; },
    async listOrdersForUser(userId, limit) { await tick(); return [...orders.values()].filter((o) => o.userId === userId).reverse().slice(0, limit); },
    _access: new Map(), _throttle: new Map(),
    async hasAccess(orderId, tokenHash, now) { await tick(); const a = this._access.get(tokenHash); return !!a && a.orderId === orderId && a.expiresAt > now; },
    async createAccess({ orderId, tokenHash, expiresAt }) { await tick(); this._access.set(tokenHash, { orderId, expiresAt }); },
    async lookupFailures(key, now) { await tick(); const r = this._throttle.get(key); return r && r.expiresAt > now ? r.count : 0; },
    async recordLookupFailure(key, ttlMs, now) { await tick(); const r = this._throttle.get(key); if (r && r.expiresAt > now) { r.count++; return r.count; } this._throttle.set(key, { count: 1, expiresAt: new Date(now.getTime() + ttlMs) }); return 1; },
    async createPayment(d) { await tick(); const p = { _id: `p${++seq}`, order: d.orderId, ...d, lastCheckedAt: null, paidAt: null }; payments.push(p); return pout(p); },
    async listPayments(orderId) { await tick(); return payments.filter((p) => p.order === orderId).reverse().map(pout); },
    async findPaymentByTracker(t) { await tick(); return pout(payments.find((p) => p.tracker === t)); },
    async updatePayment(id, patch, { unlessStatus } = {}) { await tick(); const p = payments.find((x) => x._id === id); if (unlessStatus?.includes(p.status)) return false; Object.assign(p, patch); return true; },
    async recordEvent({ token, type, tracker }) { await tick(); const e = events.get(token); if (e) return { inserted: false, processed: !!e.processedAt }; events.set(token, { type, tracker, processedAt: null }); return { inserted: true, processed: false }; },
    async markEventProcessed(token, outcome) { await tick(); Object.assign(events.get(token), { processedAt: new Date(), outcome }); },
  };
}

