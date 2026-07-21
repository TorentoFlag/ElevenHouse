import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChartNatalJobCreateResponse } from "@elevenhouse/contracts";
import { application } from "../../../Application";
import { createNatalChartJob, getChartCalculation, getChartJob } from "./chartsApi";

const clientId = "22222222-2222-4222-8222-222222222222";
const jobId = "33333333-3333-4333-8333-333333333333";
const calculationId = "44444444-4444-4444-8444-444444444444";
const createResponse = {
  status: "calculating",
  jobId
} satisfies ChartNatalJobCreateResponse;

describe("chartsApi", () => {
  afterEach(() => vi.restoreAllMocks());

  it("creates natal jobs with client id and settings only, preserving CSRF protection", async () => {
    const post = vi.spyOn(application.http, "post").mockResolvedValue(createResponse);

    await expect(
      createNatalChartJob({
        clientId,
        birthDate: "1990-07-15",
        settings: {
          zodiac: "tropical",
          houseSystem: "placidus",
          nodeType: "true",
          aspectPreset: "major",
          orbMultiplier: 1
        }
      })
    ).resolves.toEqual(createResponse);

    expect(post).toHaveBeenCalledWith(
      "/charts/natal/jobs",
      {
        clientId,
        settings: {
          zodiac: "tropical",
          houseSystem: "placidus",
          nodeType: "true",
          aspectPreset: "major",
          orbMultiplier: 1
        }
      },
      { csrf: true }
    );
    expect(JSON.stringify(post.mock.calls[0]?.[1])).not.toContain("birthDate");
  });

  it("loads chart job and calculation through shared response contracts", async () => {
    vi.spyOn(application.http, "get")
      .mockResolvedValueOnce({ id: jobId, status: "calculating" })
      .mockResolvedValueOnce(chartPayload());

    await expect(getChartJob(jobId)).resolves.toMatchObject({ id: jobId, status: "calculating" });
    await expect(getChartCalculation(calculationId)).resolves.toMatchObject({
      schemaVersion: "chart-result.v1"
    });
  });
});

function chartPayload() {
  return {
    calculationId,
    result: {
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
        points: completePoints(),
        houses: completeHouses(),
        aspects: [],
        distributions: {
          elements: { fire: 3, earth: 2, air: 3, water: 2 },
          modalities: { cardinal: 4, fixed: 3, mutable: 3 },
          polarity: { masculine: 6, feminine: 4 }
        },
        warnings: []
      }
    }
  };
}

function completePoints() {
  return [
    "sun",
    "moon",
    "mercury",
    "venus",
    "mars",
    "jupiter",
    "saturn",
    "uranus",
    "neptune",
    "pluto",
    "ascendant",
    "midheaven",
    "north_node",
    "south_node"
  ].map((id, index) => ({
    id,
    label: id,
    longitude: index * 20,
    sign: "aries",
    signDegree: index % 29,
    house: index < 12 ? index + 1 : null,
    retrograde: false
  }));
}

function completeHouses() {
  return Array.from({ length: 12 }, (_, index) => ({
    number: index + 1,
    longitude: index * 30,
    sign: "aries",
    signDegree: 0
  }));
}
