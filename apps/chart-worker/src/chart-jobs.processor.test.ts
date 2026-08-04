import { afterEach, describe, expect, it, vi } from "vitest";
import {
  chartMethodVersions,
  type ChartExecutionProfile,
  type ReproducibleChartResult
} from "@elevenhouse/contracts";
import {
  ChartEngineCancelledError,
  ChartEngineConfigurationError,
  ChartEnginePermanentError,
  ChartEngineTransientError
} from "@elevenhouse/chart-engine-client";
import {
  ChartCalculationCompletionError,
  ChartCalculationReplacementError,
  chartCalculationReplacementErrorCodes,
  type ChartJobForProcessing,
  type ChartJobProcessingStore
} from "@elevenhouse/domain";
import { DelayedError, UnrecoverableError } from "bullmq";
import type { Logger } from "@elevenhouse/observability";
import {
  processChartCalculationJob as processChartCalculationJobImplementation,
  type ChartEngineClient
} from "./chart-jobs.processor";

const executionProfile: ChartExecutionProfile = {
  provider: "kerykeion",
  kerykeionVersion: "5.12.9",
  pyswissephVersion: "2.10.3.2",
  expectedEphemeris: "moshier",
  expectedEphemerisFlags: ["FLG_MOSEPH", "FLG_SPEED"],
  expectedEphemerisDataRevision: null
};

const inputSnapshot = {
  birthDate: "1990-07-15",
  birthTime: "10:30",
  timezone: "Europe/Rome",
  latitude: 41.9,
  longitude: 12.49,
  birthTimePrecision: "exact"
} as const;

const settings = {
  zodiac: "tropical",
  houseSystem: "placidus",
  nodeType: "true",
  aspectPreset: "major",
  orbMultiplier: 1
} as const;

const partnerInputSnapshot = {
  ...inputSnapshot,
  birthDate: "1992-08-11",
  birthTime: "22:15",
  timezone: "Europe/Moscow",
  latitude: 55.7558,
  longitude: 37.6173
} as const;

const transitSnapshot = {
  date: "2026-10-25",
  time: "02:30",
  timezone: "Europe/Rome",
  latitude: 41.9,
  longitude: 12.49,
  dstOccurrence: "second"
} as const;

const solarReturnSnapshot = {
  year: 2026,
  returnType: "solar",
  location: {
    timezone: "Europe/Rome",
    latitude: 41.9,
    longitude: 12.49
  }
} as const;

const progressionSnapshot = {
  targetDate: "2026-08-03",
  progressionType: "secondary"
} as const;

const questionSnapshot = {
  question: "Стоит ли принимать предложение?",
  category: "career",
  date: "2026-10-25",
  time: "02:30",
  timezone: "Europe/Rome",
  latitude: 41.9,
  longitude: 12.49,
  dstOccurrence: "first"
} as const;

const result = {
  schemaVersion: "chart-result.v2",
  method: "natal",
  methodVersion: chartMethodVersions.natal,
  provider: {
    name: "kerykeion",
    version: "5.12.9",
    pyswissephVersion: "2.10.3.2",
    ephemeris: "moshier",
    ephemerisFlags: ["FLG_MOSEPH", "FLG_SPEED"],
    ephemerisDataRevision: null
  },
  reproducibilityFingerprint: `sha256:${"a".repeat(64)}`,
  settings,
  inputSnapshot,
  result: { fixture: "natal" }
} as unknown as ReproducibleChartResult;

afterEach(() => {
  vi.useRealTimers();
});

type ChartProcessorInput = Parameters<typeof processChartCalculationJobImplementation>[0];
type ChartProcessorTestInput = Omit<
  ChartProcessorInput,
  "storageOperationTimeoutMs" | "retryDelayMs" | "retryJitter" | "delivery" | "logger"
> &
  Partial<
    Pick<
      ChartProcessorInput,
      "storageOperationTimeoutMs" | "retryDelayMs" | "retryJitter" | "delivery"
    >
  > & { readonly logger?: Logger };

function processChartCalculationJob(input: ChartProcessorTestInput): Promise<void> {
  const {
    storageOperationTimeoutMs = 10,
    retryDelayMs = 1_000,
    retryJitter = 0,
    delivery = createDelivery(),
    logger = createLogger(),
    ...required
  } = input;
  return processChartCalculationJobImplementation({
    ...required,
    storageOperationTimeoutMs,
    retryDelayMs,
    retryJitter,
    delivery,
    logger
  } as ChartProcessorInput);
}

