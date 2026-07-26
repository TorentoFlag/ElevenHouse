import { describe, expect, it, vi } from "vitest";
import type { AstroCalendarGenerationRequestInput } from "@elevenhouse/contracts";
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

const astroCalendarRequest: AstroCalendarGenerationRequestInput = {
  start: "2026-07-01",
  end: "2026-07-31",
  timeZone: "Europe/Moscow",
  scope: "client",
  clientIds: ["22222222-2222-4222-8222-222222222222"],
  eventTypes: ["client.birthday"],
  clients: [
    {
      clientId: "22222222-2222-4222-8222-222222222222",
      displayName: "Мария Иванова",
      initials: "МИ",
      birthDate: "1990-07-15",
      birthTime: "14:30",
      birthTimePrecision: "exact",
      birthTimezone: "Europe/Moscow",
      birthLatitude: 55.7558,
      birthLongitude: 37.6173
    }
  ],
  settings: { zodiac: "tropical", ...request.settings }
};

const astroCalendarResult = {
  schemaVersion: "astro-calendar-range.v1",
  timeZone: "Europe/Moscow",
  range: { start: "2026-07-01", end: "2026-07-31" },
  generation: {
    status: "ready",
    generationId: "77777777-7777-4777-8777-777777777777",
    fingerprint: "sha256:".padEnd(71, "a"),
    generatedAt: "2026-07-25T12:00:00.000Z",
    provider: result.provider
  },
  events: [],
  readiness: {
    clientsTotal: 0,
    clientsReady: 0,
    clientsWithMissingBirthData: 0,
    clientsWithUnknownBirthTime: 0,
    clientsWithApproximateBirthTime: 0
  },
  summary: {
    eventCount: 0,
    globalEventCount: 0,
    clientEventCount: 0,
    byType: {},
    byTone: {}
  },
  dictionaryCodes: [],
  warnings: []
} as const;

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

  it("posts astro calendar range input to the private chart engine", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => astroCalendarResult
    });
    const client = new ChartEngineHttpClient({
      baseUrl: "http://chart-engine:8012/",
      fetchFn: fetchMock
    });

    await expect(client.calculateAstroCalendarRange(astroCalendarRequest)).resolves.toMatchObject({
      schemaVersion: "astro-calendar-range.v1",
      generation: { status: "ready" }
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://chart-engine:8012/v1/astro-calendar/range",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(astroCalendarRequest)
      })
    );
  });

  it("treats invalid astro calendar provider JSON as permanent", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ schemaVersion: "wrong" })
    });
    const client = new ChartEngineHttpClient({
      baseUrl: "http://chart-engine:8012",
      fetchFn: fetchMock
    });

    await expect(client.calculateAstroCalendarRange(astroCalendarRequest)).rejects.toBeInstanceOf(
      ChartEnginePermanentError
    );
  });

  it("posts transit input to the private chart engine", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => transitResult
    });
    const client = new ChartEngineHttpClient({
      baseUrl: "http://chart-engine:8012/",
      fetchFn: fetchMock
    });

    await expect(client.calculateTransit(transitRequest)).resolves.toMatchObject({
      schemaVersion: "chart-result.v1",
      method: "transit",
      result: { aspectsToNatal: [expect.objectContaining({ transitPoint: "jupiter" })] }
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://chart-engine:8012/v1/transits",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("treats invalid transit provider JSON as permanent", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ schemaVersion: "wrong" })
    });
    const client = new ChartEngineHttpClient({
      baseUrl: "http://chart-engine:8012",
      fetchFn: fetchMock
    });

    await expect(client.calculateTransit(transitRequest)).rejects.toBeInstanceOf(
      ChartEnginePermanentError
    );
  });

  it("posts synastry input to the private chart engine", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => synastryResult
    });
    const client = new ChartEngineHttpClient({
      baseUrl: "http://chart-engine:8012/",
      fetchFn: fetchMock
    });

    await expect(client.calculateSynastry(synastryRequest)).resolves.toMatchObject({
      schemaVersion: "chart-result.v1",
      method: "synastry",
      result: { aspectsBetween: [expect.objectContaining({ primaryPoint: "sun" })] }
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://chart-engine:8012/v1/synastry",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("treats invalid synastry provider JSON as permanent", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ schemaVersion: "wrong" })
    });
    const client = new ChartEngineHttpClient({
      baseUrl: "http://chart-engine:8012",
      fetchFn: fetchMock
    });

    await expect(client.calculateSynastry(synastryRequest)).rejects.toBeInstanceOf(
      ChartEnginePermanentError
    );
  });

  it("posts composite input to the private chart engine", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => compositeResult
    });
    const client = new ChartEngineHttpClient({
      baseUrl: "http://chart-engine:8012/",
      fetchFn: fetchMock
    });

    await expect(client.calculateComposite(compositeRequest)).resolves.toMatchObject({
      schemaVersion: "chart-result.v1",
      method: "composite",
      result: { points: expect.arrayContaining([expect.objectContaining({ id: "sun" })]) }
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://chart-engine:8012/v1/composite",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("treats invalid composite provider JSON as permanent", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ schemaVersion: "wrong" })
    });
    const client = new ChartEngineHttpClient({
      baseUrl: "http://chart-engine:8012",
      fetchFn: fetchMock
    });

    await expect(client.calculateComposite(compositeRequest)).rejects.toBeInstanceOf(
      ChartEnginePermanentError
    );
  });

  it("posts solar return input to the private chart engine", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => solarReturnResult
    });
    const client = new ChartEngineHttpClient({
      baseUrl: "http://chart-engine:8012/",
      fetchFn: fetchMock
    });

    await expect(client.calculateSolarReturn(solarReturnRequest)).resolves.toMatchObject({
      schemaVersion: "chart-result.v1",
      method: "solar_return",
      result: { aspectsToNatal: [expect.objectContaining({ solarReturnPoint: "sun" })] }
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://chart-engine:8012/v1/solar-return",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("treats invalid solar return provider JSON as permanent", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ schemaVersion: "wrong" })
    });
    const client = new ChartEngineHttpClient({
      baseUrl: "http://chart-engine:8012",
      fetchFn: fetchMock
    });

    await expect(client.calculateSolarReturn(solarReturnRequest)).rejects.toBeInstanceOf(
      ChartEnginePermanentError
    );
  });

  it("posts progression input to the private chart engine", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => progressionResult
    });
    const client = new ChartEngineHttpClient({
      baseUrl: "http://chart-engine:8012/",
      fetchFn: fetchMock
    });

    await expect(client.calculateProgression(progressionRequest)).resolves.toMatchObject({
      schemaVersion: "chart-result.v1",
      method: "progression",
      result: { aspectsToNatal: [expect.objectContaining({ progressedPoint: "moon" })] }
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://chart-engine:8012/v1/progressions",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("treats invalid progression provider JSON as permanent", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ schemaVersion: "wrong" })
    });
    const client = new ChartEngineHttpClient({
      baseUrl: "http://chart-engine:8012",
      fetchFn: fetchMock
    });

    await expect(client.calculateProgression(progressionRequest)).rejects.toBeInstanceOf(
      ChartEnginePermanentError
    );
  });

  it("posts horary input to the private chart engine", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => horaryResult
    });
    const client = new ChartEngineHttpClient({
      baseUrl: "http://chart-engine:8012/",
      fetchFn: fetchMock
    });

    await expect(client.calculateHorary(horaryRequest)).resolves.toMatchObject({
      schemaVersion: "chart-result.v1",
      method: "horary",
      questionSnapshot: expect.objectContaining({ category: "career" }),
      result: { points: expect.arrayContaining([expect.objectContaining({ id: "sun" })]) }
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://chart-engine:8012/v1/horary",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("treats invalid horary provider JSON as permanent", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ schemaVersion: "wrong" })
    });
    const client = new ChartEngineHttpClient({
      baseUrl: "http://chart-engine:8012",
      fetchFn: fetchMock
    });

    await expect(client.calculateHorary(horaryRequest)).rejects.toBeInstanceOf(
      ChartEnginePermanentError
    );
  });

  it("posts astrocartography input to the private chart engine", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => astrocartographyResult
    });
    const client = new ChartEngineHttpClient({
      baseUrl: "http://chart-engine:8012/",
      fetchFn: fetchMock
    });

    await expect(client.calculateAstrocartography(astrocartographyRequest)).resolves.toMatchObject({
      schemaVersion: "chart-result.v1",
      method: "astrocartography",
      result: { lines: expect.arrayContaining([expect.objectContaining({ id: "sun_mc" })]) }
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://chart-engine:8012/v1/astrocartography",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("treats invalid astrocartography provider JSON as permanent", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ schemaVersion: "wrong" })
    });
    const client = new ChartEngineHttpClient({
      baseUrl: "http://chart-engine:8012",
      fetchFn: fetchMock
    });

    await expect(client.calculateAstrocartography(astrocartographyRequest)).rejects.toBeInstanceOf(
      ChartEnginePermanentError
    );
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

