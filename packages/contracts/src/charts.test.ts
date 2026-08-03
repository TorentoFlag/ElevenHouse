import { describe, expect, it } from "vitest";
import readinessFixture from "../test-fixtures/chart-engine-readiness.v2.json";
import {
  chartAstrocartographyJobCreateRequestSchema,
  chartCompositeJobCreateRequestSchema,
  createChartAiDraftRequestSchema,
  chartHoraryJobCreateRequestSchema,
  chartAstrocartographyCalculationRequestSchema,
  chartPlanetaryPositionsRequestSchema,
  chartPlanetaryPositionsResponseSchema,
  chartJobResponseSchema,
  chartNatalJobCreateRequestSchema,
  chartNatalCalculationRequestSchema,
  chartSolarReturnCalculationRequestSchema,
  chartProgressionCalculationBasisSchema,
  chartProgressionResultV2Schema,
  chartProgressionJobCreateRequestSchema,
  chartSolarReturnJobCreateRequestSchema,
  chartSynastryJobCreateRequestSchema,
  chartTransitJobCreateRequestSchema,
  chartResultSchema,
  chartMethodVersions,
  chartEngineReadinessResponseSchema,
  chartExecutionProfileSchema,
  chartProviderMetadataV2Schema,
  isReproducibleChartResult,
  storedChartCalculationPayloadSchema
} from "./charts";