describe("processChartCalculationJob", () => {
  it("logs a safe terminal success with method, durable attempt and lease fence metadata", async () => {
    const sensitive = "PRIVATE_BIRTH_1990-07-15_HORARY_QUESTION_PROVIDER_RESULT";
    const job = createClaimedJob();
    const store = createStore(job);
    const engine = createEngine({
      calculateNatal: vi.fn().mockResolvedValue({ ...result, privateMarker: sensitive })
    });
    const logger = createLogger();

    await processChartCalculationJob({
      jobId: job.id,
      workerId: "chart-worker:test-process",
      leaseMs: 60_000,
      calculationTimeoutMs: 120_000,
      shutdownSignal: new AbortController().signal,
      store,
      engine,
      logger
    });

    expect(logger.info).toHaveBeenCalledWith("chart calculation job processed", {
      durableAttempt: 1,
      durationMs: expect.any(Number),
      jobId: job.id,
      leaseExpiresAt: "2026-08-03T12:01:00.000Z",
      leaseGeneration: 7,
      maxAttempts: 3,
      method: "natal",
      outcome: "succeeded",
      retryScheduled: false
    });
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain(sensitive);
  });

  it("logs only a fixed safe failure code when a provider diagnostic causes a durable retry", async () => {
    const sensitive = "PRIVATE_PROVIDER_BODY_BIRTH_DATE_COORDINATES_AND_QUESTION";
    const job = createClaimedJob();
    const store = createStore(job);
    vi.mocked(store.recordAttemptFailure).mockResolvedValue({
      kind: "requeued",
      attempts: 1,
      maxAttempts: 3
    });
    const logger = createLogger();

    await processChartCalculationJob({
      jobId: job.id,
      workerId: "chart-worker:test-process",
      leaseMs: 60_000,
      calculationTimeoutMs: 120_000,
      shutdownSignal: new AbortController().signal,
      store,
      engine: createEngine({
        calculateNatal: vi.fn().mockRejectedValue(new Error(sensitive))
      }),
      logger
    });

    expect(logger.warn).toHaveBeenCalledWith("chart calculation job processed", {
      durableAttempt: 1,
      durationMs: expect.any(Number),
      errorCode: "chart_provider_transient_failure",
      jobId: job.id,
      leaseExpiresAt: "2026-08-03T12:01:00.000Z",
      leaseGeneration: 7,
      maxAttempts: 3,
      method: "natal",
      outcome: "retry_scheduled",
      retryScheduled: true
    });
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(sensitive);
  });

  it("reconstructs a strict natal v2 request from the durable claim and completes with its fence", async () => {
    const job = createClaimedJob();
    const store = createStore(job);
    const engine = createEngine({ calculateNatal: vi.fn().mockResolvedValue(result) });

    await processChartCalculationJob({
      jobId: job.id,
      workerId: "chart-worker:test-process",
      leaseMs: 60_000,
      calculationTimeoutMs: 120_000,
      shutdownSignal: new AbortController().signal,
      store,
      engine
    });

    expect(store.claimForProcessing).toHaveBeenCalledWith({
      jobId: job.id,
      workerId: "chart-worker:test-process",
      leaseMs: 60_000
    });
    expect(engine.checkReady).toHaveBeenCalledWith({
      expectedProfile: executionProfile,
      signal: expect.any(AbortSignal)
    });
    expect(engine.checkReady.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(store.claimForProcessing).mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY
    );
    expect(engine.calculateNatal).toHaveBeenCalledWith(
      {
        schemaVersion: "chart-request.v2",
        method: "natal",
        methodVersion: chartMethodVersions.natal,
        executionProfile,
        settings,
        inputSnapshot
      },
      { signal: expect.any(AbortSignal) }
    );
    expect(vi.mocked(engine.calculateNatal).mock.calls[0]?.[0]).not.toHaveProperty(
      "interpretationMode"
    );
    expect(store.complete).toHaveBeenCalledWith({
      jobId: job.id,
      workerId: "chart-worker:test-process",
      leaseGeneration: 7,
      result,
      resultChecksum: expect.stringMatching(/^sha256:[a-f0-9]{64}$/)
    });
  });

  it.each([
    {
      method: "transit" as const,
      methodVersion: chartMethodVersions.transit,
      engineMethod: "calculateTransit" as const,
      storedSnapshot: { inputSnapshot, transitSnapshot },
      expectedRequest: {
        schemaVersion: "chart-request.v2",
        method: "transit",
        methodVersion: chartMethodVersions.transit,
        executionProfile,
        settings,
        inputSnapshot,
        transitSnapshot
      }
    },
    {
      method: "synastry" as const,
      methodVersion: chartMethodVersions.synastry,
      engineMethod: "calculateSynastry" as const,
      storedSnapshot: { inputSnapshot, partnerInputSnapshot },
      expectedRequest: {
        schemaVersion: "chart-request.v2",
        method: "synastry",
        methodVersion: chartMethodVersions.synastry,
        executionProfile,
        settings,
        inputSnapshot,
        partnerInputSnapshot
      }
    },
    {
      method: "composite" as const,
      methodVersion: chartMethodVersions.composite,
      engineMethod: "calculateComposite" as const,
      storedSnapshot: { inputSnapshot, partnerInputSnapshot },
      expectedRequest: {
        schemaVersion: "chart-request.v2",
        method: "composite",
        methodVersion: chartMethodVersions.composite,
        executionProfile,
        settings,
        inputSnapshot,
        partnerInputSnapshot
      }
    },
    {
      method: "solar_return" as const,
      methodVersion: chartMethodVersions.solar_return,
      engineMethod: "calculateSolarReturn" as const,
      storedSnapshot: { inputSnapshot, solarReturnSnapshot },
      expectedRequest: {
        schemaVersion: "chart-request.v2",
        method: "solar_return",
        methodVersion: chartMethodVersions.solar_return,
        executionProfile,
        settings,
        inputSnapshot,
        solarReturnSnapshot
      }
    },
    {
      method: "progression" as const,
      methodVersion: chartMethodVersions.progression,
      engineMethod: "calculateProgression" as const,
      storedSnapshot: { inputSnapshot, progressionSnapshot },
      expectedRequest: {
        schemaVersion: "chart-request.v2",
        method: "progression",
        methodVersion: chartMethodVersions.progression,
        executionProfile,
        settings,
        inputSnapshot,
        progressionSnapshot
      }
    },
    {
      method: "horary" as const,
      methodVersion: chartMethodVersions.horary,
      engineMethod: "calculateHorary" as const,
      storedSnapshot: { questionSnapshot },
      expectedRequest: {
        schemaVersion: "chart-request.v2",
        method: "horary",
        methodVersion: chartMethodVersions.horary,
        executionProfile,
        settings,
        questionSnapshot
      }
    },
    {
      method: "astrocartography" as const,
      methodVersion: chartMethodVersions.astrocartography,
      engineMethod: "calculateAstrocartography" as const,
      storedSnapshot: { inputSnapshot },
      expectedRequest: {
        schemaVersion: "chart-request.v2",
        method: "astrocartography",
        methodVersion: chartMethodVersions.astrocartography,
        executionProfile,
        settings,
        inputSnapshot
      }
    }
  ])(
    "reconstructs the strict $method v2 provider request without durable identity fields",
    async ({ method, methodVersion, engineMethod, storedSnapshot, expectedRequest }) => {
      const job = createClaimedJob({ method, methodVersion, inputSnapshot: storedSnapshot });
      const store = createStore(job);
      const calculate = vi.fn().mockResolvedValue({ ...result, method, methodVersion });
      const engine = createEngine({ [engineMethod]: calculate });

      await processChartCalculationJob({
        jobId: job.id,
        workerId: "chart-worker:test-process",
        leaseMs: 60_000,
        calculationTimeoutMs: 120_000,
        shutdownSignal: new AbortController().signal,
        store,
        engine
      });

      expect(calculate).toHaveBeenCalledWith(expectedRequest, {
        signal: expect.any(AbortSignal)
      });
      if (method === "synastry" || method === "composite") {
        const providerPayload = calculate.mock.calls[0]?.[0];
        expect(providerPayload).not.toHaveProperty("relationshipSnapshot");
        expect(JSON.stringify(providerPayload)).not.toContain(job.clientId);
        expect(JSON.stringify(providerPayload)).not.toContain(
          "44444444-4444-4444-8444-444444444444"
        );
      }
    }
  );

  it("records a readiness profile mismatch as permanent before calculation", async () => {
    const job = createClaimedJob();
    const store = createStore(job);
    vi.mocked(store.recordAttemptFailure).mockResolvedValue({
      kind: "failed",
      attempts: 1,
      maxAttempts: 3
    });
    const mismatch = new ChartEngineConfigurationError("CHART_ENGINE_READY_PROFILE_MISMATCH");
    const engine = createEngine({ checkReady: vi.fn().mockRejectedValue(mismatch) });

    await expect(
      processChartCalculationJob({
        jobId: job.id,
        workerId: "chart-worker:test-process",
        leaseMs: 60_000,
        calculationTimeoutMs: 120_000,
        shutdownSignal: new AbortController().signal,
        store,
        engine
      })
    ).rejects.toBeInstanceOf(UnrecoverableError);

    expect(engine.calculateNatal).not.toHaveBeenCalled();
    expect(store.claimForProcessing).toHaveBeenCalledOnce();
    expect(store.recordAttemptFailure).toHaveBeenCalledWith({
      jobId: job.id,
      workerId: "chart-worker:test-process",
      leaseGeneration: 7,
      code: "CHART_ENGINE_READY_PROFILE_MISMATCH",
      reason: "Chart engine configuration does not match the calculation profile",
      disposition: "permanent",
      retryDelayMs: 1_000
    });
    expect(vi.mocked(store.claimForProcessing).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(store.recordAttemptFailure).mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY
    );
  });

  it("defers transient provider readiness before claiming a durable attempt", async () => {
    const job = createClaimedJob();
    const store = createStore(job);
    vi.mocked(store.recordAttemptFailure).mockResolvedValue({
      kind: "requeued",
      attempts: 1,
      maxAttempts: 3
    });
    const delivery = createDelivery();
    const engine = createEngine({
      checkReady: vi
        .fn()
        .mockRejectedValue(new ChartEngineTransientError("CHART_ENGINE_READY_HTTP_503", 503))
    });

    await expect(
      processChartCalculationJob({
        jobId: job.id,
        workerId: "chart-worker:test-process",
        leaseMs: 60_000,
        calculationTimeoutMs: 120_000,
        retryDelayMs: 1_500,
        delivery,
        shutdownSignal: new AbortController().signal,
        store,
        engine
      })
    ).rejects.toBeInstanceOf(DelayedError);

    expect(engine.checkReady).toHaveBeenCalledWith({
      expectedProfile: executionProfile,
      signal: expect.any(AbortSignal)
    });
    expect(delivery.deferFor).toHaveBeenCalledWith(1_500);
    expect(store.claimForProcessing).not.toHaveBeenCalled();
    expect(store.recordAttemptFailure).not.toHaveBeenCalled();
    expect(engine.calculateNatal).not.toHaveBeenCalled();
  });

  it("extends the exact claim fence before half of the lease elapses", async () => {
    vi.useFakeTimers();
    const job = createClaimedJob();
    const store = createStore(job);
    const calculation = deferred<ReproducibleChartResult>();
    const engine = createEngine({ calculateNatal: vi.fn().mockReturnValue(calculation.promise) });

    const processing = processChartCalculationJob({
      jobId: job.id,
      workerId: "chart-worker:test-process",
      leaseMs: 100,
      calculationTimeoutMs: 1_000,
      shutdownSignal: new AbortController().signal,
      store,
      engine
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(engine.calculateNatal).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(49);

    expect(store.extendLease).toHaveBeenCalledWith({
      jobId: job.id,
      workerId: "chart-worker:test-process",
      leaseGeneration: 7,
      leaseMs: 100
    });
    calculation.resolve(result);
    await processing;
  });

  it("aborts provider work on heartbeat lease loss without writing through the stale fence", async () => {
    vi.useFakeTimers();
    const job = createClaimedJob();
    const store = createStore(job);
    vi.mocked(store.extendLease).mockResolvedValue(null);
    const delivery = createDelivery();
    const logger = createLogger();
    let providerSignal: AbortSignal | undefined;
    const engine = createEngine({
      calculateNatal: vi.fn((_request, options) => {
        providerSignal = options?.signal;
        return rejectWhenAborted(providerSignal);
      })
    });

    const processing = processChartCalculationJob({
      jobId: job.id,
      workerId: "chart-worker:test-process",
      leaseMs: 100,
      calculationTimeoutMs: 1_000,
      delivery,
      shutdownSignal: new AbortController().signal,
      store,
      engine,
      logger
    });
    const rejected = expect(processing).rejects.toBeInstanceOf(DelayedError);
    await vi.advanceTimersByTimeAsync(0);
    expect(engine.calculateNatal).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(49);

    expect(providerSignal?.aborted).toBe(true);
    await rejected;
    expect(delivery.deferFor).toHaveBeenCalledWith(100);
    expect(store.complete).not.toHaveBeenCalled();
    expect(store.recordAttemptFailure).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      "chart calculation job processed",
      expect.objectContaining({
        errorCode: "chart_job_lease_lost",
        leaseGeneration: 7,
        outcome: "lease_lost",
        retryScheduled: true
      })
    );
  });

  it("defers the same Bull attempt beyond the durable lease when heartbeat is unconfirmed", async () => {
    vi.useFakeTimers();
    const job = createClaimedJob();
    const store = createStore(job);
    const heartbeatError = new Error("PostgreSQL connection lost during lease extension");
    vi.mocked(store.extendLease).mockRejectedValue(heartbeatError);
    const delivery = createDelivery();
    const logger = createLogger();
    let providerSignal: AbortSignal | undefined;
    const engine = createEngine({
      calculateNatal: vi.fn((_request, options) => {
        providerSignal = options?.signal;
        return rejectWhenAborted(providerSignal);
      })
    });

    const outcome = processChartCalculationJob({
      jobId: job.id,
      workerId: "chart-worker:test-process",
      leaseMs: 100,
      calculationTimeoutMs: 1_000,
      delivery,
      shutdownSignal: new AbortController().signal,
      store,
      engine,
      logger
    }).then(
      () => ({ status: "fulfilled" as const }),
      (error: unknown) => ({ status: "rejected" as const, error })
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(engine.calculateNatal).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(49);

    expect(providerSignal?.aborted).toBe(true);
    expect(store.complete).not.toHaveBeenCalled();
    expect(store.recordAttemptFailure).not.toHaveBeenCalled();
    await expect(outcome).resolves.toMatchObject({
      status: "rejected",
      error: expect.objectContaining({ name: "DelayedError" })
    });
    expect(delivery.deferFor).toHaveBeenCalledWith(100);
    expect(JSON.stringify(await outcome)).not.toContain(heartbeatError.message);
    expect(logger.warn).toHaveBeenCalledWith(
      "chart calculation job processed",
      expect.objectContaining({
        errorCode: "chart_job_lease_unconfirmed",
        outcome: "lease_unconfirmed",
        retryScheduled: true
      })
    );
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(heartbeatError.message);
    expect(store.complete).not.toHaveBeenCalled();
    expect(store.recordAttemptFailure).not.toHaveBeenCalled();
  });

  it("records one DB-scheduled exponential jittered retry and completes the old delivery", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const job = createClaimedJob({ attempts: 2, maxAttempts: 3 });
    const store = createStore(job);
    vi.mocked(store.recordAttemptFailure).mockResolvedValue({
      kind: "requeued",
      attempts: 2,
      maxAttempts: 3
    });
    const delivery = createDelivery();
    const engine = createEngine({
      calculateNatal: vi.fn((_request, options) => rejectWhenAborted(options?.signal))
    });

    const processing = processChartCalculationJob({
      jobId: job.id,
      workerId: "chart-worker:test-process",
      leaseMs: 1_000,
      calculationTimeoutMs: 100,
      retryDelayMs: 1_000,
      retryJitter: 0.5,
      delivery,
      shutdownSignal: new AbortController().signal,
      store,
      engine
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(engine.calculateNatal).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(100);

    await expect(processing).resolves.toBeUndefined();
    expect(delivery.deferFor).not.toHaveBeenCalled();
    expect(store.recordAttemptFailure).toHaveBeenCalledTimes(1);
    expect(store.recordAttemptFailure).toHaveBeenCalledWith({
      jobId: job.id,
      workerId: "chart-worker:test-process",
      leaseGeneration: 7,
      code: "chart_provider_timeout",
      reason: "Chart calculation exceeded its durable timeout",
      disposition: "retryable",
      retryDelayMs: 1_500
    });
    expect(store.complete).not.toHaveBeenCalled();
  });

  it("stops BullMQ retry when the durable failure outcome reaches maxAttempts", async () => {
    const job = createClaimedJob({ attempts: 3, maxAttempts: 3 });
    const store = createStore(job);
    vi.mocked(store.recordAttemptFailure).mockResolvedValue({
      kind: "failed",
      attempts: 3,
      maxAttempts: 3
    });
    const providerError = new Error("chart-engine unavailable");
    const engine = createEngine({ calculateNatal: vi.fn().mockRejectedValue(providerError) });

    await expect(
      processChartCalculationJob({
        jobId: job.id,
        workerId: "chart-worker:test-process",
        leaseMs: 60_000,
        calculationTimeoutMs: 120_000,
        shutdownSignal: new AbortController().signal,
        store,
        engine
      })
    ).rejects.toBeInstanceOf(UnrecoverableError);

    expect(store.recordAttemptFailure).toHaveBeenCalledWith(
      expect.objectContaining({ disposition: "retryable" })
    );
  });

  it("records shutdown cancellation through the current fence and lets DB decide retry", async () => {
    const job = createClaimedJob();
    const store = createStore(job);
    vi.mocked(store.recordAttemptFailure).mockResolvedValue({
      kind: "requeued",
      attempts: 1,
      maxAttempts: 3
    });
    const shutdown = new AbortController();
    const delivery = createDelivery();
    const engine = createEngine({
      calculateNatal: vi.fn((_request, options) => rejectWhenAborted(options?.signal))
    });
    const processing = processChartCalculationJob({
      jobId: job.id,
      workerId: "chart-worker:test-process",
      leaseMs: 60_000,
      calculationTimeoutMs: 120_000,
      delivery,
      shutdownSignal: shutdown.signal,
      store,
      engine
    });
    await vi.waitFor(() => expect(engine.calculateNatal).toHaveBeenCalledOnce());

    shutdown.abort();

    await expect(processing).resolves.toBeUndefined();
    expect(delivery.deferFor).not.toHaveBeenCalled();
    expect(store.recordAttemptFailure).toHaveBeenCalledWith({
      jobId: job.id,
      workerId: "chart-worker:test-process",
      leaseGeneration: 7,
      code: "chart_worker_shutdown",
      reason: "Chart worker stopped during calculation",
      disposition: "retryable",
      retryDelayMs: 1_000
    });
  });

  it("does not call the provider when PostgreSQL marks an expired final claim exhausted", async () => {
    const job = createClaimedJob({ attempts: 3, maxAttempts: 3 });
    const store = createStore(job);
    vi.mocked(store.claimForProcessing).mockResolvedValue({
      kind: "exhausted",
      jobId: job.id,
      attempts: 3,
      maxAttempts: 3
    });
    vi.mocked(store.getPreClaimExecutionProfile).mockResolvedValue(null);
    const engine = createEngine();

    await expect(
      processChartCalculationJob({
        jobId: job.id,
        workerId: "chart-worker:test-process",
        leaseMs: 60_000,
        calculationTimeoutMs: 120_000,
        shutdownSignal: new AbortController().signal,
        store,
        engine
      })
    ).rejects.toBeInstanceOf(UnrecoverableError);

    expect(engine.checkReady).not.toHaveBeenCalled();
    expect(store.recordAttemptFailure).not.toHaveBeenCalled();
  });

  it("does not turn a rejected stale completion fence into a second failure write", async () => {
    const job = createClaimedJob();
    const store = createStore(job);
    vi.mocked(store.complete).mockResolvedValue(false);
    const delivery = createDelivery();
    const logger = createLogger();
    const engine = createEngine({ calculateNatal: vi.fn().mockResolvedValue(result) });

    await expect(
      processChartCalculationJob({
        jobId: job.id,
        workerId: "chart-worker:test-process",
        leaseMs: 60_000,
        calculationTimeoutMs: 120_000,
        delivery,
        shutdownSignal: new AbortController().signal,
        store,
        engine,
        logger
      })
    ).rejects.toBeInstanceOf(DelayedError);

    expect(delivery.deferFor).toHaveBeenCalledWith(60_000);
    expect(store.recordAttemptFailure).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      "chart calculation job processed",
      expect.objectContaining({
        errorCode: "chart_completion_fence_rejected",
        outcome: "fence_rejected",
        retryScheduled: true
      })
    );
  });

  it("rejects durable relationship identity as a permanent input error before provider I/O", async () => {
    const job = createClaimedJob({
      method: "synastry",
      methodVersion: chartMethodVersions.synastry,
      inputSnapshot: {
        inputSnapshot,
        partnerInputSnapshot,
        relationshipSnapshot: {
          primaryClientId: "22222222-2222-4222-8222-222222222222",
          partnerClientId: "44444444-4444-4444-8444-444444444444"
        }
      }
    });
    const store = createStore(job);
    vi.mocked(store.recordAttemptFailure).mockResolvedValue({
      kind: "failed",
      attempts: 1,
      maxAttempts: 3
    });
    const engine = createEngine();

    await expect(
      processChartCalculationJob({
        jobId: job.id,
        workerId: "chart-worker:test-process",
        leaseMs: 60_000,
        calculationTimeoutMs: 120_000,
        shutdownSignal: new AbortController().signal,
        store,
        engine
      })
    ).rejects.toBeInstanceOf(UnrecoverableError);

    expect(engine.calculateSynastry).not.toHaveBeenCalled();
    expect(store.recordAttemptFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "chart_job_input_invalid",
        disposition: "permanent"
      })
    );
  });

  it("records a provider contract error as permanent without another durable attempt", async () => {
    const job = createClaimedJob();
    const store = createStore(job);
    vi.mocked(store.recordAttemptFailure).mockResolvedValue({
      kind: "failed",
      attempts: 1,
      maxAttempts: 3
    });
    const engine = createEngine({
      calculateNatal: vi
        .fn()
        .mockRejectedValue(new ChartEnginePermanentError("CHART_ENGINE_RESPONSE_INVALID_SCHEMA"))
    });

    await expect(
      processChartCalculationJob({
        jobId: job.id,
        workerId: "chart-worker:test-process",
        leaseMs: 60_000,
        calculationTimeoutMs: 120_000,
        shutdownSignal: new AbortController().signal,
        store,
        engine
      })
    ).rejects.toBeInstanceOf(UnrecoverableError);

    expect(store.recordAttemptFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "CHART_ENGINE_RESPONSE_INVALID_SCHEMA",
        disposition: "permanent"
      })
    );
  });

  it("defers a pre-claim storage outage without consuming a Bull attempt or exposing SQL", async () => {
    const job = createClaimedJob();
    const store = createStore(job);
    const sensitive = "DrizzleQueryError select input_data params=[birthSnapshot]";
    vi.mocked(store.claimForProcessing).mockRejectedValue(new Error(sensitive));
    const delivery = createDelivery();

    const error = await processChartCalculationJob({
      jobId: job.id,
      workerId: "chart-worker:test-process",
      leaseMs: 60_000,
      calculationTimeoutMs: 120_000,
      retryDelayMs: 1_500,
      delivery,
      shutdownSignal: new AbortController().signal,
      store,
      engine: createEngine()
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(DelayedError);
    expect(delivery.deferFor).toHaveBeenCalledWith(1_500);
    expect(JSON.stringify(error)).not.toContain(sensitive);
    expect(store.recordAttemptFailure).not.toHaveBeenCalled();
  });

  it("defers a rejected failure fence instead of acknowledging the delivery", async () => {
    const job = createClaimedJob();
    const store = createStore(job);
    vi.mocked(store.recordAttemptFailure).mockResolvedValue(null);
    const delivery = createDelivery();
    const logger = createLogger();
    const engine = createEngine({
      calculateNatal: vi.fn().mockRejectedValue(new Error("provider transport failed"))
    });

    await expect(
      processChartCalculationJob({
        jobId: job.id,
        workerId: "chart-worker:test-process",
        leaseMs: 60_000,
        calculationTimeoutMs: 120_000,
        delivery,
        shutdownSignal: new AbortController().signal,
        store,
        engine,
        logger
      })
    ).rejects.toBeInstanceOf(DelayedError);

    expect(delivery.deferFor).toHaveBeenCalledWith(60_000);
    expect(logger.warn).toHaveBeenCalledWith(
      "chart calculation job processed",
      expect.objectContaining({
        errorCode: "chart_failure_fence_rejected",
        outcome: "fence_rejected",
        retryScheduled: true
      })
    );
  });

  it("redacts sensitive provider and Drizzle details from durable failures and Bull errors", async () => {
    const job = createClaimedJob();
    const store = createStore(job);
    vi.mocked(store.recordAttemptFailure).mockResolvedValue({
      kind: "requeued",
      attempts: 1,
      maxAttempts: 3
    });
    const sensitive =
      "DrizzleQueryError SQL=insert calculation_records params=[birthDate,inputData,resultData]";
    const engine = createEngine({
      calculateNatal: vi.fn().mockRejectedValue(new Error(sensitive))
    });
    const delivery = createDelivery();

    await expect(
      processChartCalculationJob({
        jobId: job.id,
        workerId: "chart-worker:test-process",
        leaseMs: 60_000,
        calculationTimeoutMs: 120_000,
        delivery,
        shutdownSignal: new AbortController().signal,
        store,
        engine
      })
    ).resolves.toBeUndefined();

    expect(delivery.deferFor).not.toHaveBeenCalled();
    expect(store.recordAttemptFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "chart_provider_transient_failure",
        reason: "Chart engine calculation failed",
        disposition: "retryable",
        retryDelayMs: 1_000
      })
    );
    expect(JSON.stringify(vi.mocked(store.recordAttemptFailure).mock.calls)).not.toContain(
      sensitive
    );
  });

  it("terminalizes a typed deterministic completion failure instead of recomputing", async () => {
    const job = createClaimedJob();
    const store = createStore(job);
    vi.mocked(store.complete).mockRejectedValue(
      new ChartCalculationCompletionError("CHART_PARTICIPANT_PROFILE_INVALID")
    );
    vi.mocked(store.recordAttemptFailure).mockResolvedValue({
      kind: "failed",
      attempts: 1,
      maxAttempts: 3
    });

    await expect(
      processChartCalculationJob({
        jobId: job.id,
        workerId: "chart-worker:test-process",
        leaseMs: 60_000,
        calculationTimeoutMs: 120_000,
        shutdownSignal: new AbortController().signal,
        store,
        engine: createEngine({ calculateNatal: vi.fn().mockResolvedValue(result) })
      })
    ).rejects.toMatchObject({
      name: "UnrecoverableError",
      message: "CHART_PARTICIPANT_PROFILE_INVALID: Chart calculation completion was rejected"
    });
    expect(store.recordAttemptFailure).toHaveBeenCalledWith({
      jobId: job.id,
      workerId: "chart-worker:test-process",
      leaseGeneration: 7,
      code: "CHART_PARTICIPANT_PROFILE_INVALID",
      reason: "Chart calculation completion was rejected",
      disposition: "permanent",
      retryDelayMs: 1_000
    });
  });

  it("defers beyond the lease when persisting a failure has an unconfirmed outcome", async () => {
    const job = createClaimedJob();
    const store = createStore(job);
    const sensitive = "update chart_jobs set input_data=$1 result_data=$2";
    vi.mocked(store.recordAttemptFailure).mockRejectedValue(new Error(sensitive));
    const delivery = createDelivery();
    const shutdown = new AbortController();
    const engine = createEngine({
      calculateNatal: vi.fn((_request, options) => rejectWhenAborted(options?.signal))
    });
    const processing = processChartCalculationJob({
      jobId: job.id,
      workerId: "chart-worker:test-process",
      leaseMs: 60_000,
      calculationTimeoutMs: 120_000,
      delivery,
      shutdownSignal: shutdown.signal,
      store,
      engine
    });
    await vi.waitFor(() => expect(engine.calculateNatal).toHaveBeenCalledOnce());

    shutdown.abort();
    const error = await processing.catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(DelayedError);
    expect(delivery.deferFor).toHaveBeenCalledWith(60_000);
    expect(JSON.stringify(error)).not.toContain(sensitive);
  });

  it.each(chartCalculationReplacementErrorCodes)(
    "records replacement failure %s as permanent and exposes only its typed code",
    async (code) => {
      const job = createClaimedJob();
      const store = createStore(job);
      vi.mocked(store.complete).mockRejectedValue(new ChartCalculationReplacementError(code));
      vi.mocked(store.recordAttemptFailure).mockResolvedValue({
        kind: "failed",
        attempts: 1,
        maxAttempts: 3
      });
      const engine = createEngine({ calculateNatal: vi.fn().mockResolvedValue(result) });

      const error = await processChartCalculationJob({
        jobId: job.id,
        workerId: "chart-worker:test-process",
        leaseMs: 60_000,
        calculationTimeoutMs: 120_000,
        shutdownSignal: new AbortController().signal,
        store,
        engine
      }).catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(UnrecoverableError);
      expect(error).toMatchObject({
        message: `${code}: Chart calculation replacement was rejected`
      });
      expect(store.recordAttemptFailure).toHaveBeenCalledWith({
        jobId: job.id,
        workerId: "chart-worker:test-process",
        leaseGeneration: 7,
        code,
        reason: "Chart calculation replacement was rejected",
        disposition: "permanent",
        retryDelayMs: 1_000
      });
    }
  );

  it("defers a never-settling durable claim at the storage deadline", async () => {
    vi.useFakeTimers();
    const job = createClaimedJob();
    const store = createStore(job);
    const claim = deferred<Awaited<ReturnType<ChartJobProcessingStore["claimForProcessing"]>>>();
    vi.mocked(store.claimForProcessing).mockReturnValue(claim.promise);
    const delivery = createDelivery();
    const engine = createEngine();
    const processing = processChartCalculationJob({
      jobId: job.id,
      workerId: "chart-worker:test-process",
      leaseMs: 100,
      calculationTimeoutMs: 1_000,
      storageOperationTimeoutMs: 10,
      delivery,
      shutdownSignal: new AbortController().signal,
      store,
      engine
    });
    const outcome = processing.then(
      () => ({ status: "fulfilled" as const }),
      (error: unknown) => ({ status: "rejected" as const, error })
    );
    try {
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(10);

      expect(delivery.deferFor).toHaveBeenCalledOnce();
      expect(delivery.deferFor).toHaveBeenCalledWith(1_000);
      await expect(outcome).resolves.toMatchObject({
        status: "rejected",
        error: expect.objectContaining({ name: "DelayedError" })
      });
      expect(engine.calculateNatal).not.toHaveBeenCalled();

      claim.resolve({ kind: "not_claimable" });
      await vi.advanceTimersByTimeAsync(0);
      expect(delivery.deferFor).toHaveBeenCalledOnce();
      expect(engine.calculateNatal).not.toHaveBeenCalled();
    } finally {
      claim.resolve({ kind: "not_claimable" });
      await vi.advanceTimersByTimeAsync(0);
      await outcome;
    }
  });

  it("defers a never-settling completion at the storage deadline without stale writes", async () => {
    vi.useFakeTimers();
    const job = createClaimedJob();
    const store = createStore(job);
    const completion = deferred<boolean>();
    vi.mocked(store.complete).mockReturnValue(completion.promise);
    const delivery = createDelivery();
    const engine = createEngine({ calculateNatal: vi.fn().mockResolvedValue(result) });
    const processing = processChartCalculationJob({
      jobId: job.id,
      workerId: "chart-worker:test-process",
      leaseMs: 100,
      calculationTimeoutMs: 1_000,
      storageOperationTimeoutMs: 10,
      delivery,
      shutdownSignal: new AbortController().signal,
      store,
      engine
    });
    const outcome = processing.then(
      () => ({ status: "fulfilled" as const }),
      (error: unknown) => ({ status: "rejected" as const, error })
    );
    try {
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(10);

      expect(delivery.deferFor).toHaveBeenCalledOnce();
      expect(delivery.deferFor).toHaveBeenCalledWith(100);
      await expect(outcome).resolves.toMatchObject({
        status: "rejected",
        error: expect.objectContaining({ name: "DelayedError" })
      });
      expect(store.complete).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: job.id,
          workerId: "chart-worker:test-process",
          leaseGeneration: 7
        })
      );
      expect(store.recordAttemptFailure).not.toHaveBeenCalled();

      completion.resolve(true);
      await vi.advanceTimersByTimeAsync(0);
      expect(delivery.deferFor).toHaveBeenCalledOnce();
      expect(store.recordAttemptFailure).not.toHaveBeenCalled();
    } finally {
      completion.resolve(true);
      await vi.advanceTimersByTimeAsync(0);
      await outcome;
    }
  });

  it("defers a never-settling failure write at the storage deadline without replaying work", async () => {
    vi.useFakeTimers();
    const job = createClaimedJob();
    const store = createStore(job);
    const failureWrite =
      deferred<Awaited<ReturnType<ChartJobProcessingStore["recordAttemptFailure"]>>>();
    vi.mocked(store.recordAttemptFailure).mockReturnValue(failureWrite.promise);
    const delivery = createDelivery();
    const engine = createEngine({
      calculateNatal: vi
        .fn()
        .mockRejectedValue(new ChartEngineTransientError("CHART_ENGINE_HTTP_503", 503))
    });
    const processing = processChartCalculationJob({
      jobId: job.id,
      workerId: "chart-worker:test-process",
      leaseMs: 100,
      calculationTimeoutMs: 1_000,
      storageOperationTimeoutMs: 10,
      delivery,
      shutdownSignal: new AbortController().signal,
      store,
      engine
    });
    const outcome = processing.then(
      () => ({ status: "fulfilled" as const }),
      (error: unknown) => ({ status: "rejected" as const, error })
    );
    try {
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(10);

      expect(delivery.deferFor).toHaveBeenCalledOnce();
      expect(delivery.deferFor).toHaveBeenCalledWith(100);
      await expect(outcome).resolves.toMatchObject({
        status: "rejected",
        error: expect.objectContaining({ name: "DelayedError" })
      });
      expect(engine.calculateNatal).toHaveBeenCalledOnce();
      expect(store.complete).not.toHaveBeenCalled();
      expect(store.recordAttemptFailure).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: job.id,
          workerId: "chart-worker:test-process",
          leaseGeneration: 7
        })
      );

      failureWrite.resolve({ kind: "requeued", attempts: 1, maxAttempts: 3 });
      await vi.advanceTimersByTimeAsync(0);
      expect(delivery.deferFor).toHaveBeenCalledOnce();
      expect(engine.calculateNatal).toHaveBeenCalledOnce();
    } finally {
      failureWrite.resolve({ kind: "requeued", attempts: 1, maxAttempts: 3 });
      await vi.advanceTimersByTimeAsync(0);
      await outcome;
    }
  });

  it("aborts and defers when a heartbeat lease extension exceeds its storage deadline", async () => {
    vi.useFakeTimers();
    const job = createClaimedJob();
    const store = createStore(job);
    const leaseExtension = deferred<ChartJobForProcessing["lease"]>();
    vi.mocked(store.extendLease).mockReturnValue(leaseExtension.promise);
    const delivery = createDelivery();
    const shutdown = new AbortController();
    let providerSignal: AbortSignal | undefined;
    const engine = createEngine({
      calculateNatal: vi.fn((_request, options) => {
        providerSignal = options?.signal;
        return rejectWhenAborted(providerSignal);
      })
    });
    const processing = processChartCalculationJob({
      jobId: job.id,
      workerId: "chart-worker:test-process",
      leaseMs: 100,
      calculationTimeoutMs: 1_000,
      storageOperationTimeoutMs: 10,
      delivery,
      shutdownSignal: shutdown.signal,
      store,
      engine
    });
    const rejected = expect(processing).rejects.toBeInstanceOf(DelayedError);
    try {
      await vi.advanceTimersByTimeAsync(0);

      await vi.advanceTimersByTimeAsync(49);
      await vi.advanceTimersByTimeAsync(10);

      expect(providerSignal?.aborted).toBe(true);
      await rejected;
      expect(delivery.deferFor).toHaveBeenCalledWith(100);
      expect(store.complete).not.toHaveBeenCalled();
      expect(store.recordAttemptFailure).not.toHaveBeenCalled();
    } finally {
      leaseExtension.resolve(job.lease);
      shutdown.abort();
      await processing.catch(() => undefined);
    }
  });

  it("redacts a sensitive completion storage failure and safely defers the fence", async () => {
    const job = createClaimedJob();
    const store = createStore(job);
    const sensitive = "insert into calculation_records input_data result_data params=[secret]";
    vi.mocked(store.complete).mockRejectedValue(new Error(sensitive));
    const delivery = createDelivery();
    const engine = createEngine({ calculateNatal: vi.fn().mockResolvedValue(result) });

    const error = await processChartCalculationJob({
      jobId: job.id,
      workerId: "chart-worker:test-process",
      leaseMs: 60_000,
      calculationTimeoutMs: 120_000,
      delivery,
      shutdownSignal: new AbortController().signal,
      store,
      engine
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(DelayedError);
    expect(delivery.deferFor).toHaveBeenCalledWith(60_000);
    expect(store.recordAttemptFailure).not.toHaveBeenCalled();
    expect(JSON.stringify(error)).not.toContain(sensitive);
  });

  it("treats a non-claimable terminal delivery as an idempotent no-op", async () => {
    const job = createClaimedJob();
    const store = createStore(job);
    vi.mocked(store.claimForProcessing).mockResolvedValue({ kind: "not_claimable" });
    vi.mocked(store.getDeliveryState).mockResolvedValue({
      kind: "failed",
      attempts: 1,
      maxAttempts: 3
    });
    vi.mocked(store.getPreClaimExecutionProfile).mockResolvedValue(null);
    const engine = createEngine();

    await expect(
      processChartCalculationJob({
        jobId: job.id,
        workerId: "chart-worker:test-process",
        leaseMs: 60_000,
        calculationTimeoutMs: 120_000,
        shutdownSignal: new AbortController().signal,
        store,
        engine
      })
    ).resolves.toBeUndefined();

    expect(engine.checkReady).not.toHaveBeenCalled();
    expect(store.recordAttemptFailure).not.toHaveBeenCalled();
  });

  it("defers a non-claimable active lease instead of orphaning its delivery", async () => {
    const job = createClaimedJob();
    const store = createStore(job);
    vi.mocked(store.claimForProcessing).mockResolvedValue({ kind: "not_claimable" });
    const delivery = createDelivery();

    await expect(
      processChartCalculationJob({
        jobId: job.id,
        workerId: "chart-worker:test-process",
        leaseMs: 60_000,
        calculationTimeoutMs: 120_000,
        delivery,
        shutdownSignal: new AbortController().signal,
        store,
        engine: createEngine()
      })
    ).rejects.toBeInstanceOf(DelayedError);

    expect(delivery.deferFor).toHaveBeenCalledWith(60_000);
  });

  it("defers a non-claimable queued delivery on the normal retry cadence", async () => {
    const job = createClaimedJob();
    const store = createStore(job);
    vi.mocked(store.claimForProcessing).mockResolvedValue({ kind: "not_claimable" });
    vi.mocked(store.getDeliveryState).mockResolvedValue({
      kind: "queued",
      attempts: 1,
      maxAttempts: 3
    });
    const delivery = createDelivery();

    await expect(
      processChartCalculationJob({
        jobId: job.id,
        workerId: "chart-worker:test-process",
        leaseMs: 60_000,
        calculationTimeoutMs: 120_000,
        retryDelayMs: 1_234,
        delivery,
        shutdownSignal: new AbortController().signal,
        store,
        engine: createEngine()
      })
    ).rejects.toBeInstanceOf(DelayedError);

    expect(delivery.deferFor).toHaveBeenCalledWith(1_234);
  });

  it("defers an unconfirmed delivery state without exposing storage diagnostics", async () => {
    const job = createClaimedJob();
    const store = createStore(job);
    const sensitive = "DrizzleQueryError select input_snapshot params=[private-birth-data]";
    vi.mocked(store.claimForProcessing).mockResolvedValue({ kind: "not_claimable" });
    vi.mocked(store.getDeliveryState).mockRejectedValue(new Error(sensitive));
    const delivery = createDelivery();

    const error = await processChartCalculationJob({
      jobId: job.id,
      workerId: "chart-worker:test-process",
      leaseMs: 60_000,
      calculationTimeoutMs: 120_000,
      retryDelayMs: 2_345,
      delivery,
      shutdownSignal: new AbortController().signal,
      store,
      engine: createEngine()
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(DelayedError);
    expect(delivery.deferFor).toHaveBeenCalledWith(2_345);
    expect(JSON.stringify(error)).not.toContain(sensitive);
  });
});

function createClaimedJob(overrides: Partial<ChartJobForProcessing> = {}): ChartJobForProcessing {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    ownerUserId: "11111111-1111-4111-8111-111111111111",
    clientId: "22222222-2222-4222-8222-222222222222",
    method: "natal",
    interpretationMode:
      overrides.interpretationMode ??
      ((overrides.method ?? "natal") === "natal" ? "adult_natal" : "legacy_unclassified"),
    methodVersion: chartMethodVersions.natal,
    executionProfile,
    status: "processing",
    inputSnapshot,
    settingsSnapshot: settings,
    participants: [{ role: "subject", clientId: "22222222-2222-4222-8222-222222222222" }],
    attempts: 1,
    maxAttempts: 3,
    targetCalculationId: null,
    expectedSourceChecksum: null,
    lease: {
      lockedBy: "chart-worker:test-process",
      leaseGeneration: 7,
      lockedUntil: "2026-08-03T12:01:00.000Z"
    },
    ...overrides
  };
}

function createStore(job: ChartJobForProcessing): ChartJobProcessingStore {
  return {
    getPreClaimExecutionProfile: vi.fn().mockResolvedValue(job.executionProfile),
    getDeliveryState: vi.fn().mockResolvedValue({
      kind: "processing",
      attempts: job.attempts,
      maxAttempts: job.maxAttempts
    }),
    getQueueDispatch: vi.fn(),
    claimForProcessing: vi.fn().mockResolvedValue({ kind: "claimed", job }),
    extendLease: vi.fn().mockResolvedValue(job.lease),
    complete: vi.fn().mockResolvedValue(true),
    recordAttemptFailure: vi.fn(),
    recoverExpired: vi.fn(),
    recoverPendingDeliveries: vi.fn()
  };
}

function createDelivery() {
  return {
    deferFor: vi.fn().mockRejectedValue(new DelayedError())
  };
}

function createLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  } as unknown as Logger & {
    readonly info: ReturnType<typeof vi.fn>;
    readonly warn: ReturnType<typeof vi.fn>;
    readonly error: ReturnType<typeof vi.fn>;
  };
}

function createEngine(
  overrides: Partial<ChartEngineClient> = {}
): ChartEngineClient & { readonly checkReady: ReturnType<typeof vi.fn> } {
  return {
    checkReady: vi.fn().mockResolvedValue(undefined),
    calculateNatal: vi.fn(),
    calculateTransit: vi.fn(),
    calculateSynastry: vi.fn(),
    calculateComposite: vi.fn(),
    calculateSolarReturn: vi.fn(),
    calculateProgression: vi.fn(),
    calculateHorary: vi.fn(),
    calculateAstrocartography: vi.fn(),
    ...overrides
  } as ChartEngineClient & { readonly checkReady: ReturnType<typeof vi.fn> };
}

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function rejectWhenAborted(signal: AbortSignal | undefined): Promise<ReproducibleChartResult> {
  if (!signal) throw new Error("Expected provider AbortSignal");
  return new Promise((_resolve, reject) => {
    const rejectCancelled = () =>
      reject(new ChartEngineCancelledError("CHART_ENGINE_REQUEST_CANCELLED"));
    if (signal.aborted) rejectCancelled();
    else signal.addEventListener("abort", rejectCancelled, { once: true });
  });
}
