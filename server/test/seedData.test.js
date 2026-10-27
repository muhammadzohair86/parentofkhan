import test from "node:test";
import assert from "node:assert/strict";
import { seedCategories, seedProducts } from "../src/seed/seedData.js";

test("unique, well-formed slugs", () => {
  for (const list of [seedCategories, seedProducts]) {
    const slugs = list.map((x) => x.slug);
    assert.equal(new Set(slugs).size, slugs.length);
    for (const s of slugs) assert.match(s, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  }
});

test("every product references a known category", () => {
  const known = new Set(seedCategories.map((c) => c.slug));
  for (const p of seedProducts) assert.ok(known.has(p.categorySlug), p.slug);
});

test("valid USD prices, hex colors, sizes and front/back image paths", () => {
  for (const p of seedProducts) {
    assert.ok(p.price > 0 && Math.abs(p.price * 100 - Math.round(p.price * 100)) < 1e-6, p.slug);
    if (p.salePrice != null) assert.ok(p.salePrice < p.price, p.slug);
    assert.match(p.frontImage, /^\/assets\/products\//);
    assert.match(p.backImage, /^\/assets\/products\//);
    const colors = p.variants.map((v) => v.color);
    assert.equal(new Set(colors).size, colors.length);
    for (const v of p.variants) {
      assert.match(v.hex, /^#[0-9a-f]{6}$/i);
      assert.ok(v.sizes.length > 0);
      for (const s of v.sizes) assert.ok(Number.isInteger(s.stock) && s.stock >= 0);
    }
  }
});

test("seed includes inactive, zero-stock, archived-category and unavailable-variant cases", () => {
  const by = (s) => seedProducts.find((p) => p.slug === s);
  assert.equal(by("demo-inactive-tee").active, false);
  assert.ok(by("demo-tee-04").variants.every((v) => v.sizes.every((s) => s.stock === 0)));
  assert.equal(seedCategories.find((c) => c.slug === "demo-archived").active, false);
  assert.equal(by("demo-unavailable-tee").variants[0].available, false);
});
