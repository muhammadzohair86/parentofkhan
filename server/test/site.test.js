import test from "node:test";
import assert from "node:assert/strict";
import { isImageUrl } from "../src/lib/imageUrl.js";
import { DEFAULT_FEATURES, FEATURE_ICONS, MAX_ACTIVE_FEATURES } from "../src/lib/siteDefaults.js";

test("image URLs: local public paths and https only", () => {
  for (const ok of ["/assets/hero/hero.jpg", "https://cdn.example.com/a.png?x=1"]) assert.equal(isImageUrl(ok), true, ok);
  for (const bad of ["//evil.com/x.jpg", "http://example.com/x.jpg", "javascript:alert(1)", "data:image/png;base64,AAAA", "/a b.jpg", "/\\evil.com", "", null, undefined, "x".repeat(501)])
    assert.equal(isImageUrl(bad), false, String(bad));
});

test("default feature boxes: unique keys, known icons, ordered, no unverified fabric claim", () => {
  assert.equal(DEFAULT_FEATURES.length, 3);
  assert.equal(new Set(DEFAULT_FEATURES.map((f) => f.key)).size, 3);
  for (const f of DEFAULT_FEATURES) { assert.ok(FEATURE_ICONS.includes(f.icon)); assert.ok(f.title.length <= 60 && f.description.length <= 160); }
  assert.deepEqual(DEFAULT_FEATURES.map((f) => f.order), [1, 2, 3]);
  assert.ok(!/cotton|100%/i.test(JSON.stringify(DEFAULT_FEATURES)));
});

test("the default feature set never exceeds the active-box cap", () => {
  assert.equal(MAX_ACTIVE_FEATURES, 3);
  assert.ok(DEFAULT_FEATURES.length <= MAX_ACTIVE_FEATURES);
});

import { parseCloudinaryUrl, parseLocalUploadUrl } from "../src/lib/cloudinaryUrl.js";
test("Cloudinary URL recognition: only plain upload URLs; everything else is left alone", () => {
  const ok = parseCloudinaryUrl("https://res.cloudinary.com/demo-cloud/image/upload/v1712345678/parent-of-khan/ab12cd.jpg");
  assert.deepEqual(ok, { cloudName: "demo-cloud", publicId: "parent-of-khan/ab12cd", ext: "jpg" });
  assert.equal(parseCloudinaryUrl("https://res.cloudinary.com/demo/image/upload/parent-of-khan/x.png")?.publicId, "parent-of-khan/x"); // no version
  for (const bad of ["/assets/products/a.jpg", "https://example.com/a.jpg", "http://res.cloudinary.com/demo/image/upload/v1/a.jpg",
    "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto/v1/a.jpg", // already transformed
    "https://res.cloudinary.com/demo/image/upload/f_auto/v1/a.jpg", "https://res.cloudinary.com/demo/image/upload/w_400/a.jpg", "https://res.cloudinary.com/demo/image/upload/c_fill/q_auto/v1/a.jpg",
    "https://res.cloudinary.com/demo/video/upload/v1/a.mp4", "https://res.cloudinary.com/demo/image/upload/v1/a.jpg?x=1", null, undefined, 5])
    assert.equal(parseCloudinaryUrl(bad), null, String(bad));
  assert.deepEqual(parseLocalUploadUrl("/api/uploads/" + "a".repeat(32) + ".png"), { name: "a".repeat(32) + ".png" });
  assert.deepEqual(parseLocalUploadUrl("https://api.example.com/api/uploads/" + "b".repeat(32) + ".webp"), { name: "b".repeat(32) + ".webp" });
  assert.equal(parseLocalUploadUrl("/api/uploads/../../etc/passwd"), null);
  assert.equal(parseLocalUploadUrl("/assets/products/x.jpg"), null);
});
