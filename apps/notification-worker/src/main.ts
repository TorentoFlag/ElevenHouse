import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { createLogger } from "@elevenhouse/observability";
import { createAes256GcmSecretCipher } from "@elevenhouse/auth";
import { createPostgresRuntime } from "@elevenhouse/db/runtime";
import { createDrizzleOutboxRelayStore } from "@elevenhouse/db/outbox";
import {
  createDrizzleMessagingStore,
  createDrizzleMessagingDeliveryProcessingStore,
  createDrizzleMessagingMediaIngestionProcessingStore,
  createDrizzleTelegramMtprotoSessionProcessingStore
} from "@elevenhouse/db/messaging";
import { createDrizzleAuthCodeDeliveryProcessingStore } from "@elevenhouse/db/notifications";
import {
  ChannelAuthCodeDeliveryProvider,
  DevConsoleAuthCodeDeliveryProvider,
  EmailAuthCodeDeliveryProvider,
  SmsAuthCodeDeliveryProvider,
  type AuthCodeDeliveryProvider
} from "./auth-code-delivery.provider";
import {
  createAuthCodeDeliveryQueue,
  createAuthCodeDeliveryWorker
} from "./auth-code-delivery.queue";
import { processAuthCodeDeliveryJob } from "./auth-code-delivery.processor";
import { HttpInstagramGraphDeliveryProvider } from "./instagram-graph-delivery-provider";
import { relayPendingOutboxEvents } from "./outbox-relay";
import {
  createMessagingDeliveryQueue,
  createMessagingDeliveryWorker
} from "./messaging-delivery.queue";
import { processMessagingDeliveryJob } from "./messaging-delivery.processor";
import type { MessagingDeliveryProviders } from "./messaging-delivery.processor";
import { relayPendingMessagingOutboxEvents } from "./messaging-delivery.outbox-relay";
import {
  createMessagingMediaIngestionQueue,
  createMessagingMediaIngestionWorker
} from "./messaging-media-ingestion.queue";
import { processMessagingMediaIngestionJob } from "./messaging-media-ingestion.processor";
import { relayPendingMessagingMediaIngestions } from "./messaging-media-ingestion.relay";
import { TelegramBusinessMediaProvider } from "./messaging-media-ingestion.provider";
import { createS3MessagingMediaObjectStorage } from "./messaging-media-ingestion.storage";
import { createWorkerReadiness, createWorkerReadinessServer } from "./readiness";
import { createNotificationWorkerRuntimeConfig } from "./runtime-config";
import { TelegramBusinessMessagingDeliveryProvider } from "./telegram-business-provider";
import { processTelegramMtprotoInboundMessage } from "./telegram-mtproto-inbound.processor";
import { TelegramMtprotoSessionDeliveryProvider } from "./telegram-mtproto-session-delivery-provider";
import { TelegramMtprotoSessionSupervisor } from "./telegram-mtproto-session-supervisor";
import { createTeleprotoMtprotoSessionClientFactory } from "./telegram-mtproto-teleproto-client";

const serviceName = "notification-worker";
const logger = createLogger("notification-worker");
const config = createNotificationWorkerRuntimeConfig();
const workerInstanceId = `${serviceName}:${hostname()}:${process.pid}:${randomUUID()}`;
const postgresRuntime = createPostgresRuntime();
const authCodeCipher = createAes256GcmSecretCipher(config.authCodeDeliveryEncryptionKey);
const authCodeDeliveryQueue = createAuthCodeDeliveryQueue(config.redisUrl);
const outboxStore = createDrizzleOutboxRelayStore(postgresRuntime.database);
const authCodeDeliveryStore = createDrizzleAuthCodeDeliveryProcessingStore(
  postgresRuntime.database
);
const deliveryProvider = createDeliveryProvider();
const messagingDeliveryQueue = config.messagingDeliveryEnabled
  ? createMessagingDeliveryQueue(config.redisUrl)
  : null;
const messagingDeliveryStore = config.messagingDeliveryEnabled
  ? createDrizzleMessagingDeliveryProcessingStore(postgresRuntime.database)
  : null;
const telegramMtprotoSessionStore = config.telegramMtproto
  ? createDrizzleTelegramMtprotoSessionProcessingStore(postgresRuntime.database)
  : null;
const telegramMtprotoMessagingStore = config.telegramMtproto
  ? createDrizzleMessagingStore(postgresRuntime.database)
  : null;
