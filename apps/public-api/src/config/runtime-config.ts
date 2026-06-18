import { z } from "@elevenhouse/validation";
import { publicSessionCookieName } from "@elevenhouse/auth";

const localPublicSessionCookieName = "elevenhouse_public_session";

const publicApiRuntimeConfigSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PUBLIC_API_PORT: z.coerce.number().int().positive().default(3001),
  REDIS_URL: z.string().trim().min(1).default("redis://localhost:6379"),
  PUBLIC_API_SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(604800),
  PUBLIC_API_SESSION_COOKIE_SECURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  PUBLIC_API_SESSION_COOKIE_NAME: z.string().trim().min(1).optional(),
  PUBLIC_API_PASSWORDLESS_CODE_SECRET: z.string().trim().min(1).optional(),
  PUBLIC_API_PASSWORDLESS_CODE_TTL_SECONDS: z.coerce.number().int().positive().default(600),
  PUBLIC_API_PASSWORDLESS_RESEND_COOLDOWN_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(60),
  PUBLIC_API_PASSWORDLESS_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  PUBLIC_API_PASSWORDLESS_REQUEST_CODE_IDENTIFIER_LIMIT: z.coerce
    .number()
    .int()
    .positive()
    .default(5),
  PUBLIC_API_PASSWORDLESS_REQUEST_CODE_IDENTIFIER_WINDOW_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(3600),
  PUBLIC_API_PASSWORDLESS_REQUEST_CODE_IP_LIMIT: z.coerce.number().int().positive().default(30),
  PUBLIC_API_PASSWORDLESS_REQUEST_CODE_IP_WINDOW_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(3600),
  PUBLIC_API_PASSWORDLESS_REQUEST_CODE_IDENTIFIER_IP_LIMIT: z.coerce
    .number()
    .int()
    .positive()
    .default(3),
  PUBLIC_API_PASSWORDLESS_REQUEST_CODE_IDENTIFIER_IP_WINDOW_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(3600),
  PUBLIC_API_PASSWORDLESS_VERIFY_CHALLENGE_LIMIT: z.coerce
    .number()
    .int()
    .positive()
    .default(5),
  PUBLIC_API_PASSWORDLESS_VERIFY_CHALLENGE_WINDOW_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(900),
  PUBLIC_API_PASSWORDLESS_VERIFY_IP_LIMIT: z.coerce.number().int().positive().default(60),
  PUBLIC_API_PASSWORDLESS_VERIFY_IP_WINDOW_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(900),
  PUBLIC_API_PASSWORDLESS_RATE_LIMIT_REDIS_KEY_PREFIX: z
    .string()
    .trim()
    .min(1)
    .default("elevenhouse:public-api")
});

export type PublicApiRuntimeConfig = {
  readonly port: number;
  readonly redisUrl: string;
  readonly sessionTtlSeconds: number;
  readonly sessionCookieSecure: boolean;
  readonly sessionCookieName: string;
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

export function createPublicApiRuntimeConfig(
  source: Record<string, string | undefined> = process.env
): PublicApiRuntimeConfig {
  const config = publicApiRuntimeConfigSchema.parse(source);
  const sessionCookieName =
    config.PUBLIC_API_SESSION_COOKIE_NAME ??
    (config.PUBLIC_API_SESSION_COOKIE_SECURE
      ? publicSessionCookieName
      : localPublicSessionCookieName);

  if (sessionCookieName.startsWith("__Host-") && !config.PUBLIC_API_SESSION_COOKIE_SECURE) {
    throw new Error("__Host-prefixed public session cookies require Secure=true");
  }

  if (config.NODE_ENV === "production" && !config.PUBLIC_API_PASSWORDLESS_CODE_SECRET) {
    throw new Error("PUBLIC_API_PASSWORDLESS_CODE_SECRET is required in production");
  }

  return {
    port: config.PUBLIC_API_PORT,
    redisUrl: config.REDIS_URL,
    sessionTtlSeconds: config.PUBLIC_API_SESSION_TTL_SECONDS,
    sessionCookieSecure: config.PUBLIC_API_SESSION_COOKIE_SECURE,
    sessionCookieName,
    passwordlessCodeSecret:
      config.PUBLIC_API_PASSWORDLESS_CODE_SECRET ??
      "elevenhouse-dev-passwordless-code-secret",
    passwordlessCodeTtlSeconds: config.PUBLIC_API_PASSWORDLESS_CODE_TTL_SECONDS,
    passwordlessResendCooldownSeconds:
      config.PUBLIC_API_PASSWORDLESS_RESEND_COOLDOWN_SECONDS,
    passwordlessMaxAttempts: config.PUBLIC_API_PASSWORDLESS_MAX_ATTEMPTS,
    passwordlessRateLimitRedisKeyPrefix:
      config.PUBLIC_API_PASSWORDLESS_RATE_LIMIT_REDIS_KEY_PREFIX,
    passwordlessRateLimits: {
      requestCodeIdentifier: {
        limit: config.PUBLIC_API_PASSWORDLESS_REQUEST_CODE_IDENTIFIER_LIMIT,
        windowSeconds: config.PUBLIC_API_PASSWORDLESS_REQUEST_CODE_IDENTIFIER_WINDOW_SECONDS
      },
      requestCodeIp: {
        limit: config.PUBLIC_API_PASSWORDLESS_REQUEST_CODE_IP_LIMIT,
        windowSeconds: config.PUBLIC_API_PASSWORDLESS_REQUEST_CODE_IP_WINDOW_SECONDS
      },
      requestCodeIdentifierIp: {
        limit: config.PUBLIC_API_PASSWORDLESS_REQUEST_CODE_IDENTIFIER_IP_LIMIT,
        windowSeconds: config.PUBLIC_API_PASSWORDLESS_REQUEST_CODE_IDENTIFIER_IP_WINDOW_SECONDS
      },
      verifyChallenge: {
        limit: config.PUBLIC_API_PASSWORDLESS_VERIFY_CHALLENGE_LIMIT,
        windowSeconds: config.PUBLIC_API_PASSWORDLESS_VERIFY_CHALLENGE_WINDOW_SECONDS
      },
      verifyIp: {
        limit: config.PUBLIC_API_PASSWORDLESS_VERIFY_IP_LIMIT,
        windowSeconds: config.PUBLIC_API_PASSWORDLESS_VERIFY_IP_WINDOW_SECONDS
      }
    }
  };
}
