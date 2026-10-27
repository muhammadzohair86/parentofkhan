import mongoose from "mongoose";
import { optionalImageUrl } from "../lib/imageUrl.js";

const paymentMethodSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    logoUrl: { type: String, trim: true, default: null, set: (v) => v || null, validate: optionalImageUrl },
    altText: { type: String, trim: true, maxlength: 120, default: "" },
    // Off by default: a method is only shown once the business explicitly enables it.
    active: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

paymentMethodSchema.index({ active: 1, order: 1 });

export const PaymentMethod = mongoose.models.PaymentMethod || mongoose.model("PaymentMethod", paymentMethodSchema);
