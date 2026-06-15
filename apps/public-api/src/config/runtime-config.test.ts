import { describe, expect, it } from "vitest";
import { publicSessionCookieName } from "@elevenhouse/auth";
import { createPublicApiRuntimeConfig } from "./runtime-config";

describe("createPublicApiRuntimeConfig", () => {
  it("uses the default public API port when env is not set", () => {
    expect(createPublicApiRuntimeConfig({})).toEqual({
      port: 3001,
      sessionTtlSeconds: 604800,
      sessionCookieSecure: false,
      sessionCookieName: "elevenhouse_public_session"
    });
  });

  it("parses PUBLIC_API_PORT from env", () => {
    expect(createPublicApiRuntimeConfig({ PUBLIC_API_PORT: "4011" })).toEqual({
      port: 4011,
      sessionTtlSeconds: 604800,
      sessionCookieSecure: false,
      sessionCookieName: "elevenhouse_public_session"
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
      sessionCookieName: publicSessionCookieName
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
      sessionCookieName: "custom_public_session"
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
});
