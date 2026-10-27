import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { isDbReady } from "./config/db.js";
import { requireDb } from "./middleware/requireDb.js";
import { notFound, errorHandler } from "./middleware/errorHandler.js";
import productRoutes from "./routes/productRoutes.js";
import categoryRoutes from "./routes/categoryRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import siteRoutes from "./routes/siteRoutes.js";
import newsletterRoutes from "./routes/newsletterRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import { shippingRoutes, checkoutRoutes } from "./routes/shippingRoutes.js";
import { paymentRoutes, webhookRoutes } from "./routes/paymentRoutes.js";
import { requireSameOrigin } from "./middleware/auth.js";
import { createStorage } from "./lib/storage.js";

export function createApp({ clientOrigins, isProd, trustProxy, uploadDir = "uploads", publicUploadBase = "", uploadMaxBytes = 5 * 1024 * 1024, payments = null }) {
  const app = express();
  if (trustProxy !== undefined) app.set("trust proxy", trustProxy); // needed behind a reverse proxy so rate limits see real client IPs
  app.use(helmet());
  // Exact origins only (never *), with credentials so the HttpOnly session cookie can be sent.
  app.use(cors({ origin: clientOrigins, credentials: true, methods: ["GET", "HEAD", "POST", "PATCH", "DELETE", "OPTIONS"], allowedHeaders: ["Content-Type", "Accept"] }));
  // Uploaded images (local disk). Served before the API rate limiter so image-heavy pages are never throttled.
  const storage = createStorage({ dir: uploadDir, publicBase: publicUploadBase });
  app.use("/api/uploads", (_req, res, next) => { res.set("Cross-Origin-Resource-Policy", "cross-origin"); next(); },
    express.static(storage.root, { index: false, dotfiles: "deny", maxAge: "7d", immutable: true }));

  // Safepay webhooks need the RAW request body to verify their signature, so this is mounted BEFORE express.json below
  // (and before the shared rate limiter: it has its own). If the database is down requireDb answers 503, which makes Safepay retry.
  if (payments) app.use("/api/webhooks", requireDb, webhookRoutes(payments));

  // Small bodies for the public API; admin forms (products with many variants) get a bigger JSON limit.
  const publicJson = express.json({ limit: "10kb" });
  const adminJson = express.json({ limit: "256kb" });
  app.use((req, res, next) => (req.path.startsWith("/api/admin") ? adminJson : publicJson)(req, res, next));
  app.use("/api", rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: "draft-7", legacyHeaders: false }));

  app.get("/api/health", (_req, res) => {
    const ok = isDbReady();
    res.status(ok ? 200 : 503).json({ success: ok, data: { status: ok ? "ok" : "degraded", db: ok ? "connected" : "disconnected" } });
  });

  app.use("/api/products", requireDb, productRoutes);
  app.use("/api/categories", requireDb, categoryRoutes);
  app.use("/api/site", requireDb, siteRoutes);
  app.use("/api/shipping", requireDb, shippingRoutes);
  app.use("/api/checkout", requireDb, requireSameOrigin(clientOrigins), checkoutRoutes);
  if (payments) {
    const pr = paymentRoutes({ ...payments, isProd });
    app.use("/api/payments", requireDb, pr.config);
    app.use("/api/checkout", requireDb, requireSameOrigin(clientOrigins), pr.checkout);
    app.use("/api/orders", requireDb, requireSameOrigin(clientOrigins), pr.orders);
  }
  app.use("/api/newsletter", requireDb, requireSameOrigin(clientOrigins), newsletterRoutes);
  // Admin API: every route inside is authenticated + permission-checked on the server (see routes/adminRoutes.js).
  app.use("/api/admin", requireDb, adminRoutes({ isProd, clientOrigins, uploadMaxBytes }));
  app.use("/api/auth", requireDb, requireSameOrigin(clientOrigins), authRoutes({ isProd }));

  app.use(notFound);
  app.use(errorHandler(isProd));
  return app;
}
