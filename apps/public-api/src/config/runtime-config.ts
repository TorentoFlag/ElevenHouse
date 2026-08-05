import { z } from "@elevenhouse/validation";
import { parseBase64Aes256GcmKey, publicSessionCookieName } from "@elevenhouse/auth";

const officialGeoapifyBaseUrl = "https://api.geoapify.com";
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
  PUBLIC_API_BIRTH_PLACE_SEARCH_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  PUBLIC_API_GEOAPIFY_BASE_URL: z.string().trim().url().default(officialGeoapifyBaseUrl),
  PUBLIC_API_GEOAPIFY_API_KEY: z.string().trim().min(1).optional(),
  PUBLIC_API_BIRTH_PLACE_SEARCH_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .max(15000)
    .default(5000),
  PUBLIC_API_BIRTH_PLACE_SEARCH_CACHE_SUCCESS_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(2592000),
  PUBLIC_API_BIRTH_PLACE_SEARCH_CACHE_EMPTY_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(1800),
  PUBLIC_API_BIRTH_PLACE_SEARCH_LOCK_TTL_MS: z.coerce
    .number()
    .int()
    .positive()
    .max(20000)
    .default(6000),
  PUBLIC_API_BIRTH_PLACE_SEARCH_RATE_LIMIT_REDIS_KEY_PREFIX: z
    .string()
    .trim()
    .min(1)
    .default("elevenhouse:public-api:birth-place-search"),
  PUBLIC_API_BIRTH_PLACE_SEARCH_RATE_LIMIT_USER_PER_MINUTE: z.coerce
    .number()
    .int()
    .positive()
    .default(20),
  PUBLIC_API_BIRTH_PLACE_SEARCH_RATE_LIMIT_GLOBAL_PER_MINUTE: z.coerce
    .number()
    .int()
    .positive()
    .default(120),
  PUBLIC_API_BIRTH_PLACE_SEARCH_RATE_LIMIT_GLOBAL_PER_DAY: z.coerce
    .number()
    .int()
    .positive()
    .default(2500),
  PUBLIC_API_FINANCE_CHECKOUT_PREPARATION_ENABLED: z.enum(["true", "false"]).default("false"),
  PUBLIC_API_FINANCE_CHECKOUT_ENVIRONMENT: z.enum(["sandbox", "live"]).default("sandbox"),
  PUBLIC_API_FINANCE_CHECKOUT_PAYMENT_METHODS: z.string().trim().min(1).optional(),
  PUBLIC_API_FINANCE_ARTIFACT_S3_ENDPOINT: z.string().url().optional(),
  PUBLIC_API_FINANCE_ARTIFACT_S3_REGION: z.string().trim().min(1).optional(),
  PUBLIC_API_FINANCE_ARTIFACT_S3_BUCKET: z.string().trim().min(1).optional(),
  PUBLIC_API_FINANCE_ARTIFACT_S3_ACCESS_KEY_ID: z.string().trim().min(1).optional(),
  PUBLIC_API_FINANCE_ARTIFACT_S3_SECRET_ACCESS_KEY: z.string().trim().min(1).optional(),
  PUBLIC_API_FINANCE_ARTIFACT_S3_FORCE_PATH_STYLE: z.enum(["true", "false"]).optional(),
  PUBLIC_API_FINANCE_ARTIFACT_KMS_KEY_ARN: z.string().trim().min(1).optional(),
  PUBLIC_API_FINANCE_PROVIDER_REQUEST_RETENTION_POLICY_ID: z.string().trim().min(1).optional(),
  PUBLIC_API_FINANCE_PROVIDER_REQUEST_RETENTION_POLICY_VERSION: z.string().regex(/^[1-9][0-9]*$/).optional(),
});

