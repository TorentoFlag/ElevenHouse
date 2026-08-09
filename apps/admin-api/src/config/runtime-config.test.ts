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
      allowedOrigins: ["http://localhost:5175"],
      financeWebAuthn: null,
      financePayoutEvidence: null,
      financeRefundDispatch: null
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
      allowedOrigins: ["https://admin.elevenhouse.com", "https://ops.elevenhouse.com"],
      financeWebAuthn: null,
      financePayoutEvidence: null,
      financeRefundDispatch: null
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

  it("fails closed when payout evidence storage is enabled without a full KMS/cash-pool configuration", () => {
    expect(() =>
      createAdminApiRuntimeConfig({
        ADMIN_API_FINANCE_PAYOUT_EVIDENCE_ENABLED: "true"
      })
    ).toThrow("ADMIN_API_FINANCE_PAYOUT_EVIDENCE_ENABLED requires private artifact storage");
  });

  it("requires an exact matching WebAuthn RP configuration and HTTPS in production", () => {
    expect(
      createAdminApiRuntimeConfig({
        ADMIN_API_FINANCE_WEBAUTHN_RP_ID: "admin.elevenhouse.com",
        ADMIN_API_FINANCE_WEBAUTHN_ORIGIN: "https://admin.elevenhouse.com"
      }).financeWebAuthn
    ).toEqual({ rpId: "admin.elevenhouse.com", origin: "https://admin.elevenhouse.com" });
    expect(() =>
      createAdminApiRuntimeConfig({
        ADMIN_API_FINANCE_WEBAUTHN_RP_ID: "admin.elevenhouse.com",
        ADMIN_API_FINANCE_WEBAUTHN_ORIGIN: "https://other.elevenhouse.com"
      })
    ).toThrow("must match the WebAuthn origin host");
    expect(() =>
      createAdminApiRuntimeConfig({
        NODE_ENV: "production",
        ADMIN_API_ALLOWED_ORIGINS: "https://admin.elevenhouse.com",
        ADMIN_API_CSRF_SECRET: "admin-csrf-secret-value-at-least-32-bytes"
      })
    ).toThrow("ADMIN_API_FINANCE_WEBAUTHN_RP_ID and ADMIN_API_FINANCE_WEBAUTHN_ORIGIN are required");
  });
});
