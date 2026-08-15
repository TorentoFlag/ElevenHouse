import { parseBase64Aes256GcmKey } from "@elevenhouse/auth";
import { z } from "@elevenhouse/validation";

const officialGeoapifyBaseUrl = "https://api.geoapify.com";
const officialOpenAiApiBaseUrl = "https://api.openai.com/v1";
const productionChartEngineBaseUrl = "http://chart-engine:8012";

const localAstrologerSessionCookieName = "elevenhouse_astrologer_session";
const secureAstrologerSessionCookieName = "__Host-elevenhouse_astrologer_session";
const localTrustedStaticPasswordlessCode = {
  channel: "phone" as const,
  identifierNormalized: "+78005553535",
  code: "777777"
};
const optionalTrimmedNonEmptyStringSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().min(1).optional()
);
const optionalTelegramBotUsernameSchema = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    return trimmed.replace(/^@/, "");
  },
  z
    .string()
    .regex(/^[A-Za-z0-9_]{5,32}$/)
    .optional()
);

const astrologerApiRuntimeConfigSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  ASTROLOGER_API_PORT: z.coerce.number().int().positive().default(3002),
  ASTROLOGER_API_TRUST_PROXY: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  REDIS_URL: z.string().trim().min(1).default("redis://localhost:6379"),
  LIVEKIT_URL: optionalTrimmedNonEmptyStringSchema,
  LIVEKIT_API_KEY: optionalTrimmedNonEmptyStringSchema,
  LIVEKIT_API_SECRET: optionalTrimmedNonEmptyStringSchema,
  LIVEKIT_ROOM_PREFIX: z.string().trim().min(1).max(80).default("session_"),
  ASTROLOGER_API_SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(604800),
  ASTROLOGER_API_MOBILE_ACCESS_TOKEN_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .max(3600)
    .default(900),
  ASTROLOGER_API_MOBILE_SESSION_IDLE_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(15_552_000),
  ASTROLOGER_API_SESSION_COOKIE_SECURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  ASTROLOGER_API_SESSION_COOKIE_NAME: z.string().trim().min(1).optional(),
  ASTROLOGER_API_CSRF_SECRET: z.string().trim().min(32).optional(),
  ASTROLOGER_API_CSRF_COOKIE_NAME: z.string().trim().min(1).default("elevenhouse_astrologer_csrf"),
  ASTROLOGER_API_CSRF_HEADER_NAME: z.string().trim().min(1).default("x-csrf-token"),
  ASTROLOGER_API_CSRF_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(604800),
  ASTROLOGER_API_TELEGRAM_BOT_WEBHOOK_SECRET: optionalTrimmedNonEmptyStringSchema,
  ASTROLOGER_API_TELEGRAM_BOT_TOKEN: optionalTrimmedNonEmptyStringSchema,
  ASTROLOGER_API_TELEGRAM_BOT_API_BASE_URL: z.string().trim().url().optional(),
  ASTROLOGER_API_TELEGRAM_BUSINESS_BOT_USERNAME: optionalTelegramBotUsernameSchema,
  ASTROLOGER_API_TELEGRAM_MTPROTO_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  ASTROLOGER_API_TELEGRAM_MTPROTO_API_ID: z.coerce.number().int().positive().optional(),
  ASTROLOGER_API_TELEGRAM_MTPROTO_API_HASH: z
    .string()
    .trim()
    .regex(/^[a-f0-9]{32}$/i)
    .optional(),
  ASTROLOGER_API_TELEGRAM_MTPROTO_SESSION_ENCRYPTION_KEY: z.string().trim().min(1).optional(),
  ASTROLOGER_API_INSTAGRAM_GRAPH_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  ASTROLOGER_API_INSTAGRAM_GRAPH_APP_ID: optionalTrimmedNonEmptyStringSchema,
  ASTROLOGER_API_INSTAGRAM_GRAPH_APP_SECRET: optionalTrimmedNonEmptyStringSchema,
  ASTROLOGER_API_INSTAGRAM_GRAPH_REDIRECT_URI: z.string().trim().url().optional(),
  ASTROLOGER_API_INSTAGRAM_GRAPH_TOKEN_ENCRYPTION_KEY: z.string().trim().min(1).optional(),
  ASTROLOGER_API_INSTAGRAM_GRAPH_WEBHOOK_VERIFY_TOKEN: optionalTrimmedNonEmptyStringSchema,
  ASTROLOGER_API_INSTAGRAM_GRAPH_CALLBACK_STATE_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(900),
  ASTROLOGER_API_INSTAGRAM_GRAPH_AUTH_BASE_URL: z
    .string()
    .trim()
    .url()
    .default("https://www.instagram.com/oauth/authorize"),
  ASTROLOGER_API_INSTAGRAM_GRAPH_TOKEN_EXCHANGE_BASE_URL: z
    .string()
    .trim()
    .url()
    .default("https://api.instagram.com"),
  ASTROLOGER_API_INSTAGRAM_GRAPH_GRAPH_TOKEN_BASE_URL: z
    .string()
    .trim()
    .url()
    .default("https://graph.instagram.com"),
  ASTROLOGER_API_INSTAGRAM_GRAPH_API_BASE_URL: z
    .string()
    .trim()
    .url()
    .default("https://graph.instagram.com/v25.0"),
  ASTROLOGER_API_INSTAGRAM_GRAPH_SCOPES: z
    .string()
    .trim()
    .default("instagram_business_basic,instagram_business_manage_messages"),
  ASTROLOGER_API_ASTROLOGER_WEB_BASE_URL: z.string().trim().url().default("http://localhost:5174"),
  ASTROLOGER_API_BIRTH_PLACE_SEARCH_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  ASTROLOGER_API_GEOAPIFY_BASE_URL: z.string().trim().url().default(officialGeoapifyBaseUrl),
  ASTROLOGER_API_GEOAPIFY_API_KEY: optionalTrimmedNonEmptyStringSchema,
  ASTROLOGER_API_BIRTH_PLACE_SEARCH_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .max(15000)
    .default(5000),
  ASTROLOGER_API_BIRTH_PLACE_SEARCH_CACHE_SUCCESS_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(2592000),
  ASTROLOGER_API_BIRTH_PLACE_SEARCH_CACHE_EMPTY_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(1800),
  ASTROLOGER_API_BIRTH_PLACE_SEARCH_LOCK_TTL_MS: z.coerce
    .number()
    .int()
    .positive()
    .max(20000)
    .default(6000),
  ASTROLOGER_API_BIRTH_PLACE_SEARCH_RATE_LIMIT_REDIS_KEY_PREFIX: z
    .string()
    .trim()
    .min(1)
    .default("elevenhouse:astrologer-api:birth-place-search"),
  ASTROLOGER_API_BIRTH_PLACE_SEARCH_RATE_LIMIT_USER_PER_MINUTE: z.coerce
    .number()
    .int()
    .positive()
    .default(20),
  ASTROLOGER_API_BIRTH_PLACE_SEARCH_RATE_LIMIT_GLOBAL_PER_MINUTE: z.coerce
    .number()
    .int()
    .positive()
    .default(120),
  ASTROLOGER_API_BIRTH_PLACE_SEARCH_RATE_LIMIT_GLOBAL_PER_DAY: z.coerce
    .number()
    .int()
    .positive()
    .default(2500),
  NOTIFICATION_WORKER_TELEGRAM_BOT_TOKEN: optionalTrimmedNonEmptyStringSchema,
  NOTIFICATION_WORKER_TELEGRAM_BOT_API_BASE_URL: z.string().trim().url().optional(),
  ASTROLOGER_API_ALLOWED_ORIGINS: z.string().trim().optional(),
  CHART_ENGINE_BASE_URL: z.string().trim().url().default("http://localhost:8012"),
  ASTROLOGER_MEDIA_STORAGE_ENDPOINT: z.string().trim().url().default("http://localhost:9000"),
  ASTROLOGER_MEDIA_STORAGE_REGION: z.string().trim().min(1).default("us-east-1"),
  ASTROLOGER_MEDIA_STORAGE_BUCKET: z.string().trim().min(1).default("elevenhouse-local-media"),
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
  ASTROLOGER_MEDIA_STORAGE_FORCE_PATH_STYLE: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  ASTROLOGER_MEDIA_STORAGE_PUBLIC_BASE_URL: z.string().trim().url().optional(),
  ASTROLOGER_MEDIA_UPLOAD_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  ASTROLOGER_MEDIA_DOWNLOAD_TTL_SECONDS: z.coerce.number().int().positive().max(3600).default(300),
  ASTROLOGER_BILLING_ARC_PAY_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  ASTROLOGER_BILLING_ARC_PAY_API_BASE_URL: z.string().trim().url().optional(),
  ASTROLOGER_BILLING_ARC_PAY_PUBLISHABLE_KEY: z.string().trim().min(1).max(512).optional(),
  ASTROLOGER_BILLING_SAVED_CARD_DISCLOSURE_SERIES_ID: z.string().trim().min(1).max(160).optional(),
  ASTROLOGER_BILLING_FINANCE_ARTIFACT_DIRECTORY: z
    .string()
    .trim()
    .min(1)
    .default(".local/finance-artifacts"),
  ASTROLOGER_BILLING_FINANCE_PROVIDER_REQUEST_RETENTION_POLICY_ID: z
    .string()
    .trim()
    .min(1)
    .default("provider-request"),
  ASTROLOGER_BILLING_FINANCE_PROVIDER_REQUEST_RETENTION_POLICY_VERSION: z
    .string()
    .regex(/^[1-9][0-9]*$/)
    .default("1"),
  AUTH_CODE_DELIVERY_ENCRYPTION_KEY: z.string().trim().min(1),
  ASTROLOGER_API_PASSWORDLESS_CODE_SECRET: z.string().trim().min(1).optional(),
  ASTROLOGER_API_PASSWORDLESS_CODE_TTL_SECONDS: z.coerce.number().int().positive().default(600),
  ASTROLOGER_API_PASSWORDLESS_RESEND_COOLDOWN_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(60),
  ASTROLOGER_API_PASSWORDLESS_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  ASTROLOGER_API_PASSWORDLESS_REQUEST_CODE_IDENTIFIER_LIMIT: z.coerce
    .number()
    .int()
    .positive()
    .default(5),
  ASTROLOGER_API_PASSWORDLESS_REQUEST_CODE_IDENTIFIER_WINDOW_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(3600),
  ASTROLOGER_API_PASSWORDLESS_REQUEST_CODE_IP_LIMIT: z.coerce.number().int().positive().default(30),
  ASTROLOGER_API_PASSWORDLESS_REQUEST_CODE_IP_WINDOW_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(3600),
  ASTROLOGER_API_PASSWORDLESS_REQUEST_CODE_IDENTIFIER_IP_LIMIT: z.coerce
    .number()
    .int()
    .positive()
    .default(3),
  ASTROLOGER_API_PASSWORDLESS_REQUEST_CODE_IDENTIFIER_IP_WINDOW_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(3600),
  ASTROLOGER_API_PASSWORDLESS_VERIFY_CHALLENGE_LIMIT: z.coerce.number().int().positive().default(5),
  ASTROLOGER_API_PASSWORDLESS_VERIFY_CHALLENGE_WINDOW_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(900),
  ASTROLOGER_API_PASSWORDLESS_VERIFY_IP_LIMIT: z.coerce.number().int().positive().default(60),
  ASTROLOGER_API_PASSWORDLESS_VERIFY_IP_WINDOW_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(900),
  ASTROLOGER_API_MOBILE_REFRESH_TOKEN_LIMIT: z.coerce.number().int().positive().default(30),
  ASTROLOGER_API_MOBILE_REFRESH_TOKEN_WINDOW_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(60),
  ASTROLOGER_API_MOBILE_REFRESH_IP_LIMIT: z.coerce.number().int().positive().default(120),
  ASTROLOGER_API_MOBILE_REFRESH_IP_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
  ASTROLOGER_API_PASSWORDLESS_RATE_LIMIT_REDIS_KEY_PREFIX: z
    .string()
    .trim()
    .min(1)
    .default("elevenhouse:astrologer-api"),
  ASTROLOGER_AI_PROVIDER: z.literal("openai").default("openai"),
  ASTROLOGER_OPENAI_API_KEY: optionalTrimmedNonEmptyStringSchema,
  ASTROLOGER_OPENAI_BASE_URL: z.string().trim().url().default(officialOpenAiApiBaseUrl),
  ASTROLOGER_AI_FAST_DRAFT_MODEL: z.enum(["gpt-5.4-mini", "gpt-5.5"]).default("gpt-5.4-mini"),
  ASTROLOGER_AI_QUALITY_DRAFT_MODEL: z.enum(["gpt-5.4-mini", "gpt-5.5"]).default("gpt-5.5"),
  ASTROLOGER_AI_TIMEOUT_MS: z.coerce.number().int().positive().default(90_000),
  ASTROLOGER_AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().default(5000),
  ASTROLOGER_AI_RATE_LIMIT_USER_PER_MINUTE: z.coerce.number().int().positive().default(3),
  ASTROLOGER_AI_RATE_LIMIT_USER_PER_HOUR: z.coerce.number().int().positive().default(30),
  ASTROLOGER_AI_RATE_LIMIT_USER_PER_DAY: z.coerce.number().int().positive().default(150),
  ASTROLOGER_AI_RATE_LIMIT_REDIS_KEY_PREFIX: z
    .string()
    .trim()
    .min(1)
    .default("elevenhouse:astrologer-api:ai")
});

