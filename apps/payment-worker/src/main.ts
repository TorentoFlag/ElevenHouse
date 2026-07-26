import {
  createBasicWorkerReadinessServer,
  createLogger,
  createReadinessResponse,
  listenReadinessServer,
  serializeError
} from "@elevenhouse/observability";
import {
  createDrizzleCapturedSaleUnitOfWork,
  createDrizzleHoldReleaseStore,
  createDrizzleOrderStore,
  createDrizzlePaymentStore,
  createDrizzleTerminalPaymentUnitOfWork
} from "@elevenhouse/db/finance";
import { createPostgresRuntime } from "@elevenhouse/db/runtime";
import { createArcPayPaymentAttemptResolver } from "./arc-pay/arc-pay-payment-reader";
import {
  createHoldReleaseProcessor,
  startHoldReleaseInterval
} from "./holds/hold-release.processor";
import { createPaymentWorkerRuntimeConfig } from "./runtime-config";
import {
  createPaymentWebhookHandler,
  createPaymentWebhookServer
} from "./webhooks/payment-webhook.server";
import { createPaymentWebhookProcessor } from "./webhooks/payment-webhook.processor";

const service = "payment-worker";
const logger = createLogger(service);

async function startPaymentWorker(): Promise<void> {
  const config = createPaymentWorkerRuntimeConfig();
  const postgresRuntime = createPostgresRuntime();
  const paymentStore = createDrizzlePaymentStore(postgresRuntime.database);
  const processor = createPaymentWebhookProcessor({
    paymentStore,
    orderStore: createDrizzleOrderStore(postgresRuntime.database),
    capturedSale: createDrizzleCapturedSaleUnitOfWork(postgresRuntime.database),
    terminalPayment: createDrizzleTerminalPaymentUnitOfWork(postgresRuntime.database),
    resolvePaymentAttemptId: createArcPayPaymentAttemptResolver(config.arcPay)
      .resolvePaymentAttemptId
  });
  const webhookServer = createPaymentWebhookServer({
    handler: createPaymentWebhookHandler({
      webhookSecret: config.arcPay.webhookSecret,
      timestampToleranceSeconds: config.arcPay.timestampToleranceSeconds,
      processor
    })
  });
  const readinessServer = createBasicWorkerReadinessServer({ service });

  await listenReadinessServer({
    server: readinessServer,
    host: config.healthHost,
    port: config.healthPort
  });
  await listenServer(webhookServer, config.webhookHost, config.webhookPort);
  startHoldReleaseInterval({
    processor: createHoldReleaseProcessor({
      store: createDrizzleHoldReleaseStore(postgresRuntime.database),
      limit: config.holdRelease.batchSize,
      commandTtlMs: config.holdRelease.commandTtlMs
    }),
    intervalMs: config.holdRelease.intervalMs,
    onResult: (result) => {
      if (result.released > 0 || result.replayed > 0) {
        logger.info("captured sale holds release tick completed", result);
      }
    },
    onError: (error) => {
      logger.error("captured sale holds release tick failed", { error: serializeError(error) });
    }
  });

  logger.info("payment worker ready", {
    ...createReadinessResponse(service),
    healthHost: config.healthHost,
    healthPort: config.healthPort,
    webhookHost: config.webhookHost,
    webhookPort: config.webhookPort,
    holdReleaseIntervalMs: config.holdRelease.intervalMs,
    holdReleaseBatchSize: config.holdRelease.batchSize
  });
}

function listenServer(
  server: import("node:http").Server,
  host: string,
  port: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
}

startPaymentWorker().catch((error: unknown) => {
  logger.error("payment worker readiness server failed", { error: serializeError(error) });
  process.exit(1);
});
