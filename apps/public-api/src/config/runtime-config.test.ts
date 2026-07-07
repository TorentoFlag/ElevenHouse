import { describe, expect, it } from "vitest";
import { publicSessionCookieName } from "@elevenhouse/auth";
import { createPublicApiRuntimeConfig } from "./runtime-config";

const defaultPasswordlessRateLimits = {
  requestCodeIdentifier: { limit: 5, windowSeconds: 3600 },
  requestCodeIp: { limit: 30, windowSeconds: 3600 },
  requestCodeIdentifierIp: { limit: 3, windowSeconds: 3600 },
  verifyChallenge: { limit: 5, windowSeconds: 900 },
  verifyIp: { limit: 60, windowSeconds: 900 }
};
const testEncryptionKey = Buffer.alloc(32, 1).toString("base64");
const requiredSecurityConfig = {
  AUTH_CODE_DELIVERY_ENCRYPTION_KEY: testEncryptionKey
};
const defaultCsrfConfig = {
  csrfSecret: "elevenhouse-dev-public-api-csrf-secret-change-before-production",
  csrfCookieName: "elevenhouse_public_csrf",
  csrfHeaderName: "x-csrf-token",
  csrfTokenTtlSeconds: 604800,
  allowedOrigins: ["http://localhost:3000", "http://localhost:3001", "http://localhost:5173"]
};

