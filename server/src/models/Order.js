import mongoose from "mongoose";
import { ORDER_STATUSES } from "../lib/orderStatus.js";

// Orders are created by checkout (a later phase). Everything a customer bought is COPIED into the order
// (name, color, size, price, image) so later product edits or deletions never rewrite history.
const itemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", default: null },
    slug: { type: String, trim: true },
    name: { type: String, required: true, trim: true },
    color: { type: String, required: true, trim: true },
    size: { type: String, required: true, trim: true },
    sku: { type: String, trim: true, default: "" },
    image: { type: String, trim: true, default: null },
    unitPrice: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const historySchema = new mongoose.Schema(
  {
    // "status" (fulfilment move), "payment" (verified payment event) or "shipment" (tracking details). Entries saved before this field existed are status changes.
    kind: { type: String, enum: ["status", "payment", "shipment"], default: "status" },
    key: { type: String, trim: true }, // identifies an event so a repeated delivery can't add it twice (payment events)
    from: { type: String, enum: ORDER_STATUSES },
    to: { type: String, enum: ORDER_STATUSES, required() { return (this.kind || "status") === "status"; } },
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    byName: { type: String, default: "" },
    note: { type: String, trim: true, maxlength: 500, default: "" },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, required: true, unique: true, trim: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    customer: {
      name: { type: String, required: true, trim: true },
      email: { type: String, required: true, trim: true, lowercase: true },
      phone: { type: String, trim: true, default: "" },
    },
    shippingAddress: {
      line1: { type: String, required: true, trim: true },
      line2: { type: String, trim: true, default: "" },
      city: { type: String, required: true, trim: true },
      region: { type: String, trim: true, default: "" },
      postalCode: { type: String, trim: true, default: "" },
      country: { type: String, required: true, trim: true },
    },
    items: { type: [itemSchema], validate: (a) => a.length > 0 },
    subtotal: { type: Number, required: true, min: 0 },
    shipping: { type: Number, default: 0, min: 0 }, // the charge in the ORDER currency (kept as before)
    // Frozen copy of the shipping choice at order time (courier, destination, charge in its OWN currency, estimate), so later
    // admin rate changes never alter history. Written only from lib/checkoutQuote.js buildOrderPricing(); never from the browser.
    shippingDetails: {
      scope: { type: String, enum: ["domestic", "international"] },
      courier: { type: String, trim: true },
      destinationName: { type: String, trim: true },
      countryCode: { type: String, trim: true },
      city: { type: String, trim: true, default: "" },
      pricingMethod: { type: String, trim: true },
      amount: { type: Number, min: 0 },
      currency: { type: String, trim: true },
      deliveryEstimate: { type: String, trim: true, default: "" },
      freeShipping: { type: Boolean, default: false },
      billableWeightKg: { type: Number, default: null },
      exchangeRatePkrPerUsd: { type: Number, default: null },
    },
    discount: { type: Number, default: 0, min: 0 },
    total: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "USD" },
    // Payment is tracked separately from fulfilment. Changing the order status NEVER changes paymentStatus;
    // that field is only to be written by a payment integration (none exists yet).
    payment: {
      method: { type: String, trim: true, default: "" },
      status: { type: String, enum: ["unpaid", "paid", "failed", "refunded"], default: "unpaid" },
      reference: { type: String, trim: true, default: "" }, // the Safepay tracker that PAID the order
      provider: { type: String, trim: true, default: "" },
      environment: { type: String, enum: ["", "sandbox", "production"], default: "" }, // "sandbox" = test money: never counted as revenue
      amountMinor: { type: Number, min: 0 },   // the exact amount to be charged, in minor units (cents). Fixed when the order is created.
      currency: { type: String, trim: true },  // the currency of that amount (equals the order currency)
      paidAt: { type: Date, default: null },
    },
    // Idempotency + access: the SHA-256 of the random checkout token the customer's browser generated. The plain token is never stored.
    // The same token returns the same order (no duplicates); it is also what lets the customer come back to see/retry THIS order.
    checkoutTokenHash: { type: String, unique: true, sparse: true },
    checkoutFingerprint: { type: String },    // hash of the cart/address the token was first used with
    paymentLeaseUntil: { type: Date, default: null }, // short lock so two requests can't set up two payment sessions at once
    // Courier details are typed in by an admin when the parcel is dispatched (fulfilment is manual). Nothing here is ever generated.
    // internalNote is admin-only: it is never part of any customer-facing response.
    shipment: {
      carrier: { type: String, trim: true, maxlength: 60 },
      trackingNumber: { type: String, trim: true, maxlength: 60, default: "" },
      trackingUrl: { type: String, trim: true, maxlength: 500, default: "" },
      dispatchedAt: { type: Date, default: null },
      estimatedDelivery: { type: String, trim: true, maxlength: 80, default: "" },
      internalNote: { type: String, trim: true, maxlength: 500, default: "" },
    },
    status: { type: String, enum: ORDER_STATUSES, default: "pending", index: true },
    statusHistory: { type: [historySchema], default: [] },
  },
  { timestamps: true }
);

orderSchema.index({ createdAt: -1 });
orderSchema.index({ "customer.email": 1 });
orderSchema.index({ user: 1, createdAt: -1 }); // "My orders"

export const Order = mongoose.models.Order || mongoose.model("Order", orderSchema);
