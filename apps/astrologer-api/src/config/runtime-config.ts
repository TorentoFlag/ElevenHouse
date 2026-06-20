import { parseBase64Aes256GcmKey } from "@elevenhouse/auth";
import { z } from "@elevenhouse/validation";

const localAstrologerSessionCookieName = "elevenhouse_astrologer_session";
const secureAstrologerSessionCookieName = "__Host-elevenhouse_astrologer_session";

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
  AUTH_CODE_DELIVERY_ENCRYPTION_KEY: z.string().trim().min(1),
  ASTROLOGER_API_PASSWORDLESS_CODE_SECRET: z.string().trim().min(1).optional(),
  ASTROLOGER_API_PASSWORDLESS_CODE_TTL_SECONDS: z.coerce.number().int().positive().default(600),
  ASTROLOGER_API_PASSWORDLESS_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().positive().default(60),
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
    .default("elevenhouse:astrologer-api")
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

  if (config.NODE_ENV === "production" && allowedOrigins.length === 0) {
    throw new Error("ASTROLOGER_API_ALLOWED_ORIGINS is required in production");
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
    allowedOrigins:
      allowedOrigins.length > 0
        ? allowedOrigins
        : ["http://localhost:5174", "http://localhost:5175"],
    authCodeDeliveryEncryptionKey: parseBase64Aes256GcmKey(
      config.AUTH_CODE_DELIVERY_ENCRYPTION_KEY
    ),
    passwordlessCodeSecret:
      config.ASTROLOGER_API_PASSWORDLESS_CODE_SECRET ?? "elevenhouse-dev-astrologer-passwordless-code-secret",
    passwordlessCodeTtlSeconds: config.ASTROLOGER_API_PASSWORDLESS_CODE_TTL_SECONDS,
    passwordlessResendCooldownSeconds: config.ASTROLOGER_API_PASSWORDLESS_RESEND_COOLDOWN_SECONDS,
    passwordlessMaxAttempts: config.ASTROLOGER_API_PASSWORDLESS_MAX_ATTEMPTS,
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
    }
  };
}

function parseAllowedOrigins(value: string | undefined): readonly string[] {
  return (value ?? "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}
