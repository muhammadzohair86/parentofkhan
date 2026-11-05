import test from "node:test";
import assert from "node:assert/strict";
import { parseWhatsappNumber, buildWhatsappMessage, buildWhatsappUrl } from "../src/lib/whatsapp.js";
import { createWhatsappCheckout } from "../src/lib/whatsappCheckout.js";
import { createPaymentService, sha256 } from "../src/lib/paymentService.js";
import { customerOrderView } from "../src/lib/orderView.js";
import { fakeRepo } from "./helpers/paymentFakes.js";

const TOKEN = "11111111-1111-4111-8111-111111111111", TOKEN2 = "22222222-2222-4222-8222-222222222222";
const NUMBER = "923001234567";
const code = async (p) => { try { await p; } catch (e) { return e; } assert.fail("expected an error"); };

const quote = (over = {}) => ({
  currency: "USD", subtotal: 40, shipping: { scope: "domestic", courier: "NLS Xpress Domestic", destinationName: "Pakistan", countryCode: "PK", city: "Karachi", pricingMethod: "nls_domestic_tariff", amount: 300, currency: "PKR", deliveryEstimate: "2-3 working days", freeShipping: false, billableWeightKg: 1 },
  shippingInStoreCurrency: 1.09, exchangeRatePkrPerUsd: 280, total: 41.09,
  items: [{ productId: "a".repeat(24), slug: "khan-tee", name: "Khan Tee", color: "Black", size: "M", quantity: 2, unitPrice: 20, lineTotal: 40, sku: "KT", image: null }], ...over,
});
const input = (over = {}) => ({
  clientRequestId: TOKEN, country: "PK",
  items: [{ productId: "a".repeat(24), color: "Black", size: "M", quantity: 2 }],
  customer: { name: "Ayesha Khan", email: "ayesha@example.com", phone: "+92 300 1234567" },
  address: { line1: "12 Garden Road", line2: "", city: "Karachi", region: "Sindh", postalCode: "74000" }, ...over,
});
function setup({ number = NUMBER, priceCart } = {}) {
  const repo = fakeRepo(); const priced = []; 
  const svc = createWhatsappCheckout({ repo, number, priceCart: priceCart || (async (a) => { priced.push(a); return quote(); }) });
  return { repo, svc, priced };
}

test("WHATSAPP_BUSINESS_NUMBER: digits only, international, never invented", () => {
  assert.deepEqual(parseWhatsappNumber("923001234567"), { status: "ready", number: "923001234567" });
  for (const unset of [undefined, "", "   ", "your_whatsapp_number", "<number>"]) assert.equal(parseWhatsappNumber(unset).status, "unset", String(unset));
  for (const bad of ["+923001234567", "0300 1234567", "03001234567", "92-300-1234567", "12345", "9230012345678901234", "abc"]) assert.equal(parseWhatsappNumber(bad).status, "invalid", bad);
});

test("message: reference, items with size/color/qty, shipping, total and currency; no personal data", () => {
  const order = { orderNumber: "POK-261103-ABC234", subtotal: 40, total: 41.09, currency: "USD", shipping: 1.09,
    shippingDetails: { courier: "NLS", amount: 300, currency: "PKR", freeShipping: false },
    items: [{ name: "Khan Tee", color: "Black", size: "M", quantity: 2 }, { name: "Chai Hoodie", color: "Sand", size: "L", quantity: 1 }],
    customer: { name: "Ayesha Khan", email: "ayesha@example.com", phone: "+92 300 1234567" }, shippingAddress: { line1: "12 Garden Road" }, checkoutTokenHash: "SECRET" };
  const m = buildWhatsappMessage(order);
  for (const part of ["POK-261103-ABC234", "2 x Khan Tee (Black, M)", "1 x Chai Hoodie (Sand, L)", "Subtotal: $40.00", "Shipping: PKR 300", "Total: $41.09 USD", "confirm my order"]) assert.ok(m.includes(part), part);
  for (const secret of ["ayesha@example.com", "300 1234567", "Garden Road", "SECRET", "Ayesha"]) assert.ok(!m.includes(secret), `leaked ${secret}`);
  const url = buildWhatsappUrl(NUMBER, m);
  assert.ok(url.startsWith(`https://wa.me/${NUMBER}?text=`));
  assert.equal(decodeURIComponent(url.split("?text=")[1]), m);
  assert.ok(!/[\n ]/.test(url), "the URL is fully encoded");
});

