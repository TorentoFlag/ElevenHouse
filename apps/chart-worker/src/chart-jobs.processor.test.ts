import { describe, expect, it, vi } from "vitest";
import { UnrecoverableError } from "bullmq";
import { ChartEnginePermanentError } from "@elevenhouse/chart-engine-client";
import { processChartCalculationJob, type ChartEngineClient } from "./chart-jobs.processor";

const job = {
  id: "00000000-0000-4000-8000-000000000001",
  ownerUserId: "11111111-1111-4111-8111-111111111111",
  clientId: "22222222-2222-4222-8222-222222222222",
  method: "natal",
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

const transitJob = {
  ...job,
  method: "transit",
  settingsSnapshot: job.settingsSnapshot,
  inputSnapshot: {
    inputSnapshot: job.inputSnapshot,
    transitSnapshot: {
      date: "2026-07-22",
      time: "14:30",
      timezone: "Europe/Rome",
      latitude: 41.9,
      longitude: 12.49
    }
  }
} as const;

const synastryJob = {
  ...job,
  method: "synastry",
  settingsSnapshot: job.settingsSnapshot,
  inputSnapshot: {
    inputSnapshot: job.inputSnapshot,
    partnerInputSnapshot: {
      birthDate: "1992-08-11",
      birthTime: "22:15",
      timezone: "Europe/Moscow",
      latitude: 55.7558,
      longitude: 37.6173,
      birthTimePrecision: "exact"
    },
    relationshipSnapshot: {
      primaryClientId: job.clientId,
      partnerClientId: "44444444-4444-4444-8444-444444444444"
    }
  }
} as const;

const solarReturnJob = {
  ...job,
  method: "solar_return",
  settingsSnapshot: job.settingsSnapshot,
  inputSnapshot: {
    inputSnapshot: job.inputSnapshot,
    solarReturnSnapshot: {
      year: 2026,
      returnType: "solar",
      location: {
        timezone: "Europe/Rome",
        latitude: 41.9,
        longitude: 12.49
      }
    }
  }
} as const;

const progressionJob = {
  ...job,
  method: "progression",
  settingsSnapshot: job.settingsSnapshot,
  inputSnapshot: {
    inputSnapshot: job.inputSnapshot,
    progressionSnapshot: {
      targetDate: "2026-07-23",
      progressionType: "secondary"
    }
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

const transitResult = {
  schemaVersion: "chart-result.v1",
  method: "transit",
  provider: result.provider,
  settings: job.settingsSnapshot,
  inputSnapshot: job.inputSnapshot,
  transitSnapshot: transitJob.inputSnapshot.transitSnapshot,
  result: {
    natal: result.result,
    transit: result.result,
    aspectsToNatal: [
      {
        transitPoint: "jupiter",
        natalPoint: "sun",
        type: "trine",
        angle: 120,
        orb: 1,
        applying: true,
        strength: 0.8
      }
    ],
    warnings: []
  }
} as const;

const synastryResult = {
  schemaVersion: "chart-result.v1",
  method: "synastry",
  provider: result.provider,
  settings: job.settingsSnapshot,
  inputSnapshot: job.inputSnapshot,
  partnerInputSnapshot: synastryJob.inputSnapshot.partnerInputSnapshot,
  relationshipSnapshot: synastryJob.inputSnapshot.relationshipSnapshot,
  result: {
    primary: result.result,
    partner: result.result,
    aspectsBetween: [
      {
        primaryPoint: "sun",
        partnerPoint: "moon",
        type: "trine",
        angle: 120,
        orb: 1,
        applying: null,
        strength: 0.8
      }
    ],
    houseOverlays: [
      {
        owner: "primary",
        point: "venus",
        projectedHouseOwner: "partner",
        projectedHouse: 7
      }
    ],
    warnings: []
  }
} as const;

const solarReturnResult = {
  schemaVersion: "chart-result.v1",
  method: "solar_return",
  provider: result.provider,
  settings: job.settingsSnapshot,
  inputSnapshot: job.inputSnapshot,
  solarReturnSnapshot: {
    ...solarReturnJob.inputSnapshot.solarReturnSnapshot,
    resolvedAt: "2026-07-15T01:20:01.000Z"
  },
  result: {
    natal: result.result,
    solarReturn: result.result,
    aspectsToNatal: [
      {
        solarReturnPoint: "sun",
        natalPoint: "sun",
        type: "conjunction",
        angle: 0,
        orb: 0.01,
        applying: true,
        strength: 0.99
      }
    ],
    warnings: []
  }
} as const;

const progressionResult = {
  schemaVersion: "chart-result.v1",
  method: "progression",
  provider: result.provider,
  settings: job.settingsSnapshot,
  inputSnapshot: job.inputSnapshot,
  progressionSnapshot: {
    ...progressionJob.inputSnapshot.progressionSnapshot,
    calculationBasis: {
      symbolicDate: "1990-08-20",
      ageDays: 36,
      dayForYearRatio: 1
    }
  },
  result: {
    natal: result.result,
    progressed: result.result,
    aspectsToNatal: [
      {
        progressedPoint: "moon",
        natalPoint: "sun",
        type: "trine",
        angle: 120,
        orb: 1,
        applying: true,
        strength: 0.8
      }
    ],
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
    const engine = createEngine({ calculateNatal: vi.fn().mockResolvedValue(result) });

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

  it("dispatches transit jobs to the transit provider endpoint", async () => {
    const store = {
      findByJobId: vi.fn().mockResolvedValue(transitJob),
      claimForProcessing: vi.fn().mockResolvedValue(transitJob),
      complete: vi.fn().mockResolvedValue(true),
      fail: vi.fn()
    };
    const engine = createEngine({ calculateTransit: vi.fn().mockResolvedValue(transitResult) });

    await processChartCalculationJob({
      jobId: transitJob.id,
      finalAttempt: false,
      store,
      engine,
      now: new Date("2026-07-22T12:00:00.000Z")
    });

    expect(engine.calculateNatal).not.toHaveBeenCalled();
    expect(engine.calculateTransit).toHaveBeenCalledWith({
      schemaVersion: "chart-request.v1",
      method: "transit",
      settings: transitJob.settingsSnapshot,
      inputSnapshot: job.inputSnapshot,
      transitSnapshot: transitJob.inputSnapshot.transitSnapshot
    });
    expect(store.complete).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: transitJob.id, result: transitResult })
    );
  });

  it("dispatches synastry jobs to the synastry provider endpoint", async () => {
    const store = {
      findByJobId: vi.fn().mockResolvedValue(synastryJob),
      claimForProcessing: vi.fn().mockResolvedValue(synastryJob),
      complete: vi.fn().mockResolvedValue(true),
      fail: vi.fn()
    };
    const engine = createEngine({ calculateSynastry: vi.fn().mockResolvedValue(synastryResult) });

    await processChartCalculationJob({
      jobId: synastryJob.id,
      finalAttempt: false,
      store,
      engine,
      now: new Date("2026-07-22T12:00:00.000Z")
    });

    expect(engine.calculateNatal).not.toHaveBeenCalled();
    expect(engine.calculateTransit).not.toHaveBeenCalled();
    expect(engine.calculateSynastry).toHaveBeenCalledWith({
      schemaVersion: "chart-request.v1",
      method: "synastry",
      settings: synastryJob.settingsSnapshot,
      inputSnapshot: job.inputSnapshot,
      partnerInputSnapshot: synastryJob.inputSnapshot.partnerInputSnapshot,
      relationshipSnapshot: synastryJob.inputSnapshot.relationshipSnapshot
    });
    expect(store.complete).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: synastryJob.id, result: synastryResult })
    );
  });

  it("dispatches solar return jobs to the solar return provider endpoint", async () => {
    const store = {
      findByJobId: vi.fn().mockResolvedValue(solarReturnJob),
      claimForProcessing: vi.fn().mockResolvedValue(solarReturnJob),
      complete: vi.fn().mockResolvedValue(true),
      fail: vi.fn()
    };
    const engine = createEngine({
      calculateSolarReturn: vi.fn().mockResolvedValue(solarReturnResult)
    });

    await processChartCalculationJob({
      jobId: solarReturnJob.id,
      finalAttempt: false,
      store,
      engine,
      now: new Date("2026-07-22T12:00:00.000Z")
    });

    expect(engine.calculateNatal).not.toHaveBeenCalled();
    expect(engine.calculateTransit).not.toHaveBeenCalled();
    expect(engine.calculateSynastry).not.toHaveBeenCalled();
    expect(engine.calculateSolarReturn).toHaveBeenCalledWith({
      schemaVersion: "chart-request.v1",
      method: "solar_return",
      settings: solarReturnJob.settingsSnapshot,
      inputSnapshot: job.inputSnapshot,
      solarReturnSnapshot: solarReturnJob.inputSnapshot.solarReturnSnapshot
    });
    expect(store.complete).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: solarReturnJob.id, result: solarReturnResult })
    );
  });

  it("dispatches progression jobs to the progression provider endpoint", async () => {
    const store = {
      findByJobId: vi.fn().mockResolvedValue(progressionJob),
      claimForProcessing: vi.fn().mockResolvedValue(progressionJob),
      complete: vi.fn().mockResolvedValue(true),
      fail: vi.fn()
    };
    const engine = createEngine({
      calculateProgression: vi.fn().mockResolvedValue(progressionResult)
    });

    await processChartCalculationJob({
      jobId: progressionJob.id,
      finalAttempt: false,
      store,
      engine,
      now: new Date("2026-07-22T12:00:00.000Z")
    });

    expect(engine.calculateNatal).not.toHaveBeenCalled();
    expect(engine.calculateTransit).not.toHaveBeenCalled();
    expect(engine.calculateSynastry).not.toHaveBeenCalled();
    expect(engine.calculateSolarReturn).not.toHaveBeenCalled();
    expect(engine.calculateProgression).toHaveBeenCalledWith({
      schemaVersion: "chart-request.v1",
      method: "progression",
      settings: progressionJob.settingsSnapshot,
      inputSnapshot: job.inputSnapshot,
      progressionSnapshot: progressionJob.inputSnapshot.progressionSnapshot
    });
    expect(store.complete).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: progressionJob.id, result: progressionResult })
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
      engine: createEngine(),
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
        engine: createEngine({ calculateNatal: vi.fn().mockRejectedValue(error) }),
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
        engine: createEngine({
          calculateNatal: vi
            .fn()
            .mockRejectedValue(new ChartEnginePermanentError("Invalid chart result"))
        }),
        now: new Date("2026-07-20T12:00:00.000Z")
      })
    ).rejects.toBeInstanceOf(UnrecoverableError);
    expect(store.fail).toHaveBeenCalledWith(
      expect.objectContaining({ code: "provider_invalid_result" })
    );
  });
});

function createEngine(overrides: Partial<ChartEngineClient> = {}): ChartEngineClient {
  return {
    calculateNatal: vi.fn(),
    calculateTransit: vi.fn(),
    calculateSynastry: vi.fn(),
    calculateSolarReturn: vi.fn(),
    calculateProgression: vi.fn(),
    ...overrides
  };
}
