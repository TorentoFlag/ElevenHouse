import { describe, expect, it, vi } from "vitest";
import type {
  ChartCalculationCommandStore,
  ChartCalculationJobStore,
  ClientBirthData,
  ClientStore
} from "@elevenhouse/domain";
import type { SystemClock } from "../clock/system-clock.service";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { ChartsService } from "./charts.service";

const now = new Date("2026-07-20T12:00:00.000Z");
const ownerUserId = "11111111-1111-4111-8111-111111111111";
const clientId = "22222222-2222-4222-8222-222222222222";
const jobId = "33333333-3333-4333-8333-333333333333";
const partnerClientId = "44444444-4444-4444-8444-444444444444";

describe("ChartsService", () => {
  it("hydrates birth data from CRM and never accepts browser birth data", async () => {
    const clientStore = createClientStore();
    const commandStore = createCommandStore();
    const service = createService({ clientStore, commandStore });

    await service.createNatalJob(
      {
        clientId,
        settings: settings()
      },
      request()
    );

    expect(clientStore.getAstrologerClient).toHaveBeenCalledWith({
      astrologerUserId: ownerUserId,
      clientUserId: clientId
    });
    expect(commandStore.createOrReuseNatalJobAndRequestCalculation).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId,
        clientId,
        inputSnapshot: expect.objectContaining({ birthDate: "1990-07-15" })
      })
    );
  });

  it("creates transit jobs with resolved natal-backed transit snapshot", async () => {
    const commandStore = createCommandStore();
    const service = createService({ commandStore });

    await service.createTransitJob(
      {
        clientId,
        settings: settings(),
        transit: {
          date: "2026-07-22",
          time: "14:30"
        }
      },
      request()
    );

    expect(commandStore.createOrReuseChartJobAndRequestCalculation).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "transit",
        ownerUserId,
        clientId,
        inputSnapshot: {
          inputSnapshot: expect.objectContaining({
            birthDate: "1990-07-15",
            timezone: "Europe/Rome"
          }),
          transitSnapshot: {
            date: "2026-07-22",
            time: "14:30",
            timezone: "Europe/Rome",
            latitude: 41.9028,
            longitude: 12.4964
          }
        }
      })
    );
  });

  it("allows an explicit transit timezone and coordinates", async () => {
    const commandStore = createCommandStore();
    const service = createService({ commandStore });

    await service.createTransitJob(
      {
        clientId,
        settings: settings(),
        transit: {
          date: "2026-07-22",
          time: "14:30",
          timezone: "Europe/Moscow",
          latitude: 55.7558,
          longitude: 37.6173
        }
      },
      request()
    );

    expect(commandStore.createOrReuseChartJobAndRequestCalculation).toHaveBeenCalledWith(
      expect.objectContaining({
        inputSnapshot: expect.objectContaining({
          transitSnapshot: {
            date: "2026-07-22",
            time: "14:30",
            timezone: "Europe/Moscow",
            latitude: 55.7558,
            longitude: 37.6173
          }
        })
      })
    );
  });

  it("creates synastry jobs from two owner-scoped CRM birth data snapshots", async () => {
    const clientStore = createClientStore({
      clients: {
        [clientId]: readyBirthData({ clientUserId: clientId, birthDate: "1990-07-15" }),
        [partnerClientId]: readyBirthData({
          clientUserId: partnerClientId,
          birthDate: "1992-08-11",
          birthTime: "08:15",
          birthTimezone: "Europe/Moscow",
          birthLatitude: 55.7558,
          birthLongitude: 37.6173
        })
      }
    });
    const commandStore = createCommandStore();
    const service = createService({ clientStore, commandStore });

    await service.createSynastryJob(
      {
        clientId,
        partnerClientId,
        settings: settings()
      },
      request()
    );

    expect(clientStore.getAstrologerClient).toHaveBeenCalledWith({
      astrologerUserId: ownerUserId,
      clientUserId: clientId
    });
    expect(clientStore.getAstrologerClient).toHaveBeenCalledWith({
      astrologerUserId: ownerUserId,
      clientUserId: partnerClientId
    });
    expect(commandStore.createOrReuseChartJobAndRequestCalculation).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "synastry",
        ownerUserId,
        clientId,
        inputSnapshot: {
          inputSnapshot: expect.objectContaining({
            birthDate: "1990-07-15",
            timezone: "Europe/Rome"
          }),
          partnerInputSnapshot: expect.objectContaining({
            birthDate: "1992-08-11",
            timezone: "Europe/Moscow"
          }),
          relationshipSnapshot: {
            primaryClientId: clientId,
            partnerClientId
          }
        }
      })
    );
  });

  it("rejects synastry jobs for the same client", async () => {
    const commandStore = createCommandStore();
    const service = createService({ commandStore });

    await expect(
      service.createSynastryJob(
        { clientId, partnerClientId: clientId, settings: settings() },
        request()
      )
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "CHART_SYNASTRY_PARTNER_REQUIRED" })
    });
    expect(commandStore.createOrReuseChartJobAndRequestCalculation).not.toHaveBeenCalled();
  });

  it("rejects synastry jobs when the partner has no birth data", async () => {
    const clientStore = createClientStore({
      clients: {
        [clientId]: readyBirthData({ clientUserId: clientId }),
        [partnerClientId]: null
      }
    });
    const commandStore = createCommandStore();
    const service = createService({ clientStore, commandStore });

    await expect(
      service.createSynastryJob({ clientId, partnerClientId, settings: settings() }, request())
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "CHART_PARTNER_CLIENT_NOT_FOUND" })
    });
    expect(commandStore.createOrReuseChartJobAndRequestCalculation).not.toHaveBeenCalled();
  });

  it("maps unknown birth time to an actionable validation error", async () => {
    const clientStore = createClientStore({
      birthData: { ...readyBirthData(), birthTime: null, birthTimePrecision: "unknown" }
    });
    const service = createService({ clientStore });

    await expect(
      service.createNatalJob({ clientId, settings: settings() }, request())
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "CHART_BIRTH_TIME_REQUIRED" })
    });
  });

  it("returns persisted failure details for a failed chart job", async () => {
    const jobStore = createJobStore({
      job: {
        id: jobId,
        ownerUserId,
        clientId,
        resultCalculationId: null,
        method: "natal",
        status: "failed",
        inputFingerprint: "sha256:test",
        lastErrorCode: "retry_exhausted",
        lastErrorMessage: "CHART_ENGINE_HTTP_503"
      }
    });
    const service = createService({ jobStore });

    await expect(service.getJob(jobId, request())).resolves.toMatchObject({
      id: jobId,
      status: "failed",
      calculationId: null,
      failureCode: "retry_exhausted",
      failureMessage: "CHART_ENGINE_HTTP_503"
    });
  });
});

