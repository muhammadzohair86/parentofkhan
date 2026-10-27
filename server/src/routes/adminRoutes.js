import express, { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { validate } from "../middleware/validate.js";
import { optionalAuth, requireStaff, requirePermission, requireAnyPermission, requireSameOrigin } from "../middleware/auth.js";
import { limiter } from "../lib/limiter.js";
import { logout } from "../controllers/authController.js";
import { adminLogin, adminMe, changeOwnPassword } from "../controllers/adminAuthController.js";
import { dashboard } from "../controllers/adminDashboardController.js";
import { listProducts, getProduct, createProduct, updateProduct, deleteProduct } from "../controllers/adminProductController.js";
import { listCategories, categoryOptions, createCategory, updateCategory, deleteCategory } from "../controllers/adminCategoryController.js";
import { listOrders, getOrder, updateOrderStatus, updateOrderShipment } from "../controllers/adminOrderController.js";
import { listTeam, createMember, updateMember } from "../controllers/adminTeamController.js";
import { uploadImage, uploadConfig } from "../controllers/adminUploadController.js";
import { getHeroSettings, updateHeroSettings } from "../controllers/adminSiteController.js";
import { listSubscribers, updateSubscriber, deleteSubscriber, exportSubscribers } from "../controllers/adminSubscriberController.js";
import { idParams, listSubscribersQuery, updateSubscriberBody, exportSubscribersQuery } from "../validators/adminValidators.js";
import { productCreateBody, productPatchBody, listAdminProductsQuery } from "../validators/adminProductValidators.js";
import { categoryCreateBody, categoryPatchBody, deleteCategoryQuery } from "../validators/adminCategoryValidators.js";
import { listOrdersQuery, updateOrderStatusBody, updateOrderShipmentBody } from "../validators/adminOrderValidators.js";
import { heroBody } from "../validators/adminSiteValidators.js";
import { mountShippingAdmin } from "./shippingAdminRoutes.js";
import { teamCreateBody, teamPatchBody, changePasswordBody, adminLoginBody } from "../validators/adminTeamValidators.js";

// EVERYTHING under /api/admin is protected on the server:
//   1. Origin check (state-changing requests must come from the site; a missing Origin is rejected)
//   2. session -> user is loaded from the database on every request
//   3. only active staff pass requireStaff, and then each route demands its own permission
// The only unauthenticated routes are login/logout/me (me answers "null" when signed out).
export default function adminRoutes({ isProd, clientOrigins, uploadMaxBytes }) {
  const r = Router();
  r.use(requireSameOrigin(clientOrigins, { strict: true }));
  r.use(optionalAuth(isProd));

  r.post("/auth/login", limiter(15 * 60_000, 10, { skipSuccessfulRequests: true }), validate({ body: adminLoginBody }), asyncHandler(adminLogin(isProd)));
  r.post("/auth/logout", asyncHandler(logout(isProd)));
  r.get("/auth/me", adminMe);

  r.use(requireStaff);
  r.post("/auth/password", limiter(15 * 60_000, 10), validate({ body: changePasswordBody }), asyncHandler(changeOwnPassword));
  r.get("/dashboard", asyncHandler(dashboard));

  // Products
  r.get("/products", requirePermission("products.view"), validate({ query: listAdminProductsQuery }), asyncHandler(listProducts));
  r.get("/products/:id", requirePermission("products.view"), validate({ params: idParams }), asyncHandler(getProduct));
  r.post("/products", requirePermission("products.create"), validate({ body: productCreateBody }), asyncHandler(createProduct));
  r.patch("/products/:id", requirePermission("products.edit"), validate({ params: idParams, body: productPatchBody }), asyncHandler(updateProduct));
  r.delete("/products/:id", requirePermission("products.delete"), validate({ params: idParams }), asyncHandler(deleteProduct));

  // Categories
  r.get("/categories/options", requireAnyPermission("categories.view", "products.create", "products.edit"), asyncHandler(categoryOptions));
  r.get("/categories", requirePermission("categories.view"), asyncHandler(listCategories));
  r.post("/categories", requirePermission("categories.create"), validate({ body: categoryCreateBody }), asyncHandler(createCategory));
  r.patch("/categories/:id", requirePermission("categories.edit"), validate({ params: idParams, body: categoryPatchBody }), asyncHandler(updateCategory));
  r.delete("/categories/:id", requirePermission("categories.delete"), validate({ params: idParams, query: deleteCategoryQuery }), asyncHandler(deleteCategory));

  // Image uploads: raw image bytes as the body (size limit from UPLOAD_MAX_MB). Stored on Cloudinary when configured,
  // otherwise on local disk. Allowed for anyone who can create/edit products or categories or edit the homepage.
  const uploaders = ["products.create", "products.edit", "categories.create", "categories.edit", "site.edit"];
  r.get("/uploads/config", requireAnyPermission(...uploaders), uploadConfig);
  r.post("/uploads",
    requireAnyPermission(...uploaders),
    limiter(10 * 60_000, 200, {}, "Too many uploads. Please wait a few minutes."),
    express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: uploadMaxBytes }),
    asyncHandler(uploadImage));

  // Homepage hero images
  r.get("/site/hero", requirePermission("site.view"), asyncHandler(getHeroSettings));
  r.put("/site/hero", requirePermission("site.edit"), validate({ body: heroBody }), asyncHandler(updateHeroSettings));

  // Shipping settings (domestic + international destinations): routes and their permission checks live in shippingAdminRoutes.js
  mountShippingAdmin(r);

  // Orders
  r.get("/orders", requirePermission("orders.view"), validate({ query: listOrdersQuery }), asyncHandler(listOrders));
  r.get("/orders/:id", requirePermission("orders.view"), validate({ params: idParams }), asyncHandler(getOrder));
  r.patch("/orders/:id/status", requirePermission("orders.update"), validate({ params: idParams, body: updateOrderStatusBody }), asyncHandler(updateOrderStatus));
  r.patch("/orders/:id/shipment", requirePermission("orders.update"), validate({ params: idParams, body: updateOrderShipmentBody }), asyncHandler(updateOrderShipment));

  // Team
  r.get("/team", requirePermission("team.view"), asyncHandler(listTeam));
  r.post("/team", requirePermission("team.manage"), validate({ body: teamCreateBody }), asyncHandler(createMember));
  r.patch("/team/:id", requirePermission("team.manage"), validate({ params: idParams, body: teamPatchBody }), asyncHandler(updateMember));

  // Newsletter subscribers (API from the previous phase, now permission-based)
  r.get("/subscribers/export", requirePermission("newsletter.view"), validate({ query: exportSubscribersQuery }), asyncHandler(exportSubscribers));
  r.get("/subscribers", requirePermission("newsletter.view"), validate({ query: listSubscribersQuery }), asyncHandler(listSubscribers));
  r.patch("/subscribers/:id", requirePermission("newsletter.manage"), validate({ params: idParams, body: updateSubscriberBody }), asyncHandler(updateSubscriber));
  r.delete("/subscribers/:id", requirePermission("newsletter.manage"), validate({ params: idParams }), asyncHandler(deleteSubscriber));

  return r;
}
