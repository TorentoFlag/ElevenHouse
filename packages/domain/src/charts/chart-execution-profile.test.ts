import { describe, expect, it } from "vitest";
import {
  buildChartRequestFingerprint,
  buildChartReproducibilityFingerprint,
  resolveChartExecutionProfile
} from "./chart-execution-profile";

describe("chart execution profile", () => {
  it("pins the verified local Moshier profile outside production", () => {
    expect(resolveChartExecutionProfile({ NODE_ENV: "test" })).toEqual({
      provider: "kerykeion",
      kerykeionVersion: "5.12.9",
      pyswissephVersion: "2.10.3.2",
      expectedEphemeris: "moshier",
      expectedEphemerisFlags: ["FLG_MOSEPH"],
      expectedEphemerisDataRevision: null
    });
  });

  it("requires an explicit supported backend and data revision in production", () => {
    expect(() => resolveChartExecutionProfile({ NODE_ENV: "production" })).toThrow(
      "CHART_ENGINE_EXPECTED_EPHEMERIS is required in production"
    );
    expect(() =>
      resolveChartExecutionProfile({
        NODE_ENV: "production",
        CHART_ENGINE_EXPECTED_EPHEMERIS: "unknown"
      })
    ).toThrow();
    expect(() =>
      resolveChartExecutionProfile({
        NODE_ENV: "production",
        CHART_ENGINE_EXPECTED_EPHEMERIS: "swiss-ephemeris",
        CHART_ENGINE_EXPECTED_EPHEMERIS_DATA_REVISION: "unknown"
      })
    ).toThrow();
  });

  it("uses different canonical profiles for dedup and actual execution reproducibility", () => {
    const profile = resolveChartExecutionProfile({ NODE_ENV: "test" });
    const request = buildChartRequestFingerprint({
      method: "natal",
      methodVersion: "chart.natal.kerykeion-5.12.v2",
      executionProfile: profile,
      settings: { houseSystem: "placidus", nodeType: "true" },
      inputSnapshot: { longitude: 12.4964, latitude: 41.9028 }
    });
    const reorderedRequest = buildChartRequestFingerprint({
      method: "natal",
      methodVersion: "chart.natal.kerykeion-5.12.v2",
      executionProfile: profile,
      settings: { nodeType: "true", houseSystem: "placidus" },
      inputSnapshot: { latitude: 41.9028, longitude: 12.4964 }
    });
    const actual = buildChartReproducibilityFingerprint({
      method: "natal",
      methodVersion: "chart.natal.kerykeion-5.12.v2",
      provider: {
        name: "kerykeion",
        version: "5.12.9",
        ephemeris: "moshier",
        pyswissephVersion: "2.10.3.2",
        ephemerisFlags: ["FLG_SPEED", "FLG_MOSEPH"],
        ephemerisDataRevision: null
      },
      settings: { nodeType: "true", houseSystem: "placidus" },
      inputSnapshot: { latitude: 41.9028, longitude: 12.4964 }
    });

    expect(request).toBe(reorderedRequest);
    expect(request).toBe("sha256:1a69bdc6d52f127baa71c23ccd62baf714c274c8ff3a94b03312127a00f9faf3");
    expect(actual).toBe("sha256:517bcce0d8df713313d262aa6823bd1e34095cc139165e5311e3e479a4260f4c");
    expect(actual).not.toBe(request);
    expect(
      buildChartReproducibilityFingerprint({
        method: "natal",
        methodVersion: "chart.natal.kerykeion-5.12.v2",
        provider: {
          name: "kerykeion",
          version: "5.12.9",
          ephemeris: "swiss-ephemeris",
          pyswissephVersion: "2.10.3.2",
          ephemerisFlags: ["FLG_MOSEPH", "FLG_SPEED"],
          ephemerisDataRevision: "se2_2026.1"
        },
        settings: { houseSystem: "placidus", nodeType: "true" },
        inputSnapshot: { longitude: 12.4964, latitude: 41.9028 }
      })
    ).not.toBe(actual);
  });
});
