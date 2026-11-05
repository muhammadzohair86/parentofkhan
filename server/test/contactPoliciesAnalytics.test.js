import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dayKey, addDays, isVisitorId, hashVisitorId, isBot, fillSeries } from "../src/lib/analytics.js";
import { ALL_PERMISSIONS, hasPermission } from "../src/lib/permissions.js";
import { parsePolicy, inlineParts } from "../../client/src/lib/policyText.js";

const src = (p) => readFile(new URL(p, import.meta.url), "utf8");
const UUID = "3f2b8c1e-5a4d-4e7b-9c1a-0d2e4f6a8b0c";

test("visitor day follows Pakistan time (UTC+5)", () => {
  assert.equal(dayKey(new Date("2026-11-04T18:59:00Z")), "2026-11-04");
  assert.equal(dayKey(new Date("2026-11-04T19:00:00Z")), "2026-11-05");
  assert.equal(addDays("2026-11-01", -1), "2026-10-31");
  assert.equal(addDays("2026-02-27", 2), "2026-03-01");
});

test("visitor ids: only real UUIDs count, and only a one-way hash is ever stored", () => {
  assert.equal(isVisitorId(UUID), true);
  for (const bad of ["", "abc", "1234", "<script>", UUID + "x", null, undefined, 5, "../../etc/passwd"]) assert.equal(isVisitorId(bad), false, String(bad));
  const h = hashVisitorId(UUID);
  assert.match(h, /^[0-9a-f]{64}$/); assert.ok(!h.includes(UUID.replace(/-/g, "")));
  assert.equal(h, hashVisitorId(UUID.toUpperCase()));
});

