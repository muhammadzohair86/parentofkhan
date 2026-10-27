import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import crypto from "node:crypto";
import { customerOrderView, customerOrderRow, buildTimeline, customerShipment, STATUS_TEXT } from "../src/lib/orderView.js";
import { parseShipmentInput, parseStatusChangeInput, validTrackingUrl, DEFAULT_CARRIER } from "../src/lib/shipmentInput.js";
import { planStatusChange, planShipmentUpdate } from "../src/lib/orderFulfilment.js";
import { ORDER_STATUSES } from "../src/lib/orderStatus.js";
import { createOrderAccessService, parseLookupInput, GENERIC_NOT_FOUND, LOOKUP_MAX_FAILURES, LOOKUP_WINDOW_MS, ACCESS_TTL_MS } from "../src/lib/orderAccessService.js";
import { createPaymentService, sha256 } from "../src/lib/paymentService.js";
import { createSafepayClient } from "../src/lib/safepayClient.js";
import { parseSafepayConfig } from "../src/lib/safepayConfig.js";
import { placedEntry, paymentPaidEntry } from "../src/lib/orderHistory.js";
import { fakeSafepayApi, fakeRepo } from "./helpers/paymentFakes.js";

// ------------------------------------------------------------------ fixtures
const TOKEN = "11111111-1111-4111-8111-111111111111";
const OTHER_TOKEN = "22222222-2222-4222-8222-222222222222";
const NO = "POK-261024-ABC234", NO2 = "POK-261024-XYZ789";
const PID = "aaaaaaaaaaaaaaaaaaaaaaaa";
const cfg = parseSafepayConfig({ SAFEPAY_ENV: "sandbox", SAFEPAY_PUBLIC_KEY: "sec_0a1b2c3d-1111-4222-8333-444455556666", SAFEPAY_SECRET_KEY: "s3cr3t_api_key_" + "a".repeat(40), SAFEPAY_WEBHOOK_SECRET: "whsec_" + "b".repeat(40) }).config;
const code = async (p) => { try { await p; } catch (e) { return e; } assert.fail("expected an error"); };
const actor = { id: "admin1", name: "Admin Alice" };

const orderInput = (over = {}) => ({
  orderNumber: NO, tokenHash: sha256(TOKEN), fingerprint: "fp", userId: null,
  customer: { name: "Ayesha Khan", email: "ayesha@example.com", phone: "+92 300 1234567" },
  shippingAddress: { line1: "12 Garden Road", line2: "Flat 3", city: "Karachi", region: "Sindh", postalCode: "74000", country: "Pakistan" },
  items: [{ product: PID, slug: "khan-tee", name: "Khan Tee", color: "Black", size: "M", sku: "KT-B", image: "/img/a.jpg", unitPrice: 20, quantity: 2 }],
  subtotal: 40, shipping: 1.09, discount: 0, total: 41.09, currency: "USD",
  shippingDetails: { scope: "domestic", courier: "NLS Xpress Domestic", destinationName: "Pakistan", countryCode: "PK", city: "Karachi", pricingMethod: "nls_domestic_tariff", amount: 300, currency: "PKR", freeShipping: false, deliveryEstimate: "2-3 working days", billableWeightKg: 1, exchangeRatePkrPerUsd: 276.87 },
  payment: { method: "safepay", provider: "safepay", environment: "sandbox", status: "unpaid", reference: "", amountMinor: 4109, currency: "USD" },
  ...over,
});
function env({ clock } = {}) {
  const api = fakeSafepayApi(cfg), repo = fakeRepo();
  const now = clock ? () => new Date(clock.t) : () => new Date();
  const sp = createSafepayClient(cfg, { fetchImpl: api.fetchImpl });
  const service = createPaymentService({ repo, safepay: sp, config: cfg, priceCart: async () => { throw new Error("not used"); }, publicSiteUrl: "http://localhost:5173", now });
  const access = createOrderAccessService({ repo, now });
  const doc = (id) => repo._orders.get(id);
  return { api, repo, service, access, doc, now, sp };
}
async function addOrder(e, over) { const o = await e.repo.createOrder(orderInput(over)); return { o, d: e.doc(o.id) }; }