const transitRequest = {
  schemaVersion: "chart-request.v1",
  method: "transit",
  settings: request.settings,
  inputSnapshot: request.inputSnapshot,
  transitSnapshot: {
    date: "2026-07-22",
    time: "14:30",
    timezone: "Europe/Rome",
    latitude: 41.9,
    longitude: 12.49
  }
} as const;

const transitResult = {
  schemaVersion: "chart-result.v1",
  method: "transit",
  provider: result.provider,
  settings: { zodiac: "tropical", ...request.settings },
  inputSnapshot: request.inputSnapshot,
  transitSnapshot: transitRequest.transitSnapshot,
  result: {
    natal: result.result,
    transit: result.result,
    aspectsToNatal: [
      {
        transitPoint: "jupiter",
        natalPoint: "sun",
        type: "trine",
        angle: 120,
        orb: 1.25,
        applying: true,
        strength: 0.79
      }
    ],
    warnings: []
  }
} as const;

const synastryRequest = {
  schemaVersion: "chart-request.v1",
  method: "synastry",
  settings: request.settings,
  inputSnapshot: request.inputSnapshot,
  partnerInputSnapshot: {
    birthDate: "1992-08-11",
    birthTime: "22:15",
    timezone: "Europe/Moscow",
    latitude: 55.7558,
    longitude: 37.6173,
    birthTimePrecision: "exact"
  },
  relationshipSnapshot: {
    primaryClientId: "00000000-0000-4000-8000-000000000001",
    partnerClientId: "00000000-0000-4000-8000-000000000002"
  }
} as const;

