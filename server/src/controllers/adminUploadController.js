import { detectImage } from "../lib/imageSniff.js";
import { getMedia, saveImage } from "../lib/media.js";
import { ApiError } from "../utils/ApiError.js";

// The image is the raw request body (Content-Type image/jpeg|png|webp, limited by UPLOAD_MAX_MB: see routes).
// The type is decided from the file's own bytes. With Cloudinary configured it is uploaded by the backend SDK
// (signed with the API secret on the server); otherwise it is saved to local disk. Identical files are reused.
export async function uploadImage(req, res) {
  const buf = req.body;
  if (!Buffer.isBuffer(buf)) throw new ApiError(415, "UNSUPPORTED_TYPE", "Send a JPEG, PNG or WebP image (Content-Type image/jpeg, image/png or image/webp).");
  if (!buf.length) throw new ApiError(400, "EMPTY_FILE", "The image is empty.");
  const kind = detectImage(buf);
  if (!kind) throw new ApiError(415, "UNSUPPORTED_IMAGE", "That file is not a valid JPEG, PNG or WebP image.");
  let saved;
  try {
    saved = await saveImage(buf, kind, req.user?._id);
  } catch (e) {
    if (e instanceof ApiError) throw e;
    console.error("[upload] failed:", e?.message || "unknown error"); // never log credentials or file contents
    throw new ApiError(502, "UPLOAD_FAILED", "The image could not be stored. Please try again.");
  }
  res.status(201).json({ success: true, data: { url: saved.url, publicId: saved.publicId, provider: saved.provider, width: saved.width ?? null, height: saved.height ?? null, size: buf.length, type: kind.mime, reused: saved.reused } });
}

export function uploadConfig(_req, res) {
  const m = getMedia();
  res.json({ success: true, data: { provider: m?.provider || "local", maxBytes: m?.maxBytes || 5 * 1024 * 1024 } });
}