// a doc stuffed with every sensitive thing we must NEVER show a customer
function sensitiveDoc() {
  return {
    _id: "SECRET-DB-ID-123", orderNumber: NO, createdAt: new Date("2026-10-24T09:00:00Z"), status: "shipped", currency: "USD", subtotal: 40, shipping: 1.09, total: 41.09,
    user: "SECRET-USER-ID", checkoutTokenHash: "SECRET-TOKEN-HASH", checkoutFingerprint: "SECRET-FINGERPRINT", paymentLeaseUntil: null,
    customer: { name: "Ayesha Khan", email: "private.person@example.com", phone: "+92 300 7654321" },
    shippingAddress: { line1: "99 Private Street Secret Colony", line2: "Flat 7", city: "Karachi", region: "Sindh", postalCode: "74999", country: "Pakistan" },
    items: [{ product: "SECRET-PRODUCT-OBJECT-ID", slug: "khan-tee", name: "Khan Tee", color: "Black", size: "M", sku: "SECRET-SKU-9", image: "/img/a.jpg", unitPrice: 20, quantity: 2 }],
    shippingDetails: { scope: "domestic", courier: "NLS Xpress Domestic", destinationName: "Pakistan", countryCode: "PK", city: "Karachi", pricingMethod: "nls_domestic_tariff", amount: 300, currency: "PKR", freeShipping: false, deliveryEstimate: "2-3 working days", billableWeightKg: 7.77, exchangeRatePkrPerUsd: 123.456 },
    payment: { method: "safepay", provider: "safepay", environment: "production", status: "paid", reference: "track_SECRET-TRACKER-REF", amountMinor: 4109, currency: "USD", paidAt: new Date("2026-10-24T09:05:00Z") },
    shipment: { carrier: "NLS Xpress", trackingNumber: "NLS123456789", trackingUrl: "https://track.example.com/t/NLS123456789", dispatchedAt: new Date("2026-10-25T12:00:00Z"), estimatedDelivery: "3-5 working days", internalNote: "SECRET-INTERNAL-NOTE call the rider" },
    statusHistory: [
      { kind: "status", to: "pending", byName: "Customer", note: "SECRET-NOTE-1", at: new Date("2026-10-24T09:00:00Z") },
      { kind: "payment", key: "payment:paid:track_SECRET-TRACKER-REF", byName: "System (Safepay)", note: "SECRET-NOTE-2", at: new Date("2026-10-24T09:05:00Z") },
      { kind: "status", from: "pending", to: "confirmed", by: "SECRET-ADMIN-ID", byName: "Admin Alice", note: "SECRET-NOTE-3", at: new Date("2026-10-24T10:00:00Z") },
      { kind: "status", from: "confirmed", to: "processing", byName: "Admin Alice", note: "SECRET-NOTE-4", at: new Date("2026-10-24T11:00:00Z") },
      { kind: "status", from: "processing", to: "shipped", byName: "Admin Alice", note: "SECRET-NOTE-5", at: new Date("2026-10-25T12:00:00Z") },
      { kind: "shipment", byName: "Admin Alice", note: "SECRET-NOTE-6", at: new Date("2026-10-25T13:00:00Z") },
    ],
  };
}

