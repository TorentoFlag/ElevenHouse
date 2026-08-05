import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException
} from "@nestjs/common";
import type {
  ActivateFlowVersionResponse,
  FlowEnrollmentCommandRejectionResponse,
  PauseFlowEnrollmentResponse
} from "@elevenhouse/contracts";
import {
  FlowEnrollmentAuthorityIntegrityError,
  FlowEnrollmentCommandBusyError,
  type FlowEnrollmentControlStore,
  type FlowEnrollmentQueryStore
} from "@elevenhouse/domain";
import { describe, expect, it, vi } from "vitest";

import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import {
  csrfRequiredMetadataKey,
  idempotencyRequiredMetadataKey
} from "../security/route-policy/route-security-metadata";
import { FlowEnrollmentController } from "./flow-enrollment.controller";
import { FlowEnrollmentService } from "./flow-enrollment.service";

const ownerUserId = "00000000-0000-4000-8000-000000000001";
const flowId = "00000000-0000-4000-8000-000000000002";
const versionId = "00000000-0000-4000-8000-000000000003";
const epochId = "00000000-0000-4000-8000-000000000004";
const actorSubjectId = "00000000-0000-4000-8000-000000000005";
const ownerSubjectId = "00000000-0000-4000-8000-000000000006";
const activateCommandId = "00000000-0000-4000-8000-000000000007";
const pauseCommandId = "00000000-0000-4000-8000-000000000008";
const activatedAt = "2026-08-04T12:00:00.000Z";
const pausedAt = "2026-08-04T13:00:00.000Z";

