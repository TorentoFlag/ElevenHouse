import { describe, expect, it } from "vitest";

import {
  activateFlowVersionRequestSchema,
  activateFlowVersionResponseSchema,
  flowActivationEpochSchema,
  flowActivationReviewQuerySchema,
  flowActivationReviewResponseSchema,
  flowEnrollmentCommandRejectionResponseSchema,
  flowEnrollmentControlSchema,
  flowEnrollmentDetailResponseSchema,
  pauseFlowEnrollmentRequestSchema,
  pauseFlowEnrollmentResponseSchema
} from "./flow-enrollment-control";

const ids = {
  actorSubject: "00000000-0000-4000-8000-000000000001",
  flow: "00000000-0000-4000-8000-000000000002",
  version: "00000000-0000-4000-8000-000000000003",
  epoch: "00000000-0000-4000-8000-000000000004",
  command: "00000000-0000-4000-8000-000000000005",
  closeCommand: "00000000-0000-4000-8000-000000000006"
} as const;

const activeEnrollment = {
  schemaVersion: "flow-enrollment-control.v1",
  flowId: ids.flow,
  state: "active",
  definitionRevision: 4,
  enrollmentRevision: 2,
  activeVersionId: ids.version,
  activeActivationEpochId: ids.epoch,
  activeSince: "2026-08-04T10:00:00.000Z",
  lastPausedAt: null
} as const;

const openEpoch = {
  schemaVersion: "flow-activation-epoch.v1",
  id: ids.epoch,
  flowId: ids.flow,
  flowVersionId: ids.version,
  sequence: 2,
  effectiveFrom: "2026-08-04T10:00:00.000Z",
  effectiveTo: null,
  manifestDigest: `sha256:${"a".repeat(64)}`,
  rolloutPolicyRevision: 3,
  activatedByActorSubjectId: ids.actorSubject,
  activateCommandId: ids.command,
  closeReason: null,
  closedByActorSubjectId: null,
  closeCommandId: null
} as const;