// ================================================================== customer-facing privacy
test("customer view: an explicit allowlist: nothing private appears anywhere in the response", () => {
  const view = customerOrderView(sensitiveDoc());
  const json = JSON.stringify(view);
  for (const secret of ["private.person@example.com", "+92 300 7654321", "99 Private Street", "Secret Colony", "Flat 7", "74999", "SECRET-DB-ID", "SECRET-USER-ID", "SECRET-TOKEN-HASH", "SECRET-FINGERPRINT", "SECRET-PRODUCT-OBJECT-ID",
    "SECRET-SKU", "SECRET-TRACKER-REF", "SECRET-INTERNAL-NOTE", "SECRET-NOTE", "SECRET-ADMIN-ID", "Admin Alice", "System (Safepay)", "7.77", "123.456", "nls_domestic_tariff", "production", "Ayesha", "checkoutTokenHash", "_id"]) {
    assert.ok(!json.includes(secret), `leaked: ${secret}`);
  }
  assert.deepEqual(Object.keys(view).sort(), ["currency", "itemCount", "items", "orderNumber", "paymentStatus", "placedAt", "shipment", "shipping", "status", "statusLabel", "subtotal", "testMode", "timeline", "total"]);
  assert.deepEqual(Object.keys(view.items[0]).sort(), ["color", "image", "lineTotal", "name", "quantity", "size", "unitPrice"]);
  assert.deepEqual(Object.keys(view.shipping).sort(), ["amount", "currency", "deliveryEstimate", "destination", "free", "method"]);
  assert.deepEqual(Object.keys(view.shipment).sort(), ["awaitingTracking", "carrier", "dispatchedAt", "estimatedDelivery", "trackingNumber", "trackingUrl"]);
  assert.deepEqual(Object.keys(view.timeline[0]).sort(), ["at", "label", "text", "type"]);
});
test("customer view: shows exactly what the customer needs (reference, date, status, payment, items, totals, shipping method, estimate)", () => {
  const v = customerOrderView(sensitiveDoc());
  assert.deepEqual([v.orderNumber, v.placedAt, v.status, v.statusLabel, v.paymentStatus, v.currency], [NO, "2026-10-24T09:00:00.000Z", "shipped", "Shipped", "paid", "USD"]);
  assert.deepEqual(v.items, [{ name: "Khan Tee", color: "Black", size: "M", quantity: 2, unitPrice: 20, lineTotal: 40, image: "/img/a.jpg" }]);
  assert.deepEqual([v.subtotal, v.total, v.itemCount], [40, 41.09, 2]);
  assert.deepEqual(v.shipping, { method: "NLS Xpress Domestic", destination: "Pakistan", free: false, amount: 300, currency: "PKR", deliveryEstimate: "2-3 working days" });
  assert.equal(v.testMode, false);
});
test("customer view: Free Shipping and international orders read correctly; a missing estimate is null (never invented)", () => {
  const free = sensitiveDoc(); free.shippingDetails.freeShipping = true; free.shippingDetails.amount = 0; free.shippingDetails.deliveryEstimate = ""; free.shipping = 0; free.total = 40;
  const v = customerOrderView(free);
  assert.deepEqual([v.shipping.free, v.shipping.amount, v.shipping.deliveryEstimate, v.total], [true, 0, null, 40]);
  const intl = sensitiveDoc(); Object.assign(intl.shippingDetails, { scope: "international", courier: "NLS Xpress International", destinationName: "Dubai, UAE", amount: 1000 });
  assert.deepEqual([customerOrderView(intl).shipping.method, customerOrderView(intl).shipping.destination], ["NLS Xpress International", "Dubai, UAE"]);
});
test("payment status is only 'paid' when the saved, verified payment status says so", () => {
  const st = (payment, latest) => customerOrderView({ ...sensitiveDoc(), payment: { ...sensitiveDoc().payment, ...payment } }, latest).paymentStatus;
  assert.equal(st({ status: "paid" }), "paid");
  assert.equal(st({ status: "unpaid" }), "unpaid");
  assert.equal(st({ status: "unpaid" }, { status: "pending" }), "pending");
  assert.equal(st({ status: "unpaid" }, { status: "failed" }), "failed");
  assert.equal(st({ status: "unpaid" }, { status: "cancelled" }), "cancelled");
  assert.equal(st({ status: "unpaid" }, { status: "review" }), "review");
  assert.equal(st({ status: "refunded" }), "refunded");
  assert.notEqual(st({ status: "unpaid" }, { status: "pending" }), "paid");
});
test("tracking is only visible once the order has actually been shipped; nothing is generated", () => {
  for (const status of ["pending", "confirmed", "processing", "cancelled"]) assert.equal(customerShipment({ ...sensitiveDoc(), status }), null, status); // tracking saved early stays private
  for (const status of ["shipped", "delivered"]) assert.equal(customerShipment({ ...sensitiveDoc(), status }).trackingNumber, "NLS123456789");
  const noTracking = customerShipment({ ...sensitiveDoc(), status: "shipped", shipment: { carrier: "NLS Xpress", trackingNumber: "", trackingUrl: "" } });
  assert.deepEqual([noTracking.trackingNumber, noTracking.trackingUrl, noTracking.awaitingTracking], [null, null, true]);
  const numberOnly = customerShipment({ ...sensitiveDoc(), status: "shipped", shipment: { trackingNumber: "ABC123", trackingUrl: "" } });
  assert.deepEqual([numberOnly.trackingNumber, numberOnly.trackingUrl, numberOnly.carrier], ["ABC123", null, "NLS Xpress"]); // no link is made up from a number
  assert.equal(customerShipment({ ...sensitiveDoc(), status: "shipped", shipment: undefined }).awaitingTracking, true);
});
test("timeline: built from saved history only, with fixed friendly text; admin notes and names never used; sorted by time", () => {
  const t = buildTimeline(sensitiveDoc().statusHistory);
  assert.deepEqual(t.map((e) => e.label), ["Order received", "Payment received", "Order confirmed", "Being prepared", "Shipped", "Tracking updated"]);
  assert.ok(t.every((e, i) => i === 0 || t[i - 1].at <= e.at));
  assert.ok(!JSON.stringify(t).match(/SECRET|Alice|Safepay/));
  assert.equal(buildTimeline([{ ...sensitiveDoc().statusHistory[4] }, { ...sensitiveDoc().statusHistory[0] }])[0].label, "Order received"); // out-of-order input is sorted
  assert.deepEqual(buildTimeline([{ kind: "payment", key: "payment:refunded", at: new Date() }]).map((e) => e.label), ["Payment refunded"]);
  assert.deepEqual(buildTimeline([{ kind: "mystery", at: new Date() }, { kind: "status", to: "bogus", at: new Date() }, { kind: "status", to: "pending" }]), []); // unknown/undated entries are ignored, never invented
});
test("old orders: no history / no shipment / no shippingDetails still display, with nothing fabricated", () => {
  const legacy = { orderNumber: "POK-010101-AAAAAA", createdAt: new Date("2025-01-01T00:00:00Z"), status: "delivered", subtotal: 30, shipping: 5, total: 35, currency: "USD", items: [{ name: "Old Tee", color: "Red", size: "L", unitPrice: 30, quantity: 1 }], payment: { status: "paid" }, statusHistory: [] };
  const v = customerOrderView(legacy);
  assert.deepEqual([v.status, v.timeline, v.paymentStatus, v.testMode], ["delivered", [], "paid", false]);
  assert.deepEqual(v.shipping, { method: null, destination: null, free: false, amount: 5, currency: "USD", deliveryEstimate: null });
  assert.deepEqual([v.shipment.trackingNumber, v.shipment.awaitingTracking], [null, true]);   // delivered, no tracking recorded: no number is invented
  const noHist = customerOrderView({ ...legacy, statusHistory: undefined, shipment: undefined, items: undefined });
  assert.deepEqual([noHist.timeline, noHist.items], [[], []]);
  const freeLegacy = customerOrderView({ ...legacy, shipping: 0 });
  assert.equal(freeLegacy.shipping.free, true);
  const entriesBeforeKind = buildTimeline([{ from: "pending", to: "confirmed", byName: "x", note: "internal", at: new Date("2025-01-02T00:00:00Z") }]); // saved before `kind` existed
  assert.deepEqual(entriesBeforeKind.map((e) => e.label), ["Order confirmed"]);
});
test("order list rows carry only summary data", () => {
  const row = customerOrderRow(sensitiveDoc());
  assert.deepEqual(Object.keys(row).sort(), ["currency", "itemCount", "orderNumber", "paymentStatus", "placedAt", "status", "statusLabel", "total"]);
  assert.ok(!JSON.stringify(row).match(/SECRET|@|Street/));
  assert.equal(customerOrderRow({ ...sensitiveDoc(), payment: { status: "unpaid" } }).paymentStatus, "pending");
});

