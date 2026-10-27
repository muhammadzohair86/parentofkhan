// Parser for the "pay now" request. Pure (no zod/express), so the rules are unit-tested; validators/paymentValidators.js wraps it.
// Returns { value, errors:[{ path, message }] } and never throws. Messages are written for customers.
import { isCountryCode } from "./countries.js";
import { MAX_LINE_QTY, MAX_CART_LINES } from "./checkoutQuote.js";

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OBJECT_ID = /^[a-f\d]{24}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE = /^\+?[0-9][0-9 ()\-]{5,18}[0-9]$/;

export function parseCheckoutInput(raw) {
  if (!isObj(raw)) return { value: null, errors: [{ path: "", message: "Invalid request." }] };
  const errors = [];
  const bad = (path, message) => errors.push({ path, message });
  const str = (v, path, { label, min = 0, max, required = false }) => {
    if (v === undefined || v === null || (typeof v === "string" && v.trim() === "")) { if (required) bad(path, `Enter ${label}.`); return ""; }
    if (typeof v !== "string") { bad(path, "Enter text."); return ""; }
    const t = v.trim().replace(/\s+/g, " ");
    if (t.length < min) bad(path, `${label[0].toUpperCase()}${label.slice(1)} is too short.`);
    if (t.length > max) bad(path, `Keep ${label} to ${max} characters or fewer.`);
    return t;
  };

  // Doubles as the idempotency key AND the secret that lets the customer return to this order (only its hash is stored).
  const token = typeof raw.clientRequestId === "string" ? raw.clientRequestId.trim() : "";
  if (!UUID_V4.test(token)) bad("clientRequestId", "Your checkout session is invalid. Please reload the page and try again.");

  const items = [];
  if (!Array.isArray(raw.items) || raw.items.length < 1) bad("items", "Your cart is empty.");
  else if (raw.items.length > MAX_CART_LINES) bad("items", "Your cart has too many lines.");
  else raw.items.forEach((it, i) => {
    const p = `items.${i}`;
    if (!isObj(it) || typeof it.productId !== "string" || !OBJECT_ID.test(it.productId)) return bad(p, "An item in your cart is invalid.");
    if (typeof it.color !== "string" || !it.color.trim() || it.color.length > 40 || typeof it.size !== "string" || !it.size.trim() || it.size.length > 10) return bad(p, "An item in your cart is invalid.");
    if (!Number.isInteger(it.quantity) || it.quantity < 1 || it.quantity > MAX_LINE_QTY) return bad(p, `Quantity must be between 1 and ${MAX_LINE_QTY}.`);
    items.push({ productId: it.productId, color: it.color.trim(), size: it.size.trim(), quantity: it.quantity });
  });

  const country = typeof raw.country === "string" ? raw.country.trim().toUpperCase() : "";
  if (!isCountryCode(country)) bad("country", "Choose a country from the list.");

  const c = isObj(raw.customer) ? raw.customer : {};
  const customer = { name: str(c.name, "customer.name", { label: "your full name", min: 2, max: 80, required: true }), email: "", phone: "" };
  const email = str(c.email, "customer.email", { label: "your email address", max: 120, required: true }).toLowerCase();
  if (email && !EMAIL.test(email)) bad("customer.email", "Enter a valid email address.");
  customer.email = email;
  const phone = str(c.phone, "customer.phone", { label: "your phone number", max: 20 });
  if (phone && !PHONE.test(phone)) bad("customer.phone", "Enter a valid phone number, e.g. +92 300 1234567.");
  customer.phone = phone;

  const a = isObj(raw.address) ? raw.address : {};
  const address = {
    line1: str(a.line1, "address.line1", { label: "your address", min: 3, max: 120, required: true }),
    line2: str(a.line2, "address.line2", { label: "the address line", max: 120 }),
    city: str(a.city, "address.city", { label: "your city", min: 2, max: 80, required: true }),
    region: str(a.region, "address.region", { label: "the state / region", max: 80 }),
    postalCode: str(a.postalCode, "address.postalCode", { label: "the postal code", max: 20 }),
  };

  // The amounts the customer SAW. Optional; when present the server compares them with its own figures and refuses a difference.
  let submitted;
  if (raw.submitted !== undefined) {
    if (!isObj(raw.submitted)) bad("submitted", "Invalid request.");
    else {
      submitted = {};
      for (const k of ["shippingAmount", "subtotal", "total"]) {
        const v = raw.submitted[k];
        if (v === undefined) continue;
        if (typeof v !== "number" || !Number.isFinite(v)) bad(`submitted.${k}`, "Invalid amount."); else submitted[k] = v;
      }
    }
  }

  if (errors.length) return { value: null, errors };
  return { value: { clientRequestId: token.toLowerCase(), items, country, customer, address, submitted }, errors: [] };
}

// Body of the status / retry endpoints: just the order's access token.
export function parseOrderAccess(raw) {
  const t = isObj(raw) && typeof raw.token === "string" ? raw.token.trim() : "";
  return UUID_V4.test(t) ? { value: { token: t.toLowerCase() }, errors: [] } : { value: null, errors: [{ path: "token", message: "Invalid order link." }] };
}
export const isOrderNumber = (s) => typeof s === "string" && /^POK-\d{6}-[A-Z0-9]{6}$/.test(s);
