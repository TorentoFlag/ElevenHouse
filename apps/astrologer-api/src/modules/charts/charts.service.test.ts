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

function createService(input: {
  readonly clientStore?: ClientStore;
  readonly commandStore?: ChartCalculationCommandStore;
  readonly jobStore?: ChartCalculationJobStore;
} = {}): ChartsService {
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

function createJobStore(input: {
  readonly job?: Awaited<ReturnType<ChartCalculationJobStore["getOwnerScopedJob"]>>;
} = {}): ChartCalculationJobStore {
  return {
    createOrReuseChartJob: vi.fn(async () => ({ kind: "active_job", jobId }) as const),
    createOrReuseNatalJob: vi.fn(async () => ({ kind: "active_job", jobId }) as const),
    getOwnerScopedJob: vi.fn(async () => input.job ?? null),
    getOwnerScopedResult: vi.fn(async () => null)
  };
}

function createClientStore(input: { readonly birthData?: ClientBirthData } = {}): ClientStore {
  return {
    createJoinIntent: vi.fn(async () => raise()),
    findJoinIntentByTokenHash: vi.fn(async () => null),
    markJoinIntentClaimed: vi.fn(async () => null),
    ensureRelationship: vi.fn(async () => raise()),
    upsertClientProfile: vi.fn(async () => undefined),
    upsertClientBirthData: vi.fn(async () => raise()),
    listAstrologerClients: vi.fn(async () => ({ clients: [], total: 0 })),
    getAstrologerClient: vi.fn(async () => ({
      clientUserId: clientId,
      displayName: "Мария Иванова",
      relationshipStatus: "active" as const,
      firstLinkedAt: now.toISOString(),
      lastLinkedAt: now.toISOString(),
      birthData: input.birthData ?? readyBirthData()
    }))
  };
}

function readyBirthData(): ClientBirthData {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    clientUserId: clientId,
    label: null,
    birthDate: "1990-07-15",
    birthTime: "10:30",
    birthTimePrecision: "exact",
    birthPlaceText: null,
    birthCountryCode: null,
    birthCity: null,
    birthRegion: null,
    birthTimezone: "Europe/Rome",
    birthTimeDstOccurrence: null,
    birthLatitude: 41.9028,
    birthLongitude: 12.4964,
    source: "manual",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
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