// ================================================================== admin input rules
test("shipment input: tracking numbers, https-only URLs, dates, estimates and notes are validated; blanks clear; only sent fields returned", () => {
  const ok = parseShipmentInput({ carrier: "  NLS   Xpress ", trackingNumber: " NLS-123/456 ", trackingUrl: " https://tracking.example.com/t?id=NLS123 ", dispatchedAt: "2026-10-24", estimatedDelivery: " 3-5 working days ", internalNote: " call rider " });
  assert.deepEqual(ok.errors, []);
  assert.deepEqual([ok.value.carrier, ok.value.trackingNumber, ok.value.trackingUrl, ok.value.estimatedDelivery, ok.value.internalNote], ["NLS Xpress", "NLS-123/456", "https://tracking.example.com/t?id=NLS123", "3-5 working days", "call rider"]);
  assert.equal(ok.value.dispatchedAt.toISOString(), "2026-10-24T12:00:00.000Z");
  assert.deepEqual(parseShipmentInput({ trackingNumber: "ABC123" }).value, { trackingNumber: "ABC123" });
  assert.deepEqual(parseShipmentInput({}).value, {});
  assert.deepEqual(parseShipmentInput({ trackingNumber: "", trackingUrl: "", estimatedDelivery: null, dispatchedAt: "", internalNote: "", carrier: "" }).value, { trackingNumber: "", trackingUrl: "", estimatedDelivery: "", dispatchedAt: null, internalNote: "", carrier: DEFAULT_CARRIER });
  const bad = (raw) => parseShipmentInput(raw).errors.map((e) => e.path);
  assert.deepEqual(bad({ trackingNumber: "ab" }), ["trackingNumber"]);
  assert.deepEqual(bad({ trackingNumber: "<script>alert(1)</script>" }), ["trackingNumber"]);
  assert.deepEqual(bad({ trackingNumber: "x".repeat(61) }), ["trackingNumber"]);
  assert.deepEqual(bad({ trackingNumber: 12345 }), ["trackingNumber"]);
  for (const u of ["http://track.example.com/1", "javascript:alert(1)", "data:text/html,hi", "ftp://x.example.com", "https://user:pw@track.example.com", "https://localhost/x", "https://127.0.0.1/x", "https://192.168.1.5/x", "https://[::1]/x", "https://intranet/x", "https://track.example.com/a b", "not a url", `https://track.example.com/${"a".repeat(500)}`, "//evil.com"])
    assert.deepEqual(bad({ trackingUrl: u }), ["trackingUrl"], u);
  assert.equal(validTrackingUrl("https://track.example.com/x"), true);
  assert.deepEqual(bad({ dispatchedAt: "24-10-2026" }), ["dispatchedAt"]);
  assert.deepEqual(bad({ dispatchedAt: "2026-02-31x" }), ["dispatchedAt"]);
  assert.deepEqual(bad({ dispatchedAt: "2999-01-01" }), ["dispatchedAt"]);
  assert.deepEqual(bad({ estimatedDelivery: "x".repeat(81) }), ["estimatedDelivery"]);
  assert.deepEqual(bad({ internalNote: "x".repeat(501) }), ["internalNote"]);
  assert.deepEqual(parseShipmentInput("nope").errors.length, 1);
  assert.deepEqual(parseShipmentInput({ trackingNumber: "ab" }, { prefix: "shipment." }).errors.map((e) => e.path), ["shipment.trackingNumber"]);
});
test("status-change input: valid statuses only; flags must be real booleans; shipment fields validated with their own paths", () => {
  const ok = parseStatusChangeInput({ status: "shipped", note: " sent ", shipment: { trackingNumber: "ABC123" }, allowWithoutTracking: false }, ORDER_STATUSES);
  assert.deepEqual([ok.errors, ok.value.status, ok.value.note, ok.value.shipment, ok.value.allowWithoutTracking, ok.value.acknowledgeUnpaid], [[], "shipped", "sent", { trackingNumber: "ABC123" }, false, false]);
  assert.deepEqual(parseStatusChangeInput({ status: "teleported" }, ORDER_STATUSES).errors.map((e) => e.path), ["status"]);
  assert.deepEqual(parseStatusChangeInput({ status: "shipped", allowWithoutTracking: "yes" }, ORDER_STATUSES).errors.map((e) => e.path), ["allowWithoutTracking"]);
  assert.deepEqual(parseStatusChangeInput({ status: "shipped", shipment: { trackingUrl: "http://x.com" } }, ORDER_STATUSES).errors.map((e) => e.path), ["shipment.trackingUrl"]);
  assert.deepEqual(parseStatusChangeInput({ status: "confirmed" }, ORDER_STATUSES).value, { status: "confirmed", note: "", shipment: {}, allowWithoutTracking: false, acknowledgeUnpaid: false });
  assert.equal(parseStatusChangeInput(null, ORDER_STATUSES).value, null);
});

