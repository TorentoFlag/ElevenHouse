import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type {
  AstroCalendarGenerationRecord,
  AstroCalendarGenerationStore,
  ClientBirthData,
  ClientStore
} from "@elevenhouse/domain";
import type { ChartSettings } from "@elevenhouse/contracts";
import type { SystemClock } from "../clock/system-clock.service";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { AstroCalendarService } from "./astro-calendar.service";

const ownerUserId = "11111111-1111-4111-8111-111111111111";
const clientId = "22222222-2222-4222-8222-222222222222";
const generationId = "33333333-3333-4333-8333-333333333333";
const now = "2026-07-25T12:00:00.000Z";

describe("AstroCalendarService", () => {
  it("returns a stale read state when the current fingerprint has no generation yet", async () => {
    const service = createService();

    const response = await service.getRange(
      {
        start: "2026-07-01",
        end: "2026-07-31",
        timeZone: "Europe/Moscow",
        clientIds: [clientId],
        eventTypes: ["client.birthday"]
      },
      request()
    );

    expect(response.generation).toMatchObject({
      status: "stale",
      generationId: null
    });
    expect(response.events).toEqual([]);
    expect(response.readiness.clientsReady).toBe(1);
  });

  it("creates a calculating generation from owner-scoped client birth data", async () => {
    const generationStore = createGenerationStore();
    const service = createService({ generationStore });

    const response = await service.createGeneration(
      {
        start: "2026-07-01",
        end: "2026-07-31",
        timeZone: "Europe/Moscow",
        clientIds: [clientId],
        eventTypes: ["client.birthday", "client.transit_aspect"],
        settings: settings()
      },
      request()
    );

    expect(response.generation.status).toBe("calculating");
    expect(generationStore.createCalculating).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId,
        rangeStart: "2026-07-01",
        rangeEnd: "2026-07-31",
        timeZone: "Europe/Moscow",
        requestSnapshot: expect.objectContaining({
          clients: [
            {
              clientId,
              displayName: "Мария",
              initials: "М",
              birthDate: "1990-07-15",
              birthTime: "14:30",
              birthTimePrecision: "exact",
              birthTimezone: "Europe/Moscow",
              birthLatitude: 55.7558,
              birthLongitude: 37.6173
            }
          ]
        }),
        warnings: []
      })
    );
  });

  it("returns an existing ready generation with events for duplicate generation requests", async () => {
    const readyGeneration = generation({
      readinessSummary: {
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
      }
    });
    const readyEvent = {
      id: "66666666-6666-4666-8666-666666666666",
      eventId: "global-ingress-sun-leo",
      ownerUserId,
      generationId,
      source: "global",
      type: "global.ingress",
      startsAt: "2026-07-22T12:00:00.000Z",
      endsAt: null,
      dictionaryCodes: ["astro_calendar.global.ingress.sun.leo"],
      payload: {
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
    } as const;
    const generationStore = createGenerationStore({
      createCalculating: vi.fn(async () => readyGeneration),
      findByFingerprint: vi.fn(async () => ({ generation: readyGeneration, events: [readyEvent] }))
    });
    const service = createService({ generationStore });

    const response = await service.createGeneration(
      {
        start: "2026-07-01",
        end: "2026-07-31",
        timeZone: "Europe/Moscow",
        clientIds: [clientId],
        eventTypes: ["global.ingress"],
        settings: settings()
      },
      request()
    );

    expect(response.generation.status).toBe("ready");
    expect(response.readiness.clientsTotal).toBe(1);
    expect(response.readiness.clientsReady).toBe(1);
    expect(response.summary.eventCount).toBe(1);
    expect(response.events).toHaveLength(1);
    expect(generationStore.findByFingerprint).toHaveBeenCalledWith(
      expect.objectContaining({ ownerUserId })
    );
  });

  it("forbids client ids outside the astrologer scope", async () => {
    const service = createService({
      clientStore: createClientStore({
        getAstrologerClient: vi.fn(async () => null)
      })
    });

    await expect(
      service.createGeneration(
        {
          start: "2026-07-01",
          end: "2026-07-31",
          timeZone: "Europe/Moscow",
          clientIds: [clientId],
          eventTypes: ["client.birthday"],
          settings: settings()
        },
        request()
      )
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("surfaces missing and approximate birth-data warnings", async () => {
    const service = createService({
      clientStore: createClientStore({
        listAstrologerClients: vi.fn(async () => ({
          clients: [
            client({ clientUserId: clientId, birthData: null }),
            client({
              clientUserId: "44444444-4444-4444-8444-444444444444",
              displayName: "Анна",
              birthData: {
                ...birthData("44444444-4444-4444-8444-444444444444"),
                birthTimePrecision: "approximate"
              }
            })
          ],
          total: 2
        }))
      })
    });

    const response = await service.getRange(
      {
        start: "2026-07-01",
        end: "2026-07-31",
        timeZone: "Europe/Moscow",
        scope: "client",
        eventTypes: ["client.birthday", "client.transit_aspect"]
      },
      request()
    );

    expect(response.readiness).toMatchObject({
      clientsTotal: 2,
      clientsReady: 1,
      clientsWithMissingBirthData: 1,
      clientsWithApproximateBirthTime: 1
    });
    expect(response.warnings.map((warning) => warning.code)).toEqual([
      "CLIENT_BIRTH_DATA_MISSING",
      "CLIENT_BIRTH_TIME_APPROXIMATE"
    ]);
  });

  it("returns persisted failed state and retries it as calculating", async () => {
    const failedGeneration = generation({ status: "failed", errorCode: "CHART_ENGINE_FAILED" });
    const generationStore = createGenerationStore({
      findByFingerprint: vi.fn(async () => ({ generation: failedGeneration, events: [] })),
      markCalculating: vi.fn(async () => generation({ status: "calculating" }))
    });
    const service = createService({ generationStore });

    const read = await service.getRange(
      {
        start: "2026-07-01",
        end: "2026-07-31",
        timeZone: "Europe/Moscow",
        clientIds: [clientId],
        eventTypes: ["client.birthday"]
      },
      request()
    );
    expect(read.generation.status).toBe("failed");
    expect(read.warnings.map((warning) => warning.code)).toContain("GENERATION_FAILED");

    const retry = await service.retryGeneration(generationId, request());
    expect(retry.generation.status).toBe("calculating");
    expect(generationStore.markCalculating).toHaveBeenCalledWith({
      ownerUserId,
      generationId,
      now
    });
  });

  it("requires an astrologer session", async () => {
    await expect(createService().getRange({}, {} as never)).rejects.toBeInstanceOf(
      UnauthorizedException
    );
  });
});

function createService(
  overrides: {
    clientStore?: ClientStore;
    generationStore?: AstroCalendarGenerationStore;
    clock?: SystemClock;
  } = {}
) {
  return new AstroCalendarService(
    overrides.clientStore ?? createClientStore(),
    overrides.generationStore ?? createGenerationStore(),
    overrides.clock ?? ({ now: () => new Date(now) } as SystemClock)
  );
}

function createClientStore(overrides: Partial<ClientStore> = {}): ClientStore {
  return {
    createJoinIntent: vi.fn(),
    findJoinIntentByTokenHash: vi.fn(),
    markJoinIntentClaimed: vi.fn(),
    ensureRelationship: vi.fn(),
    upsertClientProfile: vi.fn(),
    writeClientBirthProfile: vi.fn(),
    listAstrologerClients: vi.fn(async () => ({
      clients: [client({ clientUserId: clientId })],
      total: 1
    })),
    getAstrologerClient: vi.fn(async () => client({ clientUserId: clientId })),
    ...overrides
  } as ClientStore;
}

function createGenerationStore(
  overrides: Partial<AstroCalendarGenerationStore> = {}
): AstroCalendarGenerationStore {
  return {
    createCalculating: vi.fn(async (input) =>
      generation({
        status: "calculating",
        inputFingerprint: input.inputFingerprint,
        rangeStart: input.rangeStart,
        rangeEnd: input.rangeEnd,
        timeZone: input.timeZone,
        readinessSummary: input.readinessSummary,
        warnings: input.warnings
      })
    ),
    findByFingerprint: vi.fn(async () => null),
    findById: vi.fn(async () => null),
    findLatestForRange: vi.fn(async () => null),
    markReady: vi.fn(),
    markFailed: vi.fn(),
    markStaleByOwner: vi.fn(),
    markCalculating: vi.fn(async () => generation({ status: "calculating" })),
    ...overrides
  } as AstroCalendarGenerationStore;
}

function request(): AstrologerSessionRequest {
  return {
    currentAstrologerAccount: { account: { id: ownerUserId } }
  } as AstrologerSessionRequest;
}

function settings(): ChartSettings {
  return {
    houseSystem: "placidus",
    zodiac: "tropical",
    nodeType: "true",
    aspectPreset: "major",
    orbMultiplier: 1
  };
}

function client(input: {
  readonly clientUserId: string;
  readonly displayName?: string | null;
  readonly birthData?: ClientBirthData | null;
}) {
  return {
    clientUserId: input.clientUserId,
    displayName: input.displayName ?? "Мария",
    relationshipStatus: "active" as const,
    firstLinkedAt: "2026-07-01T00:00:00.000Z",
    lastLinkedAt: "2026-07-01T00:00:00.000Z",
    birthData: input.birthData === undefined ? birthData(input.clientUserId) : input.birthData
  };
}

function birthData(targetClientId: string): ClientBirthData {
  return {
    id: "55555555-5555-4555-8555-555555555555",
    clientUserId: targetClientId,
    label: null,
    birthDate: "1990-07-15",
    birthTime: "14:30",
    birthTimePrecision: "exact" as const,
    birthPlaceText: "Moscow",
    birthCountryCode: "RU",
    birthCity: "Moscow",
    birthRegion: null,
    birthTimezone: "Europe/Moscow",
    birthTimeDstOccurrence: null,
    birthLatitude: 55.7558,
    birthLongitude: 37.6173,
    source: "manual" as const,
    revision: 1,
    lastEditedByUserId: ownerUserId,
    lastEditedByRole: "astrologer" as const,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z"
  };
}

function generation(
  overrides: Partial<AstroCalendarGenerationRecord> = {}
): AstroCalendarGenerationRecord {
  return {
    id: generationId,
    ownerUserId,
    status: "ready",
    inputFingerprint: "sha256:a".padEnd(71, "a"),
    rangeStart: "2026-07-01",
    rangeEnd: "2026-07-31",
    timeZone: "Europe/Moscow",
    requestSnapshot: {},
    settingsSnapshot: settings(),
    readinessSummary: {
      clientsTotal: 1,
      clientsReady: 1,
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
    warnings: [],
    provider: { name: "kerykeion", version: "5.12.9", ephemeris: "swiss-ephemeris" },
    generatedAt: "2026-07-25T12:00:00.000Z",
    errorCode: null,
    errorMessage: null,
    createdAt: "2026-07-25T12:00:00.000Z",
    updatedAt: "2026-07-25T12:00:00.000Z",
    ...overrides
  };
}
