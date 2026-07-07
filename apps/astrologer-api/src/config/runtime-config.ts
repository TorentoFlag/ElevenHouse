import { parseBase64Aes256GcmKey } from "@elevenhouse/auth";
import { z } from "@elevenhouse/validation";

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

const astrologerApiRuntimeConfigSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  ASTROLOGER_API_PORT: z.coerce.number().int().positive().default(3002),
  ASTROLOGER_API_TRUST_PROXY: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  REDIS_URL: z.string().trim().min(1).default("redis://localhost:6379"),
  ASTROLOGER_API_SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(604800),
  ASTROLOGER_API_SESSION_COOKIE_SECURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  ASTROLOGER_API_SESSION_COOKIE_NAME: z.string().trim().min(1).optional(),
  ASTROLOGER_API_CSRF_SECRET: z.string().trim().min(32).optional(),
  ASTROLOGER_API_CSRF_COOKIE_NAME: z.string().trim().min(1).default("elevenhouse_astrologer_csrf"),
  ASTROLOGER_API_CSRF_HEADER_NAME: z.string().trim().min(1).default("x-csrf-token"),
  ASTROLOGER_API_CSRF_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(604800),
  ASTROLOGER_API_ALLOWED_ORIGINS: z.string().trim().optional(),
  ASTROLOGER_MEDIA_STORAGE_ENDPOINT: z.string().trim().url().default("http://localhost:9000"),
  ASTROLOGER_MEDIA_STORAGE_REGION: z.string().trim().min(1).default("us-east-1"),
  ASTROLOGER_MEDIA_STORAGE_BUCKET: z.string().trim().min(1).default("elevenhouse-local-media"),
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
  ASTROLOGER_BILLING_ARC_PAY_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
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
  ASTROLOGER_API_PASSWORDLESS_RATE_LIMIT_REDIS_KEY_PREFIX: z
    .string()
    .trim()
    .min(1)
    .default("elevenhouse:astrologer-api"),
  ASTROLOGER_AI_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  ASTROLOGER_AI_PROVIDER: z.literal("openai").default("openai"),
  ASTROLOGER_OPENAI_API_KEY: optionalTrimmedNonEmptyStringSchema,
  ASTROLOGER_OPENAI_BASE_URL: z.string().trim().url().default("https://api.openai.com/v1"),
  ASTROLOGER_AI_FAST_DRAFT_MODEL: z.enum(["gpt-5.4-mini", "gpt-5.5"]).default("gpt-5.4-mini"),
  ASTROLOGER_AI_QUALITY_DRAFT_MODEL: z.enum(["gpt-5.4-mini", "gpt-5.5"]).default("gpt-5.5"),
  ASTROLOGER_AI_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
  ASTROLOGER_AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().default(900),
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
  readonly sessionTtlSeconds: number;
  readonly sessionCookieSecure: boolean;
  readonly sessionCookieName: string;
  readonly csrfSecret: string;
  readonly csrfCookieName: string;
  readonly csrfHeaderName: string;
  readonly csrfTokenTtlSeconds: number;
  readonly allowedOrigins: readonly string[];
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
  };
  readonly mediaStorage: {
    readonly endpoint: string;
    readonly region: string;
    readonly bucket: string;
    readonly accessKeyId: string;
    readonly secretAccessKey: string;
    readonly forcePathStyle: boolean;
    readonly publicBaseUrl: string;
    readonly uploadTtlSeconds: number;
  };
  readonly billing: {
    readonly arcPayConfigured: boolean;
  };
  readonly ai: {
    readonly enabled: boolean;
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

  if (config.NODE_ENV === "production" && !config.ASTROLOGER_API_PASSWORDLESS_CODE_SECRET) {
    throw new Error("ASTROLOGER_API_PASSWORDLESS_CODE_SECRET is required in production");
  }

  const allowedOrigins = parseAllowedOrigins(config.ASTROLOGER_API_ALLOWED_ORIGINS);
  const mediaStorageEndpoint = stripTrailingSlashes(config.ASTROLOGER_MEDIA_STORAGE_ENDPOINT);
  const mediaStoragePublicBaseUrl = stripTrailingSlashes(
    config.ASTROLOGER_MEDIA_STORAGE_PUBLIC_BASE_URL ??
      `${mediaStorageEndpoint}/${config.ASTROLOGER_MEDIA_STORAGE_BUCKET}`
  );

  if (config.NODE_ENV === "production" && allowedOrigins.length === 0) {
    throw new Error("ASTROLOGER_API_ALLOWED_ORIGINS is required in production");
  }

  if (config.ASTROLOGER_AI_ENABLED && !config.ASTROLOGER_OPENAI_API_KEY) {
    throw new Error("ASTROLOGER_OPENAI_API_KEY is required when ASTROLOGER_AI_ENABLED=true");
  }

  if (
    config.NODE_ENV === "production" &&
    config.ASTROLOGER_AI_ENABLED &&
    new URL(config.ASTROLOGER_OPENAI_BASE_URL).protocol !== "https:"
  ) {
    throw new Error(
      "ASTROLOGER_OPENAI_BASE_URL must use https in production when ASTROLOGER_AI_ENABLED=true"
    );
  }

  return {
    port: config.ASTROLOGER_API_PORT,
    trustProxy: config.ASTROLOGER_API_TRUST_PROXY,
    redisUrl: config.REDIS_URL,
    sessionTtlSeconds: config.ASTROLOGER_API_SESSION_TTL_SECONDS,
    sessionCookieSecure: config.ASTROLOGER_API_SESSION_COOKIE_SECURE,
    sessionCookieName,
    csrfSecret:
      config.ASTROLOGER_API_CSRF_SECRET ??
      "elevenhouse-dev-astrologer-api-csrf-secret-change-before-production",
    csrfCookieName: config.ASTROLOGER_API_CSRF_COOKIE_NAME,
    csrfHeaderName: config.ASTROLOGER_API_CSRF_HEADER_NAME.toLowerCase(),
    csrfTokenTtlSeconds: config.ASTROLOGER_API_CSRF_TOKEN_TTL_SECONDS,
    allowedOrigins: allowedOrigins.length > 0 ? allowedOrigins : ["http://localhost:5174"],
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
      }
    },
    mediaStorage: {
      endpoint: mediaStorageEndpoint,
      region: config.ASTROLOGER_MEDIA_STORAGE_REGION,
      bucket: config.ASTROLOGER_MEDIA_STORAGE_BUCKET,
      accessKeyId: config.ASTROLOGER_MEDIA_STORAGE_ACCESS_KEY_ID,
      secretAccessKey: config.ASTROLOGER_MEDIA_STORAGE_SECRET_ACCESS_KEY,
      forcePathStyle: config.ASTROLOGER_MEDIA_STORAGE_FORCE_PATH_STYLE,
      publicBaseUrl: mediaStoragePublicBaseUrl,
      uploadTtlSeconds: config.ASTROLOGER_MEDIA_UPLOAD_TTL_SECONDS
    },
    billing: {
      arcPayConfigured: config.ASTROLOGER_BILLING_ARC_PAY_ENABLED
    },
    ai: {
      enabled: config.ASTROLOGER_AI_ENABLED,
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

function parseAllowedOrigins(value: string | undefined): readonly string[] {
  return (value ?? "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

function stripTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}