function createService(
  input: {
    readonly clientStore?: ClientStore;
    readonly commandStore?: ChartCalculationCommandStore;
    readonly jobStore?: ChartCalculationJobStore;
  } = {}
): ChartsService {
  return new ChartsService(
    input.clientStore ?? createClientStore(),
    input.commandStore ?? createCommandStore(),
    input.jobStore ?? createJobStore(),
    { now: () => now } as SystemClock
  );
}

function createCommandStore(): ChartCalculationCommandStore {
  return {
    createOrReuseChartJobAndRequestCalculation: vi.fn(
      async () => ({ kind: "active_job", jobId }) as const
    ),
    createOrReuseNatalJobAndRequestCalculation: vi.fn(
      async () => ({ kind: "active_job", jobId }) as const
    )
  };
}

function createJobStore(
  input: {
    readonly job?: Awaited<ReturnType<ChartCalculationJobStore["getOwnerScopedJob"]>>;
  } = {}
): ChartCalculationJobStore {
  return {
    createOrReuseChartJob: vi.fn(async () => ({ kind: "active_job", jobId }) as const),
    createOrReuseNatalJob: vi.fn(async () => ({ kind: "active_job", jobId }) as const),
    getOwnerScopedJob: vi.fn(async () => input.job ?? null),
    getOwnerScopedResult: vi.fn(async () => null)
  };
}

function createClientStore(
  input: {
    readonly birthData?: ClientBirthData;
    readonly clients?: Record<string, ClientBirthData | null>;
  } = {}
): ClientStore {
  return {
    createJoinIntent: vi.fn(async () => raise()),
    findJoinIntentByTokenHash: vi.fn(async () => null),
    markJoinIntentClaimed: vi.fn(async () => null),
    ensureRelationship: vi.fn(async () => raise()),
    upsertClientProfile: vi.fn(async () => undefined),
    upsertClientBirthData: vi.fn(async () => raise()),
    listAstrologerClients: vi.fn(async () => ({ clients: [], total: 0 })),
    getAstrologerClient: vi.fn(async ({ clientUserId }) => {
      const birthData = input.clients
        ? input.clients[clientUserId]
        : (input.birthData ?? readyBirthData({ clientUserId }));
      return {
        clientUserId,
        displayName: clientUserId === partnerClientId ? "Партнер" : "Мария Иванова",
        relationshipStatus: "active" as const,
        firstLinkedAt: now.toISOString(),
        lastLinkedAt: now.toISOString(),
        birthData
      };
    })
  };
}

function readyBirthData(input: Partial<ClientBirthData> = {}): ClientBirthData {
  return {
    id: input.id ?? "55555555-5555-4555-8555-555555555555",
    clientUserId: input.clientUserId ?? clientId,
    label: input.label ?? null,
    birthDate: input.birthDate ?? "1990-07-15",
    birthTime: input.birthTime ?? "10:30",
    birthTimePrecision: "exact",
    birthPlaceText: input.birthPlaceText ?? null,
    birthCountryCode: input.birthCountryCode ?? null,
    birthCity: input.birthCity ?? null,
    birthRegion: input.birthRegion ?? null,
    birthTimezone: input.birthTimezone ?? "Europe/Rome",
    birthTimeDstOccurrence: input.birthTimeDstOccurrence ?? null,
    birthLatitude: input.birthLatitude ?? 41.9028,
    birthLongitude: input.birthLongitude ?? 12.4964,
    source: input.source ?? "manual",
    createdAt: input.createdAt ?? now.toISOString(),
    updatedAt: input.updatedAt ?? now.toISOString()
  };
}

function settings() {
  return {
    houseSystem: "placidus",
    nodeType: "true",
    aspectPreset: "major",
    orbMultiplier: 1
  };
}

function request(): AstrologerSessionRequest {
  return {
    currentAstrologerAccount: { account: { id: ownerUserId } }
  } as AstrologerSessionRequest;
}

function raise(): never {
  throw new Error("Unexpected dependency call");
}
