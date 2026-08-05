import {
  FlowWorkerReadinessLeaseLostError,
  type FlowWorkerReadinessAuthority,
  type FlowWorkerReadinessStore,
  type FlowWorkerRegistration
} from "@elevenhouse/domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createFlowWorkerControl } from "./flow-worker-control";

describe("createFlowWorkerControl", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("registers one exact executor session and heartbeats below the DB lease TTL", async () => {
    const store = createStore();
    const control = createControl(store);

    await control.register();
    control.start();
    expect(control.isClaimingAllowed()).toBe(true);
    expect(store.register).toHaveBeenCalledTimes(1);
    expect(store.register).toHaveBeenCalledWith(registration);

    await vi.advanceTimersByTimeAsync(1_999);
    expect(store.heartbeat).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(store.heartbeat).toHaveBeenCalledTimes(1);
    expect(control.getOperationalReadiness()).toMatchObject({
      status: "ready",
      lifecycle: "running",
      policyRevision: 1
    });
  });

  it("never overlaps heartbeats and closes local claims through a transient failure", async () => {
    const pending = deferred<FlowWorkerReadinessAuthority>();
    const store = createStore();
    vi.mocked(store.heartbeat)
      .mockImplementationOnce(() => pending.promise)
      .mockRejectedValueOnce(new Error("temporary database outage"))
      .mockResolvedValue(authority(3, 2));
    const control = createControl(store);
    await control.register();
    control.start();

    await vi.advanceTimersByTimeAsync(2_000);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(store.heartbeat).toHaveBeenCalledTimes(1);
    pending.resolve(authority(2, 1));
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(control.isClaimingAllowed()).toBe(false);
    expect(control.getOperationalReadiness()).toMatchObject({
      status: "unready",
      errorCode: "flow_worker_readiness_heartbeat_failed"
    });

    await vi.advanceTimersByTimeAsync(1_000);
    expect(store.heartbeat).toHaveBeenCalledTimes(3);
    expect(control.isClaimingAllowed()).toBe(true);
  });

  it("treats lease loss as terminal and reports only one fatal signal", async () => {
    const store = createStore();
    vi.mocked(store.heartbeat).mockRejectedValue(new FlowWorkerReadinessLeaseLostError());
    const onFatal = vi.fn();
    const control = createControl(store, { onFatal });
    await control.register();
    control.start();

    await vi.advanceTimersByTimeAsync(2_000);
    await vi.advanceTimersByTimeAsync(20_000);

    expect(onFatal).toHaveBeenCalledTimes(1);
    expect(onFatal.mock.calls[0]?.[0]).toBeInstanceOf(FlowWorkerReadinessLeaseLostError);
    expect(control.isClaimingAllowed()).toBe(false);
    expect(control.getOperationalReadiness()).toMatchObject({
      status: "unready",
      lifecycle: "failed",
      errorCode: "flow_worker_readiness_lease_lost"
    });
  });

  it("closes local claims before serialized DB drain and cancels future heartbeats", async () => {
    const heartbeat = deferred<FlowWorkerReadinessAuthority>();
    const drain = deferred<FlowWorkerReadinessAuthority>();
    const store = createStore();
    vi.mocked(store.heartbeat).mockImplementationOnce(() => heartbeat.promise);
    vi.mocked(store.beginDrain).mockImplementationOnce(() => drain.promise);
    const control = createControl(store);
    await control.register();
    control.start();
    await vi.advanceTimersByTimeAsync(2_000);

    const draining = control.beginDrain();
    expect(control.isClaimingAllowed()).toBe(false);
    expect(store.beginDrain).not.toHaveBeenCalled();
    heartbeat.resolve(authority(2, 1));
    await vi.advanceTimersByTimeAsync(0);
    expect(store.beginDrain).toHaveBeenCalledTimes(1);
    drain.resolve(drainingAuthority());
    await draining;
    await vi.advanceTimersByTimeAsync(20_000);
    expect(store.heartbeat).toHaveBeenCalledTimes(1);
    expect(control.getOperationalReadiness()).toMatchObject({
      status: "unready",
      lifecycle: "draining"
    });
  });
});

const registration: FlowWorkerRegistration = {
  schemaVersion: "flow-worker-registration.v2",
  sessionId: "00000000-0000-4000-8000-000000000011",
  instanceId: "flows-worker-test-a",
  roles: ["executor"],
  maxRuntimeMode: "canary",
  maxCanaryOwnerSubjectIds: ["00000000-0000-4000-8000-000000000001"],
  requirementKeys: ["executor:completed:1:1", "runtime:flow-interpreter.v1"],
  deploymentId: "deployment-test",
  buildId: "build-test"
};

function createControl(
  store: FlowWorkerReadinessStore,
  overrides: Partial<Parameters<typeof createFlowWorkerControl>[0]> = {}
) {
  return createFlowWorkerControl({
    store,
    registration,
    heartbeatIntervalMaxMs: 2_000,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    onFatal: vi.fn(),
    ...overrides
  });
}

function createStore(): FlowWorkerReadinessStore {
  return {
    register: vi.fn(async () => authority(1, 1)),
    heartbeat: vi.fn(async () => authority(2, 1)),
    beginDrain: vi.fn(async () => drainingAuthority())
  };
}

function authority(sequence: number, revision: number): FlowWorkerReadinessAuthority {
  const heartbeatAt = new Date(Date.now()).toISOString();
  return {
    schemaVersion: "flow-worker-readiness-authority.v1",
    instanceId: registration.instanceId,
    sessionId: registration.sessionId,
    state: "ready",
    policyRevision: revision,
    heartbeatSequence: sequence,
    heartbeatAt,
    readyUntil: new Date(Date.now() + 30_000).toISOString(),
    drainingAt: null
  };
}

function drainingAuthority(): FlowWorkerReadinessAuthority {
  const drainingAt = new Date(Date.now()).toISOString();
  return {
    schemaVersion: "flow-worker-readiness-authority.v1",
    instanceId: registration.instanceId,
    sessionId: registration.sessionId,
    state: "draining",
    policyRevision: 1,
    heartbeatSequence: 3,
    heartbeatAt: drainingAt,
    readyUntil: drainingAt,
    drainingAt
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