export type AstrologerApiRuntimeConfig = {
  readonly port: number;
  readonly trustProxy: boolean;
  readonly redisUrl: string;
  readonly mediaRoom: LiveKitRuntimeOptions | null;
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- Flow runtime has no API config after V1 rollout removal.
  readonly flows: {};
  readonly sessionTtlSeconds: number;
  readonly mobileAccessTokenTtlSeconds: number;
  readonly mobileSessionIdleTtlSeconds: number;
  readonly sessionCookieSecure: boolean;
  readonly sessionCookieName: string;
  readonly csrfSecret: string;
  readonly csrfCookieName: string;
  readonly csrfHeaderName: string;
  readonly csrfTokenTtlSeconds: number;
  readonly telegramBotWebhookSecret: string | null;
  readonly telegramBusinessBotApi: {
    readonly botToken: string;
    readonly botApiBaseUrl: string;
  } | null;
  readonly telegramBusinessBotUsername: string | null;
  readonly telegramMtproto: {
    readonly enabled: true;
    readonly apiId: number;
    readonly apiHash: string;
    readonly sessionEncryptionKey: Buffer;
  } | null;
  readonly instagramGraph: {
    readonly enabled: true;
    readonly appId: string;
    readonly appSecret: string;
    readonly redirectUri: string;
    readonly tokenEncryptionKey: Buffer;
    readonly webhookVerifyToken: string | null;
    readonly callbackStateTtlSeconds: number;
    readonly authBaseUrl: string;
    readonly tokenExchangeBaseUrl: string;
    readonly graphTokenBaseUrl: string;
    readonly graphApiBaseUrl: string;
    readonly astrologerWebBaseUrl: string;
    readonly scopes: readonly string[];
  } | null;
  readonly birthPlaceSearch: {
    readonly enabled: boolean;
    readonly provider: "geoapify";
    readonly baseUrl: string;
    readonly apiKey?: string;
    readonly timeoutMs: number;
    readonly cacheSuccessTtlSeconds: number;
    readonly cacheEmptyTtlSeconds: number;
    readonly lockTtlMs: number;
    readonly rateLimitRedisKeyPrefix: string;
    readonly rateLimits: {
      readonly userPerMinute: {
        readonly limit: number;
        readonly windowSeconds: number;
      };
      readonly globalPerMinute: {
        readonly limit: number;
        readonly windowSeconds: number;
      };
      readonly globalPerDay: {
        readonly limit: number;
        readonly windowSeconds: number;
      };
    };
  };
  readonly allowedOrigins: readonly string[];
  readonly chartEngineBaseUrl: string;
  readonly authCodeDeliveryEncryptionKey: Buffer;
  readonly passwordlessCodeSecret: string;
  readonly passwordlessCodeTtlSeconds: number;
  readonly passwordlessResendCooldownSeconds: number;
  readonly passwordlessMaxAttempts: number;
  readonly passwordlessTrustedStaticCode: typeof localTrustedStaticPasswordlessCode;
  readonly passwordlessRateLimitRedisKeyPrefix: string;
  readonly passwordlessRateLimits: {
    readonly requestCodeIdentifier: {
      readonly limit: number;
      readonly windowSeconds: number;
    };
    readonly requestCodeIp: {
      readonly limit: number;
      readonly windowSeconds: number;
    };
    readonly requestCodeIdentifierIp: {
      readonly limit: number;
      readonly windowSeconds: number;
    };
    readonly verifyChallenge: {
      readonly limit: number;
      readonly windowSeconds: number;
    };
    readonly verifyIp: {
      readonly limit: number;
      readonly windowSeconds: number;
    };
    readonly mobileRefreshToken: {
      readonly limit: number;
      readonly windowSeconds: number;
    };
    readonly mobileRefreshIp: {
      readonly limit: number;
      readonly windowSeconds: number;
    };
  };
  readonly mediaStorage: {
    readonly endpoint: string;
    readonly region: string;
    readonly bucket: string;
    readonly privateBucket: string;
    readonly accessKeyId: string;
    readonly secretAccessKey: string;
    readonly forcePathStyle: boolean;
    readonly publicBaseUrl: string;
    readonly uploadTtlSeconds: number;
    readonly downloadTtlSeconds: number;
  };
  readonly billing: {
    readonly arcPayConfigured: boolean;
    readonly arcPayBrowserTokenization: Readonly<{
      apiBaseUrl: string;
      publishableKey: string;
    }> | null;
    /** Local immutable finance storage; card tokens are sealed here before a DB reference is written. */
    readonly financeArtifactStorage: Readonly<{
      artifactDirectory: string;
      requestRetention: Readonly<{ policyId: string; policyVersion: string }>;
    }> | null;
    /** Legal authority is intentionally absent until an operator configures a published series. */
    readonly savedCardDisclosureSeriesId: string | null;
  };
  readonly ai: {
    readonly provider: "openai";
    readonly openAiApiKey?: string;
    readonly openAiBaseUrl: string;
    readonly fastDraftModel: "gpt-5.4-mini" | "gpt-5.5";
    readonly qualityDraftModel: "gpt-5.4-mini" | "gpt-5.5";
    readonly timeoutMs: number;
    readonly maxOutputTokens: number;
    readonly rateLimitRedisKeyPrefix: string;
    readonly rateLimits: {
      readonly userPerMinute: {
        readonly limit: number;
        readonly windowSeconds: number;
      };
      readonly userPerHour: {
        readonly limit: number;
        readonly windowSeconds: number;
      };
      readonly userPerDay: {
        readonly limit: number;
        readonly windowSeconds: number;
      };
    };
  };
};

