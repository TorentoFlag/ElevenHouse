import { createLogger } from "@elevenhouse/observability";
import { createAes256GcmSecretCipher } from "@elevenhouse/auth";
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
import { createWorkerReadiness, createWorkerReadinessServer } from "./readiness";
import { createNotificationWorkerRuntimeConfig } from "./runtime-config";

const serviceName = "notification-worker";
const logger = createLogger("notification-worker");
const config = createNotificationWorkerRuntimeConfig();
const postgresRuntime = createPostgresRuntime();
const authCodeCipher = createAes256GcmSecretCipher(config.authCodeDeliveryEncryptionKey);
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
    authCodeCipher,
    delivery: deliveryProvider,
    now: new Date(),
    logger
  })
);
const readinessChecks = {
  postgres: async () => {
    await postgresRuntime.pool.query("select 1");
  },
  authCodeDeliveryQueue: async () => {
    await authCodeDeliveryQueue.waitUntilReady();
  },
  authCodeDeliveryWorker: async () => {
    await authCodeDeliveryWorker.waitUntilReady();
  }
};
const healthServer = createWorkerReadinessServer({
  getReadiness: () =>
    createWorkerReadiness({
      service: serviceName,
      checks: readinessChecks
    })
});

let relayTimer: ReturnType<typeof setInterval> | undefined;

function startRelay(): ReturnType<typeof setInterval> {
  const timer = setInterval(() => {
    relayPendingOutboxEvents({
      store: outboxStore,
      queue: authCodeDeliveryQueue,
      now: new Date(),
      batchSize: config.outboxRelayBatchSize,
      publishingLockTimeoutMs: config.outboxPublishingLockTimeoutMs,
      logger,
      queueOptions: {
        attempts: config.authCodeDeliveryAttempts,
        backoffMs: config.authCodeDeliveryBackoffMs
      }
    }).catch((error: unknown) => {
      logger.error("notification outbox relay failed", { error });
    });
  }, config.outboxRelayIntervalMs);

  timer.unref();
  return timer;
}

async function startup(): Promise<void> {
  const readiness = await createWorkerReadiness({
    service: serviceName,
    checks: readinessChecks
  });

  if (readiness.status !== "ready") {
    logger.error("notification worker dependencies are not ready", readiness);
    throw new Error("notification worker dependencies are not ready");
  }

  await listenHealthServer();
  relayTimer = startRelay();
  logger.info("notification worker ready", readiness);
}

async function shutdown(): Promise<void> {
  if (relayTimer) {
    clearInterval(relayTimer);
  }
  await closeHealthServer();
  await authCodeDeliveryWorker.close();
  await authCodeDeliveryQueue.close();
  await postgresRuntime.close();
}

function listenHealthServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    healthServer.once("error", reject);
    healthServer.listen(config.healthPort, config.healthHost, () => {
      healthServer.off("error", reject);
      logger.info("notification worker health server listening", {
        host: config.healthHost,
        port: config.healthPort
      });
      resolve();
    });
  });
}

function closeHealthServer(): Promise<void> {
  if (!healthServer.listening) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    healthServer.close((error) => (error ? reject(error) : resolve()));
  });
}

startup().catch((error: unknown) => {
  shutdown()
    .catch((shutdownError: unknown) => {
      logger.error("notification worker shutdown after startup failure failed", {
        error: shutdownError
      });
    })
    .finally(() => {
      logger.error("notification worker startup failed", { error });
      process.exit(1);
    });
});

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