const financeCheckoutPaymentMethodSchema = z.object({
  method: z.enum(["bank_card", "sbp", "sberpay", "tpay", "alfapay", "dolyami", "mirpay", "applepay", "googlepay"]),
  paymentMode: z.enum(["h2h", "redirect"])
}).strict();
type FinanceCheckoutPaymentMethod = z.infer<typeof financeCheckoutPaymentMethodSchema>;

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
  readonly birthPlaceSearch: {
    readonly enabled: boolean;
    readonly provider: "geoapify";
    readonly baseUrl: string;
    readonly apiKey: string | null;
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
  readonly financeCheckout: Readonly<{
    environment: "sandbox" | "live";
    paymentMethods: readonly FinanceCheckoutPaymentMethod[];
    artifactStorage: Readonly<{
      endpoint: string;
      region: string;
      bucket: string;
      accessKeyId: string;
      secretAccessKey: string;
      forcePathStyle: boolean;
      kmsKeyArn: string;
    }>;
    requestArtifactRetention: Readonly<{ policyId: string; policyVersion: string }>;
  }> | null;
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

  if (
    config.PUBLIC_API_BIRTH_PLACE_SEARCH_LOCK_TTL_MS <=
    config.PUBLIC_API_BIRTH_PLACE_SEARCH_TIMEOUT_MS
  ) {
    throw new Error(
      "PUBLIC_API_BIRTH_PLACE_SEARCH_LOCK_TTL_MS must exceed PUBLIC_API_BIRTH_PLACE_SEARCH_TIMEOUT_MS"
    );
  }
  const financeCheckout = resolveFinanceCheckout(config);
  if (
    config.PUBLIC_API_BIRTH_PLACE_SEARCH_ENABLED &&
    new URL(config.PUBLIC_API_GEOAPIFY_BASE_URL).protocol !== "https:"
  ) {
    throw new Error(
      "PUBLIC_API_GEOAPIFY_BASE_URL must use HTTPS when PUBLIC_API_BIRTH_PLACE_SEARCH_ENABLED=true"
    );
  }
  if (config.NODE_ENV === "production" && !config.PUBLIC_API_BIRTH_PLACE_SEARCH_ENABLED) {
    throw new Error("PUBLIC_API_BIRTH_PLACE_SEARCH_ENABLED=true is required in production");
  }
  if (
    config.NODE_ENV === "production" &&
    config.PUBLIC_API_BIRTH_PLACE_SEARCH_ENABLED &&
    !isExactRootOrigin(config.PUBLIC_API_GEOAPIFY_BASE_URL, officialGeoapifyBaseUrl)
  ) {
    throw new Error(
      `PUBLIC_API_GEOAPIFY_BASE_URL must equal ${officialGeoapifyBaseUrl} in production when birth-place search is enabled`
    );
  }
  if (
    config.NODE_ENV === "production" &&
    config.PUBLIC_API_BIRTH_PLACE_SEARCH_ENABLED &&
    !config.PUBLIC_API_GEOAPIFY_API_KEY
  ) {
    throw new Error(
      "PUBLIC_API_GEOAPIFY_API_KEY is required when PUBLIC_API_BIRTH_PLACE_SEARCH_ENABLED=true"
    );
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
    birthPlaceSearch: {
      enabled: config.PUBLIC_API_BIRTH_PLACE_SEARCH_ENABLED,
      provider: "geoapify",
      baseUrl: stripTrailingSlashes(config.PUBLIC_API_GEOAPIFY_BASE_URL),
      apiKey: config.PUBLIC_API_GEOAPIFY_API_KEY ?? null,
      timeoutMs: config.PUBLIC_API_BIRTH_PLACE_SEARCH_TIMEOUT_MS,
      cacheSuccessTtlSeconds: config.PUBLIC_API_BIRTH_PLACE_SEARCH_CACHE_SUCCESS_TTL_SECONDS,
      cacheEmptyTtlSeconds: config.PUBLIC_API_BIRTH_PLACE_SEARCH_CACHE_EMPTY_TTL_SECONDS,
      lockTtlMs: config.PUBLIC_API_BIRTH_PLACE_SEARCH_LOCK_TTL_MS,
      rateLimitRedisKeyPrefix: config.PUBLIC_API_BIRTH_PLACE_SEARCH_RATE_LIMIT_REDIS_KEY_PREFIX,
      rateLimits: {
        userPerMinute: {
          limit: config.PUBLIC_API_BIRTH_PLACE_SEARCH_RATE_LIMIT_USER_PER_MINUTE,
          windowSeconds: 60
        },
        globalPerMinute: {
          limit: config.PUBLIC_API_BIRTH_PLACE_SEARCH_RATE_LIMIT_GLOBAL_PER_MINUTE,
          windowSeconds: 60
        },
        globalPerDay: {
          limit: config.PUBLIC_API_BIRTH_PLACE_SEARCH_RATE_LIMIT_GLOBAL_PER_DAY,
          windowSeconds: 86400
        }
      }
    },
    financeCheckout
  };
}

