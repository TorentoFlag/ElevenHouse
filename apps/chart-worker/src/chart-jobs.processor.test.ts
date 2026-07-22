import { describe, expect, it, vi } from "vitest";
import { UnrecoverableError } from "bullmq";
import { ChartEnginePermanentError } from "@elevenhouse/chart-engine-client";
import { processChartCalculationJob } from "./chart-jobs.processor";

const job = {
  id: "00000000-0000-4000-8000-000000000001",
  ownerUserId: "11111111-1111-4111-8111-111111111111",
  clientId: "22222222-2222-4222-8222-222222222222",
  status: "queued",
  inputSnapshot: {
    birthDate: "1990-07-15",
    birthTime: "10:30",
    timezone: "Europe/Rome",
    latitude: 41.9,
    longitude: 12.49,
    birthTimePrecision: "exact"
  },
  settingsSnapshot: {
    zodiac: "tropical",
    houseSystem: "placidus",
    nodeType: "true",
    aspectPreset: "major",
    orbMultiplier: 1
  }
} as const;

const result = {
  schemaVersion: "chart-result.v1",
  method: "natal",
  provider: { name: "kerykeion", version: "5.12.9", ephemeris: "swiss-ephemeris" },
  settings: job.settingsSnapshot,
  inputSnapshot: job.inputSnapshot,
  result: {
    points: [],
    houses: [],
    aspects: [],
    distributions: { elements: {}, modalities: {}, polarity: {} },
    warnings: []
  }
} as const;

describe("processChartCalculationJob", () => {
  it("loads input snapshot from DB and persists canonical result", async () => {
    const store = {
      findByJobId: vi.fn().mockResolvedValue(job),
      claimForProcessing: vi.fn().mockResolvedValue(job),
      complete: vi.fn().mockResolvedValue(true),
      fail: vi.fn()
    };
    const engine = { calculateNatal: vi.fn().mockResolvedValue(result) };

    await processChartCalculationJob({
      jobId: job.id,
      finalAttempt: false,
      store,
      engine,
      now: new Date("2026-07-20T12:00:00.000Z")
    });

    expect(engine.calculateNatal).toHaveBeenCalledWith({
      schemaVersion: "chart-request.v1",
      method: "natal",
      settings: job.settingsSnapshot,
      inputSnapshot: job.inputSnapshot
    });
    expect(store.complete).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: job.id, result })
    );
  });

  it("treats already succeeded jobs as no-op", async () => {
    const store = {
      findByJobId: vi.fn().mockResolvedValue({ ...job, status: "succeeded" }),
      claimForProcessing: vi.fn(),
      complete: vi.fn(),
      fail: vi.fn()
    };

    await processChartCalculationJob({
      jobId: job.id,
      finalAttempt: false,
      store,
      engine: { calculateNatal: vi.fn() },
      now: new Date()
    });

    expect(store.claimForProcessing).not.toHaveBeenCalled();
  });

  it("throws retryable HTTP failures until final attempt", async () => {
    const error = new Error("CHART_ENGINE_HTTP_503");
    const store = {
      findByJobId: vi.fn().mockResolvedValue(job),
      claimForProcessing: vi.fn().mockResolvedValue(job),
      complete: vi.fn(),
      fail: vi.fn()
    };

    await expect(
      processChartCalculationJob({
        jobId: job.id,
        finalAttempt: false,
        store,
        engine: { calculateNatal: vi.fn().mockRejectedValue(error) },
        now: new Date()
      })
    ).rejects.toBe(error);
    expect(store.fail).not.toHaveBeenCalled();
  });

  it("marks permanent validation failures without retry", async () => {
    const store = {
      findByJobId: vi.fn().mockResolvedValue(job),
      claimForProcessing: vi.fn().mockResolvedValue(job),
      complete: vi.fn(),
      fail: vi.fn().mockResolvedValue(true)
    };

    await expect(
      processChartCalculationJob({
        jobId: job.id,
        finalAttempt: false,
        store,
        engine: {
          calculateNatal: vi
            .fn()
            .mockRejectedValue(new ChartEnginePermanentError("Invalid chart result"))
        },
        now: new Date("2026-07-20T12:00:00.000Z")
      })
    ).rejects.toBeInstanceOf(UnrecoverableError);
    expect(store.fail).toHaveBeenCalledWith(
      expect.objectContaining({ code: "provider_invalid_result" })
    );
  });
});