export function createAstrologerApiRuntimeConfig(
  source: Record<string, string | undefined> = process.env
): AstrologerApiRuntimeConfig {
  const config = astrologerApiRuntimeConfigSchema.parse(source);
  const mediaRoom = resolveLiveKitRuntimeOptions(config);
  if (config.ASTROLOGER_MEDIA_PRIVATE_STORAGE_BUCKET === config.ASTROLOGER_MEDIA_STORAGE_BUCKET) {
    throw new Error("Private and public media storage buckets must be different");
  }
  const sessionCookieName =
    config.ASTROLOGER_API_SESSION_COOKIE_NAME ??
    (config.ASTROLOGER_API_SESSION_COOKIE_SECURE
      ? secureAstrologerSessionCookieName
      : localAstrologerSessionCookieName);

  if (config.NODE_ENV === "production" && !config.ASTROLOGER_API_SESSION_COOKIE_SECURE) {
    throw new Error("ASTROLOGER_API_SESSION_COOKIE_SECURE=true is required in production");
  }

  if (sessionCookieName.startsWith("__Host-") && !config.ASTROLOGER_API_SESSION_COOKIE_SECURE) {
    throw new Error("__Host-prefixed astrologer session cookies require Secure=true");
  }

  if (config.NODE_ENV === "production" && !config.ASTROLOGER_API_CSRF_SECRET) {
    throw new Error("ASTROLOGER_API_CSRF_SECRET is required in production");
  }

  if (config.NODE_ENV === "production" && !config.ASTROLOGER_API_TELEGRAM_BOT_WEBHOOK_SECRET) {
    throw new Error("ASTROLOGER_API_TELEGRAM_BOT_WEBHOOK_SECRET is required in production");
  }

  const telegramBusinessBotToken =
    config.ASTROLOGER_API_TELEGRAM_BOT_TOKEN ?? config.NOTIFICATION_WORKER_TELEGRAM_BOT_TOKEN;
  const telegramBusinessBotApiBaseUrl =
    config.ASTROLOGER_API_TELEGRAM_BOT_API_BASE_URL ??
    config.NOTIFICATION_WORKER_TELEGRAM_BOT_API_BASE_URL ??
    "https://api.telegram.org";

  if (config.NODE_ENV === "production" && !telegramBusinessBotToken) {
    throw new Error("ASTROLOGER_API_TELEGRAM_BOT_TOKEN is required in production");
  }

  if (config.NODE_ENV === "production" && !config.ASTROLOGER_API_TELEGRAM_BUSINESS_BOT_USERNAME) {
    throw new Error("ASTROLOGER_API_TELEGRAM_BUSINESS_BOT_USERNAME is required in production");
  }

  const telegramMtproto = toTelegramMtprotoConfig({
    enabled: config.ASTROLOGER_API_TELEGRAM_MTPROTO_ENABLED,
    apiId: config.ASTROLOGER_API_TELEGRAM_MTPROTO_API_ID,
    apiHash: config.ASTROLOGER_API_TELEGRAM_MTPROTO_API_HASH,
    sessionEncryptionKey: config.ASTROLOGER_API_TELEGRAM_MTPROTO_SESSION_ENCRYPTION_KEY
  });
  const instagramGraph = toInstagramGraphConfig({
    enabled: config.ASTROLOGER_API_INSTAGRAM_GRAPH_ENABLED,
    appId: config.ASTROLOGER_API_INSTAGRAM_GRAPH_APP_ID,
    appSecret: config.ASTROLOGER_API_INSTAGRAM_GRAPH_APP_SECRET,
    redirectUri: config.ASTROLOGER_API_INSTAGRAM_GRAPH_REDIRECT_URI,
    tokenEncryptionKey: config.ASTROLOGER_API_INSTAGRAM_GRAPH_TOKEN_ENCRYPTION_KEY,
    webhookVerifyToken: config.ASTROLOGER_API_INSTAGRAM_GRAPH_WEBHOOK_VERIFY_TOKEN,
    callbackStateTtlSeconds: config.ASTROLOGER_API_INSTAGRAM_GRAPH_CALLBACK_STATE_TTL_SECONDS,
    authBaseUrl: config.ASTROLOGER_API_INSTAGRAM_GRAPH_AUTH_BASE_URL,
    tokenExchangeBaseUrl: config.ASTROLOGER_API_INSTAGRAM_GRAPH_TOKEN_EXCHANGE_BASE_URL,
    graphTokenBaseUrl: config.ASTROLOGER_API_INSTAGRAM_GRAPH_GRAPH_TOKEN_BASE_URL,
    graphApiBaseUrl: config.ASTROLOGER_API_INSTAGRAM_GRAPH_API_BASE_URL,
    astrologerWebBaseUrl: config.ASTROLOGER_API_ASTROLOGER_WEB_BASE_URL,
    scopes: config.ASTROLOGER_API_INSTAGRAM_GRAPH_SCOPES
  });

  if (config.NODE_ENV === "production" && !config.ASTROLOGER_API_PASSWORDLESS_CODE_SECRET) {
    throw new Error("ASTROLOGER_API_PASSWORDLESS_CODE_SECRET is required in production");
  }

  const allowedOrigins = parseAllowedOrigins(config.ASTROLOGER_API_ALLOWED_ORIGINS);
  const mediaStorageEndpoint = stripTrailingSlashes(config.ASTROLOGER_MEDIA_STORAGE_ENDPOINT);
  const mediaStoragePublicBaseUrl = stripTrailingSlashes(
    config.ASTROLOGER_MEDIA_STORAGE_PUBLIC_BASE_URL ??
      `${mediaStorageEndpoint}/${config.ASTROLOGER_MEDIA_STORAGE_BUCKET}`
  );
  const arcPayBrowserTokenization = resolveArcPayBrowserTokenization(config);
  const financeArtifactStorage = resolveBillingFinanceArtifactStorage(config);

  if (config.NODE_ENV === "production" && allowedOrigins.length === 0) {
    throw new Error("ASTROLOGER_API_ALLOWED_ORIGINS is required in production");
  }

  if (
    config.NODE_ENV === "production" &&
    ["localhost", "127.0.0.1", "::1", "[::1]"].includes(
      new URL(config.CHART_ENGINE_BASE_URL).hostname
    )
  ) {
    throw new Error("CHART_ENGINE_BASE_URL must not use a loopback host in production");
  }

  if (
    config.NODE_ENV === "production" &&
    !isExactRootOrigin(config.CHART_ENGINE_BASE_URL, productionChartEngineBaseUrl)
  ) {
    throw new Error(
      `CHART_ENGINE_BASE_URL must equal ${productionChartEngineBaseUrl} in production`
    );
  }

  if (!config.ASTROLOGER_OPENAI_API_KEY) {
    throw new Error("ASTROLOGER_OPENAI_API_KEY is required");
  }

  if (
    config.NODE_ENV === "production" &&
    new URL(config.ASTROLOGER_OPENAI_BASE_URL).protocol !== "https:"
  ) {
    throw new Error("ASTROLOGER_OPENAI_BASE_URL must use https in production");
  }

  if (config.ASTROLOGER_API_BIRTH_PLACE_SEARCH_ENABLED && !config.ASTROLOGER_API_GEOAPIFY_API_KEY) {
    throw new Error(
      "ASTROLOGER_API_GEOAPIFY_API_KEY is required when ASTROLOGER_API_BIRTH_PLACE_SEARCH_ENABLED=true"
    );
  }

  if (
    config.ASTROLOGER_API_BIRTH_PLACE_SEARCH_ENABLED &&
    config.ASTROLOGER_API_BIRTH_PLACE_SEARCH_LOCK_TTL_MS <=
      config.ASTROLOGER_API_BIRTH_PLACE_SEARCH_TIMEOUT_MS
  ) {
    throw new Error(
      "ASTROLOGER_API_BIRTH_PLACE_SEARCH_LOCK_TTL_MS must exceed ASTROLOGER_API_BIRTH_PLACE_SEARCH_TIMEOUT_MS"
    );
  }

  if (
    config.ASTROLOGER_API_BIRTH_PLACE_SEARCH_ENABLED &&
    new URL(config.ASTROLOGER_API_GEOAPIFY_BASE_URL).protocol !== "https:"
  ) {
    throw new Error(
      "ASTROLOGER_API_GEOAPIFY_BASE_URL must use HTTPS when ASTROLOGER_API_BIRTH_PLACE_SEARCH_ENABLED=true"
    );
  }

  if (
    config.NODE_ENV === "production" &&
    config.ASTROLOGER_API_BIRTH_PLACE_SEARCH_ENABLED &&
    !isExactRootOrigin(config.ASTROLOGER_API_GEOAPIFY_BASE_URL, officialGeoapifyBaseUrl)
  ) {
    throw new Error(
      `ASTROLOGER_API_GEOAPIFY_BASE_URL must equal ${officialGeoapifyBaseUrl} in production when birth-place search is enabled`
    );
  }

  return {
    port: config.ASTROLOGER_API_PORT,
    trustProxy: config.ASTROLOGER_API_TRUST_PROXY,
    redisUrl: config.REDIS_URL,
    mediaRoom,
    flows: {},
    sessionTtlSeconds: config.ASTROLOGER_API_SESSION_TTL_SECONDS,
    mobileAccessTokenTtlSeconds: config.ASTROLOGER_API_MOBILE_ACCESS_TOKEN_TTL_SECONDS,
    mobileSessionIdleTtlSeconds: config.ASTROLOGER_API_MOBILE_SESSION_IDLE_TTL_SECONDS,
    sessionCookieSecure: config.ASTROLOGER_API_SESSION_COOKIE_SECURE,
    sessionCookieName,
    csrfSecret:
      config.ASTROLOGER_API_CSRF_SECRET ??
      "elevenhouse-dev-astrologer-api-csrf-secret-change-before-production",
    csrfCookieName: config.ASTROLOGER_API_CSRF_COOKIE_NAME,
    csrfHeaderName: config.ASTROLOGER_API_CSRF_HEADER_NAME.toLowerCase(),
    csrfTokenTtlSeconds: config.ASTROLOGER_API_CSRF_TOKEN_TTL_SECONDS,
    telegramBotWebhookSecret: config.ASTROLOGER_API_TELEGRAM_BOT_WEBHOOK_SECRET ?? null,
    telegramBusinessBotApi: telegramBusinessBotToken
      ? {
          botToken: telegramBusinessBotToken,
          botApiBaseUrl: stripTrailingSlashes(telegramBusinessBotApiBaseUrl)
        }
      : null,
    telegramBusinessBotUsername: config.ASTROLOGER_API_TELEGRAM_BUSINESS_BOT_USERNAME ?? null,
    telegramMtproto,
    instagramGraph,
    birthPlaceSearch: {
      enabled: config.ASTROLOGER_API_BIRTH_PLACE_SEARCH_ENABLED,
      provider: "geoapify",
      baseUrl: stripTrailingSlashes(config.ASTROLOGER_API_GEOAPIFY_BASE_URL),
      apiKey: config.ASTROLOGER_API_GEOAPIFY_API_KEY,
      timeoutMs: config.ASTROLOGER_API_BIRTH_PLACE_SEARCH_TIMEOUT_MS,
      cacheSuccessTtlSeconds: config.ASTROLOGER_API_BIRTH_PLACE_SEARCH_CACHE_SUCCESS_TTL_SECONDS,
      cacheEmptyTtlSeconds: config.ASTROLOGER_API_BIRTH_PLACE_SEARCH_CACHE_EMPTY_TTL_SECONDS,
      lockTtlMs: config.ASTROLOGER_API_BIRTH_PLACE_SEARCH_LOCK_TTL_MS,
      rateLimitRedisKeyPrefix: config.ASTROLOGER_API_BIRTH_PLACE_SEARCH_RATE_LIMIT_REDIS_KEY_PREFIX,
      rateLimits: {
        userPerMinute: {
          limit: config.ASTROLOGER_API_BIRTH_PLACE_SEARCH_RATE_LIMIT_USER_PER_MINUTE,
          windowSeconds: 60
        },
        globalPerMinute: {
          limit: config.ASTROLOGER_API_BIRTH_PLACE_SEARCH_RATE_LIMIT_GLOBAL_PER_MINUTE,
          windowSeconds: 60
        },
        globalPerDay: {
          limit: config.ASTROLOGER_API_BIRTH_PLACE_SEARCH_RATE_LIMIT_GLOBAL_PER_DAY,
          windowSeconds: 86400
        }
      }
    },
    allowedOrigins: allowedOrigins.length > 0 ? allowedOrigins : ["http://localhost:5174"],
    chartEngineBaseUrl: stripTrailingSlashes(config.CHART_ENGINE_BASE_URL),
    authCodeDeliveryEncryptionKey: parseBase64Aes256GcmKey(
      config.AUTH_CODE_DELIVERY_ENCRYPTION_KEY
    ),
    passwordlessCodeSecret:
      config.ASTROLOGER_API_PASSWORDLESS_CODE_SECRET ??
      "elevenhouse-dev-astrologer-passwordless-code-secret",
    passwordlessCodeTtlSeconds: config.ASTROLOGER_API_PASSWORDLESS_CODE_TTL_SECONDS,
    passwordlessResendCooldownSeconds: config.ASTROLOGER_API_PASSWORDLESS_RESEND_COOLDOWN_SECONDS,
    passwordlessMaxAttempts: config.ASTROLOGER_API_PASSWORDLESS_MAX_ATTEMPTS,
    passwordlessTrustedStaticCode: localTrustedStaticPasswordlessCode,
    passwordlessRateLimitRedisKeyPrefix:
      config.ASTROLOGER_API_PASSWORDLESS_RATE_LIMIT_REDIS_KEY_PREFIX,
    passwordlessRateLimits: {
      requestCodeIdentifier: {
        limit: config.ASTROLOGER_API_PASSWORDLESS_REQUEST_CODE_IDENTIFIER_LIMIT,
        windowSeconds: config.ASTROLOGER_API_PASSWORDLESS_REQUEST_CODE_IDENTIFIER_WINDOW_SECONDS
      },
      requestCodeIp: {
        limit: config.ASTROLOGER_API_PASSWORDLESS_REQUEST_CODE_IP_LIMIT,
        windowSeconds: config.ASTROLOGER_API_PASSWORDLESS_REQUEST_CODE_IP_WINDOW_SECONDS
      },
      requestCodeIdentifierIp: {
        limit: config.ASTROLOGER_API_PASSWORDLESS_REQUEST_CODE_IDENTIFIER_IP_LIMIT,
        windowSeconds: config.ASTROLOGER_API_PASSWORDLESS_REQUEST_CODE_IDENTIFIER_IP_WINDOW_SECONDS
      },
      verifyChallenge: {
        limit: config.ASTROLOGER_API_PASSWORDLESS_VERIFY_CHALLENGE_LIMIT,
        windowSeconds: config.ASTROLOGER_API_PASSWORDLESS_VERIFY_CHALLENGE_WINDOW_SECONDS
      },
      verifyIp: {
        limit: config.ASTROLOGER_API_PASSWORDLESS_VERIFY_IP_LIMIT,
        windowSeconds: config.ASTROLOGER_API_PASSWORDLESS_VERIFY_IP_WINDOW_SECONDS
      },
      mobileRefreshToken: {
        limit: config.ASTROLOGER_API_MOBILE_REFRESH_TOKEN_LIMIT,
        windowSeconds: config.ASTROLOGER_API_MOBILE_REFRESH_TOKEN_WINDOW_SECONDS
      },
      mobileRefreshIp: {
        limit: config.ASTROLOGER_API_MOBILE_REFRESH_IP_LIMIT,
        windowSeconds: config.ASTROLOGER_API_MOBILE_REFRESH_IP_WINDOW_SECONDS
      }
    },
    mediaStorage: {
      endpoint: mediaStorageEndpoint,
      region: config.ASTROLOGER_MEDIA_STORAGE_REGION,
      bucket: config.ASTROLOGER_MEDIA_STORAGE_BUCKET,
      privateBucket: config.ASTROLOGER_MEDIA_PRIVATE_STORAGE_BUCKET,
      accessKeyId: config.ASTROLOGER_MEDIA_STORAGE_ACCESS_KEY_ID,
      secretAccessKey: config.ASTROLOGER_MEDIA_STORAGE_SECRET_ACCESS_KEY,
      forcePathStyle: config.ASTROLOGER_MEDIA_STORAGE_FORCE_PATH_STYLE,
      publicBaseUrl: mediaStoragePublicBaseUrl,
      uploadTtlSeconds: config.ASTROLOGER_MEDIA_UPLOAD_TTL_SECONDS,
      downloadTtlSeconds: config.ASTROLOGER_MEDIA_DOWNLOAD_TTL_SECONDS
    },
    billing: {
      arcPayConfigured: config.ASTROLOGER_BILLING_ARC_PAY_ENABLED,
      arcPayBrowserTokenization,
      financeArtifactStorage,
      savedCardDisclosureSeriesId: config.ASTROLOGER_BILLING_SAVED_CARD_DISCLOSURE_SERIES_ID ?? null
    },
    ai: {
      provider: config.ASTROLOGER_AI_PROVIDER,
      openAiApiKey: config.ASTROLOGER_OPENAI_API_KEY,
      openAiBaseUrl: config.ASTROLOGER_OPENAI_BASE_URL,
      fastDraftModel: config.ASTROLOGER_AI_FAST_DRAFT_MODEL,
      qualityDraftModel: config.ASTROLOGER_AI_QUALITY_DRAFT_MODEL,
      timeoutMs: config.ASTROLOGER_AI_TIMEOUT_MS,
      maxOutputTokens: config.ASTROLOGER_AI_MAX_OUTPUT_TOKENS,
      rateLimitRedisKeyPrefix: config.ASTROLOGER_AI_RATE_LIMIT_REDIS_KEY_PREFIX,
      rateLimits: {
        userPerMinute: {
          limit: config.ASTROLOGER_AI_RATE_LIMIT_USER_PER_MINUTE,
          windowSeconds: 60
        },
        userPerHour: {
          limit: config.ASTROLOGER_AI_RATE_LIMIT_USER_PER_HOUR,
          windowSeconds: 3600
        },
        userPerDay: {
          limit: config.ASTROLOGER_AI_RATE_LIMIT_USER_PER_DAY,
          windowSeconds: 86400
        }
      }
    }
  };
}

