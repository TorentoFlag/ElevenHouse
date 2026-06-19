import { parseBase64Aes256GcmKey } from "@elevenhouse/auth";
import { z } from "@elevenhouse/validation";

const localOpsSessionCookieName = "elevenhouse_ops_session";
const secureOpsSessionCookieName = "__Host-elevenhouse_ops_session";

const opsApiRuntimeConfigSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  OPS_API_PORT: z.coerce.number().int().positive().default(3002),
  REDIS_URL: z.string().trim().min(1).default("redis://localhost:6379"),
  OPS_API_SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(604800),
  OPS_API_SESSION_COOKIE_SECURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  OPS_API_SESSION_COOKIE_NAME: z.string().trim().min(1).optional(),
  OPS_API_CSRF_SECRET: z.string().trim().min(32).optional(),
  OPS_API_CSRF_COOKIE_NAME: z.string().trim().min(1).default("elevenhouse_ops_csrf"),
  OPS_API_CSRF_HEADER_NAME: z.string().trim().min(1).default("x-csrf-token"),
  OPS_API_CSRF_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(604800),
  OPS_API_ALLOWED_ORIGINS: z.string().trim().optional(),
  AUTH_CODE_DELIVERY_ENCRYPTION_KEY: z.string().trim().min(1),
  OPS_API_PASSWORDLESS_CODE_SECRET: z.string().trim().min(1).optional(),
  OPS_API_PASSWORDLESS_CODE_TTL_SECONDS: z.coerce.number().int().positive().default(600),
  OPS_API_PASSWORDLESS_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().positive().default(60),
  OPS_API_PASSWORDLESS_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  OPS_API_PASSWORDLESS_REQUEST_CODE_IDENTIFIER_LIMIT: z.coerce
    .number()
    .int()
    .positive()
    .default(5),
  OPS_API_PASSWORDLESS_REQUEST_CODE_IDENTIFIER_WINDOW_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(3600),
  OPS_API_PASSWORDLESS_REQUEST_CODE_IP_LIMIT: z.coerce.number().int().positive().default(30),
  OPS_API_PASSWORDLESS_REQUEST_CODE_IP_WINDOW_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(3600),
  OPS_API_PASSWORDLESS_REQUEST_CODE_IDENTIFIER_IP_LIMIT: z.coerce
    .number()
    .int()
    .positive()
    .default(3),
  OPS_API_PASSWORDLESS_REQUEST_CODE_IDENTIFIER_IP_WINDOW_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(3600),
  OPS_API_PASSWORDLESS_VERIFY_CHALLENGE_LIMIT: z.coerce.number().int().positive().default(5),
  OPS_API_PASSWORDLESS_VERIFY_CHALLENGE_WINDOW_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(900),
  OPS_API_PASSWORDLESS_VERIFY_IP_LIMIT: z.coerce.number().int().positive().default(60),
  OPS_API_PASSWORDLESS_VERIFY_IP_WINDOW_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(900),
  OPS_API_PASSWORDLESS_RATE_LIMIT_REDIS_KEY_PREFIX: z
    .string()
    .trim()
    .min(1)
    .default("elevenhouse:ops-api")
});

