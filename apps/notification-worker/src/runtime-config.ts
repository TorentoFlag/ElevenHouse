import { z } from "@elevenhouse/validation";
import { parseBase64Aes256GcmKey } from "@elevenhouse/auth";

const notificationWorkerRuntimeConfigSchema = z
  .object({
    REDIS_URL: z.string().trim().min(1).default("redis://localhost:6379"),
    AUTH_CODE_DELIVERY_ENCRYPTION_KEY: z.string().trim().min(1),
    NOTIFICATION_WORKER_AUTH_CODE_DELIVERY_MODE: z.enum(["http", "dev_console"]).default("http"),
    NOTIFICATION_WORKER_HEALTH_HOST: z.string().trim().min(1).default("0.0.0.0"),
    NOTIFICATION_WORKER_HEALTH_PORT: z.coerce.number().int().positive().default(3013),
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
    NOTIFICATION_WORKER_AUTH_CODE_EMAIL_DELIVERY_ENDPOINT_URL: z.string().trim().url().optional(),
    NOTIFICATION_WORKER_AUTH_CODE_EMAIL_DELIVERY_BEARER_TOKEN: z.string().trim().min(1).optional(),
    NOTIFICATION_WORKER_AUTH_CODE_EMAIL_FROM: z.string().trim().min(1).optional(),
    NOTIFICATION_WORKER_AUTH_CODE_SMS_DELIVERY_ENDPOINT_URL: z.string().trim().url().optional(),
    NOTIFICATION_WORKER_AUTH_CODE_SMS_DELIVERY_BEARER_TOKEN: z.string().trim().min(1).optional(),
    NOTIFICATION_WORKER_AUTH_CODE_SMS_FROM: z.string().trim().min(1).optional()
  })
  .superRefine((config, context) => {
    if (config.NOTIFICATION_WORKER_AUTH_CODE_DELIVERY_MODE !== "http") {
      return;
    }

    requireHttpDeliverySetting(
      config.NOTIFICATION_WORKER_AUTH_CODE_EMAIL_DELIVERY_ENDPOINT_URL,
      ["NOTIFICATION_WORKER_AUTH_CODE_EMAIL_DELIVERY_ENDPOINT_URL"],
      context
    );
    requireHttpDeliverySetting(
      config.NOTIFICATION_WORKER_AUTH_CODE_EMAIL_DELIVERY_BEARER_TOKEN,
      ["NOTIFICATION_WORKER_AUTH_CODE_EMAIL_DELIVERY_BEARER_TOKEN"],
      context
    );
    requireHttpDeliverySetting(
      config.NOTIFICATION_WORKER_AUTH_CODE_EMAIL_FROM,
      ["NOTIFICATION_WORKER_AUTH_CODE_EMAIL_FROM"],
      context
    );
    requireHttpDeliverySetting(
      config.NOTIFICATION_WORKER_AUTH_CODE_SMS_DELIVERY_ENDPOINT_URL,
      ["NOTIFICATION_WORKER_AUTH_CODE_SMS_DELIVERY_ENDPOINT_URL"],
      context
    );
    requireHttpDeliverySetting(
      config.NOTIFICATION_WORKER_AUTH_CODE_SMS_DELIVERY_BEARER_TOKEN,
      ["NOTIFICATION_WORKER_AUTH_CODE_SMS_DELIVERY_BEARER_TOKEN"],
      context
    );
    requireHttpDeliverySetting(
      config.NOTIFICATION_WORKER_AUTH_CODE_SMS_FROM,
      ["NOTIFICATION_WORKER_AUTH_CODE_SMS_FROM"],
      context
    );
  });

export type AuthCodeHttpDeliveryOptions = {
  readonly endpointUrl: string;
  readonly bearerToken: string;
  readonly from: string;
};

export type NotificationWorkerRuntimeConfig = {
  readonly redisUrl: string;
  readonly authCodeDeliveryEncryptionKey: Buffer;
  readonly authCodeDeliveryMode: "http" | "dev_console";
  readonly healthHost: string;
  readonly healthPort: number;
  readonly outboxRelayIntervalMs: number;
  readonly outboxRelayBatchSize: number;
  readonly outboxPublishingLockTimeoutMs: number;
  readonly authCodeDeliveryAttempts: number;
  readonly authCodeDeliveryBackoffMs: number;
  readonly authCodeEmailDelivery: AuthCodeHttpDeliveryOptions | null;
  readonly authCodeSmsDelivery: AuthCodeHttpDeliveryOptions | null;
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
    authCodeDeliveryMode: config.NOTIFICATION_WORKER_AUTH_CODE_DELIVERY_MODE,
    healthHost: config.NOTIFICATION_WORKER_HEALTH_HOST,
    healthPort: config.NOTIFICATION_WORKER_HEALTH_PORT,
    outboxRelayIntervalMs: config.NOTIFICATION_WORKER_OUTBOX_RELAY_INTERVAL_MS,
    outboxRelayBatchSize: config.NOTIFICATION_WORKER_OUTBOX_RELAY_BATCH_SIZE,
    outboxPublishingLockTimeoutMs: config.NOTIFICATION_WORKER_OUTBOX_PUBLISHING_LOCK_TIMEOUT_MS,
    authCodeDeliveryAttempts: config.NOTIFICATION_WORKER_AUTH_CODE_DELIVERY_ATTEMPTS,
    authCodeDeliveryBackoffMs: config.NOTIFICATION_WORKER_AUTH_CODE_DELIVERY_BACKOFF_MS,
    authCodeEmailDelivery:
      config.NOTIFICATION_WORKER_AUTH_CODE_DELIVERY_MODE === "dev_console"
        ? null
        : toHttpDeliveryOptions({
            endpointUrl: config.NOTIFICATION_WORKER_AUTH_CODE_EMAIL_DELIVERY_ENDPOINT_URL,
            bearerToken: config.NOTIFICATION_WORKER_AUTH_CODE_EMAIL_DELIVERY_BEARER_TOKEN,
            from: config.NOTIFICATION_WORKER_AUTH_CODE_EMAIL_FROM
          }),
    authCodeSmsDelivery:
      config.NOTIFICATION_WORKER_AUTH_CODE_DELIVERY_MODE === "dev_console"
        ? null
        : toHttpDeliveryOptions({
            endpointUrl: config.NOTIFICATION_WORKER_AUTH_CODE_SMS_DELIVERY_ENDPOINT_URL,
            bearerToken: config.NOTIFICATION_WORKER_AUTH_CODE_SMS_DELIVERY_BEARER_TOKEN,
            from: config.NOTIFICATION_WORKER_AUTH_CODE_SMS_FROM
          })
  };
}

function toHttpDeliveryOptions(input: {
  readonly endpointUrl: string | undefined;
  readonly bearerToken: string | undefined;
  readonly from: string | undefined;
}): AuthCodeHttpDeliveryOptions {
  if (!input.endpointUrl || !input.bearerToken || !input.from) {
    throw new Error("HTTP auth code delivery settings are required in http mode");
  }

  return {
    endpointUrl: input.endpointUrl,
    bearerToken: input.bearerToken,
    from: input.from
  };
}

function requireHttpDeliverySetting(
  value: string | undefined,
  path: readonly string[],
  context: z.RefinementCtx
): void {
  if (value !== undefined) {
    return;
  }

  context.addIssue({
    code: "invalid_type",
    expected: "string",
    received: "undefined",
    path: [...path],
    message: "Invalid input: expected string, received undefined"
  });
}
