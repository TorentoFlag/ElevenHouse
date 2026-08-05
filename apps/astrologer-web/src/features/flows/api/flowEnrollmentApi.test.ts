import type {
  ActivateFlowVersionRequest,
  ActivateFlowVersionResponse,
  FlowActivationReviewResponse,
  FlowEnrollmentDetailResponse,
  PauseFlowEnrollmentRequest,
  PauseFlowEnrollmentResponse
} from "@elevenhouse/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";

import { application } from "../../../Application";
import { activateFlow } from "./activateFlow";
import { getFlowActivationReview } from "./getFlowActivationReview";
import { getFlowEnrollment } from "./getFlowEnrollment";
import { pauseFlowEnrollment } from "./pauseFlowEnrollment";

const flowId = "11111111-1111-4111-8111-111111111111";
const versionId = "22222222-2222-4222-8222-222222222222";
const epochId = "33333333-3333-4333-8333-333333333333";
const actorSubjectId = "44444444-4444-4444-8444-444444444444";
const activateCommandId = "55555555-5555-4555-8555-555555555555";
const pauseCommandId = "66666666-6666-4666-8666-666666666666";
const activatedAt = "2026-08-04T18:00:00.000Z";
const pausedAt = "2026-08-04T18:10:00.000Z";

describe("flow enrollment API", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reads a strict non-cacheable activation review and enrollment snapshot", async () => {
    const get = vi
      .spyOn(application.http, "get")
      .mockResolvedValueOnce(readyReview())
      .mockResolvedValueOnce(enrollmentDetail());

    await expect(getFlowActivationReview({ flowId, versionId })).resolves.toEqual(readyReview());
    await expect(getFlowEnrollment(flowId)).resolves.toEqual(enrollmentDetail());

    expect(get).toHaveBeenNthCalledWith(
      1,
      `/flows/${flowId}/activation-review?versionId=${versionId}`,
      { cache: "no-store" }
    );
    expect(get).toHaveBeenNthCalledWith(2, `/flows/${flowId}/enrollment`, {
      cache: "no-store"
    });
  });

  it("sends activation and enrollment pause with exact CAS and idempotency authority", async () => {
    const activation = activeResponse();
    const paused = pausedResponse();
    const post = vi
      .spyOn(application.http, "post")
      .mockResolvedValueOnce(activation)
      .mockResolvedValueOnce(paused);
    const activationBody = activationRequest();
    const pauseBody = pauseRequest();

    await expect(
      activateFlow({ flowId, body: activationBody, idempotencyKey: "flows:activate:attempt-1" })
    ).resolves.toEqual(activation);
    await expect(
      pauseFlowEnrollment({
        flowId,
        body: pauseBody,
        idempotencyKey: "flows:pause-enrollment:attempt-1"
      })
    ).resolves.toEqual(paused);

    expect(post).toHaveBeenNthCalledWith(1, `/flows/${flowId}/activate`, activationBody, {
      csrf: true,
      headers: { "idempotency-key": "flows:activate:attempt-1" }
    });
    expect(post).toHaveBeenNthCalledWith(2, `/flows/${flowId}/pause-enrollment`, pauseBody, {
      csrf: true,
      headers: { "idempotency-key": "flows:pause-enrollment:attempt-1" }
    });
  });

  it("rejects malformed persistence-shaped responses instead of guessing state", async () => {
    vi.spyOn(application.http, "get").mockResolvedValue({
      ...readyReview(),
      expectedActiveVersionId: "not-a-uuid"
    });

    await expect(getFlowActivationReview({ flowId, versionId })).rejects.toThrow();
  });
});

function activationRequest(): ActivateFlowVersionRequest {
  return {
    schemaVersion: "flow-activation-command.v1",
    versionId,
    expectedRevision: 7,
    expectedEnrollmentRevision: 0,
    expectedActiveVersionId: null
  };
}

function pauseRequest(): PauseFlowEnrollmentRequest {
  return {
    schemaVersion: "flow-enrollment-pause-command.v1",
    expectedEnrollmentRevision: 1,
    expectedActiveVersionId: versionId,
    expectedActivationEpochId: epochId
  };
}

function readyReview(): FlowActivationReviewResponse {
  return {
    schemaVersion: "flow-activation-review.v1",
    flowId,
    versionId,
    definitionRevision: 7,
    enrollmentRevision: 0,
    expectedActiveVersionId: null,
    runtimeMode: "enabled",
    rolloutPolicyRevision: 2,
    evaluatedAt: activatedAt,
    decision: "ready",
    blockers: []
  };
}

function enrollmentDetail(): FlowEnrollmentDetailResponse {
  return {
    schemaVersion: "flow-enrollment-detail.v1",
    enrollment: {
      schemaVersion: "flow-enrollment-control.v1",
      flowId,
      state: "active",
      definitionRevision: 7,
      enrollmentRevision: 1,
      activeVersionId: versionId,
      activeActivationEpochId: epochId,
      activeSince: activatedAt,
      lastPausedAt: null
    },
    activeActivationEpoch: activeResponse().activationEpoch
  };
}

function activeResponse(): ActivateFlowVersionResponse {
  return {
    schemaVersion: "flow-activation-result.v1",
    enrollment: enrollmentDetailWithoutEpoch(),
    activationEpoch: {
      schemaVersion: "flow-activation-epoch.v1",
      id: epochId,
      flowId,
      flowVersionId: versionId,
      sequence: 1,
      effectiveFrom: activatedAt,
      effectiveTo: null,
      manifestDigest: `sha256:${"a".repeat(64)}`,
      rolloutPolicyRevision: 2,
      activatedByActorSubjectId: actorSubjectId,
      activateCommandId,
      closeReason: null,
      closedByActorSubjectId: null,
      closeCommandId: null
    }
  };
}

function pausedResponse(): PauseFlowEnrollmentResponse {
  return {
    schemaVersion: "flow-enrollment-pause-result.v1",
    enrollment: {
      ...enrollmentDetailWithoutEpoch(),
      state: "paused",
      enrollmentRevision: 2,
      activeVersionId: null,
      activeActivationEpochId: null,
      activeSince: null,
      lastPausedAt: pausedAt
    },
    closedEpoch: {
      ...activeResponse().activationEpoch,
      effectiveTo: pausedAt,
      closeReason: "pause_enrollment",
      closedByActorSubjectId: actorSubjectId,
      closeCommandId: pauseCommandId
    }
  };
}

function enrollmentDetailWithoutEpoch(): ActivateFlowVersionResponse["enrollment"] {
  return {
    schemaVersion: "flow-enrollment-control.v1",
    flowId,
    state: "active",
    definitionRevision: 7,
    enrollmentRevision: 1,
    activeVersionId: versionId,
    activeActivationEpochId: epochId,
    activeSince: activatedAt,
    lastPausedAt: null
  };
}
