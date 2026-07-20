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
    points: [],
    houses: [],
    aspects: [],
    distributions: { elements: {}, modalities: {}, polarity: {} },
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
});
