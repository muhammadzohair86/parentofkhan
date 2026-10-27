import express, { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { validate } from "../middleware/validate.js";
import { optionalAuth, requireAuth } from "../middleware/auth.js";
import { limiter } from "../lib/limiter.js";
import { payBody, orderAccessBody } from "../validators/paymentValidators.js";
import { lookupBody } from "../validators/orderValidators.js";
import { paymentHandlers } from "../controllers/paymentController.js";

// Customer-facing payment routes (all behind requireDb + requireSameOrigin in app.js).
export function paymentRoutes({ service, orderAccess, info, isProd }) {
  const h = paymentHandlers(service, info, orderAccess);

  const config = Router();                       // mounted at /api/payments
  config.get("/config", asyncHandler(h.config));

  const checkout = Router();                     // mounted at /api/checkout (next to the existing /quote)
  checkout.post("/pay", limiter(60_000, 10, {}, "Too many payment attempts. Please wait a minute and try again."), optionalAuth(isProd), validate({ body: payBody }), asyncHandler(h.pay));

  const orders = Router();                       // mounted at /api/orders
  // Guest lookup: the IP limiter here is the coarse layer; the per-order-reference throttle in orderAccessService is the fine one.
  orders.post("/lookup", limiter(15 * 60_000, 20, {}, "Too many attempts. Please wait a few minutes and try again."), validate({ body: lookupBody }), asyncHandler(h.lookup));
  // Signed-in customers: only their own orders (the service matches the order's account to req.user).
  orders.get("/mine", optionalAuth(isProd), requireAuth, asyncHandler(h.mine));
  orders.post("/mine/:orderNumber/status", optionalAuth(isProd), requireAuth, limiter(60_000, 60), asyncHandler(h.mineStatus));
  orders.post("/mine/:orderNumber/retry-payment", optionalAuth(isProd), requireAuth, limiter(60_000, 10, {}, "Too many payment attempts. Please wait a minute and try again."), asyncHandler(h.mineRetry));
  orders.post("/:orderNumber/payment-status", limiter(60_000, 60), validate({ body: orderAccessBody }), asyncHandler(h.status));
  orders.post("/:orderNumber/retry-payment", limiter(60_000, 10, {}, "Too many payment attempts. Please wait a minute and try again."), validate({ body: orderAccessBody }), asyncHandler(h.retry));

  return { config, checkout, orders };
}

// Server-to-server webhook. express.raw keeps the EXACT bytes Safepay sent, which signature verification needs, so this router must be
// mounted BEFORE the app-wide express.json (see app.js). No cookies, no CSRF/origin check: authenticity comes from the HMAC signature.
export function webhookRoutes({ service, info }) {
  const h = paymentHandlers(service, info);
  const r = Router();
  r.post("/safepay", limiter(60_000, 300), express.raw({ type: () => true, limit: "256kb" }), asyncHandler(h.webhook));
  return r;
}
