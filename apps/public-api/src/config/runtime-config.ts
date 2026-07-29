import { z } from "@elevenhouse/validation";
import { parseBase64Aes256GcmKey, publicSessionCookieName } from "@elevenhouse/auth";

const localPublicSessionCookieName = "elevenhouse_public_session";
const localTrustedStaticPasswordlessCode = {
  channel: "phone" as const,
  identifierNormalized: "+78005553535",
  code: "777777"
};

const publicApiRuntimeConfigSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PUBLIC_API_PORT: z.coerce.number().int().positive().default(3001),
  PUBLIC_API_TRUST_PROXY: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  REDIS_URL: z.string().trim().min(1).default("redis://localhost:6379"),
  PUBLIC_API_SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(604800),
  PUBLIC_API_SESSION_COOKIE_SECURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  PUBLIC_API_SESSION_COOKIE_NAME: z.string().trim().min(1).optional(),
  PUBLIC_API_CSRF_SECRET: z.string().trim().min(32).optional(),
  PUBLIC_API_CSRF_COOKIE_NAME: z.string().trim().min(1).default("elevenhouse_public_csrf"),
  PUBLIC_API_CSRF_HEADER_NAME: z.string().trim().min(1).default("x-csrf-token"),
  PUBLIC_API_CSRF_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(604800),
  PUBLIC_API_ALLOWED_ORIGINS: z.string().trim().optional(),
  AUTH_CODE_DELIVERY_ENCRYPTION_KEY: z.string().trim().min(1),
  PUBLIC_API_PASSWORDLESS_CODE_SECRET: z.string().trim().min(1).optional(),
  PUBLIC_API_PASSWORDLESS_CODE_TTL_SECONDS: z.coerce.number().int().positive().default(600),
  PUBLIC_API_PASSWORDLESS_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().positive().default(60),
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
  PUBLIC_API_PASSWORDLESS_VERIFY_CHALLENGE_LIMIT: z.coerce.number().int().positive().default(5),
  PUBLIC_API_PASSWORDLESS_VERIFY_CHALLENGE_WINDOW_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(900),
  PUBLIC_API_PASSWORDLESS_VERIFY_IP_LIMIT: z.coerce.number().int().positive().default(60),
  PUBLIC_API_PASSWORDLESS_VERIFY_IP_WINDOW_SECONDS: z.coerce.number().int().positive().default(900),
  PUBLIC_API_PASSWORDLESS_RATE_LIMIT_REDIS_KEY_PREFIX: z
    .string()
    .trim()
    .min(1)
    .default("elevenhouse:public-api"),
  ARC_PAY_API_BASE_URL: z.string().url().default("https://api.arcpay.space"),
  ARC_PAY_SECRET: z.string().trim().min(1).optional(),
  ARC_PAY_ENVIRONMENT: z.enum(["sandbox", "live"]).default("sandbox"),
  ARC_PAY_CAPTURE_MODE: z.enum(["one_stage", "two_stage"]).optional(),
  ARC_PAY_PAYMENT_METHODS: z.string().trim().min(1).optional()
});

const arcPayPaymentMethodSchema = z
  .object({
    method: z.enum([
      "bank_card",
      "sbp",
      "sberpay",
      "tpay",
      "alfapay",
      "dolyami",
      "mirpay",
      "applepay",
      "googlepay"
    ]),
    paymentMode: z.enum(["h2h", "redirect"])
  })
  .strict();

type ArcPayPaymentMethod = z.infer<typeof arcPayPaymentMethodSchema>;