test("message: free shipping is stated as free; control characters in names cannot break the message", () => {
  const m = buildWhatsappMessage({ orderNumber: "POK-1", subtotal: 20, total: 20, currency: "USD", shippingDetails: { courier: "NLS", amount: 0, currency: "PKR", freeShipping: true }, items: [{ name: "Tee\nInjected: line", color: "Red", size: "S", quantity: 1 }] });
  assert.ok(m.includes("Shipping: Free Shipping"));
  assert.ok(!m.includes("Tee\nInjected"));
});

test("message: a very long cart is shortened to a URL-safe length and says how many items were left out", () => {
  const items = Array.from({ length: 25 }, (_, i) => ({ name: `A fairly long product name number ${i + 1}`, color: "Heather Grey", size: "XL", quantity: 3 }));
  const m = buildWhatsappMessage({ orderNumber: "POK-261103-ABC234", subtotal: 900, total: 910, currency: "USD", shipping: 10, items });
  assert.ok(encodeURIComponent(m).length <= 1500);
  assert.match(m, /\.\.\.and \d+ more items? \(see order POK-261103-ABC234\)/);
  assert.ok(m.includes("Total: $910.00 USD"));
});

test("checkout: the order is saved FIRST (WhatsApp method, unpaid, server-priced, shipping snapshot) and only then is a link returned", async () => {
  const { repo, svc, priced } = setup();
  const r = await svc.start(input(), { userId: null });
  assert.equal(repo._orders.size, 1);
  const o = [...repo._orders.values()][0];
  assert.equal(o.payment.method, "whatsapp"); assert.equal(o.payment.status, "unpaid"); assert.equal(o.status, "pending");
  assert.equal(o.total, 41.09); assert.equal(o.shipping, 1.09); assert.equal(o.shippingDetails.amount, 300); assert.equal(o.shippingDetails.currency, "PKR"); assert.equal(o.shippingDetails.courier, "NLS Xpress Domestic");
  assert.deepEqual(o.items.map((i) => [i.name, i.color, i.size, i.quantity, i.unitPrice]), [["Khan Tee", "Black", "M", 2, 20]]);
  assert.match(r.orderNumber, /^POK-\d{6}-[A-Z0-9]{6}$/);
  assert.ok(r.whatsappUrl.startsWith(`https://wa.me/${NUMBER}?text=`));
  assert.ok(decodeURIComponent(r.whatsappUrl).includes(r.orderNumber), "the link carries the reference of the SAVED order");
  assert.equal(r.orderPath, `/order/${r.orderNumber}/${TOKEN}`);
  assert.equal(priced.length, 1, "priced by the server's own pricing function");
  assert.equal(repo._payments.length, 0, "no payment session / Payment record is ever created");
  assert.equal(r.total, 41.09);
});

test("checkout: pressing twice or retrying a dropped response returns the SAME order (no duplicate)", async () => {
  const { repo, svc } = setup();
  const [a, b] = await Promise.all([svc.start(input()), svc.start(input())]);
  const c = await svc.start(input());
  assert.equal(repo._orders.size, 1);
  assert.equal(a.orderNumber, b.orderNumber); assert.equal(a.orderNumber, c.orderNumber);
});

test("checkout: changed details under the same token are refused; a new token is a new order", async () => {
  const { repo, svc } = setup();
  await svc.start(input());
  const e = await code(svc.start(input({ address: { line1: "Somewhere else 5", line2: "", city: "Karachi", region: "", postalCode: "" } })));
  assert.equal(e.code, "CHECKOUT_CHANGED");
  await svc.start(input({ clientRequestId: TOKEN2 }));
  assert.equal(repo._orders.size, 2);
});

test("checkout: if pricing/validation fails nothing is saved and NO link is produced", async () => {
  const { repo, svc } = setup({ priceCart: async () => { throw Object.assign(new Error("x"), { status: 422, code: "SHIPPING_UNAVAILABLE" }); } });
  const e = await code(svc.start(input()));
  assert.equal(e.code, "SHIPPING_UNAVAILABLE");
  assert.equal(repo._orders.size, 0);
});

test("checkout: if saving the order fails, the error propagates and no link is produced", async () => {
  const { repo, svc } = setup();
  repo.createOrder = async () => { throw new Error("db down"); };
  await assert.rejects(svc.start(input()), /db down/);
});

test("checkout: without a configured WhatsApp number nothing is created", async () => {
  const { repo, svc } = setup({ number: null });
  assert.equal(svc.enabled, false);
  assert.equal((await code(svc.start(input()))).code, "WHATSAPP_NOT_CONFIGURED");
  assert.equal(repo._orders.size, 0);
});

