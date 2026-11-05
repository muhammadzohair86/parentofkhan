// Announcement bar settings. Pure (no I/O), so the rules are unit-tested. Colors are plain hex only (never arbitrary CSS) and the text is plain text.
export const ANNOUNCEMENT_DEFAULTS = Object.freeze({
  enabled: true,
  text: "FREE DELIVERY ALL OVER PAKISTAN",
  backgroundColor: "#151515", // the storefront's ink color
  textColor: "#f6f1e7",       // the storefront's paper color
});
export const ANNOUNCEMENT_MAX_TEXT = 120;
export const MIN_CONTRAST = 4.5; // WCAG AA for normal-size text

// "#abc" | "#aabbcc" (any case) -> "#aabbcc" (lowercase), anything else -> null
export function normalizeHex(v) {
  if (typeof v !== "string") return null;
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
  return `#${h.toLowerCase()}`;
}

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrastRatio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Control characters become spaces, whitespace collapses. Angle brackets are refused (the text is rendered as plain text, never as HTML).
export const cleanText = (v) => String(v ?? "").replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, " ").replace(/\s+/g, " ").trim();

// Admin input -> { value, errors:[{ path, message }] }
export function parseAnnouncementInput(raw) {
  const errors = [];
  const bad = (path, message) => errors.push({ path, message });
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { value: null, errors: [{ path: "", message: "Invalid request." }] };
  if (typeof raw.enabled !== "boolean") bad("enabled", "Choose whether the bar is shown.");
  const text = cleanText(raw.text);
  if (/[<>]/.test(text)) bad("text", "Use plain text only (no < or > characters).");
  if (text.length > ANNOUNCEMENT_MAX_TEXT) bad("text", `Keep the text to ${ANNOUNCEMENT_MAX_TEXT} characters or fewer.`);
  if (raw.enabled === true && !text) bad("text", "Enter the announcement text, or turn the bar off.");
  const backgroundColor = normalizeHex(raw.backgroundColor), textColor = normalizeHex(raw.textColor);
  if (!backgroundColor) bad("backgroundColor", "Choose a valid background color (a hex value such as #151515).");
  if (!textColor) bad("textColor", "Choose a valid text color (a hex value such as #f6f1e7).");
  if (backgroundColor && textColor && contrastRatio(backgroundColor, textColor) < MIN_CONTRAST) {
    bad("textColor", `The text color is too close to the background to read comfortably (contrast ${contrastRatio(backgroundColor, textColor).toFixed(1)}:1; at least ${MIN_CONTRAST}:1 is required). Pick a lighter or darker text color.`);
  }
  if (errors.length) return { value: null, errors };
  return { value: { enabled: raw.enabled, text, backgroundColor, textColor }, errors: [] };
}

// Stored document (possibly missing, or saved before this feature existed) -> the settings to use. Anything missing or invalid falls back to the default
// field by field, so a damaged record can never produce an unreadable or broken bar.
export function resolveAnnouncement(stored) {
  const d = ANNOUNCEMENT_DEFAULTS, a = stored && typeof stored === "object" ? stored : {};
  const text = typeof a.text === "string" ? cleanText(a.text).slice(0, ANNOUNCEMENT_MAX_TEXT) : d.text;
  let backgroundColor = normalizeHex(a.backgroundColor) || d.backgroundColor, textColor = normalizeHex(a.textColor) || d.textColor;
  if (contrastRatio(backgroundColor, textColor) < MIN_CONTRAST) { backgroundColor = d.backgroundColor; textColor = d.textColor; }
  return { enabled: typeof a.enabled === "boolean" ? a.enabled : d.enabled, text: /[<>]/.test(text) ? d.text : text, backgroundColor, textColor };
}
