import mongoose from "mongoose";

// One row per visitor, ever (hash of a random browser id): gives the all-time unique count.
const visitorSchema = new mongoose.Schema({
  hash: { type: String, required: true, unique: true },
  firstSeenDay: { type: String, required: true },
}, { timestamps: { createdAt: true, updatedAt: false } });

// One row per visitor per day: gives unique visitors for any day range. Old rows expire automatically (TTL).
const visitorDaySchema = new mongoose.Schema({
  day: { type: String, required: true },
  hash: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 400 },
});
visitorDaySchema.index({ day: 1, hash: 1 }, { unique: true });

// One row per day: page views.
const dailyStatSchema = new mongoose.Schema({
  day: { type: String, required: true, unique: true },
  pageViews: { type: Number, default: 0 },
});

export const Visitor = mongoose.models.Visitor || mongoose.model("Visitor", visitorSchema);
export const VisitorDay = mongoose.models.VisitorDay || mongoose.model("VisitorDay", visitorDaySchema);
export const DailyStat = mongoose.models.DailyStat || mongoose.model("DailyStat", dailyStatSchema);
