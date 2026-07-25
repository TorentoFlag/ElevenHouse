import { describe, expect, it, vi } from "vitest";
import { ChartEnginePermanentError } from "@elevenhouse/chart-engine-client";
import type { AstroCalendarRangeResponse } from "@elevenhouse/contracts";
import type {
  AstroCalendarGenerationRecord,
  AstroCalendarGenerationStore
} from "@elevenhouse/domain";
import { UnrecoverableError } from "bullmq";
import {
  processAstroCalendarGenerationJob,
  type AstroCalendarEngineClient
} from "./astro-calendar-jobs.processor";

const generationId = "33333333-3333-4333-8333-333333333333";
const ownerUserId = "11111111-1111-4111-8111-111111111111";
const now = new Date("2026-07-25T12:00:00.000Z");
const settings = {
  zodiac: "tropical",
  houseSystem: "placidus",
  nodeType: "true",
  aspectPreset: "major",
  orbMultiplier: 1
} as const;

describe("processAstroCalendarGenerationJob", () => {
  it("calls chart-engine with stored snapshots and persists ready events", async () => {
    const store = createStore();
    const engine = createEngine();

    await processAstroCalendarGenerationJob({
      generationId,
      finalAttempt: false,
      store,
      engine,
      now
    });

    expect(engine.calculateAstroCalendarRange).toHaveBeenCalledWith({
      start: "2026-07-01",
      end: "2026-07-31",
      timeZone: "Europe/Moscow",
      scope: "global",
      clientIds: [],
      eventTypes: ["global.ingress"],
      settings
    });
    expect(store.markReady).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId,
        generationId,
        events: [
          expect.objectContaining({
            eventId: "global-ingress-sun-leo",
            type: "global.ingress",
            dictionaryCodes: ["astro_calendar.global.ingress.sun.leo"]
          })
        ]
      })
    );
  });

  it("marks invalid provider output as failed and unrecoverable", async () => {
    const store = createStore();
    const engine = createEngine({
      calculateAstroCalendarRange: vi.fn(async () => {
        throw new ChartEnginePermanentError("invalid astro calendar response");
      })
    });

    await expect(
      processAstroCalendarGenerationJob({
        generationId,
        finalAttempt: false,
        store,
        engine,
        now
      })
    ).rejects.toBeInstanceOf(UnrecoverableError);

    expect(store.markFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        generationId,
        errorCode: "provider_invalid_result",
        errorMessage: "invalid astro calendar response"
      })
    );
  });

  it("marks final transient failure as failed", async () => {
    const store = createStore();
    const engine = createEngine({
      calculateAstroCalendarRange: vi.fn(async () => {
        throw new Error("chart-engine unavailable");
      })
    });

    await expect(
      processAstroCalendarGenerationJob({
        generationId,
        finalAttempt: true,
        store,
        engine,
        now
      })
    ).rejects.toThrow("chart-engine unavailable");

    expect(store.markFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        generationId,
        errorCode: "retry_exhausted",
        errorMessage: "chart-engine unavailable"
      })
    );
  });
});

function createStore(
  overrides: Partial<AstroCalendarGenerationStore> = {}
): AstroCalendarGenerationStore {
  return {
    createCalculating: vi.fn(),
    findByFingerprint: vi.fn(),
    findById: vi.fn(async () => ({ generation: generation(), events: [] })),
    findLatestForRange: vi.fn(),
    markReady: vi.fn(async () => ({ generation: generation({ status: "ready" }), events: [] })),
    markFailed: vi.fn(async () => generation({ status: "failed" })),
    markCalculating: vi.fn(),
    markStaleByOwner: vi.fn(),
    ...overrides
  } as AstroCalendarGenerationStore;
}

function createEngine(
  overrides: Partial<AstroCalendarEngineClient> = {}
): AstroCalendarEngineClient {
  return {
    calculateAstroCalendarRange: vi.fn(async () => astroCalendarResponse),
    ...overrides
  };
}

function generation(
  overrides: Partial<AstroCalendarGenerationRecord> = {}
): AstroCalendarGenerationRecord {
  return {
    id: generationId,
    ownerUserId,
    status: "calculating",
    inputFingerprint: "sha256:".padEnd(71, "a"),
    rangeStart: "2026-07-01",
    rangeEnd: "2026-07-31",
    timeZone: "Europe/Moscow",
    requestSnapshot: {
      range: { start: "2026-07-01", end: "2026-07-31" },
      scope: "global",
      clientIds: [],
      eventTypes: ["global.ingress"]
    },
    settingsSnapshot: settings,
    readinessSummary: astroCalendarResponse.readiness,
    summary: astroCalendarResponse.summary,
    warnings: [],
    provider: null,
    generatedAt: null,
    errorCode: null,
    errorMessage: null,
    createdAt: "2026-07-25T12:00:00.000Z",
    updatedAt: "2026-07-25T12:00:00.000Z",
    ...overrides
  };
}

const astroCalendarResponse = {
  schemaVersion: "astro-calendar-range.v1",
  timeZone: "Europe/Moscow",
  range: { start: "2026-07-01", end: "2026-07-31" },
  generation: {
    status: "ready",
    generationId,
    fingerprint: "sha256:".padEnd(71, "a"),
    generatedAt: "2026-07-25T12:00:00.000Z",
    provider: { name: "kerykeion", version: "5.12.9", ephemeris: "swiss-ephemeris" }
  },
  events: [
    {
      id: "global-ingress-sun-leo",
      source: "global",
      type: "global.ingress",
      startsAt: "2026-07-22T12:00:00.000Z",
      endsAt: null,
      timePrecision: "exact",
      title: "Солнце входит в Лев",
      subtitle: null,
      description: null,
      tone: "opportunity",
      points: ["sun"],
      aspect: null,
      sign: "leo",
      clientRefs: [],
      chartLink: null,
      dictionaryCodes: ["astro_calendar.global.ingress.sun.leo"],
      warnings: []
    }
  ],
  readiness: {
    clientsTotal: 0,
    clientsReady: 0,
    clientsWithMissingBirthData: 0,
    clientsWithUnknownBirthTime: 0,
    clientsWithApproximateBirthTime: 0
  },
  summary: {
    eventCount: 1,
    globalEventCount: 1,
    clientEventCount: 0,
    byType: { "global.ingress": 1 },
    byTone: { opportunity: 1 }
  },
  dictionaryCodes: ["astro_calendar.global.ingress.sun.leo"],
  warnings: []
} as AstroCalendarRangeResponse;