const synastryResult = {
  schemaVersion: "chart-result.v1",
  method: "synastry",
  provider: result.provider,
  settings: { zodiac: "tropical", ...request.settings },
  inputSnapshot: request.inputSnapshot,
  partnerInputSnapshot: synastryRequest.partnerInputSnapshot,
  relationshipSnapshot: synastryRequest.relationshipSnapshot,
  result: {
    primary: result.result,
    partner: result.result,
    aspectsBetween: [
      {
        primaryPoint: "sun",
        partnerPoint: "moon",
        type: "trine",
        angle: 120,
        orb: 1.25,
        applying: null,
        strength: 0.79
      }
    ],
    houseOverlays: [
      {
        owner: "primary",
        point: "venus",
        projectedHouseOwner: "partner",
        projectedHouse: 7
      }
    ],
    warnings: []
  }
} as const;

const compositeRequest = {
  ...synastryRequest,
  method: "composite"
} as const;

const compositeResult = {
  schemaVersion: "chart-result.v1",
  method: "composite",
  provider: result.provider,
  settings: { zodiac: "tropical", ...request.settings },
  inputSnapshot: request.inputSnapshot,
  partnerInputSnapshot: synastryRequest.partnerInputSnapshot,
  relationshipSnapshot: synastryRequest.relationshipSnapshot,
  result: result.result
} as const;

