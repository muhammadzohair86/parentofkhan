import test from "node:test";
import assert from "node:assert/strict";
import { ALL_PERMISSIONS, normalizePermissions, hasPermission, canManageMember, effectivePermissions } from "../src/lib/permissions.js";
import { slugify, nextFreeSlug } from "../src/lib/slug.js";
import { detectImage } from "../src/lib/imageSniff.js";
import { allowedNext, canTransition, ORDER_STATUSES } from "../src/lib/orderStatus.js";
import { createStorage } from "../src/lib/storage.js";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const master = { _id: "m", role: "master_admin", active: true, permissions: [] };
const sub = (id, perms, extra = {}) => ({ _id: id, role: "admin", active: true, permissions: perms, ...extra });

test("master has everything; sub-admins only what was granted; customers and inactive staff nothing", () => {
  for (const p of ALL_PERMISSIONS) assert.equal(hasPermission(master, p), true);
  const a = sub("a", ["orders.view", "orders.update"]);
  assert.equal(hasPermission(a, "orders.update"), true);
  assert.equal(hasPermission(a, "products.delete"), false);
  assert.equal(hasPermission(a, "team.manage"), false);
  assert.equal(hasPermission({ role: "customer", permissions: ["products.view"], active: true }, "products.view"), false);
  assert.equal(hasPermission(sub("b", ["products.view"], { active: false }), "products.view"), false);
  assert.equal(hasPermission(null, "products.view"), false);
  assert.equal(hasPermission({ role: "master_admin", active: false }, "products.view"), false);
});

test("view is separate from modify, and modify implies view; unknown permissions are dropped", () => {
  assert.deepEqual(normalizePermissions(["products.edit"]), ["products.view", "products.edit"]);
  assert.deepEqual(normalizePermissions(["orders.view"]), ["orders.view"]);
  assert.deepEqual(normalizePermissions(["products.delete", "root", "products.delete", "__proto__"]), ["products.view", "products.delete"]);
  assert.deepEqual(normalizePermissions("products.edit"), []);
  assert.equal(effectivePermissions(master).length, ALL_PERMISSIONS.length);
});

test("team rules: nobody modifies the master; sub-admins cannot escalate", () => {
  const mgr = sub("mgr", ["team.view", "team.manage", "products.view", "products.edit"]);
  const plain = sub("p", ["products.view"]);
  const peer = sub("peer", ["team.view", "team.manage"]);
  assert.equal(canManageMember(master, master).ok, false);                               // master is immutable via API
  assert.equal(canManageMember(mgr, master).ok, false);
  assert.equal(canManageMember(master, plain, ["orders.view"]).ok, true);                // master may grant anything
  assert.equal(canManageMember(sub("x", ["products.view"]), plain).ok, false);          // no team.manage
  assert.equal(canManageMember(mgr, mgr, ["products.view"]).ok, false);                  // cannot change own access
  assert.equal(canManageMember(mgr, peer).ok, false);                                    // cannot touch another team manager
  assert.equal(canManageMember(mgr, plain, ["products.view", "products.edit"]).ok, true);
  assert.equal(canManageMember(mgr, plain, ["orders.view"]).ok, false);                  // cannot grant what they do not hold
  assert.equal(canManageMember(mgr, plain, ["team.manage"]).ok, false);                  // cannot grant team.manage
  assert.equal(canManageMember(master, { _id: "c", role: "customer" }).ok, false);       // customers are not team members
});

test("slugify and collision handling", () => {
  assert.equal(slugify("  Black Hoodie 01! "), "black-hoodie-01");
  assert.equal(slugify("Café Crème"), "cafe-creme");
  assert.equal(slugify("***"), "");
  assert.equal(nextFreeSlug("tee", []), "tee");
  assert.equal(nextFreeSlug("tee", ["tee"]), "tee-2");
  assert.equal(nextFreeSlug("tee", ["tee", "tee-2", "tee-3"]), "tee-4");
});

