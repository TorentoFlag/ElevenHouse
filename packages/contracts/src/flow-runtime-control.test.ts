import { describe, expect, it } from "vitest";

import {
  adminFlowRuntimeControlResponseSchema,
  replaceAdminFlowRuntimeControlResponseSchema,
  replaceAdminFlowRuntimeControlRequestSchema
} from "./flow-runtime-control";

const policy = {
  schemaVersion: "flow-runtime-rollout-policy.v2",
  revision: 2,
  mode: "canary",
  canaryOwnerSubjectIds: ["11111111-1111-4111-8111-111111111111"],
  allowedRequirementKeys: [
    "executor:completed:1:1",
    "runtime:flow-interpreter.v1",
    "trigger:booking_confirmed:1:1:1"
  ],
  killSwitches: {
    enrollment: { global: false, ownerSubjectIds: [], capabilityKeys: [] },
    claim: { global: false, ownerSubjectIds: [], capabilityKeys: [] },
    externalDispatch: { global: true, ownerSubjectIds: [], capabilityKeys: [] }
  },
  readinessLeaseTtlMs: 30_000,
  tokenLeaseDurationMs: 60_000
} as const;
const { revision: _revision, ...requestedPolicy } = policy;
void _revision;

describe("admin Flow runtime control contracts", () => {
  it("accepts a strict auditable replacement request and response", () => {
    expect(
      replaceAdminFlowRuntimeControlRequestSchema.parse({
        expectedRevision: 1,
        policy: requestedPolicy,
        reason: "Canary rollout after worker readiness review"
      })
    ).toMatchObject({ expectedRevision: 1, policy: { mode: "canary" } });

    expect(
      adminFlowRuntimeControlResponseSchema.parse({ policy })
    ).toMatchObject({ policy: { revision: 2 } });
    expect(
      replaceAdminFlowRuntimeControlResponseSchema.parse({
        policy,
        command: { kind: "created", completedAt: "2026-08-06T12:00:00.000Z" }
      })
    ).toMatchObject({ policy: { revision: 2 }, command: { kind: "created" } });
  });

  it("rejects revision spoofing, non-canonical capability lists, and unbounded reasons", () => {
    expect(
      replaceAdminFlowRuntimeControlRequestSchema.safeParse({
        expectedRevision: 1,
        policy,
        reason: "x"
      }).success
    ).toBe(false);
    expect(
      replaceAdminFlowRuntimeControlRequestSchema.safeParse({
        expectedRevision: 1,
        policy: {
          ...requestedPolicy,
          allowedRequirementKeys: [...policy.allowedRequirementKeys].reverse()
        },
        reason: "x"
      }).success
    ).toBe(false);
    expect(
      replaceAdminFlowRuntimeControlRequestSchema.safeParse({
        expectedRevision: 1,
        policy: requestedPolicy,
        reason: "x".repeat(501)
      }).success
    ).toBe(false);
  });
});
