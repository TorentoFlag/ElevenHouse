import type {
  FlowExecutionClaim,
  FlowExecutionClaimNextResult,
  FlowExecutionStore,
  FlowNodeExecutor,
  FlowNodeExecutorRegistry
} from "@elevenhouse/domain";
import {
  createBuiltInFlowNodeExecutorRegistry,
  createFlowNodeExecutorRegistry
} from "@elevenhouse/domain";
import { describe, expect, it, vi } from "vitest";
import { processNextFlowExecution } from "./flow-execution.processor";

describe("processNextFlowExecution", () => {
  it("claims only executor keys supported by this worker and stays idle without evaluating", async () => {
    const evaluate = vi.fn<FlowNodeExecutor["evaluate"]>();
    const registry = registryWith(evaluate);
    const store = createStore({ claim: null });

    await expect(processNextFlowExecution(processorInput(store, registry))).resolves.toEqual({
      status: "idle"
    });

    expect(store.claimNext).toHaveBeenCalledWith({
      leaseOwner: "flows-worker-1",
      leaseDurationMs: 30_000,
      executorKeys: ["completed:1:1"],
      ownerScope: {
        kind: "allowlist",
        ownerUserIds: ["00000000-0000-4000-8000-000000000099"]
      }
    });
    expect(evaluate).not.toHaveBeenCalled();
    expect(store.finalize).not.toHaveBeenCalled();
  });

  it("interprets a claim and exposes an applied fenced finalization", async () => {
    const store = createStore({ claim: completedClaim(), finalizeStatus: "applied" });

    await expect(
      processNextFlowExecution(processorInput(store, createBuiltInFlowNodeExecutorRegistry()))
    ).resolves.toEqual({
      status: "applied",
      tokenId: completedClaim().tokenId,
      runId: completedClaim().runId,
      attemptId: "91000000-0000-4000-8000-000000000001",
      traceSequence: 4n
    });

    expect(store.finalize).toHaveBeenCalledWith({
      claim: completedClaim(),
      decision: {
        kind: "terminal",
        sourceNodeId: "completed",
        terminalStatus: "completed",
        resultCode: "consultation_prepared",
        trace: {
          schemaVersion: "flow-runtime-trace.v1",
          outcome: "terminal",
          nodeKind: "completed",
          reasonCode: "FLOW_GOAL_REACHED",
          resultCode: "consultation_prepared"
        }
      }
    });
  });

  it("reports a stale finalize without claiming durable success", async () => {
    const store = createStore({ claim: completedClaim(), finalizeStatus: "stale" });

    await expect(
      processNextFlowExecution(processorInput(store, createBuiltInFlowNodeExecutorRegistry()))
    ).resolves.toEqual({
      status: "stale",
      tokenId: completedClaim().tokenId,
      runId: completedClaim().runId
    });
  });

  it("does not convert an uncertain finalize failure into a node failure", async () => {
    const finalizeError = Object.assign(new Error("database connection lost after write"), {
      code: "08006"
    });
    const store = createStore({
      claim: completedClaim(),
      finalizeError
    });

    await expect(
      processNextFlowExecution(processorInput(store, createBuiltInFlowNodeExecutorRegistry()))
    ).rejects.toBe(finalizeError);
    expect(store.finalizeFailure).not.toHaveBeenCalled();
  });

  it("persists an interpreter integrity failure as one terminal disposition", async () => {
    const invalidClaim = { ...completedClaim(), nodeId: "missing-node" };
    const store = createStore({
      claim: invalidClaim,
      failureDisposition: "quarantined"
    });

    await expect(
      processNextFlowExecution(processorInput(store, createBuiltInFlowNodeExecutorRegistry()))
    ).resolves.toEqual({
      status: "quarantined",
      tokenId: invalidClaim.tokenId,
      runId: invalidClaim.runId,
      attemptId: "93000000-0000-4000-8000-000000000001",
      traceSequence: 5n,
      reasonCode: "FLOW_TOKEN_NODE_NOT_FOUND"
    });
    expect(store.finalize).not.toHaveBeenCalled();
    expect(store.finalizeFailure).toHaveBeenCalledWith({
      claim: invalidClaim,
      failure: {
        classification: "permanent",
        reasonCode: "FLOW_TOKEN_NODE_NOT_FOUND"
      }
    });
  });

  it("persists an unknown executor exception as a bounded retry without its message", async () => {
    const evaluate = vi.fn<FlowNodeExecutor["evaluate"]>(async () => {
      throw new Error("private client data from executor");
    });
    const store = createStore({
      claim: completedClaim(),
      failureDisposition: "retry_scheduled"
    });

    await expect(
      processNextFlowExecution(processorInput(store, registryWith(evaluate)))
    ).resolves.toEqual({
      status: "retry_scheduled",
      tokenId: completedClaim().tokenId,
      runId: completedClaim().runId,
      attemptId: "93000000-0000-4000-8000-000000000001",
      traceSequence: 5n,
      reasonCode: "FLOW_NODE_EXECUTION_UNEXPECTED_FAILURE",
      availableAt: "2026-08-03T11:00:01.000Z"
    });
    expect(vi.mocked(store.finalizeFailure).mock.calls[0]?.[0].failure).toEqual({
      classification: "retryable",
      reasonCode: "FLOW_NODE_EXECUTION_UNEXPECTED_FAILURE"
    });
  });

  it("reports a pre-claim poison disposition and does not evaluate or finalize it", async () => {
    const evaluate = vi.fn<FlowNodeExecutor["evaluate"]>();
    const registry = registryWith(evaluate);
    const store = createStore({
      claim: null,
      claimResult: {
        status: "quarantined",
        tokenId: completedClaim().tokenId,
        runId: completedClaim().runId,
        attemptId: null,
        traceSequence: 2n,
        reasonCode: "FLOW_PINNED_GRAPH_INVALID"
      }
    });

    await expect(processNextFlowExecution(processorInput(store, registry))).resolves.toEqual({
      status: "quarantined",
      tokenId: completedClaim().tokenId,
      runId: completedClaim().runId,
      attemptId: null,
      traceSequence: 2n,
      reasonCode: "FLOW_PINNED_GRAPH_INVALID"
    });
    expect(evaluate).not.toHaveBeenCalled();
    expect(store.finalize).not.toHaveBeenCalled();
    expect(store.finalizeFailure).not.toHaveBeenCalled();
  });
});

