import { describe, expect, it, vi } from "vitest";
import {
  chartMethodVersions,
  type ChartExecutionProfile,
  type ReproducibleChartResult
} from "@elevenhouse/contracts";
import { buildChartJobRequestFingerprint } from "./chart-execution-profile";
import { createChartJob, createNatalChartJob } from "./chart-use-cases";
import type { CanonicalJson } from "../calculations/canonical-json";
import type { ChartCalculationJobStore, CreateOrReuseChartJobInput } from "./chart-types";

const executionProfile: ChartExecutionProfile = {
  provider: "kerykeion" as const,
  kerykeionVersion: "5.12.9" as const,
  pyswissephVersion: "2.10.3.2" as const,
  expectedEphemeris: "moshier" as const,
  expectedEphemerisFlags: ["FLG_MOSEPH", "FLG_SPEED"],
  expectedEphemerisDataRevision: null
};

const inputDraft = {
  ownerUserId: "11111111-1111-4111-8111-111111111111",
  clientId: "22222222-2222-4222-8222-222222222222",
  interpretationMode: "adult_natal" as const,
  methodVersion: chartMethodVersions.natal,
  executionProfile,
  participants: [{ role: "subject" as const, clientId: "22222222-2222-4222-8222-222222222222" }],
  maxAttempts: 3,
  targetCalculationId: null,
  expectedSourceChecksum: null,
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
const input = {
  ...inputDraft,
  inputFingerprint: fingerprintFor("natal", inputDraft)
};

describe("createNatalChartJob", () => {
  it("delegates method-aware transit snapshots to the job store", async () => {
    const transitDraft = {
      ...input,
      method: "transit" as const,
      interpretationMode: "legacy_unclassified" as const,
      methodVersion: chartMethodVersions.transit,
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
    const transitInput = {
      ...transitDraft,
      inputFingerprint: fingerprintFor("transit", transitDraft)
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
    const synastryDraft = {
      ...input,
      method: "synastry" as const,
      interpretationMode: "legacy_unclassified" as const,
      methodVersion: chartMethodVersions.synastry,
      participants: [
        { role: "subject" as const, clientId: input.clientId },
        { role: "partner" as const, clientId: "44444444-4444-4444-8444-444444444444" }
      ],
      inputSnapshot: {
        inputSnapshot: input.inputSnapshot,
        partnerInputSnapshot: {
          birthDate: "1992-08-11",
          birthTime: "22:15",
          timezone: "Europe/Moscow",
          latitude: 55.7558,
          longitude: 37.6173,
          birthTimePrecision: "exact"
        }
      }
    };
    const synastryInput = {
      ...synastryDraft,
      inputFingerprint: fingerprintFor("synastry", synastryDraft)
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

  it("delegates method-aware composite snapshots to the job store", async () => {
    const compositeDraft = {
      ...input,
      method: "composite" as const,
      interpretationMode: "legacy_unclassified" as const,
      methodVersion: chartMethodVersions.composite,
      participants: [
        { role: "subject" as const, clientId: input.clientId },
        { role: "partner" as const, clientId: "44444444-4444-4444-8444-444444444444" }
      ],
      inputSnapshot: {
        inputSnapshot: input.inputSnapshot,
        partnerInputSnapshot: {
          birthDate: "1992-08-11",
          birthTime: "22:15",
          timezone: "Europe/Moscow",
          latitude: 55.7558,
          longitude: 37.6173,
          birthTimePrecision: "exact"
        }
      }
    };
    const compositeInput = {
      ...compositeDraft,
      inputFingerprint: fingerprintFor("composite", compositeDraft)
    };
    const store: ChartCalculationJobStore = {
      createOrReuseChartJob: async (received) => {
        expect(received).toEqual(compositeInput);
        return { kind: "active_job", jobId: "33333333-3333-4333-8333-333333333333" };
      },
      createOrReuseNatalJob: async () => {
        throw new Error("natal-specific store should not be called");
      },
      getOwnerScopedJob: async () => null,
      getOwnerScopedResult: async () => null
    };

    await expect(createChartJob({ store, ...compositeInput })).resolves.toEqual({
      kind: "active_job",
      jobId: "33333333-3333-4333-8333-333333333333"
    });
  });

  it("delegates method-aware solar return snapshots to the job store", async () => {
    const solarReturnDraft = {
      ...input,
      method: "solar_return" as const,
      interpretationMode: "legacy_unclassified" as const,
      methodVersion: chartMethodVersions.solar_return,
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
    const solarReturnInput = {
      ...solarReturnDraft,
      inputFingerprint: fingerprintFor("solar_return", solarReturnDraft)
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
    const result = { schemaVersion: "chart-result.v2" } as ReproducibleChartResult;
    const store: ChartCalculationJobStore = {
      createOrReuseChartJob: async () => {
        throw new Error("generic store should not be called");
      },
      createOrReuseNatalJob: async () => ({
        kind: "existing_result",
        calculationId: "44444444-4444-4444-8444-444444444444",
        result
      }),
      getOwnerScopedJob: async () => null,
      getOwnerScopedResult: async () => null
    };

    await expect(createNatalChartJob({ store, ...input })).resolves.toEqual({
      kind: "existing_result",
      calculationId: "44444444-4444-4444-8444-444444444444",
      result
    });
  });

  it.each([
    {
      name: "a method-version mismatch",
      patch: { methodVersion: chartMethodVersions.transit },
      message: "CHART_METHOD_VERSION_MISMATCH"
    },
    {
      name: "a non-positive retry limit",
      patch: { maxAttempts: 0 },
      message: "CHART_JOB_MAX_ATTEMPTS_INVALID"
    },
    {
      name: "a legacy interpretation mode on a new natal job",
      patch: { interpretationMode: "legacy_unclassified" },
      message: "CHART_NATAL_INTERPRETATION_MODE_INVALID"
    },
    {
      name: "a syntactically valid but non-canonical request fingerprint",
      patch: { inputFingerprint: `sha256:${"f".repeat(64)}` },
      message: "CHART_JOB_FINGERPRINT_MISMATCH"
    },
    {
      name: "a replacement target without its checksum",
      patch: { targetCalculationId: "55555555-5555-4555-8555-555555555555" },
      message: "CHART_JOB_REPLACEMENT_PAIR_INVALID"
    },
    {
      name: "a partner on an individual method",
      patch: {
        participants: [
          { role: "subject" as const, clientId: input.clientId },
          { role: "partner" as const, clientId: "44444444-4444-4444-8444-444444444444" }
        ]
      },
      message: "CHART_JOB_PARTICIPANTS_INVALID"
    },
    {
      name: "a non-canonical participant UUID",
      patch: {
        participants: [
          { role: "subject" as const, clientId: "22222222-2222-4222-8222-22222222222A" }
        ]
      },
      message: "CHART_JOB_PARTICIPANTS_INVALID"
    }
  ])("rejects $name before invoking persistence", async ({ patch, message }) => {
    const store = createStore();

    await expect(
      createChartJob({ store, method: "natal", ...input, ...patch } as never)
    ).rejects.toThrow(message);
    expect(store.createOrReuseChartJob).not.toHaveBeenCalled();
  });

  it("requires ordered distinct subject and partner participants for relationship jobs", async () => {
    const store = createStore();

    await expect(
      createChartJob({
        store,
        ...input,
        method: "synastry",
        interpretationMode: "legacy_unclassified",
        methodVersion: chartMethodVersions.synastry,
        participants: [
          { role: "partner", clientId: "44444444-4444-4444-8444-444444444444" },
          { role: "subject", clientId: input.clientId }
        ]
      } as never)
    ).rejects.toThrow("CHART_JOB_PARTICIPANTS_INVALID");
    expect(store.createOrReuseChartJob).not.toHaveBeenCalled();
  });
});

function createStore(): ChartCalculationJobStore {
  return {
    createOrReuseChartJob: vi.fn(async () => ({ kind: "active_job", jobId: "job" }) as const),
    createOrReuseNatalJob: vi.fn(async () => ({ kind: "active_job", jobId: "job" }) as const),
    getOwnerScopedJob: vi.fn(async () => null),
    getOwnerScopedResult: vi.fn(async () => null)
  };
}

function fingerprintFor(
  method: keyof typeof chartMethodVersions,
  value: Omit<CreateOrReuseChartJobInput, "method" | "inputFingerprint">
): `sha256:${string}` {
  return buildChartJobRequestFingerprint({
    ownerUserId: value.ownerUserId,
    method,
    methodVersion: value.methodVersion,
    executionProfile: value.executionProfile,
    settings: value.settingsSnapshot as CanonicalJson,
    inputSnapshot: value.inputSnapshot as CanonicalJson,
    participants: value.participants,
    interpretationMode: value.interpretationMode,
    targetCalculationId: value.targetCalculationId,
    expectedSourceChecksum: value.expectedSourceChecksum
  });
}
