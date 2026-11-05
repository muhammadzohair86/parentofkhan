import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { validate } from "../middleware/validate.js";
import { limiter } from "../lib/limiter.js";
import { contactBody } from "../validators/contactValidators.js";
import { sendContact } from "../controllers/contactController.js";

// Submit-only: there is no public GET, so messages can never be read through the public API.
const router = Router();
router.post("/", limiter(10 * 60_000, 5, {}, "You've sent several messages already. Please try again in a few minutes."), validate({ body: contactBody }), asyncHandler(sendContact));
export default router;
