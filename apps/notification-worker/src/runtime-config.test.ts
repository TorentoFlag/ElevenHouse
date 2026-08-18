import { describe, expect, it } from "vitest";
import { createNotificationWorkerRuntimeConfig } from "./runtime-config";

const testEncryptionKey = Buffer.alloc(32, 2).toString("base64");
const requiredDeliveryConfig = {
  AUTH_CODE_DELIVERY_ENCRYPTION_KEY: testEncryptionKey,
  NOTIFICATION_WORKER_AUTH_CODE_EMAIL_DELIVERY_ENDPOINT_URL: "https://delivery.internal/auth/email",
  NOTIFICATION_WORKER_AUTH_CODE_EMAIL_DELIVERY_BEARER_TOKEN: "email-token",
  NOTIFICATION_WORKER_AUTH_CODE_EMAIL_FROM: "auth@elevenhouse.test",
  NOTIFICATION_WORKER_AUTH_CODE_SMS_DELIVERY_ENDPOINT_URL: "https://delivery.internal/auth/sms",
  NOTIFICATION_WORKER_AUTH_CODE_SMS_DELIVERY_BEARER_TOKEN: "sms-token",
  NOTIFICATION_WORKER_AUTH_CODE_SMS_FROM: "ElevenHouse"
};

describe("createNotificationWorkerRuntimeConfig", () => {
  it("requires explicit encryption, email, and SMS delivery settings", () => {
    expect(() => createNotificationWorkerRuntimeConfig({})).toThrow(
      "AUTH_CODE_DELIVERY_ENCRYPTION_KEY"
    );
  });

  it("requires explicit email and SMS delivery settings", () => {
    expect(() =>
      createNotificationWorkerRuntimeConfig({
        AUTH_CODE_DELIVERY_ENCRYPTION_KEY: testEncryptionKey
      })
    ).toThrow("NOTIFICATION_WORKER_AUTH_CODE_EMAIL_DELIVERY_ENDPOINT_URL");
  });

  it("parses queue and delivery settings", () => {
    expect(
      createNotificationWorkerRuntimeConfig({
        ...requiredDeliveryConfig,
        REDIS_URL: "redis://redis.internal:6379/3",
        NOTIFICATION_WORKER_HEALTH_HOST: "127.0.0.1",
        NOTIFICATION_WORKER_HEALTH_PORT: "4013",
        NOTIFICATION_WORKER_OUTBOX_RELAY_INTERVAL_MS: "250",
        NOTIFICATION_WORKER_OUTBOX_RELAY_BATCH_SIZE: "10",
        NOTIFICATION_WORKER_OUTBOX_PUBLISHING_LOCK_TIMEOUT_MS: "30000",
        NOTIFICATION_WORKER_AUTH_CODE_DELIVERY_ATTEMPTS: "7",
        NOTIFICATION_WORKER_AUTH_CODE_DELIVERY_BACKOFF_MS: "500"
      })
    ).toEqual({
      redisUrl: "redis://redis.internal:6379/3",
      authCodeDeliveryEncryptionKey: Buffer.alloc(32, 2),
      authCodeDeliveryMode: "http",
      healthHost: "127.0.0.1",
      healthPort: 4013,
      outboxRelayIntervalMs: 250,
      outboxRelayBatchSize: 10,
      outboxPublishingLockTimeoutMs: 30000,
      authCodeDeliveryAttempts: 7,
      authCodeDeliveryBackoffMs: 500,
      messagingDeliveryEnabled: false,
      messagingDeliveryAttempts: 5,
      messagingDeliveryBackoffMs: 1000,
      instagramGraphDelivery: null,
      messagingMediaIngestionEnabled: false,
      messagingMediaIngestionAttempts: 5,
      messagingMediaIngestionBackoffMs: 1000,
      messagingMediaIngestionBatchSize: 50,
      messagingMediaIngestionMaxBytes: 20_000_000,
      mediaStorage: {
        endpoint: "http://localhost:9000",
        region: "us-east-1",
        privateBucket: "elevenhouse-local-private",
        accessKeyId: "elevenhouse",
        secretAccessKey: "elevenhouse-secret",
        forcePathStyle: true
      },
      telegramBusinessDelivery: null,
      telegramMtproto: null,
      authCodeEmailDelivery: {
        endpointUrl: "https://delivery.internal/auth/email",
        bearerToken: "email-token",
        from: "auth@elevenhouse.test"
      },
      authCodeSmsDelivery: {
        endpointUrl: "https://delivery.internal/auth/sms",
        bearerToken: "sms-token",
        from: "ElevenHouse"
      }
    });
  });

  it("requires Telegram Bot credentials when messaging delivery is enabled", () => {
    expect(() =>
      createNotificationWorkerRuntimeConfig({
        ...requiredDeliveryConfig,
        NOTIFICATION_WORKER_MESSAGING_DELIVERY_ENABLED: "true"
      })
    ).toThrow("NOTIFICATION_WORKER_TELEGRAM_BOT_TOKEN");
  });

  it("requires Telegram Bot credentials when messaging media ingestion is enabled", () => {
    expect(() =>
      createNotificationWorkerRuntimeConfig({
        ...requiredDeliveryConfig,
        NOTIFICATION_WORKER_MESSAGING_MEDIA_INGESTION_ENABLED: "true"
      })
    ).toThrow("NOTIFICATION_WORKER_TELEGRAM_BOT_TOKEN");
  });

  it("parses Telegram Business messaging delivery settings", () => {
    expect(
      createNotificationWorkerRuntimeConfig({
        ...requiredDeliveryConfig,
        NOTIFICATION_WORKER_MESSAGING_DELIVERY_ENABLED: "true",
        NOTIFICATION_WORKER_MESSAGING_DELIVERY_ATTEMPTS: "6",
        NOTIFICATION_WORKER_MESSAGING_DELIVERY_BACKOFF_MS: "750",
        NOTIFICATION_WORKER_TELEGRAM_BOT_TOKEN: "telegram-token",
        NOTIFICATION_WORKER_TELEGRAM_BOT_API_BASE_URL: "https://telegram.test"
      })
    ).toMatchObject({
      messagingDeliveryEnabled: true,
      messagingDeliveryAttempts: 6,
      messagingDeliveryBackoffMs: 750,
      telegramBusinessDelivery: {
        botToken: "telegram-token",
        botApiBaseUrl: "https://telegram.test"
      }
    });
  });

  it("requires Instagram Graph token encryption settings when Instagram delivery is enabled", () => {
    expect(() =>
      createNotificationWorkerRuntimeConfig({
        ...requiredDeliveryConfig,
        NOTIFICATION_WORKER_INSTAGRAM_GRAPH_DELIVERY_ENABLED: "true"
      })
    ).toThrow("NOTIFICATION_WORKER_INSTAGRAM_GRAPH_TOKEN_ENCRYPTION_KEY");
  });

  it("parses Instagram Graph messaging delivery settings", () => {
    const instagramTokenKey = Buffer.alloc(32, 14).toString("base64");

    expect(
      createNotificationWorkerRuntimeConfig({
        ...requiredDeliveryConfig,
        NOTIFICATION_WORKER_INSTAGRAM_GRAPH_DELIVERY_ENABLED: "true",
        NOTIFICATION_WORKER_INSTAGRAM_GRAPH_API_BASE_URL: "https://graph.instagram.test/v25.0",
        NOTIFICATION_WORKER_INSTAGRAM_GRAPH_TOKEN_ENCRYPTION_KEY: instagramTokenKey
      })
    ).toMatchObject({
      instagramGraphDelivery: {
        graphApiBaseUrl: "https://graph.instagram.test/v25.0",
        tokenEncryptionKey: Buffer.alloc(32, 14)
      }
    });
  });

  it("requires Telegram MTProto settings when MTProto messaging is enabled", () => {
    expect(() =>
      createNotificationWorkerRuntimeConfig({
        ...requiredDeliveryConfig,
        NOTIFICATION_WORKER_TELEGRAM_MTPROTO_ENABLED: "true",
        NOTIFICATION_WORKER_TELEGRAM_MTPROTO_API_ID: "12345",
        NOTIFICATION_WORKER_TELEGRAM_MTPROTO_API_HASH: "0123456789abcdef0123456789abcdef"
      })
    ).toThrow("NOTIFICATION_WORKER_TELEGRAM_MTPROTO_SESSION_ENCRYPTION_KEY");
  });

  it("parses Telegram MTProto account settings", () => {
    const mtprotoSessionEncryptionKey = Buffer.alloc(32, 12).toString("base64");

    expect(
      createNotificationWorkerRuntimeConfig({
        ...requiredDeliveryConfig,
        NOTIFICATION_WORKER_TELEGRAM_MTPROTO_ENABLED: "true",
        NOTIFICATION_WORKER_TELEGRAM_MTPROTO_API_ID: "12345",
        NOTIFICATION_WORKER_TELEGRAM_MTPROTO_API_HASH: "0123456789abcdef0123456789abcdef",
        NOTIFICATION_WORKER_TELEGRAM_MTPROTO_SESSION_ENCRYPTION_KEY: mtprotoSessionEncryptionKey,
        NOTIFICATION_WORKER_TELEGRAM_MTPROTO_LEASE_DURATION_MS: "90000",
        NOTIFICATION_WORKER_TELEGRAM_MTPROTO_SESSION_SYNC_INTERVAL_MS: "30000",
        NOTIFICATION_WORKER_TELEGRAM_MTPROTO_CLAIM_LIMIT: "10"
      })
    ).toMatchObject({
      telegramMtproto: {
        enabled: true,
        apiId: 12345,
        apiHash: "0123456789abcdef0123456789abcdef",
        sessionEncryptionKey: Buffer.alloc(32, 12),
        leaseDurationMs: 90_000,
        sessionSyncIntervalMs: 30_000,
        claimLimit: 10
      }
    });
  });

  it("parses messaging media ingestion and private storage settings", () => {
    expect(
      createNotificationWorkerRuntimeConfig({
        ...requiredDeliveryConfig,
        NOTIFICATION_WORKER_MESSAGING_MEDIA_INGESTION_ENABLED: "true",
        NOTIFICATION_WORKER_MESSAGING_MEDIA_INGESTION_ATTEMPTS: "4",
        NOTIFICATION_WORKER_MESSAGING_MEDIA_INGESTION_BACKOFF_MS: "1500",
        NOTIFICATION_WORKER_MESSAGING_MEDIA_INGESTION_BATCH_SIZE: "25",
        NOTIFICATION_WORKER_MESSAGING_MEDIA_MAX_BYTES: "123456",
        NOTIFICATION_WORKER_TELEGRAM_BOT_TOKEN: "telegram-token",
        NOTIFICATION_WORKER_TELEGRAM_BOT_API_BASE_URL: "https://telegram.test",
        ASTROLOGER_MEDIA_STORAGE_ENDPOINT: "https://objects.test",
        ASTROLOGER_MEDIA_STORAGE_REGION: "eu-central-1",
        ASTROLOGER_MEDIA_PRIVATE_STORAGE_BUCKET: "private-media",
        ASTROLOGER_MEDIA_STORAGE_ACCESS_KEY_ID: "media-key",
        ASTROLOGER_MEDIA_STORAGE_SECRET_ACCESS_KEY: "media-secret",
        ASTROLOGER_MEDIA_STORAGE_FORCE_PATH_STYLE: "false"
      })
    ).toMatchObject({
      messagingMediaIngestionEnabled: true,
      messagingMediaIngestionAttempts: 4,
      messagingMediaIngestionBackoffMs: 1500,
      messagingMediaIngestionBatchSize: 25,
      messagingMediaIngestionMaxBytes: 123456,
      telegramBusinessDelivery: {
        botToken: "telegram-token",
        botApiBaseUrl: "https://telegram.test"
      },
      mediaStorage: {
        endpoint: "https://objects.test",
        region: "eu-central-1",
        privateBucket: "private-media",
        accessKeyId: "media-key",
        secretAccessKey: "media-secret",
        forcePathStyle: false
      }
    });
  });

  it("parses dev console delivery mode without HTTP delivery endpoints", () => {
    expect(
      createNotificationWorkerRuntimeConfig({
        AUTH_CODE_DELIVERY_ENCRYPTION_KEY: testEncryptionKey,
        NOTIFICATION_WORKER_AUTH_CODE_DELIVERY_MODE: "dev_console"
      })
    ).toMatchObject({
      authCodeDeliveryMode: "dev_console",
      authCodeEmailDelivery: null,
      authCodeSmsDelivery: null
    });
  });

  it("rejects auth code delivery encryption keys with the wrong length", () => {
    expect(() =>
      createNotificationWorkerRuntimeConfig({
        ...requiredDeliveryConfig,
        AUTH_CODE_DELIVERY_ENCRYPTION_KEY: Buffer.alloc(16).toString("base64")
      })
    ).toThrow("AES-256-GCM key must be 32 bytes encoded as base64");
  });
});
