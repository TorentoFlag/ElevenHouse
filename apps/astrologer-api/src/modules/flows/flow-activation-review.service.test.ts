import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException
} from "@nestjs/common";
import type { FlowActivationReviewResponse } from "@elevenhouse/contracts";
import {
  FlowEnrollmentAuthorityIntegrityError,
  type FlowActivationReviewStore
} from "@elevenhouse/domain";
import { describe, expect, it, vi } from "vitest";

import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import {
  csrfRequiredMetadataKey,
  idempotencyRequiredMetadataKey
} from "../security/route-policy/route-security-metadata";
import { FlowActivationReviewController } from "./flow-activation-review.controller";
import { FlowActivationReviewService } from "./flow-activation-review.service";

const ownerUserId = "00000000-0000-4000-8000-000000000001";
const flowId = "00000000-0000-4000-8000-000000000002";
const versionId = "00000000-0000-4000-8000-000000000003";
const activeVersionId = "00000000-0000-4000-8000-000000000004";

describe("FlowActivationReviewService", () => {
  it("returns the owner-scoped readiness review and complete activation CAS", async () => {
    const getByOwner = vi.fn(async () => readyReview());
    const service = createService({ getByOwner });

    await expect(service.review(flowId, { versionId }, request())).resolves.toEqual(readyReview());
    expect(getByOwner).toHaveBeenCalledWith({ ownerUserId, flowId, versionId });
  });

  it("returns not found without disclosing a foreign or missing definition", async () => {
    const service = createService({ getByOwner: vi.fn(async () => null) });

    await expect(service.review(flowId, { versionId }, request())).rejects.toMatchObject({
      constructor: NotFoundException,
      status: 404,
      response: { code: "FLOW_DEFINITION_NOT_FOUND" }
    });
  });

  it("rejects malformed params and query before reading persistence", async () => {
    const getByOwner = vi.fn<FlowActivationReviewStore["getByOwner"]>();
    const service = createService({ getByOwner });

    await expect(service.review("not-a-uuid", { versionId }, request())).rejects.toBeInstanceOf(
      BadRequestException
    );
    await expect(service.review(flowId, {}, request())).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.review(flowId, { versionId, unexpected: true }, request())
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(getByOwner).not.toHaveBeenCalled();
  });

  it("requires astrologer authority before reading persistence", async () => {
    const getByOwner = vi.fn<FlowActivationReviewStore["getByOwner"]>();
    const service = createService({ getByOwner });

    await expect(service.review(flowId, { versionId }, { headers: {} })).rejects.toBeInstanceOf(
      UnauthorizedException
    );
    expect(getByOwner).not.toHaveBeenCalled();
  });

  it.each([
    new FlowEnrollmentAuthorityIntegrityError(),
    new FlowEnrollmentAuthorityIntegrityError({ cause: new Error("invalid persisted review") })
  ])("maps authority integrity failures to an observable 500", async (error) => {
    const service = createService({
      getByOwner: vi.fn(async () => {
        throw error;
      })
    });

    await expect(service.review(flowId, { versionId }, request())).rejects.toMatchObject({
      constructor: InternalServerErrorException,
      status: 500,
      response: { code: "FLOW_ENROLLMENT_AUTHORITY_INTEGRITY_ERROR" }
    });
  });

  it("does not declare command-only CSRF or idempotency requirements", () => {
    expect(
      Reflect.getMetadata(csrfRequiredMetadataKey, FlowActivationReviewController.prototype.review)
    ).toBeUndefined();
    expect(
      Reflect.getMetadata(
        idempotencyRequiredMetadataKey,
        FlowActivationReviewController.prototype.review
      )
    ).toBeUndefined();
  });
});

function createService(store: FlowActivationReviewStore): FlowActivationReviewService {
  return new FlowActivationReviewService(store);
}

function request(): AstrologerSessionRequest {
  return {
    headers: {},
    currentAstrologerAccount: {
      account: { id: ownerUserId, status: "active", roles: ["astrologer"] }
    }
  };
}

function readyReview(): FlowActivationReviewResponse {
  return {
    schemaVersion: "flow-activation-review.v1",
    flowId,
    versionId,
    definitionRevision: 7,
    enrollmentRevision: 4,
    expectedActiveVersionId: activeVersionId,
    runtimeMode: "enabled",
    rolloutPolicyRevision: 3,
    evaluatedAt: "2026-08-04T12:00:00.000Z",
    decision: "ready",
    blockers: []
  };
}
