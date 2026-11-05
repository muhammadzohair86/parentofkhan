import { ContactMessage } from "../models/ContactMessage.js";
import { escapeRegex } from "../lib/escapeRegex.js";
import { ApiError } from "../utils/ApiError.js";

const shape = (m) => ({ id: String(m._id), name: m.name, email: m.email, subject: m.subject, message: m.message, status: m.status, createdAt: m.createdAt, updatedAt: m.updatedAt });

// Mounted behind requirePermission("messages.view" / "messages.manage"). Never cached.
export async function listMessages(req, res) {
  const { status, q, page, limit } = req.validated.query;
  const filter = {};
  if (status) filter.status = status;
  if (q) { const re = new RegExp(escapeRegex(q), "i"); filter.$or = [{ name: re }, { email: re }, { subject: re }, { message: re }]; }
  const [items, total, byStatus] = await Promise.all([
    ContactMessage.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    ContactMessage.countDocuments(filter),
    ContactMessage.aggregate([{ $group: { _id: "$status", n: { $sum: 1 } } }]),
  ]);
  const counts = { new: 0, read: 0, replied: 0 };
  for (const r of byStatus) if (r._id in counts) counts[r._id] = r.n;
  res.set("Cache-Control", "no-store");
  res.json({ success: true, data: items.map(shape), meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)), counts: { all: counts.new + counts.read + counts.replied, ...counts } } });
}

export async function updateMessage(req, res) {
  const doc = await ContactMessage.findByIdAndUpdate(req.validated.params.id, { status: req.validated.body.status }, { new: true, runValidators: true }).lean();
  if (!doc) throw new ApiError(404, "MESSAGE_NOT_FOUND", "Message not found.");
  res.set("Cache-Control", "no-store");
  res.json({ success: true, data: shape(doc) });
}

export async function deleteMessage(req, res) {
  const doc = await ContactMessage.findByIdAndDelete(req.validated.params.id).lean();
  if (!doc) throw new ApiError(404, "MESSAGE_NOT_FOUND", "Message not found.");
  res.json({ success: true, data: { id: String(doc._id) } });
}
