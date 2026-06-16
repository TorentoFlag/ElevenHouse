import { describe, expect, it } from "vitest";
import { publicSessionCookieName } from "@elevenhouse/auth";
import { createPublicApiRuntimeConfig } from "./runtime-config";

describe("createPublicApiRuntimeConfig", () => {
  it("uses the default public API port when env is not set", () => {
    expect(createPublicApiRuntimeConfig({})).toEqual({
      port: 3001,
      sessionTtlSeconds: 604800,
      sessionCookieSecure: false,
      sessionCookieName: "elevenhouse_public_session",
      passwordlessCodeSecret: "elevenhouse-dev-passwordless-code-secret",
      passwordlessCodeTtlSeconds: 600,
      passwordlessResendCooldownSeconds: 60,
      passwordlessMaxAttempts: 5,
      authCodeDeliveryProvider: "dev"
    });
  });

  it("parses PUBLIC_API_PORT from env", () => {
    expect(createPublicApiRuntimeConfig({ PUBLIC_API_PORT: "4011" })).toEqual({
      port: 4011,
      sessionTtlSeconds: 604800,
      sessionCookieSecure: false,
      sessionCookieName: "elevenhouse_public_session",
      passwordlessCodeSecret: "elevenhouse-dev-passwordless-code-secret",
      passwordlessCodeTtlSeconds: 600,
      passwordlessResendCooldownSeconds: 60,
      passwordlessMaxAttempts: 5,
      authCodeDeliveryProvider: "dev"
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
      sessionTtlSeconds: 3600,
      sessionCookieSecure: true,
      sessionCookieName: publicSessionCookieName,
      passwordlessCodeSecret: "elevenhouse-dev-passwordless-code-secret",
      passwordlessCodeTtlSeconds: 600,
      passwordlessResendCooldownSeconds: 60,
      passwordlessMaxAttempts: 5,
      authCodeDeliveryProvider: "dev"
    });
  });

  it("parses an explicit public session cookie name from env", () => {
    expect(
      createPublicApiRuntimeConfig({
        PUBLIC_API_SESSION_COOKIE_NAME: "custom_public_session"
      })
    ).toEqual({
      port: 3001,
      sessionTtlSeconds: 604800,
      sessionCookieSecure: false,
      sessionCookieName: "custom_public_session",
      passwordlessCodeSecret: "elevenhouse-dev-passwordless-code-secret",
      passwordlessCodeTtlSeconds: 600,
      passwordlessResendCooldownSeconds: 60,
      passwordlessMaxAttempts: 5,
      authCodeDeliveryProvider: "dev"
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
        PUBLIC_API_PASSWORDLESS_CODE_SECRET: "configured-secret",
        PUBLIC_API_PASSWORDLESS_CODE_TTL_SECONDS: "900",
        PUBLIC_API_PASSWORDLESS_RESEND_COOLDOWN_SECONDS: "120",
        PUBLIC_API_PASSWORDLESS_MAX_ATTEMPTS: "3",
        PUBLIC_API_AUTH_CODE_DELIVERY_PROVIDER: "dev"
      })
    ).toMatchObject({
      passwordlessCodeSecret: "configured-secret",
      passwordlessCodeTtlSeconds: 900,
      passwordlessResendCooldownSeconds: 120,
      passwordlessMaxAttempts: 3,
      authCodeDeliveryProvider: "dev"
    });
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
});
