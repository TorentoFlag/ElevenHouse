import { createLogger } from "@elevenhouse/observability";
import { createPostgresRuntime } from "@elevenhouse/db/runtime";
import { createDrizzleOutboxRelayStore } from "@elevenhouse/db/outbox";
import { createDrizzleAuthCodeDeliveryProcessingStore } from "@elevenhouse/db/notifications";
import {
  ChannelAuthCodeDeliveryProvider,
  EmailAuthCodeDeliveryProvider,
  SmsAuthCodeDeliveryProvider
} from "./auth-code-delivery.provider";
import {
  createAuthCodeDeliveryQueue,
  createAuthCodeDeliveryWorker
} from "./auth-code-delivery.queue";
import { processAuthCodeDeliveryJob } from "./auth-code-delivery.processor";
import { relayPendingOutboxEvents } from "./outbox-relay";
import { createWorkerReadiness } from "./readiness";
import { createNotificationWorkerRuntimeConfig } from "./runtime-config";

const logger = createLogger("notification-worker");
const config = createNotificationWorkerRuntimeConfig();
const postgresRuntime = createPostgresRuntime();
const authCodeDeliveryQueue = createAuthCodeDeliveryQueue(config.redisUrl);
const outboxStore = createDrizzleOutboxRelayStore(postgresRuntime.database);
const authCodeDeliveryStore = createDrizzleAuthCodeDeliveryProcessingStore(postgresRuntime.database);
const deliveryProvider = new ChannelAuthCodeDeliveryProvider(
  new EmailAuthCodeDeliveryProvider(config.authCodeEmailDelivery),
  new SmsAuthCodeDeliveryProvider(config.authCodeSmsDelivery)
);
const authCodeDeliveryWorker = createAuthCodeDeliveryWorker(config.redisUrl, (job) =>
  processAuthCodeDeliveryJob({
    job,
    store: authCodeDeliveryStore,
    delivery: deliveryProvider,
    now: new Date()
  })
);

const relayTimer = setInterval(() => {
  relayPendingOutboxEvents({
    store: outboxStore,
    queue: authCodeDeliveryQueue,
    now: new Date(),
    batchSize: config.outboxRelayBatchSize,
    publishingLockTimeoutMs: config.outboxPublishingLockTimeoutMs,
    queueOptions: {
      attempts: config.authCodeDeliveryAttempts,
      backoffMs: config.authCodeDeliveryBackoffMs
    }
  }).catch((error: unknown) => {
    logger.error("notification outbox relay failed", { error });
  });
}, config.outboxRelayIntervalMs);

relayTimer.unref();

logger.info("notification worker ready", createWorkerReadiness("notification-worker"));

async function shutdown(): Promise<void> {
  clearInterval(relayTimer);
  await authCodeDeliveryWorker.close();
  await authCodeDeliveryQueue.close();
  await postgresRuntime.close();
}

process.once("SIGINT", () => {
  shutdown()
    .then(() => process.exit(0))
    .catch((error: unknown) => {
      logger.error("notification worker shutdown failed", { error });
      process.exit(1);
    });
});

process.once("SIGTERM", () => {
  shutdown()
    .then(() => process.exit(0))
    .catch((error: unknown) => {
      logger.error("notification worker shutdown failed", { error });
      process.exit(1);
    });
});