type LiveKitRuntimeOptions = Readonly<{
  serverUrl: string;
  apiKey: string;
  apiSecret: string;
  roomPrefix: string;
  joinTokenTtlSeconds: 300;
}>;

function resolveLiveKitRuntimeOptions(config: {
  LIVEKIT_URL?: string;
  LIVEKIT_API_KEY?: string;
  LIVEKIT_API_SECRET?: string;
  LIVEKIT_ROOM_PREFIX: string;
}): LiveKitRuntimeOptions | null {
  const values = [config.LIVEKIT_URL, config.LIVEKIT_API_KEY, config.LIVEKIT_API_SECRET];
  if (values.every((value) => value === undefined)) return null;
  if (values.some((value) => value === undefined)) {
    throw new Error("LiveKit configuration is incomplete");
  }
  if (new URL(config.LIVEKIT_URL!).protocol !== "wss:") {
    throw new Error("LIVEKIT_URL must use wss");
  }
  return {
    serverUrl: config.LIVEKIT_URL!,
    apiKey: config.LIVEKIT_API_KEY!,
    apiSecret: config.LIVEKIT_API_SECRET!,
    roomPrefix: config.LIVEKIT_ROOM_PREFIX,
    joinTokenTtlSeconds: 300
  };
}

function resolveArcPayBrowserTokenization(
  config: z.infer<typeof astrologerApiRuntimeConfigSchema>
): AstrologerApiRuntimeConfig["billing"]["arcPayBrowserTokenization"] {
  if (!config.ASTROLOGER_BILLING_ARC_PAY_ENABLED) return null;
  const apiBaseUrl = config.ASTROLOGER_BILLING_ARC_PAY_API_BASE_URL;
  const publishableKey = config.ASTROLOGER_BILLING_ARC_PAY_PUBLISHABLE_KEY;
  if (!apiBaseUrl || !publishableKey) {
    throw new Error(
      "ASTROLOGER_BILLING_ARC_PAY_API_BASE_URL and ASTROLOGER_BILLING_ARC_PAY_PUBLISHABLE_KEY are required when ArcPay billing is enabled"
    );
  }
  const normalizedApiBaseUrl = stripTrailingSlashes(apiBaseUrl);
  const url = new URL(normalizedApiBaseUrl);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.origin !== normalizedApiBaseUrl
  ) {
    throw new Error("ASTROLOGER_BILLING_ARC_PAY_API_BASE_URL must be an HTTPS origin");
  }
  return Object.freeze({ apiBaseUrl: normalizedApiBaseUrl, publishableKey });
}

