import mongoose from "mongoose";

// Failed guest-lookup attempts, keyed by a HASH of the order number (so it works the same whether or not that order exists and
// never reveals which ones do). Rows expire by themselves.
const lookupThrottleSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    count: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
  },
  { versionKey: false }
);

export const LookupThrottle = mongoose.models.LookupThrottle || mongoose.model("LookupThrottle", lookupThrottleSchema);
