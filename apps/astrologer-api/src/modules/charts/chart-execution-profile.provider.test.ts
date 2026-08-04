import { describe, expect, it } from "vitest";
import type { ConfigService } from "@nestjs/config";
import { ChartExecutionProfileProvider } from "./chart-execution-profile.provider";

describe("ChartExecutionProfileProvider", () => {
  it("resolves and retains one immutable profile from real configuration", () => {
    const provider = new ChartExecutionProfileProvider(
      createConfigService({
        NODE_ENV: "test",
        CHART_ENGINE_EXPECTED_EPHEMERIS: "moshier"
      })
    );

    expect(provider.getProfile()).toEqual({
      provider: "kerykeion",
      kerykeionVersion: "5.12.9",
      pyswissephVersion: "2.10.3.2",
      expectedEphemeris: "moshier",
      expectedEphemerisFlags: ["FLG_MOSEPH", "FLG_SPEED"],
      expectedEphemerisDataRevision: null
    });
    expect(provider.getProfile()).toBe(provider.getProfile());
  });

  it("fails closed when production omits the expected ephemeris contract", () => {
    expect(
      () => new ChartExecutionProfileProvider(createConfigService({ NODE_ENV: "production" }))
    ).toThrow("CHART_ENGINE_EXPECTED_EPHEMERIS is required in production");
  });

  it("rejects Moshier in production even with its exact explicit flags", () => {
    expect(
      () =>
        new ChartExecutionProfileProvider(
          createConfigService({
            NODE_ENV: "production",
            CHART_ENGINE_EXPECTED_EPHEMERIS: "moshier",
            CHART_ENGINE_EXPECTED_EPHEMERIS_FLAGS: "FLG_MOSEPH,FLG_SPEED"
          })
        )
    ).toThrow("CHART_ENGINE_EXPECTED_EPHEMERIS moshier is not allowed in production");
  });

  it.each([
    ["CHART_ENGINE_EXPECTED_EPHEMERIS_FLAGS", "FLG_SWIEPH"],
    ["CHART_ENGINE_EXPECTED_KERYKEION_VERSION", "5.13.0"],
    ["CHART_ENGINE_EXPECTED_PYSWISSEPH_VERSION", "2.10.4"]
  ])("rejects mismatched %s authority", (key, value) => {
    expect(
      () =>
        new ChartExecutionProfileProvider(
          createConfigService({
            NODE_ENV: "test",
            CHART_ENGINE_EXPECTED_EPHEMERIS: "swiss-ephemeris",
            CHART_ENGINE_EXPECTED_EPHEMERIS_FLAGS: "FLG_SWIEPH,FLG_SPEED",
            CHART_ENGINE_EXPECTED_EPHEMERIS_DATA_REVISION: `sha256:${"a".repeat(64)}`,
            [key]: value
          })
        )
    ).toThrow();
  });
});

function createConfigService(values: Record<string, string>): ConfigService {
  return {
    get: (key: string) => values[key]
  } as ConfigService;
}