function resolveFinanceCheckout(config: z.infer<typeof publicApiRuntimeConfigSchema>): PublicApiRuntimeConfig["financeCheckout"] {
  if (config.PUBLIC_API_FINANCE_CHECKOUT_PREPARATION_ENABLED === "false") return null;
  const endpoint = requiredFinanceCheckoutConfig(config.PUBLIC_API_FINANCE_ARTIFACT_S3_ENDPOINT);
  if (new URL(endpoint).protocol !== "https:") {
    throw new Error("PUBLIC_API_FINANCE_ARTIFACT_S3_ENDPOINT must use HTTPS");
  }
  const forcePathStyle = config.PUBLIC_API_FINANCE_ARTIFACT_S3_FORCE_PATH_STYLE;
  if (forcePathStyle === undefined) {
    throw new Error("PUBLIC_API_FINANCE_ARTIFACT_S3_FORCE_PATH_STYLE is required when checkout preparation is enabled");
  }
  const kmsKeyArn = requiredFinanceCheckoutConfig(config.PUBLIC_API_FINANCE_ARTIFACT_KMS_KEY_ARN);
  if (!/^arn:aws[a-z-]*:kms:[a-z0-9-]+:\d{12}:key\/[0-9a-f-]{36}$/i.test(kmsKeyArn)) {
    throw new Error("PUBLIC_API_FINANCE_ARTIFACT_KMS_KEY_ARN must be a customer-managed KMS key ARN");
  }
  return Object.freeze({
    environment: config.PUBLIC_API_FINANCE_CHECKOUT_ENVIRONMENT,
    paymentMethods: parseFinanceCheckoutPaymentMethods(
      requiredFinanceCheckoutConfig(config.PUBLIC_API_FINANCE_CHECKOUT_PAYMENT_METHODS)
    ),
    artifactStorage: Object.freeze({
      endpoint,
      region: requiredFinanceCheckoutConfig(config.PUBLIC_API_FINANCE_ARTIFACT_S3_REGION),
      bucket: requiredFinanceCheckoutConfig(config.PUBLIC_API_FINANCE_ARTIFACT_S3_BUCKET),
      accessKeyId: requiredFinanceCheckoutConfig(config.PUBLIC_API_FINANCE_ARTIFACT_S3_ACCESS_KEY_ID),
      secretAccessKey: requiredFinanceCheckoutConfig(config.PUBLIC_API_FINANCE_ARTIFACT_S3_SECRET_ACCESS_KEY),
      forcePathStyle: forcePathStyle === "true",
      kmsKeyArn
    }),
    requestArtifactRetention: Object.freeze({
      policyId: requiredFinanceCheckoutConfig(config.PUBLIC_API_FINANCE_PROVIDER_REQUEST_RETENTION_POLICY_ID),
      policyVersion: requiredFinanceCheckoutConfig(config.PUBLIC_API_FINANCE_PROVIDER_REQUEST_RETENTION_POLICY_VERSION)
    })
  });
}

function parseFinanceCheckoutPaymentMethods(value: string): readonly FinanceCheckoutPaymentMethod[] {
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { throw new Error("PUBLIC_API_FINANCE_CHECKOUT_PAYMENT_METHODS must be valid JSON"); }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("PUBLIC_API_FINANCE_CHECKOUT_PAYMENT_METHODS must be a non-empty JSON array");
  }
  return parsed.map((entry) => financeCheckoutPaymentMethodSchema.parse(entry));
}

function requiredFinanceCheckoutConfig(value: string | undefined): string {
  if (!value) throw new Error("PUBLIC_API_FINANCE_CHECKOUT_PREPARATION_ENABLED requires private artifact storage and retention policy configuration");
  return value;
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
