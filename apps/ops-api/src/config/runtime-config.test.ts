import { describe, expect, it } from "vitest";
import { createOpsApiRuntimeConfig } from "./runtime-config";

describe("createOpsApiRuntimeConfig", () => {
  it("uses the default ops API port when env is not set", () => {
    expect(createOpsApiRuntimeConfig({})).toEqual({
      port: 3002,
      redisUrl: "redis://localhost:6379"
    });
  });

  it("parses OPS_API_PORT from env", () => {
    expect(createOpsApiRuntimeConfig({ OPS_API_PORT: "4012" })).toEqual({
      port: 4012,
      redisUrl: "redis://localhost:6379"
    });
  });

  it("parses REDIS_URL from env", () => {
    expect(createOpsApiRuntimeConfig({ REDIS_URL: "redis://redis.internal:6379/4" })).toEqual({
      port: 3002,
      redisUrl: "redis://redis.internal:6379/4"
    });
  });
});
