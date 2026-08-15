import { describe, expect, it, vi } from "vitest";

import { createWorkersRuntimeConfig } from "../runtime-config";
import { createFlowExecutionRuntime } from "./flow-execution.runtime";

describe("global Flow execution deployment ceiling", () => {
  it("allows the enabled ceiling without a canary owner list", async () => {
    expect(
      createWorkersRuntimeConfig({
        WORKERS_FLOW_EXECUTION_MAX_MODE: "enabled",
        WORKERS_FLOW_CHART_AI_OPENAI_API_KEY: "worker-ai-test-key"
      }).flowExecution
        .deploymentCeiling
    ).toEqual({ mode: "enabled" });

    const processNext = vi.fn(async () => ({ status: "idle" as const }));
    const runtime = createFlowExecutionRuntime({
      deploymentCeiling: { mode: "enabled" },
      pollIntervalMs: 1_000,
      pollBatchSize: 10,
      recoveryIntervalMs: 5_000,
      workItemWakeIntervalMs: 5_000,
      approvalWakeIntervalMs: 5_000,
      operationTimeoutMs: 10_000,
      drainTimeoutMs: 20_000,
      errorBackoffMaxMs: 30_000,
      errorJitter: 0.5,
      processNext,
      recoverExpired: vi.fn(async () => ({ status: "idle" as const })),
      wakeDueWorkItems: vi.fn(async () => ({
        asOf: "2026-08-12T00:00:00.000Z",
        wokenCount: 0,
        expiredCount: 0,
        staleCount: 0,
        integrityFailureCount: 0,
        hasMore: false
      })),
      wakeDueApprovals: vi.fn(async () => ({
        asOf: "2026-08-12T00:00:00.000Z",
        wokenCount: 0,
        expiredCount: 0,
        staleCount: 0,
        integrityFailureCount: 0,
        hasMore: false
      })),
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    });

    await expect(runtime.runExecutionOnce()).resolves.toEqual({
      status: "idle",
      processedCount: 0
    });
    expect(processNext).toHaveBeenCalledOnce();
  });
});
