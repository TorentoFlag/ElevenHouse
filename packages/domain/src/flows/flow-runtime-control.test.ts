import type { FlowCapabilityManifestV2 } from "@elevenhouse/contracts";
import { describe, expect, it } from "vitest";

import {
  FlowRuntimeControlIntegrityError,
  createFlowExecutionRequirementKeys,
  createFlowExecutionWorkerRequirementKeys,
  createFlowRuntimeRolloutPolicyEvidence,
  createFlowWorkerRegistration,
  createFlowWorkerRegistrationDigest,
  createFlowRuntimeRequirementKeys,
  evaluateFlowActivationRuntimeControl,
  verifyFlowRuntimeRolloutPolicyEvidence,
  type FlowAutomationQuotaReadiness,
  type FlowRuntimeRolloutPolicy,
  type FlowWorkerReadinessLease
} from "./flow-runtime-control";

const ids = {
  owner: "00000000-0000-4000-8000-000000000001",
  otherOwner: "00000000-0000-4000-8000-000000000002",
  flow: "00000000-0000-4000-8000-000000000003",
  version: "00000000-0000-4000-8000-000000000004"
} as const;

const checkedAt = "2026-08-04T10:00:00.000Z";

describe("Flow persisted runtime control", () => {
  it("derives stable exact requirements from the immutable V2 manifest", () => {
    expect(createFlowRuntimeRequirementKeys(manifest())).toEqual([
      "capability:clients.birth_data.read.service_preparation",
      "executor:birth_data_available:1:1",
      "executor:completed:1:1",
      "runtime:flow-interpreter.v1",
      "trigger:booking_confirmed:1:1:1"
    ]);
  });

  it("derives execution requirements without treating a trigger as claimable work", () => {
    const expected = [
      "capability:clients.birth_data.read.service_preparation",
      "executor:birth_data_available:1:1",
      "executor:completed:1:1",
      "runtime:flow-interpreter.v1"
    ];

    expect(createFlowExecutionRequirementKeys(manifest())).toEqual(expected);
  });

  it("derives exact deployed worker requirements from the real executor registry and capabilities", () => {
    expect(
      createFlowExecutionWorkerRequirementKeys(["completed:1:1"], ["products.read"])
    ).toEqual([
      "capability:products.read",
      "executor:completed:1:1",
      "runtime:flow-interpreter.v1"
    ]);
    expect(() =>
      createFlowExecutionWorkerRequirementKeys(["completed:1:1", "completed:1:1"])
    ).toThrow(FlowRuntimeControlIntegrityError);
    expect(() =>
      createFlowExecutionWorkerRequirementKeys(["completed:1:1"], ["products.read", "products.read"])
    ).toThrow(FlowRuntimeControlIntegrityError);
  });

  it("normalizes one immutable worker registration and rejects ambiguous inventory", () => {
    const registration = createFlowWorkerRegistration({
      schemaVersion: "flow-worker-registration.v2",
      sessionId: "00000000-0000-4000-8000-000000000090",
      instanceId: "flows-worker-a",
      roles: ["executor", "enrollment"],
      maxRuntimeMode: "canary",
      maxCanaryOwnerSubjectIds: [ids.otherOwner, ids.owner],
      requirementKeys: ["runtime:flow-interpreter.v1", "executor:completed:1:1"],
      deploymentId: "deployment-a",
      buildId: "build-a"
    });
    expect(registration).toMatchObject({
      roles: ["enrollment", "executor"],
      maxCanaryOwnerSubjectIds: [ids.owner, ids.otherOwner],
      requirementKeys: ["executor:completed:1:1", "runtime:flow-interpreter.v1"]
    });
    expect(createFlowWorkerRegistrationDigest(registration)).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(createFlowWorkerRegistrationDigest(registration)).toBe(
      createFlowWorkerRegistrationDigest(
        createFlowWorkerRegistration({
          ...registration,
          roles: ["executor", "enrollment"],
          maxCanaryOwnerSubjectIds: [ids.otherOwner, ids.owner],
          requirementKeys: ["runtime:flow-interpreter.v1", "executor:completed:1:1"]
        })
      )
    );

    expect(() =>
      createFlowWorkerRegistration({
        schemaVersion: "flow-worker-registration.v2",
        sessionId: "00000000-0000-4000-8000-000000000090",
        instanceId: "flows-worker-a",
        roles: ["executor", "executor"],
        maxRuntimeMode: "enabled",
        maxCanaryOwnerSubjectIds: [],
        requirementKeys: ["runtime:flow-interpreter.v1"],
        deploymentId: "deployment-a",
        buildId: "build-a"
      })
    ).toThrow(FlowRuntimeControlIntegrityError);
  });

  it("seals and verifies the complete rollout and containment snapshot", () => {
    const evidence = createFlowRuntimeRolloutPolicyEvidence(
      policy({
        revision: 1,
        mode: "definition_only",
        canaryOwnerSubjectIds: [],
        allowedRequirementKeys: [],
        killSwitches: {
          enrollment: { global: true, ownerSubjectIds: [], capabilityKeys: [] },
          claim: { global: true, ownerSubjectIds: [], capabilityKeys: [] },
          externalDispatch: { global: true, ownerSubjectIds: [], capabilityKeys: [] }
        }
      })
    );

    expect(evidence.policyDigest).toBe(
      "sha256:8f179908494865d038955f31b1adfc69b1448e36d69a1f4eda3bfee8201f9f4c"
    );
    expect(verifyFlowRuntimeRolloutPolicyEvidence(evidence)).toEqual(evidence.policy);
    expect(() =>
      verifyFlowRuntimeRolloutPolicyEvidence({
        ...evidence,
        canonicalPreimage: `${evidence.canonicalPreimage} `
      })
    ).toThrow(FlowRuntimeControlIntegrityError);
  });

  it("rejects non-canonical persisted arrays instead of normalizing authority evidence", () => {
    const evidence = createFlowRuntimeRolloutPolicyEvidence(
      policy({ canaryOwnerSubjectIds: [ids.otherOwner, ids.owner] })
    );

    expect(() =>
      verifyFlowRuntimeRolloutPolicyEvidence({
        ...evidence,
        policy: {
          ...evidence.policy,
          canaryOwnerSubjectIds: [ids.otherOwner, ids.owner]
        }
      })
    ).toThrow(FlowRuntimeControlIntegrityError);
  });

  it("keeps the maximum valid policy within the persisted canonical evidence bound", () => {
    const ownerUserIds = Array.from(
      { length: 100 },
      (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`
    );
    const requirementKeys = Array.from(
      { length: 256 },
      (_, index) => `capability:${String(index).padStart(3, "0")}:${"a".repeat(224)}`
    );
    const evidence = createFlowRuntimeRolloutPolicyEvidence(
      policy({
        canaryOwnerSubjectIds: ownerUserIds,
        allowedRequirementKeys: requirementKeys,
        killSwitches: {
          enrollment: {
            global: false,
            ownerSubjectIds: ownerUserIds,
            capabilityKeys: requirementKeys
          },
          claim: {
            global: false,
            ownerSubjectIds: ownerUserIds,
            capabilityKeys: requirementKeys
          },
          externalDispatch: {
            global: false,
            ownerSubjectIds: ownerUserIds,
            capabilityKeys: requirementKeys
          }
        }
      })
    );

    expect(evidence.canonicalPreimage.length).toBeLessThanOrEqual(300_000);
  });

  it("allows separate fresh enrollment and executor roles to prove exact coverage", () => {
    const requirements = createFlowRuntimeRequirementKeys(manifest());
    const decision = evaluateFlowActivationRuntimeControl(
      input({
        workerLeases: [
          workerLease({
            instanceId: "flows-enrollment-a",
            roles: ["enrollment"],
            requirementKeys: requirements.filter(
              (key) => key.startsWith("runtime:") || key.startsWith("trigger:")
            )
          }),
          workerLease({
            instanceId: "flows-executor-a",
            roles: ["executor"],
            requirementKeys: requirements.filter((key) => !key.startsWith("trigger:"))
          })
        ]
      })
    );

    expect(decision).toEqual({
      schemaVersion: "flow-activation-transaction-readiness.v1",
      flowId: ids.flow,
      versionId: ids.version,
      definitionRevision: 7,
      enrollmentRevision: 2,
      expectedActiveVersionId: null,
      runtimeMode: "canary",
      rolloutPolicyRevision: 4,
      checkedAt,
      decision: "ready",
      blockers: []
    });
  });

  it("blocks definition-only rollout and owners outside the persisted canary", () => {
    expect(
      evaluateFlowActivationRuntimeControl(
        input({ policy: policy({ mode: "definition_only", canaryOwnerSubjectIds: [] }) })
      ).blockers
    ).toEqual([
      {
        code: "FLOW_RUNTIME_ROLLOUT_DISABLED",
        path: "runtime.rollout.mode",
        capabilityKey: null
      }
    ]);

    expect(
      evaluateFlowActivationRuntimeControl(
        input({
          ownerUserId: ids.otherOwner,
          ownerSubjectId: ids.otherOwner,
          workerLeases: [workerLease({ maxCanaryOwnerSubjectIds: [ids.otherOwner] })]
        })
      ).blockers
    ).toEqual([
      {
        code: "FLOW_RUNTIME_OWNER_NOT_IN_CANARY",
        path: "runtime.rollout.canaryOwnerSubjects",
        capabilityKey: null
      }
    ]);
  });

  it("blocks requirements outside the current persisted capability allowlist", () => {
    const rejected = "capability:clients.birth_data.read.service_preparation";
    const allowedRequirementKeys = createFlowRuntimeRequirementKeys(manifest()).filter(
      (key) => key !== rejected
    );

    expect(
      evaluateFlowActivationRuntimeControl(
        input({ policy: policy({ allowedRequirementKeys }), workerLeases: [workerLease()] })
      ).blockers
    ).toEqual([
      {
        code: "FLOW_REQUIRED_CAPABILITY_NOT_READY",
        path: `runtime.rollout.allowedRequirements.${rejected}`,
        capabilityKey: rejected
      }
    ]);
  });

  it("does not compose executor readiness from capability-split replicas", () => {
    const requirements = createFlowRuntimeRequirementKeys(manifest());
    const executorRequirements = requirements.filter((key) => !key.startsWith("trigger:"));
    const splitAt = Math.ceil(executorRequirements.length / 2);

    expect(
      evaluateFlowActivationRuntimeControl(
        input({
          workerLeases: [
            workerLease({
              instanceId: "flows-enrollment-a",
              roles: ["enrollment"],
              requirementKeys: requirements.filter(
                (key) => key.startsWith("runtime:") || key.startsWith("trigger:")
              )
            }),
            workerLease({
              instanceId: "flows-executor-a",
              roles: ["executor"],
              requirementKeys: executorRequirements.slice(0, splitAt)
            }),
            workerLease({
              instanceId: "flows-executor-b",
              roles: ["executor"],
              requirementKeys: executorRequirements.slice(splitAt)
            }),
            workerLease({
              instanceId: "flows-executor-stale",
              roles: ["executor"],
              readyUntil: checkedAt
            })
          ]
        })
      ).blockers
    ).toContainEqual({
      code: "FLOW_EXECUTION_WORKER_NOT_READY",
      path: "runtime.workers.executor.singleWorkerCoverage",
      capabilityKey: null
    });
  });

  it("uses the atomic policy snapshot for enrollment and claim kill switches", () => {
    const requirementKey = createFlowRuntimeRequirementKeys(manifest()).find((key) =>
      key.startsWith("executor:")
    );
    if (!requirementKey) throw new Error("Expected executor requirement fixture");

    expect(
      evaluateFlowActivationRuntimeControl(
        input({
          workerLeases: [workerLease()],
          policy: policy({
            killSwitches: {
              enrollment: { global: true, ownerSubjectIds: [], capabilityKeys: [] },
              claim: {
                global: false,
                ownerSubjectIds: [],
                capabilityKeys: [requirementKey]
              },
              externalDispatch: {
                global: true,
                ownerSubjectIds: [ids.owner],
                capabilityKeys: []
              }
            }
          })
        })
      ).blockers
    ).toEqual([
      {
        code: "FLOW_RUNTIME_KILL_SWITCH_ENGAGED",
        path: "runtime.killSwitches.claim.capability",
        capabilityKey: requirementKey
      },
      {
        code: "FLOW_RUNTIME_KILL_SWITCH_ENGAGED",
        path: "runtime.killSwitches.enrollment.global",
        capabilityKey: null
      }
    ]);
  });

  it.each([
    [
      { kind: "not_ready" } satisfies FlowAutomationQuotaReadiness,
      "FLOW_AUTOMATION_QUOTA_NOT_READY"
    ],
    [
      { kind: "exceeded", limit: 2, activeAllocations: 2 } satisfies FlowAutomationQuotaReadiness,
      "FLOW_AUTOMATION_QUOTA_EXCEEDED"
    ],
    [
      { kind: "entitlement_unavailable" } satisfies FlowAutomationQuotaReadiness,
      "FLOW_ENTITLEMENT_UNAVAILABLE"
    ]
  ] as const)("maps quota authority %o to %s", (quota, code) => {
    expect(
      evaluateFlowActivationRuntimeControl(input({ workerLeases: [workerLease()], quota })).blockers
    ).toContainEqual({
      code,
      path: "runtime.quota",
      capabilityKey: null
    });
  });

  it("fails closed on impossible policy snapshots or readiness projections", () => {
    expect(() =>
      evaluateFlowActivationRuntimeControl(
        input({ policy: policy({ mode: "canary", canaryOwnerSubjectIds: [] }) })
      )
    ).toThrow(FlowRuntimeControlIntegrityError);
    expect(() =>
      evaluateFlowActivationRuntimeControl(
        input({
          workerLeases: [
            workerLease({
              policyRevision: 0,
              requirementKeys: ["runtime:flow-interpreter.v1", "runtime:flow-interpreter.v1"]
            })
          ]
        })
      )
    ).toThrow(FlowRuntimeControlIntegrityError);
    expect(() =>
      evaluateFlowActivationRuntimeControl(
        input({
          policy: policy({
            killSwitches: {
              ...emptyKillSwitches(),
              claim: {
                global: false,
                ownerSubjectIds: [ids.owner, ids.owner],
                capabilityKeys: []
              }
            }
          })
        })
      )
    ).toThrow(FlowRuntimeControlIntegrityError);
  });
});

function input(
  overrides: Partial<Parameters<typeof evaluateFlowActivationRuntimeControl>[0]> = {}
): Parameters<typeof evaluateFlowActivationRuntimeControl>[0] {
  return {
    flowId: ids.flow,
    ownerUserId: ids.owner,
    ownerSubjectId: ids.owner,
    versionId: ids.version,
    definitionRevision: 7,
    enrollmentRevision: 2,
    expectedActiveVersionId: null,
    manifest: manifest(),
    policy: policy(),
    workerLeases: [],
    quota: { kind: "ready", limit: 10, activeAllocations: 1 },
    checkedAt,
    ...overrides
  };
}

function policy(overrides: Partial<FlowRuntimeRolloutPolicy> = {}): FlowRuntimeRolloutPolicy {
  return {
    schemaVersion: "flow-runtime-rollout-policy.v2",
    revision: 4,
    mode: "canary",
    canaryOwnerSubjectIds: [ids.owner],
    allowedRequirementKeys: createFlowRuntimeRequirementKeys(manifest()),
    killSwitches: emptyKillSwitches(),
    readinessLeaseTtlMs: 30_000,
    tokenLeaseDurationMs: 30_000,
    ...overrides
  };
}

function workerLease(overrides: Partial<FlowWorkerReadinessLease> = {}): FlowWorkerReadinessLease {
  return {
    schemaVersion: "flow-worker-readiness-lease.v1",
    instanceId: "flows-worker-primary",
    state: "ready",
    policyRevision: 4,
    roles: ["enrollment", "executor"],
    maxRuntimeMode: "canary",
    maxCanaryOwnerSubjectIds: [ids.owner],
    requirementKeys: createFlowRuntimeRequirementKeys(manifest()),
    readyUntil: "2026-08-04T10:00:30.000Z",
    ...overrides
  };
}

function emptyKillSwitches(): FlowRuntimeRolloutPolicy["killSwitches"] {
  return {
    enrollment: { global: false, ownerSubjectIds: [], capabilityKeys: [] },
    claim: { global: false, ownerSubjectIds: [], capabilityKeys: [] },
    externalDispatch: { global: false, ownerSubjectIds: [], capabilityKeys: [] }
  };
}

function manifest(): FlowCapabilityManifestV2 {
  return {
    schemaVersion: "flow-capability-manifest.v2",
    executionSemanticsVersion: "flow-interpreter.v1",
    triggerMatcher: {
      kind: "booking_confirmed",
      configSchemaVersion: 1,
      matcherContractVersion: 1,
      eventSchemaVersion: 1
    },
    nodeExecutors: [
      { kind: "completed", configSchemaVersion: 1, executorContractVersion: 1 },
      { kind: "birth_data_available", configSchemaVersion: 1, executorContractVersion: 1 }
    ],
    requiredCapabilities: ["clients.birth_data.read.service_preparation"]
  };
}
