import { describe, expect, it } from "vitest";
import { createOpsApiRuntimeConfig } from "./runtime-config";

const testEncryptionKey = Buffer.alloc(32, 1).toString("base64");
const requiredSecurityConfig = {
  AUTH_CODE_DELIVERY_ENCRYPTION_KEY: testEncryptionKey
};
const defaultSecurityConfig = {
  sessionTtlSeconds: 604800,
  sessionCookieSecure: false,
  sessionCookieName: "elevenhouse_ops_session",
  csrfSecret: "elevenhouse-dev-ops-api-csrf-secret-change-before-production",
  csrfCookieName: "elevenhouse_ops_csrf",
  csrfHeaderName: "x-csrf-token",
  csrfTokenTtlSeconds: 604800,
  allowedOrigins: ["http://localhost:5174", "http://localhost:5175"],
  authCodeDeliveryEncryptionKey: Buffer.alloc(32, 1),
  passwordlessCodeSecret: "elevenhouse-dev-ops-passwordless-code-secret",
  passwordlessCodeTtlSeconds: 600,
  passwordlessResendCooldownSeconds: 60,
  passwordlessMaxAttempts: 5,
  passwordlessRateLimitRedisKeyPrefix: "elevenhouse:ops-api",
  passwordlessRateLimits: {
    requestCodeIdentifier: { limit: 5, windowSeconds: 3600 },
    requestCodeIp: { limit: 30, windowSeconds: 3600 },
    requestCodeIdentifierIp: { limit: 3, windowSeconds: 3600 },
    verifyChallenge: { limit: 5, windowSeconds: 900 },
    verifyIp: { limit: 60, windowSeconds: 900 }
  }
};

