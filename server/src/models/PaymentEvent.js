import mongoose from "mongoose";

// Webhook deliveries already seen, keyed by Safepay's event token, so a repeated delivery is acknowledged without being applied twice.
// Only identifiers are stored: no payload, no customer or card data.
const paymentEventSchema = new mongoose.Schema(
  {
    token: { type: String, required: true, unique: true, trim: true },
    type: { type: String, required: true, trim: true },
    tracker: { type: String, trim: true, default: "" },
    processedAt: { type: Date, default: null },
    outcome: { type: String, trim: true, default: "" },
    createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 180 }, // housekeeping: forget after ~6 months
  },
  { versionKey: false }
);

export const PaymentEvent = mongoose.models.PaymentEvent || mongoose.model("PaymentEvent", paymentEventSchema);
