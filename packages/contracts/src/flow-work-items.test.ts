import { describe, expect, it } from "vitest";

import {
  completeFlowWorkItemRequestSchema,
  flowWorkItemCommandRejectionSchema,
  flowWorkItemQueueEntrySchema,
  flowWorkItemSchema,
  flowWorkItemTaskKindSchema,
  listFlowWorkItemsQuerySchema,
  listFlowWorkItemsResponseSchema,
  snoozeFlowWorkItemRequestSchema,
  startFlowWorkItemRequestSchema
} from "./flow-work-items";

const pendingWorkItem = {
  id: "10000000-0000-4000-8000-000000000001",
  flowRunId: "10000000-0000-4000-8000-000000000002",
  flowVersionId: "10000000-0000-4000-8000-000000000003",
  nodeId: "prepare-consultation",
  status: "pending",
  taskKind: "consultation_preparation",
  title: "Подготовить консультацию",
  instructions: null,
  assigneeUserId: "10000000-0000-4000-8000-000000000004",
  priority: "normal",
  dueAt: null,
  availableAt: "2026-08-04T08:00:00.000Z",
  snoozedUntil: null,
  revision: 1,
  resultSummary: null,
  createdAt: "2026-08-04T08:00:00.000Z",
  updatedAt: "2026-08-04T08:00:00.000Z",
  startedAt: null,
  completedAt: null,
  completedByUserId: null,
  expiredAt: null,
  canceledAt: null
} as const;