test("crawlers and tools are not counted as visitors; browsers are", () => {
  for (const ua of ["Googlebot/2.1", "Mozilla/5.0 (compatible; bingbot/2.0)", "UptimeRobot/2.0", "curl/8.0", "python-requests/2.31", "HeadlessChrome/120", "", undefined]) assert.equal(isBot(ua), true, String(ua));
  for (const ua of ["Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile Safari/604.1", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36"]) assert.equal(isBot(ua), false);
});

test("daily series: exact length, oldest first, missing days are 0", () => {
  const s = fillSeries([{ _id: "2026-11-04", n: 5 }, { _id: "2026-11-02", n: 2 }], "2026-11-04", 4);
  assert.deepEqual(s, [{ day: "2026-11-01", value: 0 }, { day: "2026-11-02", value: 2 }, { day: "2026-11-03", value: 0 }, { day: "2026-11-04", value: 5 }]);
});

test("visit recording stores no IP, user agent or path; bots and bad ids are skipped; the response is always 204", async () => {
  const c = await src("../src/controllers/analyticsController.js");
  assert.match(c, /isVisitorId\(vid\) && !isBot\(req\.get\("user-agent"\)\)/);
  assert.ok(!/req\.ip|x-forwarded|\.path|originalUrl/.test(c), "no IP/path is read");
  assert.match(c, /status\(204\)/);
  const m = await src("../src/models/Analytics.js");
  assert.ok(!/\bip\b|userAgent|path/i.test(m.replace(/\/\/.*$/gm, "")), "models have no IP/UA/path field");
  assert.match(m, /expires: 60 \* 60 \* 24 \* 400/);
});

test("analytics and messages are permission-gated; the public contact API is submit-only and rate limited with a honeypot", async () => {
  for (const p of ["messages.view", "messages.manage", "analytics.view"]) assert.ok(ALL_PERMISSIONS.includes(p), p);
  const master = { _id: "m", role: "master_admin", active: true, permissions: [] };
  const sub = { _id: "s", role: "admin", active: true, permissions: ["orders.view"] };
  assert.equal(hasPermission(master, "analytics.view"), true); assert.equal(hasPermission(sub, "analytics.view"), false); assert.equal(hasPermission(sub, "messages.view"), false);
  const routes = await src("../src/routes/adminRoutes.js");
  assert.match(routes, /r\.get\("\/messages", requirePermission\("messages\.view"\)/);
  assert.match(routes, /r\.patch\("\/messages\/:id", requirePermission\("messages\.manage"\)/);
  assert.match(routes, /r\.delete\("\/messages\/:id", requirePermission\("messages\.manage"\)/);
  const dash = await src("../src/controllers/adminDashboardController.js");
  assert.match(dash, /hasPermission\(u, "analytics\.view"\)/); assert.match(dash, /hasPermission\(u, "messages\.view"\)/);
  const pub = await src("../src/routes/contactRoutes.js");
  assert.ok(!/router\.(get|put|patch|delete)/.test(pub)); assert.match(pub, /limiter\(10 \* 60_000, 5/);
  const ctl = await src("../src/controllers/contactController.js");
  assert.match(ctl, /if \(website\) return res\.status\(201\)/);
  const app = await src("../src/app.js");
  assert.match(app, /app\.use\("\/api\/contact", requireDb, requireSameOrigin\(clientOrigins\), contactRoutes\)/);
  assert.match(app, /app\.use\("\/api\/analytics", requireDb, requireSameOrigin\(clientOrigins\), analyticsRoutes\)/);
});

test("policies: all four owner-supplied files are present, unmodified in substance, and parse into a title and sections", async () => {
  const expect = {
    privacy: { title: "Privacy Policy", h: ["What information do we collect?", "Orders and payments", "Children's privacy"], text: ["We don't sell your personal information to other businesses.", "Last updated: November 4, 2026"] },
    refund: { title: "Refund & Return Policy", h: ["1. Return period", "6. Refund method"], text: ["7 days of receiving your order", "15 working days"] },
    shipping: { title: "Shipping & Delivery Policy", h: ["1. Order processing", "Within Pakistan", "International orders", "7. Contact us"], text: ["NLS Xpress", "customs duties"] },
    terms: { title: "Terms & Conditions", h: ["1. Using our website", "9. Applicable law", "11. Contact us"], text: ["governed by the laws of Pakistan"] },
  };
  for (const [slug, e] of Object.entries(expect)) {
    const raw = await src(`../../client/src/content/policies/${slug}.txt`);
    const blocks = parsePolicy(raw);
    assert.equal(blocks.filter((b) => b.type === "title").length, 1, slug);
    assert.equal(blocks.find((b) => b.type === "title").text, e.title);
    const heads = blocks.filter((b) => b.type === "h2" || b.type === "h3").map((b) => b.text);
    for (const h of e.h) assert.ok(heads.includes(h), `${slug}: heading "${h}"`);
    for (const t of e.text) assert.ok(raw.includes(t), `${slug}: text "${t}"`);
    assert.ok(raw.includes("parentofkhan.contact@gmail.com"), `${slug}: contact email`);
  }
  const page = await src("../../client/src/pages/Policy.jsx");
  assert.ok(!/dangerouslySetInnerHTML/.test(page), "policy text is rendered as text nodes, never HTML");
  assert.ok(!/Draft structure|To be confirmed/.test(page), "the placeholder notice is gone");
  assert.match(await src("../../client/src/components/Footer.jsx"), /policies\/refund/);
});

test("policy renderer: links only https/mailto, markup in the file stays inert text", () => {
  const parts = inlineParts("<img src=x onerror=alert(1)> **bold** http://evil.test javascript:alert(1) https://parentofkhan.com mail me@x.com");
  assert.ok(parts.every((p) => !p.href || /^(https:\/\/|mailto:)/.test(p.href)), "no http:, javascript: or other links");
  assert.ok(parts.some((p) => p.href === "https://parentofkhan.com")); assert.ok(parts.some((p) => p.href === "mailto:me@x.com"));
  assert.ok(parsePolicy("# T\n\n### H\n\n- a\n- b\n\ntext").some((b) => b.type === "ul" && b.items.length === 2));
});

test("contact page: really submits, shows success only after the server saved it, and keeps the honeypot hidden from people", async () => {
  const page = await src("../../client/src/pages/Contact.jsx");
  assert.match(page, /await sendContactMessage\(v\)/);
  assert.ok(!/not connected yet/.test(page), "the 'not connected' placeholder is gone");
  assert.match(page, /setSent\(true\)[\s\S]{0,40}setV\(EMPTY\)/);
  assert.match(page, /aria-hidden="true"/); assert.match(page, /tabIndex=\{-1\}/);
  assert.match(await src("../../client/src/services/contact.js"), /apiPost\("\/contact", payload\)/);
  assert.ok(!/retry/.test(await src("../../client/src/services/contact.js")), "never auto-retried");
});
