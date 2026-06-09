import { describe, expect, it } from "vitest";
import { createPublicApiRuntimeConfig } from "./runtime-config";

describe("createPublicApiRuntimeConfig", () => {
  it("uses the default public API port when env is not set", () => {
    expect(createPublicApiRuntimeConfig({})).toEqual({ port: 3001 });
  });

  it("parses PUBLIC_API_PORT from env", () => {
    expect(createPublicApiRuntimeConfig({ PUBLIC_API_PORT: "4011" })).toEqual({ port: 4011 });
  });
});
