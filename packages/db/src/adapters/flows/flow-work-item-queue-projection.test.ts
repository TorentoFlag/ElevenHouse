import { flowGraphV2Schema, type FlowWorkItem } from "@elevenhouse/contracts";
import { compileFlowGraphV2 } from "@elevenhouse/domain";
import { describe, expect, it } from "vitest";

import { projectFlowWorkItemQueueEntry } from "./flow-work-item-queue-projection";

describe("projectFlowWorkItemQueueEntry", () => {
  it("projects only allowlisted booking context after proving snapshot identity", () => {
    expect(projectFlowWorkItemQueueEntry(evidence())).toEqual({
      workItem,
      context: {
        status: "available",
        subjectType: "booking",
        completionRequirements: { resultSummary: "required" },
        flow: { id: flowId, currentName: "После записи" },
        booking: {
          id: bookingId,
          lifecycleRevision: 1,
          state: "confirmed",
          currentStartAt: "2026-08-08T10:00:00.000Z",
          currentEndAt: "2026-08-08T11:00:00.000Z",
          timeZoneSnapshot: "Europe/Moscow"
        },
        client: { userId: clientUserId, currentDisplayName: null },
        product: { id: productId, titleSnapshot: "Натальная консультация" }
      }
    });
  });

  it("projects a manual-client task without inventing a booking or product", () => {
    expect(projectFlowWorkItemQueueEntry(manualClientEvidence())).toEqual({
      workItem: { ...workItem, nodeId: "prepare-manual", dueAt: null },
      context: {
        status: "available",
        subjectType: "client",
        completionRequirements: { resultSummary: "optional" },
        flow: { id: flowId, currentName: "Ручная подготовка" },
        client: { userId: clientUserId, currentDisplayName: "Мария" }
      }
    });
  });

  it("returns a typed pending context while the Booking aggregate is ahead of Flow projection", () => {
    expect(
      projectFlowWorkItemQueueEntry(
        evidence({ bookingLifecycleRevision: 2, bookingStartAt: "2026-08-10T10:00:00.000Z" })
      )
    ).toEqual({
      workItem,
      context: {
        status: "context_pending",
        code: "FLOW_WORK_ITEM_BOOKING_CONTEXT_PENDING",
        bookingId,
        appliedRevision: 1,
        aggregateRevision: 2
      }
    });
  });

  it("does not expose a mixed queue row when a booking-relative deadline basis is stale", () => {
    expect(projectFlowWorkItemQueueEntry(evidence({ dueBookingLifecycleRevision: 0 }))).toEqual({
      workItem,
      context: {
        status: "integrity_error",
        code: "FLOW_WORK_ITEM_CONTEXT_INTEGRITY_ERROR"
      }
    });
  });

  it("fails closed when equal Booking revisions disagree on schedule", () => {
    expect(
      projectFlowWorkItemQueueEntry(evidence({ lifecycleHeadStartAt: "2026-08-09T10:00:00.000Z" }))
    ).toEqual({
      workItem,
      context: {
        status: "integrity_error",
        code: "FLOW_WORK_ITEM_CONTEXT_INTEGRITY_ERROR"
      }
    });
  });

  it.each([
    ["event subject", { eventSubjectId: otherId }],
    ["snapshot booking", { snapshotBookingId: otherId }],
    ["snapshot client", { snapshotClientUserId: otherId }],
    ["snapshot product", { snapshotProductId: otherId }],
    ["missing booking", { bookingId: null }],
    ["pinned node", { definitionNodeId: "different-task" }]
  ] as const)("fails closed for mismatched %s evidence", (_label, overrides) => {
    expect(projectFlowWorkItemQueueEntry(evidence(overrides))).toEqual({
      workItem,
      context: {
        status: "integrity_error",
        code: "FLOW_WORK_ITEM_CONTEXT_INTEGRITY_ERROR"
      }
    });
  });
});

const ownerUserId = "10000000-0000-4000-8000-000000000001";
const flowId = "10000000-0000-4000-8000-000000000002";
const bookingId = "10000000-0000-4000-8000-000000000003";
const clientUserId = "10000000-0000-4000-8000-000000000004";
const productId = "10000000-0000-4000-8000-000000000005";
const otherId = "10000000-0000-4000-8000-000000000099";

