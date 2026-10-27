// Online payment (Safepay). The browser only ever talks to OUR server: it never sees a key or secret, and nothing it sends or reads
// from the URL is treated as proof of payment (the server asks Safepay).
import { apiGet, apiPost } from "./api.js";

// { enabled, provider: "safepay", environment: "sandbox", testMode: true }
export async function getPaymentConfig() {
  const { data } = await apiGet("/payments/config");
  return data;
}

// Creates the unpaid order + Safepay session on the server. -> { status: "redirect", orderNumber, redirectUrl } | { status: "paid", orderNumber }
export async function startPayment(payload) {
  const { data } = await apiPost("/checkout/pay", payload);
  return data;
}

// What really happened to an order's payment (the server checks with Safepay). The token is the private link token from the order URL.
export async function getPaymentStatus(orderNumber, token) {
  const { data } = await apiPost(`/orders/${encodeURIComponent(orderNumber)}/payment-status`, { token });
  return data;
}

export async function retryPayment(orderNumber, token) {
  const { data } = await apiPost(`/orders/${encodeURIComponent(orderNumber)}/retry-payment`, { token });
  return data;
}

// A random v4 UUID: it is both the idempotency key and the private link token for the order (the server stores only its hash).
export function newCheckoutToken() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const b = globalThis.crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// Only ever send the customer to Safepay's own hosts, even if a response were somehow tampered with.
export function isSafepayUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && (u.hostname === "getsafepay.com" || u.hostname.endsWith(".getsafepay.com"));
  } catch { return false; }
}

// ---- order tracking (after purchase) ----
// Guest: prove order reference + checkout email -> an expiring private link. Errors are deliberately generic (the server never says which part was wrong).
export async function lookupOrder({ orderNumber, email }) {
  const { data } = await apiPost("/orders/lookup", { orderNumber, email });
  return data; // { orderNumber, token, path, expiresAt }
}
// Signed-in customer: their own orders only.
export async function getMyOrders() {
  const { data } = await apiGet("/orders/mine");
  return data;
}
export async function getMyOrderStatus(orderNumber) {
  const { data } = await apiPost(`/orders/mine/${encodeURIComponent(orderNumber)}/status`, {});
  return data;
}
export async function retryMyPayment(orderNumber) {
  const { data } = await apiPost(`/orders/mine/${encodeURIComponent(orderNumber)}/retry-payment`, {});
  return data;
}