test("image sniffing accepts JPEG/PNG/WebP by content and rejects everything else", () => {
  const pad = Buffer.alloc(16);
  assert.equal(detectImage(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), pad]))?.ext, "jpg");
  assert.equal(detectImage(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), pad]))?.ext, "png");
  assert.equal(detectImage(Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), pad]))?.ext, "webp");
  assert.equal(detectImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')), null);
  assert.equal(detectImage(Buffer.from("GIF89a" + "x".repeat(20))), null);
  assert.equal(detectImage(Buffer.from("MZ" + "x".repeat(40))), null);
  assert.equal(detectImage(Buffer.alloc(3)), null);
  assert.equal(detectImage("not a buffer"), null);
});

test("order status transitions", () => {
  assert.deepEqual(allowedNext("pending"), ["confirmed", "cancelled"]);
  assert.equal(canTransition("pending", "shipped"), false);       // cannot skip steps
  assert.equal(canTransition("processing", "shipped"), true);
  for (const s of ["delivered", "cancelled"]) assert.deepEqual(allowedNext(s), []); // final
  assert.equal(canTransition("delivered", "pending"), false);
  assert.equal(canTransition("nope", "pending"), false);
  assert.equal(ORDER_STATUSES.length, 6);
});

test("storage names files itself, writes inside its root, and only removes files it created", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "pok-"));
  try {
    const st = createStorage({ dir, publicBase: "" });
    const a = await st.save(Buffer.from("x"), "png"), b = await st.save(Buffer.from("x"), "png");
    assert.match(a.name, /^[a-f0-9]{32}\.png$/);
    assert.notEqual(a.name, b.name);
    assert.equal(a.url, `/api/uploads/${a.name}`);
    assert.equal(await st.remove("../../etc/passwd"), false);
    assert.equal(await st.remove("..%2f..%2fx.png"), false);
    assert.equal((await readdir(dir)).length, 2);
    assert.equal(await st.remove(a.name), true);
    assert.equal((await readdir(dir)).length, 1);
    assert.equal(createStorage({ dir, publicBase: "https://api.example.com" }).root, path.resolve(dir));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

import { readMasterConfig } from "../src/lib/masterConfig.js";
test("master admin config: optional, but if present it must be complete and strong (and is never echoed)", () => {
  assert.equal(readMasterConfig({}), null);
  assert.deepEqual(readMasterConfig({ MASTER_ADMIN_EMAIL: " Owner@Example.com ", MASTER_ADMIN_INITIAL_PASSWORD: "a-long-passphrase-1" }), { email: "owner@example.com", password: "a-long-passphrase-1" });
  assert.throws(() => readMasterConfig({ MASTER_ADMIN_EMAIL: "owner@example.com" }), /BOTH/);
  assert.throws(() => readMasterConfig({ MASTER_ADMIN_INITIAL_PASSWORD: "a-long-passphrase-1" }), /BOTH/);
  assert.throws(() => readMasterConfig({ MASTER_ADMIN_EMAIL: "not-an-email", MASTER_ADMIN_INITIAL_PASSWORD: "a-long-passphrase-1" }), /valid email/);
  assert.throws(() => readMasterConfig({ MASTER_ADMIN_EMAIL: "o@e.com", MASTER_ADMIN_INITIAL_PASSWORD: "short" }), /12 to 128/);
  try { readMasterConfig({ MASTER_ADMIN_EMAIL: "o@e.com", MASTER_ADMIN_INITIAL_PASSWORD: "short" }); } catch (e) { assert.ok(!e.message.includes("short")); }
});

import { findProductProblems } from "../src/lib/productRules.js";
import { canGrantPermissions } from "../src/lib/permissions.js";
test("product cross-field rules: duplicate colors/sizes and sale price", () => {
  assert.deepEqual(findProductProblems({ price: 20, salePrice: 15, variants: [{ color: "Black", sizes: [{ size: "S" }, { size: "M" }] }, { color: "White", sizes: [{ size: "S" }] }] }), []);
  assert.equal(findProductProblems({ price: 20, salePrice: 20 })[0].path[0], "salePrice");
  assert.equal(findProductProblems({ price: 20, salePrice: 25 }).length, 1);
  assert.deepEqual(findProductProblems({ salePrice: 5 }), []);                       // partial update: price absent, skipped
  assert.equal(findProductProblems({ variants: [{ color: "Black", sizes: [] }, { color: " black ", sizes: [] }] })[0].path.join("."), "variants.1.color");
  assert.equal(findProductProblems({ variants: [{ color: "A", sizes: [{ size: "M" }, { size: "m" }] }] })[0].path.join("."), "variants.0.sizes.1.size");
});
test("granting permissions: master anything; sub-admin only a subset of their own, never team.manage", () => {
  const mgr = { _id: "m", role: "admin", active: true, permissions: ["team.view", "team.manage", "orders.view"] };
  assert.equal(canGrantPermissions({ role: "master_admin", active: true }, ["team.manage", "products.delete"]).ok, true);
  assert.equal(canGrantPermissions(mgr, ["orders.view"]).ok, true);
  assert.equal(canGrantPermissions(mgr, ["products.view"]).ok, false);
  assert.equal(canGrantPermissions(mgr, ["team.manage"]).ok, false);
  assert.equal(canGrantPermissions({ role: "admin", active: true, permissions: ["orders.view"] }, []).ok, false);
});

import { readFile } from "node:fs/promises";
test("route audit: every admin route behind requireStaff also demands a permission (except dashboard and own-password)", async () => {
  const src = await readFile(new URL("../src/routes/adminRoutes.js", import.meta.url), "utf8");
  const after = src.slice(src.indexOf("r.use(requireStaff)"));
  const routes = after.split("\n").filter((l) => /^\s*r\.(get|post|put|patch|delete)\(/.test(l) || /^\s*r\.post\("\/uploads"/.test(l));
  assert.ok(routes.length >= 18, `expected many routes, found ${routes.length}`);
  for (const line of routes) {
    if (/"\/dashboard"|"\/auth\/password"/.test(line)) continue;
    // the uploads route puts its permission check on the next line
    const needs = /requirePermission|requireAnyPermission/.test(line) || line.includes('"/uploads"');
    assert.ok(needs, `route without a permission check: ${line.trim()}`);
  }
  assert.match(src, /r\.use\(requireSameOrigin\(clientOrigins, \{ strict: true \}\)\)/);
  assert.ok(src.indexOf("requireSameOrigin") < src.indexOf("r.use(optionalAuth") && src.indexOf("r.use(optionalAuth") < src.indexOf("r.use(requireStaff)"));
  assert.match(src, /r\.post\("\/uploads",\s+requireAnyPermission/); // uploads are permission-gated too
  // nothing before requireStaff except login/logout/me
  const before = src.slice(0, src.indexOf("r.use(requireStaff)")).split("\n").filter((l) => /^\s*r\.(get|post|put|patch|delete)\(/.test(l));
  assert.deepEqual(before.map((l) => l.match(/"(\/[^"]+)"/)[1]), ["/auth/login", "/auth/logout", "/auth/me"]);
});

import { csvCell, csvLine } from "../src/lib/csv.js";
test("CSV export escapes quotes/commas and neutralises spreadsheet formulas", () => {
  assert.equal(csvCell("a@b.com"), "a@b.com");
  assert.equal(csvCell('he said "hi", ok'), '"he said ""hi"", ok"');
  assert.equal(csvCell("=HYPERLINK(\"x\")"), "\"'=HYPERLINK(\"\"x\"\")\"");
  for (const f of ["+1@x.com", "-a@x.com", "@x", "=1+1"]) assert.ok(csvCell(f).replace(/^"/, "").startsWith("'"), f);
  assert.equal(csvCell(null), "");
  assert.equal(csvLine(["a", "b,c"]), 'a,"b,c"\r\n');
});
test("site permissions exist and edit implies view", () => {
  assert.ok(ALL_PERMISSIONS.includes("site.view") && ALL_PERMISSIONS.includes("site.edit"));
  assert.deepEqual(normalizePermissions(["site.edit"]), ["site.view", "site.edit"]);
});
