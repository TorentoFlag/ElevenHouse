import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException
} from "@nestjs/common";
import { GUARDS_METADATA, HEADERS_METADATA } from "@nestjs/common/constants";
import type { FlowWorkItem, FlowWorkItemMutationResponse } from "@elevenhouse/contracts";
import {
  FlowRuntimeCommandBusyError,
  FlowRuntimeCommandIntegrityError,
  FlowRuntimeIdempotencyConflictError,
  FlowRuntimeIdempotencyExpiredError,
  FlowRuntimeIdempotencyKeyInvalidError,
  type FlowWorkItemCommandRejectionResponse,
  type FlowWorkItemStore
} from "@elevenhouse/domain";
import { describe, expect, it, vi } from "vitest";

import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import {
  csrfRequiredMetadataKey,
  idempotencyRequiredMetadataKey
} from "../security/route-policy/route-security-metadata";
import { PlatformTariffCapabilityGuard } from "../platform-entitlements/platform-tariff-capability.guard";
import {
  platformTariffCapabilityMetadataKey,
  type PlatformTariffCapabilityPolicy
} from "../platform-entitlements/platform-tariff-capability.policy";
import { FlowWorkItemsController } from "./flow-work-items.controller";
import { FlowWorkItemsService } from "./flow-work-items.service";

const ownerUserId = "10000000-0000-4000-8000-000000000001";
const workItemId = "10000000-0000-4000-8000-000000000002";

describe("FlowWorkItemsService", () => {
  it("lists work items through the authenticated owner scope", async () => {
    const response = {
      items: [queueEntry()],
      total: 1,
      asOf: "2026-08-05T10:00:00.000Z"
    };
    const list = vi.fn(async () => response);
    const service = createService({ list });

    await expect(
      service.list({ status: "pending", limit: "10", offset: "0" }, request())
    ).resolves.toEqual(response);
    expect(list).toHaveBeenCalledWith({
      ownerUserId,
      query: { status: "pending", limit: 10, offset: 0 }
    });
  });

  it.each([
    {
      name: "starts",
      execute: (service: FlowWorkItemsService) =>
        service.start(
          workItemId,
          { expectedRevision: 1, expectedBookingLifecycleRevision: 1 },
          "work-item-start-1",
          request()
        ),
      routeTemplate: "/flow-work-items/:workItemId/start",
      scope: "flows.work-items.start.v1"
    },
    {
      name: "snoozes",
      execute: (service: FlowWorkItemsService) =>
        service.snooze(
          workItemId,
          {
            expectedRevision: 1,
            expectedBookingLifecycleRevision: 1,
            snoozedUntil: "2026-08-06T12:00:00.000Z"
          },
          "work-item-snooze-1",
          request()
        ),
      routeTemplate: "/flow-work-items/:workItemId/snooze",
      scope: "flows.work-items.snooze.v1"
    },
    {
      name: "completes",
      execute: (service: FlowWorkItemsService) =>
        service.complete(
          workItemId,
          {
            expectedRevision: 1,
            expectedBookingLifecycleRevision: 1,
            resultSummary: "Ready"
          },
          "work-item-complete-1",
          request()
        ),
      routeTemplate: "/flow-work-items/:workItemId/complete",
      scope: "flows.work-items.complete.v1"
    }
  ])("$name a durable owner-scoped command", async ({ execute, routeTemplate, scope }) => {
    const executeStore = vi.fn<FlowWorkItemStore["execute"]>(async () => succeeded());
    const service = createService({ execute: executeStore });

    await expect(execute(service)).resolves.toEqual({ workItem: workItem() });
    expect(executeStore).toHaveBeenCalledWith({
      command: expect.objectContaining({
        apiSurface: "astrologer-api",
        actorUserId: ownerUserId,
        ownerUserId,
        resourceId: workItemId,
        routeTemplate,
        scope,
        request: expect.objectContaining({
          body: expect.objectContaining({ expectedBookingLifecycleRevision: 1 })
        })
      })
    });
  });

  it.each([
    [404, { code: "FLOW_WORK_ITEM_NOT_FOUND" }, NotFoundException],
    [409, { code: "FLOW_WORK_ITEM_REVISION_CONFLICT", currentRevision: 2 }, ConflictException],
    [
      409,
      { code: "FLOW_WORK_ITEM_TRANSITION_NOT_ALLOWED", status: "completed" },
      ConflictException
    ],
    [409, { code: "FLOW_WORK_ITEM_SNOOZE_NOT_FUTURE" }, ConflictException],
    [
      409,
      {
        code: "FLOW_WORK_ITEM_BOOKING_CONTEXT_PENDING",
        bookingId: "40000000-0000-4000-8000-000000000002",
        appliedRevision: 1,
        aggregateRevision: 2
      },
      ConflictException
    ],
    [
      409,
      { code: "FLOW_WORK_ITEM_BOOKING_CONTEXT_CHANGED", currentBookingLifecycleRevision: 2 },
      ConflictException
    ],
    [409, { code: "FLOW_RUNTIME_EXECUTION_UNAVAILABLE" }, ConflictException]
  ] as const)(
    "maps a persisted %s rejection without leaking storage detail",
    async (status, body, ErrorType) => {
      const service = createService({
        execute: rejected({ statusCode: status, body } as FlowWorkItemCommandRejectionResponse)
      });

      await expect(
        service.start(workItemId, { expectedRevision: 1 }, "work-item-rejection-1", request())
      ).rejects.toMatchObject({
        constructor: ErrorType,
        status,
        response: expect.objectContaining(body)
      });
    }
  );

  it.each([
    [new FlowRuntimeIdempotencyKeyInvalidError(), BadRequestException, 400],
    [new FlowRuntimeIdempotencyConflictError(), ConflictException, 409],
    [new FlowRuntimeIdempotencyExpiredError(), ConflictException, 409],
    [new FlowRuntimeCommandBusyError(), ServiceUnavailableException, 503],
    [new FlowRuntimeCommandIntegrityError(), InternalServerErrorException, 500]
  ] as const)("maps durable command infrastructure failures", async (error, ErrorType, status) => {
    const service = createService({
      execute: vi.fn(async () => {
        throw error;
      })
    });

    await expect(
      service.start(workItemId, { expectedRevision: 1 }, "work-item-error-1", request())
    ).rejects.toMatchObject({
      constructor: ErrorType,
      status,
      response: expect.objectContaining({ code: error.code })
    });
  });

  it("rejects malformed query, command, and absent astrologer authority before storage", async () => {
    const list = vi.fn<FlowWorkItemStore["list"]>();
    const execute = vi.fn<FlowWorkItemStore["execute"]>();
    const service = createService({ list, execute });

    await expect(service.list({ forged: true }, request())).rejects.toBeInstanceOf(
      BadRequestException
    );
    await expect(
      service.complete(
        workItemId,
        { expectedRevision: 1, forged: true },
        "work-item-invalid-1",
        request()
      )
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.start(workItemId, { expectedRevision: 1 }, "work-item-auth-1", { headers: {} })
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(list).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });
});

describe("FlowWorkItemsController", () => {
  it("keeps historical work item lifecycle outside direct tariff enforcement", () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      FlowWorkItemsController
    ) as readonly unknown[];
    expect(guards).not.toContain(PlatformTariffCapabilityGuard);

    for (const method of ["list", "start", "snooze", "complete"] as const) {
      expect(
        Reflect.getMetadata(
          platformTariffCapabilityMetadataKey,
          FlowWorkItemsController.prototype[method]
        ) as PlatformTariffCapabilityPolicy | undefined
      ).toBeUndefined();
    }
  });

  it("declares exact CSRF and idempotency boundaries for mutations only", () => {
    expect(
      Reflect.getMetadata(csrfRequiredMetadataKey, FlowWorkItemsController.prototype.list)
    ).toBeUndefined();
    expect(
      Reflect.getMetadata(idempotencyRequiredMetadataKey, FlowWorkItemsController.prototype.list)
    ).toBeUndefined();

    for (const [method, scope] of [
      ["start", "flows.work-items.start.v1"],
      ["snooze", "flows.work-items.snooze.v1"],
      ["complete", "flows.work-items.complete.v1"]
    ] as const) {
      const handler = FlowWorkItemsController.prototype[method];
      expect(Reflect.getMetadata(csrfRequiredMetadataKey, handler)).toBe(true);
      expect(Reflect.getMetadata(idempotencyRequiredMetadataKey, handler)).toEqual({ scope });
    }
  });

  it("prevents authenticated queue responses from being cached", () => {
    expect(
      Reflect.getMetadata(HEADERS_METADATA, FlowWorkItemsController.prototype.list)
    ).toContainEqual({ name: "Cache-Control", value: "no-store" });
  });
});

