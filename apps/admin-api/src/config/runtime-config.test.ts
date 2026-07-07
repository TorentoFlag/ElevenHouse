import { describe, expect, it } from "vitest";
import { createAdminApiRuntimeConfig } from "./runtime-config";

describe("createAdminApiRuntimeConfig", () => {
  it("uses local defaults for the minimal admin API scaffold", () => {
    expect(createAdminApiRuntimeConfig({})).toEqual({
      port: 3003,
      trustProxy: false,
      allowedOrigins: ["http://localhost:5175"]
    });
  });

  it("parses the port, trust proxy and allowed origins from env", () => {
    expect(
      createAdminApiRuntimeConfig({
        ADMIN_API_PORT: "4013",
        ADMIN_API_TRUST_PROXY: "true",
        ADMIN_API_ALLOWED_ORIGINS: "https://admin.elevenhouse.com, https://ops.elevenhouse.com/"
      })
    ).toEqual({
      port: 4013,
      trustProxy: true,
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
});
