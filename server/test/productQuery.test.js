import test from "node:test";
import assert from "node:assert/strict";
import { buildProductFilter, buildProductSort, parseSearchTerms } from "../src/lib/productQuery.js";
import { escapeRegex } from "../src/lib/escapeRegex.js";

test("filter always requires active product, allowed categories and an available variant", () => {
  const f = buildProductFilter({ categoryIds: ["c1"] });
  assert.equal(f.active, true);
  assert.deepEqual(f.category, { $in: ["c1"] });
  assert.deepEqual(f.variants, { $elemMatch: { available: { $ne: false } } });
});

test("filter never references stock quantity (on-demand printing)", () => {
  const json = JSON.stringify(buildProductFilter({ categoryIds: [], color: "Black", size: "M", search: "tee" }));
  assert.ok(!/stock|quantity|inventory/i.test(json));
});

test("empty category list matches nothing rather than everything", () => {
  assert.deepEqual(buildProductFilter({ categoryIds: [] }).category, { $in: [] });
});

test("featured flag is only added when provided", () => {
  assert.equal("featured" in buildProductFilter({ categoryIds: [] }), false);
  assert.equal(buildProductFilter({ categoryIds: [], featured: true }).featured, true);
});

test("search text is regex-escaped", () => {
  const f = buildProductFilter({ categoryIds: [], search: "a.*(b" });
  assert.equal(f.$and[0].$or[0].name.source, "a\\.\\*\\(b");
  assert.equal(escapeRegex("[x]+"), "\\[x\\]\\+");
});

test("every search word must match some field; words are split and capped", () => {
  const f = buildProductFilter({ categoryIds: [], search: "Black  hoodie" });
  assert.equal(f.$and.length, 2);
  assert.ok(f.$and[0].$or.some((c) => c["variants.color"]?.test("Black")));
  assert.deepEqual(parseSearchTerms("a b c d e f g"), ["a", "b", "c", "d", "e"]);
  assert.deepEqual(parseSearchTerms("   "), []);
  assert.equal("$and" in buildProductFilter({ categoryIds: [] }), false);
});

test("category-name matches are limited to allowed (active) categories", () => {
  const f = buildProductFilter({ categoryIds: ["c1"], search: "hoodie", searchCategoryIds: { hoodie: ["c1", "cX"] } });
  const cat = f.$and[0].$or.find((c) => c.category);
  assert.deepEqual(cat.category, { $in: ["c1"] });
});

test("color and size filters are case-insensitive exact matches", () => {
  const f = buildProductFilter({ categoryIds: [], color: "black", size: "xl" });
  assert.ok(f.variants.$elemMatch.color.test("Black"));
  assert.ok(!f.variants.$elemMatch.color.test("Blackish"));
  assert.ok(f.variants.$elemMatch.sizes.$elemMatch.size.test("XL"));
});

test("sort specs", () => {
  assert.equal(buildProductSort("price-asc").effectivePrice, 1);
  assert.equal(buildProductSort("price-desc").effectivePrice, -1);
  assert.equal(buildProductSort("newest").createdAt, -1);
  assert.equal(buildProductSort(undefined).sortOrder, 1);
});
