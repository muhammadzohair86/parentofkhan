import mongoose from "mongoose";

export const SUBSCRIBER_STATUSES = ["subscribed", "unsubscribed"];

const subscriberSchema = new mongoose.Schema(
  {
    // Normalized (trimmed + lower-cased). The unique index is what actually prevents duplicates.
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    status: { type: String, enum: SUBSCRIBER_STATUSES, default: "subscribed", index: true },
    consentAt: { type: Date, default: Date.now }, // when the visitor submitted the form with the consent notice shown
    unsubscribedAt: { type: Date, default: null },
    source: { type: String, trim: true, maxlength: 40, default: "footer" },
  },
  { timestamps: true }
);

export const Subscriber = mongoose.models.Subscriber || mongoose.model("Subscriber", subscriberSchema);
