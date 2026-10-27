// Guest order lookup and "My orders". Persistence is injected (like paymentService), so the rules are unit-tested with fakes.
//
// Guest lookup = proof of TWO things only the buyer should know: the order reference AND the e-mail used at checkout. On success the server issues
// an expiring access token (random UUID; only its SHA-256 is stored; MongoDB deletes it when it expires). The token opens /order/<ref>/<token>.
// Failures are counted per order reference (hashed) whether or not the order exists, and every failure returns the SAME message, so neither the
// error text nor the throttle reveals which orders or e-mail addresses exist.
import crypto from "node:crypto";
import { ApiError } from "../utils/ApiError.js";
import { isOrderNumber } from "./checkoutInput.js";
import { customerOrderRow } from "./orderView.js";

export const LOOKUP_MAX_FAILURES = 8;               // per order reference ...
export const LOOKUP_WINDOW_MS = 15 * 60_000;        // ... per 15 minutes
export const ACCESS_TTL_MS = 14 * 24 * 3600_000;    // a lookup link works for 14 days
const sha = (t) => crypto.createHash("sha256").update(t).digest("hex");
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const GENERIC_NOT_FOUND = "We couldn't find an order matching those details. Check the order reference and the email address you used at checkout.";

// { value, errors } — format problems only; they say nothing about whether an order exists.
export function parseLookupInput(raw) {
  const errors = [];
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const orderNumber = typeof o.orderNumber === "string" ? o.orderNumber.trim().toUpperCase() : "";
  const email = typeof o.email === "string" ? o.email.trim().toLowerCase() : "";
  if (!isOrderNumber(orderNumber)) errors.push({ path: "orderNumber", message: "Enter your order reference, for example POK-261024-ABC123." });
  if (!email || email.length > 254 || !EMAIL.test(email)) errors.push({ path: "email", message: "Enter the email address you used at checkout." });
  return errors.length ? { value: null, errors } : { value: { orderNumber, email }, errors: [] };
}

export function createOrderAccessService({ repo, now = () => new Date(), log = () => {} }) {
  return {
    // -> { orderNumber, token, path, expiresAt }
    async lookup(input) {
      const orderNumber = String(input?.orderNumber ?? "").trim().toUpperCase(); // normalised here too: never depend on the caller
      const email = String(input?.email ?? "").trim().toLowerCase();
      const key = sha(`lookup:${orderNumber}`);
      if ((await repo.lookupFailures(key, now())) >= LOOKUP_MAX_FAILURES) {
        log("lookup_throttled", {}); // (no order reference or e-mail in the log)
        throw new ApiError(429, "TOO_MANY_ATTEMPTS", "Too many attempts. Please wait a few minutes and try again.");
      }
      const order = await repo.findOrderByNumber(orderNumber);
      const given = Buffer.from(sha(email)), expected = Buffer.from(order?.emailHash || sha("no-such-order")); // same work either way
      const ok = !!order && !!order.emailHash && given.length === expected.length && crypto.timingSafeEqual(given, expected);
      if (!ok) {
        await repo.recordLookupFailure(key, LOOKUP_WINDOW_MS, now());
        throw new ApiError(404, "ORDER_NOT_FOUND", GENERIC_NOT_FOUND);
      }
      const token = crypto.randomUUID();
      const expiresAt = new Date(now().getTime() + ACCESS_TTL_MS);
      await repo.createAccess({ orderId: order.id, tokenHash: sha(token), expiresAt });
      return { orderNumber: order.orderNumber, token, path: `/order/${order.orderNumber}/${token}`, expiresAt: expiresAt.toISOString() };
    },

    // Signed-in customer: only orders placed while signed in to THIS account.
    async listMine({ userId }) {
      if (!userId) throw new ApiError(401, "UNAUTHENTICATED", "Please sign in to continue.");
      return (await repo.listOrdersForUser(String(userId), 50)).map(customerOrderRow);
    },
  };
}
