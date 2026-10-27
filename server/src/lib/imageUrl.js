// Images are referenced by URL/path only (never stored as binary in MongoDB).
// Allowed: a site-relative public path ("/assets/..."), or an https:// URL. Rejects protocol-relative
// URLs ("//host"), backslashes, data: and javascript: URLs, and anything with whitespace.
const IMAGE_URL = /^(?:\/(?!\/)[^\s\\]*|https:\/\/[^\s]+)$/i;
export const isImageUrl = (v) => typeof v === "string" && v.length <= 500 && IMAGE_URL.test(v);
// Mongoose validator: empty/null is allowed (means "not set").
export const optionalImageUrl = { validator: (v) => v == null || v === "" || isImageUrl(v), message: "Must be a /public/path or an https:// image URL." };
