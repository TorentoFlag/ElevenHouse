import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createChartJobRecovery,
  createChartWorkerRuntime as createChartWorkerRuntimeImplementation
} from "./chart-worker-runtime";

type ChartWorkerRuntimeInput = Parameters<typeof createChartWorkerRuntimeImplementation>[0];

function createChartWorkerRuntime(
  input: Omit<ChartWorkerRuntimeInput, "telemetry"> & {
    readonly telemetry?: ChartWorkerRuntimeInput["telemetry"];
  }
) {
  return createChartWorkerRuntimeImplementation({
    telemetry: input.telemetry ?? { runOnce: vi.fn(), start: vi.fn(), stop: vi.fn() },
    ...input
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("createChartWorkerRuntime", () => {
  it("starts intake after gates and pauses intake before aborting in-flight work on shutdown", async () => {
    const relay = {
      runOnce: vi.fn(),
      start: vi.fn(),
      stop: vi.fn()
    };
    const recovery = {
      runOnce: vi.fn(),
      start: vi.fn(),
      stop: vi.fn()
    };
    const telemetry = {
      runOnce: vi.fn(),
      start: vi.fn(),
      stop: vi.fn()
    };
    const abortInFlight = vi.fn();
    const closeWorker = vi.fn();
    const pauseWorker = vi.fn();
    const runWorker = vi.fn(() => new Promise<void>(() => undefined));
    const setAcceptingWork = vi.fn();
    const readinessServer = {
      listen: vi.fn((_port, _host, cb) => cb()),
      once: vi.fn(),
      off: vi.fn(),
      close: vi.fn((cb) => cb()),
      listening: true
    };
    const runtime = createChartWorkerRuntime({
      readinessServer: readinessServer as never,
      readinessPort: 3012,
      readinessHost: "127.0.0.1",
      operationTimeoutMs: 1_000,
      relay,
      recovery,
      telemetry,
      abortInFlight,
      setAcceptingWork,
      queue: { close: vi.fn(), waitUntilReady: vi.fn() },
      worker: {
        close: closeWorker,
        pause: pauseWorker,
        run: runWorker,
        waitUntilReady: vi.fn(),
        on: vi.fn(),
        off: vi.fn()
      },
      postgres: { close: vi.fn(), pool: { query: vi.fn() } },
      chartEngine: { checkReady: vi.fn() },
      logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
    });

    await runtime.startup();
    await runtime.shutdown();

    expect(relay.runOnce).toHaveBeenCalled();
    expect(relay.start).toHaveBeenCalled();
    expect(relay.stop).toHaveBeenCalled();
    expect(recovery.runOnce).toHaveBeenCalled();
    expect(recovery.start).toHaveBeenCalled();
    expect(recovery.stop).toHaveBeenCalled();
    expect(telemetry.runOnce).toHaveBeenCalled();
    expect(telemetry.start).toHaveBeenCalled();
    expect(telemetry.stop).toHaveBeenCalled();
    expect(runWorker).toHaveBeenCalledOnce();
    expect(relay.runOnce.mock.invocationCallOrder[0]).toBeLessThan(
      runWorker.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY
    );
    expect(recovery.runOnce.mock.invocationCallOrder[0]).toBeLessThan(
      runWorker.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY
    );
    expect(runWorker.mock.invocationCallOrder[0]).toBeLessThan(
      readinessServer.listen.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY
    );
    expect(setAcceptingWork).toHaveBeenCalledWith(true);
    expect(setAcceptingWork).toHaveBeenLastCalledWith(false);
    expect(pauseWorker).toHaveBeenCalledWith(true);
    expect(abortInFlight).toHaveBeenCalledOnce();
    expect(pauseWorker.mock.invocationCallOrder[0]).toBeLessThan(
      abortInFlight.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY
    );
    expect(abortInFlight.mock.invocationCallOrder[0]).toBeLessThan(
      closeWorker.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY
    );
  });

  it("does not start the Bull worker before every startup gate succeeds", async () => {
    const postgresReady = deferred<void>();
    const queueReady = deferred<void>();
    const workerReady = deferred<void>();
    const engineReady = deferred<void>();
    const runWorker = vi.fn(() => new Promise<void>(() => undefined));
    const runtime = createChartWorkerRuntime({
      readinessServer: {
        listen: vi.fn((_port, _host, cb) => cb()),
        once: vi.fn(),
        off: vi.fn(),
        close: vi.fn((cb) => cb()),
        listening: false
      } as never,
      readinessPort: 3012,
      readinessHost: "127.0.0.1",
      operationTimeoutMs: 1_000,
      relay: { runOnce: vi.fn(), start: vi.fn(), stop: vi.fn() },
      recovery: { runOnce: vi.fn(), start: vi.fn(), stop: vi.fn() },
      abortInFlight: vi.fn(),
      setAcceptingWork: vi.fn(),
      queue: { close: vi.fn(), waitUntilReady: vi.fn(() => queueReady.promise) },
      worker: {
        close: vi.fn(),
        pause: vi.fn(),
        run: runWorker,
        waitUntilReady: vi.fn(() => workerReady.promise),
        on: vi.fn(),
        off: vi.fn()
      },
      postgres: { close: vi.fn(), pool: { query: vi.fn(() => postgresReady.promise) } },
      chartEngine: { checkReady: vi.fn(() => engineReady.promise) },
      logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
    });

    const startup = runtime.startup();
    await Promise.resolve();
    expect(runWorker).not.toHaveBeenCalled();

    postgresReady.resolve(undefined);
    queueReady.resolve(undefined);
    workerReady.resolve(undefined);
    await Promise.resolve();
    expect(runWorker).not.toHaveBeenCalled();

    engineReady.resolve(undefined);
    await startup;

    expect(runWorker).toHaveBeenCalledOnce();
  });

  it("does not start intake when shutdown wins a startup race", async () => {
    const postgresReady = deferred<void>();
    const runWorker = vi.fn(() => new Promise<void>(() => undefined));
    const relay = { runOnce: vi.fn(), start: vi.fn(), stop: vi.fn() };
    const recovery = { runOnce: vi.fn(), start: vi.fn(), stop: vi.fn() };
    const readinessServer = {
      listen: vi.fn((_port, _host, cb) => cb()),
      once: vi.fn(),
      off: vi.fn(),
      close: vi.fn((cb) => cb()),
      listening: false
    };
    const runtime = createChartWorkerRuntime({
      readinessServer: readinessServer as never,
      readinessPort: 3012,
      readinessHost: "127.0.0.1",
      operationTimeoutMs: 1_000,
      relay,
      recovery,
      abortInFlight: vi.fn(),
      setAcceptingWork: vi.fn(),
      queue: { close: vi.fn(), waitUntilReady: vi.fn() },
      worker: {
        close: vi.fn(),
        pause: vi.fn(),
        run: runWorker,
        waitUntilReady: vi.fn(),
        on: vi.fn(),
        off: vi.fn()
      },
      postgres: { close: vi.fn(), pool: { query: vi.fn(() => postgresReady.promise) } },
      chartEngine: { checkReady: vi.fn() },
      logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
    });

    const startup = runtime.startup();
    await Promise.resolve();
    const shutdown = runtime.shutdown();
    postgresReady.resolve(undefined);
    await Promise.all([startup, shutdown]);

    expect(runWorker).not.toHaveBeenCalled();
    expect(relay.start).not.toHaveBeenCalled();
    expect(recovery.start).not.toHaveBeenCalled();
    expect(readinessServer.listen).not.toHaveBeenCalled();
  });

  it("closes a readiness listener that finishes opening after shutdown", async () => {
    let listenCallback: (() => void) | undefined;
    const readinessServer = {
      listen: vi.fn((_port, _host, callback) => {
        listenCallback = callback;
      }),
      once: vi.fn(),
      off: vi.fn(),
      close: vi.fn((callback) => callback()),
      listening: false
    };
    const runWorker = vi.fn(() => new Promise<void>(() => undefined));
    const runtime = createChartWorkerRuntime({
      readinessServer: readinessServer as never,
      readinessPort: 3012,
      readinessHost: "127.0.0.1",
      operationTimeoutMs: 1_000,
      relay: { runOnce: vi.fn(), start: vi.fn(), stop: vi.fn() },
      recovery: { runOnce: vi.fn(), start: vi.fn(), stop: vi.fn() },
      abortInFlight: vi.fn(),
      setAcceptingWork: vi.fn(),
      queue: { close: vi.fn(), waitUntilReady: vi.fn() },
      worker: {
        close: vi.fn(),
        pause: vi.fn(),
        run: runWorker,
        waitUntilReady: vi.fn(),
        on: vi.fn(),
        off: vi.fn()
      },
      postgres: { close: vi.fn(), pool: { query: vi.fn() } },
      chartEngine: { checkReady: vi.fn() },
      logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
    });
    const startup = runtime.startup();
    await vi.waitFor(() => expect(readinessServer.listen).toHaveBeenCalledOnce());

    await runtime.shutdown();
    readinessServer.listening = true;
    listenCallback?.();
    await startup;

    expect(readinessServer.close).toHaveBeenCalledOnce();
    expect(runWorker).toHaveBeenCalledOnce();
  });

  it("bounds a stuck intake pause and still aborts active work during shutdown", async () => {
    vi.useFakeTimers();
    const abortInFlight = vi.fn();
    const closeWorker = vi.fn();
    const runtime = createChartWorkerRuntime({
      readinessServer: {
        listen: vi.fn((_port, _host, cb) => cb()),
        once: vi.fn(),
        off: vi.fn(),
        close: vi.fn((cb) => cb()),
        listening: false
      } as never,
      readinessPort: 3012,
      readinessHost: "127.0.0.1",
      operationTimeoutMs: 100,
      relay: { runOnce: vi.fn(), start: vi.fn(), stop: vi.fn() },
      recovery: { runOnce: vi.fn(), start: vi.fn(), stop: vi.fn() },
      abortInFlight,
      setAcceptingWork: vi.fn(),
      queue: { close: vi.fn(), waitUntilReady: vi.fn() },
      worker: {
        close: closeWorker,
        pause: vi.fn(() => new Promise<void>(() => undefined)),
        run: vi.fn(() => new Promise<void>(() => undefined)),
        waitUntilReady: vi.fn(),
        on: vi.fn(),
        off: vi.fn()
      },
      postgres: { close: vi.fn(), pool: { query: vi.fn() } },
      chartEngine: { checkReady: vi.fn() },
      logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
    });
    await runtime.startup();
    const shutdown = runtime.shutdown().catch((error: unknown) => error);

    await vi.advanceTimersByTimeAsync(100);

    await expect(shutdown).resolves.toMatchObject({ message: "CHART_WORKER_SHUTDOWN_INCOMPLETE" });
    expect(abortInFlight).toHaveBeenCalledOnce();
    expect(closeWorker).toHaveBeenCalledOnce();
  });

  it("shuts down and reports fatal when Bull intake stops unexpectedly", async () => {
    const intake = deferred<void>();
    const onFatalWorkerStop = vi.fn();
    const closeWorker = vi.fn();
    const closeQueue = vi.fn();
    const closePostgres = vi.fn();
    const closeReadiness = vi.fn((callback) => callback());
    const runtime = createChartWorkerRuntime({
      readinessServer: {
        listen: vi.fn((_port, _host, cb) => cb()),
        once: vi.fn(),
        off: vi.fn(),
        close: closeReadiness,
        listening: true
      } as never,
      readinessPort: 3012,
      readinessHost: "127.0.0.1",
      operationTimeoutMs: 1_000,
      relay: { runOnce: vi.fn(), start: vi.fn(), stop: vi.fn() },
      recovery: { runOnce: vi.fn(), start: vi.fn(), stop: vi.fn() },
      abortInFlight: vi.fn(),
      setAcceptingWork: vi.fn(),
      onFatalWorkerStop,
      queue: { close: closeQueue, waitUntilReady: vi.fn() },
      worker: {
        close: closeWorker,
        pause: vi.fn(),
        run: vi.fn(() => intake.promise),
        waitUntilReady: vi.fn(),
        on: vi.fn(),
        off: vi.fn()
      },
      postgres: { close: closePostgres, pool: { query: vi.fn() } },
      chartEngine: { checkReady: vi.fn() },
      logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
    });
    await runtime.startup();

    intake.reject(new Error("sensitive redis transport details"));

    await vi.waitFor(() => expect(onFatalWorkerStop).toHaveBeenCalledOnce());
    expect(closeReadiness).toHaveBeenCalledOnce();
    expect(closeWorker).toHaveBeenCalledOnce();
    expect(closeQueue).toHaveBeenCalledOnce();
    expect(closePostgres).toHaveBeenCalledOnce();
  });

  it("shuts down and reports fatal when Bull intake resolves unexpectedly", async () => {
    const intake = deferred<void>();
    const onFatalWorkerStop = vi.fn();
    const setAcceptingWork = vi.fn();
    const runtime = createChartWorkerRuntime({
      readinessServer: {
        listen: vi.fn((_port, _host, cb) => cb()),
        once: vi.fn(),
        off: vi.fn(),
        close: vi.fn((cb) => cb()),
        listening: true
      } as never,
      readinessPort: 3012,
      readinessHost: "127.0.0.1",
      operationTimeoutMs: 1_000,
      relay: { runOnce: vi.fn(), start: vi.fn(), stop: vi.fn() },
      recovery: { runOnce: vi.fn(), start: vi.fn(), stop: vi.fn() },
      abortInFlight: vi.fn(),
      setAcceptingWork,
      onFatalWorkerStop,
      queue: { close: vi.fn(), waitUntilReady: vi.fn() },
      worker: {
        close: vi.fn(),
        pause: vi.fn(),
        run: vi.fn(() => intake.promise),
        waitUntilReady: vi.fn(),
        on: vi.fn(),
        off: vi.fn()
      },
      postgres: { close: vi.fn(), pool: { query: vi.fn() } },
      chartEngine: { checkReady: vi.fn() },
      logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
    });
    await runtime.startup();

    intake.resolve(undefined);

    await vi.waitFor(() => expect(onFatalWorkerStop).toHaveBeenCalledOnce());
    expect(setAcceptingWork).toHaveBeenLastCalledWith(false);
  });
});

describe("createChartJobRecovery", () => {
  it("runs bounded expired-job recovery periodically", async () => {
    vi.useFakeTimers();
    const store = {
      recoverExpired: vi.fn().mockResolvedValue({
        requeuedJobIds: ["11111111-1111-4111-8111-111111111111"],
        failedJobIds: ["22222222-2222-4222-8222-222222222222"]
      }),
      recoverPendingDeliveries: vi.fn().mockResolvedValue({
        rearmedJobIds: ["33333333-3333-4333-8333-333333333333"]
      })
    };
    const logger = { info: vi.fn(), error: vi.fn() };
    const recovery = createChartJobRecovery({
      store,
      limit: 42,
      intervalMs: 1_000,
      operationTimeoutMs: 100,
      logger
    });

    await recovery.runOnce();
    recovery.start();
    await vi.advanceTimersByTimeAsync(1_000);
    await recovery.stop();

    expect(store.recoverExpired).toHaveBeenCalledTimes(2);
    expect(store.recoverExpired).toHaveBeenNthCalledWith(1, { limit: 42 });
    expect(store.recoverExpired).toHaveBeenNthCalledWith(2, { limit: 42 });
    expect(store.recoverPendingDeliveries).toHaveBeenCalledTimes(2);
    expect(store.recoverPendingDeliveries).toHaveBeenNthCalledWith(1, { limit: 42 });
    expect(store.recoverPendingDeliveries).toHaveBeenNthCalledWith(2, { limit: 42 });
    expect(logger.info).toHaveBeenLastCalledWith("chart calculation recovery completed", {
      durationMs: expect.any(Number),
      failedCount: 1,
      rearmedCount: 1,
      requeuedCount: 1
    });
  });

  it("redacts storage failures from recovery observability", async () => {
    const sensitive = "PRIVATE_SQL_INPUT_SNAPSHOT_AND_REDIS_CREDENTIALS";
    const logger = { info: vi.fn(), error: vi.fn() };
    const recovery = createChartJobRecovery({
      store: {
        recoverExpired: vi.fn().mockRejectedValue(new Error(sensitive)),
        recoverPendingDeliveries: vi.fn().mockResolvedValue({ rearmedJobIds: [] })
      },
      limit: 42,
      intervalMs: 1_000,
      operationTimeoutMs: 100,
      logger
    });

    await expect(recovery.runOnce()).rejects.toThrow(sensitive);

    expect(logger.error).toHaveBeenCalledWith("chart calculation recovery failed", {
      durationMs: expect.any(Number),
      errorCode: "chart_recovery_failed"
    });
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain(sensitive);
  });

  it("reports a recovery deadline without overlapping the still-running query", async () => {
    vi.useFakeTimers();
    const operation = deferred<{ requeuedJobIds: never[]; failedJobIds: never[] }>();
    const store = {
      recoverExpired: vi.fn(() => operation.promise),
      recoverPendingDeliveries: vi.fn().mockResolvedValue({ rearmedJobIds: [] })
    };
    const logger = { info: vi.fn(), error: vi.fn() };
    const recovery = createChartJobRecovery({
      store,
      limit: 42,
      intervalMs: 1_000,
      operationTimeoutMs: 100,
      logger
    });
    const running = recovery.runOnce().catch((error: unknown) => error);

    await vi.advanceTimersByTimeAsync(100);

    await expect(running).resolves.toMatchObject({
      message: "CHART_RECOVERY_OPERATION_DEADLINE_EXCEEDED"
    });
    expect(logger.error).toHaveBeenCalledWith("chart calculation recovery failed", {
      durationMs: expect.any(Number),
      errorCode: "chart_recovery_deadline_exceeded"
    });
    recovery.start();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(store.recoverExpired).toHaveBeenCalledOnce();

    let stopped = false;
    const stopping = recovery.stop().then(() => {
      stopped = true;
    });
    await Promise.resolve();
    expect(stopped).toBe(false);
    operation.resolve({ requeuedJobIds: [], failedJobIds: [] });
    await stopping;
    expect(logger.error).toHaveBeenCalledOnce();
    expect(logger.info).not.toHaveBeenCalled();
  });
});

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T | PromiseLike<T>) => void;
  readonly reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((settle, fail) => {
    resolve = settle;
    reject = fail;
  });
  return { promise, resolve, reject };
}
