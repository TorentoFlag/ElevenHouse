import type { FlowRuntimeRolloutPolicy, FlowWorkerReadinessLease } from "./flow-runtime-control";
import { describe, expect, it } from "vitest";

import { deriveFlowRuntimeAvailability } from "./flow-runtime-availability";

const ownerSubjectId = "11111111-1111-4111-8111-111111111111";
const checkedAt = "2026-08-06T10:00:00.000Z";

describe("Flow runtime availability", () => {
  it("only exposes a canary owner when a matching live executor lease exists", () => {
    expect(
      deriveFlowRuntimeAvailability({
        policy: policy({ mode: "canary", canaryOwnerSubjectIds: [ownerSubjectId] }),
        ownerSubjectId,
        workerLeases: [lease()],
        checkedAt
      })
    ).toEqual({
      mode: "canary",
      executionAvailable: true,
      reasonCode: null,
      historySemantics: "durable_execution"
    });
  });

  it("fails closed for a non-canary owner, stale lease, or claim kill switch", () => {
    const base = {
      policy: policy({ mode: "canary", canaryOwnerSubjectIds: [ownerSubjectId] }),
      ownerSubjectId,
      workerLeases: [lease()],
      checkedAt
    } as const;
    for (const input of [
      { ...base, ownerSubjectId: "22222222-2222-4222-8222-222222222222" },
      { ...base, workerLeases: [lease({ readyUntil: checkedAt })] },
      {
        ...base,
        policy: policy({
          mode: "canary",
          canaryOwnerSubjectIds: [ownerSubjectId],
          claimGlobalKillSwitch: true
        })
      }
    ]) {
      expect(deriveFlowRuntimeAvailability(input)).toEqual({
        mode: "canary",
        executionAvailable: false,
        reasonCode: "FLOW_RUNTIME_EXECUTION_UNAVAILABLE",
        historySemantics: "durable_execution"
      });
    }
  });

  it("reports an enabled policy as unavailable when its executor lease is gone", () => {
    expect(
      deriveFlowRuntimeAvailability({
        policy: policy({ mode: "enabled", canaryOwnerSubjectIds: [] }),
        ownerSubjectId,
        workerLeases: [lease({ maxRuntimeMode: "enabled", maxCanaryOwnerSubjectIds: [], readyUntil: checkedAt })],
        checkedAt
      })
    ).toEqual({
      mode: "enabled",
      executionAvailable: false,
      reasonCode: "FLOW_RUNTIME_EXECUTION_UNAVAILABLE",
      historySemantics: "durable_execution"
    });
  });
});

function policy(input: {
  readonly mode: FlowRuntimeRolloutPolicy["mode"];
  readonly canaryOwnerSubjectIds: readonly string[];
  readonly claimGlobalKillSwitch?: boolean;
}): FlowRuntimeRolloutPolicy {
  return {
    schemaVersion: "flow-runtime-rollout-policy.v2",
    revision: 3,
    mode: input.mode,
    canaryOwnerSubjectIds: input.canaryOwnerSubjectIds,
    allowedRequirementKeys: ["runtime:flow-interpreter.v1"],
    killSwitches: {
      enrollment: { global: false, ownerSubjectIds: [], capabilityKeys: [] },
      claim: { global: input.claimGlobalKillSwitch ?? false, ownerSubjectIds: [], capabilityKeys: [] },
      externalDispatch: { global: false, ownerSubjectIds: [], capabilityKeys: [] }
    },
    readinessLeaseTtlMs: 30_000,
    tokenLeaseDurationMs: 30_000
  };
}

function lease(overrides: Partial<FlowWorkerReadinessLease> = {}): FlowWorkerReadinessLease {
  return {
    schemaVersion: "flow-worker-readiness-lease.v1",
    instanceId: "flows-worker-1",
    state: "ready",
    policyRevision: 3,
    roles: ["enrollment", "executor"],
    maxRuntimeMode: "canary",
    maxCanaryOwnerSubjectIds: [ownerSubjectId],
    requirementKeys: ["runtime:flow-interpreter.v1"],
    readyUntil: "2026-08-06T10:00:30.000Z",
    ...overrides
  };
}