export type OpsApiRuntimeConfig = {
  readonly port: number;
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

export function createOpsApiRuntimeConfig(
  source: Record<string, string | undefined> = process.env
): OpsApiRuntimeConfig {
  const config = opsApiRuntimeConfigSchema.parse(source);
  const sessionCookieName =
    config.OPS_API_SESSION_COOKIE_NAME ??
    (config.OPS_API_SESSION_COOKIE_SECURE
      ? secureOpsSessionCookieName
      : localOpsSessionCookieName);

  if (sessionCookieName.startsWith("__Host-") && !config.OPS_API_SESSION_COOKIE_SECURE) {
    throw new Error("__Host-prefixed ops session cookies require Secure=true");
  }

  if (config.NODE_ENV === "production" && !config.OPS_API_CSRF_SECRET) {
    throw new Error("OPS_API_CSRF_SECRET is required in production");
  }

  if (config.NODE_ENV === "production" && !config.OPS_API_PASSWORDLESS_CODE_SECRET) {
    throw new Error("OPS_API_PASSWORDLESS_CODE_SECRET is required in production");
  }

  const allowedOrigins = parseAllowedOrigins(config.OPS_API_ALLOWED_ORIGINS);

  if (config.NODE_ENV === "production" && allowedOrigins.length === 0) {
    throw new Error("OPS_API_ALLOWED_ORIGINS is required in production");
  }

  return {
    port: config.OPS_API_PORT,
    redisUrl: config.REDIS_URL,
    sessionTtlSeconds: config.OPS_API_SESSION_TTL_SECONDS,
    sessionCookieSecure: config.OPS_API_SESSION_COOKIE_SECURE,
    sessionCookieName,
    csrfSecret:
      config.OPS_API_CSRF_SECRET ??
      "elevenhouse-dev-ops-api-csrf-secret-change-before-production",
    csrfCookieName: config.OPS_API_CSRF_COOKIE_NAME,
    csrfHeaderName: config.OPS_API_CSRF_HEADER_NAME.toLowerCase(),
    csrfTokenTtlSeconds: config.OPS_API_CSRF_TOKEN_TTL_SECONDS,
    allowedOrigins:
      allowedOrigins.length > 0
        ? allowedOrigins
        : ["http://localhost:5174", "http://localhost:5175"],
    authCodeDeliveryEncryptionKey: parseBase64Aes256GcmKey(
      config.AUTH_CODE_DELIVERY_ENCRYPTION_KEY
    ),
    passwordlessCodeSecret:
      config.OPS_API_PASSWORDLESS_CODE_SECRET ?? "elevenhouse-dev-ops-passwordless-code-secret",
    passwordlessCodeTtlSeconds: config.OPS_API_PASSWORDLESS_CODE_TTL_SECONDS,
    passwordlessResendCooldownSeconds: config.OPS_API_PASSWORDLESS_RESEND_COOLDOWN_SECONDS,
    passwordlessMaxAttempts: config.OPS_API_PASSWORDLESS_MAX_ATTEMPTS,
    passwordlessRateLimitRedisKeyPrefix:
      config.OPS_API_PASSWORDLESS_RATE_LIMIT_REDIS_KEY_PREFIX,
    passwordlessRateLimits: {
      requestCodeIdentifier: {
        limit: config.OPS_API_PASSWORDLESS_REQUEST_CODE_IDENTIFIER_LIMIT,
        windowSeconds: config.OPS_API_PASSWORDLESS_REQUEST_CODE_IDENTIFIER_WINDOW_SECONDS
      },
      requestCodeIp: {
        limit: config.OPS_API_PASSWORDLESS_REQUEST_CODE_IP_LIMIT,
        windowSeconds: config.OPS_API_PASSWORDLESS_REQUEST_CODE_IP_WINDOW_SECONDS
      },
      requestCodeIdentifierIp: {
        limit: config.OPS_API_PASSWORDLESS_REQUEST_CODE_IDENTIFIER_IP_LIMIT,
        windowSeconds: config.OPS_API_PASSWORDLESS_REQUEST_CODE_IDENTIFIER_IP_WINDOW_SECONDS
      },
      verifyChallenge: {
        limit: config.OPS_API_PASSWORDLESS_VERIFY_CHALLENGE_LIMIT,
        windowSeconds: config.OPS_API_PASSWORDLESS_VERIFY_CHALLENGE_WINDOW_SECONDS
      },
      verifyIp: {
        limit: config.OPS_API_PASSWORDLESS_VERIFY_IP_LIMIT,
        windowSeconds: config.OPS_API_PASSWORDLESS_VERIFY_IP_WINDOW_SECONDS
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