const solarReturnRequest = {
  schemaVersion: "chart-request.v1",
  method: "solar_return",
  settings: request.settings,
  inputSnapshot: request.inputSnapshot,
  solarReturnSnapshot: {
    year: 2026,
    returnType: "solar",
    location: {
      timezone: "Europe/Rome",
      latitude: 41.9,
      longitude: 12.49
    }
  }
} as const;

const solarReturnResult = {
  schemaVersion: "chart-result.v1",
  method: "solar_return",
  provider: result.provider,
  settings: { zodiac: "tropical", ...request.settings },
  inputSnapshot: request.inputSnapshot,
  solarReturnSnapshot: {
    ...solarReturnRequest.solarReturnSnapshot,
    resolvedAt: "2026-07-15T01:20:01.000Z"
  },
  result: {
    natal: result.result,
    solarReturn: result.result,
    aspectsToNatal: [
      {
        solarReturnPoint: "sun",
        natalPoint: "sun",
        type: "conjunction",
        angle: 0,
        orb: 0.01,
        applying: true,
        strength: 0.99
      }
    ],
    warnings: []
  }
} as const;

const progressionRequest = {
  schemaVersion: "chart-request.v1",
  method: "progression",
  settings: request.settings,
  inputSnapshot: request.inputSnapshot,
  progressionSnapshot: {
    targetDate: "2026-07-23",
    progressionType: "secondary"
  }
} as const;

const progressionResult = {
  schemaVersion: "chart-result.v1",
  method: "progression",
  provider: result.provider,
  settings: { zodiac: "tropical", ...request.settings },
  inputSnapshot: request.inputSnapshot,
  progressionSnapshot: {
    ...progressionRequest.progressionSnapshot,
    calculationBasis: {
      symbolicDate: "1990-08-20",
      ageDays: 36,
      dayForYearRatio: 1
    }
  },
  result: {
    natal: result.result,
    progressed: result.result,
    aspectsToNatal: [
      {
        progressedPoint: "moon",
        natalPoint: "sun",
        type: "trine",
        angle: 120,
        orb: 1.25,
        applying: true,
        strength: 0.79
      }
    ],
    warnings: []
  }
} as const;

const horaryRequest = {
  schemaVersion: "chart-request.v1",
  method: "horary",
  settings: request.settings,
  questionSnapshot: {
    question: "Стоит ли принимать предложение?",
    category: "career",
    date: "2026-07-23",
    time: "14:30",
    timezone: "Europe/Moscow",
    latitude: 55.7558,
    longitude: 37.6173
  }
} as const;

const horaryResult = {
  schemaVersion: "chart-result.v1",
  method: "horary",
  provider: result.provider,
  settings: { zodiac: "tropical", ...request.settings },
  questionSnapshot: horaryRequest.questionSnapshot,
  result: result.result
} as const;

const astrocartographyRequest = {
  schemaVersion: "chart-request.v1",
  method: "astrocartography",
  settings: request.settings,
  inputSnapshot: request.inputSnapshot
} as const;

const astrocartographyResult = {
  schemaVersion: "chart-result.v1",
  method: "astrocartography",
  provider: result.provider,
  settings: { zodiac: "tropical", ...request.settings },
  inputSnapshot: request.inputSnapshot,
  result: {
    lines: completeAstrocartographyLines(),
    warnings: []
  }
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

function completeAstrocartographyLines() {
  const points = [
    "sun",
    "moon",
    "mercury",
    "venus",
    "mars",
    "jupiter",
    "saturn",
    "uranus",
    "neptune",
    "pluto"
  ];
  const angles = ["mc", "ic", "asc", "dsc"];
  return points.flatMap((point, pointIndex) =>
    angles.map((angle, angleIndex) => ({
      id: `${point}_${angle}`,
      point,
      angle,
      label: `${point} ${angle}`,
      path: [
        { latitude: -66, longitude: -90 + pointIndex * 8 + angleIndex },
        { latitude: 0, longitude: -90 + pointIndex * 8 + angleIndex },
        { latitude: 66, longitude: -90 + pointIndex * 8 + angleIndex }
      ]
    }))
  );
}
