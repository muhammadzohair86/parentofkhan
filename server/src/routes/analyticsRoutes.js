import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { validate } from "../middleware/validate.js";
import { limiter } from "../lib/limiter.js";
import { visitBody } from "../validators/contactValidators.js";
import { recordVisit } from "../controllers/analyticsController.js";

const router = Router();
router.post("/visit", limiter(60_000, 120, {}, "Too many requests."), validate({ body: visitBody }), asyncHandler(recordVisit));
export default router;