const graph = flowGraphV2Schema.parse({
  schemaVersion: "flow-graph.v2",
  nodes: [
    {
      id: "booking-confirmed",
      kind: "booking_confirmed",
      displayTitle: "Запись подтверждена",
      configSchemaVersion: 1,
      executorContractVersion: 1,
      config: { productIds: [productId] }
    },
    {
      id: "prepare-consultation",
      kind: "astrologer_work_item",
      displayTitle: "Подготовка консультации",
      configSchemaVersion: 1,
      executorContractVersion: 1,
      config: {
        taskKind: "consultation_preparation",
        taskTitle: "Подготовить консультацию",
        priority: "normal",
        duePolicy: { kind: "before_booking_start", leadTimeMinutes: 1_440 },
        completionRequirements: { resultSummary: "required" }
      }
    },
    {
      id: "completed",
      kind: "completed",
      displayTitle: "Подготовка завершена",
      configSchemaVersion: 1,
      executorContractVersion: 1,
      config: { goalKey: "consultation_prepared" }
    }
  ],
  edges: [
    {
      id: "booking-task",
      sourceNodeId: "booking-confirmed",
      targetNodeId: "prepare-consultation",
      sourceHandle: "next"
    },
    {
      id: "task-completed",
      sourceNodeId: "prepare-consultation",
      targetNodeId: "completed",
      sourceHandle: "success"
    }
  ]
});
const capabilityManifest =
  compileFlowGraphV2(graph).capabilityManifest ?? raise("Expected projection capability manifest");

const workItem = {
  id: "20000000-0000-4000-8000-000000000001",
  flowRunId: "20000000-0000-4000-8000-000000000002",
  flowVersionId: "20000000-0000-4000-8000-000000000003",
  nodeId: "prepare-consultation",
  status: "pending",
  taskKind: "consultation_preparation",
  title: "Подготовить консультацию",
  instructions: null,
  assigneeUserId: ownerUserId,
  priority: "normal",
  dueAt: "2026-08-07T10:00:00.000Z",
  availableAt: "2026-08-05T07:00:00.000Z",
  snoozedUntil: null,
  revision: 1,
  resultSummary: null,
  createdAt: "2026-08-05T07:00:00.000Z",
  updatedAt: "2026-08-05T07:00:00.000Z",
  startedAt: null,
  completedAt: null,
  completedByUserId: null,
  expiredAt: null,
  canceledAt: null
} satisfies FlowWorkItem;

function evidence(
  overrides: {
    readonly eventSubjectId?: string;
    readonly snapshotBookingId?: string;
    readonly snapshotClientUserId?: string;
    readonly snapshotProductId?: string;
    readonly bookingId?: string | null;
    readonly definitionNodeId?: string;
    readonly bookingLifecycleRevision?: number;
    readonly bookingStartAt?: string;
    readonly lifecycleHeadStartAt?: string;
    readonly dueBookingLifecycleRevision?: number | null;
  } = {}
) {
  const resolvedBookingId = overrides.bookingId === undefined ? bookingId : overrides.bookingId;
  return {
    workItem,
    flow: { id: flowId, currentName: "После записи" },
    definition: {
      flowVersionId: workItem.flowVersionId,
      nodeId: overrides.definitionNodeId ?? workItem.nodeId,
      nodeKind: "astrologer_work_item",
      configSchemaVersion: 1,
      executorContractVersion: 1,
      executorKey: "astrologer_work_item:1:1",
      graph,
      capabilityManifest
    },
    runSnapshot: {
            schemaVersion: "flow-run-snapshot.v2",
            enrollment: {
              activationEpochId: "30000000-0000-4000-8000-000000000001",
              triggerNodeId: "booking-confirmed",
              occurrenceKey: bookingId,
              policyKey: "once_per_occurrence",
              policyRevision: 1,
              rolloutPolicyRevision: 1,
              eventOccurredAt: "2026-08-05T06:00:00.000Z",
              enrolledAt: "2026-08-05T06:01:00.000Z"
            },
            subject: {
              type: "booking",
              bookingId: overrides.snapshotBookingId ?? bookingId,
              clientUserId: overrides.snapshotClientUserId ?? clientUserId,
              productId: overrides.snapshotProductId ?? productId,
              startAt: "2026-08-08T10:00:00.000Z",
              endAt: "2026-08-08T11:00:00.000Z"
            },
            executionAuthority: {
              basis: "current_entitlement",
              referenceId: "30000000-0000-4000-8000-000000000003"
            }
          },
    event: {
      subjectType: "booking",
      subjectId: overrides.eventSubjectId ?? bookingId
    },
    deadlineBasis: {
      duePolicyKind: "before_booking_start",
      dueLeadTimeMinutes: 1_440,
      dueBookingLifecycleRevision: overrides.dueBookingLifecycleRevision ?? 1
    },
    booking:
      resolvedBookingId === null
        ? null
        : {
            id: resolvedBookingId,
            clientUserId,
            productId,
            lifecycleRevision: overrides.bookingLifecycleRevision ?? 1,
            state: "confirmed",
            currentStartAt: new Date(overrides.bookingStartAt ?? "2026-08-08T10:00:00.000Z"),
            currentEndAt: new Date("2026-08-08T11:00:00.000Z"),
            timeZoneSnapshot: "Europe/Moscow",
            productTitleSnapshot: "Натальная консультация"
          },
    bookingLifecycleHead:
      resolvedBookingId === null
        ? null
        : {
            bookingId: resolvedBookingId,
            appliedRevision: 1,
            state: "confirmed",
            currentStartAt: new Date(overrides.lifecycleHeadStartAt ?? "2026-08-08T10:00:00.000Z"),
            currentEndAt: new Date("2026-08-08T11:00:00.000Z"),
            currentTimeZone: "Europe/Moscow"
          },
    clientCurrentDisplayName: null
  };
}