describe("flow work-item contracts", () => {
  it("supports a dedicated durable birth-data collection task", () => {
    expect(flowWorkItemTaskKindSchema.parse("birth_data_collection")).toBe(
      "birth_data_collection"
    );
  });

  it("accepts an owner-facing pending work item with explicit lifecycle state", () => {
    expect(flowWorkItemSchema.parse(pendingWorkItem)).toEqual(pendingWorkItem);
  });

  it("rejects terminal or snooze evidence that disagrees with status", () => {
    expect(
      flowWorkItemSchema.safeParse({
        ...pendingWorkItem,
        completedAt: "2026-08-04T08:01:00.000Z",
        completedByUserId: pendingWorkItem.assigneeUserId
      }).success
    ).toBe(false);
    expect(
      flowWorkItemSchema.safeParse({
        ...pendingWorkItem,
        status: "snoozed"
      }).success
    ).toBe(false);
  });

  it("parses bounded list filters and rejects unknown fields", () => {
    expect(listFlowWorkItemsQuerySchema.parse({ status: "in_progress", limit: "25" })).toEqual({
      status: "in_progress",
      limit: 25,
      offset: 0
    });
    expect(
      listFlowWorkItemsQuerySchema.safeParse({ status: "all", ownerUserId: "forged" }).success
    ).toBe(false);
    expect(listFlowWorkItemsQuerySchema.parse({ status: "active" })).toEqual({
      status: "active",
      limit: 50,
      offset: 0
    });
  });

  it("exposes an allowlisted booking context for one work-item queue row", () => {
    const entry = {
      workItem: pendingWorkItem,
      context: {
        status: "available",
        subjectType: "booking",
        completionRequirements: { resultSummary: "required" },
        flow: {
          id: "10000000-0000-4000-8000-000000000005",
          currentName: "После записи"
        },
        booking: {
          id: "10000000-0000-4000-8000-000000000006",
          lifecycleRevision: 3,
          state: "confirmed",
          currentStartAt: "2026-08-08T10:00:00.000Z",
          currentEndAt: "2026-08-08T11:00:00.000Z",
          timeZoneSnapshot: "Europe/Moscow"
        },
        client: {
          userId: "10000000-0000-4000-8000-000000000007",
          currentDisplayName: "Мария"
        },
        product: {
          id: "10000000-0000-4000-8000-000000000008",
          titleSnapshot: "Натальная консультация"
        }
      }
    } as const;

    expect(flowWorkItemQueueEntrySchema.parse(entry)).toEqual(entry);
    expect(
      listFlowWorkItemsResponseSchema.parse({
        items: [entry],
        total: 1,
        asOf: "2026-08-05T08:00:00.000Z"
      })
    ).toEqual({ items: [entry], total: 1, asOf: "2026-08-05T08:00:00.000Z" });
  });

  it("fails closed without client context fields when projection integrity is not proven", () => {
    expect(
      flowWorkItemQueueEntrySchema.parse({
        workItem: pendingWorkItem,
        context: {
          status: "integrity_error",
          code: "FLOW_WORK_ITEM_CONTEXT_INTEGRITY_ERROR"
        }
      })
    ).toEqual({
      workItem: pendingWorkItem,
      context: {
        status: "integrity_error",
        code: "FLOW_WORK_ITEM_CONTEXT_INTEGRITY_ERROR"
      }
    });
    expect(
      flowWorkItemQueueEntrySchema.safeParse({
        workItem: pendingWorkItem,
        context: {
          status: "integrity_error",
          code: "FLOW_WORK_ITEM_CONTEXT_INTEGRITY_ERROR",
          currentDisplayName: "Must not leak"
        }
      }).success
    ).toBe(false);
  });

  it("exposes projection lag without mixing Booking schedule revisions", () => {
    expect(
      flowWorkItemQueueEntrySchema.parse({
        workItem: pendingWorkItem,
        context: {
          status: "context_pending",
          code: "FLOW_WORK_ITEM_BOOKING_CONTEXT_PENDING",
          bookingId: "10000000-0000-4000-8000-000000000006",
          appliedRevision: 2,
          aggregateRevision: 3
        }
      })
    ).toEqual({
      workItem: pendingWorkItem,
      context: {
        status: "context_pending",
        code: "FLOW_WORK_ITEM_BOOKING_CONTEXT_PENDING",
        bookingId: "10000000-0000-4000-8000-000000000006",
        appliedRevision: 2,
        aggregateRevision: 3
      }
    });
  });

  it("accepts Booking lifecycle revision evidence on every mutation", () => {
    expect(
      startFlowWorkItemRequestSchema.parse({
        expectedRevision: 1,
        expectedBookingLifecycleRevision: 3
      })
    ).toEqual({ expectedRevision: 1, expectedBookingLifecycleRevision: 3 });
    expect(
      snoozeFlowWorkItemRequestSchema.parse({
        expectedRevision: 2,
        expectedBookingLifecycleRevision: 3,
        snoozedUntil: "2026-08-05T08:00:00.000Z"
      })
    ).toEqual({
      expectedRevision: 2,
      expectedBookingLifecycleRevision: 3,
      snoozedUntil: "2026-08-05T08:00:00.000Z"
    });
    expect(
      completeFlowWorkItemRequestSchema.parse({
        expectedRevision: 3,
        expectedBookingLifecycleRevision: 3,
        resultSummary: "Карта и вопросы проверены"
      })
    ).toEqual({
      expectedRevision: 3,
      expectedBookingLifecycleRevision: 3,
      resultSummary: "Карта и вопросы проверены"
    });
    expect(startFlowWorkItemRequestSchema.parse({ expectedRevision: 1 })).toEqual({
      expectedRevision: 1
    });
    expect(
      startFlowWorkItemRequestSchema.safeParse({
        expectedRevision: 1,
        expectedBookingLifecycleRevision: 0
      }).success
    ).toBe(false);
  });

  it("shares exact safe rejection bodies with API clients", () => {
    expect(
      flowWorkItemCommandRejectionSchema.parse({
        code: "FLOW_WORK_ITEM_REVISION_CONFLICT",
        currentRevision: 4
      })
    ).toEqual({ code: "FLOW_WORK_ITEM_REVISION_CONFLICT", currentRevision: 4 });
    expect(
      flowWorkItemCommandRejectionSchema.parse({
        code: "FLOW_WORK_ITEM_TRANSITION_NOT_ALLOWED",
        status: "completed"
      })
    ).toEqual({ code: "FLOW_WORK_ITEM_TRANSITION_NOT_ALLOWED", status: "completed" });
    expect(
      flowWorkItemCommandRejectionSchema.parse({
        code: "FLOW_WORK_ITEM_RESULT_SUMMARY_REQUIRED"
      })
    ).toEqual({ code: "FLOW_WORK_ITEM_RESULT_SUMMARY_REQUIRED" });
    expect(
      flowWorkItemCommandRejectionSchema.parse({
        code: "FLOW_WORK_ITEM_BOOKING_CONTEXT_PENDING",
        bookingId: "10000000-0000-4000-8000-000000000006",
        appliedRevision: 2,
        aggregateRevision: 3
      })
    ).toEqual({
      code: "FLOW_WORK_ITEM_BOOKING_CONTEXT_PENDING",
      bookingId: "10000000-0000-4000-8000-000000000006",
      appliedRevision: 2,
      aggregateRevision: 3
    });
    expect(
      flowWorkItemCommandRejectionSchema.parse({
        code: "FLOW_WORK_ITEM_BOOKING_CONTEXT_CHANGED",
        currentBookingLifecycleRevision: 4
      })
    ).toEqual({
      code: "FLOW_WORK_ITEM_BOOKING_CONTEXT_CHANGED",
      currentBookingLifecycleRevision: 4
    });
    expect(
      flowWorkItemCommandRejectionSchema.safeParse({
        code: "FLOW_WORK_ITEM_REVISION_CONFLICT",
        currentRevision: 4,
        internalReason: "database detail"
      }).success
    ).toBe(false);
  });
});
