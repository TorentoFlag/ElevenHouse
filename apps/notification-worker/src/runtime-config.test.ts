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
