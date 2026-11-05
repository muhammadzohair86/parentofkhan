// WhatsApp-assisted checkout. The order is created and SAVED first (same server-side pricing, shipping, validation and idempotency as every other
// checkout path); only then is a wa.me link built from the saved order. No payment session is created and nothing is ever marked paid here:
// payment instructions come from the store over WhatsApp and an admin verifies the payment by hand.
import { ApiError } from "../utils/ApiError.js";
import { buildOrderPricing } from "./checkoutQuote.js";
import { toMinor } from "./paymentRules.js";
import { countryName } from "./countries.js";
import { sha256, newOrderNumber, fingerprintOf } from "./paymentService.js";
import { buildWhatsappMessage, buildWhatsappUrl } from "./whatsapp.js";

export function createWhatsappCheckout({ repo, priceCart, number, now = () => new Date() }) {
  const enabled = !!number;
  // The link is only worth showing while the order is still waiting for the customer to message us.
  const linkFor = (doc) => (enabled && doc && doc.status === "pending" && (doc.payment?.status || "unpaid") === "unpaid" ? buildWhatsappUrl(number, buildWhatsappMessage(doc)) : null);

  return {
    enabled,
    linkFor,

    // POST /api/checkout/whatsapp. Same body as the (disabled) online checkout, including the idempotency token `clientRequestId`:
    // the same token always returns the same order, so double clicks and retries never create two orders.
    async start(input, { userId = null } = {}) {
      if (!enabled) throw new ApiError(503, "WHATSAPP_NOT_CONFIGURED", "WhatsApp checkout isn't available right now. Please try again later or contact us.");
      const tokenHash = sha256(input.clientRequestId);
      const fingerprint = fingerprintOf(input);
      let order = await repo.findOrderByTokenHash(tokenHash);
      if (!order) {
        // The server prices EVERYTHING (products, shipping, free shipping, currency conversion). Browser-claimed amounts are only compared.
        const quote = await priceCart({ items: input.items, destination: { country: input.country, city: input.address.city }, submitted: input.submitted });
        const pricing = buildOrderPricing(quote); // throws when no single-currency total can be computed: nothing is created
        const amountMinor = toMinor(pricing.total);
        if (!(amountMinor > 0)) throw new ApiError(422, "NOTHING_TO_PAY", "There is nothing to pay for this order.");
        for (let tries = 0; tries < 5 && !order; tries++) {
          try {
            order = await repo.createOrder({
              orderNumber: newOrderNumber(now()), tokenHash, fingerprint, userId,
              customer: input.customer,
              shippingAddress: { ...input.address, country: countryName(input.country) },
              items: quote.items.map((i) => ({ product: i.productId, slug: i.slug, name: i.name, color: i.color, size: i.size, sku: i.sku || "", image: i.image || null, unitPrice: i.unitPrice, quantity: i.quantity })),
              subtotal: pricing.subtotal, shipping: pricing.shipping, shippingDetails: pricing.shippingDetails, discount: 0, total: pricing.total, currency: pricing.currency,
              payment: { method: "whatsapp", provider: "whatsapp", environment: "", status: "unpaid", reference: "", amountMinor, currency: pricing.currency },
              placedNote: "Order placed via WhatsApp checkout; awaiting WhatsApp confirmation and payment.",
            });
          } catch (e) {
            if (e?.code !== "DUPLICATE_KEY") throw e;
            if (e.field === "checkoutTokenHash") { order = await repo.findOrderByTokenHash(tokenHash); break; } // a parallel identical request won the race
            // else the random order number collided: try another
          }
        }
        if (!order) throw new ApiError(500, "ORDER_CREATE_FAILED", "We couldn't save your order. Please try again.");
      }
      if (order.paymentMethod !== "whatsapp") throw new ApiError(409, "CHECKOUT_CHANGED", "Your checkout session is no longer valid. Please reload the page and try again.");
      if (order.fingerprint !== fingerprint) throw new ApiError(409, "CHECKOUT_CHANGED", "Your order details changed after the order was saved. Please review your order and try again.");
      const doc = await repo.findOrderDocById(order.id);
      return { orderNumber: order.orderNumber, total: order.total, currency: order.paymentCurrency, whatsappUrl: linkFor(doc), orderPath: `/order/${order.orderNumber}/${input.clientRequestId}` };
    },
  };
}
