import { apiPost } from "./api.js";

// POST /api/contact. Resolves only after the server has SAVED the message. Never auto-retried (the visitor presses the button again if it fails).
export async function sendContactMessage(payload) {
  const { data } = await apiPost("/contact", payload);
  return data;
}
