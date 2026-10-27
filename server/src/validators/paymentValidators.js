import { wrap } from "./wrap.js";
import { parseCheckoutInput, parseOrderAccess } from "../lib/checkoutInput.js";

export const payBody = wrap(parseCheckoutInput);       // POST /api/checkout/pay
export const orderAccessBody = wrap(parseOrderAccess);  // POST /api/orders/:orderNumber/payment-status | retry-payment
