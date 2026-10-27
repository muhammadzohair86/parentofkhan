
import serverless from "serverless-http";

import { loadEnv } from "../../src/config/env.js";
import { connectDB } from "../../src/config/db.js";
import { createApp } from "../../src/app.js";
import {
  readMasterConfig,
  ensureMasterAdmin,
} from "../../src/lib/bootstrap.js";
import {
  ensureShippingDefaults,
  quoteCheckout,
} from "../../src/lib/shippingStore.js";
import { initMedia } from "../../src/lib/media.js";
import { createSafepayClient } from "../../src/lib/safepayClient.js";
import { publicPaymentInfo } from "../../src/lib/safepayConfig.js";
import { createPaymentService } from "../../src/lib/paymentService.js";
import { paymentRepo } from "../../src/lib/paymentRepo.js";
import { createOrderAccessService } from "../../src/lib/orderAccessService.js";

let initialization;
let serverlessHandler;

async function initialize() {
  const env = loadEnv();

  await connectDB(env.mongoUri);

  try {
    const config = readMasterConfig();

    if (config) {
      const result = await ensureMasterAdmin(config);

      if (result.status === "created") {
        console.log("[admin] Master admin created.");
      }
    }
  } catch (error) {
    console.error("[admin] Bootstrap skipped:", error.message);
  }

  await ensureShippingDefaults();

  const media = await initMedia(env);
  console.log(`[media] image storage: ${media.provider}`);

  const safepay = env.safepay.status === "enabled"
    ? createSafepayClient(env.safepay.config)
    : null;

  const paymentService = createPaymentService({
    repo: paymentRepo,
    safepay,
    config: env.safepay.config,
    publicSiteUrl: env.publicSiteUrl,
    diagnostics: !env.isProd,
    priceCart: quoteCheckout,
    log: (event, fields) =>
      console.error(`[payments] ${event} ${JSON.stringify(fields)}`),
  });

  const orderAccess = createOrderAccessService({
    repo: paymentRepo,
    log: (event, fields) =>
      console.error(`[orders] ${event} ${JSON.stringify(fields)}`),
  });

  const payments = {
    service: paymentService,
    orderAccess,
    info: publicPaymentInfo(env.safepay, {
      diagnostics: !env.isProd,
    }),
  };

  const app = createApp({
    ...env,
    payments,
  });

  serverlessHandler = serverless(app);
}

async function getHandler() {
  if (!initialization) {
    initialization = initialize().catch((error) => {
      initialization = null;
      throw error;
    });
  }

  await initialization;
  return serverlessHandler;
}

export const handler = async (event, context) => {
  const run = await getHandler();
  return run(event, context);
};