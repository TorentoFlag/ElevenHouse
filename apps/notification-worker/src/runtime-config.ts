import { z } from "@elevenhouse/validation";
import { parseBase64Aes256GcmKey } from "@elevenhouse/auth";

const notificationWorkerRuntimeConfigSchema = z
  .object({
    REDIS_URL: z.string().trim().min(1).default("redis://localhost:6379"),
    AUTH_CODE_DELIVERY_ENCRYPTION_KEY: z.string().trim().min(1),
    NOTIFICATION_WORKER_AUTH_CODE_DELIVERY_MODE: z.enum(["smtp", "dev_console"]).default("smtp"),
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
    NOTIFICATION_WORKER_INSTAGRAM_GRAPH_DELIVERY_ENABLED: z
      .enum(["true", "false"])
      .default("false"),
    NOTIFICATION_WORKER_INSTAGRAM_GRAPH_API_BASE_URL: z
      .string()
      .trim()
      .url()
      .default("https://graph.instagram.com/v25.0"),
    NOTIFICATION_WORKER_INSTAGRAM_GRAPH_TOKEN_ENCRYPTION_KEY: z.string().trim().min(1).optional(),
    NOTIFICATION_WORKER_WHATSAPP_CLOUD_DELIVERY_ENABLED: z
      .enum(["true", "false"])
      .default("false"),
    NOTIFICATION_WORKER_WHATSAPP_CLOUD_GRAPH_API_BASE_URL: z
      .string()
      .trim()
      .url()
      .default("https://graph.facebook.com/v26.0"),
    NOTIFICATION_WORKER_WHATSAPP_CLOUD_TOKEN_ENCRYPTION_KEY: z.string().trim().min(1).optional(),
    NOTIFICATION_WORKER_MESSAGING_MEDIA_INGESTION_ENABLED: z
      .enum(["true", "false"])
      .default("false"),
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
    NOTIFICATION_WORKER_MESSAGING_PROVIDER_WEBHOOK_PROCESSING_ENABLED: z
      .enum(["true", "false"])
      .default("false"),
    NOTIFICATION_WORKER_MESSAGING_PROVIDER_WEBHOOK_PROCESSING_ATTEMPTS: z.coerce
      .number()
      .int()
      .positive()
      .default(5),
    NOTIFICATION_WORKER_MESSAGING_PROVIDER_WEBHOOK_PROCESSING_BACKOFF_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(1000),
    NOTIFICATION_WORKER_MESSAGING_PROVIDER_WEBHOOK_PROCESSING_BATCH_SIZE: z.coerce
      .number()
      .int()
      .positive()
      .default(50),
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
    NOTIFICATION_WORKER_TELEGRAM_MTPROTO_SESSION_ENCRYPTION_KEY: z
      .string()
      .trim()
      .min(1)
      .optional(),
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
    NOTIFICATION_WORKER_TELEGRAM_MTPROTO_CLAIM_LIMIT: z.coerce
      .number()
      .int()
      .positive()
      .default(25),
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
    NOTIFICATION_WORKER_AUTH_CODE_EMAIL_SMTP_HOST: z.string().trim().min(1).optional(),
    NOTIFICATION_WORKER_AUTH_CODE_EMAIL_SMTP_PORT: z.coerce.number().int().positive().optional(),
    NOTIFICATION_WORKER_AUTH_CODE_EMAIL_SMTP_SECURE: z.enum(["true", "false"]).optional(),
    NOTIFICATION_WORKER_AUTH_CODE_EMAIL_SMTP_USER: z.string().trim().min(1).optional(),
    NOTIFICATION_WORKER_AUTH_CODE_EMAIL_SMTP_PASSWORD: z.string().trim().min(1).optional(),
    NOTIFICATION_WORKER_AUTH_CODE_EMAIL_FROM: z.string().trim().min(1).optional(),
    NOTIFICATION_WORKER_AUTH_CODE_SMS_DELIVERY_ENDPOINT_URL: z.string().trim().url().optional(),
    NOTIFICATION_WORKER_AUTH_CODE_SMS_DELIVERY_BEARER_TOKEN: z.string().trim().min(1).optional(),
    NOTIFICATION_WORKER_AUTH_CODE_SMS_FROM: z.string().trim().min(1).optional()
  })
  .superRefine((config, context) => {
    if (config.NOTIFICATION_WORKER_AUTH_CODE_DELIVERY_MODE === "smtp") {
      requireDeliverySetting(
        config.NOTIFICATION_WORKER_AUTH_CODE_EMAIL_SMTP_HOST,
        ["NOTIFICATION_WORKER_AUTH_CODE_EMAIL_SMTP_HOST"],
        context
      );
      requireDeliverySetting(
        config.NOTIFICATION_WORKER_AUTH_CODE_EMAIL_SMTP_PORT,
        ["NOTIFICATION_WORKER_AUTH_CODE_EMAIL_SMTP_PORT"],
        context
      );
      requireDeliverySetting(
        config.NOTIFICATION_WORKER_AUTH_CODE_EMAIL_SMTP_SECURE,
        ["NOTIFICATION_WORKER_AUTH_CODE_EMAIL_SMTP_SECURE"],
        context
      );
      requireDeliverySetting(
        config.NOTIFICATION_WORKER_AUTH_CODE_EMAIL_SMTP_USER,
        ["NOTIFICATION_WORKER_AUTH_CODE_EMAIL_SMTP_USER"],
        context
      );
      requireDeliverySetting(
        config.NOTIFICATION_WORKER_AUTH_CODE_EMAIL_SMTP_PASSWORD,
        ["NOTIFICATION_WORKER_AUTH_CODE_EMAIL_SMTP_PASSWORD"],
        context
      );
      requireDeliverySetting(
        config.NOTIFICATION_WORKER_AUTH_CODE_EMAIL_FROM,
        ["NOTIFICATION_WORKER_AUTH_CODE_EMAIL_FROM"],
        context
      );
    }

    if (
      config.NOTIFICATION_WORKER_AUTH_CODE_SMS_DELIVERY_ENDPOINT_URL !== undefined ||
      config.NOTIFICATION_WORKER_AUTH_CODE_SMS_DELIVERY_BEARER_TOKEN !== undefined ||
      config.NOTIFICATION_WORKER_AUTH_CODE_SMS_FROM !== undefined
    ) {
      requireDeliverySetting(
        config.NOTIFICATION_WORKER_AUTH_CODE_SMS_DELIVERY_ENDPOINT_URL,
        ["NOTIFICATION_WORKER_AUTH_CODE_SMS_DELIVERY_ENDPOINT_URL"],
        context,
        "SMS HTTP auth code delivery settings are required when SMS delivery is configured"
      );
      requireDeliverySetting(
        config.NOTIFICATION_WORKER_AUTH_CODE_SMS_DELIVERY_BEARER_TOKEN,
        ["NOTIFICATION_WORKER_AUTH_CODE_SMS_DELIVERY_BEARER_TOKEN"],
        context,
        "SMS HTTP auth code delivery settings are required when SMS delivery is configured"
      );
      requireDeliverySetting(
        config.NOTIFICATION_WORKER_AUTH_CODE_SMS_FROM,
        ["NOTIFICATION_WORKER_AUTH_CODE_SMS_FROM"],
        context,
        "SMS HTTP auth code delivery settings are required when SMS delivery is configured"
      );
    }

    if (
      config.NOTIFICATION_WORKER_MESSAGING_DELIVERY_ENABLED === "true" ||
      config.NOTIFICATION_WORKER_MESSAGING_MEDIA_INGESTION_ENABLED === "true"
    ) {
      requireDeliverySetting(
        config.NOTIFICATION_WORKER_TELEGRAM_BOT_TOKEN,
        ["NOTIFICATION_WORKER_TELEGRAM_BOT_TOKEN"],
        context
      );
    }

    if (config.NOTIFICATION_WORKER_INSTAGRAM_GRAPH_DELIVERY_ENABLED === "true") {
      requireDeliverySetting(
        config.NOTIFICATION_WORKER_INSTAGRAM_GRAPH_TOKEN_ENCRYPTION_KEY,
        ["NOTIFICATION_WORKER_INSTAGRAM_GRAPH_TOKEN_ENCRYPTION_KEY"],
        context
      );
    }

    if (config.NOTIFICATION_WORKER_WHATSAPP_CLOUD_DELIVERY_ENABLED === "true") {
      requireDeliverySetting(
        config.NOTIFICATION_WORKER_WHATSAPP_CLOUD_TOKEN_ENCRYPTION_KEY,
        ["NOTIFICATION_WORKER_WHATSAPP_CLOUD_TOKEN_ENCRYPTION_KEY"],
        context
      );
    }

    const hasAnyMtprotoSetting =
      config.NOTIFICATION_WORKER_TELEGRAM_MTPROTO_ENABLED === "true" ||
      config.NOTIFICATION_WORKER_TELEGRAM_MTPROTO_API_ID !== undefined ||
      config.NOTIFICATION_WORKER_TELEGRAM_MTPROTO_API_HASH !== undefined ||
      config.NOTIFICATION_WORKER_TELEGRAM_MTPROTO_SESSION_ENCRYPTION_KEY !== undefined;
    if (hasAnyMtprotoSetting) {
      requireDeliverySetting(
        config.NOTIFICATION_WORKER_TELEGRAM_MTPROTO_API_ID === undefined
          ? undefined
          : String(config.NOTIFICATION_WORKER_TELEGRAM_MTPROTO_API_ID),
        ["NOTIFICATION_WORKER_TELEGRAM_MTPROTO_API_ID"],
        context
      );
      requireDeliverySetting(
        config.NOTIFICATION_WORKER_TELEGRAM_MTPROTO_API_HASH,
        ["NOTIFICATION_WORKER_TELEGRAM_MTPROTO_API_HASH"],
        context
      );
      requireDeliverySetting(
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

export type AuthCodeSmtpDeliveryOptions = {
  readonly host: string;
  readonly port: number;
  readonly secure: boolean;
  readonly user: string;
  readonly password: string;
  readonly from: string;
};

export type NotificationWorkerRuntimeConfig = {
  readonly redisUrl: string;
  readonly authCodeDeliveryEncryptionKey: Buffer;
  readonly authCodeDeliveryMode: "smtp" | "dev_console";
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
  readonly instagramGraphDelivery: InstagramGraphDeliveryOptions | null;
  readonly whatsappCloudDelivery: WhatsAppCloudDeliveryOptions | null;
  readonly messagingMediaIngestionEnabled: boolean;
  readonly messagingMediaIngestionAttempts: number;
  readonly messagingMediaIngestionBackoffMs: number;
  readonly messagingMediaIngestionBatchSize: number;
  readonly messagingMediaIngestionMaxBytes: number;
  readonly messagingProviderWebhookProcessingEnabled: boolean;
  readonly messagingProviderWebhookProcessingAttempts: number;
  readonly messagingProviderWebhookProcessingBackoffMs: number;
  readonly messagingProviderWebhookProcessingBatchSize: number;
  readonly mediaStorage: MessagingMediaStorageOptions;
  readonly telegramBusinessDelivery: TelegramBusinessDeliveryOptions | null;
  readonly telegramMtproto: TelegramMtprotoOptions | null;
  readonly authCodeEmailSmtpDelivery: AuthCodeSmtpDeliveryOptions | null;
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

export type InstagramGraphDeliveryOptions = {
  readonly graphApiBaseUrl: string;
  readonly tokenEncryptionKey: Buffer;
};

export type WhatsAppCloudDeliveryOptions = {
  readonly graphApiBaseUrl: string;
  readonly tokenEncryptionKey: Buffer;
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
    instagramGraphDelivery:
      config.NOTIFICATION_WORKER_INSTAGRAM_GRAPH_DELIVERY_ENABLED === "true"
        ? toInstagramGraphDeliveryOptions({
            graphApiBaseUrl: config.NOTIFICATION_WORKER_INSTAGRAM_GRAPH_API_BASE_URL,
            tokenEncryptionKey: config.NOTIFICATION_WORKER_INSTAGRAM_GRAPH_TOKEN_ENCRYPTION_KEY
          })
        : null,
    whatsappCloudDelivery:
      config.NOTIFICATION_WORKER_WHATSAPP_CLOUD_DELIVERY_ENABLED === "true"
        ? toWhatsAppCloudDeliveryOptions({
            graphApiBaseUrl: config.NOTIFICATION_WORKER_WHATSAPP_CLOUD_GRAPH_API_BASE_URL,
            tokenEncryptionKey: config.NOTIFICATION_WORKER_WHATSAPP_CLOUD_TOKEN_ENCRYPTION_KEY
          })
        : null,
    messagingMediaIngestionEnabled:
      config.NOTIFICATION_WORKER_MESSAGING_MEDIA_INGESTION_ENABLED === "true",
    messagingMediaIngestionAttempts: config.NOTIFICATION_WORKER_MESSAGING_MEDIA_INGESTION_ATTEMPTS,
    messagingMediaIngestionBackoffMs:
      config.NOTIFICATION_WORKER_MESSAGING_MEDIA_INGESTION_BACKOFF_MS,
    messagingMediaIngestionBatchSize:
      config.NOTIFICATION_WORKER_MESSAGING_MEDIA_INGESTION_BATCH_SIZE,
    messagingMediaIngestionMaxBytes: config.NOTIFICATION_WORKER_MESSAGING_MEDIA_MAX_BYTES,
    messagingProviderWebhookProcessingEnabled:
      config.NOTIFICATION_WORKER_MESSAGING_PROVIDER_WEBHOOK_PROCESSING_ENABLED === "true",
    messagingProviderWebhookProcessingAttempts:
      config.NOTIFICATION_WORKER_MESSAGING_PROVIDER_WEBHOOK_PROCESSING_ATTEMPTS,
    messagingProviderWebhookProcessingBackoffMs:
      config.NOTIFICATION_WORKER_MESSAGING_PROVIDER_WEBHOOK_PROCESSING_BACKOFF_MS,
    messagingProviderWebhookProcessingBatchSize:
      config.NOTIFICATION_WORKER_MESSAGING_PROVIDER_WEBHOOK_PROCESSING_BATCH_SIZE,
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
    authCodeEmailSmtpDelivery:
      config.NOTIFICATION_WORKER_AUTH_CODE_DELIVERY_MODE === "dev_console"
        ? null
        : toSmtpDeliveryOptions({
            host: config.NOTIFICATION_WORKER_AUTH_CODE_EMAIL_SMTP_HOST,
            port: config.NOTIFICATION_WORKER_AUTH_CODE_EMAIL_SMTP_PORT,
            secure: config.NOTIFICATION_WORKER_AUTH_CODE_EMAIL_SMTP_SECURE,
            user: config.NOTIFICATION_WORKER_AUTH_CODE_EMAIL_SMTP_USER,
            password: config.NOTIFICATION_WORKER_AUTH_CODE_EMAIL_SMTP_PASSWORD,
            from: config.NOTIFICATION_WORKER_AUTH_CODE_EMAIL_FROM
          }),
    authCodeSmsDelivery: toOptionalHttpDeliveryOptions({
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

function toInstagramGraphDeliveryOptions(input: {
  readonly graphApiBaseUrl: string;
  readonly tokenEncryptionKey: string | undefined;
}): InstagramGraphDeliveryOptions {
  if (!input.tokenEncryptionKey) {
    throw new Error(
      "Instagram Graph delivery settings are required when Instagram delivery is enabled"
    );
  }

  return {
    graphApiBaseUrl: input.graphApiBaseUrl,
    tokenEncryptionKey: parseBase64Aes256GcmKey(input.tokenEncryptionKey)
  };
}

function toWhatsAppCloudDeliveryOptions(input: {
  readonly graphApiBaseUrl: string;
  readonly tokenEncryptionKey: string | undefined;
}): WhatsAppCloudDeliveryOptions {
  if (!input.tokenEncryptionKey) {
    throw new Error(
      "WhatsApp Cloud delivery settings are required when WhatsApp delivery is enabled"
    );
  }

  return {
    graphApiBaseUrl: input.graphApiBaseUrl.replace(/\/+$/, ""),
    tokenEncryptionKey: parseBase64Aes256GcmKey(input.tokenEncryptionKey)
  };
}

function toTelegramBusinessDeliveryOptions(input: {
  readonly botToken: string | undefined;
  readonly botApiBaseUrl: string;
}): TelegramBusinessDeliveryOptions {
  if (!input.botToken) {
    throw new Error(
      "Telegram Business delivery settings are required when messaging delivery is enabled"
    );
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
    throw new Error(
      "SMS HTTP auth code delivery settings are required when SMS delivery is configured"
    );
  }

  return {
    endpointUrl: input.endpointUrl,
    bearerToken: input.bearerToken,
    from: input.from
  };
}

function toOptionalHttpDeliveryOptions(input: {
  readonly endpointUrl: string | undefined;
  readonly bearerToken: string | undefined;
  readonly from: string | undefined;
}): AuthCodeHttpDeliveryOptions | null {
  if (!input.endpointUrl && !input.bearerToken && !input.from) {
    return null;
  }

  return toHttpDeliveryOptions(input);
}

function toSmtpDeliveryOptions(input: {
  readonly host: string | undefined;
  readonly port: number | undefined;
  readonly secure: "true" | "false" | undefined;
  readonly user: string | undefined;
  readonly password: string | undefined;
  readonly from: string | undefined;
}): AuthCodeSmtpDeliveryOptions {
  if (
    !input.host ||
    input.port === undefined ||
    input.secure === undefined ||
    !input.user ||
    !input.password ||
    !input.from
  ) {
    throw new Error("SMTP auth code email delivery settings are required in smtp mode");
  }

  return {
    host: input.host,
    port: input.port,
    secure: input.secure === "true",
    user: input.user,
    password: input.password,
    from: input.from
  };
}

function requireDeliverySetting(
  value: string | number | undefined,
  path: readonly string[],
  context: z.RefinementCtx,
  message = "Invalid input: expected string, received undefined"
): void {
  if (value !== undefined) {
    return;
  }

  context.addIssue({
    code: "invalid_type",
    expected: "string",
    received: "undefined",
    path: [...path],
    message
  });
}
