// Recognises a plain Cloudinary delivery URL that this app stored, e.g.
//   https://res.cloudinary.com/<cloud>/image/upload/v1712345678/parent-of-khan/<hash>.jpg
// and returns { cloudName, publicId }. Anything else (local paths, other hosts, URLs that already carry
// transformations) returns null, so such images are never rewritten.
const RX = /^https:\/\/res\.cloudinary\.com\/([a-z0-9_-]+)\/image\/upload\/(?:v\d+\/)?([A-Za-z0-9_\-/]+)\.([a-z0-9]{2,5})$/i;

export function parseCloudinaryUrl(url) {
  if (typeof url !== "string" || url.length > 500) return null;
  const m = RX.exec(url);
  if (!m) return null;
  // A path segment such as "f_auto", "w_400" or "c_fill" is a transformation, not part of a public ID.
  if (m[2].split("/").some((seg) => /^[a-z]{1,3}_/i.test(seg))) return null;
  return { cloudName: m[1], publicId: m[2], ext: m[3].toLowerCase() };
}

// (Client copy of server/src/lib/cloudinaryUrl.js. Keep the two in sync.)
// Local upload written by lib/storage.js: /api/uploads/<32 hex>.<ext> (optionally with a PUBLIC_UPLOAD_BASE_URL prefix).
export function parseLocalUploadUrl(url) {
  const m = typeof url === "string" ? /(?:^|\/)api\/uploads\/([a-f0-9]{32}\.(?:jpg|png|webp))$/.exec(url) : null;
  return m ? { name: m[1] } : null;
}
