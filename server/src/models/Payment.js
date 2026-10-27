import mongoose from "mongoose";

// One row per Safepay payment session (tracker) for an order. An order can have several (retries); at most one is ever "paid".
const paymentSchema = new mongoose.Schema(
  {
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true, index: true },
    orderNumber: { type: String, required: true, trim: true },
    provider: { type: String, default: "safepay" },
    environment: { type: String, enum: ["sandbox", "production"], required: true },
    tracker: { type: String, required: true, unique: true, trim: true }, // Safepay tracker token ("track_...")
    // What we asked Safepay to charge, in MINOR units (cents for USD). Verified against Safepay's own record before anything is marked paid.
    amountMinor: { type: Number, required: true, min: 1 },
    currency: { type: String, required: true, uppercase: true, trim: true },
    status: { type: String, enum: ["created", "pending", "paid", "failed", "cancelled", "expired", "refunded", "review"], default: "created", index: true },
    attempt: { type: Number, default: 1 },
    reason: { type: String, trim: true, maxlength: 80, default: "" }, // short machine reason, e.g. "amount_mismatch" (never free text from the card network)
    failure: { category: { type: String, default: "" }, code: { type: Number, default: null } },
    redirectedAt: { type: Date, default: null },
    lastCheckedAt: { type: Date, default: null },
    paidAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export const Payment = mongoose.models.Payment || mongoose.model("Payment", paymentSchema);