function createService(overrides: Partial<FlowWorkItemStore> = {}): FlowWorkItemsService {
  return new FlowWorkItemsService({
    list: vi.fn(async () => ({
      items: [],
      total: 0,
      asOf: "2026-08-05T10:00:00.000Z"
    })),
    execute: vi.fn(async () => succeeded()),
    ...overrides
  });
}

function rejected(response: FlowWorkItemCommandRejectionResponse): FlowWorkItemStore["execute"] {
  return vi.fn(async () => ({
    kind: "created" as const,
    outcome: { kind: "rejected" as const, response }
  }));
}

function succeeded() {
  return {
    kind: "created" as const,
    outcome: {
      kind: "succeeded" as const,
      response: {
        statusCode: 200 as const,
        body: { workItem: workItem() } satisfies FlowWorkItemMutationResponse
      }
    }
  };
}

function request(): AstrologerSessionRequest {
  return {
    headers: {},
    currentAstrologerAccount: {
      account: { id: ownerUserId, status: "active", roles: ["astrologer"] }
    }
  };
}

function workItem(): FlowWorkItem {
  return {
    id: workItemId,
    flowRunId: "10000000-0000-4000-8000-000000000003",
    flowVersionId: "10000000-0000-4000-8000-000000000004",
    nodeId: "prepare-consultation",
    status: "pending",
    taskKind: "consultation_preparation",
    title: "Prepare consultation",
    instructions: null,
    assigneeUserId: ownerUserId,
    priority: "normal",
    dueAt: null,
    availableAt: "2026-08-05T10:00:00.000Z",
    snoozedUntil: null,
    revision: 1,
    resultSummary: null,
    createdAt: "2026-08-05T10:00:00.000Z",
    updatedAt: "2026-08-05T10:00:00.000Z",
    startedAt: null,
    completedAt: null,
    completedByUserId: null,
    expiredAt: null,
    canceledAt: null
  };
}

function queueEntry() {
  return {
    workItem: workItem(),
    context: {
      status: "integrity_error" as const,
      code: "FLOW_WORK_ITEM_CONTEXT_INTEGRITY_ERROR" as const
    }
  };
}