describe("createPublicApiRuntimeConfig", () => {
  it("uses the default public API port when env is not set", () => {
    expect(createPublicApiRuntimeConfig(requiredSecurityConfig)).toEqual({
      port: 3001,
      trustProxy: false,
      redisUrl: "redis://localhost:6379",
      sessionTtlSeconds: 604800,
      sessionCookieSecure: false,
      sessionCookieName: "elevenhouse_public_session",
      ...defaultCsrfConfig,
      authCodeDeliveryEncryptionKey: Buffer.alloc(32, 1),
      passwordlessCodeSecret: "elevenhouse-dev-passwordless-code-secret",
      passwordlessCodeTtlSeconds: 600,
      passwordlessResendCooldownSeconds: 60,
      passwordlessMaxAttempts: 5,
      passwordlessRateLimitRedisKeyPrefix: "elevenhouse:public-api",
      passwordlessRateLimits: defaultPasswordlessRateLimits
    });
  });

  it("parses PUBLIC_API_PORT from env", () => {
    expect(
      createPublicApiRuntimeConfig({ ...requiredSecurityConfig, PUBLIC_API_PORT: "4011" })
    ).toEqual({
      port: 4011,
      trustProxy: false,
      redisUrl: "redis://localhost:6379",
      sessionTtlSeconds: 604800,
      sessionCookieSecure: false,
      sessionCookieName: "elevenhouse_public_session",
      ...defaultCsrfConfig,
      authCodeDeliveryEncryptionKey: Buffer.alloc(32, 1),
      passwordlessCodeSecret: "elevenhouse-dev-passwordless-code-secret",
      passwordlessCodeTtlSeconds: 600,
      passwordlessResendCooldownSeconds: 60,
      passwordlessMaxAttempts: 5,
      passwordlessRateLimitRedisKeyPrefix: "elevenhouse:public-api",
      passwordlessRateLimits: defaultPasswordlessRateLimits
    });
  });

  it("parses explicit trust proxy settings from env", () => {
    expect(
      createPublicApiRuntimeConfig({
        ...requiredSecurityConfig,
        PUBLIC_API_TRUST_PROXY: "true"
      })
    ).toMatchObject({
      trustProxy: true
    });
  });

  it("parses public session settings from env", () => {
    expect(
      createPublicApiRuntimeConfig({
        ...requiredSecurityConfig,
        PUBLIC_API_SESSION_TTL_SECONDS: "3600",
        PUBLIC_API_SESSION_COOKIE_SECURE: "true"
      })
    ).toEqual({
      port: 3001,
      trustProxy: false,
      redisUrl: "redis://localhost:6379",
      sessionTtlSeconds: 3600,
      sessionCookieSecure: true,
      sessionCookieName: publicSessionCookieName,
      ...defaultCsrfConfig,
      authCodeDeliveryEncryptionKey: Buffer.alloc(32, 1),
      passwordlessCodeSecret: "elevenhouse-dev-passwordless-code-secret",
      passwordlessCodeTtlSeconds: 600,
      passwordlessResendCooldownSeconds: 60,
      passwordlessMaxAttempts: 5,
      passwordlessRateLimitRedisKeyPrefix: "elevenhouse:public-api",
      passwordlessRateLimits: defaultPasswordlessRateLimits
    });
  });

  it("parses an explicit public session cookie name from env", () => {
    expect(
      createPublicApiRuntimeConfig({
        ...requiredSecurityConfig,
        PUBLIC_API_SESSION_COOKIE_NAME: "custom_public_session"
      })
    ).toEqual({
      port: 3001,
      trustProxy: false,
      redisUrl: "redis://localhost:6379",
      sessionTtlSeconds: 604800,
      sessionCookieSecure: false,
      sessionCookieName: "custom_public_session",
      ...defaultCsrfConfig,
      authCodeDeliveryEncryptionKey: Buffer.alloc(32, 1),
      passwordlessCodeSecret: "elevenhouse-dev-passwordless-code-secret",
      passwordlessCodeTtlSeconds: 600,
      passwordlessResendCooldownSeconds: 60,
      passwordlessMaxAttempts: 5,
      passwordlessRateLimitRedisKeyPrefix: "elevenhouse:public-api",
      passwordlessRateLimits: defaultPasswordlessRateLimits
    });
  });

  it("parses CSRF settings from env", () => {
    expect(
      createPublicApiRuntimeConfig({
        ...requiredSecurityConfig,
        PUBLIC_API_CSRF_SECRET: "configured-csrf-secret-with-enough-entropy",
        PUBLIC_API_CSRF_COOKIE_NAME: "custom_public_csrf",
        PUBLIC_API_CSRF_HEADER_NAME: "X-ElevenHouse-CSRF",
        PUBLIC_API_CSRF_TOKEN_TTL_SECONDS: "1800",
        PUBLIC_API_ALLOWED_ORIGINS: "https://client.elevenhouse.com, https://app.elevenhouse.com/"
      })
    ).toMatchObject({
      csrfSecret: "configured-csrf-secret-with-enough-entropy",
      csrfCookieName: "custom_public_csrf",
      csrfHeaderName: "x-elevenhouse-csrf",
      csrfTokenTtlSeconds: 1800,
      allowedOrigins: ["https://client.elevenhouse.com", "https://app.elevenhouse.com"]
    });
  });

  it("rejects __Host-prefixed public session cookie names without Secure", () => {
    expect(() =>
      createPublicApiRuntimeConfig({
        ...requiredSecurityConfig,
        PUBLIC_API_SESSION_COOKIE_NAME: publicSessionCookieName,
        PUBLIC_API_SESSION_COOKIE_SECURE: "false"
      })
    ).toThrow("__Host-prefixed public session cookies require Secure=true");
  });

  it("parses passwordless auth settings from env", () => {
    expect(
      createPublicApiRuntimeConfig({
        ...requiredSecurityConfig,
        REDIS_URL: "redis://redis.internal:6379/2",
        PUBLIC_API_PASSWORDLESS_CODE_SECRET: "configured-secret",
        PUBLIC_API_PASSWORDLESS_CODE_TTL_SECONDS: "900",
        PUBLIC_API_PASSWORDLESS_RESEND_COOLDOWN_SECONDS: "120",
        PUBLIC_API_PASSWORDLESS_MAX_ATTEMPTS: "3",
        PUBLIC_API_PASSWORDLESS_RATE_LIMIT_REDIS_KEY_PREFIX: "elevenhouse:test-api",
        PUBLIC_API_PASSWORDLESS_REQUEST_CODE_IDENTIFIER_LIMIT: "4",
        PUBLIC_API_PASSWORDLESS_REQUEST_CODE_IDENTIFIER_WINDOW_SECONDS: "1800",
        PUBLIC_API_PASSWORDLESS_REQUEST_CODE_IP_LIMIT: "20",
        PUBLIC_API_PASSWORDLESS_REQUEST_CODE_IP_WINDOW_SECONDS: "600",
        PUBLIC_API_PASSWORDLESS_REQUEST_CODE_IDENTIFIER_IP_LIMIT: "2",
        PUBLIC_API_PASSWORDLESS_REQUEST_CODE_IDENTIFIER_IP_WINDOW_SECONDS: "300",
        PUBLIC_API_PASSWORDLESS_VERIFY_CHALLENGE_LIMIT: "4",
        PUBLIC_API_PASSWORDLESS_VERIFY_CHALLENGE_WINDOW_SECONDS: "120",
        PUBLIC_API_PASSWORDLESS_VERIFY_IP_LIMIT: "40",
        PUBLIC_API_PASSWORDLESS_VERIFY_IP_WINDOW_SECONDS: "900"
      })
    ).toMatchObject({
      redisUrl: "redis://redis.internal:6379/2",
      authCodeDeliveryEncryptionKey: Buffer.alloc(32, 1),
      passwordlessCodeSecret: "configured-secret",
      passwordlessCodeTtlSeconds: 900,
      passwordlessResendCooldownSeconds: 120,
      passwordlessMaxAttempts: 3,
      passwordlessRateLimitRedisKeyPrefix: "elevenhouse:test-api",
      passwordlessRateLimits: {
        requestCodeIdentifier: { limit: 4, windowSeconds: 1800 },
        requestCodeIp: { limit: 20, windowSeconds: 600 },
        requestCodeIdentifierIp: { limit: 2, windowSeconds: 300 },
        verifyChallenge: { limit: 4, windowSeconds: 120 },
        verifyIp: { limit: 40, windowSeconds: 900 }
      }
    });
  });

  it("requires an explicit passwordless code secret in production", () => {
    expect(() =>
      createPublicApiRuntimeConfig({
        ...requiredSecurityConfig,
        NODE_ENV: "production",
        PUBLIC_API_SESSION_COOKIE_SECURE: "true"
      })
    ).toThrow("PUBLIC_API_PASSWORDLESS_CODE_SECRET is required in production");
  });

  it("requires secure public session cookies in production", () => {
    expect(() =>
      createPublicApiRuntimeConfig({
        ...requiredSecurityConfig,
        NODE_ENV: "production",
        PUBLIC_API_PASSWORDLESS_CODE_SECRET: "configured-secret",
        PUBLIC_API_CSRF_SECRET: "configured-csrf-secret-with-enough-entropy",
        PUBLIC_API_ALLOWED_ORIGINS: "https://client.elevenhouse.com"
      })
    ).toThrow("PUBLIC_API_SESSION_COOKIE_SECURE=true is required in production");
  });

  it("requires an explicit CSRF secret in production", () => {
    expect(() =>
      createPublicApiRuntimeConfig({
        ...requiredSecurityConfig,
        NODE_ENV: "production",
        PUBLIC_API_SESSION_COOKIE_SECURE: "true",
        PUBLIC_API_PASSWORDLESS_CODE_SECRET: "configured-secret"
      })
    ).toThrow("PUBLIC_API_CSRF_SECRET is required in production");
  });

  it("requires explicit allowed origins in production", () => {
    expect(() =>
      createPublicApiRuntimeConfig({
        ...requiredSecurityConfig,
        NODE_ENV: "production",
        PUBLIC_API_SESSION_COOKIE_SECURE: "true",
        PUBLIC_API_PASSWORDLESS_CODE_SECRET: "configured-secret",
        PUBLIC_API_CSRF_SECRET: "configured-csrf-secret-with-enough-entropy"
      })
    ).toThrow("PUBLIC_API_ALLOWED_ORIGINS is required in production");
  });

  it("uses the host-prefixed public session cookie when production security settings are complete", () => {
    expect(
      createPublicApiRuntimeConfig({
        ...requiredSecurityConfig,
        NODE_ENV: "production",
        PUBLIC_API_SESSION_COOKIE_SECURE: "true",
        PUBLIC_API_PASSWORDLESS_CODE_SECRET: "configured-secret",
        PUBLIC_API_CSRF_SECRET: "configured-csrf-secret-with-enough-entropy",
        PUBLIC_API_ALLOWED_ORIGINS: "https://client.elevenhouse.com"
      })
    ).toMatchObject({
      sessionCookieSecure: true,
      sessionCookieName: publicSessionCookieName,
      passwordlessCodeSecret: "configured-secret",
      csrfSecret: "configured-csrf-secret-with-enough-entropy",
      allowedOrigins: ["https://client.elevenhouse.com"]
    });
  });

  it("requires an explicit auth code delivery encryption key", () => {
    expect(() => createPublicApiRuntimeConfig({})).toThrow("AUTH_CODE_DELIVERY_ENCRYPTION_KEY");
  });

  it("rejects auth code delivery encryption keys with the wrong length", () => {
    expect(() =>
      createPublicApiRuntimeConfig({
        AUTH_CODE_DELIVERY_ENCRYPTION_KEY: Buffer.alloc(16).toString("base64")
      })
    ).toThrow("AES-256-GCM key must be 32 bytes encoded as base64");
  });
});
