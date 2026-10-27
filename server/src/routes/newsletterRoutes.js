import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { validate } from "../middleware/validate.js";
import { limiter } from "../lib/limiter.js";
import { subscribeBody } from "../validators/newsletterValidators.js";
import { subscribe } from "../controllers/newsletterController.js";

// Submit-only: there is no public GET, so subscribers can never be listed or looked up.
const router = Router();
router.post("/", limiter(60 * 60_000, 10, {}, "Too many sign-up attempts. Please try again later."), validate({ body: subscribeBody }), asyncHandler(subscribe));
export default router;
