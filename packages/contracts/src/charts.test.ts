import { describe, expect, it } from "vitest";
import {
  chartPlanetaryPositionsRequestSchema,
  chartPlanetaryPositionsResponseSchema,
  chartJobResponseSchema,
  chartNatalJobCreateRequestSchema,
  chartSolarReturnJobCreateRequestSchema,
  chartSynastryJobCreateRequestSchema,
  chartTransitJobCreateRequestSchema,
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

  it("accepts a transit job request by client id, settings and transit moment", () => {
    expect(
      chartTransitJobCreateRequestSchema.parse({
        clientId: "00000000-0000-4000-8000-000000000001",
        settings: {
          houseSystem: "placidus",
          nodeType: "true",
          aspectPreset: "major",
          orbMultiplier: 1
        },
        transit: {
          date: "2026-07-22",
          time: "14:30"
        }
      })
    ).toMatchObject({
      clientId: "00000000-0000-4000-8000-000000000001",
      transit: { date: "2026-07-22", time: "14:30" }
    });
  });

  it("rejects browser-supplied birth data in transit job requests", () => {
    expect(() =>
      chartTransitJobCreateRequestSchema.parse({
        clientId: "00000000-0000-4000-8000-000000000001",
        birthDate: "1990-07-15",
        settings: {
          houseSystem: "placidus",
          nodeType: "true",
          aspectPreset: "major",
          orbMultiplier: 1
        },
        transit: {
          date: "2026-07-22",
          time: "14:30"
        }
      })
    ).toThrow();
  });

  it("accepts a synastry job request by two CRM client ids and settings", () => {
    expect(
      chartSynastryJobCreateRequestSchema.parse({
        clientId: "00000000-0000-4000-8000-000000000001",
        partnerClientId: "00000000-0000-4000-8000-000000000002",
        settings: {
          houseSystem: "placidus",
          nodeType: "true",
          aspectPreset: "major",
          orbMultiplier: 1
        }
      })
    ).toMatchObject({
      clientId: "00000000-0000-4000-8000-000000000001",
      partnerClientId: "00000000-0000-4000-8000-000000000002"
    });
  });

  it("rejects browser-supplied birth data in synastry job requests", () => {
    expect(() =>
      chartSynastryJobCreateRequestSchema.parse({
        clientId: "00000000-0000-4000-8000-000000000001",
        partnerClientId: "00000000-0000-4000-8000-000000000002",
        partnerBirthDate: "1992-08-11",
        settings: {
          houseSystem: "placidus",
          nodeType: "true",
          aspectPreset: "major",
          orbMultiplier: 1
        }
      })
    ).toThrow();
  });

  it("accepts a solar return job request by client id, target year and settings", () => {
    expect(
      chartSolarReturnJobCreateRequestSchema.parse({
        clientId: "00000000-0000-4000-8000-000000000001",
        year: 2026,
        settings: {
          houseSystem: "placidus",
          nodeType: "true",
          aspectPreset: "major",
          orbMultiplier: 1
        }
      })
    ).toMatchObject({
      clientId: "00000000-0000-4000-8000-000000000001",
      year: 2026
    });
  });

  it("rejects impossible solar return target years", () => {
    expect(() =>
      chartSolarReturnJobCreateRequestSchema.parse({
        clientId: "00000000-0000-4000-8000-000000000001",
        year: 2201,
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
      result: completeRenderResult()
    });

    expect(payload.result).not.toHaveProperty("birthDate");
  });

  it("requires complete render data for the natal chart screen", () => {
    expect(() =>
      storedChartCalculationPayloadSchema.parse({
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
      })
    ).toThrow();
  });

  it("accepts complete render data for a transit dual-wheel screen", () => {
    const payload = storedChartCalculationPayloadSchema.parse({
      schemaVersion: "chart-result.v1",
      method: "transit",
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
      transitSnapshot: {
        date: "2026-07-22",
        time: "14:30",
        timezone: "Europe/Rome",
        latitude: 41.9028,
        longitude: 12.4964
      },
      result: {
        natal: completeRenderResult(),
        transit: completeRenderResult(),
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
    });

    expect(payload.method).toBe("transit");
    if (payload.method !== "transit") {
      throw new Error("Expected transit chart payload");
    }
    expect(payload.result.aspectsToNatal[0]).toMatchObject({
      transitPoint: "jupiter",
      natalPoint: "sun"
    });
  });

  it("rejects transit results without transit points", () => {
    expect(() =>
      storedChartCalculationPayloadSchema.parse({
        schemaVersion: "chart-result.v1",
        method: "transit",
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
        transitSnapshot: {
          date: "2026-07-22",
          time: "14:30",
          timezone: "Europe/Rome",
          latitude: 41.9028,
          longitude: 12.4964
        },
        result: {
          natal: completeRenderResult(),
          transit: { ...completeRenderResult(), points: [] },
          aspectsToNatal: [],
          warnings: []
        }
      })
    ).toThrow();
  });

  it("accepts complete render data for a synastry dual-wheel screen", () => {
    const payload = storedChartCalculationPayloadSchema.parse({
      schemaVersion: "chart-result.v1",
      method: "synastry",
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
      partnerInputSnapshot: {
        birthDate: "1992-08-11",
        birthTime: "22:15",
        timezone: "Europe/Moscow",
        latitude: 55.7558,
        longitude: 37.6173,
        birthTimePrecision: "approximate"
      },
      relationshipSnapshot: {
        primaryClientId: "00000000-0000-4000-8000-000000000001",
        partnerClientId: "00000000-0000-4000-8000-000000000002"
      },
      result: {
        primary: completeRenderResult(),
        partner: completeRenderResult(),
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
        relationshipScore: {
          value: 18,
          label: "very_important",
          breakdown: [
            {
              code: "venus_mars_trine",
              points: 4
            }
          ]
        },
        warnings: [
          {
            code: "PARTNER_BIRTH_TIME_APPROXIMATE",
            message: "Partner chart calculated with approximate birth time."
          }
        ]
      }
    });

    expect(payload.method).toBe("synastry");
    if (payload.method !== "synastry") {
      throw new Error("Expected synastry chart payload");
    }
    expect(payload.result.aspectsBetween[0]).toMatchObject({
      primaryPoint: "sun",
      partnerPoint: "moon"
    });
    expect(payload.result.houseOverlays[0]).toMatchObject({
      owner: "primary",
      projectedHouseOwner: "partner",
      projectedHouse: 7
    });
  });

  it("rejects synastry results without partner render points", () => {
    expect(() =>
      storedChartCalculationPayloadSchema.parse({
        schemaVersion: "chart-result.v1",
        method: "synastry",
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
        },
        result: {
          primary: completeRenderResult(),
          partner: { ...completeRenderResult(), points: [] },
          aspectsBetween: [],
          houseOverlays: [],
          warnings: []
        }
      })
    ).toThrow();
  });

  it("accepts complete render data for a solar return dual-wheel screen", () => {
    const payload = storedChartCalculationPayloadSchema.parse({
      schemaVersion: "chart-result.v1",
      method: "solar_return",
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
      solarReturnSnapshot: {
        year: 2026,
        returnType: "solar",
        location: {
          timezone: "Europe/Rome",
          latitude: 41.9028,
          longitude: 12.4964
        },
        resolvedAt: "2026-07-15T08:42:11Z"
      },
      result: {
        natal: completeRenderResult(),
        solarReturn: completeRenderResult(),
        aspectsToNatal: [
          {
            solarReturnPoint: "sun",
            natalPoint: "sun",
            type: "conjunction",
            angle: 0,
            orb: 0.01,
            applying: null,
            strength: 1
          }
        ],
        warnings: []
      }
    });

    expect(payload.method).toBe("solar_return");
    if (payload.method !== "solar_return") {
      throw new Error("Expected solar return chart payload");
    }
    expect(payload.solarReturnSnapshot).toMatchObject({
      year: 2026,
      returnType: "solar",
      location: { timezone: "Europe/Rome" }
    });
    expect(payload.result.aspectsToNatal[0]).toMatchObject({
      solarReturnPoint: "sun",
      natalPoint: "sun"
    });
  });

  it("accepts an arbitrary-moment planetary positions request for Human Design", () => {
    expect(
      chartPlanetaryPositionsRequestSchema.parse({
        schemaVersion: "chart-positions-request.v1",
        method: "planetary_positions",
        inputSnapshot: {
          birthDate: "1990-07-15",
          birthTime: "10:30",
          timezone: "Europe/Rome",
          latitude: 41.9028,
          longitude: 12.4964,
          birthTimePrecision: "exact"
        },
        settings: { zodiac: "tropical", nodeType: "true" }
      })
    ).toMatchObject({
      method: "planetary_positions",
      settings: { zodiac: "tropical", nodeType: "true" }
    });
  });

  it("requires the Human Design base bodies in planetary positions responses", () => {
    const response = chartPlanetaryPositionsResponseSchema.parse({
      schemaVersion: "chart-positions-result.v1",
      method: "planetary_positions",
      provider: { name: "kerykeion", version: "5.12.9", ephemeris: "swiss-ephemeris" },
      settings: { zodiac: "tropical", nodeType: "true" },
      inputSnapshot: {
        birthDate: "1990-07-15",
        birthTime: "10:30",
        timezone: "Europe/Rome",
        latitude: 41.9028,
        longitude: 12.4964,
        birthTimePrecision: "exact"
      },
      positions: completePlanetaryPositions()
    });

    expect(response.positions).toHaveLength(11);
    expect(response.positions.find((position) => position.id === "sun")?.longitude).toBe(10);
  });

  it("rejects positions responses without a north node", () => {
    expect(() =>
      chartPlanetaryPositionsResponseSchema.parse({
        schemaVersion: "chart-positions-result.v1",
        method: "planetary_positions",
        provider: { name: "kerykeion", version: "5.12.9", ephemeris: "swiss-ephemeris" },
        settings: { zodiac: "tropical", nodeType: "true" },
        inputSnapshot: {
          birthDate: "1990-07-15",
          birthTime: "10:30",
          timezone: "Europe/Rome",
          latitude: 41.9028,
          longitude: 12.4964,
          birthTimePrecision: "exact"
        },
        positions: completePlanetaryPositions().filter((position) => position.id !== "north_node")
      })
    ).toThrow();
  });
});

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
    longitude: 10 + index,
    retrograde: false
  }));
}

function completeRenderResult() {
  return {
    points: [
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
    })),
    houses: Array.from({ length: 12 }, (_, index) => ({
      number: index + 1,
      longitude: index * 30,
      sign: "aries",
      signDegree: 0
    })),
    aspects: [],
    distributions: {
      elements: { fire: 3, earth: 2, air: 3, water: 2 },
      modalities: { cardinal: 4, fixed: 3, mutable: 3 },
      polarity: { masculine: 6, feminine: 4 }
    },
    warnings: []
  };
}
