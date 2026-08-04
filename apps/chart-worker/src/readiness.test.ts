import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChartExecutionProfile } from "@elevenhouse/contracts";
import { createWorkerReadiness } from "./readiness";

const executionProfile: ChartExecutionProfile = {
  provider: "kerykeion",
  kerykeionVersion: "5.12.9",
  pyswissephVersion: "2.10.3.2",
  expectedEphemeris: "moshier",
  expectedEphemerisFlags: ["FLG_MOSEPH", "FLG_SPEED"],
  expectedEphemerisDataRevision: null
};

const engineReadiness = {
  service: "chart-engine",
  status: "ready",
  provider: {
    name: "kerykeion",
    version: "5.12.9",
    pyswissephVersion: "2.10.3.2",
    ephemeris: "moshier",
    ephemerisFlags: ["FLG_SPEED", "FLG_MOSEPH"],
    ephemerisDataRevision: null
  },
  capabilities: [
    "natal",
    "astrocartography",
    "transit",
    "synastry",
    "composite",
    "solar_return",
    "progression",
    "horary",
    "planetary_positions",
    "astro_calendar"
  ]
} as const;

afterEach(() => {
  vi.useRealTimers();
});

describe("chart-worker readiness", () => {
  it("returns a deterministic readiness payload", async () => {
    await expect(
      createWorkerReadiness({
        service: "chart-worker",
        now: new Date("2026-06-09T00:00:00.000Z"),
        acceptingWork: true,
        checkTimeoutMs: 1_000,
        expectedExecutionProfile: executionProfile,
        checks: {
          postgres: async () => {},
          chartCalculationQueue: async () => {},
          chartCalculationWorker: async () => {},
          chartEngine: async () => engineReadiness
        }
      })
    ).resolves.toEqual({
      service: "chart-worker",
      status: "ready",
      timestamp: "2026-06-09T00:00:00.000Z",
      dependencies: {
        postgres: { status: "ready" },
        chartCalculationQueue: { status: "ready" },
        chartCalculationWorker: { status: "ready" },
        chartEngine: { status: "ready" }
      }
    });
  });

  it("is unready when actual provider metadata differs from the worker profile", async () => {
    const readiness = await createWorkerReadiness({
      service: "chart-worker",
      now: new Date("2026-06-09T00:00:00.000Z"),
      acceptingWork: true,
      checkTimeoutMs: 1_000,
      expectedExecutionProfile: executionProfile,
      checks: {
        postgres: async () => {},
        chartCalculationQueue: async () => {},
        chartCalculationWorker: async () => {},
        chartEngine: async () => ({
          ...engineReadiness,
          provider: { ...engineReadiness.provider, version: "5.13.0" }
        })
      }
    });

    expect(readiness.status).toBe("unready");
    expect(readiness.dependencies.chartEngine).toEqual({
      status: "unready",
      error: "Chart engine readiness profile does not match worker execution profile"
    });
  });

  it("is unready when chart-engine omits required provider metadata", async () => {
    const incompleteProvider = {
      name: engineReadiness.provider.name,
      version: engineReadiness.provider.version,
      ephemeris: engineReadiness.provider.ephemeris,
      ephemerisFlags: engineReadiness.provider.ephemerisFlags,
      ephemerisDataRevision: engineReadiness.provider.ephemerisDataRevision
    };
    const readiness = await createWorkerReadiness({
      service: "chart-worker",
      now: new Date("2026-06-09T00:00:00.000Z"),
      acceptingWork: true,
      checkTimeoutMs: 1_000,
      expectedExecutionProfile: executionProfile,
      checks: {
        postgres: async () => {},
        chartCalculationQueue: async () => {},
        chartCalculationWorker: async () => {},
        chartEngine: async () => ({ ...engineReadiness, provider: incompleteProvider })
      }
    });

    expect(readiness.status).toBe("unready");
    expect(readiness.dependencies.chartEngine.status).toBe("unready");
  });

  it("does not expose raw dependency errors through readiness", async () => {
    const sensitive = "DrizzleQueryError select input_data params=[birthSnapshot]";
    const readiness = await createWorkerReadiness({
      service: "chart-worker",
      now: new Date("2026-06-09T00:00:00.000Z"),
      acceptingWork: true,
      checkTimeoutMs: 1_000,
      expectedExecutionProfile: executionProfile,
      checks: {
        postgres: async () => {
          throw new Error(sensitive);
        },
        chartCalculationQueue: async () => {},
        chartCalculationWorker: async () => {},
        chartEngine: async () => engineReadiness
      }
    });

    expect(readiness.dependencies.postgres).toEqual({
      status: "unready",
      error: "PostgreSQL readiness check failed"
    });
    expect(JSON.stringify(readiness)).not.toContain(sensitive);
  });

  it("is unready while the runtime is not accepting Bull work", async () => {
    const readiness = await createWorkerReadiness({
      service: "chart-worker",
      now: new Date("2026-06-09T00:00:00.000Z"),
      acceptingWork: false,
      checkTimeoutMs: 1_000,
      expectedExecutionProfile: executionProfile,
      checks: {
        postgres: async () => {},
        chartCalculationQueue: async () => {},
        chartCalculationWorker: async () => {},
        chartEngine: async () => engineReadiness
      }
    });

    expect(readiness.status).toBe("unready");
    expect(readiness.dependencies.chartCalculationWorker).toEqual({
      status: "unready",
      error: "Chart worker is not accepting work"
    });
  });

  it("bounds every dependency check", async () => {
    vi.useFakeTimers();
    const pending = createWorkerReadiness({
      service: "chart-worker",
      now: new Date("2026-06-09T00:00:00.000Z"),
      acceptingWork: true,
      checkTimeoutMs: 100,
      expectedExecutionProfile: executionProfile,
      checks: {
        postgres: () => new Promise<void>(() => undefined),
        chartCalculationQueue: async () => {},
        chartCalculationWorker: async () => {},
        chartEngine: async () => engineReadiness
      }
    });

    await vi.advanceTimersByTimeAsync(100);

    await expect(pending).resolves.toMatchObject({
      status: "unready",
      dependencies: {
        postgres: { status: "unready", error: "PostgreSQL readiness check failed" }
      }
    });
  });
});
