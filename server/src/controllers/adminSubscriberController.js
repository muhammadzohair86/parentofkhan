import { Subscriber } from "../models/Subscriber.js";
import { escapeRegex } from "../lib/escapeRegex.js";
import { ApiError } from "../utils/ApiError.js";
import { csvLine } from "../lib/csv.js";

const shape = (s) => ({
  id: String(s._id), email: s.email, status: s.status, source: s.source,
  consentAt: s.consentAt, unsubscribedAt: s.unsubscribedAt, createdAt: s.createdAt, updatedAt: s.updatedAt,
});

// Mounted behind requireRole("admin") (see app.js). Never cached.
export async function listSubscribers(req, res) {
  const { status, q, page, limit } = req.validated.query;
  const filter = {};
  if (status) filter.status = status;
  if (q) filter.email = new RegExp(escapeRegex(q.toLowerCase()));
  const [items, total, byStatus] = await Promise.all([
    Subscriber.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Subscriber.countDocuments(filter),
    Subscriber.aggregate([{ $group: { _id: "$status", n: { $sum: 1 } } }]), // database-wide totals, independent of the filters
  ]);
  const counts = { subscribed: 0, unsubscribed: 0 };
  for (const r of byStatus) if (r._id in counts) counts[r._id] = r.n;
  res.set("Cache-Control", "no-store");
  res.json({ success: true, data: items.map(shape), meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)), counts: { all: counts.subscribed + counts.unsubscribed, ...counts } } });
}

export async function updateSubscriber(req, res) {
  const { status } = req.validated.body;
  const doc = await Subscriber.findByIdAndUpdate(
    req.validated.params.id,
    { status, unsubscribedAt: status === "unsubscribed" ? new Date() : null },
    { new: true, runValidators: true }
  ).lean();
  if (!doc) throw new ApiError(404, "SUBSCRIBER_NOT_FOUND", "Subscriber not found.");
  res.set("Cache-Control", "no-store");
  res.json({ success: true, data: shape(doc) });
}

export async function deleteSubscriber(req, res) {
  const doc = await Subscriber.findByIdAndDelete(req.validated.params.id).lean();
  if (!doc) throw new ApiError(404, "SUBSCRIBER_NOT_FOUND", "Subscriber not found.");
  res.json({ success: true, data: null });
}

// CSV of the stored subscribers (same filters as the list). Streams from a database cursor, so it works for any list size.
// Cells are protected against spreadsheet formula injection (see lib/csv.js).
export async function exportSubscribers(req, res) {
  const { status, q } = req.validated.query;
  const filter = {};
  if (status) filter.status = status;
  if (q) filter.email = new RegExp(escapeRegex(q.toLowerCase()));
  res.set({
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="subscribers-${new Date().toISOString().slice(0, 10)}.csv"`,
    "Cache-Control": "no-store",
  });
  res.write("\uFEFF" + csvLine(["Email", "Status", "Subscribed at", "Consent at", "Unsubscribed at", "Source"]));
  const iso = (d) => (d ? new Date(d).toISOString() : "");
  const cursor = Subscriber.find(filter).sort({ createdAt: -1, _id: -1 }).lean().cursor();
  let closed = false;
  res.on("close", () => { closed = true; });
  for await (const s of cursor) {
    if (closed) break;
    res.write(csvLine([s.email, s.status, iso(s.createdAt), iso(s.consentAt), iso(s.unsubscribedAt), s.source]));
  }
  res.end();
}