// ================================================================== fulfilment rules
const ord = (over = {}) => ({ status: "processing", payment: { status: "paid" }, shipment: undefined, ...over });
const plan = (o, input = {}, now = new Date("2026-10-24T10:00:00Z")) => planStatusChange({ order: o, input: { status: "shipped", note: "", shipment: {}, allowWithoutTracking: false, acknowledgeUnpaid: false, ...input }, actor, now });
test("shipping: tracking number required unless the admin explicitly confirms; no tracking is ever invented", async () => {
  assert.throws(() => plan(ord()), (e) => e.status === 400 && e.code === "VALIDATION_ERROR" && e.details[0].path === "shipment.trackingNumber");
  const p = plan(ord(), { shipment: { trackingNumber: "NLS12345" } });
  assert.equal(p.set.status, "shipped");
  assert.equal(p.set["shipment.trackingNumber"], "NLS12345");
  assert.equal(p.set["shipment.carrier"], DEFAULT_CARRIER);                                    // defaults to NLS Xpress
  assert.equal(p.set["shipment.dispatchedAt"].toISOString(), "2026-10-24T10:00:00.000Z");       // dispatch date defaults to now
  const already = plan(ord({ shipment: { trackingNumber: "SAVED1", carrier: "NLS Xpress" } }));  // a number saved earlier counts
  assert.equal(already.set.status, "shipped");
  const without = plan(ord(), { allowWithoutTracking: true });
  assert.equal(without.set.status, "shipped");
  assert.ok(!("shipment.trackingNumber" in without.set), "no tracking number is created");
  assert.equal(plan(ord(), { shipment: { trackingNumber: "A1B2C3", dispatchedAt: new Date("2026-10-20T12:00:00Z"), carrier: "Other Courier" } }).set["shipment.dispatchedAt"].toISOString(), "2026-10-20T12:00:00.000Z");
  assert.equal(plan(ord(), { shipment: { trackingNumber: "A1B2C3", carrier: "Other Courier" } }).set["shipment.carrier"], "Other Courier");
});
test("shipping an UNPAID order needs an explicit confirmation (abandoned checkouts can't be shipped by accident)", () => {
  for (const status of ["unpaid", "failed"]) {
    const e = (() => { try { plan(ord({ payment: { status } }), { shipment: { trackingNumber: "NLS12345" } }); } catch (x) { return x; } })();
    assert.deepEqual([e.status, e.code], [409, "PAYMENT_REQUIRED"], status);
  }
  assert.equal(plan(ord({ payment: { status: "unpaid" } }), { shipment: { trackingNumber: "NLS12345" }, acknowledgeUnpaid: true }).set.status, "shipped");
  assert.equal(plan(ord({ status: "pending", payment: { status: "unpaid" } }), { status: "confirmed" }).set.status, "confirmed"); // earlier steps are unchanged
});
test("status workflow is unchanged and 'delivered' can only follow 'shipped': tracking details never skip steps", () => {
  const to = (status, from, extra = {}) => { try { return planStatusChange({ order: ord({ status: from, ...extra }), input: { status, note: "", shipment: {}, allowWithoutTracking: true, acknowledgeUnpaid: true }, actor }); } catch (e) { return e; } };
  assert.equal(to("delivered", "shipped").set.status, "delivered");
  for (const from of ["pending", "confirmed", "processing"]) assert.equal(to("delivered", from, { shipment: { trackingNumber: "NLS12345", trackingUrl: "https://t.example.com/x" } }).code, "INVALID_TRANSITION", `${from} -> delivered`);
  assert.equal(to("shipped", "pending").code, "INVALID_TRANSITION");
  assert.equal(to("processing", "shipped").code, "INVALID_TRANSITION");
  assert.equal(to("shipped", "delivered").code, "INVALID_TRANSITION");
  assert.equal(to("cancelled", "delivered").code, "INVALID_TRANSITION");
  assert.equal(to("confirmed", "cancelled").code, "INVALID_TRANSITION");
  assert.equal(to("processing", "confirmed").set.status, "processing");
  assert.equal(to("delivered", "shipped").history.kind, "status");
});
test("history entries: a status change records from/to/when/who/note (internal), and shipment edits are customer-visible only after dispatch", () => {
  const p = plan(ord(), { shipment: { trackingNumber: "NLS12345" }, note: "handed to rider" });
  assert.deepEqual([p.history.kind, p.history.from, p.history.to, p.history.by, p.history.byName, p.history.note], ["status", "processing", "shipped", "admin1", "Admin Alice", "handed to rider"]);
  assert.ok(p.history.at instanceof Date);
  const sp = (status, shipment, input) => planShipmentUpdate({ order: { status, shipment }, input, actor });
  const added = sp("shipped", { carrier: "NLS Xpress" }, { trackingNumber: "NLS12345" });
  assert.deepEqual([added.noop, added.history.kind, added.history.note, added.set["shipment.trackingNumber"]], [false, "shipment", "Tracking details added.", "NLS12345"]);
  assert.ok(!("status" in added.set), "editing tracking never changes the order status");
  assert.equal(sp("shipped", { trackingNumber: "OLD111" }, { trackingNumber: "NEW222" }).history.note, "Tracking details updated.");
  assert.equal(sp("delivered", { trackingNumber: "OLD111" }, { trackingUrl: "https://t.example.com/x" }).history.note, "Tracking details updated.");
  assert.equal(sp("shipped", { trackingNumber: "OLD111" }, { internalNote: "private" }).history, null);          // internal-only change: no customer entry
  assert.equal(sp("shipped", { trackingNumber: "OLD111" }, { dispatchedAt: new Date("2026-10-20T12:00:00Z") }).history, null);
  assert.equal(sp("processing", {}, { trackingNumber: "EARLY1" }).history, null);                                   // before dispatch: saved, but no timeline entry
  assert.equal(sp("processing", {}, { trackingNumber: "EARLY1" }).set["shipment.trackingNumber"], "EARLY1");
  assert.equal(sp("shipped", { trackingNumber: "SAME11", carrier: "NLS Xpress" }, { trackingNumber: "SAME11" }).noop, true);   // repeating the same save adds nothing
  assert.deepEqual(sp("shipped", { trackingNumber: "SAME11" }, { trackingNumber: "" }).set["shipment.trackingNumber"], "");     // a mistaken number can be cleared
  assert.throws(() => sp("cancelled", {}, { trackingNumber: "NLS12345" }), (e) => e.code === "ORDER_CANCELLED");
});