describe("createOpsApiRuntimeConfig", () => {
  it("uses the default ops API port when env is not set", () => {
    expect(createOpsApiRuntimeConfig(requiredSecurityConfig)).toEqual({
      port: 3002,
      redisUrl: "redis://localhost:6379",
      ...defaultSecurityConfig
    });
  });

  it("parses OPS_API_PORT from env", () => {
    expect(createOpsApiRuntimeConfig({ ...requiredSecurityConfig, OPS_API_PORT: "4012" })).toEqual({
      port: 4012,
      redisUrl: "redis://localhost:6379",
      ...defaultSecurityConfig
    });
  });

  it("parses REDIS_URL from env", () => {
    expect(
      createOpsApiRuntimeConfig({
        ...requiredSecurityConfig,
        REDIS_URL: "redis://redis.internal:6379/4"
      })
    ).toEqual({
      port: 3002,
      redisUrl: "redis://redis.internal:6379/4",
      ...defaultSecurityConfig
    });
  });

  it("parses ops session settings from env", () => {
    expect(
      createOpsApiRuntimeConfig({
        ...requiredSecurityConfig,
        OPS_API_SESSION_TTL_SECONDS: "3600",
        OPS_API_SESSION_COOKIE_SECURE: "true"
      })
    ).toEqual({
      port: 3002,
      redisUrl: "redis://localhost:6379",
      ...defaultSecurityConfig,
      sessionTtlSeconds: 3600,
      sessionCookieSecure: true,
      sessionCookieName: "__Host-elevenhouse_ops_session"
    });
  });

  it("parses an explicit ops session cookie name from env", () => {
    expect(
      createOpsApiRuntimeConfig({
        ...requiredSecurityConfig,
        OPS_API_SESSION_COOKIE_NAME: "custom_ops_session"
      })
    ).toEqual({
      port: 3002,
      redisUrl: "redis://localhost:6379",
      ...defaultSecurityConfig,
      sessionCookieName: "custom_ops_session"
    });
  });

  it("parses ops CSRF settings from env", () => {
    expect(
      createOpsApiRuntimeConfig({
        ...requiredSecurityConfig,
        OPS_API_CSRF_SECRET: "configured-ops-csrf-secret-with-enough-entropy",
        OPS_API_CSRF_COOKIE_NAME: "custom_ops_csrf",
        OPS_API_CSRF_HEADER_NAME: "X-ElevenHouse-CSRF",
        OPS_API_CSRF_TOKEN_TTL_SECONDS: "1800",
        OPS_API_ALLOWED_ORIGINS: "https://ops.elevenhouse.com, https://admin.elevenhouse.com/"
      })
    ).toMatchObject({
      csrfSecret: "configured-ops-csrf-secret-with-enough-entropy",
      csrfCookieName: "custom_ops_csrf",
      csrfHeaderName: "x-elevenhouse-csrf",
      csrfTokenTtlSeconds: 1800,
      allowedOrigins: ["https://ops.elevenhouse.com", "https://admin.elevenhouse.com"]
    });
  });

  it("rejects __Host-prefixed ops session cookie names without Secure", () => {
    expect(() =>
      createOpsApiRuntimeConfig({
        ...requiredSecurityConfig,
        OPS_API_SESSION_COOKIE_NAME: "__Host-elevenhouse_ops_session",
        OPS_API_SESSION_COOKIE_SECURE: "false"
      })
    ).toThrow("__Host-prefixed ops session cookies require Secure=true");
  });

  it("requires an explicit CSRF secret in production", () => {
    expect(() =>
      createOpsApiRuntimeConfig({
        ...requiredSecurityConfig,
        NODE_ENV: "production"
      })
    ).toThrow("OPS_API_CSRF_SECRET is required in production");
  });

  it("requires explicit allowed origins in production", () => {
    expect(() =>
      createOpsApiRuntimeConfig({
        ...requiredSecurityConfig,
        NODE_ENV: "production",
        OPS_API_CSRF_SECRET: "configured-ops-csrf-secret-with-enough-entropy",
        OPS_API_PASSWORDLESS_CODE_SECRET: "configured-secret"
      })
    ).toThrow("OPS_API_ALLOWED_ORIGINS is required in production");
  });

  it("requires an explicit passwordless code secret in production", () => {
    expect(() =>
      createOpsApiRuntimeConfig({
        ...requiredSecurityConfig,
        NODE_ENV: "production",
        OPS_API_CSRF_SECRET: "configured-ops-csrf-secret-with-enough-entropy",
        OPS_API_ALLOWED_ORIGINS: "https://ops.elevenhouse.com"
      })
    ).toThrow("OPS_API_PASSWORDLESS_CODE_SECRET is required in production");
  });

  it("parses ops passwordless auth settings from env", () => {
    expect(
      createOpsApiRuntimeConfig({
        ...requiredSecurityConfig,
        OPS_API_PASSWORDLESS_CODE_SECRET: "configured-secret",
        OPS_API_PASSWORDLESS_CODE_TTL_SECONDS: "900",
        OPS_API_PASSWORDLESS_RESEND_COOLDOWN_SECONDS: "120",
        OPS_API_PASSWORDLESS_MAX_ATTEMPTS: "3",
        OPS_API_PASSWORDLESS_RATE_LIMIT_REDIS_KEY_PREFIX: "elevenhouse:test-ops-api",
        OPS_API_PASSWORDLESS_REQUEST_CODE_IDENTIFIER_LIMIT: "4",
        OPS_API_PASSWORDLESS_REQUEST_CODE_IDENTIFIER_WINDOW_SECONDS: "1800",
        OPS_API_PASSWORDLESS_REQUEST_CODE_IP_LIMIT: "20",
        OPS_API_PASSWORDLESS_REQUEST_CODE_IP_WINDOW_SECONDS: "600",
        OPS_API_PASSWORDLESS_REQUEST_CODE_IDENTIFIER_IP_LIMIT: "2",
        OPS_API_PASSWORDLESS_REQUEST_CODE_IDENTIFIER_IP_WINDOW_SECONDS: "300",
        OPS_API_PASSWORDLESS_VERIFY_CHALLENGE_LIMIT: "4",
        OPS_API_PASSWORDLESS_VERIFY_CHALLENGE_WINDOW_SECONDS: "120",
        OPS_API_PASSWORDLESS_VERIFY_IP_LIMIT: "40",
        OPS_API_PASSWORDLESS_VERIFY_IP_WINDOW_SECONDS: "900"
      })
    ).toMatchObject({
      passwordlessCodeSecret: "configured-secret",
      passwordlessCodeTtlSeconds: 900,
      passwordlessResendCooldownSeconds: 120,
      passwordlessMaxAttempts: 3,
      passwordlessRateLimitRedisKeyPrefix: "elevenhouse:test-ops-api",
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
    expect(() => createOpsApiRuntimeConfig({})).toThrow(
      "AUTH_CODE_DELIVERY_ENCRYPTION_KEY"
    );
  });
});