const telegramMtprotoSessionSupervisor =
  config.telegramMtproto && telegramMtprotoSessionStore && telegramMtprotoMessagingStore
    ? new TelegramMtprotoSessionSupervisor({
        store: telegramMtprotoSessionStore,
        cipher: createAes256GcmSecretCipher(config.telegramMtproto.sessionEncryptionKey),
        apiHash: config.telegramMtproto.apiHash,
        leaseOwner: workerInstanceId,
        leaseDurationMs: config.telegramMtproto.leaseDurationMs,
        claimLimit: config.telegramMtproto.claimLimit,
        logger,
        clientFactory: createTeleprotoMtprotoSessionClientFactory({
          apiId: config.telegramMtproto.apiId,
          apiHash: config.telegramMtproto.apiHash
        }),
        inboundMessageHandler: (input) =>
          processTelegramMtprotoInboundMessage({
            store: telegramMtprotoMessagingStore,
            session: input.session,
            message: input.message,
            now: input.now
          }).then(() => undefined)
      })
    : null;
const messagingDeliveryProvider = createMessagingDeliveryProvider();
const messagingMediaIngestionQueue = config.messagingMediaIngestionEnabled
  ? createMessagingMediaIngestionQueue(config.redisUrl)
  : null;
const messagingMediaIngestionStore = config.messagingMediaIngestionEnabled
  ? createDrizzleMessagingMediaIngestionProcessingStore(postgresRuntime.database)
  : null;
const messagingMediaIngestionProvider = createMessagingMediaIngestionProvider();
const messagingMediaIngestionStorage = config.messagingMediaIngestionEnabled
  ? createS3MessagingMediaObjectStorage(config.mediaStorage)
  : null;
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
const messagingDeliveryWorker =
  config.messagingDeliveryEnabled && messagingDeliveryStore && messagingDeliveryProvider
    ? createMessagingDeliveryWorker(config.redisUrl, (job) =>
        processMessagingDeliveryJob({
          job,
          store: messagingDeliveryStore,
          provider: messagingDeliveryProvider,
          now: new Date(),
          logger
        })
      )
    : null;
const messagingMediaIngestionWorker =
  config.messagingMediaIngestionEnabled &&
  messagingMediaIngestionStore &&
  messagingMediaIngestionProvider &&
  messagingMediaIngestionStorage
    ? createMessagingMediaIngestionWorker(config.redisUrl, (job) =>
        processMessagingMediaIngestionJob({
          job,
          store: messagingMediaIngestionStore,
          provider: messagingMediaIngestionProvider,
          storage: messagingMediaIngestionStorage,
          privateStorageBucket: config.mediaStorage.privateBucket,
          maxBytes: config.messagingMediaIngestionMaxBytes,
          mediaAssetIdGenerator: randomUUID,
          now: new Date()
        })
      )
    : null;
const readinessChecks = {
  postgres: async () => {
    await postgresRuntime.pool.query("select 1");
  },
  authCodeDeliveryQueue: async () => {
    await authCodeDeliveryQueue.waitUntilReady();
  },
  authCodeDeliveryWorker: async () => {
    await authCodeDeliveryWorker.waitUntilReady();
  },
  ...(messagingDeliveryQueue && messagingDeliveryWorker
    ? {
        messagingDeliveryQueue: async () => {
          await messagingDeliveryQueue.waitUntilReady();
        },
        messagingDeliveryWorker: async () => {
          await messagingDeliveryWorker.waitUntilReady();
        }
      }
    : {}),
  ...(messagingMediaIngestionQueue &&
  messagingMediaIngestionWorker &&
  messagingMediaIngestionStorage
    ? {
        messagingMediaIngestionQueue: async () => {
          await messagingMediaIngestionQueue.waitUntilReady();
        },
        messagingMediaIngestionWorker: async () => {
          await messagingMediaIngestionWorker.waitUntilReady();
        },
        messagingMediaIngestionStorage: async () => {
          await messagingMediaIngestionStorage.checkReady();
        }
      }
    : {})
};
const healthServer = createWorkerReadinessServer({
  getReadiness: () =>
    createWorkerReadiness({
      service: serviceName,
      checks: readinessChecks
    })
});

function createDeliveryProvider(): AuthCodeDeliveryProvider {
  if (config.authCodeDeliveryMode === "dev_console") {
    return new DevConsoleAuthCodeDeliveryProvider(logger);
  }

  if (!config.authCodeEmailDelivery || !config.authCodeSmsDelivery) {
    throw new Error("HTTP auth code delivery settings are required in http mode");
  }

  return new ChannelAuthCodeDeliveryProvider(
    new EmailAuthCodeDeliveryProvider(config.authCodeEmailDelivery),
    new SmsAuthCodeDeliveryProvider(config.authCodeSmsDelivery)
  );
}

