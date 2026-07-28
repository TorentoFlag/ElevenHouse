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
    NOTIFICATION_WORKER_MESSAGING_DELIVERY_ENABLED: z.enum(["true", "false"]).default("false"),
    NOTIFICATION_WORKER_MESSAGING_DELIVERY_ATTEMPTS: z.coerce.number().int().positive().default(5),
    NOTIFICATION_WORKER_MESSAGING_DELIVERY_BACKOFF_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(1000),
    NOTIFICATION_WORKER_MESSAGING_MEDIA_INGESTION_ENABLED: z.enum(["true", "false"]).default("false"),
    NOTIFICATION_WORKER_MESSAGING_MEDIA_INGESTION_ATTEMPTS: z.coerce
      .number()
      .int()
      .positive()
      .default(5),
    NOTIFICATION_WORKER_MESSAGING_MEDIA_INGESTION_BACKOFF_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(1000),
    NOTIFICATION_WORKER_MESSAGING_MEDIA_INGESTION_BATCH_SIZE: z.coerce
      .number()
      .int()
      .positive()
      .default(50),
    NOTIFICATION_WORKER_MESSAGING_MEDIA_MAX_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .max(20_000_000)
      .default(20_000_000),
    NOTIFICATION_WORKER_TELEGRAM_BOT_TOKEN: z.string().trim().min(1).optional(),
    NOTIFICATION_WORKER_TELEGRAM_BOT_API_BASE_URL: z
      .string()
      .trim()
      .url()
      .default("https://api.telegram.org"),
    NOTIFICATION_WORKER_TELEGRAM_MTPROTO_ENABLED: z.enum(["true", "false"]).default("false"),
    NOTIFICATION_WORKER_TELEGRAM_MTPROTO_API_ID: z.coerce.number().int().positive().optional(),
    NOTIFICATION_WORKER_TELEGRAM_MTPROTO_API_HASH: z
      .string()
      .trim()
      .regex(/^[a-f0-9]{32}$/i)
      .optional(),
    NOTIFICATION_WORKER_TELEGRAM_MTPROTO_SESSION_ENCRYPTION_KEY: z.string().trim().min(1).optional(),
    NOTIFICATION_WORKER_TELEGRAM_MTPROTO_LEASE_DURATION_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(60_000),
    NOTIFICATION_WORKER_TELEGRAM_MTPROTO_SESSION_SYNC_INTERVAL_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(15_000),
    NOTIFICATION_WORKER_TELEGRAM_MTPROTO_CLAIM_LIMIT: z.coerce.number().int().positive().default(25),
    ASTROLOGER_MEDIA_STORAGE_ENDPOINT: z.string().trim().url().default("http://localhost:9000"),
    ASTROLOGER_MEDIA_STORAGE_REGION: z.string().trim().min(1).default("us-east-1"),
    ASTROLOGER_MEDIA_PRIVATE_STORAGE_BUCKET: z
      .string()
      .trim()
      .min(1)
      .default("elevenhouse-local-private"),
    ASTROLOGER_MEDIA_STORAGE_ACCESS_KEY_ID: z.string().trim().min(1).default("elevenhouse"),
    ASTROLOGER_MEDIA_STORAGE_SECRET_ACCESS_KEY: z
      .string()
      .trim()
      .min(1)
      .default("elevenhouse-secret"),
    ASTROLOGER_MEDIA_STORAGE_FORCE_PATH_STYLE: z.enum(["true", "false"]).default("true"),
    NOTIFICATION_WORKER_AUTH_CODE_EMAIL_DELIVERY_ENDPOINT_URL: z.string().trim().url().optional(),
    NOTIFICATION_WORKER_AUTH_CODE_EMAIL_DELIVERY_BEARER_TOKEN: z.string().trim().min(1).optional(),
    NOTIFICATION_WORKER_AUTH_CODE_EMAIL_FROM: z.string().trim().min(1).optional(),
    NOTIFICATION_WORKER_AUTH_CODE_SMS_DELIVERY_ENDPOINT_URL: z.string().trim().url().optional(),
    NOTIFICATION_WORKER_AUTH_CODE_SMS_DELIVERY_BEARER_TOKEN: z.string().trim().min(1).optional(),
    NOTIFICATION_WORKER_AUTH_CODE_SMS_FROM: z.string().trim().min(1).optional()
  })
  .superRefine((config, context) => {
    if (config.NOTIFICATION_WORKER_AUTH_CODE_DELIVERY_MODE === "http") {
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
    }

    if (
      config.NOTIFICATION_WORKER_MESSAGING_DELIVERY_ENABLED === "true" ||
      config.NOTIFICATION_WORKER_MESSAGING_MEDIA_INGESTION_ENABLED === "true"
    ) {
      requireHttpDeliverySetting(
        config.NOTIFICATION_WORKER_TELEGRAM_BOT_TOKEN,
        ["NOTIFICATION_WORKER_TELEGRAM_BOT_TOKEN"],
        context
      );
    }

    const hasAnyMtprotoSetting =
      config.NOTIFICATION_WORKER_TELEGRAM_MTPROTO_ENABLED === "true" ||
      config.NOTIFICATION_WORKER_TELEGRAM_MTPROTO_API_ID !== undefined ||
      config.NOTIFICATION_WORKER_TELEGRAM_MTPROTO_API_HASH !== undefined ||
      config.NOTIFICATION_WORKER_TELEGRAM_MTPROTO_SESSION_ENCRYPTION_KEY !== undefined;
    if (hasAnyMtprotoSetting) {
      requireHttpDeliverySetting(
        config.NOTIFICATION_WORKER_TELEGRAM_MTPROTO_API_ID === undefined
          ? undefined
          : String(config.NOTIFICATION_WORKER_TELEGRAM_MTPROTO_API_ID),
        ["NOTIFICATION_WORKER_TELEGRAM_MTPROTO_API_ID"],
        context
      );
      requireHttpDeliverySetting(
        config.NOTIFICATION_WORKER_TELEGRAM_MTPROTO_API_HASH,
        ["NOTIFICATION_WORKER_TELEGRAM_MTPROTO_API_HASH"],
        context
      );
      requireHttpDeliverySetting(
        config.NOTIFICATION_WORKER_TELEGRAM_MTPROTO_SESSION_ENCRYPTION_KEY,
        ["NOTIFICATION_WORKER_TELEGRAM_MTPROTO_SESSION_ENCRYPTION_KEY"],
        context
      );
    }
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
  readonly messagingDeliveryEnabled: boolean;
  readonly messagingDeliveryAttempts: number;
  readonly messagingDeliveryBackoffMs: number;
  readonly messagingMediaIngestionEnabled: boolean;
  readonly messagingMediaIngestionAttempts: number;
  readonly messagingMediaIngestionBackoffMs: number;
  readonly messagingMediaIngestionBatchSize: number;
  readonly messagingMediaIngestionMaxBytes: number;
  readonly mediaStorage: MessagingMediaStorageOptions;
  readonly telegramBusinessDelivery: TelegramBusinessDeliveryOptions | null;
  readonly telegramMtproto: TelegramMtprotoOptions | null;
  readonly authCodeEmailDelivery: AuthCodeHttpDeliveryOptions | null;
  readonly authCodeSmsDelivery: AuthCodeHttpDeliveryOptions | null;
};

export type TelegramBusinessDeliveryOptions = {
  readonly botToken: string;
  readonly botApiBaseUrl: string;
};

export type TelegramMtprotoOptions = {
  readonly enabled: true;
  readonly apiId: number;
  readonly apiHash: string;
  readonly sessionEncryptionKey: Buffer;
  readonly leaseDurationMs: number;
  readonly sessionSyncIntervalMs: number;
  readonly claimLimit: number;
};

export type MessagingMediaStorageOptions = {
  readonly endpoint: string;
  readonly region: string;
  readonly privateBucket: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly forcePathStyle: boolean;
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
    messagingDeliveryEnabled: config.NOTIFICATION_WORKER_MESSAGING_DELIVERY_ENABLED === "true",
    messagingDeliveryAttempts: config.NOTIFICATION_WORKER_MESSAGING_DELIVERY_ATTEMPTS,
    messagingDeliveryBackoffMs: config.NOTIFICATION_WORKER_MESSAGING_DELIVERY_BACKOFF_MS,
    messagingMediaIngestionEnabled:
      config.NOTIFICATION_WORKER_MESSAGING_MEDIA_INGESTION_ENABLED === "true",
    messagingMediaIngestionAttempts: config.NOTIFICATION_WORKER_MESSAGING_MEDIA_INGESTION_ATTEMPTS,
    messagingMediaIngestionBackoffMs:
      config.NOTIFICATION_WORKER_MESSAGING_MEDIA_INGESTION_BACKOFF_MS,
    messagingMediaIngestionBatchSize:
      config.NOTIFICATION_WORKER_MESSAGING_MEDIA_INGESTION_BATCH_SIZE,
    messagingMediaIngestionMaxBytes: config.NOTIFICATION_WORKER_MESSAGING_MEDIA_MAX_BYTES,
    mediaStorage: {
      endpoint: config.ASTROLOGER_MEDIA_STORAGE_ENDPOINT,
      region: config.ASTROLOGER_MEDIA_STORAGE_REGION,
      privateBucket: config.ASTROLOGER_MEDIA_PRIVATE_STORAGE_BUCKET,
      accessKeyId: config.ASTROLOGER_MEDIA_STORAGE_ACCESS_KEY_ID,
      secretAccessKey: config.ASTROLOGER_MEDIA_STORAGE_SECRET_ACCESS_KEY,
      forcePathStyle: config.ASTROLOGER_MEDIA_STORAGE_FORCE_PATH_STYLE === "true"
    },
    telegramBusinessDelivery:
      config.NOTIFICATION_WORKER_MESSAGING_DELIVERY_ENABLED === "true" ||
      config.NOTIFICATION_WORKER_MESSAGING_MEDIA_INGESTION_ENABLED === "true"
        ? toTelegramBusinessDeliveryOptions({
            botToken: config.NOTIFICATION_WORKER_TELEGRAM_BOT_TOKEN,
            botApiBaseUrl: config.NOTIFICATION_WORKER_TELEGRAM_BOT_API_BASE_URL
          })
        : null,
    telegramMtproto: toTelegramMtprotoOptions({
      enabled: config.NOTIFICATION_WORKER_TELEGRAM_MTPROTO_ENABLED === "true",
      apiId: config.NOTIFICATION_WORKER_TELEGRAM_MTPROTO_API_ID,
      apiHash: config.NOTIFICATION_WORKER_TELEGRAM_MTPROTO_API_HASH,
      sessionEncryptionKey: config.NOTIFICATION_WORKER_TELEGRAM_MTPROTO_SESSION_ENCRYPTION_KEY,
      leaseDurationMs: config.NOTIFICATION_WORKER_TELEGRAM_MTPROTO_LEASE_DURATION_MS,
      sessionSyncIntervalMs: config.NOTIFICATION_WORKER_TELEGRAM_MTPROTO_SESSION_SYNC_INTERVAL_MS,
      claimLimit: config.NOTIFICATION_WORKER_TELEGRAM_MTPROTO_CLAIM_LIMIT
    }),
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

function toTelegramMtprotoOptions(input: {
  readonly enabled: boolean;
  readonly apiId: number | undefined;
  readonly apiHash: string | undefined;
  readonly sessionEncryptionKey: string | undefined;
  readonly leaseDurationMs: number;
  readonly sessionSyncIntervalMs: number;
  readonly claimLimit: number;
}): TelegramMtprotoOptions | null {
  if (!input.enabled) return null;
  if (input.apiId === undefined || !input.apiHash || !input.sessionEncryptionKey) {
    throw new Error("Telegram MTProto settings are required when MTProto messaging is enabled");
  }

  return {
    enabled: true,
    apiId: input.apiId,
    apiHash: input.apiHash,
    sessionEncryptionKey: parseBase64Aes256GcmKey(input.sessionEncryptionKey),
    leaseDurationMs: input.leaseDurationMs,
    sessionSyncIntervalMs: input.sessionSyncIntervalMs,
    claimLimit: input.claimLimit
  };
}

function toTelegramBusinessDeliveryOptions(input: {
  readonly botToken: string | undefined;
  readonly botApiBaseUrl: string;
}): TelegramBusinessDeliveryOptions {
  if (!input.botToken) {
    throw new Error("Telegram Business delivery settings are required when messaging delivery is enabled");
  }

  return {
    botToken: input.botToken,
    botApiBaseUrl: input.botApiBaseUrl
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
