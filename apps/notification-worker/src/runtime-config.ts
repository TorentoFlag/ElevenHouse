import { z } from "@elevenhouse/validation";
import { parseBase64Aes256GcmKey } from "@elevenhouse/auth";

const notificationWorkerRuntimeConfigSchema = z.object({
  REDIS_URL: z.string().trim().min(1).default("redis://localhost:6379"),
  AUTH_CODE_DELIVERY_ENCRYPTION_KEY: z.string().trim().min(1),
  NOTIFICATION_WORKER_OUTBOX_RELAY_INTERVAL_MS: z.coerce.number().int().positive().default(1000),
  NOTIFICATION_WORKER_OUTBOX_RELAY_BATCH_SIZE: z.coerce.number().int().positive().default(50),
  NOTIFICATION_WORKER_OUTBOX_PUBLISHING_LOCK_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(60000),
  NOTIFICATION_WORKER_AUTH_CODE_DELIVERY_ATTEMPTS: z.coerce.number().int().positive().default(5),
  NOTIFICATION_WORKER_AUTH_CODE_DELIVERY_BACKOFF_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(1000),
  NOTIFICATION_WORKER_AUTH_CODE_EMAIL_DELIVERY_ENDPOINT_URL: z.string().trim().url(),
  NOTIFICATION_WORKER_AUTH_CODE_EMAIL_DELIVERY_BEARER_TOKEN: z.string().trim().min(1),
  NOTIFICATION_WORKER_AUTH_CODE_EMAIL_FROM: z.string().trim().min(1),
  NOTIFICATION_WORKER_AUTH_CODE_SMS_DELIVERY_ENDPOINT_URL: z.string().trim().url(),
  NOTIFICATION_WORKER_AUTH_CODE_SMS_DELIVERY_BEARER_TOKEN: z.string().trim().min(1),
  NOTIFICATION_WORKER_AUTH_CODE_SMS_FROM: z.string().trim().min(1)
});

export type AuthCodeHttpDeliveryOptions = {
  readonly endpointUrl: string;
  readonly bearerToken: string;
  readonly from: string;
};

export type NotificationWorkerRuntimeConfig = {
  readonly redisUrl: string;
  readonly authCodeDeliveryEncryptionKey: Buffer;
  readonly outboxRelayIntervalMs: number;
  readonly outboxRelayBatchSize: number;
  readonly outboxPublishingLockTimeoutMs: number;
  readonly authCodeDeliveryAttempts: number;
  readonly authCodeDeliveryBackoffMs: number;
  readonly authCodeEmailDelivery: AuthCodeHttpDeliveryOptions;
  readonly authCodeSmsDelivery: AuthCodeHttpDeliveryOptions;
};

export function createNotificationWorkerRuntimeConfig(
  source: Record<string, string | undefined> = process.env
): NotificationWorkerRuntimeConfig {
  const config = notificationWorkerRuntimeConfigSchema.parse(source);

  return {
    redisUrl: config.REDIS_URL,
    authCodeDeliveryEncryptionKey: parseBase64Aes256GcmKey(
      config.AUTH_CODE_DELIVERY_ENCRYPTION_KEY
    ),
    outboxRelayIntervalMs: config.NOTIFICATION_WORKER_OUTBOX_RELAY_INTERVAL_MS,
    outboxRelayBatchSize: config.NOTIFICATION_WORKER_OUTBOX_RELAY_BATCH_SIZE,
    outboxPublishingLockTimeoutMs:
      config.NOTIFICATION_WORKER_OUTBOX_PUBLISHING_LOCK_TIMEOUT_MS,
    authCodeDeliveryAttempts: config.NOTIFICATION_WORKER_AUTH_CODE_DELIVERY_ATTEMPTS,
    authCodeDeliveryBackoffMs: config.NOTIFICATION_WORKER_AUTH_CODE_DELIVERY_BACKOFF_MS,
    authCodeEmailDelivery: {
      endpointUrl: config.NOTIFICATION_WORKER_AUTH_CODE_EMAIL_DELIVERY_ENDPOINT_URL,
      bearerToken: config.NOTIFICATION_WORKER_AUTH_CODE_EMAIL_DELIVERY_BEARER_TOKEN,
      from: config.NOTIFICATION_WORKER_AUTH_CODE_EMAIL_FROM
    },
    authCodeSmsDelivery: {
      endpointUrl: config.NOTIFICATION_WORKER_AUTH_CODE_SMS_DELIVERY_ENDPOINT_URL,
      bearerToken: config.NOTIFICATION_WORKER_AUTH_CODE_SMS_DELIVERY_BEARER_TOKEN,
      from: config.NOTIFICATION_WORKER_AUTH_CODE_SMS_FROM
    }
  };
}
