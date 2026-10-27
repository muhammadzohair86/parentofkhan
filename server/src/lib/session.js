import { randomBytes, createHash } from "node:crypto";

export const SESSION_COOKIE = "pok_session";
export const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000; // absolute lifetime: 14 days

// The browser holds the random token; the database holds only its SHA-256, so a leaked
// sessions collection cannot be replayed as cookies.
export const newToken = () => randomBytes(32).toString("base64url");
export const hashToken = (token) => createHash("sha256").update(String(token)).digest("hex");
