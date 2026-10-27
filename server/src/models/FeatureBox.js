import mongoose from "mongoose";
import { FEATURE_ICONS, MAX_ACTIVE_FEATURES } from "../lib/siteDefaults.js";

const featureBoxSchema = new mongoose.Schema(
  {
    // Stable id for seeded defaults (lets the seed be idempotent). Optional for admin-created boxes.
    key: { type: String, trim: true, lowercase: true, maxlength: 60, unique: true, sparse: true },
    title: { type: String, required: true, trim: true, maxlength: 60 },
    description: { type: String, trim: true, maxlength: 160, default: "" },
    icon: { type: String, enum: FEATURE_ICONS, default: "sparkles" }, // identifier; the storefront maps it to an icon
    order: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

featureBoxSchema.index({ active: 1, order: 1 });

// Backend limit: at most MAX_ACTIVE_FEATURES boxes may be active at once. Activating (or creating an active)
// box beyond that is rejected; deactivate another one first. Admin writes must use save()/create() so this runs
// (updateOne/findOneAndUpdate skip document validation).
featureBoxSchema.pre("validate", async function () {
  if (!this.active) return;
  if (!this.isNew && !this.isModified("active")) return;
  const others = await this.constructor.countDocuments({ active: true, _id: { $ne: this._id } });
  if (others >= MAX_ACTIVE_FEATURES) {
    const err = new mongoose.Error.ValidationError(this);
    err.addError("active", new mongoose.Error.ValidatorError({ path: "active", value: true, message: `At most ${MAX_ACTIVE_FEATURES} feature boxes can be active. Deactivate another first.` }));
    throw err;
  }
});

export const FeatureBox = mongoose.models.FeatureBox || mongoose.model("FeatureBox", featureBoxSchema);
