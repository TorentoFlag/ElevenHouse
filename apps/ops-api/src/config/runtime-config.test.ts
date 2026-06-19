import { describe, expect, it } from "vitest";
import { createOpsApiRuntimeConfig } from "./runtime-config";

const defaultSecurityConfig = {
  sessionTtlSeconds: 604800,
  sessionCookieSecure: false,
  sessionCookieName: "elevenhouse_ops_session",
  csrfSecret: "elevenhouse-dev-ops-api-csrf-secret-change-before-production",
  csrfCookieName: "elevenhouse_ops_csrf",
  csrfHeaderName: "x-csrf-token",
  csrfTokenTtlSeconds: 604800,
  allowedOrigins: ["http://localhost:5174", "http://localhost:5175"]
};

describe("createOpsApiRuntimeConfig", () => {
  it("uses the default ops API port when env is not set", () => {
    expect(createOpsApiRuntimeConfig({})).toEqual({
      port: 3002,
      redisUrl: "redis://localhost:6379",
      ...defaultSecurityConfig
    });
  });

  it("parses OPS_API_PORT from env", () => {
    expect(createOpsApiRuntimeConfig({ OPS_API_PORT: "4012" })).toEqual({
      port: 4012,
      redisUrl: "redis://localhost:6379",
      ...defaultSecurityConfig
    });
  });

  it("parses REDIS_URL from env", () => {
    expect(createOpsApiRuntimeConfig({ REDIS_URL: "redis://redis.internal:6379/4" })).toEqual({
      port: 3002,
      redisUrl: "redis://redis.internal:6379/4",
      ...defaultSecurityConfig
    });
  });

  it("parses ops session settings from env", () => {
    expect(
      createOpsApiRuntimeConfig({
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
        OPS_API_SESSION_COOKIE_NAME: "__Host-elevenhouse_ops_session",
        OPS_API_SESSION_COOKIE_SECURE: "false"
      })
    ).toThrow("__Host-prefixed ops session cookies require Secure=true");
  });

  it("requires an explicit CSRF secret in production", () => {
    expect(() =>
      createOpsApiRuntimeConfig({
        NODE_ENV: "production"
      })
    ).toThrow("OPS_API_CSRF_SECRET is required in production");
  });

  it("requires explicit allowed origins in production", () => {
    expect(() =>
      createOpsApiRuntimeConfig({
        NODE_ENV: "production",
        OPS_API_CSRF_SECRET: "configured-ops-csrf-secret-with-enough-entropy"
      })
    ).toThrow("OPS_API_ALLOWED_ORIGINS is required in production");
  });
});
