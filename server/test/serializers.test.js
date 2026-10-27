import test from "node:test";
import assert from "node:assert/strict";
import { serializeProduct, serializeCategory } from "../src/lib/serializers.js";

const category = { _id: "c1", name: "T-Shirts", slug: "t-shirts", active: true, showOnHomepage: true, showInNavbar: true, order: 1 };
const base = {
  _id: "p1", name: "Tee", slug: "tee", price: 29, salePrice: null, category,
  variants: [{ color: "Black", hex: "#151515", sizes: [{ size: "S", stock: 0 }, { size: "M", stock: 0 }], images: ["/f.jpg", "/b.jpg"] }],
};

test("zero-stock product serializes normally, with the sizes map the storefront expects", () => {
  const out = serializeProduct(base);
  assert.deepEqual(out.variants[0].sizes, { S: 0, M: 0 });
  assert.equal(out.id, "p1");
  assert.equal(out.categoryId, "c1");
  assert.equal(out.category.slug, "t-shirts");
  assert.equal(out.salePrice, null);
});

test("frontImage and backImage fall back to the first variant images", () => {
  const out = serializeProduct(base);
  assert.equal(out.frontImage, "/f.jpg");
  assert.equal(out.backImage, "/b.jpg");
  const explicit = serializeProduct({ ...base, frontImage: "/F.jpg", backImage: "/B.jpg" });
  assert.equal(explicit.frontImage, "/F.jpg");
  assert.equal(explicit.backImage, "/B.jpg");
});

test("missing back image is null", () => {
  const out = serializeProduct({ ...base, variants: [{ ...base.variants[0], images: ["/f.jpg"] }] });
  assert.equal(out.backImage, null);
});

test("explicitly unavailable variants are omitted; a product with none returns null", () => {
  const two = serializeProduct({ ...base, variants: [...base.variants, { color: "Sand", hex: "#cdbd9a", sizes: [{ size: "S", stock: 1 }], images: [], available: false }] });
  assert.equal(two.variants.length, 1);
  assert.equal(serializeProduct({ ...base, variants: [{ ...base.variants[0], available: false }] }), null);
});

test("category serializer exposes visibility flags", () => {
  const c = serializeCategory(category);
  assert.equal(c.showInNavbar, true);
  assert.equal(c.showOnHomepage, true);
});

test("a color with no images of its own falls back to the product front/back/gallery images", () => {
  const out = serializeProduct({ ...base, frontImage: "/F.jpg", backImage: "/B.jpg", galleryImages: ["/g.jpg"], variants: [{ ...base.variants[0], images: [] }] });
  assert.deepEqual(out.variants[0].images, ["/F.jpg", "/B.jpg", "/g.jpg"]);
});

test("a color's own images win over the product-level images", () => {
  const out = serializeProduct({ ...base, frontImage: "/F.jpg", backImage: "/B.jpg" });
  assert.deepEqual(out.variants[0].images, ["/f.jpg", "/b.jpg"]);
});

test("only the default color falls back to product-level images; other colors never borrow them", () => {
  const second = { color: "White", hex: "#fbfaf6", sizes: [{ size: "S", stock: 0 }], images: [] };
  const out = serializeProduct({ ...base, frontImage: "/F.jpg", backImage: "/B.jpg", variants: [{ ...base.variants[0], images: [] }, second] });
  assert.deepEqual(out.variants[0].images, ["/F.jpg", "/B.jpg"]);
  assert.deepEqual(out.variants[1].images, []);
});
