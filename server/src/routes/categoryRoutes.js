import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { validate } from "../middleware/validate.js";
import { slugParams } from "../validators/common.js";
import { listCategoriesQuery } from "../validators/categoryValidators.js";
import { getCategories, getCategoryBySlug } from "../controllers/categoryController.js";

const router = Router();
router.get("/", validate({ query: listCategoriesQuery }), asyncHandler(getCategories));
router.get("/:slug", validate({ params: slugParams }), asyncHandler(getCategoryBySlug));
export default router;
