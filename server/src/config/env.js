import "dotenv/config";
import { parseSafepayConfig } from "../lib/safepayConfig.js";

const PLACEHOLDER = /your_mongodb|<password>|<db_password>|<username>/i;

// Reads and validates backend configuration. Throws a clear, credential-free error.
export function loadEnv() {
  const nodeEnv = process.env.NODE_ENV || "development";
  const mongoUri = (process.env.MONGODB_URI || "").trim();

  if (!mongoUri) {
    throw new Error("MONGODB_URI is not set. Copy server/.env.example to server/.env and add your MongoDB Atlas connection string.");
  }
  if (!/^mongodb(\+srv)?:\/\//.test(mongoUri) || PLACEHOLDER.test(mongoUri)) {
    throw new Error("MONGODB_URI is a placeholder or not a valid MongoDB connection string (it must start with mongodb:// or mongodb+srv://). Paste your real Atlas string into server/.env.");
  }

  const port = Number(process.env.PORT || 5000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be a number between 1 and 65535.");

  const clientOrigins = (process.env.CLIENT_ORIGIN || "http://localhost:5173").split(",").map((s) => s.trim()).filter(Boolean);
  if (clientOrigins.some((o) => o === "*")) throw new Error("CLIENT_ORIGIN must list exact origins, not *.");

  // Set TRUST_PROXY=1 when the API sits behind one reverse proxy/load balancer (most hosts), so rate limiting
  // and secure cookies see the real client. Leave unset when the API is exposed directly.
  const tp = (process.env.TRUST_PROXY || "").trim();
  const trustProxy = tp === "" ? undefined : /^\d+$/.test(tp) ? Number(tp) : tp === "true" ? true : undefined;

  // Image uploads (local disk). UPLOAD_DIR is resolved relative to the server folder unless absolute.
  const uploadDir = (process.env.UPLOAD_DIR || "uploads").trim();
  const publicUploadBase = (process.env.PUBLIC_UPLOAD_BASE_URL || "").trim().replace(/\/$/, ""); // e.g. https://api.parentsofkhan.com
  if (publicUploadBase && !/^https:\/\/[^\s/]+$/.test(publicUploadBase)) throw new Error("PUBLIC_UPLOAD_BASE_URL must look like https://api.example.com (no path, no trailing slash).");

  // Image uploads. Max size is configurable (UPLOAD_MAX_MB, 0.5-20, default 5).
  const mb = Number.parseFloat(process.env.UPLOAD_MAX_MB || "5");
  const uploadMaxBytes = Math.round(Math.min(20, Math.max(0.5, Number.isFinite(mb) ? mb : 5)) * 1024 * 1024);

  // Cloudinary (optional). Set all three of the credentials, or none (then images use local disk as before).
  const cn = (process.env.CLOUDINARY_CLOUD_NAME || "").trim();
  const ck = (process.env.CLOUDINARY_API_KEY || "").trim();
  const cs = (process.env.CLOUDINARY_API_SECRET || "").trim();
  let cloudinary = null;
  if (cn || ck || cs) {
    if (!(cn && ck && cs)) throw new Error("Set all three of CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET (or none of them).");
    if (!/^[a-z0-9_-]+$/i.test(cn)) throw new Error("CLOUDINARY_CLOUD_NAME may only contain letters, numbers, hyphens and underscores.");
    const folder = (process.env.CLOUDINARY_FOLDER || "parent-of-khan").trim().replace(/^\/+|\/+$/g, "");
    if (!/^[a-z0-9_-]+(\/[a-z0-9_-]+)*$/i.test(folder)) throw new Error("CLOUDINARY_FOLDER may only contain letters, numbers, hyphens, underscores and slashes.");
    const dim = Number.parseInt(process.env.CLOUDINARY_MAX_DIMENSION || "2400", 10);
    cloudinary = { cloudName: cn, apiKey: ck, apiSecret: cs, folder, maxDimension: Math.min(6000, Math.max(800, Number.isFinite(dim) ? dim : 2400)) };
  }

  // Public URL of the STOREFRONT (where Safepay sends the customer back). Defaults to the first CLIENT_ORIGIN.
  const publicSiteUrl = (process.env.PUBLIC_SITE_URL || clientOrigins[0] || "").trim().replace(/\/$/, "");
  if (!/^https?:\/\/[^\s/]+$/.test(publicSiteUrl)) throw new Error("PUBLIC_SITE_URL must look like https://www.example.com (no path, no trailing slash). It defaults to the first CLIENT_ORIGIN.");

  // Safepay (SANDBOX ONLY in this build). Never throws: a missing/invalid setup just leaves online payment switched off, and the
  // reasons are reported by variable NAME at start-up. Secrets stay on the server and are never exposed.
  const safepay = parseSafepayConfig(process.env);

  return { nodeEnv, isProd: nodeEnv === "production", mongoUri, publicSiteUrl, safepay, port, clientOrigins, trustProxy, uploadDir, publicUploadBase, uploadMaxBytes, cloudinary };
}