test("checkout: an order that has no total can't be created (no fake amount)", async () => {
  const { repo, svc } = setup({ priceCart: async () => quote({ total: null, totalNote: "no rate" }) });
  assert.equal((await code(svc.start(input()))).code, "TOTAL_UNAVAILABLE");
  assert.equal(repo._orders.size, 0);
});

test("a WhatsApp order never gets an online payment session, even if the gateway is on", async () => {
  const repo = fakeRepo();
  const wa = createWhatsappCheckout({ repo, number: NUMBER, priceCart: async () => quote() });
  const created = await wa.start(input());
  let sessions = 0;
  const safepay = { environment: "sandbox", createTracker: async () => { sessions++; return { token: "track_x" }; }, createAuthToken: async () => "t", buildCheckoutUrl: () => "https://x", fetchTracker: async () => { sessions++; return {}; } };
  const svc = createPaymentService({ repo, safepay, config: { publicKey: "p", secretKey: "s" }, priceCart: async () => quote(), publicSiteUrl: "https://shop.example", whatsappLink: wa.linkFor });
  const e = await code(svc.retryPayment({ orderNumber: created.orderNumber, token: TOKEN }));
  assert.equal(e.code, "PAYMENT_METHOD_WHATSAPP");
  assert.equal(sessions, 0);
  // the status page: WhatsApp method, never "retry", unpaid, and the link can be rebuilt from the saved order
  const st = await svc.getStatus({ orderNumber: created.orderNumber, token: TOKEN });
  assert.equal(st.paymentMethod, "whatsapp"); assert.equal(st.canRetry, false); assert.equal(st.status, "unpaid");
  assert.ok(st.whatsappUrl && decodeURIComponent(st.whatsappUrl).includes(created.orderNumber));
});

test("with gateways off (no Safepay client) the online endpoints are unavailable and nothing is retryable", async () => {
  const repo = fakeRepo();
  const svc = createPaymentService({ repo, safepay: null, config: null, priceCart: async () => quote(), publicSiteUrl: "https://shop.example" });
  assert.equal(svc.enabled, false);
  assert.equal((await code(svc.startCheckout(input(), {}))).code, "PAYMENTS_UNAVAILABLE");
  assert.equal((await code(svc.retryPayment({ orderNumber: "POK-261103-ABC234", token: TOKEN }))).code, "PAYMENTS_UNAVAILABLE");
});

test("customer view of a WhatsApp order: honest wording, no email/phone/address, never 'paid' by itself", () => {
  const doc = { orderNumber: "POK-261103-ABC234", createdAt: new Date("2026-11-03T10:00:00Z"), status: "pending", currency: "USD", subtotal: 40, shipping: 1.09, total: 41.09,
    payment: { method: "whatsapp", status: "unpaid", environment: "" }, items: [{ name: "Khan Tee", color: "Black", size: "M", quantity: 2, unitPrice: 20 }],
    customer: { email: "private@example.com", phone: "0300" }, shippingAddress: { line1: "Private St" },
    statusHistory: [{ kind: "status", to: "pending", at: new Date("2026-11-03T10:00:00Z"), note: "internal", byName: "Customer" }] };
  const v = customerOrderView(doc);
  assert.equal(v.statusLabel, "Awaiting WhatsApp confirmation"); assert.equal(v.paymentStatus, "unpaid"); assert.equal(v.paymentMethod, "whatsapp");
  assert.equal(v.timeline[0].label, "Order created");
  const j = JSON.stringify(v);
  for (const s of ["private@example.com", "0300", "Private St", "internal"]) assert.ok(!j.includes(s), s);
});

test("manual payment verification: admin-only, WhatsApp orders only, one conditional update, nothing marks paid automatically", async () => {
  const { readFile } = await import("node:fs/promises");
  const src = (p) => readFile(new URL(p, import.meta.url), "utf8");
  const routes = await src("../src/routes/adminRoutes.js");
  assert.match(routes, /r\.patch\("\/orders\/:id\/payment", requirePermission\("orders\.update"\)/);
  const ctl = await src("../src/controllers/adminOrderController.js");
  assert.match(ctl, /payment\?\.method !== "whatsapp"[\s\S]*NOT_MANUAL_PAYMENT/);
  const repo = await src("../src/lib/paymentRepo.js");
  assert.match(repo, /"payment\.method": "whatsapp", "payment\.status": paid \? "unpaid" : "paid", status: \{ \$ne: "cancelled" \}/);
  const wa = await src("../src/lib/whatsappCheckout.js");
  assert.ok(!/markOrderPaid|setManualPayment|status: "paid"/.test(wa), "creating a WhatsApp order never touches payment state beyond 'unpaid'");
});
