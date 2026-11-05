// WhatsApp Click-to-Chat helpers (free wa.me links; no WhatsApp Business API, no paid messaging). Pure: no I/O.

// WHATSAPP_BUSINESS_NUMBER must be international format, digits only (country code first, no "+", no leading 0, no spaces), e.g. 923001234567.
// -> { status: "ready", number } | { status: "unset" } | { status: "invalid", problem }
export function parseWhatsappNumber(raw) {
  const v = String(raw ?? "").trim();
  if (!v || /^(your[_-]|<|changeme|replace|example|x+$)/i.test(v)) return { status: "unset" };
  if (!/^[1-9]\d{7,14}$/.test(v)) {
    return { status: "invalid", problem: "WHATSAPP_BUSINESS_NUMBER must be digits only in international format, 8-15 digits, country code first, no +, spaces or leading 0 (Pakistan example: 923001234567)." };
  }
  return { status: "ready", number: v };
}

const clean = (s) => String(s ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
const usd = (n) => `$${(Math.round(Number(n) * 100) / 100).toFixed(2)}`;
const pkr = (n) => `PKR ${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n)}`;

function shippingText(order) {
  const sd = order.shippingDetails;
  if (sd?.courier) {
    if (sd.freeShipping || sd.amount === 0) return "Free Shipping";
    return sd.currency === "USD" ? usd(sd.amount) : sd.currency === "PKR" ? pkr(sd.amount) : `${sd.amount} ${sd.currency}`;
  }
  return Number(order.shipping) > 0 ? usd(order.shipping) : "Free Shipping";
}

// Builds the pre-filled message from the SAVED order only. It holds the order reference, items (size/color/quantity), shipping and total.
// It deliberately never contains e-mail, phone, street address, tokens or any payment/secret data.
// `maxEncodedChars` keeps the final URL within what WhatsApp links reliably handle; long carts are shortened, never silently cut mid-line.
export function buildWhatsappMessage(order, { maxEncodedChars = 1500 } = {}) {
  const items = (order.items || []).map((i) => ({ name: clean(i.name), color: clean(i.color), size: clean(i.size), qty: i.quantity }));
  const head = "Hello Parent Of Khan! I'd like to confirm my order and get the payment instructions.";
  const tail = [
    `Subtotal: ${usd(order.subtotal)}`,
    `Shipping: ${shippingText(order)}`,
    `Total: ${usd(order.total)} ${order.currency || "USD"}`,
    "",
    "Please confirm my order and tell me how to pay. Thank you!",
  ];
  const build = (lines, extra = []) => [head, "", `Order: ${order.orderNumber}`, "Items:", ...lines, ...extra, "", ...tail].join("\n");
  const full = items.map((i) => `- ${i.qty} x ${i.name} (${i.color}, ${i.size})`);
  if (encodeURIComponent(build(full)).length <= maxEncodedChars) return build(full);
  // Too long: keep as many whole item lines as fit and say how many more there are (the order reference identifies everything).
  const kept = [];
  for (const line of full) {
    const left = items.length - (kept.length + 1);
    const trial = build([...kept, line], left > 0 ? [`- ...and ${left} more item${left === 1 ? "" : "s"} (see order ${order.orderNumber})`] : []);
    if (encodeURIComponent(trial).length > maxEncodedChars) break;
    kept.push(line);
  }
  const more = items.length - kept.length;
  return build(kept, more > 0 ? [`- ...and ${more} more item${more === 1 ? "" : "s"} (see order ${order.orderNumber})`] : []);
}

export const buildWhatsappUrl = (number, message) => `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
