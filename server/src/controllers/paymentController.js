// HTTP layer for payments. All the logic lives in lib/paymentService.js.
const noStore = (res) => res.set("Cache-Control", "no-store");

export const paymentHandlers = (service, info, orderAccess) => ({
  // GET /api/payments/config : what the browser may know (never any key or secret)
  config: (_req, res) => { noStore(res); res.json({ success: true, data: info }); },

  // POST /api/checkout/pay : create the unpaid order + Safepay session, return the hosted-checkout URL
  pay: async (req, res) => {
    const data = await service.startCheckout(req.validated.body, { userId: req.user?._id ?? null });
    noStore(res); res.json({ success: true, data });
  },

  // POST /api/orders/:orderNumber/payment-status
  status: async (req, res) => {
    const data = await service.getStatus({ orderNumber: req.params.orderNumber, token: req.validated.body.token });
    noStore(res); res.json({ success: true, data });
  },

  // POST /api/orders/:orderNumber/retry-payment
  retry: async (req, res) => {
    const data = await service.retryPayment({ orderNumber: req.params.orderNumber, token: req.validated.body.token });
    noStore(res); res.json({ success: true, data });
  },

  // POST /api/orders/lookup : guest proves order reference + checkout e-mail, gets an expiring link
  lookup: async (req, res) => {
    const data = await orderAccess.lookup(req.validated.body);
    noStore(res); res.json({ success: true, data });
  },

  // GET /api/orders/mine (signed-in customers: their own orders only)
  mine: async (req, res) => {
    const data = await orderAccess.listMine({ userId: req.user?._id });
    noStore(res); res.json({ success: true, data });
  },
  // POST /api/orders/mine/:orderNumber/status | retry-payment (signed in; ownership is checked in the service)
  mineStatus: async (req, res) => {
    const data = await service.getStatusForUser({ orderNumber: req.params.orderNumber, userId: req.user?._id });
    noStore(res); res.json({ success: true, data });
  },
  mineRetry: async (req, res) => {
    const data = await service.retryPaymentForUser({ orderNumber: req.params.orderNumber, userId: req.user?._id });
    noStore(res); res.json({ success: true, data });
  },

  // POST /api/webhooks/safepay : the body is the RAW Buffer (see routes/paymentRoutes.js)
  webhook: async (req, res) => {
    const out = await service.handleWebhook({ rawBody: Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0), signature: req.get("x-sfpy-signature") });
    res.status(out.status).json(out.body);
  },
});
