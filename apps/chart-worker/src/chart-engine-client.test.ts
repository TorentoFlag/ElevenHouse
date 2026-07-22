import { describe, expect, it, vi } from "vitest";
import { ChartEngineHttpClient, ChartEnginePermanentError } from "./chart-engine-client";

const request = {
  schemaVersion: "chart-request.v1",
  method: "natal",
  settings: {
    houseSystem: "placidus",
    nodeType: "true",
    aspectPreset: "major",
    orbMultiplier: 1
  },
  inputSnapshot: {
    birthDate: "1990-07-15",
    birthTime: "10:30",
    timezone: "Europe/Rome",
    latitude: 41.9,
    longitude: 12.49,
    birthTimePrecision: "exact"
  }
} as const;

const result = {
  schemaVersion: "chart-result.v1",
  method: "natal",
  provider: { name: "kerykeion", version: "5.12.9", ephemeris: "swiss-ephemeris" },
  settings: { zodiac: "tropical", ...request.settings },
  inputSnapshot: request.inputSnapshot,
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
};

describe("ChartEngineHttpClient", () => {
  it("posts natal input to the private chart engine", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => result
    });
    const client = new ChartEngineHttpClient({
      baseUrl: "http://chart-engine:8012/",
      fetchFn: fetchMock
    });

    await expect(client.calculateNatal(request)).resolves.toMatchObject({
      schemaVersion: "chart-result.v1"
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://chart-engine:8012/v1/natal",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("treats invalid provider JSON as permanent", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ schemaVersion: "wrong" })
    });
    const client = new ChartEngineHttpClient({
      baseUrl: "http://chart-engine:8012",
      fetchFn: fetchMock
    });

    await expect(client.calculateNatal(request)).rejects.toBeInstanceOf(ChartEnginePermanentError);
  });

  it("posts planetary positions input to the private chart engine", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => positionsResult
    });
    const client = new ChartEngineHttpClient({
      baseUrl: "http://chart-engine:8012/",
      fetchFn: fetchMock
    });

    await expect(client.calculatePlanetaryPositions(positionsRequest)).resolves.toMatchObject({
      schemaVersion: "chart-positions-result.v1",
      positions: expect.arrayContaining([expect.objectContaining({ id: "sun" })])
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://chart-engine:8012/v1/positions",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("treats invalid planetary positions JSON as permanent", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ schemaVersion: "wrong" })
    });
    const client = new ChartEngineHttpClient({
      baseUrl: "http://chart-engine:8012",
      fetchFn: fetchMock
    });

    await expect(client.calculatePlanetaryPositions(positionsRequest)).rejects.toBeInstanceOf(
      ChartEnginePermanentError
    );
  });
});

const positionsRequest = {
  schemaVersion: "chart-positions-request.v1",
  method: "planetary_positions",
  settings: { zodiac: "tropical", nodeType: "true" },
  inputSnapshot: request.inputSnapshot
} as const;

const positionsResult = {
  schemaVersion: "chart-positions-result.v1",
  method: "planetary_positions",
  provider: result.provider,
  settings: positionsRequest.settings,
  inputSnapshot: request.inputSnapshot,
  positions: completePlanetaryPositions()
} as const;

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

function completePlanetaryPositions() {
  return [
    "sun",
    "moon",
    "north_node",
    "mercury",
    "venus",
    "mars",
    "jupiter",
    "saturn",
    "uranus",
    "neptune",
    "pluto"
  ].map((id, index) => ({
    id,
    longitude: index * 20,
    retrograde: false
  }));
}