describe("Flow enrollment control contracts", () => {
  it("parses strict activation and pause CAS commands", () => {
    expect(
      activateFlowVersionRequestSchema.parse({
        schemaVersion: "flow-activation-command.v1",
        versionId: ids.version,
        expectedRevision: 4,
        expectedEnrollmentRevision: 1,
        expectedActiveVersionId: null
      })
    ).toEqual({
      schemaVersion: "flow-activation-command.v1",
      versionId: ids.version,
      expectedRevision: 4,
      expectedEnrollmentRevision: 1,
      expectedActiveVersionId: null
    });

    expect(
      pauseFlowEnrollmentRequestSchema.parse({
        schemaVersion: "flow-enrollment-pause-command.v1",
        expectedEnrollmentRevision: 2,
        expectedActiveVersionId: ids.version,
        expectedActivationEpochId: ids.epoch
      })
    ).toEqual({
      schemaVersion: "flow-enrollment-pause-command.v1",
      expectedEnrollmentRevision: 2,
      expectedActiveVersionId: ids.version,
      expectedActivationEpochId: ids.epoch
    });
  });

  it("rejects ambiguous or weak command concurrency fields", () => {
    expect(
      activateFlowVersionRequestSchema.safeParse({
        schemaVersion: "flow-activation-command.v1",
        versionId: ids.version,
        expectedRevision: 0,
        expectedEnrollmentRevision: -1,
        expectedActiveVersionId: null
      }).success
    ).toBe(false);
    expect(
      activateFlowVersionRequestSchema.safeParse({
        schemaVersion: "flow-activation-command.v1",
        versionId: ids.version,
        expectedRevision: 4,
        expectedEnrollmentRevision: 1,
        expectedActiveVersionId: null,
        force: true
      }).success
    ).toBe(false);
    expect(
      pauseFlowEnrollmentRequestSchema.safeParse({
        schemaVersion: "flow-enrollment-pause-command.v1",
        expectedEnrollmentRevision: 2,
        expectedActivationEpochId: ids.epoch
      }).success
    ).toBe(false);
  });

  it("keeps enrollment lifecycle separate from definition lifecycle", () => {
    expect(flowEnrollmentControlSchema.parse(activeEnrollment)).toEqual(activeEnrollment);
    expect(
      flowEnrollmentControlSchema.safeParse({
        ...activeEnrollment,
        state: "paused",
        activeSince: null,
        lastPausedAt: "2026-08-04T11:00:00.000Z"
      }).success
    ).toBe(false);
    expect(
      flowEnrollmentControlSchema.parse({
        ...activeEnrollment,
        state: "paused",
        enrollmentRevision: 3,
        activeVersionId: null,
        activeActivationEpochId: null,
        activeSince: null,
        lastPausedAt: "2026-08-04T11:00:00.000Z"
      })
    ).toMatchObject({ state: "paused", definitionRevision: 4, enrollmentRevision: 3 });
    expect(
      flowEnrollmentControlSchema.safeParse({
        ...activeEnrollment,
        state: "inactive",
        enrollmentRevision: 9,
        activeVersionId: null,
        activeActivationEpochId: null,
        activeSince: null
      }).success
    ).toBe(false);
    expect(
      flowEnrollmentControlSchema.safeParse({
        ...activeEnrollment,
        enrollmentRevision: 0
      }).success
    ).toBe(false);
    expect(
      flowEnrollmentControlSchema.safeParse({
        ...activeEnrollment,
        state: "paused",
        enrollmentRevision: 0,
        activeVersionId: null,
        activeActivationEpochId: null,
        activeSince: null,
        lastPausedAt: "2026-08-04T11:00:00.000Z"
      }).success
    ).toBe(false);
    expect(
      flowEnrollmentControlSchema.safeParse({
        ...activeEnrollment,
        activeSince: "2026-08-04T10:00:00.000Z",
        lastPausedAt: "2026-08-04T10:00:00.000Z"
      }).success
    ).toBe(false);
  });

  it("models activation epochs as half-open intervals with close provenance", () => {
    expect(flowActivationEpochSchema.parse(openEpoch)).toEqual(openEpoch);
    expect(
      flowActivationEpochSchema.safeParse({
        ...openEpoch,
        effectiveTo: "2026-08-04T09:59:59.999Z",
        closeReason: "pause_enrollment",
        closedByActorSubjectId: ids.actorSubject,
        closeCommandId: ids.closeCommand
      }).success
    ).toBe(false);
    expect(
      flowActivationEpochSchema.safeParse({
        ...openEpoch,
        effectiveTo: "2026-08-04T11:00:00.000Z"
      }).success
    ).toBe(false);
    expect(
      flowActivationEpochSchema.parse({
        ...openEpoch,
        effectiveTo: "2026-08-04T11:00:00.000Z",
        closeReason: "pause_enrollment",
        closedByActorSubjectId: ids.actorSubject,
        closeCommandId: ids.closeCommand
      })
    ).toMatchObject({ closeReason: "pause_enrollment" });
    expect(
      flowActivationEpochSchema.safeParse({
        ...openEpoch,
        effectiveTo: "2026-08-04T11:00:00.000Z",
        closeReason: "pause_enrollment",
        closedByActorSubjectId: ids.actorSubject,
        closeCommandId: ids.command
      }).success
    ).toBe(false);
  });

  it("makes activation readiness explicit and internally coherent", () => {
    expect(flowActivationReviewQuerySchema.parse({ versionId: ids.version })).toEqual({
      versionId: ids.version
    });
    expect(
      flowActivationReviewQuerySchema.safeParse({ versionId: ids.version, decision: "ready" })
        .success
    ).toBe(false);
    expect(
      flowActivationReviewResponseSchema.parse({
        schemaVersion: "flow-activation-review.v1",
        flowId: ids.flow,
        versionId: ids.version,
        definitionRevision: 4,
        enrollmentRevision: 1,
        expectedActiveVersionId: null,
        runtimeMode: "canary",
        rolloutPolicyRevision: 3,
        evaluatedAt: "2026-08-04T09:59:00.000Z",
        decision: "ready",
        blockers: []
      })
    ).toMatchObject({ decision: "ready", blockers: [] });

    expect(
      flowActivationReviewResponseSchema.safeParse({
        schemaVersion: "flow-activation-review.v1",
        flowId: ids.flow,
        versionId: ids.version,
        definitionRevision: 4,
        enrollmentRevision: 1,
        expectedActiveVersionId: null,
        runtimeMode: "definition_only",
        rolloutPolicyRevision: 3,
        evaluatedAt: "2026-08-04T09:59:00.000Z",
        decision: "ready",
        blockers: []
      }).success
    ).toBe(false);

    expect(
      flowActivationReviewResponseSchema.parse({
        schemaVersion: "flow-activation-review.v1",
        flowId: ids.flow,
        versionId: ids.version,
        definitionRevision: 4,
        enrollmentRevision: 1,
        expectedActiveVersionId: ids.version,
        runtimeMode: "canary",
        rolloutPolicyRevision: 3,
        evaluatedAt: "2026-08-04T09:59:00.000Z",
        decision: "blocked",
        blockers: [
          {
            code: "FLOW_EXECUTION_WORKER_NOT_READY",
            path: "capabilities.completed:1:1",
            capabilityKey: "completed:1:1"
          }
        ]
      })
    ).toMatchObject({ decision: "blocked" });
  });

  it.each([
    "FLOW_DEFINITION_ARCHIVED",
    "FLOW_ACTIVATION_ALREADY_ACTIVE",
    "FLOW_LEGACY_ACTIVE_REQUIRES_PAUSE",
    "FLOW_RUNTIME_KILL_SWITCH_ENGAGED",
    "FLOW_REQUIRED_CAPABILITY_NOT_READY",
    "FLOW_AUTOMATION_QUOTA_NOT_READY"
  ] as const)("accepts the persisted runtime blocker %s", (code) => {
    expect(
      flowActivationReviewResponseSchema.parse({
        schemaVersion: "flow-activation-review.v1",
        flowId: ids.flow,
        versionId: ids.version,
        definitionRevision: 4,
        enrollmentRevision: 1,
        expectedActiveVersionId: null,
        runtimeMode: "canary",
        rolloutPolicyRevision: 3,
        evaluatedAt: "2026-08-04T09:59:00.000Z",
        decision: "blocked",
        blockers: [
          {
            code,
            path: `runtime.blockers.${code}`,
            capabilityKey: null
          }
        ]
      })
    ).toMatchObject({ blockers: [{ code }] });
  });

  it("binds successful command responses to one authoritative epoch", () => {
    expect(
      activateFlowVersionResponseSchema.parse({
        schemaVersion: "flow-activation-result.v1",
        enrollment: activeEnrollment,
        activationEpoch: openEpoch
      })
    ).toMatchObject({ enrollment: { state: "active" } });

    const pausedAt = "2026-08-04T11:00:00.000Z";
    expect(
      pauseFlowEnrollmentResponseSchema.parse({
        schemaVersion: "flow-enrollment-pause-result.v1",
        enrollment: {
          ...activeEnrollment,
          state: "paused",
          enrollmentRevision: 3,
          activeVersionId: null,
          activeActivationEpochId: null,
          activeSince: null,
          lastPausedAt: pausedAt
        },
        closedEpoch: {
          ...openEpoch,
          effectiveTo: pausedAt,
          closeReason: "pause_enrollment",
          closedByActorSubjectId: ids.actorSubject,
          closeCommandId: ids.closeCommand
        }
      })
    ).toMatchObject({ enrollment: { state: "paused" }, closedEpoch: { effectiveTo: pausedAt } });
  });

  it("exposes a coherent current enrollment snapshot for CAS commands", () => {
    expect(
      flowEnrollmentDetailResponseSchema.parse({
        schemaVersion: "flow-enrollment-detail.v1",
        enrollment: activeEnrollment,
        activeActivationEpoch: openEpoch
      })
    ).toMatchObject({
      enrollment: { state: "active", activeActivationEpochId: ids.epoch },
      activeActivationEpoch: { id: ids.epoch }
    });

    expect(
      flowEnrollmentDetailResponseSchema.parse({
        schemaVersion: "flow-enrollment-detail.v1",
        enrollment: {
          schemaVersion: "flow-enrollment-control.v1",
          flowId: ids.flow,
          state: "inactive",
          definitionRevision: 4,
          enrollmentRevision: 0,
          activeVersionId: null,
          activeActivationEpochId: null,
          activeSince: null,
          lastPausedAt: null
        },
        activeActivationEpoch: null
      })
    ).toMatchObject({ enrollment: { state: "inactive", enrollmentRevision: 0 } });

    expect(
      flowEnrollmentDetailResponseSchema.safeParse({
        schemaVersion: "flow-enrollment-detail.v1",
        enrollment: activeEnrollment,
        activeActivationEpoch: null
      }).success
    ).toBe(false);
    expect(
      flowEnrollmentDetailResponseSchema.safeParse({
        schemaVersion: "flow-enrollment-detail.v1",
        enrollment: activeEnrollment,
        activeActivationEpoch: { ...openEpoch, flowVersionId: ids.closeCommand }
      }).success
    ).toBe(false);
  });

  it("pins rejection codes to their HTTP status", () => {
    expect(
      flowEnrollmentCommandRejectionResponseSchema.safeParse({
        statusCode: 404,
        body: { code: "FLOW_ENROLLMENT_REVISION_CONFLICT", expectedRevision: 1, currentRevision: 2 }
      }).success
    ).toBe(false);
    expect(
      flowEnrollmentCommandRejectionResponseSchema.parse({
        statusCode: 409,
        body: {
          code: "FLOW_ACTIVATION_BLOCKED",
          blockers: [
            {
              code: "FLOW_RUNTIME_ROLLOUT_DISABLED",
              path: "runtime.mode",
              capabilityKey: null
            }
          ]
        }
      })
    ).toMatchObject({ statusCode: 409 });
    expect(
      flowEnrollmentCommandRejectionResponseSchema.parse({
        statusCode: 409,
        body: { code: "FLOW_LEGACY_ACTIVE_REQUIRES_PAUSE" }
      })
    ).toEqual({ statusCode: 409, body: { code: "FLOW_LEGACY_ACTIVE_REQUIRES_PAUSE" } });
  });
});
