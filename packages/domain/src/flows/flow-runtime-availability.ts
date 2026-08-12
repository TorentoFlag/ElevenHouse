import type { FlowRuntimeAvailability } from "@elevenhouse/contracts";

import {
  FLOW_EXECUTION_SEMANTICS_VERSION,
  type FlowRuntimeRolloutPolicy,
  type FlowWorkerReadinessLease
} from "./flow-runtime-control";

export const FLOW_RUNTIME_EXECUTION_UNAVAILABLE_CODE =
  "FLOW_RUNTIME_EXECUTION_UNAVAILABLE" as const;

export const FLOW_RUNTIME_AVAILABILITY = Object.freeze({
  mode: "definition_only",
  executionAvailable: false,
  reasonCode: FLOW_RUNTIME_EXECUTION_UNAVAILABLE_CODE,
  historySemantics: "durable_execution"
} satisfies FlowRuntimeAvailability);

export type FlowRuntimeAvailabilityReader = {
  readonly readForOwner: (input: {
    readonly ownerUserId: string;
  }) => Promise<FlowRuntimeAvailability>;
};

/**
 * Projects only owner-level runtime admission. Exact graph/version admission stays
 * in the activation review because its manifest and quota requirements are not
 * available to list/approval reads.
 */
export function deriveFlowRuntimeAvailability(input: {
  readonly policy: FlowRuntimeRolloutPolicy;
  readonly ownerSubjectId: string | null;
  readonly workerLeases: readonly FlowWorkerReadinessLease[];
  readonly checkedAt: string;
}): FlowRuntimeAvailability {
  const unavailable = {
    mode: input.policy.mode,
    executionAvailable: false,
    reasonCode: FLOW_RUNTIME_EXECUTION_UNAVAILABLE_CODE,
    historySemantics: "durable_execution"
  } as const;

  const ownerSubjectId = input.ownerSubjectId;
  if (
    input.policy.mode === "definition_only" ||
    input.policy.killSwitches.claim.global ||
    (ownerSubjectId !== null &&
      input.policy.killSwitches.claim.ownerSubjectIds.includes(ownerSubjectId)) ||
    (input.policy.mode === "canary" &&
      (ownerSubjectId === null || !input.policy.canaryOwnerSubjectIds.includes(ownerSubjectId)))
  ) {
    return unavailable;
  }
  if (!hasReadyExecutorLease({ ...input, ownerSubjectId: ownerSubjectId ?? "" }))
    return unavailable;

  return {
    mode: input.policy.mode,
    executionAvailable: true,
    reasonCode: null,
    historySemantics: "durable_execution"
  };
}

function hasReadyExecutorLease(input: {
  readonly policy: FlowRuntimeRolloutPolicy;
  readonly ownerSubjectId: string;
  readonly workerLeases: readonly FlowWorkerReadinessLease[];
  readonly checkedAt: string;
}): boolean {
  const checkedAt = Date.parse(input.checkedAt);
  if (!Number.isFinite(checkedAt)) return false;

  return input.workerLeases.some((lease) => {
    const workerAdmitsPolicyMode =
      input.policy.mode === "enabled"
        ? lease.maxRuntimeMode === "enabled"
        : lease.maxRuntimeMode !== "definition_only";
    const workerAdmitsOwner =
      lease.maxRuntimeMode === "enabled" ||
      (lease.maxRuntimeMode === "canary" &&
        lease.maxCanaryOwnerSubjectIds.includes(input.ownerSubjectId));
    return (
      lease.state === "ready" &&
      lease.policyRevision === input.policy.revision &&
      Date.parse(lease.readyUntil) > checkedAt &&
      lease.roles.includes("executor") &&
      workerAdmitsPolicyMode &&
      workerAdmitsOwner &&
      lease.requirementKeys.includes(`runtime:${FLOW_EXECUTION_SEMANTICS_VERSION}`)
    );
  });
}

export class FlowRuntimeExecutionUnavailableError extends Error {
  readonly code = FLOW_RUNTIME_EXECUTION_UNAVAILABLE_CODE;

  constructor() {
    super("Flow execution is unavailable until the durable flow-graph.v2 runtime is enabled.");
    this.name = "FlowRuntimeExecutionUnavailableError";
  }
}

export function throwFlowRuntimeExecutionUnavailable(): never {
  throw new FlowRuntimeExecutionUnavailableError();
}
