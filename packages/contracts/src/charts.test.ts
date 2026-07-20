import { describe, expect, it } from "vitest";
import {
  chartJobResponseSchema,
  chartNatalJobCreateRequestSchema,
  storedChartCalculationPayloadSchema
} from "./charts";

describe("chart contracts", () => {
  it("accepts natal job request by client id and settings only", () => {
    expect(
      chartNatalJobCreateRequestSchema.parse({
        clientId: "00000000-0000-4000-8000-000000000001",
        settings: {
          houseSystem: "placidus",
          nodeType: "true",
          aspectPreset: "major",
          orbMultiplier: 1
        }
      })
    ).toMatchObject({ settings: { houseSystem: "placidus" } });
  });

  it("rejects browser-supplied birth data in create request", () => {
    expect(() =>
      chartNatalJobCreateRequestSchema.parse({
        clientId: "00000000-0000-4000-8000-000000000001",
        birthDate: "1990-07-15",
        settings: {
          houseSystem: "placidus",
          nodeType: "true",
          aspectPreset: "major",
          orbMultiplier: 1
        }
      })
    ).toThrow();
  });

  it("uses one public calculating state for queued and processing", () => {
    expect(
      chartJobResponseSchema.parse({
        id: "00000000-0000-4000-8000-000000000002",
        status: "calculating"
      }).status
    ).toBe("calculating");
  });

  it("separates private input snapshot from render result", () => {
    const payload = storedChartCalculationPayloadSchema.parse({
      schemaVersion: "chart-result.v1",
      method: "natal",
      provider: { name: "kerykeion", version: "5.12.9", ephemeris: "swiss-ephemeris" },
      settings: {
        zodiac: "tropical",
        houseSystem: "placidus",
        nodeType: "true",
        aspectPreset: "major",
        orbMultiplier: 1
      },
      inputSnapshot: {
        birthDate: "1990-07-15",
        birthTime: "10:30",
        timezone: "Europe/Rome",
        latitude: 41.9028,
        longitude: 12.4964,
        birthTimePrecision: "exact"
      },
      result: {
        points: [],
        houses: [],
        aspects: [],
        distributions: { elements: {}, modalities: {}, polarity: {} },
        warnings: []
      }
    });

    expect(payload.result).not.toHaveProperty("birthDate");
  });
});
