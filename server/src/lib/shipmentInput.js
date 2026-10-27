// Validation of the shipment details an admin types in (carrier, tracking number, tracking URL, dispatch date, estimate, internal note).
// Pure; returns { value, errors:[{ path, message }] } and never throws. Only the fields that were SENT are returned (undefined = untouched,
// "" or null = clear). Nothing is ever generated here: tracking numbers are always typed by a person.
export const DEFAULT_CARRIER = "NLS Xpress";
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const TRACKING_NUMBER = /^[A-Za-z0-9][A-Za-z0-9 ._/-]{2,59}$/;

// https only; no embedded credentials; a real hostname (not localhost or an IP address); no spaces/control characters.
export function validTrackingUrl(raw) {
  if (typeof raw !== "string" || raw.length > 500 || /[\s\u0000-\u001f\u007f]/.test(raw)) return false;
  let u;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== "https:" || u.username || u.password) return false;
  const h = u.hostname.toLowerCase();
  if (!h.includes(".") || h === "localhost" || /^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.startsWith("[")) return false;
  return true;
}

export function parseShipmentInput(raw, { prefix = "" } = {}) {
  const at = (k) => `${prefix}${k}`;
  if (raw === undefined) return { value: {}, errors: [] };
  if (!isObj(raw)) return { value: null, errors: [{ path: prefix.replace(/\.$/, ""), message: "Invalid shipment details." }] };
  const errors = [], v = {};
  const bad = (k, message) => errors.push({ path: at(k), message });
  const str = (k, max) => { const x = raw[k]; if (x === undefined) return undefined; if (x === null) return ""; if (typeof x !== "string") { bad(k, "Enter text."); return undefined; } const t = x.trim().replace(/\s+/g, " "); if (t.length > max) bad(k, `Keep it to ${max} characters or fewer.`); return t; };

  const carrier = str("carrier", 60);
  if (carrier !== undefined) v.carrier = carrier || DEFAULT_CARRIER; // blank = back to the default
  const tn = str("trackingNumber", 60);
  if (tn !== undefined && !errors.some((e) => e.path === at("trackingNumber"))) { // (one message per field)
    if (tn && !TRACKING_NUMBER.test(tn)) bad("trackingNumber", "Use 3-60 letters, numbers, spaces, dots, dashes or slashes."); else v.trackingNumber = tn;
  }
  if (raw.trackingUrl !== undefined) {
    const u = raw.trackingUrl === null ? "" : typeof raw.trackingUrl === "string" ? raw.trackingUrl.trim() : null;
    if (u === null) bad("trackingUrl", "Enter a web address.");
    else if (u && !validTrackingUrl(u)) bad("trackingUrl", "Enter a full https:// web address (no spaces, no localhost or IP addresses).");
    else v.trackingUrl = u;
  }
  if (raw.dispatchedAt !== undefined) {
    const d = raw.dispatchedAt;
    if (d === null || d === "") v.dispatchedAt = null;
    else if (typeof d !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(`${d}T12:00:00Z`))) bad("dispatchedAt", "Use a date like 2026-10-24.");
    else if (Date.parse(`${d}T12:00:00Z`) > Date.now() + 36 * 3600_000) bad("dispatchedAt", "The dispatch date can't be in the future.");
    else v.dispatchedAt = new Date(`${d}T12:00:00.000Z`);
  }
  const est = str("estimatedDelivery", 80); if (est !== undefined) v.estimatedDelivery = est;
  const note = str("internalNote", 500); if (note !== undefined) v.internalNote = note;
  return { value: errors.length ? null : v, errors };
}

// The body of PATCH /orders/:id/status (status + optional note + optional shipment details + the two explicit confirmations).
export function parseStatusChangeInput(raw, statuses) {
  if (!isObj(raw)) return { value: null, errors: [{ path: "", message: "Invalid request." }] };
  const errors = [];
  if (!statuses.includes(raw.status)) errors.push({ path: "status", message: "Choose a valid status." });
  let note = "";
  if (raw.note !== undefined && raw.note !== null) { if (typeof raw.note !== "string") errors.push({ path: "note", message: "Enter text." }); else { note = raw.note.trim(); if (note.length > 500) errors.push({ path: "note", message: "Keep it to 500 characters or fewer." }); } }
  const flag = (k) => { if (raw[k] === undefined) return false; if (typeof raw[k] !== "boolean") { errors.push({ path: k, message: "Must be true or false." }); return false; } return raw[k]; };
  const allowWithoutTracking = flag("allowWithoutTracking"), acknowledgeUnpaid = flag("acknowledgeUnpaid");
  const ship = parseShipmentInput(raw.shipment, { prefix: "shipment." });
  errors.push(...ship.errors);
  if (errors.length) return { value: null, errors };
  return { value: { status: raw.status, note, shipment: ship.value || {}, allowWithoutTracking, acknowledgeUnpaid }, errors: [] };
}
