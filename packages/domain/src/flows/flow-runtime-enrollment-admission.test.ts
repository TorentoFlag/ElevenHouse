import { describe, expect, it } from "vitest";

import {
  createFlowBookingEnrollmentWorkerRequirementKeys,
  createFlowManualClientEnrollmentWorkerRequirementKeys,
  evaluateFlowRuntimeEnrollmentAdmission,
  type FlowRuntimeRolloutPolicy,
  type FlowWorkerReadinessLease
} from "./flow-runtime-control";

const ownerSubjectId = "00000000-0000-4000-8000-000000000001";
const otherOwnerSubjectId = "00000000-0000-4000-8000-000000000002";
const checkedAt = "2026-08-04T12:00:00.000Z";
const requirementKeys = [
  "executor:completed:1:1",
  "runtime:flow-interpreter.v1",
  "trigger:booking_confirmed:1:1:1"
] as const;

describe("evaluateFlowRuntimeEnrollmentAdmission", () => {
  it("declares the exact worker protocol requirements for booking enrollment", () => {
    expect(createFlowBookingEnrollmentWorkerRequirementKeys()).toEqual([
      "runtime:flow-interpreter.v1",
      "trigger:booking_confirmed:1:1:1"
    ]);
  });

  it("declares the exact worker protocol requirements for manual-client enrollment", () => {
    expect(createFlowManualClientEnrollmentWorkerRequirementKeys()).toEqual([
      "runtime:flow-interpreter.v1",
      "trigger:manual_client:1:1:1"
    ]);
  });

  it("admits a fresh enrollment worker with full policy and trigger coverage", () => {
    expect(
      evaluateFlowRuntimeEnrollmentAdmission({
        policy: policy(),
        ownerSubjectId,
        requirementKeys,
        workerLease: workerLease(),
        checkedAt
      })
    ).toEqual({ kind: "allowed", policyRevision: 2 });
  });

  it.each([
    {
      name: "definition-only rollout",
      policy: policy({ mode: "definition_only", canaryOwnerSubjectIds: [], allowedRequirementKeys: [] }),
      reasonCode: "FLOW_RUNTIME_ROLLOUT_DISABLED"
    },
    {
      name: "owner outside canary",
      policy: policy({ canaryOwnerSubjectIds: [otherOwnerSubjectId] }),
      reasonCode: "FLOW_RUNTIME_OWNER_NOT_IN_CANARY"
    },
    {
      name: "global enrollment kill switch",
      policy: policy({
        enrollmentKillSwitch: { global: true, ownerSubjectIds: [], capabilityKeys: [] }
      }),
      reasonCode: "FLOW_RUNTIME_ENROLLMENT_KILL_SWITCH_ENGAGED"
    },
    {
      name: "owner enrollment kill switch",
      policy: policy({
        enrollmentKillSwitch: {
          global: false,
          ownerSubjectIds: [ownerSubjectId],
          capabilityKeys: []
        }
      }),
      reasonCode: "FLOW_RUNTIME_ENROLLMENT_KILL_SWITCH_ENGAGED"
    },
    {
      name: "capability enrollment kill switch",
      policy: policy({
        enrollmentKillSwitch: {
          global: false,
          ownerSubjectIds: [],
          capabilityKeys: ["trigger:booking_confirmed:1:1:1"]
        }
      }),
      reasonCode: "FLOW_RUNTIME_ENROLLMENT_KILL_SWITCH_ENGAGED"
    }
  ])("defers $name", ({ policy: rolloutPolicy, reasonCode }) => {
    expect(
      evaluateFlowRuntimeEnrollmentAdmission({
        policy: rolloutPolicy,
        ownerSubjectId,
        requirementKeys,
        workerLease: workerLease(),
        checkedAt
      })
    ).toEqual({ kind: "deferred", policyRevision: 2, reasonCode });
  });

  it("defers when current policy no longer allows a pinned requirement", () => {
    expect(
      evaluateFlowRuntimeEnrollmentAdmission({
        policy: policy({
          allowedRequirementKeys: requirementKeys.filter(
            (key) => key !== "executor:completed:1:1"
          )
        }),
        ownerSubjectId,
        requirementKeys,
        workerLease: workerLease(),
        checkedAt
      })
    ).toEqual({
      kind: "deferred",
      policyRevision: 2,
      reasonCode: "FLOW_RUNTIME_REQUIREMENT_NOT_ALLOWED"
    });
  });

  it.each([
    workerLease({ roles: ["executor"] }),
    workerLease({ requirementKeys: ["runtime:flow-interpreter.v1"] }),
    workerLease({ readyUntil: checkedAt }),
    workerLease({ policyRevision: 1 }),
    workerLease({ maxCanaryOwnerSubjectIds: [otherOwnerSubjectId] })
  ])("defers a worker lease that cannot authoritatively enroll", (lease) => {
    expect(
      evaluateFlowRuntimeEnrollmentAdmission({
        policy: policy(),
        ownerSubjectId,
        requirementKeys,
        workerLease: lease,
        checkedAt
      })
    ).toEqual({
      kind: "deferred",
      policyRevision: 2,
      reasonCode: "FLOW_RUNTIME_ENROLLMENT_WORKER_NOT_READY"
    });
  });
});

function policy(
  overrides: {
    readonly mode?: FlowRuntimeRolloutPolicy["mode"];
    readonly canaryOwnerSubjectIds?: readonly string[];
    readonly allowedRequirementKeys?: readonly string[];
    readonly enrollmentKillSwitch?: FlowRuntimeRolloutPolicy["killSwitches"]["enrollment"];
  } = {}
): FlowRuntimeRolloutPolicy {
  return {
    schemaVersion: "flow-runtime-rollout-policy.v2",
    revision: 2,
    mode: overrides.mode ?? "canary",
    canaryOwnerSubjectIds: overrides.canaryOwnerSubjectIds ?? [ownerSubjectId],
    allowedRequirementKeys: overrides.allowedRequirementKeys ?? requirementKeys,
    killSwitches: {
      enrollment: overrides.enrollmentKillSwitch ?? {
        global: false,
        ownerSubjectIds: [],
        capabilityKeys: []
      },
      claim: { global: false, ownerSubjectIds: [], capabilityKeys: [] },
      externalDispatch: { global: true, ownerSubjectIds: [], capabilityKeys: [] }
    },
    readinessLeaseTtlMs: 30_000,
    tokenLeaseDurationMs: 30_000
  };
}

function workerLease(
  overrides: Partial<FlowWorkerReadinessLease> = {}
): FlowWorkerReadinessLease {
  return {
    schemaVersion: "flow-worker-readiness-lease.v1",
    instanceId: "flows-worker-test",
    state: "ready",
    policyRevision: 2,
    roles: ["enrollment", "executor"],
    maxRuntimeMode: "canary",
    maxCanaryOwnerSubjectIds: [ownerSubjectId],
    requirementKeys,
    readyUntil: "2026-08-04T12:01:00.000Z",
    ...overrides
  };
}
