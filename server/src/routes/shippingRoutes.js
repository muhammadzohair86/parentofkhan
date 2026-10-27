import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { validate } from "../middleware/validate.js";
import { limiter } from "../lib/limiter.js";
import { quoteBody } from "../validators/shippingValidators.js";
import { getCountries, getOptions, quote } from "../controllers/shippingController.js";

// Public routes. /api/shipping/* is read-only; /api/checkout/quote is a POST only because it carries the cart,
// it changes nothing and creates no order.
export const shippingRoutes = Router();
shippingRoutes.get("/countries", asyncHandler(getCountries));
shippingRoutes.get("/options", asyncHandler(getOptions));

export const checkoutRoutes = Router();
checkoutRoutes.post("/quote", limiter(60_000, 60, {}, "Too many requests. Please wait a moment."), validate({ body: quoteBody }), asyncHandler(quote));