export type PublicApiRuntimeConfig = {
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
  readonly passwordlessTrustedStaticCode: typeof localTrustedStaticPasswordlessCode | null;
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
  readonly arcPay: {
    readonly apiBaseUrl: string;
    readonly secret: string | null;
    readonly environment: "sandbox" | "live";
    readonly captureMode: "one_stage" | "two_stage" | null;
    readonly paymentMethods: readonly ArcPayPaymentMethod[];
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

  if (config.NODE_ENV === "production" && !config.PUBLIC_API_SESSION_COOKIE_SECURE) {
    throw new Error("PUBLIC_API_SESSION_COOKIE_SECURE=true is required in production");
  }

  if (sessionCookieName.startsWith("__Host-") && !config.PUBLIC_API_SESSION_COOKIE_SECURE) {
    throw new Error("__Host-prefixed public session cookies require Secure=true");
  }

  if (config.NODE_ENV === "production" && !config.PUBLIC_API_PASSWORDLESS_CODE_SECRET) {
    throw new Error("PUBLIC_API_PASSWORDLESS_CODE_SECRET is required in production");
  }

  if (config.NODE_ENV === "production" && !config.PUBLIC_API_CSRF_SECRET) {
    throw new Error("PUBLIC_API_CSRF_SECRET is required in production");
  }

  const allowedOrigins = parseAllowedOrigins(config.PUBLIC_API_ALLOWED_ORIGINS);

  if (config.NODE_ENV === "production" && allowedOrigins.length === 0) {
    throw new Error("PUBLIC_API_ALLOWED_ORIGINS is required in production");
  }

  const arcPayPaymentMethods = parseArcPayPaymentMethods(config.ARC_PAY_PAYMENT_METHODS);
  const arcPayConfigured =
    Boolean(config.ARC_PAY_SECRET) &&
    Boolean(config.ARC_PAY_CAPTURE_MODE) &&
    arcPayPaymentMethods.length > 0;
  if (config.NODE_ENV === "production" && !arcPayConfigured) {
    throw new Error(
      "ARC_PAY_SECRET, ARC_PAY_CAPTURE_MODE and ARC_PAY_PAYMENT_METHODS are required in production"
    );
  }
  if (new URL(config.ARC_PAY_API_BASE_URL).protocol !== "https:") {
    throw new Error("ARC_PAY_API_BASE_URL must use HTTPS");
  }

  return {
    port: config.PUBLIC_API_PORT,
    trustProxy: config.PUBLIC_API_TRUST_PROXY,
    redisUrl: config.REDIS_URL,
    sessionTtlSeconds: config.PUBLIC_API_SESSION_TTL_SECONDS,
    sessionCookieSecure: config.PUBLIC_API_SESSION_COOKIE_SECURE,
    sessionCookieName,
    csrfSecret:
      config.PUBLIC_API_CSRF_SECRET ??
      "elevenhouse-dev-public-api-csrf-secret-change-before-production",
    csrfCookieName: config.PUBLIC_API_CSRF_COOKIE_NAME,
    csrfHeaderName: config.PUBLIC_API_CSRF_HEADER_NAME.toLowerCase(),
    csrfTokenTtlSeconds: config.PUBLIC_API_CSRF_TOKEN_TTL_SECONDS,
    allowedOrigins:
      allowedOrigins.length > 0
        ? allowedOrigins
        : ["http://localhost:3000", "http://localhost:3001", "http://localhost:5173"],
    authCodeDeliveryEncryptionKey: parseBase64Aes256GcmKey(
      config.AUTH_CODE_DELIVERY_ENCRYPTION_KEY
    ),
    passwordlessCodeSecret:
      config.PUBLIC_API_PASSWORDLESS_CODE_SECRET ?? "elevenhouse-dev-passwordless-code-secret",
    passwordlessCodeTtlSeconds: config.PUBLIC_API_PASSWORDLESS_CODE_TTL_SECONDS,
    passwordlessResendCooldownSeconds: config.PUBLIC_API_PASSWORDLESS_RESEND_COOLDOWN_SECONDS,
    passwordlessMaxAttempts: config.PUBLIC_API_PASSWORDLESS_MAX_ATTEMPTS,
    passwordlessTrustedStaticCode: localTrustedStaticPasswordlessCode,
    passwordlessRateLimitRedisKeyPrefix: config.PUBLIC_API_PASSWORDLESS_RATE_LIMIT_REDIS_KEY_PREFIX,
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
    },
    arcPay: {
      apiBaseUrl: config.ARC_PAY_API_BASE_URL,
      secret: config.ARC_PAY_SECRET ?? null,
      environment: config.ARC_PAY_ENVIRONMENT,
      captureMode: config.ARC_PAY_CAPTURE_MODE ?? null,
      paymentMethods: arcPayPaymentMethods
    }
  };
}

function parseArcPayPaymentMethods(value: string | undefined): readonly ArcPayPaymentMethod[] {
  if (!value) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("ARC_PAY_PAYMENT_METHODS must be valid JSON");
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("ARC_PAY_PAYMENT_METHODS must be a non-empty JSON array");
  }
  return parsed.map((entry) => arcPayPaymentMethodSchema.parse(entry));
}

function parseAllowedOrigins(value: string | undefined): readonly string[] {
  return (value ?? "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}