describe("FlowEnrollmentService", () => {
  it("reads the owner-scoped CAS authority used to build commands", async () => {
    const getByOwner = vi.fn(async () => ({
      schemaVersion: "flow-enrollment-detail.v1" as const,
      enrollment: activeResponse().enrollment,
      activeActivationEpoch: activeResponse().activationEpoch
    }));
    const service = createService({}, { getByOwner });

    await expect(service.getFlowEnrollment(flowId, request())).resolves.toMatchObject({
      enrollment: { enrollmentRevision: 4, activeVersionId: versionId },
      activeActivationEpoch: { id: epochId }
    });
    expect(getByOwner).toHaveBeenCalledWith({ ownerUserId, flowId });
  });

  it("executes an owner-scoped activation command and returns the authoritative epoch", async () => {
    const executeActivate = vi.fn<FlowEnrollmentControlStore["executeActivate"]>(async (input) => {
      input.createCommand({ actorSubjectId, ownerSubjectId });
      return succeededActivation("replayed");
    });
    const service = createService({ executeActivate });

    await expect(
      service.activateFlowVersion(flowId, activationRequest(), "flow-activate-command-1", request())
    ).resolves.toEqual(activeResponse());

    const command = executeActivate.mock.calls[0]?.[0];
    expect(command?.commandRequest).toEqual({
      apiSurface: "astrologer-api",
      actorUserId: ownerUserId,
      ownerUserId,
      routeTemplate: "/flows/:flowId/activate",
      resourceId: flowId,
      scope: "flows.enrollment.activate.v1",
      idempotencyKey: "flow-activate-command-1",
      request: activationRequest()
    });
  });

  it("executes a pause command against the exact active version and epoch", async () => {
    const executePause = vi.fn<FlowEnrollmentControlStore["executePause"]>(async (input) => {
      input.createCommand({ actorSubjectId, ownerSubjectId });
      return succeededPause("replayed");
    });
    const service = createService({ executePause });

    await expect(
      service.pauseFlowEnrollment(flowId, pauseRequest(), "flow-pause-command-1", request())
    ).resolves.toEqual(pausedResponse());

    expect(executePause.mock.calls[0]?.[0].commandRequest).toMatchObject({
      actorUserId: ownerUserId,
      ownerUserId,
      routeTemplate: "/flows/:flowId/pause-enrollment",
      resourceId: flowId,
      scope: "flows.enrollment.pause.v1",
      idempotencyKey: "flow-pause-command-1",
      request: pauseRequest()
    });
  });

  it.each([
    [400, { code: "FLOW_IDEMPOTENCY_KEY_INVALID" }, BadRequestException],
    [404, { code: "FLOW_DEFINITION_NOT_FOUND" }, NotFoundException],
    [409, { code: "FLOW_ACTIVATION_ALREADY_ACTIVE" }, ConflictException]
  ] as const)(
    "maps a persisted %s rejection to its exact HTTP boundary",
    async (statusCode, body, ErrorType) => {
      const service = createService({
        executeActivate: rejectedActivation({
          statusCode,
          body
        } as FlowEnrollmentCommandRejectionResponse)
      });

      await expect(
        service.activateFlowVersion(
          flowId,
          activationRequest(),
          "flow-activate-command-2",
          request()
        )
      ).rejects.toMatchObject({
        constructor: ErrorType,
        status: statusCode,
        response: expect.objectContaining(body)
      });
    }
  );

  it.each([
    [new FlowEnrollmentCommandBusyError(), ServiceUnavailableException, 503],
    [new FlowEnrollmentAuthorityIntegrityError(), InternalServerErrorException, 500]
  ] as const)(
    "maps infrastructure authority failures without persisting fake business outcomes",
    async (error, ErrorType, status) => {
      const service = createService({
        executeActivate: vi.fn(async () => {
          throw error;
        })
      });

      await expect(
        service.activateFlowVersion(
          flowId,
          activationRequest(),
          "flow-activate-command-3",
          request()
        )
      ).rejects.toMatchObject({ constructor: ErrorType, status });
    }
  );

  it("rejects malformed commands and missing astrologer authority before persistence", async () => {
    const executeActivate = vi.fn<FlowEnrollmentControlStore["executeActivate"]>();
    const service = createService({ executeActivate });

    await expect(
      service.activateFlowVersion(flowId, {}, "flow-activate-command-4", request())
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.activateFlowVersion(flowId, activationRequest(), "flow-activate-command-4", {
        headers: {}
      })
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(executeActivate).not.toHaveBeenCalled();
  });

  it("declares CSRF and route-scoped idempotency for both commands", () => {
    expect(
      Reflect.getMetadata(
        csrfRequiredMetadataKey,
        FlowEnrollmentController.prototype.activateFlowVersion
      )
    ).toBe(true);
    expect(
      Reflect.getMetadata(
        idempotencyRequiredMetadataKey,
        FlowEnrollmentController.prototype.activateFlowVersion
      )
    ).toEqual({ scope: "flows.enrollment.activate.v1" });
    expect(
      Reflect.getMetadata(
        csrfRequiredMetadataKey,
        FlowEnrollmentController.prototype.pauseFlowEnrollment
      )
    ).toBe(true);
    expect(
      Reflect.getMetadata(
        idempotencyRequiredMetadataKey,
        FlowEnrollmentController.prototype.pauseFlowEnrollment
      )
    ).toEqual({ scope: "flows.enrollment.pause.v1" });
  });
});

function createService(
  overrides: Partial<FlowEnrollmentControlStore> = {},
  queryStore: FlowEnrollmentQueryStore = {
    getByOwner: vi.fn(async () => null)
  }
) {
  return new FlowEnrollmentService(
    {
      executeActivate: vi.fn(async () => {
        throw new Error("Unexpected activation command");
      }),
      executePause: vi.fn(async () => {
        throw new Error("Unexpected pause command");
      }),
      ...overrides
    },
    queryStore
  );
}

function request(): AstrologerSessionRequest {
  return {
    headers: {},
    currentAstrologerAccount: {
      account: { id: ownerUserId, status: "active", roles: ["astrologer"] }
    }
  };
}

function activationRequest() {
  return {
    schemaVersion: "flow-activation-command.v1" as const,
    versionId,
    expectedRevision: 7,
    expectedEnrollmentRevision: 3,
    expectedActiveVersionId: null
  };
}

function pauseRequest() {
  return {
    schemaVersion: "flow-enrollment-pause-command.v1" as const,
    expectedEnrollmentRevision: 4,
    expectedActiveVersionId: versionId,
    expectedActivationEpochId: epochId
  };
}

function activeResponse(): ActivateFlowVersionResponse {
  return {
    schemaVersion: "flow-activation-result.v1",
    enrollment: {
      schemaVersion: "flow-enrollment-control.v1",
      flowId,
      state: "active",
      definitionRevision: 7,
      enrollmentRevision: 4,
      activeVersionId: versionId,
      activeActivationEpochId: epochId,
      activeSince: activatedAt,
      lastPausedAt: null
    },
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
  const active = activeResponse();
  return {
    schemaVersion: "flow-enrollment-pause-result.v1",
    enrollment: {
      ...active.enrollment,
      state: "paused",
      enrollmentRevision: 5,
      activeVersionId: null,
      activeActivationEpochId: null,
      activeSince: null,
      lastPausedAt: pausedAt
    },
    closedEpoch: {
      ...active.activationEpoch,
      effectiveTo: pausedAt,
      closeReason: "pause_enrollment",
      closedByActorSubjectId: actorSubjectId,
      closeCommandId: pauseCommandId
    }
  };
}

function succeededActivation(kind: "created" | "replayed") {
  return {
    kind,
    outcome: {
      kind: "succeeded" as const,
      response: { statusCode: 200 as const, body: activeResponse() }
    }
  };
}

function succeededPause(kind: "created" | "replayed") {
  return {
    kind,
    outcome: {
      kind: "succeeded" as const,
      response: { statusCode: 200 as const, body: pausedResponse() }
    }
  };
}

function rejectedActivation(response: FlowEnrollmentCommandRejectionResponse) {
  return vi.fn<FlowEnrollmentControlStore["executeActivate"]>(async (input) => {
    input.createCommand({ actorSubjectId, ownerSubjectId });
    return { kind: "created", outcome: { kind: "rejected", response } };
  });
}
