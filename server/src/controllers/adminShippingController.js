import { ShippingDestination } from "../models/ShippingDestination.js";
import { ShippingSettings } from "../models/ShippingSettings.js";
import { getShippingSettings } from "../lib/shippingStore.js";
import { shape, buildSnapshot } from "../lib/shippingAdminView.js";
import { shapeSettings } from "../lib/shippingSettings.js";
import { countryName } from "../lib/countries.js";
import { ApiError } from "../utils/ApiError.js";

const autoName = (city, code) => [city, countryName(code)].filter(Boolean).join(", ");
const dupError = (name) => new ApiError(409, "DESTINATION_EXISTS", `A destination for ${name} already exists. Edit that entry instead of adding another.`, [{ path: "countryCode", message: "Already configured." }]);

const saveSettings = async (set) => {
  const update = { $set: set };
  const opts = { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true };
  try { return await ShippingSettings.findOneAndUpdate({ key: "shipping" }, update, opts).lean(); }
  catch (e) {
    if (e?.code !== 11000) throw e;
    return ShippingSettings.findOneAndUpdate({ key: "shipping" }, update, opts).lean(); // first-time saves raced: the second just updates
  }
};

export async function getShipping(_req, res) {
  res.set("Cache-Control", "no-store");
  const [settings, dests] = await Promise.all([getShippingSettings(), ShippingDestination.find({}).sort({ countryName: 1, displayName: 1 }).lean()]);
  res.json({ success: true, data: buildSnapshot(settings, dests) });
}

// PUT /admin/shipping/settings: the DOMESTIC section (+ the PKR/USD rate). Only the domestic.* keys and pkrPerUsd are written,
// so the international settings are never touched from here.
export async function updateSettings(req, res) {
  const { domestic: d, pkrPerUsd } = req.validated.body;
  const doc = await saveSettings({
    "domestic.enabled": d.enabled, "domestic.freeShipping": d.freeShipping, "domestic.name": d.name, "domestic.deliveryEstimate": d.deliveryEstimate,
    "domestic.packagingWeightKg": d.packagingWeightKg, "domestic.fixedCharge": d.fixedCharge, "domestic.additionalPerKg": d.additionalPerKg, pkrPerUsd,
  });
  const s = shapeSettings(doc);
  res.json({ success: true, data: { domestic: s.domestic, pkrPerUsd: s.pkrPerUsd, updatedAt: s.updatedAt } });
}

// PUT /admin/shipping/international-settings: the INTERNATIONAL section's Free Shipping switch + packaging weight.
export async function updateInternationalSettings(req, res) {
  const { freeShipping, packagingWeightKg } = req.validated.body;
  const doc = await saveSettings({ "international.freeShipping": freeShipping, "international.packagingWeightKg": packagingWeightKg });
  res.json({ success: true, data: { international: shapeSettings(doc).international } });
}

export async function createDestination(req, res) {
  const d = req.validated.body;
  const doc = new ShippingDestination({ ...d, countryName: countryName(d.countryCode), displayName: d.displayName || autoName(d.city, d.countryCode) });
  try { await doc.save(); }
  catch (e) { if (e?.code === 11000) throw dupError(autoName(d.city, d.countryCode)); throw e; }
  res.status(201).json({ success: true, data: shape(doc.toObject()) });
}

export async function updateDestination(req, res) {
  const { id } = req.validated.params;
  const d = req.validated.body; // partial: only what was sent
  const doc = await ShippingDestination.findById(id);
  if (!doc) throw new ApiError(404, "DESTINATION_NOT_FOUND", "Destination not found.");
  for (const [k, v] of Object.entries(d)) if (k !== "displayName") doc.set(k, v);
  if (d.countryCode) doc.countryName = countryName(d.countryCode);
  if (d.displayName !== undefined) doc.displayName = d.displayName || autoName(doc.city, doc.countryCode); // blank = regenerate
  try { await doc.save(); } // save() (not updateOne) so cityKey is recomputed and validators run
  catch (e) { if (e?.code === 11000) throw dupError(autoName(doc.city, doc.countryCode)); throw e; }
  res.json({ success: true, data: shape(doc.toObject()) });
}

export async function deleteDestination(req, res) {
  const doc = await ShippingDestination.findByIdAndDelete(req.validated.params.id).lean();
  if (!doc) throw new ApiError(404, "DESTINATION_NOT_FOUND", "Destination not found.");
  res.json({ success: true, data: null });
}
