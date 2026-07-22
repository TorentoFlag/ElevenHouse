import type {
  ChartInputSnapshot,
  ChartPlanetaryPositionsRequestInput,
  ChartPlanetaryPositionsResponse
} from "@elevenhouse/contracts";
import { describe, expect, it } from "vitest";
import { resolveHumanDesignResolvedInput } from "./human-design-resolved-input";

const birthSnapshot: ChartInputSnapshot = {
  birthDate: "2026-01-01",
  birthTime: "12:00",
  timezone: "UTC",
  latitude: 41.9,
  longitude: 12.49,
  birthTimePrecision: "exact"
};

describe("resolveHumanDesignResolvedInput", () => {
  it("builds personality and design Human Design longitudes through chart-engine positions", async () => {
    const calls: ChartPlanetaryPositionsRequestInput[] = [];
    const chartEngine = {
      calculatePlanetaryPositions: async (
        request: ChartPlanetaryPositionsRequestInput
      ): Promise<ChartPlanetaryPositionsResponse> => {
        calls.push(request);
        return positionsResponseFor(request.inputSnapshot, request.settings.nodeType);
      }
    };

    const resolved = await resolveHumanDesignResolvedInput({
      chartEngine,
      inputSnapshot: birthSnapshot
    });

    expect(resolved.resolvedLongitudes.personality.sun).toBe(100);
    expect(resolved.resolvedLongitudes.design.sun).toBeCloseTo(12, 1);
    expect(resolved.designMoment.targetSunLongitude).toBe(12);

    expect(calls[0]).toMatchObject({
      schemaVersion: "chart-positions-request.v1",
      method: "planetary_positions",
      settings: { zodiac: "tropical", nodeType: "true" },
      inputSnapshot: birthSnapshot
    });

    const designRequest = calls.at(-1);
    expect(designRequest?.settings).toEqual({ zodiac: "tropical", nodeType: "true" });
    expect(designRequest?.inputSnapshot).toMatchObject({
      birthDate: "2025-10-05",
      timezone: "UTC",
      latitude: birthSnapshot.latitude,
      longitude: birthSnapshot.longitude,
      birthTimePrecision: "exact"
    });
    expect(["11:59", "12:00"]).toContain(designRequest?.inputSnapshot.birthTime);
  });

  it("preserves the birth timezone when requesting the design moment positions", async () => {
    const moscowBirthSnapshot: ChartInputSnapshot = {
      ...birthSnapshot,
      birthTime: "15:00",
      timezone: "Europe/Moscow"
    };
    const calls: ChartPlanetaryPositionsRequestInput[] = [];
    const chartEngine = {
      calculatePlanetaryPositions: async (
        request: ChartPlanetaryPositionsRequestInput
      ): Promise<ChartPlanetaryPositionsResponse> => {
        calls.push(request);
        return positionsResponseFor(request.inputSnapshot, request.settings.nodeType, (snapshot) =>
          Date.parse(`${snapshot.birthDate}T${snapshot.birthTime}:00.000+03:00`)
        );
      }
    };

    const resolved = await resolveHumanDesignResolvedInput({
      chartEngine,
      inputSnapshot: moscowBirthSnapshot
    });

    expect(resolved.resolvedLongitudes.personality.sun).toBe(100);
    expect(resolved.resolvedLongitudes.design.sun).toBeCloseTo(12, 1);

    const designRequest = calls.at(-1);
    expect(designRequest?.inputSnapshot).toMatchObject({
      birthDate: "2025-10-05",
      timezone: "Europe/Moscow"
    });
    expect(["14:59", "15:00"]).toContain(designRequest?.inputSnapshot.birthTime);
  });
});

function positionsResponseFor(
  inputSnapshot: ChartInputSnapshot,
  nodeType: "true" | "mean",
  resolveInstantMs: (inputSnapshot: ChartInputSnapshot) => number = utcInstantMsFor
): ChartPlanetaryPositionsResponse {
  const sunLongitude = sunLongitudeFor(inputSnapshot, resolveInstantMs);
  return {
    schemaVersion: "chart-positions-result.v1",
    method: "planetary_positions",
    provider: { name: "kerykeion", version: "5.12.9", ephemeris: "swiss-ephemeris" },
    settings: { zodiac: "tropical", nodeType },
    inputSnapshot,
    positions: [
      { id: "sun", longitude: sunLongitude, retrograde: false },
      { id: "moon", longitude: 11, retrograde: false },
      { id: "north_node", longitude: 22, retrograde: true },
      { id: "mercury", longitude: 33, retrograde: false },
      { id: "venus", longitude: 44, retrograde: false },
      { id: "mars", longitude: 55, retrograde: false },
      { id: "jupiter", longitude: 66, retrograde: false },
      { id: "saturn", longitude: 77, retrograde: false },
      { id: "uranus", longitude: 88, retrograde: false },
      { id: "neptune", longitude: 99, retrograde: false },
      { id: "pluto", longitude: 111, retrograde: false }
    ]
  };
}

function sunLongitudeFor(
  inputSnapshot: ChartInputSnapshot,
  resolveInstantMs: (inputSnapshot: ChartInputSnapshot) => number
): number {
  const birthMs = Date.parse("2026-01-01T12:00:00.000Z");
  const instantMs = resolveInstantMs(inputSnapshot);
  const elapsedDays = (instantMs - birthMs) / (24 * 60 * 60 * 1000);
  return normalizeLongitude(100 + elapsedDays);
}

function utcInstantMsFor(inputSnapshot: ChartInputSnapshot): number {
  return Date.parse(`${inputSnapshot.birthDate}T${inputSnapshot.birthTime}:00.000Z`);
}

function normalizeLongitude(longitude: number): number {
  return ((longitude % 360) + 360) % 360;
}
