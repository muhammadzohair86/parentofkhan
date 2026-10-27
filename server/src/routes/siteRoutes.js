import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { getHero, getFeatures, getPaymentMethods } from "../controllers/siteController.js";

// Public, GET-only. There is deliberately no write route here; management comes in Phase 2 under /api/admin.
const router = Router();
router.get("/hero", asyncHandler(getHero));
router.get("/features", asyncHandler(getFeatures));
router.get("/payment-methods", asyncHandler(getPaymentMethods));
export default router;