function createMessagingDeliveryProvider(): MessagingDeliveryProviders | null {
  if (!config.messagingDeliveryEnabled) {
    return null;
  }

  if (!config.telegramBusinessDelivery) {
    throw new Error(
      "Telegram Business delivery settings are required when messaging delivery is enabled"
    );
  }

  const telegramBusiness = new TelegramBusinessMessagingDeliveryProvider(
    config.telegramBusinessDelivery
  );
  const instagramGraph = config.instagramGraphDelivery
    ? new HttpInstagramGraphDeliveryProvider({
        graphApiBaseUrl: config.instagramGraphDelivery.graphApiBaseUrl,
        tokenCipher: createAes256GcmSecretCipher(config.instagramGraphDelivery.tokenEncryptionKey)
      })
    : undefined;

  if (!telegramMtprotoSessionSupervisor) {
    return {
      telegramBusiness,
      ...(instagramGraph ? { instagramGraph } : {})
    };
  }

  return {
    telegramBusiness,
    ...(instagramGraph ? { instagramGraph } : {}),
    telegramMtproto: new TelegramMtprotoSessionDeliveryProvider({
      registry: telegramMtprotoSessionSupervisor
    })
  };
}

function createMessagingMediaIngestionProvider(): TelegramBusinessMediaProvider | null {
  if (!config.messagingMediaIngestionEnabled) {
    return null;
  }

  if (!config.telegramBusinessDelivery) {
    throw new Error(
      "Telegram Business media ingestion settings are required when media ingestion is enabled"
    );
  }

  return new TelegramBusinessMediaProvider(config.telegramBusinessDelivery);
}

let relayTimer: ReturnType<typeof setInterval> | undefined;
let telegramMtprotoSessionTimer: ReturnType<typeof setInterval> | undefined;

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
    if (messagingDeliveryQueue) {
      relayPendingMessagingOutboxEvents({
        store: outboxStore,
        queue: messagingDeliveryQueue,
        now: new Date(),
        batchSize: config.outboxRelayBatchSize,
        publishingLockTimeoutMs: config.outboxPublishingLockTimeoutMs,
        logger,
        queueOptions: {
          attempts: config.messagingDeliveryAttempts,
          backoffMs: config.messagingDeliveryBackoffMs
        }
      }).catch((error: unknown) => {
        logger.error("messaging delivery outbox relay failed", { error });
      });
    }
    if (messagingMediaIngestionQueue && messagingMediaIngestionStore) {
      relayPendingMessagingMediaIngestions({
        store: messagingMediaIngestionStore,
        queue: messagingMediaIngestionQueue,
        now: new Date(),
        batchSize: config.messagingMediaIngestionBatchSize,
        queueOptions: {
          attempts: config.messagingMediaIngestionAttempts,
          backoffMs: config.messagingMediaIngestionBackoffMs
        }
      }).catch((error: unknown) => {
        logger.error("messaging media ingestion relay failed", { error });
      });
    }
  }, config.outboxRelayIntervalMs);

  timer.unref();
  return timer;
}

function startTelegramMtprotoSessionSupervisor(): ReturnType<typeof setInterval> | undefined {
  if (!config.telegramMtproto || !telegramMtprotoSessionSupervisor) {
    return undefined;
  }

  const tick = () => {
    telegramMtprotoSessionSupervisor.tick(new Date()).catch((error: unknown) => {
      logger.error("telegram mtproto session supervisor failed", { error });
    });
  };
  tick();
  const timer = setInterval(tick, config.telegramMtproto.sessionSyncIntervalMs);
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
  telegramMtprotoSessionTimer = startTelegramMtprotoSessionSupervisor();
  relayTimer = startRelay();
  logger.info("notification worker ready", readiness);
}

async function shutdown(): Promise<void> {
  if (relayTimer) {
    clearInterval(relayTimer);
  }
  if (telegramMtprotoSessionTimer) {
    clearInterval(telegramMtprotoSessionTimer);
  }
  await telegramMtprotoSessionSupervisor?.shutdown(new Date());
  await closeHealthServer();
  await messagingMediaIngestionWorker?.close();
  await messagingMediaIngestionQueue?.close();
  await messagingDeliveryWorker?.close();
  await messagingDeliveryQueue?.close();
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
