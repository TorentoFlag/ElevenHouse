import { describe, expect, it } from "vitest";
import { createPublicApiRuntimeConfig } from "./runtime-config";

describe("createPublicApiRuntimeConfig", () => {
  it("uses the default public API port when env is not set", () => {
    expect(createPublicApiRuntimeConfig({})).toEqual({
      port: 3001,
      sessionTtlSeconds: 604800,
      sessionCookieSecure: false
    });
  });

  it("parses PUBLIC_API_PORT from env", () => {
    expect(createPublicApiRuntimeConfig({ PUBLIC_API_PORT: "4011" })).toEqual({
      port: 4011,
      sessionTtlSeconds: 604800,
      sessionCookieSecure: false
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
      sessionCookieSecure: true
    });
  });
});