// ================================================================== guest lookup
const body = (o = {}) => ({ orderNumber: NO, email: "ayesha@example.com", ...o });
test("guest lookup: correct reference + checkout email returns an expiring access token whose hash (not the token) is stored", async () => {
  const e = env(); const { o } = await addOrder(e);
  const r = await e.access.lookup(body({ email: "Ayesha@Example.COM" }));  // case-insensitive e-mail
  assert.deepEqual([r.orderNumber, r.path === `/order/${NO}/${r.token}`, /^[0-9a-f-]{36}$/.test(r.token)], [NO, true, true]);
  assert.ok(Date.parse(r.expiresAt) > Date.now() + 13 * 24 * 3600_000 && Date.parse(r.expiresAt) < Date.now() + 15 * 24 * 3600_000);
  assert.deepEqual([...e.repo._access.keys()], [sha256(r.token)]);
  assert.ok(!JSON.stringify([...e.repo._access.entries()]).includes(r.token));
  assert.equal(e.repo._access.get(sha256(r.token)).orderId, o.id);
});
test("guest lookup: every failure (wrong e-mail, unknown order, bad e-mail format on the server side) returns the SAME generic message", async () => {
  const e = env(); await addOrder(e);
  const errs = [await code(e.access.lookup(body({ email: "someone.else@example.com" }))), await code(e.access.lookup(body({ orderNumber: NO2 }))), await code(e.access.lookup(body({ orderNumber: NO2, email: "ayesha@example.com" })))];
  for (const x of errs) assert.deepEqual([x.status, x.code, x.message], [404, "ORDER_NOT_FOUND", GENERIC_NOT_FOUND]);
  assert.ok(!/exist|valid order|email is|wrong/i.test(GENERIC_NOT_FOUND.replace("Check the order reference and the email address you used at checkout.", "")));
  assert.equal(e.repo._access.size, 0, "no token was issued");
  // format problems are about the FORM, not about existence
  assert.deepEqual(parseLookupInput({ orderNumber: "nope", email: "x" }).errors.map((x) => x.path), ["orderNumber", "email"]);
  assert.deepEqual(parseLookupInput({ orderNumber: ` ${NO.toLowerCase()} `, email: " A@B.CO " }).value, { orderNumber: NO, email: "a@b.co" });
  assert.equal(parseLookupInput(null).value, null);
});
test("guest lookup is throttled per order reference, identically for real and non-existent orders (no existence leak)", async () => {
  const clock = { t: Date.now() }; const e = env({ clock }); await addOrder(e);
  for (const ref of [NO, NO2]) {   // NO exists; NO2 does not
    for (let i = 0; i < LOOKUP_MAX_FAILURES; i++) assert.equal((await code(e.access.lookup(body({ orderNumber: ref, email: `guess${i}@example.com` })))).status, 404);
    const locked = await code(e.access.lookup(body({ orderNumber: ref, email: "ayesha@example.com" })));   // even the right e-mail is refused while locked
    assert.deepEqual([locked.status, locked.code], [429, "TOO_MANY_ATTEMPTS"], ref);
  }
  assert.equal(e.repo._access.size, 0);
  clock.t += LOOKUP_WINDOW_MS + 1000;                                                                      // window passes
  assert.equal((await e.access.lookup(body())).orderNumber, NO);
});
test("throttle: successes don't count, other orders are unaffected, and the log never contains an order reference or e-mail", async () => {
  const logs = []; const e = env(); e.access = createOrderAccessService({ repo: e.repo, log: (a, b) => logs.push([a, b]) }); await addOrder(e); await addOrder(e, { orderNumber: NO2, tokenHash: sha256(OTHER_TOKEN), customer: { name: "B", email: "b@example.com" } });
  for (let i = 0; i < 20; i++) await e.access.lookup(body());
  for (let i = 0; i < LOOKUP_MAX_FAILURES; i++) await code(e.access.lookup(body({ email: `x${i}@example.com` })));
  assert.equal((await code(e.access.lookup(body()))).status, 429);
  assert.equal((await e.access.lookup(body({ orderNumber: NO2, email: "b@example.com" }))).orderNumber, NO2);   // a different order is not locked
  assert.ok(!JSON.stringify(logs).match(/POK-|@example/));
});

