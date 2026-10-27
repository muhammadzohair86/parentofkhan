import { Subscriber } from "../models/Subscriber.js";

// POST /api/newsletter  { email }  (validated by zod before this runs, so nothing invalid is ever stored)
//   201 { status: "subscribed" }          new subscriber, or a previously unsubscribed one re-subscribing
//   200 { status: "already_subscribed" }  duplicate: not an error, nothing changed
// Emails are never logged here.
export async function subscribe(req, res) {
  const { email } = req.validated.body;
  try {
    await Subscriber.create({ email, source: "footer", consentAt: new Date() });
    return res.status(201).json({ success: true, data: { status: "subscribed" } });
  } catch (e) {
    if (e?.code !== 11000) throw e; // anything but "duplicate key" is a real failure
  }
  const existing = await Subscriber.findOne({ email });
  if (existing?.status === "unsubscribed") {
    existing.status = "subscribed";
    existing.unsubscribedAt = null;
    existing.consentAt = new Date();
    await existing.save();
    return res.status(201).json({ success: true, data: { status: "subscribed" } });
  }
  res.json({ success: true, data: { status: "already_subscribed" } });
}
