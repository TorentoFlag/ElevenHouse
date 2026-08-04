import { describe, expect, it } from "vitest";
import type { ChartProviderMetadata } from "@elevenhouse/contracts";
import {
  buildChartCalculationRequestFingerprint,
  buildChartJobRequestFingerprint,
  buildChartRequestFingerprint,
  buildChartReproducibilityFingerprint,
  buildChartResultReproducibilityFingerprint,
  resolveChartExecutionProfile
} from "./chart-execution-profile";

describe("chart execution profile", () => {
  it("pins the verified local Moshier profile outside production", () => {
    expect(resolveChartExecutionProfile({ NODE_ENV: "test" })).toEqual({
      provider: "kerykeion",
      kerykeionVersion: "5.12.9",
      pyswissephVersion: "2.10.3.2",
      expectedEphemeris: "moshier",
      expectedEphemerisFlags: ["FLG_MOSEPH", "FLG_SPEED"],
      expectedEphemerisDataRevision: null
    });
  });

  it("canonicalizes equivalent configured provider flag order", () => {
    expect(
      resolveChartExecutionProfile({
        NODE_ENV: "test",
        CHART_ENGINE_EXPECTED_EPHEMERIS: "moshier",
        CHART_ENGINE_EXPECTED_EPHEMERIS_FLAGS: "FLG_SPEED,FLG_MOSEPH"
      }).expectedEphemerisFlags
    ).toEqual(["FLG_MOSEPH", "FLG_SPEED"]);
  });

  it("rejects a configured data revision for the Moshier backend", () => {
    expect(() =>
      resolveChartExecutionProfile({
        NODE_ENV: "test",
        CHART_ENGINE_EXPECTED_EPHEMERIS: "moshier",
        CHART_ENGINE_EXPECTED_EPHEMERIS_DATA_REVISION: `sha256:${"a".repeat(64)}`
      })
    ).toThrow("CHART_ENGINE_EXPECTED_EPHEMERIS_DATA_REVISION_FORBIDDEN");
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
    expect(request).toBe("sha256:58f4f2ec498030ab51828b5c73507376f5a779fc37886546434cc81d8d53d5de");
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
          ephemerisFlags: ["FLG_SWIEPH", "FLG_SPEED"],
          ephemerisDataRevision: `sha256:${"b".repeat(64)}`
        },
        settings: { houseSystem: "placidus", nodeType: "true" },
        inputSnapshot: { longitude: 12.4964, latitude: 41.9028 }
      })
    ).not.toBe(actual);
  });

  it("binds ordered participant identity only to the outer chart job fingerprint", () => {
    const profile = resolveChartExecutionProfile({ NODE_ENV: "test" });
    const providerInput = {
      inputSnapshot: { birthDate: "1990-07-15", latitude: 41.9028, longitude: 12.4964 },
      partnerInputSnapshot: { birthDate: "1992-08-11", latitude: 55.7558, longitude: 37.6173 }
    };
    const shared = {
      ownerUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      method: "synastry" as const,
      methodVersion: "chart.synastry.kerykeion-5.12.v2" as const,
      executionProfile: profile,
      settings: { houseSystem: "placidus", nodeType: "true" },
      inputSnapshot: providerInput
    };
    const primary = "11111111-1111-4111-8111-111111111111";
    const partner = "22222222-2222-4222-8222-222222222222";
    const fingerprints = (
      participants: readonly { readonly role: "subject" | "partner"; readonly clientId: string }[]
    ) => ({
      providerRequest: buildChartRequestFingerprint(shared),
      reproducibility: buildChartReproducibilityFingerprint({
        ...shared,
        provider: localProvider()
      }),
      outerJob: buildChartJobRequestFingerprint({ ...shared, participants })
    });

    const forward = fingerprints([
      { role: "subject", clientId: primary },
      { role: "partner", clientId: partner }
    ]);
    const reversed = fingerprints([
      { role: "subject", clientId: partner },
      { role: "partner", clientId: primary }
    ]);

    expect(JSON.stringify(providerInput)).not.toContain(primary);
    expect(JSON.stringify(providerInput)).not.toContain(partner);
    expect(reversed.providerRequest).toBe(forward.providerRequest);
    expect(reversed.reproducibility).toBe(forward.reproducibility);
    expect(forward.outerJob).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(reversed.outerJob).not.toBe(forward.outerJob);
  });

  it("changes the job fingerprint with method version or execution profile provenance", () => {
    const profile = resolveChartExecutionProfile({ NODE_ENV: "test" });
    const base = {
      ownerUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      method: "natal" as const,
      methodVersion: "chart.natal.kerykeion-5.12.v2" as const,
      executionProfile: profile,
      settings: { houseSystem: "placidus", nodeType: "true" },
      inputSnapshot: { latitude: 41.9028, longitude: 12.4964 },
      participants: [{ role: "subject" as const, clientId: "11111111-1111-4111-8111-111111111111" }]
    };
    const local = buildChartJobRequestFingerprint(base);
    const swiss = buildChartJobRequestFingerprint({
      ...base,
      executionProfile: {
        ...profile,
        expectedEphemeris: "swiss-ephemeris",
        expectedEphemerisFlags: ["FLG_SWIEPH", "FLG_SPEED"],
        expectedEphemerisDataRevision: `sha256:${"b".repeat(64)}`
      }
    });

    expect(swiss).not.toBe(local);
    expect(() =>
      buildChartJobRequestFingerprint({
        ...base,
        methodVersion: "chart.transit.kerykeion-5.12.v2" as never
      })
    ).toThrow("CHART_METHOD_VERSION_MISMATCH");
  });

  it("binds adult-versus-child product authority to business identity but not astronomy", () => {
    const base = {
      ownerUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      method: "natal" as const,
      methodVersion: "chart.natal.kerykeion-5.12.v2" as const,
      executionProfile: resolveChartExecutionProfile({ NODE_ENV: "test" }),
      settings: { houseSystem: "placidus", nodeType: "true" },
      inputSnapshot: { latitude: 41.9028, longitude: 12.4964 },
      participants: [{ role: "subject" as const, clientId: "11111111-1111-4111-8111-111111111111" }]
    };
    const adult = { ...base, interpretationMode: "adult_natal" as const };
    const child = { ...base, interpretationMode: "child" as const };

    expect(buildChartCalculationRequestFingerprint(adult)).not.toBe(
      buildChartCalculationRequestFingerprint(child)
    );
    expect(buildChartJobRequestFingerprint(adult)).not.toBe(buildChartJobRequestFingerprint(child));
    expect(buildChartRequestFingerprint(adult)).toBe(buildChartRequestFingerprint(child));
    expect(buildChartReproducibilityFingerprint({ ...adult, provider: localProvider() })).toBe(
      buildChartReproducibilityFingerprint({ ...child, provider: localProvider() })
    );
  });

  it("binds owner and initial-versus-replacement identity to the job fingerprint", () => {
    const base = {
      ownerUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      method: "natal" as const,
      methodVersion: "chart.natal.kerykeion-5.12.v2" as const,
      executionProfile: resolveChartExecutionProfile({ NODE_ENV: "test" }),
      settings: { houseSystem: "placidus", nodeType: "true" },
      inputSnapshot: { latitude: 41.9028, longitude: 12.4964 },
      participants: [{ role: "subject" as const, clientId: "11111111-1111-4111-8111-111111111111" }]
    };
    const initial = buildChartJobRequestFingerprint(base);
    const otherOwner = buildChartJobRequestFingerprint({
      ...base,
      ownerUserId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
    });
    const replacement = buildChartJobRequestFingerprint({
      ...base,
      targetCalculationId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      expectedSourceChecksum: `sha256:${"d".repeat(64)}`
    });
    const otherSourceVersion = buildChartJobRequestFingerprint({
      ...base,
      targetCalculationId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      expectedSourceChecksum: `sha256:${"e".repeat(64)}`
    });

    expect(new Set([initial, otherOwner, replacement, otherSourceVersion])).toHaveLength(4);
  });

  it("keeps calculation identity stable while replacement command identity changes", () => {
    const base = {
      ownerUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      method: "natal" as const,
      methodVersion: "chart.natal.kerykeion-5.12.v2" as const,
      executionProfile: resolveChartExecutionProfile({ NODE_ENV: "test" }),
      settings: { houseSystem: "placidus", nodeType: "true" },
      inputSnapshot: { latitude: 41.9028, longitude: 12.4964 },
      participants: [{ role: "subject" as const, clientId: "11111111-1111-4111-8111-111111111111" }]
    };
    const initialCalculation = buildChartCalculationRequestFingerprint(base);
    const replacementInput = {
      ...base,
      targetCalculationId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      expectedSourceChecksum: `sha256:${"d".repeat(64)}`
    };
    const replacementCalculation = buildChartCalculationRequestFingerprint(replacementInput);
    const initialCommand = buildChartJobRequestFingerprint(base);
    const replacementCommand = buildChartJobRequestFingerprint(replacementInput);

    expect(replacementCalculation).toBe(initialCalculation);
    expect(replacementCommand).not.toBe(initialCommand);
    expect(replacementCommand).not.toBe(replacementCalculation);
  });

  it("matches Python chart number and small-coordinate fingerprint vectors", () => {
    const provider = localProvider();
    expect(
      buildChartReproducibilityFingerprint({
        method: "natal",
        methodVersion: "chart.natal.kerykeion-5.12.v2",
        provider,
        settings: {},
        inputSnapshot: { numbers: [-0, 1e-7, 1e-6, 1e21, 1e20] }
      })
    ).toBe("sha256:a274ff1d5f690022015e910f8c512b42512cb61b84d4b02134adf54c17bdff75");
    expect(
      buildChartReproducibilityFingerprint({
        method: "natal",
        methodVersion: "chart.natal.kerykeion-5.12.v2",
        provider,
        settings: completeSettings(),
        inputSnapshot: {
          birthDate: "1990-07-15",
          birthTime: "10:30",
          timezone: "Europe/Berlin",
          latitude: 1e-7,
          longitude: -0,
          birthTimePrecision: "exact"
        }
      })
    ).toBe("sha256:44260d51d6bcb81e43ac75274bec27ca8244003252e1ee2065e1c728045db8c1");
  });

  it("extracts the exact method-specific Python fingerprint input from every v2 result", () => {
    const base = {
      schemaVersion: "chart-result.v2",
      provider: localProvider(),
      settings: completeSettings(),
      reproducibilityFingerprint: `sha256:${"a".repeat(64)}`
    } as const;
    const inputSnapshot = { birthDate: "1990-07-15", marker: "primary" };
    const partnerInputSnapshot = { birthDate: "1992-08-11", marker: "partner" };
    const transitSnapshot = { date: "2026-07-23", marker: "transit" };
    const solarReturnSnapshot = { year: 2026, resolvedAt: "2026-07-15T01:20:01Z" };
    const questionSnapshot = { question: "Now?", date: "2026-07-23" };
    const calculationBasis = {
      symbolicInstant: "1990-08-20T09:02:38Z",
      elapsedLifeDays: 13157,
      elapsedYears: 36.02267306523378,
      yearLengthDays: 365.24219,
      dayForYearRatio: 1
    };
    const cases = [
      {
        source: {
          ...base,
          method: "natal",
          methodVersion: "chart.natal.kerykeion-5.12.v2",
          inputSnapshot
        },
        fingerprintInput: inputSnapshot
      },
      {
        source: {
          ...base,
          method: "astrocartography",
          methodVersion: "chart.astrocartography.swisseph.v2",
          inputSnapshot
        },
        fingerprintInput: inputSnapshot
      },
      {
        source: {
          ...base,
          method: "progression",
          methodVersion: "chart.progression.secondary-tropical-year.v2",
          inputSnapshot,
          calculationBasis
        },
        fingerprintInput: inputSnapshot,
        calculationBasis
      },
      {
        source: {
          ...base,
          method: "transit",
          methodVersion: "chart.transit.kerykeion-5.12.v2",
          inputSnapshot,
          transitSnapshot
        },
        fingerprintInput: { inputSnapshot, transitSnapshot }
      },
      {
        source: {
          ...base,
          method: "synastry",
          methodVersion: "chart.synastry.kerykeion-5.12.v2",
          inputSnapshot,
          partnerInputSnapshot
        },
        fingerprintInput: { inputSnapshot, partnerInputSnapshot }
      },
      {
        source: {
          ...base,
          method: "composite",
          methodVersion: "chart.composite.kerykeion-5.12.v2",
          inputSnapshot,
          partnerInputSnapshot
        },
        fingerprintInput: { inputSnapshot, partnerInputSnapshot }
      },
      {
        source: {
          ...base,
          method: "solar_return",
          methodVersion: "chart.solar-return.kerykeion-5.12.v2",
          inputSnapshot,
          solarReturnSnapshot
        },
        fingerprintInput: { inputSnapshot, solarReturnSnapshot }
      },
      {
        source: {
          ...base,
          method: "horary",
          methodVersion: "chart.horary.kerykeion-5.12.v2",
          questionSnapshot
        },
        fingerprintInput: questionSnapshot
      }
    ] as const;

    for (const fixture of cases) {
      expect(buildChartResultReproducibilityFingerprint(fixture.source as never)).toBe(
        buildChartReproducibilityFingerprint({
          method: fixture.source.method,
          methodVersion: fixture.source.methodVersion,
          provider: fixture.source.provider,
          settings: fixture.source.settings,
          inputSnapshot: fixture.fingerprintInput,
          calculationBasis: "calculationBasis" in fixture ? fixture.calculationBasis : undefined
        })
      );
    }
  });
});

function localProvider(): ChartProviderMetadata {
  return {
    name: "kerykeion" as const,
    version: "5.12.9",
    ephemeris: "moshier" as const,
    pyswissephVersion: "2.10.3.2",
    ephemerisFlags: ["FLG_MOSEPH", "FLG_SPEED"],
    ephemerisDataRevision: null
  };
}

function completeSettings() {
  return {
    zodiac: "tropical" as const,
    houseSystem: "placidus" as const,
    nodeType: "true" as const,
    aspectPreset: "major" as const,
    orbMultiplier: 1
  };
}
