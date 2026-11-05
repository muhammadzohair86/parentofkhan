import { ContactMessage } from "../models/ContactMessage.js";

// POST /api/contact  { name, email, subject, message, website }  -> 201 { status: "sent" }
// Stored in MongoDB and shown in Admin > Messages. Never logged (it is personal data). A filled-in hidden `website` field means a bot: the
// request is dropped without saving anything (the bot gets the same reply, so it cannot learn what tripped it).
export async function sendContact(req, res) {
  const { name, email, subject, message, website } = req.validated.body;
  if (website) return res.status(201).json({ success: true, data: { status: "sent" } });
  await ContactMessage.create({ name, email, subject, message });
  res.status(201).json({ success: true, data: { status: "sent" } });
}
