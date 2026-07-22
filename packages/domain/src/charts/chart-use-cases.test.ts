import { describe, expect, it } from "vitest";
import { createChartJob, createNatalChartJob } from "./chart-use-cases";
import type { ChartCalculationJobStore } from "./chart-types";

const input = {
  ownerUserId: "11111111-1111-4111-8111-111111111111",
  clientId: "22222222-2222-4222-8222-222222222222",
  inputFingerprint: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  inputSnapshot: {
    birthDate: "1990-07-15",
    birthTime: "10:30",
    timezone: "Europe/Rome",
    latitude: 41.9028,
    longitude: 12.4964,
    birthTimePrecision: "exact"
  },
  settingsSnapshot: {
    zodiac: "tropical",
    houseSystem: "placidus",
    nodeType: "true",
    aspectPreset: "major",
    orbMultiplier: 1
  }
};

describe("createNatalChartJob", () => {
  it("delegates method-aware transit snapshots to the job store", async () => {
    const transitInput = {
      ...input,
      method: "transit" as const,
      inputSnapshot: {
        inputSnapshot: input.inputSnapshot,
        transitSnapshot: {
          date: "2026-07-22",
          time: "14:30",
          timezone: "Europe/Rome",
          latitude: 41.9028,
          longitude: 12.4964
        }
      }
    };
    const store: ChartCalculationJobStore = {
      createOrReuseChartJob: async (received) => {
        expect(received).toEqual(transitInput);
        return { kind: "active_job", jobId: "33333333-3333-4333-8333-333333333333" };
      },
      createOrReuseNatalJob: async () => {
        throw new Error("natal-specific store should not be called");
      },
      getOwnerScopedJob: async () => null,
      getOwnerScopedResult: async () => null
    };

    await expect(createChartJob({ store, ...transitInput })).resolves.toEqual({
      kind: "active_job",
      jobId: "33333333-3333-4333-8333-333333333333"
    });
  });

  it("delegates method-aware synastry snapshots to the job store", async () => {
    const synastryInput = {
      ...input,
      method: "synastry" as const,
      inputSnapshot: {
        inputSnapshot: input.inputSnapshot,
        partnerInputSnapshot: {
          birthDate: "1992-08-11",
          birthTime: "22:15",
          timezone: "Europe/Moscow",
          latitude: 55.7558,
          longitude: 37.6173,
          birthTimePrecision: "exact"
        },
        relationshipSnapshot: {
          primaryClientId: input.clientId,
          partnerClientId: "44444444-4444-4444-8444-444444444444"
        }
      }
    };
    const store: ChartCalculationJobStore = {
      createOrReuseChartJob: async (received) => {
        expect(received).toEqual(synastryInput);
        return { kind: "active_job", jobId: "33333333-3333-4333-8333-333333333333" };
      },
      createOrReuseNatalJob: async () => {
        throw new Error("natal-specific store should not be called");
      },
      getOwnerScopedJob: async () => null,
      getOwnerScopedResult: async () => null
    };

    await expect(createChartJob({ store, ...synastryInput })).resolves.toEqual({
      kind: "active_job",
      jobId: "33333333-3333-4333-8333-333333333333"
    });
  });

  it("delegates method-aware solar return snapshots to the job store", async () => {
    const solarReturnInput = {
      ...input,
      method: "solar_return" as const,
      inputSnapshot: {
        inputSnapshot: input.inputSnapshot,
        solarReturnSnapshot: {
          year: 2026,
          returnType: "solar",
          location: {
            timezone: "Europe/Rome",
            latitude: 41.9028,
            longitude: 12.4964
          }
        }
      }
    };
    const store: ChartCalculationJobStore = {
      createOrReuseChartJob: async (received) => {
        expect(received).toEqual(solarReturnInput);
        return { kind: "active_job", jobId: "33333333-3333-4333-8333-333333333333" };
      },
      createOrReuseNatalJob: async () => {
        throw new Error("natal-specific store should not be called");
      },
      getOwnerScopedJob: async () => null,
      getOwnerScopedResult: async () => null
    };

    await expect(createChartJob({ store, ...solarReturnInput })).resolves.toEqual({
      kind: "active_job",
      jobId: "33333333-3333-4333-8333-333333333333"
    });
  });

  it("delegates validated snapshots to the job store", async () => {
    const store: ChartCalculationJobStore = {
      createOrReuseChartJob: async () => {
        throw new Error("generic store should not be called");
      },
      createOrReuseNatalJob: async (received) => {
        expect(received).toEqual(input);
        return { kind: "active_job", jobId: "33333333-3333-4333-8333-333333333333" };
      },
      getOwnerScopedJob: async () => null,
      getOwnerScopedResult: async () => null
    };

    await expect(createNatalChartJob({ store, ...input })).resolves.toEqual({
      kind: "active_job",
      jobId: "33333333-3333-4333-8333-333333333333"
    });
  });

  it("preserves existing-result outcomes for idempotent requests", async () => {
    const store: ChartCalculationJobStore = {
      createOrReuseChartJob: async () => {
        throw new Error("generic store should not be called");
      },
      createOrReuseNatalJob: async () => ({
        kind: "existing_result",
        calculationId: "44444444-4444-4444-8444-444444444444"
      }),
      getOwnerScopedJob: async () => null,
      getOwnerScopedResult: async () => null
    };

    await expect(createNatalChartJob({ store, ...input })).resolves.toEqual({
      kind: "existing_result",
      calculationId: "44444444-4444-4444-8444-444444444444"
    });
  });
});
