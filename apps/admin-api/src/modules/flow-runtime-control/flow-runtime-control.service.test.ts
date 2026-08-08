import { ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import {
  createFlowRuntimeRolloutPolicyEvidence,
  FlowRuntimeControlCommandIdempotencyConflictError
} from "@elevenhouse/domain";
import { FlowRuntimeControlService } from "./flow-runtime-control.service";

const policy = {
  schemaVersion: "flow-runtime-rollout-policy.v2" as const,
  revision: 1,
  mode: "definition_only" as const,
  canaryOwnerSubjectIds: [],
  allowedRequirementKeys: [],
  killSwitches: {
    enrollment: { global: false, ownerSubjectIds: [], capabilityKeys: [] },
    claim: { global: false, ownerSubjectIds: [], capabilityKeys: [] },
    externalDispatch: { global: false, ownerSubjectIds: [], capabilityKeys: [] }
  },
  readinessLeaseTtlMs: 30_000,
  tokenLeaseDurationMs: 60_000
};

describe("FlowRuntimeControlService", () => {
  it("reads the server-authoritative rollout policy", async () => {
    const reader = { readCurrent: vi.fn(async () => policy) };
    const service = new FlowRuntimeControlService(reader, { executeReplacePolicy: vi.fn() });

    await expect(service.readCurrent()).resolves.toEqual({ policy });
    expect(reader.readCurrent).toHaveBeenCalledOnce();
  });

  it("replaces a policy through the durable idempotent domain command", async () => {
    const nextPolicy = { ...policy, revision: 2, mode: "enabled" as const, allowedRequirementKeys: ["runtime:flow-interpreter.v1"] };
    const store = {
      executeReplacePolicy: vi.fn(async () => ({
        kind: "created" as const,
        outcome: {
          kind: "applied" as const,
          controlRevision: 2,
          policyEvidence: createFlowRuntimeRolloutPolicyEvidence(nextPolicy),
          completedAt: "2026-08-06T12:00:00.000Z"
        }
      }))
    };
    const service = new FlowRuntimeControlService({ readCurrent: vi.fn() }, store);
    const { revision: _revision, ...requestedPolicy } = nextPolicy;
    void _revision;

    await expect(
      service.replace("11111111-1111-4111-8111-111111111111", "control-0001", {
        expectedRevision: 1,
        policy: requestedPolicy,
        reason: "Enable verified Flow runtime"
      })
    ).resolves.toMatchObject({ policy: nextPolicy, command: { kind: "created" } });
  });

  it("maps idempotency conflicts to an observable 409", async () => {
    const service = new FlowRuntimeControlService(
      { readCurrent: vi.fn() },
      { executeReplacePolicy: vi.fn(async () => { throw new FlowRuntimeControlCommandIdempotencyConflictError(); }) }
    );

    await expect(
      service.replace("11111111-1111-4111-8111-111111111111", "control-0001", {
        expectedRevision: 1,
        policy: {
          schemaVersion: "flow-runtime-rollout-policy.v2",
          mode: "definition_only",
          canaryOwnerSubjectIds: [],
          allowedRequirementKeys: [],
          killSwitches: policy.killSwitches,
          readinessLeaseTtlMs: 30_000,
          tokenLeaseDurationMs: 60_000
        },
        reason: "Return to definition-only mode"
      })
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("does not overwrite a policy that another operator has already advanced", async () => {
    const service = new FlowRuntimeControlService(
      { readCurrent: vi.fn() },
      {
        executeReplacePolicy: vi.fn(async () => ({
          kind: "created" as const,
          outcome: {
            kind: "revision_conflict" as const,
            expectedRevision: 1,
            currentRevision: 2,
            completedAt: "2026-08-06T12:00:00.000Z"
          }
        }))
      }
    );

    await expect(
      service.replace("11111111-1111-4111-8111-111111111111", "control-0002", {
        expectedRevision: 1,
        policy: {
          schemaVersion: "flow-runtime-rollout-policy.v2",
          mode: "definition_only",
          canaryOwnerSubjectIds: [],
          allowedRequirementKeys: [],
          killSwitches: policy.killSwitches,
          readinessLeaseTtlMs: 30_000,
          tokenLeaseDurationMs: 60_000
        },
        reason: "Return to definition-only mode"
      })
    ).rejects.toMatchObject({
      response: {
        code: "FLOW_RUNTIME_CONTROL_REVISION_CONFLICT",
        expectedRevision: 1,
        currentRevision: 2
      }
    });
  });
});
