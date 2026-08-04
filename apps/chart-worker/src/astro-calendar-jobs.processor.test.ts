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
      now,
      storageOperationTimeoutMs: 1_000
    });

    expect(engine.calculateAstroCalendarRange).toHaveBeenCalledWith({
      start: "2026-07-01",
      end: "2026-07-31",
      timeZone: "Europe/Moscow",
      scope: "client",
      clientIds: ["22222222-2222-4222-8222-222222222222"],
      eventTypes: ["client.birthday", "client.solar_window"],
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
      settings
    });
    expect(store.markReady).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId,
        generationId,
        readinessSummary: clientReadinessSummary,
        warnings: [
          expect.objectContaining({ code: "CLIENT_BIRTH_TIME_APPROXIMATE" }),
          expect.objectContaining({ code: "PROVIDER_PRECISION_LIMITED" })
        ],
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
        throw new ChartEnginePermanentError("CHART_ENGINE_RESPONSE_INVALID_SCHEMA");
      })
    });

    await expect(
      processAstroCalendarGenerationJob({
        generationId,
        finalAttempt: false,
        store,
        engine,
        now,
        storageOperationTimeoutMs: 1_000
      })
    ).rejects.toBeInstanceOf(UnrecoverableError);

    expect(store.markFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        generationId,
        errorCode: "provider_invalid_result",
        errorMessage: "Chart engine returned an invalid AstroCalendar result"
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

    const error = await processAstroCalendarGenerationJob({
      generationId,
      finalAttempt: true,
      store,
      engine,
      now,
      storageOperationTimeoutMs: 1_000
    }).catch((caught: unknown) => caught);

    expect(error).toMatchObject({ message: "ASTRO_CALENDAR_TRANSIENT_FAILURE" });

    expect(store.markFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        generationId,
        errorCode: "retry_exhausted",
        errorMessage: "AstroCalendar generation failed after configured retries"
      })
    );
  });

  it("never exposes sensitive provider or Drizzle details in durable or Bull errors", async () => {
    const sensitive = "DrizzleQueryError SQL params clients birthSnapshot resultData";
    const store = createStore();
    const engine = createEngine({
      calculateAstroCalendarRange: vi.fn().mockRejectedValue(new Error(sensitive))
    });

    const error = await processAstroCalendarGenerationJob({
      generationId,
      finalAttempt: true,
      store,
      engine,
      now,
      storageOperationTimeoutMs: 1_000
    }).catch((caught: unknown) => caught);

    expect(error).toMatchObject({ message: "ASTRO_CALENDAR_TRANSIENT_FAILURE" });
    expect(JSON.stringify(error)).not.toContain(sensitive);
    expect(JSON.stringify(vi.mocked(store.markFailed).mock.calls)).not.toContain(sensitive);
  });

  it("sanitizes a pre-read storage failure before it reaches Bull", async () => {
    const sensitive = "select request_snapshot settings_snapshot params owner";
    const store = createStore({
      findById: vi.fn().mockRejectedValue(new Error(sensitive))
    });

    const error = await processAstroCalendarGenerationJob({
      generationId,
      finalAttempt: false,
      store,
      engine: createEngine(),
      now,
      storageOperationTimeoutMs: 1_000
    }).catch((caught: unknown) => caught);

    expect(error).toMatchObject({ message: "ASTRO_CALENDAR_STORAGE_FAILURE" });
    expect(JSON.stringify(error)).not.toContain(sensitive);
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
      scope: "client",
      clientIds: ["22222222-2222-4222-8222-222222222222"],
      eventTypes: ["client.birthday", "client.solar_window"],
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
      ]
    },
    settingsSnapshot: settings,
    readinessSummary: clientReadinessSummary,
    summary: astroCalendarResponse.summary,
    warnings: [
      {
        code: "CLIENT_BIRTH_TIME_APPROXIMATE",
        severity: "warning",
        message: "У клиента указано примерное время рождения.",
        clientId: "22222222-2222-4222-8222-222222222222",
        eventId: null,
        dictionaryCode: null,
        action: null
      }
    ],
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
  warnings: [
    {
      code: "PROVIDER_PRECISION_LIMITED",
      severity: "warning",
      message: "Chart engine does not generate client events without owner-scoped CRM data.",
      clientId: null,
      eventId: null,
      dictionaryCode: null,
      action: null
    }
  ]
} as AstroCalendarRangeResponse;

const clientReadinessSummary = {
  clientsTotal: 2,
  clientsReady: 2,
  clientsWithMissingBirthData: 0,
  clientsWithUnknownBirthTime: 0,
  clientsWithApproximateBirthTime: 1
} as const;
