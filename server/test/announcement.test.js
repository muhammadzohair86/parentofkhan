import test from "node:test";
import assert from "node:assert/strict";
import { parseAnnouncementInput, resolveAnnouncement, normalizeHex, contrastRatio, ANNOUNCEMENT_DEFAULTS, MIN_CONTRAST } from "../src/lib/announcement.js";

const ok = (over = {}) => ({ enabled: true, text: "SALE 40% OFF", backgroundColor: "#151515", textColor: "#f6f1e7", ...over });

test("defaults: enabled, the requested text, readable colors", () => {
  assert.equal(ANNOUNCEMENT_DEFAULTS.enabled, true);
  assert.equal(ANNOUNCEMENT_DEFAULTS.text, "FREE DELIVERY ALL OVER PAKISTAN");
  assert.ok(contrastRatio(ANNOUNCEMENT_DEFAULTS.backgroundColor, ANNOUNCEMENT_DEFAULTS.textColor) >= MIN_CONTRAST);
});

test("an installation with no saved announcement serves the defaults", () => {
  for (const stored of [undefined, null, {}, "x", 5]) assert.deepEqual(resolveAnnouncement(stored), { ...ANNOUNCEMENT_DEFAULTS });
});

test("hex colors only: #rgb and #rrggbb are accepted and normalised; CSS, names, urls and injections are not", () => {
  assert.equal(normalizeHex("#ABC"), "#aabbcc"); assert.equal(normalizeHex(" #FfEeDd "), "#ffeedd");
  for (const bad of ["red", "rgb(0,0,0)", "#12345", "#gggggg", "#fff; background:url(x)", "url(javascript:1)", "#ffffffff", "", null, 5, "expression(alert(1))"]) assert.equal(normalizeHex(bad), null, String(bad));
});

test("valid input is cleaned and returned; whitespace collapses", () => {
  const r = parseAnnouncementInput(ok({ text: "  FREE   SHIPPING \n WORLDWIDE ", backgroundColor: "#FFF", textColor: "#000" }));
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.value, { enabled: true, text: "FREE SHIPPING WORLDWIDE", backgroundColor: "#ffffff", textColor: "#000000" });
});

test("invalid colors are rejected by field", () => {
  const r = parseAnnouncementInput(ok({ backgroundColor: "blue", textColor: "#12" }));
  assert.deepEqual(r.errors.map((e) => e.path).sort(), ["backgroundColor", "textColor"]);
});

test("text: HTML-ish characters and over-long text are rejected; empty is allowed only when the bar is off", () => {
  assert.equal(parseAnnouncementInput(ok({ text: "<script>alert(1)</script>" })).errors[0].path, "text");
  assert.equal(parseAnnouncementInput(ok({ text: "x".repeat(121) })).errors[0].path, "text");
  assert.equal(parseAnnouncementInput(ok({ text: "   " })).errors[0].path, "text");
  const off = parseAnnouncementInput(ok({ enabled: false, text: "" }));
  assert.deepEqual(off.errors, []); assert.equal(off.value.enabled, false);
});

test("unreadable color pairs are rejected on the server", () => {
  const r = parseAnnouncementInput(ok({ backgroundColor: "#777777", textColor: "#808080" }));
  assert.equal(r.errors[0].path, "textColor"); assert.match(r.errors[0].message, /contrast/i);
  assert.equal(parseAnnouncementInput(ok({ backgroundColor: "#ffffff", textColor: "#ffffff" })).errors.length, 1);
});

test("enabled must be a real boolean; non-objects are rejected", () => {
  assert.equal(parseAnnouncementInput(ok({ enabled: "yes" })).errors[0].path, "enabled");
  for (const bad of [null, undefined, "x", [], 5]) assert.ok(parseAnnouncementInput(bad).errors.length);
});

test("only the four known fields come out (extra fields can't be saved)", () => {
  const r = parseAnnouncementInput({ ...ok(), $set: { role: "admin" }, html: "<b>", css: "x" });
  assert.deepEqual(Object.keys(r.value).sort(), ["backgroundColor", "enabled", "text", "textColor"]);
});

test("a damaged stored record can never produce a broken or unreadable bar", () => {
  const r = resolveAnnouncement({ enabled: false, text: "<b>x</b>", backgroundColor: "javascript:1", textColor: "#fff" });
  assert.equal(r.enabled, false); assert.equal(r.text, ANNOUNCEMENT_DEFAULTS.text); assert.equal(r.backgroundColor, ANNOUNCEMENT_DEFAULTS.backgroundColor);
  const low = resolveAnnouncement({ enabled: true, text: "Hi", backgroundColor: "#777777", textColor: "#808080" });
  assert.deepEqual([low.backgroundColor, low.textColor], [ANNOUNCEMENT_DEFAULTS.backgroundColor, ANNOUNCEMENT_DEFAULTS.textColor]);
});

test("the public response and the admin routes: shape and protection (source checks)", async () => {
  const { readFile } = await import("node:fs/promises");
  const src = (p) => readFile(new URL(p, import.meta.url), "utf8");
  const pub = await src("../src/controllers/siteController.js");
  assert.match(pub, /getAnnouncement[\s\S]*resolveAnnouncement\(doc\?\.announcement\)/);
  assert.match(pub, /select\("announcement"\)/, "the public endpoint reads only the announcement field");
  const routes = await src("../src/routes/adminRoutes.js");
  assert.match(routes, /r\.get\("\/site\/announcement", requirePermission\("site\.view"\)/);
  assert.match(routes, /r\.put\("\/site\/announcement", requirePermission\("site\.edit"\), validate\(\{ body: announcementBody \}\)/);
  const site = await src("../src/routes/siteRoutes.js");
  assert.match(site, /router\.get\("\/announcement"/);
  assert.ok(!/router\.(put|post|patch|delete)/.test(site), "the public site router stays read-only");
});
