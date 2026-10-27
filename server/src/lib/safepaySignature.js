import crypto from "node:crypto";

// Safepay webhook signatures (docs: "Verify HMAC signatures"):
//   header  X-SFPY-SIGNATURE = hex( HMAC-SHA512( webhook shared secret, payload ) )
// The docs' own example builds the payload as Buffer.from(JSON.stringify(parsedBody)), while "raw request data" is the natural input.
// The two are identical only when Safepay's JSON is compact, so we accept a match against EITHER the exact bytes received or the
// canonical re-serialisation. Both require knowing the secret, so this does not weaken verification.
export function verifyWebhookSignature(rawBody, signature, secret) {
  if (!secret || !Buffer.isBuffer(rawBody) || typeof signature !== "string") return false;
  const sig = signature.trim();
  if (!/^[a-f0-9]{128}$/i.test(sig)) return false; // SHA-512 hex is exactly 128 characters
  const given = Buffer.from(sig.toLowerCase(), "hex");
  const candidates = [rawBody];
  try { candidates.push(Buffer.from(JSON.stringify(JSON.parse(rawBody.toString("utf8"))))); } catch { /* not JSON: only the raw form can match */ }
  return candidates.some((payload) => {
    const expected = crypto.createHmac("sha512", secret).update(payload).digest();
    return expected.length === given.length && crypto.timingSafeEqual(expected, given); // constant-time compare
  });
}

// Test/support helper: how a correctly signed delivery looks.
export const signWebhookBody = (body, secret) => crypto.createHmac("sha512", secret).update(body).digest("hex");
