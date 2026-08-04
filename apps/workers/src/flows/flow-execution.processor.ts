import {
  classifyFlowExecutionFailure,
  interpretFlowExecutionClaim,
  type FlowExecutionStore,
  type FlowExecutionClaim,
  type FlowExecutionDecision,
  type FlowExecutionFailureReasonCode,
  type FlowExecutionOwnerScope,
  type FlowNodeExecutorRegistry
} from "@elevenhouse/domain";
import type { Logger } from "@elevenhouse/observability";

export type ProcessNextFlowExecutionResult =
  | { readonly status: "idle" }
  | {
      readonly status: "applied";
      readonly tokenId: string;
      readonly runId: string;
      readonly attemptId: string;
      readonly traceSequence: bigint;
    }
  | {
      readonly status: "stale";
      readonly tokenId: string;
      readonly runId: string;
    }
  | {
      readonly status: "retry_scheduled";
      readonly tokenId: string;
      readonly runId: string;
      readonly attemptId: string;
      readonly traceSequence: bigint;
      readonly reasonCode: FlowExecutionFailureReasonCode;
      readonly availableAt: string;
    }
  | {
      readonly status: "failed_terminal";
      readonly tokenId: string;
      readonly runId: string;
      readonly attemptId: string | null;
      readonly traceSequence: bigint;
      readonly reasonCode: FlowExecutionFailureReasonCode;
    }
  | {
      readonly status: "quarantined";
      readonly tokenId: string;
      readonly runId: string;
      readonly attemptId: string | null;
      readonly traceSequence: bigint;
      readonly reasonCode: FlowExecutionFailureReasonCode;
    };

export async function processNextFlowExecution(input: {
  readonly store: FlowExecutionStore;
  readonly registry: FlowNodeExecutorRegistry;
  readonly leaseOwner: string;
  readonly leaseDurationMs: number;
  readonly ownerScope: FlowExecutionOwnerScope;
  readonly logger?: Logger;
}): Promise<ProcessNextFlowExecutionResult> {
  if (input.registry.executorKeys.length === 0) {
    throw new Error("Flow execution worker requires at least one registered executor");
  }

  const claimResult = await input.store.claimNext({
    leaseOwner: input.leaseOwner,
    leaseDurationMs: input.leaseDurationMs,
    executorKeys: input.registry.executorKeys,
    ownerScope: input.ownerScope
  });
  if (!claimResult) return { status: "idle" };
  if (claimResult.status === "quarantined") {
    input.logger?.error("flow execution poison token failed terminally", {
      tokenId: claimResult.tokenId,
      runId: claimResult.runId,
      traceSequence: claimResult.traceSequence.toString(),
      reasonCode: claimResult.reasonCode
    });
    return claimResult;
  }

  const claim = claimResult.claim;
  let decision: FlowExecutionDecision;
  try {
    decision = await interpretFlowExecutionClaim({ claim, registry: input.registry });
  } catch (error) {
    return finalizeExecutionFailure({ ...input, claim, error });
  }

  // A commit response can be lost after the database has applied the decision.
  // Let lease recovery reconcile that uncertainty instead of writing a second outcome.
  const finalized = await input.store.finalize({ claim, decision });
  if (finalized.status === "stale") {
    input.logger?.warn("flow execution finalize rejected a stale lease", {
      tokenId: claim.tokenId,
      runId: claim.runId,
      flowVersionId: claim.flowVersionId,
      fencingToken: claim.fencingToken.toString()
    });
    return { status: "stale", tokenId: claim.tokenId, runId: claim.runId };
  }

  input.logger?.info("flow execution finalized", {
    tokenId: claim.tokenId,
    runId: claim.runId,
    flowVersionId: claim.flowVersionId,
    attemptId: finalized.attemptId,
    traceSequence: finalized.traceSequence.toString()
  });
  return {
    status: "applied",
    tokenId: claim.tokenId,
    runId: claim.runId,
    attemptId: finalized.attemptId,
    traceSequence: finalized.traceSequence
  };
}

async function finalizeExecutionFailure(input: {
  readonly store: FlowExecutionStore;
  readonly logger?: Logger;
  readonly claim: FlowExecutionClaim;
  readonly error: unknown;
}): Promise<ProcessNextFlowExecutionResult> {
  const failure = classifyFlowExecutionFailure(input.error);
  const finalized = await input.store.finalizeFailure({
    claim: input.claim,
    failure
  });
  if (finalized.status === "stale") {
    input.logger?.warn("flow execution failure disposition rejected a stale lease", {
      tokenId: input.claim.tokenId,
      runId: input.claim.runId,
      flowVersionId: input.claim.flowVersionId,
      fencingToken: input.claim.fencingToken.toString(),
      reasonCode: failure.reasonCode
    });
    return { status: "stale", tokenId: input.claim.tokenId, runId: input.claim.runId };
  }

  const context = {
    tokenId: input.claim.tokenId,
    runId: input.claim.runId,
    flowVersionId: input.claim.flowVersionId,
    attemptId: finalized.attemptId,
    traceSequence: finalized.traceSequence.toString(),
    reasonCode: failure.reasonCode
  };
  if (finalized.disposition === "failed_terminal") {
    input.logger?.error("flow execution failed terminally", context);
    return {
      status: "failed_terminal",
      tokenId: input.claim.tokenId,
      runId: input.claim.runId,
      attemptId: finalized.attemptId,
      traceSequence: finalized.traceSequence,
      reasonCode: failure.reasonCode
    };
  }
  if (finalized.disposition === "quarantined") {
    input.logger?.error("flow execution quarantined", context);
    return {
      status: "quarantined",
      tokenId: input.claim.tokenId,
      runId: input.claim.runId,
      attemptId: finalized.attemptId,
      traceSequence: finalized.traceSequence,
      reasonCode: failure.reasonCode
    };
  }
  if (!finalized.availableAt) {
    throw new Error("Retry-scheduled flow execution is missing its database retry time");
  }
  input.logger?.warn("flow execution retry scheduled", {
    ...context,
    availableAt: finalized.availableAt
  });
  return {
    status: "retry_scheduled",
    tokenId: input.claim.tokenId,
    runId: input.claim.runId,
    attemptId: finalized.attemptId,
    traceSequence: finalized.traceSequence,
    reasonCode: failure.reasonCode,
    availableAt: finalized.availableAt
  };
}
