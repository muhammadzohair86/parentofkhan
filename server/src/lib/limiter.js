import rateLimit from "express-rate-limit";

// Shared rate-limit factory with the API's standard JSON error shape.
export const limiter = (windowMs, limit, extra = {}, message = "Too many attempts. Please wait a while and try again.") =>
  rateLimit({
    windowMs, limit, standardHeaders: "draft-7", legacyHeaders: false, ...extra,
    handler: (_req, res) => res.status(429).json({ success: false, error: { code: "RATE_LIMITED", message } }),
  });