describe("chart contracts", () => {
  it("parses the shared strict chart-engine readiness fixture", () => {
    expect(chartEngineReadinessResponseSchema.parse(readinessFixture)).toEqual(readinessFixture);
  });

  it("requires the exact backend-specific provider flag set regardless of order", () => {
    expect(
      chartExecutionProfileSchema.parse({
        ...localExecutionProfile(),
        expectedEphemerisFlags: ["FLG_SPEED", "FLG_MOSEPH"]
      }).expectedEphemerisFlags
    ).toEqual(["FLG_SPEED", "FLG_MOSEPH"]);
    expect(
      chartProviderMetadataV2Schema.parse({
        ...completeV2NatalPayload().provider,
        ephemeris: "swiss-ephemeris",
        ephemerisFlags: ["FLG_SPEED", "FLG_SWIEPH"],
        ephemerisDataRevision: `sha256:${"b".repeat(64)}`
      }).ephemerisFlags
    ).toEqual(["FLG_SPEED", "FLG_SWIEPH"]);
  });

  it("rejects non-canonical Moshier flag sets", () => {
    for (const expectedEphemerisFlags of [
      [],
      ["FLG_MOSEPH"],
      ["FLG_MOSEPH", "FLG_SPEED", "FLG_J2000"],
      ["FLG_MOSEPH", "FLG_SPEED", "FLG_SPEED"],
      ["moshier", "speed"],
      ["FLG_SWIEPH", "FLG_SPEED"]
    ]) {
      expect(() =>
        chartExecutionProfileSchema.parse({
          ...localExecutionProfile(),
          expectedEphemerisFlags
        })
      ).toThrow();
    }
  });

  it("requires an exact lowercase SHA-256 Swiss data revision", () => {
    for (const ephemerisDataRevision of [
      null,
      "se2_2026.1",
      `sha256:${"A".repeat(64)}`,
      `sha256:${"a".repeat(63)}`
    ]) {
      expect(() =>
        chartProviderMetadataV2Schema.parse({
          ...completeV2NatalPayload().provider,
          ephemeris: "swiss-ephemeris",
          ephemerisFlags: ["FLG_SWIEPH", "FLG_SPEED"],
          ephemerisDataRevision
        })
      ).toThrow();
    }
  });

  it("rejects incomplete, duplicate and foreign readiness capabilities", () => {
    const capabilities = [...readinessFixture.capabilities];
    for (const invalidCapabilities of [
      capabilities.slice(0, -1),
      [...capabilities.slice(0, -1), capabilities[0]],
      [...capabilities, "future_method"]
    ]) {
      expect(() =>
        chartEngineReadinessResponseSchema.parse({
          ...readinessFixture,
          capabilities: invalidCapabilities
        })
      ).toThrow();
    }
  });

  it("keeps historical v1 astrocartography line relationships frozen", () => {
    const payload = completeV1AstrocartographyPayload();
    payload.result.lines[0] = { ...payload.result.lines[0]!, id: "legacy-sun-meridian" };

    expect(storedChartCalculationPayloadSchema.parse(payload)).toEqual(payload);
  });

  it("keeps historical v1 synastry same-owner overlays frozen", () => {
    const payload = completeV1SynastryPayload();
    payload.result.houseOverlays[0] = {
      ...payload.result.houseOverlays[0]!,
      projectedHouseOwner: "primary"
    };

    expect(storedChartCalculationPayloadSchema.parse(payload)).toEqual(payload);
  });

  it("keeps historical v1 civil and render payloads frozen while v2 remains strict", () => {
    const historical = {
      schemaVersion: "chart-result.v1" as const,
      method: "natal" as const,
      provider: { name: "kerykeion" as const, version: "5.12.9", ephemeris: "swiss-ephemeris" },
      settings: completeSettings(),
      inputSnapshot: {
        ...completeInputSnapshot(),
        birthDate: "2026-02-31",
        birthTime: "24:00",
        timezone: "Not/AZone"
      },
      result: {
        ...completeRenderResult(),
        points: [...completeRenderResult().points, completeRenderResult().points[0]!],
        aspects: [{ pointA: "sun", pointB: "sun", type: "conjunction", angle: 0, orb: 0 }],
        distributions: {
          elements: { fire: 10, earth: 0, air: 0, water: 1 },
          modalities: { cardinal: 10, fixed: 0, mutable: 1 },
          polarity: { masculine: 10, feminine: 1 }
        }
      }
    };

    expect(storedChartCalculationPayloadSchema.parse(historical)).toEqual(historical);
    expect(() =>
      chartResultSchema.parse({ ...completeV2NatalPayload(), result: historical.result })
    ).toThrow();
  });

  it("rejects Placidus v2 calculation requests outside the Kerykeion latitude range", () => {
    expect(
      chartNatalCalculationRequestSchema.parse({
        ...completeV2NatalRequest(),
        inputSnapshot: { ...completeInputSnapshot(), latitude: 66 }
      }).inputSnapshot.latitude
    ).toBe(66);
    expect(
      chartNatalCalculationRequestSchema.parse({
        ...completeV2NatalRequest(),
        inputSnapshot: { ...completeInputSnapshot(), latitude: -66 }
      }).inputSnapshot.latitude
    ).toBe(-66);
    for (const latitude of [66.000001, -66.000001]) {
      expect(() =>
        chartNatalCalculationRequestSchema.parse({
          ...completeV2NatalRequest(),
          inputSnapshot: { ...completeInputSnapshot(), latitude }
        })
      ).toThrow("CHART_KERYKEION_PLACIDUS_LATITUDE_UNSUPPORTED");
    }
  });

  it("requires an IANA solar return location timezone in v2 requests", () => {
    expect(() =>
      chartSolarReturnCalculationRequestSchema.parse({
        schemaVersion: "chart-request.v2",
        method: "solar_return",
        methodVersion: chartMethodVersions.solar_return,
        executionProfile: localExecutionProfile(),
        settings: completeSettings(),
        inputSnapshot: completeInputSnapshot(),
        solarReturnSnapshot: {
          year: 2026,
          returnType: "solar",
          location: { timezone: "Not/AZone", latitude: 41.9028, longitude: 12.4964 }
        }
      })
    ).toThrow();
  });

  it("accepts the exact continuous tropical-year progression basis", () => {
    const payload = chartProgressionResultV2Schema.parse(completeV2ProgressionPayload());

    expect(payload.calculationBasis).toEqual({
      symbolicInstant: "1990-08-20T09:02:38Z",
      elapsedLifeDays: 13157,
      elapsedYears: 36.02267306523378,
      yearLengthDays: 365.24219,
      dayForYearRatio: 1
    });
  });

  it("rejects internally inconsistent progression basis values", () => {
    expect(() =>
      chartProgressionCalculationBasisSchema.parse({
        symbolicInstant: "1990-08-20T09:02:38Z",
        elapsedLifeDays: 13157,
        elapsedYears: 36,
        yearLengthDays: 365.24219,
        dayForYearRatio: 1
      })
    ).toThrow("CHART_PROGRESSION_BASIS_INCONSISTENT");
  });

  it.each([
    [
      "fractional elapsed life day",
      (payload: ReturnType<typeof completeV2ProgressionPayload>) => {
        payload.calculationBasis.elapsedLifeDays = 13157.5;
        payload.calculationBasis.elapsedYears = 13157.5 / 365.24219;
      }
    ],
    [
      "target-date day count",
      (payload: ReturnType<typeof completeV2ProgressionPayload>) => {
        payload.progressionSnapshot.targetDate = "2026-07-24";
      }
    ],
    [
      "legacy symbolic date",
      (payload: ReturnType<typeof completeV2ProgressionPayload>) => {
        payload.progressionSnapshot.calculationBasis.symbolicDate = "1990-08-21";
      }
    ],
    [
      "legacy symbolic age",
      (payload: ReturnType<typeof completeV2ProgressionPayload>) => {
        payload.progressionSnapshot.calculationBasis.ageDays = 35;
      }
    ],
    [
      "provider instant drift",
      (payload: ReturnType<typeof completeV2ProgressionPayload>) => {
        payload.calculationBasis.symbolicInstant = "1990-08-20T09:02:37Z";
      }
    ]
  ])("rejects progression result %s inconsistency", (_label, mutate) => {
    const payload = completeV2ProgressionPayload();
    mutate(payload);

    expect(() => chartProgressionResultV2Schema.parse(payload)).toThrow(
      "CHART_PROGRESSION_BASIS_INCONSISTENT"
    );
  });

  it("rejects lexically valid but impossible civil chart inputs", () => {
    expect(() =>
      chartNatalCalculationRequestSchema.parse({
        schemaVersion: "chart-request.v2",
        method: "natal",
        methodVersion: chartMethodVersions.natal,
        executionProfile: localExecutionProfile(),
        settings: completeSettings(),
        inputSnapshot: {
          ...completeInputSnapshot(),
          birthDate: "2026-02-31"
        }
      })
    ).toThrow();
    expect(() =>
      chartNatalCalculationRequestSchema.parse({
        schemaVersion: "chart-request.v2",
        method: "natal",
        methodVersion: chartMethodVersions.natal,
        executionProfile: localExecutionProfile(),
        settings: completeSettings(),
        inputSnapshot: {
          ...completeInputSnapshot(),
          birthTime: "24:00"
        }
      })
    ).toThrow();
    expect(() =>
      chartNatalCalculationRequestSchema.parse({
        schemaVersion: "chart-request.v2",
        method: "natal",
        methodVersion: chartMethodVersions.natal,
        executionProfile: localExecutionProfile(),
        settings: completeSettings(),
        inputSnapshot: {
          ...completeInputSnapshot(),
          timezone: "Not/AZone"
        }
      })
    ).toThrow();
  });

  it("rejects unknown fields and relationally invalid render results", () => {
    const valid = completeRenderResult();
    expect(() =>
      chartResultSchema.parse({
        ...completeV2NatalPayload(),
        unexpected: true
      })
    ).toThrow();
    expect(() =>
      chartResultSchema.parse({
        ...completeV2NatalPayload(),
        result: {
          ...valid,
          points: [...valid.points, valid.points[0]]
        }
      })
    ).toThrow();
    expect(() =>
      chartResultSchema.parse({
        ...completeV2NatalPayload(),
        result: {
          ...valid,
          houses: [...valid.houses.slice(0, -1), valid.houses[0]]
        }
      })
    ).toThrow();
    expect(() =>
      chartResultSchema.parse({
        ...completeV2NatalPayload(),
        result: {
          ...valid,
          aspects: [{ pointA: "sun", pointB: "sun", type: "conjunction", angle: 0, orb: 0 }]
        }
      })
    ).toThrow();
    expect(() =>
      chartResultSchema.parse({
        ...completeV2NatalPayload(),
        result: {
          ...valid,
          aspects: [
            { pointA: "sun", pointB: "moon", type: "square", angle: 90, orb: 1 },
            { pointA: "moon", pointB: "sun", type: "square", angle: 90, orb: 1 }
          ]
        }
      })
    ).toThrow();
    expect(() =>
      chartResultSchema.parse({
        ...completeV2NatalPayload(),
        result: {
          ...valid,
          aspects: [{ pointA: "sun", pointB: "not-a-point", type: "square", angle: 90, orb: 1 }]
        }
      })
    ).toThrow();
    expect(() =>
      chartResultSchema.parse({
        ...completeV2NatalPayload(),
        result: {
          ...valid,
          distributions: {
            ...valid.distributions,
            elements: { fire: 3, earth: 2, air: 3, water: 3 }
          }
        }
      })
    ).toThrow();
  });

  it("keeps v1 read compatibility without synthesizing reproducibility provenance", () => {
    const historical = {
      schemaVersion: "chart-result.v1",
      method: "natal",
      provider: { name: "kerykeion", version: "5.12.9", ephemeris: "swiss-ephemeris" },
      settings: completeSettings(),
      inputSnapshot: completeInputSnapshot(),
      result: completeRenderResult()
    };

    const parsed = chartResultSchema.parse(historical);
    expect(parsed).toEqual(historical);
    expect(parsed).not.toHaveProperty("methodVersion");
    expect(isReproducibleChartResult(parsed)).toBe(false);
    expect(isReproducibleChartResult(chartResultSchema.parse(completeV2NatalPayload()))).toBe(true);
  });

  it("requires matching method versions, complete execution profile and provenance in v2", () => {
    expect(chartNatalCalculationRequestSchema.parse(completeV2NatalRequest())).toMatchObject({
      schemaVersion: "chart-request.v2",
      methodVersion: chartMethodVersions.natal,
      executionProfile: localExecutionProfile()
    });
    expect(() =>
      chartNatalCalculationRequestSchema.parse({
        ...completeV2NatalRequest(),
        methodVersion: chartMethodVersions.transit
      })
    ).toThrow();
    expect(() =>
      chartResultSchema.parse({
        ...completeV2NatalPayload(),
        provider: { name: "kerykeion", version: "5.12.9", ephemeris: "moshier" }
      })
    ).toThrow();
    expect(() =>
      chartResultSchema.parse({
        ...completeV2NatalPayload(),
        calculationBasis: {
          symbolicInstant: "1990-08-20T10:30:00Z",
          elapsedLifeDays: 36,
          elapsedYears: 0.1,
          yearLengthDays: 365.24219,
          dayForYearRatio: 1
        }
      })
    ).toThrow();
  });
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

  it("accepts chart AI draft request only for the current result checksum", () => {
    expect(
      createChartAiDraftRequestSchema.parse({
        expectedResultChecksum: `sha256:${"a".repeat(64)}`
      })
    ).toEqual({ expectedResultChecksum: `sha256:${"a".repeat(64)}` });

    expect(() =>
      createChartAiDraftRequestSchema.parse({
        expectedResultChecksum: `sha256:${"a".repeat(64)}`,
        birthDate: "1991-07-10"
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

  it("accepts a composite job request by two CRM client ids and settings", () => {
    expect(
      chartCompositeJobCreateRequestSchema.parse({
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

  it("rejects browser-supplied birth data in composite job requests", () => {
    expect(() =>
      chartCompositeJobCreateRequestSchema.parse({
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

  it("accepts a secondary progression job request by client id, target date and settings", () => {
    expect(
      chartProgressionJobCreateRequestSchema.parse({
        clientId: "00000000-0000-4000-8000-000000000001",
        targetDate: "2026-07-23",
        settings: {
          houseSystem: "placidus",
          nodeType: "true",
          aspectPreset: "major",
          orbMultiplier: 1
        }
      })
    ).toMatchObject({
      clientId: "00000000-0000-4000-8000-000000000001",
      targetDate: "2026-07-23"
    });
  });

  it("rejects browser-supplied birth data in progression job requests", () => {
    expect(() =>
      chartProgressionJobCreateRequestSchema.parse({
        clientId: "00000000-0000-4000-8000-000000000001",
        targetDate: "2026-07-23",
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

  it("accepts a horary job request by client id, question snapshot and settings", () => {
    expect(
      chartHoraryJobCreateRequestSchema.parse({
        clientId: "00000000-0000-4000-8000-000000000001",
        question: {
          question: "Стоит ли принимать предложение?",
          category: "career",
          date: "2026-07-23",
          time: "14:30",
          timezone: "Europe/Moscow",
          latitude: 55.7558,
          longitude: 37.6173
        },
        settings: {
          houseSystem: "regiomontanus",
          nodeType: "true",
          aspectPreset: "major",
          orbMultiplier: 1
        }
      })
    ).toMatchObject({
      clientId: "00000000-0000-4000-8000-000000000001",
      question: {
        question: "Стоит ли принимать предложение?",
        category: "career"
      }
    });
  });

  it("accepts an astrocartography job request by client id and settings only", () => {
    expect(
      chartAstrocartographyJobCreateRequestSchema.parse({
        clientId: "00000000-0000-4000-8000-000000000001",
        settings: {
          houseSystem: "placidus",
          nodeType: "true",
          aspectPreset: "major",
          orbMultiplier: 1
        }
      })
    ).toMatchObject({
      clientId: "00000000-0000-4000-8000-000000000001",
      settings: { houseSystem: "placidus" }
    });
  });

  it("rejects browser-supplied birth data in astrocartography job requests", () => {
    expect(() =>
      chartAstrocartographyJobCreateRequestSchema.parse({
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

  it("rejects horary job requests without question text", () => {
    expect(() =>
      chartHoraryJobCreateRequestSchema.parse({
        clientId: "00000000-0000-4000-8000-000000000001",
        question: {
          question: "",
          category: "career",
          date: "2026-07-23",
          time: "14:30",
          timezone: "Europe/Moscow",
          latitude: 55.7558,
          longitude: 37.6173
        },
        settings: {
          houseSystem: "regiomontanus",
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

  it("accepts complete render data for a composite single-wheel relationship chart", () => {
    const payload = storedChartCalculationPayloadSchema.parse({
      schemaVersion: "chart-result.v1",
      method: "composite",
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
        ...completeRenderResult(),
        warnings: [
          {
            code: "PARTNER_BIRTH_TIME_APPROXIMATE",
            message: "Composite calculated with approximate partner birth time."
          }
        ]
      }
    });

    expect(payload.method).toBe("composite");
    if (payload.method !== "composite") {
      throw new Error("Expected composite chart payload");
    }
    expect(payload.result.points).toHaveLength(14);
    expect(payload.result).not.toHaveProperty("primary");
    expect(payload.relationshipSnapshot.partnerClientId).toBe(
      "00000000-0000-4000-8000-000000000002"
    );
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

  it("accepts complete render data for a secondary progression dual-wheel screen", () => {
    const payload = storedChartCalculationPayloadSchema.parse({
      schemaVersion: "chart-result.v1",
      method: "progression",
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
      progressionSnapshot: {
        targetDate: "2026-07-23",
        progressionType: "secondary",
        calculationBasis: {
          symbolicDate: "1990-08-20",
          ageDays: 36,
          dayForYearRatio: 1
        }
      },
      result: {
        natal: completeRenderResult(),
        progressed: completeRenderResult(),
        aspectsToNatal: [
          {
            progressedPoint: "moon",
            natalPoint: "sun",
            type: "trine",
            angle: 120,
            orb: 1.2,
            applying: true,
            strength: 0.76
          }
        ],
        warnings: []
      }
    });

    expect(payload.method).toBe("progression");
    if (payload.method !== "progression") {
      throw new Error("Expected progression chart payload");
    }
    expect(payload.progressionSnapshot).toMatchObject({
      targetDate: "2026-07-23",
      progressionType: "secondary",
      calculationBasis: { symbolicDate: "1990-08-20", dayForYearRatio: 1 }
    });
    expect(payload.result.aspectsToNatal[0]).toMatchObject({
      progressedPoint: "moon",
      natalPoint: "sun"
    });
  });

  it("rejects progression results without progressed render points", () => {
    expect(() =>
      storedChartCalculationPayloadSchema.parse({
        schemaVersion: "chart-result.v1",
        method: "progression",
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
        progressionSnapshot: {
          targetDate: "2026-07-23",
          progressionType: "secondary",
          calculationBasis: {
            symbolicDate: "1990-08-20",
            ageDays: 36,
            dayForYearRatio: 1
          }
        },
        result: {
          natal: completeRenderResult(),
          progressed: { ...completeRenderResult(), points: [] },
          aspectsToNatal: [],
          warnings: []
        }
      })
    ).toThrow();
  });

  it("accepts complete render data for a horary single-wheel question chart", () => {
    const payload = storedChartCalculationPayloadSchema.parse({
      schemaVersion: "chart-result.v1",
      method: "horary",
      provider: { name: "kerykeion", version: "5.12.9", ephemeris: "swiss-ephemeris" },
      settings: {
        zodiac: "tropical",
        houseSystem: "regiomontanus",
        nodeType: "true",
        aspectPreset: "major",
        orbMultiplier: 1
      },
      questionSnapshot: {
        question: "Стоит ли принимать предложение?",
        category: "career",
        date: "2026-07-23",
        time: "14:30",
        timezone: "Europe/Moscow",
        latitude: 55.7558,
        longitude: 37.6173
      },
      result: completeRenderResult()
    });

    expect(payload.method).toBe("horary");
    if (payload.method !== "horary") {
      throw new Error("Expected horary chart payload");
    }
    expect(payload.questionSnapshot).toMatchObject({
      question: "Стоит ли принимать предложение?",
      category: "career"
    });
    expect(payload).not.toHaveProperty("inputSnapshot");
  });

  it("accepts complete render data for an astrocartography map screen", () => {
    const inputSnapshot = {
      birthDate: "1990-07-15",
      birthTime: "10:30",
      timezone: "Europe/Rome",
      latitude: 41.9028,
      longitude: 12.4964,
      birthTimePrecision: "exact"
    } as const;

    expect(
      chartAstrocartographyCalculationRequestSchema.parse({
        schemaVersion: "chart-request.v2",
        method: "astrocartography",
        methodVersion: chartMethodVersions.astrocartography,
        executionProfile: localExecutionProfile(),
        settings: {
          zodiac: "tropical",
          houseSystem: "placidus",
          nodeType: "true",
          aspectPreset: "major",
          orbMultiplier: 1
        },
        inputSnapshot
      })
    ).toMatchObject({ method: "astrocartography", inputSnapshot });

    const payload = storedChartCalculationPayloadSchema.parse({
      schemaVersion: "chart-result.v1",
      method: "astrocartography",
      provider: { name: "kerykeion", version: "5.12.9", ephemeris: "swiss-ephemeris" },
      settings: {
        zodiac: "tropical",
        houseSystem: "placidus",
        nodeType: "true",
        aspectPreset: "major",
        orbMultiplier: 1
      },
      inputSnapshot,
      result: {
        lines: completeAstrocartographyLines(),
        warnings: [
          {
            code: "ASTROCARTOGRAPHY_POLAR_REGIONS_OMITTED",
            message: "Polar regions are omitted from ASC/DSC line sampling."
          }
        ]
      }
    });

    expect(payload.method).toBe("astrocartography");
    if (payload.method !== "astrocartography") {
      throw new Error("Expected astrocartography chart payload");
    }
    const firstLine = payload.result.lines[0];
    expect(firstLine).toMatchObject({
      id: "sun_mc",
      point: "sun",
      angle: "mc"
    });
    expect(payload.result.lines).toHaveLength(40);
    expect(firstLine?.path).toHaveLength(3);
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
        { latitude: -66, longitude: -120 + pointIndex * 10 + angleIndex },
        { latitude: 0, longitude: -120 + pointIndex * 10 + angleIndex },
        { latitude: 66, longitude: -120 + pointIndex * 10 + angleIndex }
      ]
    }))
  );
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

function completeSettings() {
  return {
    zodiac: "tropical" as const,
    houseSystem: "placidus" as const,
    nodeType: "true" as const,
    aspectPreset: "major" as const,
    orbMultiplier: 1
  };
}

function completeInputSnapshot() {
  return {
    birthDate: "1990-07-15",
    birthTime: "10:30",
    timezone: "Europe/Rome",
    latitude: 41.9028,
    longitude: 12.4964,
    birthTimePrecision: "exact" as const
  };
}

function localExecutionProfile() {
  return {
    provider: "kerykeion" as const,
    kerykeionVersion: "5.12.9" as const,
    pyswissephVersion: "2.10.3.2" as const,
    expectedEphemeris: "moshier" as const,
    expectedEphemerisFlags: ["FLG_MOSEPH", "FLG_SPEED"],
    expectedEphemerisDataRevision: null
  };
}

function completeV2NatalRequest() {
  return {
    schemaVersion: "chart-request.v2" as const,
    method: "natal" as const,
    methodVersion: chartMethodVersions.natal,
    executionProfile: localExecutionProfile(),
    settings: completeSettings(),
    inputSnapshot: completeInputSnapshot()
  };
}

function completeV2NatalPayload() {
  return {
    schemaVersion: "chart-result.v2" as const,
    method: "natal" as const,
    methodVersion: chartMethodVersions.natal,
    provider: {
      name: "kerykeion" as const,
      version: "5.12.9",
      ephemeris: "moshier" as const,
      pyswissephVersion: "2.10.3.2",
      ephemerisFlags: ["FLG_MOSEPH", "FLG_SPEED"],
      ephemerisDataRevision: null
    },
    reproducibilityFingerprint: `sha256:${"a".repeat(64)}`,
    settings: completeSettings(),
    inputSnapshot: completeInputSnapshot(),
    result: completeRenderResult()
  };
}

function completeV2ProgressionPayload() {
  return {
    schemaVersion: "chart-result.v2" as const,
    method: "progression" as const,
    methodVersion: chartMethodVersions.progression,
    provider: completeV2NatalPayload().provider,
    reproducibilityFingerprint: `sha256:${"b".repeat(64)}`,
    settings: completeSettings(),
    inputSnapshot: completeInputSnapshot(),
    progressionSnapshot: {
      targetDate: "2026-07-23",
      progressionType: "secondary" as const,
      calculationBasis: {
        symbolicDate: "1990-08-20",
        ageDays: 36,
        dayForYearRatio: 1 as const
      }
    },
    calculationBasis: {
      symbolicInstant: "1990-08-20T09:02:38Z",
      elapsedLifeDays: 13157,
      elapsedYears: 36.02267306523378,
      yearLengthDays: 365.24219 as const,
      dayForYearRatio: 1 as const
    },
    result: {
      natal: completeRenderResult(),
      progressed: completeRenderResult(),
      aspectsToNatal: [],
      warnings: []
    }
  };
}

function completeV1AstrocartographyPayload() {
  return {
    schemaVersion: "chart-result.v1" as const,
    method: "astrocartography" as const,
    provider: { name: "kerykeion" as const, version: "5.12.9", ephemeris: "swiss-ephemeris" },
    settings: completeSettings(),
    inputSnapshot: completeInputSnapshot(),
    result: { lines: completeAstrocartographyLines(), warnings: [] }
  };
}

function completeV1SynastryPayload() {
  return {
    schemaVersion: "chart-result.v1" as const,
    method: "synastry" as const,
    provider: { name: "kerykeion" as const, version: "5.12.9", ephemeris: "swiss-ephemeris" },
    settings: completeSettings(),
    inputSnapshot: completeInputSnapshot(),
    partnerInputSnapshot: completeInputSnapshot(),
    relationshipSnapshot: {
      primaryClientId: "00000000-0000-4000-8000-000000000001",
      partnerClientId: "00000000-0000-4000-8000-000000000002"
    },
    result: {
      primary: completeRenderResult(),
      partner: completeRenderResult(),
      aspectsBetween: [],
      houseOverlays: [
        {
          owner: "primary" as const,
          point: "sun",
          projectedHouseOwner: "partner" as "primary" | "partner",
          projectedHouse: 7
        }
      ],
      warnings: []
    }
  };
}