function raise(message: string): never {
  throw new Error(message);
}

function manualClientEvidence() {
  const manualGraph = flowGraphV2Schema.parse({
    schemaVersion: "flow-graph.v2",
    nodes: [
      {
        id: "manual-client",
        kind: "manual_client",
        displayTitle: "Клиент выбран вручную",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: {}
      },
      {
        id: "prepare-manual",
        kind: "astrologer_work_item",
        displayTitle: "Подготовить вручную",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: {
          taskKind: "consultation_preparation",
          taskTitle: "Подготовить вручную",
          priority: "normal",
          completionRequirements: { resultSummary: "optional" }
        }
      },
      {
        id: "completed-manual",
        kind: "completed",
        displayTitle: "Готово",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: { goalKey: "manual_prepared" }
      }
    ],
    edges: [
      { id: "manual-to-work", sourceNodeId: "manual-client", sourceHandle: "next", targetNodeId: "prepare-manual" },
      { id: "work-to-completed", sourceNodeId: "prepare-manual", sourceHandle: "success", targetNodeId: "completed-manual" }
    ]
  });
  const manualManifest = compileFlowGraphV2(manualGraph).capabilityManifest ?? raise("Expected manual manifest");
  return {
    workItem: { ...workItem, nodeId: "prepare-manual", dueAt: null },
    flow: { id: flowId, currentName: "Ручная подготовка" },
    definition: {
      flowVersionId: workItem.flowVersionId,
      nodeId: "prepare-manual",
      nodeKind: "astrologer_work_item",
      configSchemaVersion: 1,
      executorContractVersion: 1,
      executorKey: "astrologer_work_item:1:1",
      graph: manualGraph,
      capabilityManifest: manualManifest
    },
    runSnapshot: {
      schemaVersion: "flow-run-snapshot.v2",
      enrollment: {
        activationEpochId: "30000000-0000-4000-8000-000000000001",
        triggerNodeId: "manual-client",
        occurrenceKey: "sha256:1234567890123456789012345678901234567890123456789012345678901234",
        policyKey: "once_per_occurrence",
        policyRevision: 1,
        rolloutPolicyRevision: 1,
        eventOccurredAt: "2026-08-05T06:00:00.000Z",
        enrolledAt: "2026-08-05T06:01:00.000Z"
      },
      subject: { type: "client", clientUserId, relationshipId: "30000000-0000-4000-8000-000000000099" },
      executionAuthority: { basis: "current_entitlement", referenceId: "30000000-0000-4000-8000-000000000003" }
    },
    event: { subjectType: "client", subjectId: clientUserId },
    deadlineBasis: { duePolicyKind: "none", dueLeadTimeMinutes: null, dueBookingLifecycleRevision: null },
    booking: null,
    bookingLifecycleHead: null,
    clientCurrentDisplayName: "Мария"
  };
}
