import { describe, expect, it } from "vitest";

import {
  FlowRuntimeControlCommandIntegrityError,
  createFlowRuntimeControlCommand,
  replaceFlowRuntimeRolloutPolicy,
  type FlowRuntimeControlCommand,
  type FlowRuntimeControlCommandStore,
  type FlowRuntimeControlReplacePolicyRequest
} from "./flow-runtime-control-command";
import type { FlowRuntimeRolloutPolicy } from "./flow-runtime-control";

const actorUserId = "00000000-0000-4000-8000-000000000099";
const actorSubjectId = "00000000-0000-4000-8000-000000000077";
const ownerA = "00000000-0000-4000-8000-000000000001";
const ownerB = "00000000-0000-4000-8000-000000000002";

describe("Flow runtime control replace-policy command", () => {
  it("normalizes one target policy and binds its exact request identity", async () => {
    const captured: { command: FlowRuntimeControlCommand | null } = { command: null };
    const store: FlowRuntimeControlCommandStore = {
      executeReplacePolicy: async (request) => {
        const command = createFlowRuntimeControlCommand({ request, actorSubjectId });
        captured.command = command;
        return {
          kind: "created",
          outcome: {
            kind: "applied",
            controlRevision: command.targetRevision,
            policyEvidence: command.requestedPolicyEvidence,
            completedAt: "2026-08-04T12:00:00.000Z"
          }
        };
      }
    };

    await expect(
      replaceFlowRuntimeRolloutPolicy({
        store,
        actorUserId: actorUserId.toUpperCase(),
        idempotencyKey: "runtime-policy-0001",
        expectedRevision: 1,
        reason: "  Canary rollout  ",
        policy: policy({ canaryOwnerSubjectIds: [ownerB, ownerA] })
      })
    ).resolves.toMatchObject({
      kind: "created",
      outcome: {
        kind: "applied",
        controlRevision: 2,
        completedAt: "2026-08-04T12:00:00.000Z"
      }
    });

    expect(captured.command).toMatchObject({
      schemaVersion: "flow-runtime-control-replace-policy-command.v1",
      actorSubjectId,
      idempotencyKey: "runtime-policy-0001",
      expectedRevision: 1,
      targetRevision: 2,
      reason: "Canary rollout",
      requestedPolicyEvidence: {
        policy: {
          revision: 2,
          canaryOwnerSubjectIds: [ownerA, ownerB]
        }
      }
    });
    expect(captured.command?.requestHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("produces the same request hash for semantically identical array order", async () => {
    const commands: FlowRuntimeControlCommand[] = [];
    const store = capturingConflictStore(commands);

    for (const canaryOwnerSubjectIds of [
      [ownerA, ownerB],
      [ownerB, ownerA]
    ]) {
      await replaceFlowRuntimeRolloutPolicy({
        store,
        actorUserId,
        idempotencyKey: "runtime-policy-0002",
        expectedRevision: 1,
        reason: "Canary rollout",
        policy: policy({ canaryOwnerSubjectIds })
      });
    }

    expect(commands[0]?.requestHash).toBe(commands[1]?.requestHash);
  });

  it("fails closed when the store returns an outcome outside the command authority", async () => {
    const store: FlowRuntimeControlCommandStore = {
      executeReplacePolicy: async (request) => {
        const command = createFlowRuntimeControlCommand({ request, actorSubjectId });
        return {
          kind: "created",
          outcome: {
            kind: "applied",
            controlRevision: command.targetRevision + 1,
            policyEvidence: command.requestedPolicyEvidence,
            completedAt: "2026-08-04T12:00:00.000Z"
          }
        };
      }
    };

    await expect(
      replaceFlowRuntimeRolloutPolicy({
        store,
        actorUserId,
        idempotencyKey: "runtime-policy-0003",
        expectedRevision: 1,
        reason: "Canary rollout",
        policy: policy()
      })
    ).rejects.toBeInstanceOf(FlowRuntimeControlCommandIntegrityError);
  });
});

function capturingConflictStore(
  commands: FlowRuntimeControlCommand[]
): FlowRuntimeControlCommandStore {
  return {
    executeReplacePolicy: async (request: FlowRuntimeControlReplacePolicyRequest) => {
      const command = createFlowRuntimeControlCommand({ request, actorSubjectId });
      commands.push(command);
      return {
        kind: "created",
        outcome: {
          kind: "revision_conflict",
          expectedRevision: command.expectedRevision,
          currentRevision: command.expectedRevision + 1,
          completedAt: "2026-08-04T12:00:00.000Z"
        }
      };
    }
  };
}

function policy(
  overrides: Partial<Omit<FlowRuntimeRolloutPolicy, "revision">> = {}
): Omit<FlowRuntimeRolloutPolicy, "revision"> {
  return {
    schemaVersion: "flow-runtime-rollout-policy.v2",
    mode: "canary",
    canaryOwnerSubjectIds: [ownerA],
    allowedRequirementKeys: [
      "executor:completed:1:1",
      "runtime:flow-interpreter.v1"
    ],
    killSwitches: {
      enrollment: { global: false, ownerSubjectIds: [], capabilityKeys: [] },
      claim: { global: false, ownerSubjectIds: [], capabilityKeys: [] },
      externalDispatch: { global: true, ownerSubjectIds: [], capabilityKeys: [] }
    },
    readinessLeaseTtlMs: 30_000,
    tokenLeaseDurationMs: 30_000,
    ...overrides
  };
}
