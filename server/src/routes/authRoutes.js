import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { validate } from "../middleware/validate.js";
import { optionalAuth } from "../middleware/auth.js";
import { limiter } from "../lib/limiter.js";
import { signupBody, loginBody } from "../validators/authValidators.js";
import { signup, login, logout, me } from "../controllers/authController.js";

export default function authRoutes({ isProd }) {
  const router = Router();
  // Failed logins are what count toward the limit; successful ones do not.
  router.post("/login", limiter(15 * 60_000, 10, { skipSuccessfulRequests: true }), validate({ body: loginBody }), asyncHandler(login(isProd)));
  router.post("/signup", limiter(60 * 60_000, 10), validate({ body: signupBody }), asyncHandler(signup(isProd)));
  router.post("/logout", optionalAuth(isProd), asyncHandler(logout(isProd)));
  router.get("/me", optionalAuth(isProd), me);
  return router;
}