function resolveBillingFinanceArtifactStorage(
  config: z.infer<typeof astrologerApiRuntimeConfigSchema>
): AstrologerApiRuntimeConfig["billing"]["financeArtifactStorage"] {
  if (!config.ASTROLOGER_BILLING_ARC_PAY_ENABLED) return null;
  return Object.freeze({
    artifactDirectory: config.ASTROLOGER_BILLING_FINANCE_ARTIFACT_DIRECTORY,
    requestRetention: Object.freeze({
      policyId: config.ASTROLOGER_BILLING_FINANCE_PROVIDER_REQUEST_RETENTION_POLICY_ID,
      policyVersion: config.ASTROLOGER_BILLING_FINANCE_PROVIDER_REQUEST_RETENTION_POLICY_VERSION
    })
  });
}

function parseAllowedOrigins(value: string | undefined): readonly string[] {
  return (value ?? "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

function stripTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

function isExactRootOrigin(value: string, expectedOrigin: string): boolean {
  const url = new URL(value);
  return (
    url.origin === expectedOrigin &&
    url.pathname === "/" &&
    url.search === "" &&
    url.hash === "" &&
    url.username === "" &&
    url.password === ""
  );
}

function toTelegramMtprotoConfig(input: {
  readonly enabled: boolean;
  readonly apiId: number | undefined;
  readonly apiHash: string | undefined;
  readonly sessionEncryptionKey: string | undefined;
}): AstrologerApiRuntimeConfig["telegramMtproto"] {
  if (!input.enabled) return null;
  if (input.apiId === undefined || !input.apiHash || !input.sessionEncryptionKey) {
    throw new Error("Telegram MTProto settings are required when MTProto login is enabled");
  }

  return {
    enabled: true,
    apiId: input.apiId,
    apiHash: input.apiHash,
    sessionEncryptionKey: parseBase64Aes256GcmKey(input.sessionEncryptionKey)
  };
}

function toInstagramGraphConfig(input: {
  readonly enabled: boolean;
  readonly appId: string | undefined;
  readonly appSecret: string | undefined;
  readonly redirectUri: string | undefined;
  readonly tokenEncryptionKey: string | undefined;
  readonly webhookVerifyToken: string | undefined;
  readonly callbackStateTtlSeconds: number;
  readonly authBaseUrl: string;
  readonly tokenExchangeBaseUrl: string;
  readonly graphTokenBaseUrl: string;
  readonly graphApiBaseUrl: string;
  readonly astrologerWebBaseUrl: string;
  readonly scopes: string;
}): AstrologerApiRuntimeConfig["instagramGraph"] {
  if (!input.enabled) return null;
  if (!input.appId || !input.appSecret || !input.redirectUri || !input.tokenEncryptionKey) {
    throw new Error("Instagram Graph settings are required when Instagram Graph login is enabled");
  }
  const scopes = input.scopes
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean);
  if (scopes.length === 0) {
    throw new Error("Instagram Graph scopes are required when Instagram Graph login is enabled");
  }

  return {
    enabled: true,
    appId: input.appId,
    appSecret: input.appSecret,
    redirectUri: input.redirectUri,
    tokenEncryptionKey: parseBase64Aes256GcmKey(input.tokenEncryptionKey),
    webhookVerifyToken: input.webhookVerifyToken ?? null,
    callbackStateTtlSeconds: input.callbackStateTtlSeconds,
    authBaseUrl: stripTrailingSlashes(input.authBaseUrl),
    tokenExchangeBaseUrl: stripTrailingSlashes(input.tokenExchangeBaseUrl),
    graphTokenBaseUrl: stripTrailingSlashes(input.graphTokenBaseUrl),
    graphApiBaseUrl: stripTrailingSlashes(input.graphApiBaseUrl),
    astrologerWebBaseUrl: stripTrailingSlashes(input.astrologerWebBaseUrl),
    scopes
  };
}
