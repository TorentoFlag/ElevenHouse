import { describe, expect, it } from "vitest";
import { createNatalChartJob } from "./chart-use-cases";
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
  it("delegates validated snapshots to the job store", async () => {
    const store: ChartCalculationJobStore = {
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
