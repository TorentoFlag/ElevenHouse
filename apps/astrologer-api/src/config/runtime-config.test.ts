import { describe, expect, it } from "vitest";
import { createAstrologerApiRuntimeConfig } from "./runtime-config";

const testEncryptionKey = Buffer.alloc(32, 1).toString("base64");
const requiredSecurityConfig = {
  AUTH_CODE_DELIVERY_ENCRYPTION_KEY: testEncryptionKey
};
const defaultAiConfig = {
  enabled: false,
  provider: "openai",
  openAiApiKey: undefined,
  openAiBaseUrl: "https://api.openai.com/v1",
  fastDraftModel: "gpt-5.4-mini",
  qualityDraftModel: "gpt-5.5",
  timeoutMs: 90_000,
  maxOutputTokens: 5000,
  rateLimitRedisKeyPrefix: "elevenhouse:astrologer-api:ai",
  rateLimits: {
    userPerMinute: { limit: 3, windowSeconds: 60 },
    userPerHour: { limit: 30, windowSeconds: 3600 },
    userPerDay: { limit: 150, windowSeconds: 86400 }
  }
};
const defaultTrustedStaticCode = {
  channel: "phone",
  code: "777777",
  identifierNormalized: "+78005553535"
};
const defaultSecurityConfig = {
  trustProxy: false,
  sessionTtlSeconds: 604800,
  sessionCookieSecure: false,
  sessionCookieName: "elevenhouse_astrologer_session",
  csrfSecret: "elevenhouse-dev-astrologer-api-csrf-secret-change-before-production",
  csrfCookieName: "elevenhouse_astrologer_csrf",
  csrfHeaderName: "x-csrf-token",
  csrfTokenTtlSeconds: 604800,
  telegramBotWebhookSecret: null,
  telegramBusinessBotApi: null,
  telegramBusinessBotUsername: null,
  telegramMtproto: null,
  allowedOrigins: ["http://localhost:5174"],
  chartEngineBaseUrl: "http://localhost:8012",
  authCodeDeliveryEncryptionKey: Buffer.alloc(32, 1),
  passwordlessCodeSecret: "elevenhouse-dev-astrologer-passwordless-code-secret",
  passwordlessCodeTtlSeconds: 600,
  passwordlessResendCooldownSeconds: 60,
  passwordlessMaxAttempts: 5,
  passwordlessTrustedStaticCode: defaultTrustedStaticCode,
  passwordlessRateLimitRedisKeyPrefix: "elevenhouse:astrologer-api",
  passwordlessRateLimits: {
    requestCodeIdentifier: { limit: 5, windowSeconds: 3600 },
    requestCodeIp: { limit: 30, windowSeconds: 3600 },
    requestCodeIdentifierIp: { limit: 3, windowSeconds: 3600 },
    verifyChallenge: { limit: 5, windowSeconds: 900 },
    verifyIp: { limit: 60, windowSeconds: 900 }
  },
  mediaStorage: {
    endpoint: "http://localhost:9000",
    region: "us-east-1",
    bucket: "elevenhouse-local-media",
    privateBucket: "elevenhouse-local-private",
    accessKeyId: "elevenhouse",
    secretAccessKey: "elevenhouse-secret",
    forcePathStyle: true,
    publicBaseUrl: "http://localhost:9000/elevenhouse-local-media",
    uploadTtlSeconds: 900,
    downloadTtlSeconds: 300
  },
  billing: {
    arcPayConfigured: false
  },
  ai: defaultAiConfig
};

