import type { FlowActivationReviewResponse } from "@elevenhouse/contracts";
import { describe, expect, it, vi } from "vitest";

import { reviewFlowActivation, type FlowActivationReviewStore } from "./flow-activation-review";
import { FlowEnrollmentAuthorityIntegrityError } from "./flow-enrollment-control";

const ownerUserId = "00000000-0000-4000-8000-000000000001";
const flowId = "00000000-0000-4000-8000-000000000002";
const versionId = "00000000-0000-4000-8000-000000000003";

describe("flow activation review", () => {
  it("returns an owner-scoped read-only CAS review", async () => {
    const review = readyReview();
    const getByOwner = vi.fn(async () => review);

    await expect(
      reviewFlowActivation({
        store: { getByOwner },
        ownerUserId,
        flowId,
        query: { versionId }
      })
    ).resolves.toEqual(review);
    expect(getByOwner).toHaveBeenCalledWith({ ownerUserId, flowId, versionId });
  });

  it("preserves owner-scoped not-found and fails closed on malformed persistence", async () => {
    const missing: FlowActivationReviewStore = { getByOwner: vi.fn(async () => null) };
    await expect(
      reviewFlowActivation({
        store: missing,
        ownerUserId,
        flowId,
        query: { versionId }
      })
    ).resolves.toBeNull();

    const malformed: FlowActivationReviewStore = {
      getByOwner: vi.fn(async () => ({ ...readyReview(), expectedActiveVersionId: "invalid" }))
    };
    await expect(
      reviewFlowActivation({
        store: malformed,
        ownerUserId,
        flowId,
        query: { versionId }
      })
    ).rejects.toBeInstanceOf(FlowEnrollmentAuthorityIntegrityError);
  });
});

function readyReview(): FlowActivationReviewResponse {
  return {
    schemaVersion: "flow-activation-review.v1",
    flowId,
    versionId,
    definitionRevision: 4,
    enrollmentRevision: 0,
    expectedActiveVersionId: null,
    runtimeMode: "canary",
    rolloutPolicyRevision: 2,
    evaluatedAt: "2026-08-04T10:00:00.000Z",
    decision: "ready",
    blockers: []
  };
}
