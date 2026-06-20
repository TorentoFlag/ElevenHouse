import { describe, expect, it } from "vitest";
import { createAstrologerApiRuntimeConfig } from "./runtime-config";

const testEncryptionKey = Buffer.alloc(32, 1).toString("base64");
const requiredSecurityConfig = {
  AUTH_CODE_DELIVERY_ENCRYPTION_KEY: testEncryptionKey
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
  allowedOrigins: ["http://localhost:5174", "http://localhost:5175"],
  authCodeDeliveryEncryptionKey: Buffer.alloc(32, 1),
  passwordlessCodeSecret: "elevenhouse-dev-astrologer-passwordless-code-secret",
  passwordlessCodeTtlSeconds: 600,
  passwordlessResendCooldownSeconds: 60,
  passwordlessMaxAttempts: 5,
  passwordlessRateLimitRedisKeyPrefix: "elevenhouse:astrologer-api",
  passwordlessRateLimits: {
    requestCodeIdentifier: { limit: 5, windowSeconds: 3600 },
    requestCodeIp: { limit: 30, windowSeconds: 3600 },
    requestCodeIdentifierIp: { limit: 3, windowSeconds: 3600 },
    verifyChallenge: { limit: 5, windowSeconds: 900 },
    verifyIp: { limit: 60, windowSeconds: 900 }
  }
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
        ASTROLOGER_API_ALLOWED_ORIGINS: "https://astrologer.elevenhouse.com"
      })
    ).toThrow("ASTROLOGER_API_PASSWORDLESS_CODE_SECRET is required in production");
  });

  it("uses host-prefixed astrologer session cookies when production security settings are complete", () => {
    expect(
      createAstrologerApiRuntimeConfig({
        ...requiredSecurityConfig,
        NODE_ENV: "production",
        ASTROLOGER_API_SESSION_COOKIE_SECURE: "true",
        ASTROLOGER_API_CSRF_SECRET: "configured-astrologer-csrf-secret-with-enough-entropy",
        ASTROLOGER_API_PASSWORDLESS_CODE_SECRET: "configured-secret",
        ASTROLOGER_API_ALLOWED_ORIGINS: "https://astrologer.elevenhouse.com"
      })
    ).toMatchObject({
      sessionCookieSecure: true,
      sessionCookieName: "__Host-elevenhouse_astrologer_session",
      csrfSecret: "configured-astrologer-csrf-secret-with-enough-entropy",
      passwordlessCodeSecret: "configured-secret",
      allowedOrigins: ["https://astrologer.elevenhouse.com"]
    });
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
    expect(() => createAstrologerApiRuntimeConfig({})).toThrow(
      "AUTH_CODE_DELIVERY_ENCRYPTION_KEY"
    );
  });
});
