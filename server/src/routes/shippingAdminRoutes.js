import { asyncHandler } from "../middleware/asyncHandler.js";
import { validate } from "../middleware/validate.js";
import { requirePermission } from "../middleware/auth.js";
import { idParams } from "../validators/adminValidators.js";
import { shippingSettingsBody, internationalSettingsBody, destinationCreateBody, destinationPatchBody } from "../validators/shippingValidators.js";
import { getShipping, updateSettings, updateInternationalSettings, createDestination, updateDestination, deleteDestination } from "../controllers/adminShippingController.js";

// Mounted by routes/adminRoutes.js AFTER requireStaff. Every route demands its own permission on the server:
// shipping.view to read, shipping.edit for ANY change (hiding buttons in the UI is never the protection).
export function mountShippingAdmin(r) {
  r.get("/shipping", requirePermission("shipping.view"), asyncHandler(getShipping));
  r.put("/shipping/settings", requirePermission("shipping.edit"), validate({ body: shippingSettingsBody }), asyncHandler(updateSettings));
  r.put("/shipping/international-settings", requirePermission("shipping.edit"), validate({ body: internationalSettingsBody }), asyncHandler(updateInternationalSettings));
  r.post("/shipping/destinations", requirePermission("shipping.edit"), validate({ body: destinationCreateBody }), asyncHandler(createDestination));
  r.patch("/shipping/destinations/:id", requirePermission("shipping.edit"), validate({ params: idParams, body: destinationPatchBody }), asyncHandler(updateDestination));
  r.delete("/shipping/destinations/:id", requirePermission("shipping.edit"), validate({ params: idParams }), asyncHandler(deleteDestination));
}
