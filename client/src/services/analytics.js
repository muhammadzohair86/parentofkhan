import { apiPost } from "./api.js";

// Counts a storefront page view. Fire-and-forget: a failure is ignored (counting must never disturb shopping).
// The browser keeps one random id (no personal data) so the server can tell "100 views" from "40 different visitors".
// Skipped when the browser asks not to be tracked (Do Not Track / Global Privacy Control).
const KEY = "pok_vid";
let memoryId = null;
function visitorId() {
  try {
    let id = localStorage.getItem(KEY);
    if (!id) { id = crypto.randomUUID(); localStorage.setItem(KEY, id); }
    return id;
  } catch { return (memoryId ??= crypto.randomUUID()); } // storage blocked: this tab still counts as one visitor
}
export function trackPageView() {
  if (navigator.doNotTrack === "1" || navigator.globalPrivacyControl === true) return;
  try { apiPost("/analytics/visit", { vid: visitorId() }).catch(() => {}); } catch { /* ignore */ }
}
