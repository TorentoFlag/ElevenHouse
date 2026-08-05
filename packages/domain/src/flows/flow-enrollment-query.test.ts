import type { FlowEnrollmentDetailResponse } from "@elevenhouse/contracts";
import { describe, expect, it, vi } from "vitest";

import { FlowEnrollmentAuthorityIntegrityError } from "./flow-enrollment-control";
import { getFlowEnrollmentDetail, type FlowEnrollmentQueryStore } from "./flow-enrollment-query";

const ownerUserId = "00000000-0000-4000-8000-000000000001";
const flowId = "00000000-0000-4000-8000-000000000002";

describe("flow enrollment query", () => {
  it("returns an owner-scoped authoritative snapshot", async () => {
    const detail = inactiveDetail();
    const getByOwner = vi.fn<FlowEnrollmentQueryStore["getByOwner"]>(async () => detail);

    await expect(
      getFlowEnrollmentDetail({ store: { getByOwner }, ownerUserId, flowId })
    ).resolves.toEqual(detail);
    expect(getByOwner).toHaveBeenCalledWith({ ownerUserId, flowId });
  });

  it("preserves not-found without exposing foreign existence", async () => {
    const store: FlowEnrollmentQueryStore = { getByOwner: vi.fn(async () => null) };
    await expect(getFlowEnrollmentDetail({ store, ownerUserId, flowId })).resolves.toBeNull();
  });

  it("fails closed when persistence returns a torn enrollment snapshot", async () => {
    const store: FlowEnrollmentQueryStore = {
      getByOwner: vi.fn<FlowEnrollmentQueryStore["getByOwner"]>(async () => ({
        ...inactiveDetail(),
        enrollment: { ...inactiveDetail().enrollment, state: "active" }
      } as never))
    };

    await expect(getFlowEnrollmentDetail({ store, ownerUserId, flowId })).rejects.toBeInstanceOf(
      FlowEnrollmentAuthorityIntegrityError
    );
  });
});

function inactiveDetail(): FlowEnrollmentDetailResponse {
  return {
    schemaVersion: "flow-enrollment-detail.v1",
    enrollment: {
      schemaVersion: "flow-enrollment-control.v1",
      flowId,
      state: "inactive",
      definitionRevision: 2,
      enrollmentRevision: 0,
      activeVersionId: null,
      activeActivationEpochId: null,
      activeSince: null,
      lastPausedAt: null
    },
    activeActivationEpoch: null
  };
}