// ================================================================== opening an order (links + sessions)
test("an access token opens only ITS order; a wrong/other/expired token and an unknown order are indistinguishable", async () => {
  const clock = { t: Date.now() }; const e = env({ clock });
  await addOrder(e); await addOrder(e, { orderNumber: NO2, tokenHash: sha256(OTHER_TOKEN), customer: { name: "B", email: "b@example.com" } });
  const a = await e.access.lookup(body());
  const ok = await e.service.getStatus({ orderNumber: NO, token: a.token });
  assert.equal(ok.order.orderNumber, NO);
  const reject = [await code(e.service.getStatus({ orderNumber: NO2, token: a.token })),                       // a token for order A used on order B
    await code(e.service.getStatus({ orderNumber: NO, token: OTHER_TOKEN })), await code(e.service.getStatus({ orderNumber: "POK-999999-ZZZZZZ", token: a.token })), await code(e.service.getStatus({ orderNumber: "nope", token: a.token }))];
  for (const x of reject) assert.deepEqual([x.status, x.code, x.message], [404, "ORDER_NOT_FOUND", "We couldn't find that order."]);
  clock.t += ACCESS_TTL_MS + 60_000;                                                                           // the link expires
  assert.equal((await code(e.service.getStatus({ orderNumber: NO, token: a.token }))).code, "ORDER_NOT_FOUND");
  assert.equal((await e.service.getStatus({ orderNumber: NO, token: TOKEN })).order.orderNumber, NO);          // the original checkout link keeps working
});
test("refreshing returns the CURRENT saved status, shipment and timeline from the database", async () => {
  const e = env(); const { o, d } = await addOrder(e);
  const first = await e.service.getStatus({ orderNumber: NO, token: TOKEN });
  assert.deepEqual([first.order.status, first.order.shipment, first.order.statusLabel], ["pending", null, "Order received"]);
  Object.assign(d, { status: "shipped", shipment: { carrier: "NLS Xpress", trackingNumber: "NLS999888", trackingUrl: "https://t.example.com/NLS999888", internalNote: "private note" } });
  d.statusHistory.push({ kind: "status", from: "processing", to: "shipped", byName: "Admin Alice", note: "secret", at: new Date() });
  const second = await e.service.getStatus({ orderNumber: NO, token: TOKEN });   // "page refresh"
  assert.deepEqual([second.order.status, second.order.statusLabel, second.order.shipment.trackingNumber, second.order.shipment.trackingUrl], ["shipped", "Shipped", "NLS999888", "https://t.example.com/NLS999888"]);
  assert.ok(!JSON.stringify(second).match(/private note|secret|Alice/));
  d.status = "delivered";
  assert.equal((await e.service.getStatus({ orderNumber: NO, token: TOKEN })).order.status, "delivered");
  void o;
});
test("the status response keeps its payment fields (existing payment return flow) and adds the safe order", async () => {
  const e = env(); await addOrder(e);
  const s = await e.service.getStatus({ orderNumber: NO, token: TOKEN });
  assert.deepEqual([s.orderNumber, s.status, s.total, s.currency, s.canRetry, s.testMode, s.verificationDelayed], [NO, "unpaid", 41.09, "USD", true, true, false]);
  assert.ok(s.order && s.order.orderNumber === NO);
  assert.ok(!JSON.stringify(s).match(/ayesha@example|Garden Road|\+92 300/));
});

// ================================================================== signed-in customers
test("signed-in customers see only orders placed under their own account; other customers' and guest orders are never reachable", async () => {
  const e = env();
  await addOrder(e, { userId: "userA" });
  await addOrder(e, { orderNumber: NO2, tokenHash: sha256(OTHER_TOKEN), userId: "userB", customer: { name: "B", email: "b@example.com" } });
  await addOrder(e, { orderNumber: "POK-261024-GST234", tokenHash: sha256("33333333-3333-4333-8333-333333333333"), userId: null });
  const mineA = await e.access.listMine({ userId: "userA" });
  assert.deepEqual(mineA.map((r) => r.orderNumber), [NO]);
  assert.deepEqual((await e.access.listMine({ userId: "userB" })).map((r) => r.orderNumber), [NO2]);
  assert.deepEqual(await e.access.listMine({ userId: "nobody" }), []);
  assert.equal((await code(e.access.listMine({ userId: null }))).status, 401);
  assert.equal((await e.service.getStatusForUser({ orderNumber: NO, userId: "userA" })).order.orderNumber, NO);
  for (const [orderNumber, userId] of [[NO2, "userA"], [NO, "userB"], ["POK-261024-GST234", "userA"], [NO, null], [NO, undefined], ["bad", "userA"]]) {
    const err = await code(e.service.getStatusForUser({ orderNumber, userId }));
    assert.deepEqual([err.status, err.code], [404, "ORDER_NOT_FOUND"], `${orderNumber} as ${userId}`);
  }
  assert.ok(!JSON.stringify(mineA).match(/@|Garden|\+92/));
});

