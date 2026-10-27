import mongoose from "mongoose";

// An expiring, revocable "key" to view ONE order, issued after a guest proves they know the order number AND the checkout email.
// Only the SHA-256 of the token is stored. MongoDB removes expired rows by itself (TTL index on expiresAt).
const orderAccessSchema = new mongoose.Schema(
  {
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

export const OrderAccess = mongoose.models.OrderAccess || mongoose.model("OrderAccess", orderAccessSchema);