describe("createAstrologerApiRuntimeConfig", () => {
  it("uses the default astrologer API port when env is not set", () => {
    expect(createAstrologerApiRuntimeConfig(requiredSecurityConfig)).toEqual({
      port: 3002,
      redisUrl: "redis://localhost:6379",
      ...defaultSecurityConfig
    });
  });

  it("parses ASTROLOGER_API_PORT from env", () => {
    expect(
      createAstrologerApiRuntimeConfig({
        ...requiredSecurityConfig,
        ASTROLOGER_API_PORT: "4012"
      })
    ).toEqual({
      port: 4012,
      redisUrl: "redis://localhost:6379",
      ...defaultSecurityConfig
    });
  });

  it("parses and normalizes the private chart engine base URL", () => {
    expect(
      createAstrologerApiRuntimeConfig({
        ...requiredSecurityConfig,
        CHART_ENGINE_BASE_URL: "http://chart-engine:8012/"
      })
    ).toMatchObject({
      chartEngineBaseUrl: "http://chart-engine:8012"
    });
  });

  it("parses explicit trust proxy settings from env", () => {
    expect(
      createAstrologerApiRuntimeConfig({
        ...requiredSecurityConfig,
        ASTROLOGER_API_TRUST_PROXY: "true"
      })
    ).toMatchObject({
      trustProxy: true
    });
  });

  it("parses REDIS_URL from env", () => {
    expect(
      createAstrologerApiRuntimeConfig({
        ...requiredSecurityConfig,
        REDIS_URL: "redis://redis.internal:6379/4"
      })
    ).toEqual({
      port: 3002,
      redisUrl: "redis://redis.internal:6379/4",
      ...defaultSecurityConfig
    });
  });

  it("parses S3-compatible media storage settings from env", () => {
    const config = createAstrologerApiRuntimeConfig({
      ...requiredSecurityConfig,
      ASTROLOGER_MEDIA_STORAGE_ENDPOINT: "https://s3.storage.example/",
      ASTROLOGER_MEDIA_STORAGE_REGION: "eu-central-1",
      ASTROLOGER_MEDIA_STORAGE_BUCKET: "elevenhouse-prod-media",
      ASTROLOGER_MEDIA_PRIVATE_STORAGE_BUCKET: "elevenhouse-prod-private",
      ASTROLOGER_MEDIA_STORAGE_ACCESS_KEY_ID: "prod-key",
      ASTROLOGER_MEDIA_STORAGE_SECRET_ACCESS_KEY: "prod-secret",
      ASTROLOGER_MEDIA_STORAGE_FORCE_PATH_STYLE: "false",
      ASTROLOGER_MEDIA_STORAGE_PUBLIC_BASE_URL: "https://cdn.elevenhouse.com/media/",
      ASTROLOGER_MEDIA_UPLOAD_TTL_SECONDS: "600",
      ASTROLOGER_MEDIA_DOWNLOAD_TTL_SECONDS: "120"
    });

    expect(config.mediaStorage).toEqual({
      endpoint: "https://s3.storage.example",
      region: "eu-central-1",
      bucket: "elevenhouse-prod-media",
      privateBucket: "elevenhouse-prod-private",
      accessKeyId: "prod-key",
      secretAccessKey: "prod-secret",
      forcePathStyle: false,
      publicBaseUrl: "https://cdn.elevenhouse.com/media",
      uploadTtlSeconds: 600,
      downloadTtlSeconds: 120
    });
  });

  it("rejects a private report bucket that is also anonymously served media", () => {
    expect(() =>
      createAstrologerApiRuntimeConfig({
        ...requiredSecurityConfig,
        ASTROLOGER_MEDIA_STORAGE_BUCKET: "shared",
        ASTROLOGER_MEDIA_PRIVATE_STORAGE_BUCKET: "shared"
      })
    ).toThrow("must be different");
  });

  it("parses astrologer session settings from env", () => {
    expect(
      createAstrologerApiRuntimeConfig({
        ...requiredSecurityConfig,
        ASTROLOGER_API_SESSION_TTL_SECONDS: "3600",
        ASTROLOGER_API_SESSION_COOKIE_SECURE: "true"
      })
    ).toEqual({
      port: 3002,
      redisUrl: "redis://localhost:6379",
      ...defaultSecurityConfig,
      sessionTtlSeconds: 3600,
      sessionCookieSecure: true,
      sessionCookieName: "__Host-elevenhouse_astrologer_session"
    });
  });

  it("parses an explicit astrologer session cookie name from env", () => {
    expect(
      createAstrologerApiRuntimeConfig({
        ...requiredSecurityConfig,
        ASTROLOGER_API_SESSION_COOKIE_NAME: "custom_astrologer_session"
      })
    ).toEqual({
      port: 3002,
      redisUrl: "redis://localhost:6379",
      ...defaultSecurityConfig,
      sessionCookieName: "custom_astrologer_session"
    });
  });

  it("parses astrologer CSRF settings from env", () => {
    expect(
      createAstrologerApiRuntimeConfig({
        ...requiredSecurityConfig,
        ASTROLOGER_API_CSRF_SECRET: "configured-astrologer-csrf-secret-with-enough-entropy",
        ASTROLOGER_API_CSRF_COOKIE_NAME: "custom_astrologer_csrf",
        ASTROLOGER_API_CSRF_HEADER_NAME: "X-ElevenHouse-CSRF",
        ASTROLOGER_API_CSRF_TOKEN_TTL_SECONDS: "1800",
        ASTROLOGER_API_ALLOWED_ORIGINS:
          "https://astrologer.elevenhouse.com, https://crm.elevenhouse.com/"
      })
    ).toMatchObject({
      csrfSecret: "configured-astrologer-csrf-secret-with-enough-entropy",
      csrfCookieName: "custom_astrologer_csrf",
      csrfHeaderName: "x-elevenhouse-csrf",
      csrfTokenTtlSeconds: 1800,
      allowedOrigins: ["https://astrologer.elevenhouse.com", "https://crm.elevenhouse.com"]
    });
  });

  it("parses Telegram Bot API webhook secret settings from env", () => {
    expect(
      createAstrologerApiRuntimeConfig({
        ...requiredSecurityConfig,
        ASTROLOGER_API_TELEGRAM_BOT_WEBHOOK_SECRET: "telegram-provider-secret"
      })
    ).toMatchObject({
      telegramBotWebhookSecret: "telegram-provider-secret"
    });
  });

  it("parses Telegram Bot API connection lookup settings from env", () => {
    expect(
      createAstrologerApiRuntimeConfig({
        ...requiredSecurityConfig,
        ASTROLOGER_API_TELEGRAM_BOT_TOKEN: "telegram-bot-token",
        ASTROLOGER_API_TELEGRAM_BOT_API_BASE_URL: "https://telegram.test/"
      })
    ).toMatchObject({
      telegramBusinessBotApi: {
        botToken: "telegram-bot-token",
        botApiBaseUrl: "https://telegram.test"
      }
    });
  });

  it("falls back to the notification-worker Telegram token for local compatibility", () => {
    expect(
      createAstrologerApiRuntimeConfig({
        ...requiredSecurityConfig,
        NOTIFICATION_WORKER_TELEGRAM_BOT_TOKEN: "worker-telegram-bot-token",
        NOTIFICATION_WORKER_TELEGRAM_BOT_API_BASE_URL: "https://telegram-worker.test/"
      })
    ).toMatchObject({
      telegramBusinessBotApi: {
        botToken: "worker-telegram-bot-token",
        botApiBaseUrl: "https://telegram-worker.test"
      }
    });
  });

  it("parses the public Telegram Business bot username from env", () => {
    expect(
      createAstrologerApiRuntimeConfig({
        ...requiredSecurityConfig,
        ASTROLOGER_API_TELEGRAM_BUSINESS_BOT_USERNAME: "@ElevenHouseTestBot"
      })
    ).toMatchObject({
      telegramBusinessBotUsername: "ElevenHouseTestBot"
    });
  });

  it("parses Telegram MTProto login settings from env", () => {
    const mtprotoEncryptionKey = Buffer.alloc(32, 12).toString("base64");

    expect(
      createAstrologerApiRuntimeConfig({
        ...requiredSecurityConfig,
        ASTROLOGER_API_TELEGRAM_MTPROTO_ENABLED: "true",
        ASTROLOGER_API_TELEGRAM_MTPROTO_API_ID: "12345",
        ASTROLOGER_API_TELEGRAM_MTPROTO_API_HASH: "0123456789abcdef0123456789abcdef",
        ASTROLOGER_API_TELEGRAM_MTPROTO_SESSION_ENCRYPTION_KEY: mtprotoEncryptionKey
      })
    ).toMatchObject({
      telegramMtproto: {
        enabled: true,
        apiId: 12345,
        apiHash: "0123456789abcdef0123456789abcdef",
        sessionEncryptionKey: Buffer.alloc(32, 12)
      }
    });
  });

  it("requires complete Telegram MTProto login settings when the login flow is enabled", () => {
    expect(() =>
      createAstrologerApiRuntimeConfig({
        ...requiredSecurityConfig,
        ASTROLOGER_API_TELEGRAM_MTPROTO_ENABLED: "true",
        ASTROLOGER_API_TELEGRAM_MTPROTO_API_ID: "12345",
        ASTROLOGER_API_TELEGRAM_MTPROTO_API_HASH: "0123456789abcdef0123456789abcdef"
      })
    ).toThrow("Telegram MTProto settings are required when MTProto login is enabled");
  });

  it("rejects __Host-prefixed astrologer session cookie names without Secure", () => {
    expect(() =>
      createAstrologerApiRuntimeConfig({
        ...requiredSecurityConfig,
        ASTROLOGER_API_SESSION_COOKIE_NAME: "__Host-elevenhouse_astrologer_session",
        ASTROLOGER_API_SESSION_COOKIE_SECURE: "false"
      })
    ).toThrow("__Host-prefixed astrologer session cookies require Secure=true");
  });

  it("requires an explicit CSRF secret in production", () => {
    expect(() =>
      createAstrologerApiRuntimeConfig({
        ...requiredSecurityConfig,
        NODE_ENV: "production",
        ASTROLOGER_API_SESSION_COOKIE_SECURE: "true"
      })
    ).toThrow("ASTROLOGER_API_CSRF_SECRET is required in production");
  });

  it("requires secure astrologer session cookies in production", () => {
    expect(() =>
      createAstrologerApiRuntimeConfig({
        ...requiredSecurityConfig,
        NODE_ENV: "production",
        ASTROLOGER_API_PASSWORDLESS_CODE_SECRET: "configured-secret",
        ASTROLOGER_API_CSRF_SECRET: "configured-csrf-secret-with-enough-entropy",
        ASTROLOGER_API_ALLOWED_ORIGINS: "https://astrologer.elevenhouse.com"
      })
    ).toThrow("ASTROLOGER_API_SESSION_COOKIE_SECURE=true is required in production");
  });

  it("requires explicit allowed origins in production", () => {
    expect(() =>
      createAstrologerApiRuntimeConfig({
        ...requiredSecurityConfig,
        NODE_ENV: "production",
        ASTROLOGER_API_SESSION_COOKIE_SECURE: "true",
        ASTROLOGER_API_CSRF_SECRET: "configured-astrologer-csrf-secret-with-enough-entropy",
        ASTROLOGER_API_TELEGRAM_BOT_WEBHOOK_SECRET: "telegram-provider-secret",
        ASTROLOGER_API_TELEGRAM_BOT_TOKEN: "telegram-bot-token",
        ASTROLOGER_API_PASSWORDLESS_CODE_SECRET: "configured-secret"
      })
    ).toThrow("ASTROLOGER_API_ALLOWED_ORIGINS is required in production");
  });

  it("requires an explicit passwordless code secret in production", () => {
    expect(() =>
      createAstrologerApiRuntimeConfig({
        ...requiredSecurityConfig,
        NODE_ENV: "production",
        ASTROLOGER_API_SESSION_COOKIE_SECURE: "true",
        ASTROLOGER_API_CSRF_SECRET: "configured-astrologer-csrf-secret-with-enough-entropy",
        ASTROLOGER_API_TELEGRAM_BOT_WEBHOOK_SECRET: "telegram-provider-secret",
        ASTROLOGER_API_TELEGRAM_BOT_TOKEN: "telegram-bot-token",
        ASTROLOGER_API_ALLOWED_ORIGINS: "https://astrologer.elevenhouse.com"
      })
    ).toThrow("ASTROLOGER_API_PASSWORDLESS_CODE_SECRET is required in production");
  });

  it("requires an explicit Telegram Bot API webhook secret in production", () => {
    expect(() =>
      createAstrologerApiRuntimeConfig({
        ...requiredSecurityConfig,
        NODE_ENV: "production",
        ASTROLOGER_API_SESSION_COOKIE_SECURE: "true",
        ASTROLOGER_API_CSRF_SECRET: "configured-astrologer-csrf-secret-with-enough-entropy"
      })
    ).toThrow("ASTROLOGER_API_TELEGRAM_BOT_WEBHOOK_SECRET is required in production");
  });

  it("requires a Telegram Bot API token in production", () => {
    expect(() =>
      createAstrologerApiRuntimeConfig({
        ...requiredSecurityConfig,
        NODE_ENV: "production",
        ASTROLOGER_API_SESSION_COOKIE_SECURE: "true",
        ASTROLOGER_API_CSRF_SECRET: "configured-astrologer-csrf-secret-with-enough-entropy",
        ASTROLOGER_API_TELEGRAM_BOT_WEBHOOK_SECRET: "telegram-provider-secret"
      })
    ).toThrow("ASTROLOGER_API_TELEGRAM_BOT_TOKEN is required in production");
  });

  it("uses host-prefixed astrologer session cookies when production security settings are complete", () => {
    expect(
      createAstrologerApiRuntimeConfig({
        ...requiredSecurityConfig,
        NODE_ENV: "production",
        ASTROLOGER_API_SESSION_COOKIE_SECURE: "true",
        ASTROLOGER_API_CSRF_SECRET: "configured-astrologer-csrf-secret-with-enough-entropy",
        ASTROLOGER_API_TELEGRAM_BOT_WEBHOOK_SECRET: "telegram-provider-secret",
        ASTROLOGER_API_TELEGRAM_BOT_TOKEN: "telegram-bot-token",
        ASTROLOGER_API_PASSWORDLESS_CODE_SECRET: "configured-secret",
        ASTROLOGER_API_ALLOWED_ORIGINS: "https://astrologer.elevenhouse.com",
        CHART_ENGINE_BASE_URL: "http://chart-engine:8012"
      })
    ).toMatchObject({
      sessionCookieSecure: true,
      sessionCookieName: "__Host-elevenhouse_astrologer_session",
      csrfSecret: "configured-astrologer-csrf-secret-with-enough-entropy",
      telegramBotWebhookSecret: "telegram-provider-secret",
      passwordlessCodeSecret: "configured-secret",
      allowedOrigins: ["https://astrologer.elevenhouse.com"]
    });
  });

  it("rejects loopback chart engine URLs in production", () => {
    expect(() =>
      createAstrologerApiRuntimeConfig({
        ...requiredSecurityConfig,
        NODE_ENV: "production",
        ASTROLOGER_API_SESSION_COOKIE_SECURE: "true",
        ASTROLOGER_API_CSRF_SECRET: "configured-astrologer-csrf-secret-with-enough-entropy",
        ASTROLOGER_API_TELEGRAM_BOT_WEBHOOK_SECRET: "telegram-provider-secret",
        ASTROLOGER_API_TELEGRAM_BOT_TOKEN: "telegram-bot-token",
        ASTROLOGER_API_PASSWORDLESS_CODE_SECRET: "configured-secret",
        ASTROLOGER_API_ALLOWED_ORIGINS: "https://astrologer.elevenhouse.com",
        CHART_ENGINE_BASE_URL: "http://localhost:8012"
      })
    ).toThrow("CHART_ENGINE_BASE_URL must not use a loopback host in production");
  });

  it("parses astrologer passwordless auth settings from env", () => {
    expect(
      createAstrologerApiRuntimeConfig({
        ...requiredSecurityConfig,
        ASTROLOGER_API_PASSWORDLESS_CODE_SECRET: "configured-secret",
        ASTROLOGER_API_PASSWORDLESS_CODE_TTL_SECONDS: "900",
        ASTROLOGER_API_PASSWORDLESS_RESEND_COOLDOWN_SECONDS: "120",
        ASTROLOGER_API_PASSWORDLESS_MAX_ATTEMPTS: "3",
        ASTROLOGER_API_PASSWORDLESS_RATE_LIMIT_REDIS_KEY_PREFIX: "elevenhouse:test-astrologer-api",
        ASTROLOGER_API_PASSWORDLESS_REQUEST_CODE_IDENTIFIER_LIMIT: "4",
        ASTROLOGER_API_PASSWORDLESS_REQUEST_CODE_IDENTIFIER_WINDOW_SECONDS: "1800",
        ASTROLOGER_API_PASSWORDLESS_REQUEST_CODE_IP_LIMIT: "20",
        ASTROLOGER_API_PASSWORDLESS_REQUEST_CODE_IP_WINDOW_SECONDS: "600",
        ASTROLOGER_API_PASSWORDLESS_REQUEST_CODE_IDENTIFIER_IP_LIMIT: "2",
        ASTROLOGER_API_PASSWORDLESS_REQUEST_CODE_IDENTIFIER_IP_WINDOW_SECONDS: "300",
        ASTROLOGER_API_PASSWORDLESS_VERIFY_CHALLENGE_LIMIT: "4",
        ASTROLOGER_API_PASSWORDLESS_VERIFY_CHALLENGE_WINDOW_SECONDS: "120",
        ASTROLOGER_API_PASSWORDLESS_VERIFY_IP_LIMIT: "40",
        ASTROLOGER_API_PASSWORDLESS_VERIFY_IP_WINDOW_SECONDS: "900"
      })
    ).toMatchObject({
      passwordlessCodeSecret: "configured-secret",
      passwordlessCodeTtlSeconds: 900,
      passwordlessResendCooldownSeconds: 120,
      passwordlessMaxAttempts: 3,
      passwordlessRateLimitRedisKeyPrefix: "elevenhouse:test-astrologer-api",
      passwordlessRateLimits: {
        requestCodeIdentifier: { limit: 4, windowSeconds: 1800 },
        requestCodeIp: { limit: 20, windowSeconds: 600 },
        requestCodeIdentifierIp: { limit: 2, windowSeconds: 300 },
        verifyChallenge: { limit: 4, windowSeconds: 120 },
        verifyIp: { limit: 40, windowSeconds: 900 }
      }
    });
  });

  it("requires an explicit auth code delivery encryption key", () => {
    expect(() => createAstrologerApiRuntimeConfig({})).toThrow("AUTH_CODE_DELIVERY_ENCRYPTION_KEY");
  });

  it("parses disabled AI runtime config without requiring an OpenAI key", () => {
    const config = createAstrologerApiRuntimeConfig({
      ...requiredSecurityConfig,
      ASTROLOGER_AI_ENABLED: "false"
    });

    expect(config.ai).toEqual(defaultAiConfig);
  });

  it("normalizes a blank OpenAI API key to undefined when AI is disabled", () => {
    const config = createAstrologerApiRuntimeConfig({
      ...requiredSecurityConfig,
      ASTROLOGER_AI_ENABLED: "false",
      ASTROLOGER_OPENAI_API_KEY: "   "
    });

    expect(config.ai.openAiApiKey).toBeUndefined();
  });

  it("requires an OpenAI API key when AI is enabled", () => {
    expect(() =>
      createAstrologerApiRuntimeConfig({
        ...requiredSecurityConfig,
        ASTROLOGER_AI_ENABLED: "true"
      })
    ).toThrow("ASTROLOGER_OPENAI_API_KEY is required when ASTROLOGER_AI_ENABLED=true");
  });

  it("requires an OpenAI API key when AI is enabled and the key is blank", () => {
    expect(() =>
      createAstrologerApiRuntimeConfig({
        ...requiredSecurityConfig,
        ASTROLOGER_AI_ENABLED: "true",
        ASTROLOGER_OPENAI_API_KEY: "   "
      })
    ).toThrow("ASTROLOGER_OPENAI_API_KEY is required when ASTROLOGER_AI_ENABLED=true");
  });

  it("rejects cleartext OpenAI base URLs in production when AI is enabled", () => {
    expect(() =>
      createAstrologerApiRuntimeConfig({
        ...requiredSecurityConfig,
        NODE_ENV: "production",
        ASTROLOGER_API_SESSION_COOKIE_SECURE: "true",
        ASTROLOGER_API_CSRF_SECRET: "configured-astrologer-csrf-secret-with-enough-entropy",
        ASTROLOGER_API_TELEGRAM_BOT_WEBHOOK_SECRET: "telegram-provider-secret",
        ASTROLOGER_API_TELEGRAM_BOT_TOKEN: "telegram-bot-token",
        ASTROLOGER_API_PASSWORDLESS_CODE_SECRET: "configured-secret",
        ASTROLOGER_API_ALLOWED_ORIGINS: "https://astrologer.elevenhouse.com",
        ASTROLOGER_AI_ENABLED: "true",
        ASTROLOGER_OPENAI_API_KEY: "openai-secret",
        ASTROLOGER_OPENAI_BASE_URL: "http://openai.internal",
        CHART_ENGINE_BASE_URL: "http://chart-engine:8012"
      })
    ).toThrow(
      "ASTROLOGER_OPENAI_BASE_URL must use https in production when ASTROLOGER_AI_ENABLED=true"
    );
  });

  it("parses enabled AI runtime config", () => {
    const config = createAstrologerApiRuntimeConfig({
      ...requiredSecurityConfig,
      ASTROLOGER_AI_ENABLED: "true",
      ASTROLOGER_OPENAI_API_KEY: "openai-secret",
      ASTROLOGER_AI_RATE_LIMIT_USER_PER_MINUTE: "5"
    });

    expect(config.ai.enabled).toBe(true);
    expect(config.ai.openAiApiKey).toBe("openai-secret");
    expect(config.ai.rateLimits.userPerMinute).toEqual({ limit: 5, windowSeconds: 60 });
  });
});