// ================================================================== payment confirmation history (verified, deduplicated)
test("verified payment adds exactly ONE 'payment received' history entry; repeated checks/webhooks cannot duplicate it", async () => {
  const e = env(); const { o, d } = await addOrder(e);
  const tr = (await e.sp.createTracker({ amountMinor: 4109, currency: "USD", orderNumber: NO })).token;
  await e.repo.createPayment({ orderId: o.id, orderNumber: NO, tracker: tr, amountMinor: 4109, currency: "USD", environment: "sandbox", status: "pending", attempt: 1 });
  assert.deepEqual(d.statusHistory.map((h) => h.kind), ["status"]);                                // just "order placed"
  let s = await e.service.getStatus({ orderNumber: NO, token: TOKEN });
  assert.equal(s.order.paymentStatus, "pending");
  assert.ok(!s.order.timeline.some((t) => t.type === "paid"), "not paid yet: no 'payment received' entry");
  e.api.set(tr, { state: "TRACKER_ENDED" });
  await new Promise((r) => setTimeout(r, 2100));                                                   // outlast the 2 s anti-hammering throttle
  s = await e.service.getStatus({ orderNumber: NO, token: TOKEN });
  assert.deepEqual([s.order.paymentStatus, s.order.status], ["paid", "pending"]);                  // paying never advances fulfilment
  for (let i = 0; i < 3; i++) await e.service.getStatus({ orderNumber: NO, token: TOKEN });
  assert.deepEqual(d.statusHistory.filter((h) => h.kind === "payment").length, 1);
  assert.deepEqual(s.order.timeline.map((t) => t.label), ["Order received", "Payment received"]);
  assert.equal(d._paidCount, 1);
  assert.equal(d.statusHistory[1].key, `payment:paid:${tr}`);
});
test("an unverified payment (Safepay amount differs) adds no 'payment received' entry and is never shown as Paid", async () => {
  const e = env(); const { o, d } = await addOrder(e);
  const tr = (await e.sp.createTracker({ amountMinor: 4109, currency: "USD", orderNumber: NO })).token;
  await e.repo.createPayment({ orderId: o.id, orderNumber: NO, tracker: tr, amountMinor: 4109, currency: "USD", environment: "sandbox", status: "pending", attempt: 1 });
  e.api.set(tr, { state: "TRACKER_ENDED", reportedAmount: 100 });
  const s = await e.service.getStatus({ orderNumber: NO, token: TOKEN });
  assert.deepEqual([s.order.paymentStatus, s.order.timeline.some((t) => t.type === "paid"), d.payment.status], ["review", false, "unpaid"]);
});
test("a placed-order entry exists from the start, so new orders have a real first timeline event", async () => {
  const e = env(); const { d } = await addOrder(e);
  assert.deepEqual(buildTimeline(d.statusHistory).map((t) => t.label), ["Order received"]);
  assert.equal(placedEntry().kind, "status");
  assert.equal(paymentPaidEntry("track_x").key, "payment:paid:track_x");
});

// ================================================================== wiring audits (Express/Mongoose can't run here, so these read the source)
const src = (p) => readFile(new URL(p, import.meta.url), "utf8");
const strip = (c) => c.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
test("route audit: admin shipment/status routes demand orders.update on the server; customer routes are authenticated or rate limited", async () => {
  const admin = await src("../src/routes/adminRoutes.js");
  for (const line of admin.split("\n").filter((l) => /^\s*r\.(patch)\("\/orders\//.test(l))) {
    assert.match(line, /requirePermission\("orders\.update"\)/, line.trim());
    assert.match(line, /validate\(\{ params: idParams, body: /, line.trim());
  }
  assert.equal((admin.match(/\/orders\/:id\/shipment/g) || []).length, 1);
  const routes = await src("../src/routes/paymentRoutes.js");
  assert.match(routes, /orders\.post\("\/lookup", limiter\(15 \* 60_000, 20/);
  assert.match(routes, /orders\.get\("\/mine", optionalAuth\(isProd\), requireAuth/);
  for (const m of ["mine/:orderNumber/status", "mine/:orderNumber/retry-payment"]) assert.match(routes, new RegExp(`"/${m.replace(/[/:]/g, (c) => `\\${c}`)}", optionalAuth\\(isProd\\), requireAuth`));
  const app = await src("../src/app.js");
  assert.match(app, /app\.use\("\/api\/orders", requireDb, requireSameOrigin\(clientOrigins\), pr\.orders\)/);
});
test("the customer view builder never touches private fields, and customers can't reach any write path to status or payment", async () => {
  const code = strip(await src("../src/lib/orderView.js"));
  for (const forbidden of ["customer.email", "customer.phone", "shippingAddress", "internalNote", "byName", ".note", "tokenHash", "payment.reference", "_id", "billableWeightKg", "exchangeRate", "checkoutFingerprint", ".user"]) assert.ok(!code.includes(forbidden), `orderView.js must not read ${forbidden}`);
  const ctl = strip(await src("../src/controllers/paymentController.js")) + strip(await src("../src/lib/orderAccessService.js"));
  assert.ok(!/updateOne|findOneAndUpdate|\.save\(|status\s*=\s*["']/.test(ctl), "customer-facing code never writes order status");
  assert.match(strip(await src("../src/lib/paymentService.js")), /customerOrderView\(doc, latest\)/);
  const svc = strip(await src("../src/lib/paymentService.js"));
  assert.equal((svc.match(/markOrderPaid\(/g) || []).length, 1, "still exactly one call site can mark an order paid");
});
test("no payment gateway or Cash on Delivery appears in the order-tracking code", async () => {
  for (const f of ["../src/lib/orderView.js", "../src/lib/orderAccessService.js", "../src/lib/orderFulfilment.js", "../src/lib/shipmentInput.js", "../src/lib/orderHistory.js", "../../client/src/pages/TrackOrder.jsx", "../../client/src/pages/AccountOrder.jsx", "../../client/src/components/OrderDetails.jsx"]) {
    assert.ok(!/easypaisa|jazzcash|payoneer|stripe|paypal|cash on delivery|\bcod\b/i.test(strip(await src(f))), f);
  }
});
