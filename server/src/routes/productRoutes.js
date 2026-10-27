import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { validate } from "../middleware/validate.js";
import { slugParams } from "../validators/common.js";
import { listProductsQuery, facetsQuery } from "../validators/productValidators.js";
import { getProducts, getFeaturedProducts, getProductBySlug, getFacets } from "../controllers/productController.js";

const router = Router();
router.get("/", validate({ query: listProductsQuery }), asyncHandler(getProducts));
// "/featured" and "/facets" must be registered before "/:slug" so it is never treated as a slug.
router.get("/featured", validate({ query: listProductsQuery }), asyncHandler(getFeaturedProducts));
router.get("/facets", validate({ query: facetsQuery }), asyncHandler(getFacets));
router.get("/:slug", validate({ params: slugParams }), asyncHandler(getProductBySlug));
export default router;
