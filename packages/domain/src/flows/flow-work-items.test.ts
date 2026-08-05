import { describe, expect, it, vi } from "vitest";

import type {
  CompleteFlowWorkItemRequest,
  FlowWorkItem,
  ListFlowWorkItemsQuery,
  SnoozeFlowWorkItemRequest,
  StartFlowWorkItemRequest
} from "@elevenhouse/contracts";

import { sha256CanonicalJson, type CanonicalJson } from "../calculations/canonical-json";
import {
  completeFlowWorkItem,
  listOwnerFlowWorkItems,
  snoozeFlowWorkItem,
  startFlowWorkItem,
  type FlowWorkItemCommand,
  type FlowWorkItemCommandResult,
  type FlowWorkItemStore
} from "./flow-work-items";

const actorUserId = "10000000-0000-4000-8000-000000000001";
const ownerUserId = "10000000-0000-4000-8000-000000000002";
const workItemId = "10000000-0000-4000-8000-000000000003";
const bookingLifecycleRevision = 1;

describe("flow work-item use cases", () => {
  it("lists only the normalized owner scope", async () => {
    const query: ListFlowWorkItemsQuery = { status: "active", limit: 25, offset: 0 };
    const result = {
      items: [queueEntry()],
      total: 1,
      asOf: "2026-08-04T10:00:00.000Z"
    };
    const store = storeWith({ list: vi.fn(async () => result) });

    await expect(
      listOwnerFlowWorkItems({ store, ownerUserId: ` ${ownerUserId} `, query })
    ).resolves.toEqual(result);
    expect(store.list).toHaveBeenCalledWith({ ownerUserId, query });
  });

  it.each([
    {
      label: "start",
      execute: (store: FlowWorkItemStore) =>
        startFlowWorkItem({
          store,
          actorUserId,
          ownerUserId,
          workItemId,
          idempotencyKey: " start-work-item-1 ",
          request: {
            expectedRevision: 1,
            expectedBookingLifecycleRevision: bookingLifecycleRevision
          }
        }),
      routeTemplate: "/flow-work-items/:workItemId/start" as const,
      scope: "flows.work-items.start.v1" as const,
      idempotencyKey: "start-work-item-1",
      request: {
        schemaVersion: "flow-work-item-start-request.v1" as const,
        body: { expectedRevision: 1, expectedBookingLifecycleRevision: bookingLifecycleRevision }
      }
    },
    {
      label: "snooze",
      execute: (store: FlowWorkItemStore) =>
        snoozeFlowWorkItem({
          store,
          actorUserId,
          ownerUserId,
          workItemId,
          idempotencyKey: "snooze-work-item-1",
          request: {
            expectedRevision: 2,
            expectedBookingLifecycleRevision: bookingLifecycleRevision,
            snoozedUntil: "2026-08-05T10:00:00.000Z"
          }
        }),
      routeTemplate: "/flow-work-items/:workItemId/snooze" as const,
      scope: "flows.work-items.snooze.v1" as const,
      idempotencyKey: "snooze-work-item-1",
      request: {
        schemaVersion: "flow-work-item-snooze-request.v1" as const,
        body: {
          expectedRevision: 2,
          expectedBookingLifecycleRevision: bookingLifecycleRevision,
          snoozedUntil: "2026-08-05T10:00:00.000Z"
        }
      }
    },
    {
      label: "complete",
      execute: (store: FlowWorkItemStore) =>
        completeFlowWorkItem({
          store,
          actorUserId,
          ownerUserId,
          workItemId,
          idempotencyKey: "complete-work-item-1",
          request: {
            expectedRevision: 3,
            expectedBookingLifecycleRevision: bookingLifecycleRevision,
            resultSummary: "К консультации готово"
          }
        }),
      routeTemplate: "/flow-work-items/:workItemId/complete" as const,
      scope: "flows.work-items.complete.v1" as const,
      idempotencyKey: "complete-work-item-1",
      request: {
        schemaVersion: "flow-work-item-complete-request.v1" as const,
        body: {
          expectedRevision: 3,
          expectedBookingLifecycleRevision: bookingLifecycleRevision,
          resultSummary: "К консультации готово"
        }
      }
    }
  ])("builds a canonical owner-scoped $label command", async (scenario) => {
    let received: FlowWorkItemCommand | undefined;
    const result = succeededResult();
    const store = storeWith({
      execute: vi.fn(async ({ command }) => {
        received = command;
        return result;
      })
    });

    await expect(scenario.execute(store)).resolves.toBe(result);

    const identity = {
      schemaVersion: "flow-work-item-command.v1",
      apiSurface: "astrologer-api",
      actorUserId,
      ownerUserId,
      routeTemplate: scenario.routeTemplate,
      resourceId: workItemId,
      scope: scenario.scope,
      request: scenario.request
    } as const;
    expect(received).toEqual({
      apiSurface: "astrologer-api",
      actorUserId,
      ownerUserId,
      routeTemplate: scenario.routeTemplate,
      resourceId: workItemId,
      scope: scenario.scope,
      idempotencyKey: scenario.idempotencyKey,
      requestHash: sha256CanonicalJson(identity as unknown as CanonicalJson),
      request: scenario.request
    });
  });

  it.each([
    {
      execute: (store: FlowWorkItemStore, request: unknown) =>
        startFlowWorkItem({
          store,
          actorUserId,
          ownerUserId,
          workItemId,
          idempotencyKey: "start-invalid-1",
          request: request as StartFlowWorkItemRequest
        })
    },
    {
      execute: (store: FlowWorkItemStore, request: unknown) =>
        snoozeFlowWorkItem({
          store,
          actorUserId,
          ownerUserId,
          workItemId,
          idempotencyKey: "snooze-invalid-1",
          request: request as SnoozeFlowWorkItemRequest
        })
    },
    {
      execute: (store: FlowWorkItemStore, request: unknown) =>
        completeFlowWorkItem({
          store,
          actorUserId,
          ownerUserId,
          workItemId,
          idempotencyKey: "complete-invalid-1",
          request: request as CompleteFlowWorkItemRequest
        })
    }
  ])("rejects unknown request fields before persistence", async ({ execute }) => {
    const store = storeWith();
    await expect(
      execute(store, {
        expectedRevision: 1,
        expectedBookingLifecycleRevision: bookingLifecycleRevision,
        forged: true
      })
    ).rejects.toBeDefined();
    expect(store.execute).not.toHaveBeenCalled();
  });
});

function storeWith(overrides: Partial<FlowWorkItemStore> = {}): FlowWorkItemStore {
  return {
    list: vi.fn(async () => ({
      items: [],
      total: 0,
      asOf: "2026-08-04T10:00:00.000Z"
    })),
    execute: vi.fn(async () => succeededResult()),
    ...overrides
  };
}

function succeededResult(): FlowWorkItemCommandResult {
  return {
    kind: "created",
    outcome: {
      kind: "succeeded",
      response: { statusCode: 200, body: { workItem: workItem() } }
    }
  };
}

function workItem(): FlowWorkItem {
  return {
    id: workItemId,
    flowRunId: "10000000-0000-4000-8000-000000000004",
    flowVersionId: "10000000-0000-4000-8000-000000000005",
    nodeId: "prepare-consultation",
    status: "pending",
    taskKind: "consultation_preparation",
    title: "Подготовить консультацию",
    instructions: null,
    assigneeUserId: ownerUserId,
    priority: "normal",
    dueAt: null,
    availableAt: "2026-08-04T10:00:00.000Z",
    snoozedUntil: null,
    revision: 1,
    resultSummary: null,
    createdAt: "2026-08-04T10:00:00.000Z",
    updatedAt: "2026-08-04T10:00:00.000Z",
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