function processorInput(store: FlowExecutionStore, registry: FlowNodeExecutorRegistry) {
  return {
    store,
    registry,
    leaseOwner: "flows-worker-1",
    leaseDurationMs: 30_000,
    ownerScope: {
      kind: "allowlist" as const,
      ownerUserIds: ["00000000-0000-4000-8000-000000000099"]
    }
  };
}

function registryWith(evaluate: FlowNodeExecutor["evaluate"]): FlowNodeExecutorRegistry {
  return createFlowNodeExecutorRegistry([
    {
      kind: "completed",
      configSchemaVersion: 1,
      executorContractVersion: 1,
      evaluate
    }
  ]);
}

function createStore(input: {
  readonly claim: FlowExecutionClaim | null;
  readonly finalizeStatus?: "applied" | "stale";
  readonly finalizeError?: Error;
  readonly failureDisposition?: "retry_scheduled" | "failed_terminal" | "quarantined";
  readonly claimResult?: FlowExecutionClaimNextResult;
}): FlowExecutionStore {
  const finalizeFailure = vi.fn(async () =>
    input.failureDisposition
      ? {
          status: "applied" as const,
          disposition: input.failureDisposition,
          attemptId: "93000000-0000-4000-8000-000000000001",
          traceSequence: 5n,
          availableAt:
            input.failureDisposition === "retry_scheduled" ? "2026-08-03T11:00:01.000Z" : null
        }
      : { status: "stale" as const }
  );
  return {
    claimNext: vi.fn(
      async () =>
        input.claimResult ??
        (input.claim ? { status: "claimed" as const, claim: input.claim } : null)
    ),
    finalize: vi.fn(async () => {
      if (input.finalizeError) throw input.finalizeError;
      return input.finalizeStatus === "applied"
        ? {
            status: "applied" as const,
            attemptId: "91000000-0000-4000-8000-000000000001",
            traceSequence: 4n
          }
        : { status: "stale" as const };
    }),
    finalizeFailure,
    recoverExpired: vi.fn(async () => ({
      recoveredCount: 0,
      retryScheduledCount: 0,
      failedTerminalCount: 0,
      quarantinedCount: 0
    })),
    getRunDetail: vi.fn(async () => null)
  };
}

function completedClaim(): FlowExecutionClaim {
  return {
    tokenId: "92000000-0000-4000-8000-000000000001",
    ownerUserId: "92000000-0000-4000-8000-000000000002",
    runId: "92000000-0000-4000-8000-000000000003",
    flowId: "92000000-0000-4000-8000-000000000004",
    flowVersionId: "92000000-0000-4000-8000-000000000005",
    nodeId: "completed",
    nodeKind: "completed",
    configSchemaVersion: 1,
    executorContractVersion: 1,
    graph: {
      schemaVersion: "flow-graph.v2",
      nodes: [
        {
          id: "manual-client",
          kind: "manual_client",
          displayTitle: "Client selected manually",
          configSchemaVersion: 1,
          executorContractVersion: 1,
          config: {}
        },
        {
          id: "completed",
          kind: "completed",
          displayTitle: "Preparation completed",
          configSchemaVersion: 1,
          executorContractVersion: 1,
          config: { goalKey: "consultation_prepared" }
        }
      ],
      edges: [
        {
          id: "manual-completed",
          sourceNodeId: "manual-client",
          targetNodeId: "completed",
          sourceHandle: "next"
        }
      ]
    },
    capabilityManifest: {
      schemaVersion: "flow-capability-manifest.v2",
      executionSemanticsVersion: "flow-interpreter.v1",
      triggerMatcher: {
        kind: "manual_client",
        configSchemaVersion: 1,
        matcherContractVersion: 1,
        eventSchemaVersion: 1
      },
      nodeExecutors: [{ kind: "completed", configSchemaVersion: 1, executorContractVersion: 1 }],
      requiredCapabilities: []
    },
    leaseOwner: "flows-worker-1",
    nodeActivationSequence: 1n,
    attemptNumber: 2n,
    fencingToken: 7n,
    claimedAt: "2026-08-03T11:00:00.000Z",
    leaseExpiresAt: "2026-08-03T11:00:30.000Z"
  };
}
