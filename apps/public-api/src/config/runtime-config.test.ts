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

describe("createPublicApiRuntimeConfig", () => {
  it("uses the default public API port when env is not set", () => {
    expect(createPublicApiRuntimeConfig({})).toEqual({
      port: 3001,
      redisUrl: "redis://localhost:6379",
      sessionTtlSeconds: 604800,
      sessionCookieSecure: false,
      sessionCookieName: "elevenhouse_public_session",
      passwordlessCodeSecret: "elevenhouse-dev-passwordless-code-secret",
      passwordlessCodeTtlSeconds: 600,
      passwordlessResendCooldownSeconds: 60,
      passwordlessMaxAttempts: 5,
      authCodeDeliveryProvider: "dev",
      passwordlessRateLimitRedisKeyPrefix: "elevenhouse:public-api",
      passwordlessRateLimits: defaultPasswordlessRateLimits
    });
  });

  it("parses PUBLIC_API_PORT from env", () => {
    expect(createPublicApiRuntimeConfig({ PUBLIC_API_PORT: "4011" })).toEqual({
      port: 4011,
      redisUrl: "redis://localhost:6379",
      sessionTtlSeconds: 604800,
      sessionCookieSecure: false,
      sessionCookieName: "elevenhouse_public_session",
      passwordlessCodeSecret: "elevenhouse-dev-passwordless-code-secret",
      passwordlessCodeTtlSeconds: 600,
      passwordlessResendCooldownSeconds: 60,
      passwordlessMaxAttempts: 5,
      authCodeDeliveryProvider: "dev",
      passwordlessRateLimitRedisKeyPrefix: "elevenhouse:public-api",
      passwordlessRateLimits: defaultPasswordlessRateLimits
    });
  });

  it("parses public session settings from env", () => {
    expect(
      createPublicApiRuntimeConfig({
        PUBLIC_API_SESSION_TTL_SECONDS: "3600",
        PUBLIC_API_SESSION_COOKIE_SECURE: "true"
      })
    ).toEqual({
      port: 3001,
      redisUrl: "redis://localhost:6379",
      sessionTtlSeconds: 3600,
      sessionCookieSecure: true,
      sessionCookieName: publicSessionCookieName,
      passwordlessCodeSecret: "elevenhouse-dev-passwordless-code-secret",
      passwordlessCodeTtlSeconds: 600,
      passwordlessResendCooldownSeconds: 60,
      passwordlessMaxAttempts: 5,
      authCodeDeliveryProvider: "dev",
      passwordlessRateLimitRedisKeyPrefix: "elevenhouse:public-api",
      passwordlessRateLimits: defaultPasswordlessRateLimits
    });
  });

  it("parses an explicit public session cookie name from env", () => {
    expect(
      createPublicApiRuntimeConfig({
        PUBLIC_API_SESSION_COOKIE_NAME: "custom_public_session"
      })
    ).toEqual({
      port: 3001,
      redisUrl: "redis://localhost:6379",
      sessionTtlSeconds: 604800,
      sessionCookieSecure: false,
      sessionCookieName: "custom_public_session",
      passwordlessCodeSecret: "elevenhouse-dev-passwordless-code-secret",
      passwordlessCodeTtlSeconds: 600,
      passwordlessResendCooldownSeconds: 60,
      passwordlessMaxAttempts: 5,
      authCodeDeliveryProvider: "dev",
      passwordlessRateLimitRedisKeyPrefix: "elevenhouse:public-api",
      passwordlessRateLimits: defaultPasswordlessRateLimits
    });
  });

  it("rejects __Host-prefixed public session cookie names without Secure", () => {
    expect(() =>
      createPublicApiRuntimeConfig({
        PUBLIC_API_SESSION_COOKIE_NAME: publicSessionCookieName,
        PUBLIC_API_SESSION_COOKIE_SECURE: "false"
      })
    ).toThrow("__Host-prefixed public session cookies require Secure=true");
  });

  it("parses passwordless auth settings from env", () => {
    expect(
      createPublicApiRuntimeConfig({
        REDIS_URL: "redis://redis.internal:6379/2",
        PUBLIC_API_PASSWORDLESS_CODE_SECRET: "configured-secret",
        PUBLIC_API_PASSWORDLESS_CODE_TTL_SECONDS: "900",
        PUBLIC_API_PASSWORDLESS_RESEND_COOLDOWN_SECONDS: "120",
        PUBLIC_API_PASSWORDLESS_MAX_ATTEMPTS: "3",
        PUBLIC_API_AUTH_CODE_DELIVERY_PROVIDER: "dev",
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
      passwordlessCodeSecret: "configured-secret",
      passwordlessCodeTtlSeconds: 900,
      passwordlessResendCooldownSeconds: 120,
      passwordlessMaxAttempts: 3,
      authCodeDeliveryProvider: "dev",
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

  it("parses email and SMS auth code delivery settings from env", () => {
    expect(
      createPublicApiRuntimeConfig({
        PUBLIC_API_AUTH_CODE_DELIVERY_PROVIDER: "email_sms",
        PUBLIC_API_AUTH_CODE_EMAIL_DELIVERY_ENDPOINT_URL:
          "https://delivery.internal/auth/email",
        PUBLIC_API_AUTH_CODE_EMAIL_DELIVERY_BEARER_TOKEN: "email-token",
        PUBLIC_API_AUTH_CODE_EMAIL_FROM: "auth@elevenhouse.test",
        PUBLIC_API_AUTH_CODE_SMS_DELIVERY_ENDPOINT_URL: "https://delivery.internal/auth/sms",
        PUBLIC_API_AUTH_CODE_SMS_DELIVERY_BEARER_TOKEN: "sms-token",
        PUBLIC_API_AUTH_CODE_SMS_FROM: "ElevenHouse"
      })
    ).toMatchObject({
      authCodeDeliveryProvider: "email_sms",
      authCodeEmailDelivery: {
        endpointUrl: "https://delivery.internal/auth/email",
        bearerToken: "email-token",
        from: "auth@elevenhouse.test"
      },
      authCodeSmsDelivery: {
        endpointUrl: "https://delivery.internal/auth/sms",
        bearerToken: "sms-token",
        from: "ElevenHouse"
      }
    });
  });

  it("requires email and SMS delivery settings when auth code delivery uses email_sms", () => {
    expect(() =>
      createPublicApiRuntimeConfig({
        PUBLIC_API_AUTH_CODE_DELIVERY_PROVIDER: "email_sms"
      })
    ).toThrow("PUBLIC_API_AUTH_CODE_EMAIL_DELIVERY_ENDPOINT_URL is required");
  });

  it("requires an explicit passwordless code secret in production", () => {
    expect(() =>
      createPublicApiRuntimeConfig({
        NODE_ENV: "production"
      })
    ).toThrow("PUBLIC_API_PASSWORDLESS_CODE_SECRET is required in production");
  });

  it("rejects dev auth code delivery in production", () => {
    expect(() =>
      createPublicApiRuntimeConfig({
        NODE_ENV: "production",
        PUBLIC_API_PASSWORDLESS_CODE_SECRET: "configured-secret",
        PUBLIC_API_AUTH_CODE_DELIVERY_PROVIDER: "dev"
      })
    ).toThrow("Dev auth code delivery is not allowed in production");
  });

  it("allows email and SMS auth code delivery in production with required settings", () => {
    expect(
      createPublicApiRuntimeConfig({
        NODE_ENV: "production",
        PUBLIC_API_PASSWORDLESS_CODE_SECRET: "configured-secret",
        PUBLIC_API_AUTH_CODE_DELIVERY_PROVIDER: "email_sms",
        PUBLIC_API_AUTH_CODE_EMAIL_DELIVERY_ENDPOINT_URL:
          "https://delivery.internal/auth/email",
        PUBLIC_API_AUTH_CODE_EMAIL_DELIVERY_BEARER_TOKEN: "email-token",
        PUBLIC_API_AUTH_CODE_EMAIL_FROM: "auth@elevenhouse.test",
        PUBLIC_API_AUTH_CODE_SMS_DELIVERY_ENDPOINT_URL: "https://delivery.internal/auth/sms",
        PUBLIC_API_AUTH_CODE_SMS_DELIVERY_BEARER_TOKEN: "sms-token",
        PUBLIC_API_AUTH_CODE_SMS_FROM: "ElevenHouse"
      })
    ).toMatchObject({
      authCodeDeliveryProvider: "email_sms"
    });
  });
});
