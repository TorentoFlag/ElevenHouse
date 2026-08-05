import type { FlowActivationReviewResponse, FlowEnrollmentControl } from "@elevenhouse/contracts";
import { describe, expect, it } from "vitest";

import { HttpError } from "../../../common/http/HttpError";
import {
  buildActivateFlowVersionRequest,
  buildPauseFlowEnrollmentRequest,
  classifyFlowEnrollmentCommandError,
  createFlowEnrollmentCommandAttemptRegistry
} from "./flowEnrollmentCommandModel";

const flowId = "11111111-1111-4111-8111-111111111111";
const versionId = "22222222-2222-4222-8222-222222222222";
const epochId = "33333333-3333-4333-8333-333333333333";

describe("flow enrollment command model", () => {
  it("builds an activation CAS command only from a ready server review", () => {
    expect(buildActivateFlowVersionRequest(readyReview())).toEqual({
      schemaVersion: "flow-activation-command.v1",
      versionId,
      expectedRevision: 7,
      expectedEnrollmentRevision: 3,
      expectedActiveVersionId: null
    });

    expect(() =>
      buildActivateFlowVersionRequest({
        ...readyReview(),
        decision: "blocked",
        blockers: [
          {
            code: "FLOW_ENTITLEMENT_UNAVAILABLE",
            path: "entitlement",
            capabilityKey: "funnels.activation"
          }
        ]
      })
    ).toThrow("FLOW_ACTIVATION_REVIEW_NOT_READY");
  });

  it("builds a pause CAS command only from the exact active enrollment epoch", () => {
    expect(buildPauseFlowEnrollmentRequest(activeEnrollment())).toEqual({
      schemaVersion: "flow-enrollment-pause-command.v1",
      expectedEnrollmentRevision: 4,
      expectedActiveVersionId: versionId,
      expectedActivationEpochId: epochId
    });

    expect(() =>
      buildPauseFlowEnrollmentRequest({
        ...activeEnrollment(),
        state: "paused",
        activeVersionId: null,
        activeActivationEpochId: null,
        activeSince: null,
        lastPausedAt: "2026-08-04T18:10:00.000Z"
      })
    ).toThrow("FLOW_ENROLLMENT_NOT_ACTIVE");
  });

  it("retains a command key for manual network retry and rotates after acknowledgement", () => {
    const requestIds = ["attempt-1", "attempt-2"];
    const attempts = createFlowEnrollmentCommandAttemptRegistry(() => requestIds.shift()!);
    const payload = buildActivateFlowVersionRequest(readyReview());
    const first = attempts.acquire("activate", flowId, payload);

    expect(attempts.acquire("activate", flowId, { ...payload })).toBe(first);
    expect(classifyFlowEnrollmentCommandError(new HttpError(503, null))).toEqual({
      kind: "retry_same_attempt"
    });
    expect(attempts.acquire("activate", flowId, payload)).toBe(first);

    attempts.acknowledge("activate", flowId, first);
    expect(attempts.acquire("activate", flowId, payload)).toBe("flows:activate:attempt-2");
  });

  it("blocks every stale automatic retry after conflict until an authoritative refetch", () => {
    const requestIds = ["attempt-1", "attempt-2"];
    const attempts = createFlowEnrollmentCommandAttemptRegistry(() => requestIds.shift()!);
    const payload = buildPauseFlowEnrollmentRequest(activeEnrollment());
    const first = attempts.acquire("pause-enrollment", flowId, payload);
    const classification = classifyFlowEnrollmentCommandError(
      new HttpError(409, {
        code: "FLOW_ENROLLMENT_REVISION_CONFLICT",
        expectedRevision: 4,
        currentRevision: 5
      })
    );

    expect(classification).toMatchObject({
      kind: "refetch_required",
      rejection: { code: "FLOW_ENROLLMENT_REVISION_CONFLICT", currentRevision: 5 }
    });
    attempts.markConflict("pause-enrollment", flowId, first);
    expect(attempts.needsRefetch("pause-enrollment", flowId)).toBe(true);
    expect(() => attempts.acquire("pause-enrollment", flowId, payload)).toThrow(
      "FLOW_ENROLLMENT_REFETCH_REQUIRED"
    );

    attempts.resetAfterRefetch("pause-enrollment", flowId);
    expect(attempts.needsRefetch("pause-enrollment", flowId)).toBe(false);
    expect(attempts.acquire("pause-enrollment", flowId, payload)).toBe(
      "flows:pause-enrollment:attempt-2"
    );
  });

  it("fails closed on an unrecognized conflict body and never classifies it as retryable", () => {
    expect(classifyFlowEnrollmentCommandError(new HttpError(409, { code: "UNKNOWN" }))).toEqual({
      kind: "refetch_required",
      rejection: null
    });
    expect(classifyFlowEnrollmentCommandError(new TypeError("Failed to fetch"))).toEqual({
      kind: "retry_same_attempt"
    });
    expect(classifyFlowEnrollmentCommandError(new HttpError(422, { code: "UNKNOWN" }))).toEqual({
      kind: "rejected"
    });
  });
});

function readyReview(): FlowActivationReviewResponse {
  return {
    schemaVersion: "flow-activation-review.v1",
    flowId,
    versionId,
    definitionRevision: 7,
    enrollmentRevision: 3,
    expectedActiveVersionId: null,
    runtimeMode: "enabled",
    rolloutPolicyRevision: 2,
    evaluatedAt: "2026-08-04T18:00:00.000Z",
    decision: "ready",
    blockers: []
  };
}

function activeEnrollment(): FlowEnrollmentControl {
  return {
    schemaVersion: "flow-enrollment-control.v1",
    flowId,
    state: "active",
    definitionRevision: 7,
    enrollmentRevision: 4,
    activeVersionId: versionId,
    activeActivationEpochId: epochId,
    activeSince: "2026-08-04T18:00:00.000Z",
    lastPausedAt: null
  };
}
