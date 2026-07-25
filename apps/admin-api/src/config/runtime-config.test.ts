import { describe, expect, it } from "vitest";
import { createAdminApiRuntimeConfig } from "./runtime-config";

describe("createAdminApiRuntimeConfig", () => {
  it("uses local defaults for the minimal admin API scaffold", () => {
    expect(createAdminApiRuntimeConfig({})).toEqual({
      port: 3003,
      trustProxy: false,
      sessionCookieSecure: false,
      sessionCookieName: "elevenhouse_admin_session",
      csrfSecret: "development-admin-csrf-secret-32-bytes-minimum",
      csrfCookieName: "elevenhouse_admin_csrf",
      csrfHeaderName: "x-csrf-token",
      csrfTokenTtlSeconds: 604800,
      allowedOrigins: ["http://localhost:5175"]
    });
  });

  it("parses the port, security cookies and allowed origins from env", () => {
    expect(
      createAdminApiRuntimeConfig({
        ADMIN_API_PORT: "4013",
        ADMIN_API_TRUST_PROXY: "true",
        ADMIN_API_SESSION_COOKIE_SECURE: "true",
        ADMIN_API_SESSION_COOKIE_NAME: "admin_session",
        ADMIN_API_CSRF_SECRET: "admin-csrf-secret-value-at-least-32-bytes",
        ADMIN_API_CSRF_COOKIE_NAME: "admin_csrf",
        ADMIN_API_CSRF_HEADER_NAME: "x-admin-csrf",
        ADMIN_API_CSRF_TOKEN_TTL_SECONDS: "900",
        ADMIN_API_ALLOWED_ORIGINS: "https://admin.elevenhouse.com, https://ops.elevenhouse.com/"
      })
    ).toEqual({
      port: 4013,
      trustProxy: true,
      sessionCookieSecure: true,
      sessionCookieName: "admin_session",
      csrfSecret: "admin-csrf-secret-value-at-least-32-bytes",
      csrfCookieName: "admin_csrf",
      csrfHeaderName: "x-admin-csrf",
      csrfTokenTtlSeconds: 900,
      allowedOrigins: ["https://admin.elevenhouse.com", "https://ops.elevenhouse.com"]
    });
  });

  it("requires explicit allowed origins in production", () => {
    expect(() =>
      createAdminApiRuntimeConfig({
        NODE_ENV: "production"
      })
    ).toThrow("ADMIN_API_ALLOWED_ORIGINS is required in production");
  });

  it("requires explicit CSRF secret in production", () => {
    expect(() =>
      createAdminApiRuntimeConfig({
        NODE_ENV: "production",
        ADMIN_API_ALLOWED_ORIGINS: "https://admin.elevenhouse.com"
      })
    ).toThrow("ADMIN_API_CSRF_SECRET is required in production");
  });
});
