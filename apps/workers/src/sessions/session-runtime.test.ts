import { afterEach, describe, expect, it, vi } from "vitest";
import { createSessionRuntime } from "./session-runtime";

afterEach(() => vi.useRealTimers());

describe("createSessionRuntime", () => {
  it("runs projection and maintenance once without overlapping", async () => {
    const project = vi.fn().mockResolvedValue({ processed: 1 });
    const maintain = vi.fn().mockResolvedValue({ expired: [], ended: [] });
    const runtime = createSessionRuntime({
      projectionIntervalMs: 1_000,
      maintenanceIntervalMs: 30_000,
      project,
      maintain,
      onError: vi.fn()
    });

    await runtime.runOnce();
    expect(project).toHaveBeenCalledOnce();
    expect(maintain).toHaveBeenCalledOnce();
    expect(runtime.getOperationalReadiness()).toEqual({ status: "ready" });
  });

  it("drains an in-flight cycle during stop", async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const runtime = createSessionRuntime({
      projectionIntervalMs: 1_000,
      maintenanceIntervalMs: 30_000,
      project: () => pending,
      maintain: async () => undefined,
      onError: vi.fn()
    });

    const run = runtime.runOnce();
    let stopped = false;
    const stop = runtime.stop().then(() => { stopped = true; });
    await Promise.resolve();
    expect(stopped).toBe(false);
    release();
    await Promise.all([run, stop]);
    expect(stopped).toBe(true);
  });
});
