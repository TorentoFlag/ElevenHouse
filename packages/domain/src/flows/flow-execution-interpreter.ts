import {
  flowCapabilityManifestSchema,
  flowExecutableNodeKindV2Schema,
  flowGraphV2Schema,
  flowRunSnapshotV2Schema,
  flowAstrologerWorkItemTaskKindV2Schema,
  flowSourceHandleV2Schema,
  flowWorkItemCompletionRequirementsV2Schema,
  flowWorkItemDuePolicyV2Schema,
  flowWorkItemInstructionsV2Schema,
  flowWorkItemPriorityV2Schema,
  type ChartSettings,
  type ChartInterpretationMode,
  type FlowCapabilityManifest,
  type FlowExecutableNodeKindV2,
  type FlowExecutableNodeV2,
  type FlowGraphV2,
  type FlowNodeV2,
  type FlowSourceHandleV2,
  type FlowWorkItemCompletionRequirementsV2,
  type FlowWorkItemDuePolicyV2
} from "@elevenhouse/contracts";
import { z } from "@elevenhouse/validation";
import { verifyFlowCapabilityManifestForGraph } from "./flow-capability-manifest-integrity";
import type { FlowBookingExecutionLifecycleContext } from "./flow-booking-execution-context";

export type FlowNodeExecutorKey = `${FlowExecutableNodeKindV2}:${number}:${number}`;

export type FlowExecutionClaim = {
  readonly tokenId: string;
  readonly ownerUserId: string;
  readonly runId: string;
  readonly flowId: string;
  readonly flowVersionId: string;
  readonly nodeId: string;
  readonly nodeKind: FlowExecutableNodeKindV2;
  readonly configSchemaVersion: number;
  readonly executorContractVersion: number;
  readonly graph: unknown;
  readonly capabilityManifest: unknown;
  readonly enrollmentSnapshot: unknown;
  readonly effectiveRunSnapshot: unknown;
  readonly bookingLifecycleContext: FlowBookingExecutionLifecycleContext | null;
  readonly leaseOwner: string;
  readonly nodeActivationSequence: bigint;
  readonly attemptNumber: bigint;
  readonly fencingToken: bigint;
  readonly claimedAt: string;
  readonly leaseExpiresAt: string;
};

export type PinnedFlowExecutionDefinition = Pick<
  FlowExecutionClaim,
  | "flowVersionId"
  | "nodeId"
  | "nodeKind"
  | "configSchemaVersion"
  | "executorContractVersion"
  | "graph"
  | "capabilityManifest"
>;

const flowRuntimeResultCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
const flowRuntimeStableIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(/^[a-z0-9][a-z0-9_-]*$/);

export const flowExecutionPermanentFailureReasonCodeValues = [
  "FLOW_PINNED_GRAPH_INVALID",
  "FLOW_PINNED_CAPABILITY_MANIFEST_INVALID",
  "FLOW_TOKEN_NODE_NOT_FOUND",
  "FLOW_TOKEN_NODE_METADATA_MISMATCH",
  "FLOW_TOKEN_EXECUTOR_MANIFEST_MISMATCH",
  "FLOW_TOKEN_RUNTIME_STATE_INVALID",
  "FLOW_RUNTIME_TRACE_INVALID",
  "FLOW_NODE_EXECUTOR_UNAVAILABLE",
  "FLOW_NODE_EXECUTION_REJECTED",
  "FLOW_CHART_CALCULATION_FAILED"
] as const;

export const flowExecutionRetryableFailureReasonCodeValues = [
  "FLOW_NODE_EXECUTION_RETRYABLE",
  "FLOW_NODE_EXECUTION_UNEXPECTED_FAILURE"
] as const;

export const flowExecutionFailureReasonCodeValues = [
  ...flowExecutionPermanentFailureReasonCodeValues,
  ...flowExecutionRetryableFailureReasonCodeValues,
  "FLOW_TOKEN_LEASE_EXPIRED"
] as const;

export const flowExecutionQuarantineFailureReasonCodeValues = [
  "FLOW_PINNED_GRAPH_INVALID",
  "FLOW_PINNED_CAPABILITY_MANIFEST_INVALID",
  "FLOW_TOKEN_NODE_NOT_FOUND",
  "FLOW_TOKEN_NODE_METADATA_MISMATCH",
  "FLOW_TOKEN_EXECUTOR_MANIFEST_MISMATCH",
  "FLOW_TOKEN_RUNTIME_STATE_INVALID",
  "FLOW_RUNTIME_TRACE_INVALID",
  "FLOW_NODE_EXECUTOR_UNAVAILABLE"
] as const;

export const flowExecutionRetryScheduledFailureReasonCodeValues = [
  ...flowExecutionRetryableFailureReasonCodeValues,
  "FLOW_TOKEN_LEASE_EXPIRED"
] as const;

export const flowExecutionFailedTerminalFailureReasonCodeValues = [
  "FLOW_NODE_EXECUTION_REJECTED",
  "FLOW_CHART_CALCULATION_FAILED",
  ...flowExecutionRetryableFailureReasonCodeValues,
  "FLOW_TOKEN_LEASE_EXPIRED"
] as const;

const flowExecutionPermanentFailureReasonCodeSchema = z.enum(
  flowExecutionPermanentFailureReasonCodeValues
);
const flowExecutionRetryableFailureReasonCodeSchema = z.enum(
  flowExecutionRetryableFailureReasonCodeValues
);
const flowExecutionFailureReasonCodeSchema = z.enum(flowExecutionFailureReasonCodeValues);

export type FlowExecutionFailureReasonCode = z.infer<typeof flowExecutionFailureReasonCodeSchema>;

export type FlowExecutionFailure = {
  readonly classification: "retryable" | "permanent";
  readonly reasonCode: Exclude<FlowExecutionFailureReasonCode, "FLOW_TOKEN_LEASE_EXPIRED">;
};

export const flowTerminalTraceSummarySchema = z
  .object({
    schemaVersion: z.literal("flow-runtime-trace.v1"),
    outcome: z.literal("terminal"),
    nodeKind: flowExecutableNodeKindV2Schema,
    reasonCode: z.literal("FLOW_GOAL_REACHED"),
    resultCode: flowRuntimeResultCodeSchema
  })
  .strict();

export const flowAdvancedTraceSummarySchema = z
  .object({
    schemaVersion: z.literal("flow-runtime-trace.v1"),
    outcome: z.literal("advanced"),
    nodeKind: flowExecutableNodeKindV2Schema,
    reasonCode: z.literal("FLOW_EDGE_SELECTED"),
    resultCode: z.literal("FLOW_TOKEN_ADVANCED"),
    sourceHandle: flowSourceHandleV2Schema,
    selectedEdgeId: flowRuntimeStableIdSchema,
    targetNodeId: flowRuntimeStableIdSchema,
    targetNodeKind: flowExecutableNodeKindV2Schema
  })
  .strict();

export const flowWorkItemCompletedTraceSummarySchema = z
  .object({
    schemaVersion: z.literal("flow-runtime-trace.v1"),
    outcome: z.literal("advanced"),
    nodeKind: z.literal("astrologer_work_item"),
    reasonCode: z.literal("FLOW_WORK_ITEM_COMPLETED"),
    resultCode: z.literal("FLOW_TOKEN_ADVANCED"),
    sourceHandle: z.literal("success"),
    selectedEdgeId: flowRuntimeStableIdSchema,
    targetNodeId: flowRuntimeStableIdSchema,
    targetNodeKind: flowExecutableNodeKindV2Schema
  })
  .strict();

export const flowApprovalDecidedTraceSummarySchema = z
  .object({
    schemaVersion: z.literal("flow-runtime-trace.v1"),
    outcome: z.literal("advanced"),
    nodeKind: z.enum(["astrologer_approval", "natal_chart_ai_draft"]),
    reasonCode: z.literal("FLOW_APPROVAL_DECIDED"),
    resultCode: z.literal("FLOW_TOKEN_ADVANCED"),
    sourceHandle: z.union([z.literal("approved"), z.literal("rejected"), z.literal("timeout")]),
    selectedEdgeId: flowRuntimeStableIdSchema,
    targetNodeId: flowRuntimeStableIdSchema,
    targetNodeKind: flowExecutableNodeKindV2Schema
  })
  .strict();

/**
 * A profile revision can satisfy a pending collection task without claiming a
 * human astrologer performed the completion. The receipt table is the durable
 * fan-out/idempotency authority; this trace binds the run transition to it.
 */
export const flowBirthProfileRecheckReadyTraceSummarySchema = z
  .object({
    schemaVersion: z.literal("flow-runtime-trace.v1"),
    outcome: z.literal("advanced"),
    nodeKind: z.literal("astrologer_work_item"),
    reasonCode: z.literal("FLOW_BIRTH_PROFILE_RECHECK_READY"),
    resultCode: z.literal("FLOW_TOKEN_ADVANCED"),
    sourceHandle: z.literal("success"),
    selectedEdgeId: flowRuntimeStableIdSchema,
    targetNodeId: flowRuntimeStableIdSchema,
    targetNodeKind: flowExecutableNodeKindV2Schema,
    sourceOutboxEventId: z.string().uuid(),
    birthDataHistoryId: z.string().uuid(),
    birthDataRevision: z.number().int().positive(),
    workItemId: z.string().uuid(),
    fromRevision: z.number().int().positive(),
    toRevision: z.number().int().positive()
  })
  .strict()
  .superRefine((trace, context) => {
    if (trace.toRevision !== trace.fromRevision + 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["toRevision"],
        message: "Birth-profile recheck trace must advance exactly one work-item revision"
      });
    }
  });

export const flowWorkItemWaitingTraceSummarySchema = z
  .object({
    schemaVersion: z.literal("flow-runtime-trace.v1"),
    outcome: z.literal("waiting"),
    nodeKind: z.literal("astrologer_work_item"),
    reasonCode: z.literal("FLOW_WORK_ITEM_CREATED"),
    resultCode: z.literal("FLOW_WAITING_WORK_ITEM")
  })
  .strict();

export const flowSignalWaitingTraceSummarySchema = z
  .object({
    schemaVersion: z.literal("flow-runtime-trace.v1"),
    outcome: z.literal("waiting"),
    nodeKind: z.literal("natal_chart_request"),
    reasonCode: z.literal("FLOW_CHART_CALCULATION_REQUESTED"),
    resultCode: z.literal("FLOW_WAITING_SIGNAL")
  })
  .strict();

export const flowApprovalWaitingTraceSummarySchema = z
  .object({
    schemaVersion: z.literal("flow-runtime-trace.v1"),
    outcome: z.literal("waiting"),
    nodeKind: z.literal("astrologer_approval"),
    reasonCode: z.literal("FLOW_APPROVAL_CREATED"),
    resultCode: z.literal("FLOW_WAITING_APPROVAL")
  })
  .strict();

export const flowNatalChartAiDraftApprovalWaitingTraceSummarySchema = z
  .object({
    schemaVersion: z.literal("flow-runtime-trace.v1"),
    outcome: z.literal("waiting"),
    nodeKind: z.literal("natal_chart_ai_draft"),
    reasonCode: z.literal("FLOW_APPROVAL_CREATED"),
    resultCode: z.literal("FLOW_WAITING_APPROVAL")
  })
  .strict();

export const flowMessagingDeliveryWaitingTraceSummarySchema = z
  .object({
    schemaVersion: z.literal("flow-runtime-trace.v1"),
    outcome: z.literal("waiting"),
    nodeKind: z.literal("send_message"),
    reasonCode: z.literal("FLOW_MESSAGING_DELIVERY_REQUESTED"),
    resultCode: z.literal("FLOW_WAITING_EXTERNAL")
  })
  .strict();

export const flowApprovalAvailableTraceSummarySchema = z
  .object({
    schemaVersion: z.literal("flow-runtime-trace.v1"),
    outcome: z.literal("available"),
    nodeKind: z.enum(["astrologer_approval", "natal_chart_ai_draft"]),
    reasonCode: z.literal("FLOW_APPROVAL_SNOOZE_ELAPSED"),
    resultCode: z.literal("FLOW_APPROVAL_AVAILABLE")
  })
  .strict();

export const flowApprovalExpiredTraceSummarySchema = z
  .object({
    schemaVersion: z.literal("flow-runtime-trace.v1"),
    outcome: z.literal("advanced"),
    nodeKind: z.enum(["astrologer_approval", "natal_chart_ai_draft"]),
    reasonCode: z.literal("FLOW_APPROVAL_EXPIRED"),
    resultCode: z.literal("FLOW_TOKEN_ADVANCED"),
    sourceHandle: z.literal("timeout"),
    selectedEdgeId: flowRuntimeStableIdSchema,
    targetNodeId: flowRuntimeStableIdSchema,
    targetNodeKind: flowExecutableNodeKindV2Schema
  })
  .strict();

export const flowChartCalculationCompletedTraceSummarySchema = z
  .object({
    schemaVersion: z.literal("flow-runtime-trace.v1"),
    outcome: z.literal("advanced"),
    nodeKind: z.literal("natal_chart_request"),
    reasonCode: z.literal("FLOW_CHART_CALCULATION_COMPLETED"),
    resultCode: z.literal("FLOW_TOKEN_ADVANCED"),
    sourceHandle: z.literal("next"),
    selectedEdgeId: flowRuntimeStableIdSchema,
    targetNodeId: flowRuntimeStableIdSchema,
    targetNodeKind: flowExecutableNodeKindV2Schema
  })
  .strict();

export const flowMessagingDeliveryCompletedTraceSummarySchema = z
  .object({
    schemaVersion: z.literal("flow-runtime-trace.v1"),
    outcome: z.literal("advanced"),
    nodeKind: z.literal("send_message"),
    reasonCode: z.literal("FLOW_MESSAGING_DELIVERY_COMPLETED"),
    resultCode: z.literal("FLOW_TOKEN_ADVANCED"),
    sourceHandle: z.union([z.literal("success"), z.literal("error")]),
    selectedEdgeId: flowRuntimeStableIdSchema,
    targetNodeId: flowRuntimeStableIdSchema,
    targetNodeKind: flowExecutableNodeKindV2Schema
  })
  .strict();

export const flowWorkItemAvailableTraceSummarySchema = z
  .object({
    schemaVersion: z.literal("flow-runtime-trace.v1"),
    outcome: z.literal("available"),
    nodeKind: z.literal("astrologer_work_item"),
    reasonCode: z.literal("FLOW_WORK_ITEM_SNOOZE_ELAPSED"),
    resultCode: z.literal("FLOW_WORK_ITEM_AVAILABLE"),
    workItemId: z.string().uuid(),
    fromRevision: z.number().int().positive(),
    toRevision: z.number().int().positive(),
    scheduledFor: z.string().datetime({ offset: true })
  })
  .strict()
  .superRefine((trace, context) => {
    if (trace.toRevision !== trace.fromRevision + 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["toRevision"],
        message: "Work-item wake trace must advance exactly one revision"
      });
    }
  });

const flowRescheduledWorkItemStatusSchema = z.enum(["pending", "in_progress", "snoozed"]);
const flowRescheduledSnoozeAdjustmentSchema = z.enum(["unchanged", "shortened", "woken"]);

export const flowBookingRescheduledTraceSummarySchema = z
  .object({
    schemaVersion: z.literal("flow-runtime-trace.v1"),
    outcome: z.literal("rescheduled"),
    nodeKind: flowExecutableNodeKindV2Schema,
    reasonCode: z.literal("FLOW_BOOKING_RESCHEDULED"),
    resultCode: z.literal("FLOW_BOOKING_SCHEDULE_UPDATED"),
    bookingId: z.string().uuid(),
    bookingLifecycleRevision: z.number().int().positive(),
    previousStartAt: z.string().datetime({ offset: true }),
    previousEndAt: z.string().datetime({ offset: true }),
    previousTimeZone: z.string().trim().min(1).max(120),
    currentStartAt: z.string().datetime({ offset: true }),
    currentEndAt: z.string().datetime({ offset: true }),
    currentTimeZone: z.string().trim().min(1).max(120),
    workItemId: z.string().uuid().nullable(),
    fromRevision: z.number().int().positive().nullable(),
    toRevision: z.number().int().positive().nullable(),
    previousWorkItemStatus: flowRescheduledWorkItemStatusSchema.nullable(),
    currentWorkItemStatus: flowRescheduledWorkItemStatusSchema.nullable(),
    previousDueAt: z.string().datetime({ offset: true }).nullable(),
    currentDueAt: z.string().datetime({ offset: true }).nullable(),
    previousSnoozedUntil: z.string().datetime({ offset: true }).nullable(),
    currentSnoozedUntil: z.string().datetime({ offset: true }).nullable(),
    snoozeAdjustment: flowRescheduledSnoozeAdjustmentSchema.nullable()
  })
  .strict()
  .superRefine((trace, context) => {
    if (
      Date.parse(trace.previousEndAt) <= Date.parse(trace.previousStartAt) ||
      Date.parse(trace.currentEndAt) <= Date.parse(trace.currentStartAt)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["currentEndAt"],
        message: "Booking reschedule trace requires valid schedule ranges"
      });
    }
    if (
      trace.previousStartAt === trace.currentStartAt &&
      trace.previousEndAt === trace.currentEndAt &&
      trace.previousTimeZone === trace.currentTimeZone
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["currentStartAt"],
        message: "Booking reschedule trace requires a changed schedule"
      });
    }

    const workItemMetadata = [
      trace.fromRevision,
      trace.toRevision,
      trace.previousWorkItemStatus,
      trace.currentWorkItemStatus,
      trace.previousDueAt,
      trace.currentDueAt,
      trace.snoozeAdjustment
    ];
    if (trace.workItemId === null) {
      if (
        workItemMetadata.some((value) => value !== null) ||
        trace.previousSnoozedUntil !== null ||
        trace.currentSnoozedUntil !== null
      ) {
        addInvalidRescheduleWorkItemIssue(context);
      }
      return;
    }
    if (workItemMetadata.some((value) => value === null)) {
      addInvalidRescheduleWorkItemIssue(context);
      return;
    }

    if (trace.toRevision !== trace.fromRevision! + 1) {
      addInvalidRescheduleWorkItemIssue(context, "toRevision");
    }
    const previousSnoozeMatchesStatus =
      trace.previousWorkItemStatus === "snoozed"
        ? trace.previousSnoozedUntil !== null
        : trace.previousSnoozedUntil === null;
    const currentSnoozeMatchesStatus =
      trace.currentWorkItemStatus === "snoozed"
        ? trace.currentSnoozedUntil !== null
        : trace.currentSnoozedUntil === null;
    if (!previousSnoozeMatchesStatus || !currentSnoozeMatchesStatus) {
      addInvalidRescheduleWorkItemIssue(context);
      return;
    }

    if (
      trace.snoozeAdjustment === "unchanged" &&
      (trace.previousWorkItemStatus !== trace.currentWorkItemStatus ||
        trace.previousSnoozedUntil !== trace.currentSnoozedUntil ||
        (trace.currentWorkItemStatus === "snoozed" &&
          Date.parse(trace.currentDueAt!) < Date.parse(trace.currentSnoozedUntil!)))
    ) {
      addInvalidRescheduleWorkItemIssue(context, "snoozeAdjustment");
    }
    if (
      trace.snoozeAdjustment === "shortened" &&
      (trace.previousWorkItemStatus !== "snoozed" ||
        trace.currentWorkItemStatus !== "snoozed" ||
        trace.previousSnoozedUntil === null ||
        trace.currentSnoozedUntil === null ||
        trace.currentSnoozedUntil !== trace.currentDueAt ||
        Date.parse(trace.currentSnoozedUntil) >= Date.parse(trace.previousSnoozedUntil))
    ) {
      addInvalidRescheduleWorkItemIssue(context, "snoozeAdjustment");
    }
    if (
      trace.snoozeAdjustment === "woken" &&
      (trace.previousWorkItemStatus !== "snoozed" ||
        trace.currentWorkItemStatus !== "pending" ||
        trace.previousSnoozedUntil === null ||
        trace.currentSnoozedUntil !== null)
    ) {
      addInvalidRescheduleWorkItemIssue(context, "snoozeAdjustment");
    }
  });

export const flowLeaseExpiredTraceSummarySchema = z
  .object({
    schemaVersion: z.literal("flow-runtime-trace.v1"),
    outcome: z.literal("lease_expired"),
    nodeKind: flowExecutableNodeKindV2Schema,
    reasonCode: z.literal("FLOW_TOKEN_LEASE_EXPIRED"),
    resultCode: z.literal("FLOW_TOKEN_LEASE_EXPIRED")
  })
  .strict();

export const flowCanceledTraceSummarySchema = z
  .object({
    schemaVersion: z.literal("flow-runtime-trace.v1"),
    outcome: z.literal("canceled"),
    nodeKind: flowExecutableNodeKindV2Schema,
    reasonCode: z.enum(["FLOW_RUN_CANCELED_BY_OWNER", "FLOW_BOOKING_CANCELED"]),
    resultCode: z.literal("FLOW_RUN_CANCELED")
  })
  .strict();

export const flowRetryScheduledTraceSummarySchema = z
  .object({
    schemaVersion: z.literal("flow-runtime-trace.v1"),
    outcome: z.literal("retry_scheduled"),
    nodeKind: flowExecutableNodeKindV2Schema,
    reasonCode: flowExecutionRetryableFailureReasonCodeSchema,
    resultCode: z.literal("FLOW_EXECUTION_RETRY_SCHEDULED")
  })
  .strict();

export const flowFailedTraceSummarySchema = z
  .object({
    schemaVersion: z.literal("flow-runtime-trace.v1"),
    outcome: z.literal("failed"),
    nodeKind: flowExecutableNodeKindV2Schema,
    reasonCode: flowExecutionFailureReasonCodeSchema,
    resultCode: z.enum(["FLOW_EXECUTION_FAILED_TERMINAL", "FLOW_EXECUTION_RETRY_EXHAUSTED"])
  })
  .strict()
  .superRefine((value, context) => {
    const permanent = flowExecutionPermanentFailureReasonCodeSchema.safeParse(value.reasonCode);
    const retryExhausted =
      flowExecutionRetryableFailureReasonCodeSchema.safeParse(value.reasonCode).success ||
      value.reasonCode === "FLOW_TOKEN_LEASE_EXPIRED";
    if (
      (value.resultCode === "FLOW_EXECUTION_FAILED_TERMINAL" && !permanent.success) ||
      (value.resultCode === "FLOW_EXECUTION_RETRY_EXHAUSTED" && !retryExhausted)
    ) {
      context.addIssue({ code: "custom", message: "Failure reason and result do not match" });
    }
  });

export const flowRuntimeTraceSummarySchema = z.union([
  flowAdvancedTraceSummarySchema,
  flowWorkItemCompletedTraceSummarySchema,
  flowApprovalDecidedTraceSummarySchema,
  flowBirthProfileRecheckReadyTraceSummarySchema,
  flowWorkItemWaitingTraceSummarySchema,
  flowSignalWaitingTraceSummarySchema,
  flowMessagingDeliveryWaitingTraceSummarySchema,
  flowApprovalWaitingTraceSummarySchema,
  flowNatalChartAiDraftApprovalWaitingTraceSummarySchema,
  flowApprovalAvailableTraceSummarySchema,
  flowApprovalExpiredTraceSummarySchema,
  flowChartCalculationCompletedTraceSummarySchema,
  flowMessagingDeliveryCompletedTraceSummarySchema,
  flowWorkItemAvailableTraceSummarySchema,
  flowBookingRescheduledTraceSummarySchema,
  flowTerminalTraceSummarySchema,
  flowLeaseExpiredTraceSummarySchema,
  flowCanceledTraceSummarySchema,
  flowRetryScheduledTraceSummarySchema,
  flowFailedTraceSummarySchema
]);

export type FlowRuntimeTraceSummary = z.infer<typeof flowRuntimeTraceSummarySchema>;
export type FlowTerminalTraceSummary = z.infer<typeof flowTerminalTraceSummarySchema>;

function addInvalidRescheduleWorkItemIssue(
  context: z.RefinementCtx,
  path = "workItemId"
): void {
  context.addIssue({
    code: z.ZodIssueCode.custom,
    path: [path],
    message: "Booking reschedule trace has inconsistent work-item provenance"
  });
}

const flowExecutionTerminalDecisionSchema = z
  .object({
    kind: z.literal("terminal"),
    sourceNodeId: flowRuntimeStableIdSchema,
    terminalStatus: z.literal("completed"),
    resultCode: flowRuntimeResultCodeSchema,
    trace: flowTerminalTraceSummarySchema
  })
  .strict();

const flowExecutionAdvanceSelectionSchema = z
  .object({
    kind: z.literal("advance"),
    sourceNodeId: flowRuntimeStableIdSchema,
    sourceHandle: flowSourceHandleV2Schema
  })
  .strict();

const flowExecutionAdvanceDecisionSchema = z
  .object({
    kind: z.literal("advance"),
    sourceNodeId: flowRuntimeStableIdSchema,
    sourceHandle: flowSourceHandleV2Schema,
    selectedEdgeId: flowRuntimeStableIdSchema,
    targetNodeId: flowRuntimeStableIdSchema,
    targetNodeKind: flowExecutableNodeKindV2Schema,
    resultCode: z.literal("FLOW_TOKEN_ADVANCED"),
    trace: flowAdvancedTraceSummarySchema
  })
  .strict();

const flowExecutionWorkItemWaitDecisionSchema = z
  .object({
    kind: z.literal("wait_work_item"),
    sourceNodeId: flowRuntimeStableIdSchema,
    completionHandle: z.literal("success"),
    resultCode: z.literal("FLOW_WAITING_WORK_ITEM"),
    workItem: z
      .object({
        taskKind: flowAstrologerWorkItemTaskKindV2Schema,
        title: z.string().trim().min(1).max(180),
        instructions: flowWorkItemInstructionsV2Schema.nullable(),
        priority: flowWorkItemPriorityV2Schema,
        duePolicy: flowWorkItemDuePolicyV2Schema,
        completionRequirements: flowWorkItemCompletionRequirementsV2Schema,
        dueAt: z.string().datetime({ offset: true }).nullable()
      })
      .strict(),
    trace: flowWorkItemWaitingTraceSummarySchema
  })
  .strict();

const flowExecutionSignalWaitDecisionSchema = z
  .object({
    kind: z.literal("wait_signal"),
    sourceNodeId: flowRuntimeStableIdSchema,
    resultCode: z.literal("FLOW_WAITING_SIGNAL"),
    wait: z
      .object({
        signalType: z.literal("chart.calculation.terminal.v1"),
        correlationId: z.string().uuid(),
        successHandle: z.literal("next"),
        replayExistingResult: z.boolean().optional()
      })
      .strict(),
    trace: flowSignalWaitingTraceSummarySchema
  })
  .strict();

const flowExecutionExternalWaitDecisionSchema = z
  .object({
    kind: z.literal("wait_external"),
    sourceNodeId: flowRuntimeStableIdSchema,
    resultCode: z.literal("FLOW_WAITING_EXTERNAL"),
    wait: z
      .object({
        signalType: z.literal("messaging.message.delivery.terminal.v1"),
        correlationId: z.string().uuid(),
        successHandle: z.literal("success"),
        failureHandle: z.literal("error")
      })
      .strict(),
    trace: flowMessagingDeliveryWaitingTraceSummarySchema
  })
  .strict();

const flowExecutionApprovalWaitDecisionSchema = z
  .object({
    kind: z.literal("wait_approval"),
    sourceNodeId: flowRuntimeStableIdSchema,
    resultCode: z.literal("FLOW_WAITING_APPROVAL"),
    approval: z
      .object({
        kind: z.enum(["ai_output", "manual_task"]),
        title: z.string().trim().min(1).max(180),
        preview: z.string().trim().min(1).max(1_000),
        artifact: z
          .object({
            calculationId: z.string().uuid(),
            interpretationId: z.string().uuid(),
            sourceChecksum: z.string().regex(/^sha256:[a-f0-9]{64}$/),
            contentChecksum: z.string().regex(/^sha256:[a-f0-9]{64}$/),
            outputText: z.string().trim().min(1).max(26_000)
          })
          .strict()
          .nullable(),
        expiresAfterMinutes: z.number().int().min(1).max(525_600).nullable()
      })
      .strict(),
    trace: z.union([
      flowApprovalWaitingTraceSummarySchema,
      flowNatalChartAiDraftApprovalWaitingTraceSummarySchema
    ])
  })
  .strict();

const flowExecutionDecisionSchema = z.discriminatedUnion("kind", [
  flowExecutionAdvanceDecisionSchema,
  flowExecutionWorkItemWaitDecisionSchema,
  flowExecutionSignalWaitDecisionSchema,
  flowExecutionExternalWaitDecisionSchema,
  flowExecutionApprovalWaitDecisionSchema,
  flowExecutionTerminalDecisionSchema
]);

export type FlowExecutionDecision = z.infer<typeof flowExecutionDecisionSchema>;
export type FlowNodeExecutorDecision =
  | z.infer<typeof flowExecutionAdvanceSelectionSchema>
  | z.infer<typeof flowExecutionWorkItemWaitDecisionSchema>
  | z.infer<typeof flowExecutionSignalWaitDecisionSchema>
  | z.infer<typeof flowExecutionExternalWaitDecisionSchema>
  | z.infer<typeof flowExecutionApprovalWaitDecisionSchema>
  | z.infer<typeof flowExecutionTerminalDecisionSchema>;

export type FlowNodeExecutor = {
  readonly kind: FlowExecutableNodeKindV2;
  readonly configSchemaVersion: number;
  readonly executorContractVersion: number;
  readonly evaluate: (
    node: FlowExecutableNodeV2,
    context: {
      readonly ownerUserId: string;
      readonly runId: string;
      readonly tokenId: string;
      readonly nodeActivationSequence: bigint;
      readonly effectiveRunSnapshot: unknown;
    }
  ) => Promise<FlowNodeExecutorDecision>;
};

export type FlowNodeExecutorRegistry = {
  readonly executorKeys: readonly FlowNodeExecutorKey[];
  readonly require: (input: {
    readonly kind: FlowExecutableNodeKindV2;
    readonly configSchemaVersion: number;
    readonly executorContractVersion: number;
  }) => FlowNodeExecutor;
};

export class FlowExecutionIntegrityError extends Error {
  override readonly name = "FlowExecutionIntegrityError";

  constructor(
    readonly code:
      | "FLOW_PINNED_GRAPH_INVALID"
      | "FLOW_PINNED_CAPABILITY_MANIFEST_INVALID"
      | "FLOW_TOKEN_NODE_NOT_FOUND"
      | "FLOW_TOKEN_NODE_METADATA_MISMATCH"
      | "FLOW_TOKEN_EXECUTOR_MANIFEST_MISMATCH"
      | "FLOW_TOKEN_RUNTIME_STATE_INVALID",
    message: string
  ) {
    super(message);
  }
}

export class FlowRuntimeTraceValidationError extends Error {
  override readonly name = "FlowRuntimeTraceValidationError";
  readonly code = "FLOW_RUNTIME_TRACE_INVALID";

  constructor() {
    super("FLOW_RUNTIME_TRACE_INVALID: flow runtime trace must match the redacted schema");
  }
}

export class FlowNodeExecutorUnavailableError extends Error {
  override readonly name = "FlowNodeExecutorUnavailableError";
  readonly code = "FLOW_NODE_EXECUTOR_UNAVAILABLE";

  constructor(readonly executorKey: FlowNodeExecutorKey) {
    super(`Flow node executor ${executorKey} is unavailable`);
  }
}

export class FlowNodeExecutionError extends Error {
  override readonly name = "FlowNodeExecutionError";

  constructor(readonly code: "FLOW_NODE_EXECUTION_RETRYABLE" | "FLOW_NODE_EXECUTION_REJECTED") {
    super(code);
  }
}

export function classifyFlowExecutionFailure(error: unknown): FlowExecutionFailure {
  if (error instanceof FlowExecutionIntegrityError) {
    return { classification: "permanent", reasonCode: error.code };
  }
  if (error instanceof FlowRuntimeTraceValidationError) {
    return { classification: "permanent", reasonCode: error.code };
  }
  if (error instanceof FlowNodeExecutorUnavailableError) {
    return { classification: "permanent", reasonCode: error.code };
  }
  if (error instanceof FlowNodeExecutionError) {
    return {
      classification: error.code === "FLOW_NODE_EXECUTION_RETRYABLE" ? "retryable" : "permanent",
      reasonCode: error.code
    };
  }
  return {
    classification: "retryable",
    reasonCode: "FLOW_NODE_EXECUTION_UNEXPECTED_FAILURE"
  };
}

export function formatFlowNodeExecutorKey(input: {
  readonly kind: FlowExecutableNodeKindV2;
  readonly configSchemaVersion: number;
  readonly executorContractVersion: number;
}): FlowNodeExecutorKey {
  return `${input.kind}:${input.configSchemaVersion}:${input.executorContractVersion}`;
}

export function createFlowNodeExecutorRegistry(
  executors: readonly FlowNodeExecutor[]
): FlowNodeExecutorRegistry {
  const executorsByKey = new Map<FlowNodeExecutorKey, FlowNodeExecutor>();

  for (const executor of executors) {
    const key = formatFlowNodeExecutorKey(executor);
    if (executorsByKey.has(key)) {
      throw new Error(`Duplicate flow node executor ${key}`);
    }
    executorsByKey.set(key, executor);
  }

  const executorKeys = [...executorsByKey.keys()].sort(compareBinary);

  return {
    executorKeys,
    require: (input) => {
      const key = formatFlowNodeExecutorKey(input);
      const executor = executorsByKey.get(key);
      if (!executor) throw new FlowNodeExecutorUnavailableError(key);
      return executor;
    }
  };
}

export function createBuiltInFlowNodeExecutorRegistry(input: {
  readonly birthDataReadinessReader?: FlowBirthDataReadinessReader;
  readonly natalChartRequester?: FlowNatalChartRequester;
  readonly natalChartAiDraftRequester?: FlowNatalChartAiDraftRequester;
  readonly messagingRequester?: FlowMessagingRequester;
} = {}): FlowNodeExecutorRegistry {
  return createFlowNodeExecutorRegistry([
    astrologerWorkItemNodeExecutor,
    astrologerApprovalNodeExecutor,
    completedNodeExecutor,
    suppressedNodeExecutor,
    failedNodeExecutor,
    ...(input.birthDataReadinessReader
      ? [createFlowBirthDataReadinessNodeExecutor(input.birthDataReadinessReader)]
      : []),
    ...(input.natalChartRequester
      ? [createFlowNatalChartRequestNodeExecutor(input.natalChartRequester)]
      : []),
    ...(input.natalChartAiDraftRequester
      ? [createFlowNatalChartAiDraftNodeExecutor(input.natalChartAiDraftRequester)]
      : []),
    ...(input.messagingRequester ? [createFlowSendMessageNodeExecutor(input.messagingRequester)] : [])
  ]);
}

export type FlowBirthDataReadinessReader = {
  readonly read: (input: {
    readonly ownerUserId: string;
    readonly bookingId: string;
    readonly clientUserId: string;
  }) => Promise<{ readonly ready: boolean }>;
};

export type FlowNatalChartRequester = {
  readonly request: (input: {
    readonly ownerUserId: string;
    readonly bookingId: string;
    readonly clientUserId: string;
    readonly interpretationMode: ChartInterpretationMode;
    readonly settings: ChartSettings;
  }) => Promise<{ readonly kind: "active_job"; readonly jobId: string } | {
    readonly kind: "existing_result";
    readonly calculationId: string;
    readonly jobId: string;
  }>;
};

export type FlowNatalChartAiDraftRequester = {
  readonly prepare: (input: {
    readonly ownerUserId: string;
    readonly runId: string;
    readonly tokenId: string;
    readonly nodeActivationSequence: bigint;
    readonly chartRequestNodeId: string;
    readonly locale: "ru" | "en";
  }) => Promise<{
    readonly calculationId: string;
    readonly interpretationId: string;
    readonly sourceChecksum: `sha256:${string}`;
    readonly contentChecksum: `sha256:${string}`;
    readonly outputText: string;
    readonly preview: string;
  }>;
};

/** Messaging owns recipient resolution, semantic idempotency and provider delivery. */
export type FlowMessagingRequester = {
  readonly prepare: (input: {
    readonly ownerUserId: string;
    readonly clientUserId: string;
    readonly runId: string;
    readonly tokenId: string;
    readonly nodeActivationSequence: bigint;
    readonly textTemplate: string;
  }) => Promise<
    | { readonly kind: "queued"; readonly messageId: string }
    | { readonly kind: "rejected" }
  >;
};

export function createFlowBirthDataReadinessNodeExecutor(
  reader: FlowBirthDataReadinessReader
): FlowNodeExecutor {
  return {
    kind: "birth_data_available",
    configSchemaVersion: 1,
    executorContractVersion: 1,
    evaluate: async (node, context) => {
      if (node.kind !== "birth_data_available") {
        throw new FlowExecutionIntegrityError(
          "FLOW_TOKEN_NODE_METADATA_MISMATCH",
          "Birth-data readiness executor received a different node kind"
        );
      }
      const snapshot = flowRunSnapshotV2Schema.safeParse(context.effectiveRunSnapshot);
      if (!snapshot.success || snapshot.data.subject.type !== "booking") {
        throw new FlowExecutionIntegrityError(
          "FLOW_TOKEN_RUNTIME_STATE_INVALID",
          "Birth-data readiness requires a pinned booking run snapshot"
        );
      }
      const readiness = await reader.read({
        ownerUserId: context.ownerUserId,
        bookingId: snapshot.data.subject.bookingId,
        clientUserId: snapshot.data.subject.clientUserId
      });
      return {
        kind: "advance",
        sourceNodeId: node.id,
        sourceHandle: readiness.ready ? "true" : "false"
      };
    }
  };
}

export function createFlowNatalChartRequestNodeExecutor(
  requester: FlowNatalChartRequester
): FlowNodeExecutor {
  return {
    kind: "natal_chart_request",
    configSchemaVersion: 1,
    executorContractVersion: 1,
    evaluate: async (node, context) => {
      if (node.kind !== "natal_chart_request") {
        throw new FlowExecutionIntegrityError(
          "FLOW_TOKEN_NODE_METADATA_MISMATCH",
          "Natal-chart executor received a different node kind"
        );
      }
      const snapshot = flowRunSnapshotV2Schema.safeParse(context.effectiveRunSnapshot);
      if (!snapshot.success || snapshot.data.subject.type !== "booking") {
        throw new FlowExecutionIntegrityError(
          "FLOW_TOKEN_RUNTIME_STATE_INVALID",
          "Natal-chart request requires a pinned booking run snapshot"
        );
      }
      const outcome = await requester.request({
        ownerUserId: context.ownerUserId,
        bookingId: snapshot.data.subject.bookingId,
        clientUserId: snapshot.data.subject.clientUserId,
        interpretationMode: node.config.interpretationMode,
        settings: node.config.settings
      });
      if (outcome.kind === "active_job") {
        return {
          kind: "wait_signal",
          sourceNodeId: node.id,
          resultCode: "FLOW_WAITING_SIGNAL",
          wait: {
            signalType: "chart.calculation.terminal.v1",
            correlationId: outcome.jobId,
            successHandle: "next"
          },
          trace: {
            schemaVersion: "flow-runtime-trace.v1",
            outcome: "waiting",
            nodeKind: "natal_chart_request",
            reasonCode: "FLOW_CHART_CALCULATION_REQUESTED",
            resultCode: "FLOW_WAITING_SIGNAL"
          }
        };
      }
      return {
        kind: "wait_signal",
        sourceNodeId: node.id,
        resultCode: "FLOW_WAITING_SIGNAL",
        wait: {
          signalType: "chart.calculation.terminal.v1",
          correlationId: outcome.jobId,
          successHandle: "next",
          replayExistingResult: true
        },
        trace: {
          schemaVersion: "flow-runtime-trace.v1",
          outcome: "waiting",
          nodeKind: "natal_chart_request",
          reasonCode: "FLOW_CHART_CALCULATION_REQUESTED",
          resultCode: "FLOW_WAITING_SIGNAL"
        }
      };
    }
  };
}

export function createFlowNatalChartAiDraftNodeExecutor(
  requester: FlowNatalChartAiDraftRequester
): FlowNodeExecutor {
  return {
    kind: "natal_chart_ai_draft",
    configSchemaVersion: 1,
    executorContractVersion: 1,
    evaluate: async (node, context) => {
      if (node.kind !== "natal_chart_ai_draft") {
        throw new FlowExecutionIntegrityError(
          "FLOW_TOKEN_NODE_METADATA_MISMATCH",
          "Natal chart AI-draft executor received a different node kind"
        );
      }
      const snapshot = flowRunSnapshotV2Schema.safeParse(context.effectiveRunSnapshot);
      if (!snapshot.success || snapshot.data.subject.type !== "booking") {
        throw new FlowExecutionIntegrityError(
          "FLOW_TOKEN_RUNTIME_STATE_INVALID",
          "Natal chart AI draft requires a pinned booking run snapshot"
        );
      }
      const artifact = await requester.prepare({
        ownerUserId: context.ownerUserId,
        runId: context.runId,
        tokenId: context.tokenId,
        nodeActivationSequence: context.nodeActivationSequence,
        chartRequestNodeId: node.config.chartRequestNodeId,
        locale: node.config.locale
      });
      return {
        kind: "wait_approval",
        sourceNodeId: node.id,
        resultCode: "FLOW_WAITING_APPROVAL",
        approval: {
          kind: "ai_output",
          title: node.config.approvalTitle,
          preview: artifact.preview,
          artifact: {
            calculationId: artifact.calculationId,
            interpretationId: artifact.interpretationId,
            sourceChecksum: artifact.sourceChecksum,
            contentChecksum: artifact.contentChecksum,
            outputText: artifact.outputText
          },
          expiresAfterMinutes: node.config.expiresAfterMinutes ?? null
        },
        trace: {
          schemaVersion: "flow-runtime-trace.v1",
          outcome: "waiting",
          nodeKind: "natal_chart_ai_draft",
          reasonCode: "FLOW_APPROVAL_CREATED",
          resultCode: "FLOW_WAITING_APPROVAL"
        }
      };
    }
  };
}

export function createFlowSendMessageNodeExecutor(requester: FlowMessagingRequester): FlowNodeExecutor {
  return {
    kind: "send_message",
    configSchemaVersion: 1,
    executorContractVersion: 1,
    evaluate: async (node, context) => {
      if (node.kind !== "send_message") {
        throw new FlowExecutionIntegrityError(
          "FLOW_TOKEN_NODE_METADATA_MISMATCH",
          "Messaging executor received a different node kind"
        );
      }
      const snapshot = flowRunSnapshotV2Schema.safeParse(context.effectiveRunSnapshot);
      if (!snapshot.success) {
        throw new FlowExecutionIntegrityError(
          "FLOW_TOKEN_RUNTIME_STATE_INVALID",
          "Messaging delivery requires a pinned client subject"
        );
      }
      const clientUserId = snapshot.data.subject.clientUserId;
      const message = await requester.prepare({
        ownerUserId: context.ownerUserId,
        clientUserId,
        runId: context.runId,
        tokenId: context.tokenId,
        nodeActivationSequence: context.nodeActivationSequence,
        textTemplate: node.config.textTemplate
      });
      if (message.kind === "rejected") {
        return { kind: "advance", sourceNodeId: node.id, sourceHandle: "error" };
      }
      return {
        kind: "wait_external",
        sourceNodeId: node.id,
        resultCode: "FLOW_WAITING_EXTERNAL",
        wait: {
          signalType: "messaging.message.delivery.terminal.v1",
          correlationId: message.messageId,
          successHandle: "success",
          failureHandle: "error"
        },
        trace: {
          schemaVersion: "flow-runtime-trace.v1",
          outcome: "waiting",
          nodeKind: "send_message",
          reasonCode: "FLOW_MESSAGING_DELIVERY_REQUESTED",
          resultCode: "FLOW_WAITING_EXTERNAL"
        }
      };
    }
  };
}

export async function interpretFlowExecutionClaim(input: {
  readonly claim: FlowExecutionClaim;
  readonly registry: FlowNodeExecutorRegistry;
}): Promise<FlowExecutionDecision> {
  const node = resolvePinnedFlowExecutionNode(input.claim);

  const executor = input.registry.require(node);
  const executorDecision = await executor.evaluate(node, {
    ownerUserId: input.claim.ownerUserId,
    runId: input.claim.runId,
    tokenId: input.claim.tokenId,
    nodeActivationSequence: input.claim.nodeActivationSequence,
    effectiveRunSnapshot: input.claim.effectiveRunSnapshot
  });
  if (executorDecision.kind !== "advance") {
    return validateFlowExecutionDecision(
      node,
      executorDecision,
      input.claim.effectiveRunSnapshot
    );
  }

  const selection = parseFlowExecutionAdvanceSelection(node, executorDecision);
  const target = resolvePinnedFlowExecutionAdvanceTarget({
    definition: input.claim,
    sourceHandle: selection.sourceHandle
  });
  return validateFlowExecutionDecision(
    node,
    {
      ...selection,
      selectedEdgeId: target.edgeId,
      targetNodeId: target.node.id,
      targetNodeKind: target.node.kind,
      resultCode: "FLOW_TOKEN_ADVANCED",
      trace: {
        schemaVersion: "flow-runtime-trace.v1",
        outcome: "advanced",
        nodeKind: node.kind,
        reasonCode: "FLOW_EDGE_SELECTED",
        resultCode: "FLOW_TOKEN_ADVANCED",
        sourceHandle: selection.sourceHandle,
        selectedEdgeId: target.edgeId,
        targetNodeId: target.node.id,
        targetNodeKind: target.node.kind
      }
    },
    input.claim.effectiveRunSnapshot
  );
}

export function resolvePinnedFlowExecutionNode(
  claim: PinnedFlowExecutionDefinition
): FlowExecutableNodeV2 {
  const graph = parsePinnedGraph(claim.graph);
  const manifest = parsePinnedCapabilityManifest(claim.capabilityManifest);
  const snapshotIntegrity = verifyFlowCapabilityManifestForGraph({
    graph,
    capabilityManifest: manifest
  });
  if (!snapshotIntegrity.valid) {
    throw new FlowExecutionIntegrityError(
      snapshotIntegrity.reason === "graph_not_publishable"
        ? "FLOW_PINNED_GRAPH_INVALID"
        : "FLOW_PINNED_CAPABILITY_MANIFEST_INVALID",
      "Pinned flow graph and capability manifest do not form an executable publication snapshot"
    );
  }
  const node = graph.nodes.find((candidate) => candidate.id === claim.nodeId);

  if (!node) {
    throw new FlowExecutionIntegrityError(
      "FLOW_TOKEN_NODE_NOT_FOUND",
      `Token node ${claim.nodeId} is missing from pinned flow version ${claim.flowVersionId}`
    );
  }

  if (
    node.kind !== claim.nodeKind ||
    node.configSchemaVersion !== claim.configSchemaVersion ||
    node.executorContractVersion !== claim.executorContractVersion
  ) {
    throw new FlowExecutionIntegrityError(
      "FLOW_TOKEN_NODE_METADATA_MISMATCH",
      `Token node metadata does not match pinned flow version ${claim.flowVersionId}`
    );
  }

  if (!isFlowExecutableNode(node)) {
    throw new FlowExecutionIntegrityError(
      "FLOW_TOKEN_NODE_METADATA_MISMATCH",
      `Token references a non-executable node in pinned flow version ${claim.flowVersionId}`
    );
  }

  assertExecutorManifest(claim, manifest);
  return node;
}

export function parseFlowRuntimeTraceSummary(value: unknown): FlowRuntimeTraceSummary {
  const result = flowRuntimeTraceSummarySchema.safeParse(value);
  if (!result.success) throw new FlowRuntimeTraceValidationError();
  return result.data;
}

export function parseFlowExecutionDecision(value: unknown): FlowExecutionDecision {
  const result = flowExecutionDecisionSchema.safeParse(value);
  if (!result.success) throw new FlowRuntimeTraceValidationError();
  const decision = result.data;
  if (
    decision.trace.resultCode !== decision.resultCode ||
    (decision.kind === "advance" &&
      (decision.trace.sourceHandle !== decision.sourceHandle ||
        decision.trace.selectedEdgeId !== decision.selectedEdgeId ||
        decision.trace.targetNodeId !== decision.targetNodeId ||
        decision.trace.targetNodeKind !== decision.targetNodeKind))
  ) {
    throw new FlowRuntimeTraceValidationError();
  }
  return decision;
}

export function resolvePinnedFlowExecutionAdvanceTarget(input: {
  readonly definition: PinnedFlowExecutionDefinition;
  readonly sourceHandle: FlowSourceHandleV2;
}): { readonly edgeId: string; readonly node: FlowExecutableNodeV2 } {
  const graph = parsePinnedGraph(input.definition.graph);
  const manifest = parsePinnedCapabilityManifest(input.definition.capabilityManifest);
  resolvePinnedFlowExecutionNode(input.definition);

  const matchingEdges = graph.edges.filter(
    (edge) =>
      edge.sourceNodeId === input.definition.nodeId && edge.sourceHandle === input.sourceHandle
  );
  if (matchingEdges.length !== 1) {
    throw new FlowExecutionIntegrityError(
      "FLOW_PINNED_GRAPH_INVALID",
      `Pinned flow version ${input.definition.flowVersionId} must have exactly one ${input.sourceHandle} edge from ${input.definition.nodeId}`
    );
  }

  const edge = matchingEdges[0];
  if (!edge) {
    throw new FlowExecutionIntegrityError(
      "FLOW_PINNED_GRAPH_INVALID",
      `Pinned flow version ${input.definition.flowVersionId} is missing its selected edge`
    );
  }
  const targetNode = graph.nodes.find((candidate) => candidate.id === edge.targetNodeId);
  if (!targetNode) {
    throw new FlowExecutionIntegrityError(
      "FLOW_PINNED_GRAPH_INVALID",
      `Pinned flow edge ${edge.id} references a missing target node`
    );
  }
  if (!isFlowExecutableNode(targetNode)) {
    throw new FlowExecutionIntegrityError(
      "FLOW_PINNED_GRAPH_INVALID",
      `Pinned flow edge ${edge.id} targets a non-executable enrollment node`
    );
  }
  assertExecutorManifest(
    {
      flowVersionId: input.definition.flowVersionId,
      nodeKind: targetNode.kind,
      configSchemaVersion: targetNode.configSchemaVersion,
      executorContractVersion: targetNode.executorContractVersion
    },
    manifest
  );
  return { edgeId: edge.id, node: targetNode };
}

function parseFlowExecutionAdvanceSelection(
  node: FlowExecutableNodeV2,
  value: unknown
): z.infer<typeof flowExecutionAdvanceSelectionSchema> {
  const result = flowExecutionAdvanceSelectionSchema.safeParse(value);
  if (!result.success || result.data.sourceNodeId !== node.id) {
    throw new FlowRuntimeTraceValidationError();
  }
  return result.data;
}

function validateFlowExecutionDecision(
  node: FlowExecutableNodeV2,
  value: unknown,
  runSnapshot: unknown
): FlowExecutionDecision {
  const decision = parseFlowExecutionDecision(value);
  if (decision.sourceNodeId !== node.id || decision.trace.nodeKind !== node.kind) {
    throw new FlowRuntimeTraceValidationError();
  }
  if (
    decision.kind === "terminal" &&
    !(
      (node.kind === "completed" && decision.resultCode === node.config.goalKey) ||
      (node.kind === "suppressed" && decision.resultCode === node.config.reasonCode) ||
      (node.kind === "failed" && decision.resultCode === node.config.errorCode)
    )
  ) {
    throw new FlowRuntimeTraceValidationError();
  }
  if (
    decision.kind === "wait_work_item" &&
    (node.kind !== "astrologer_work_item" ||
      !workItemDecisionMatchesNode(decision.workItem, node, runSnapshot))
  ) {
    throw new FlowRuntimeTraceValidationError();
  }
  if (
    decision.kind === "wait_signal" &&
    (node.kind !== "natal_chart_request" ||
      decision.wait.signalType !== "chart.calculation.terminal.v1" ||
      decision.wait.successHandle !== "next")
  ) {
    throw new FlowRuntimeTraceValidationError();
  }
  if (
    decision.kind === "wait_external" &&
    (node.kind !== "send_message" ||
      decision.wait.signalType !== "messaging.message.delivery.terminal.v1" ||
      decision.wait.successHandle !== "success" ||
      decision.wait.failureHandle !== "error")
  ) {
    throw new FlowRuntimeTraceValidationError();
  }
  if (
    decision.kind === "wait_approval" &&
    !(
      (node.kind === "astrologer_approval" &&
        decision.approval.kind === node.config.approvalKind &&
        decision.approval.title === node.config.approvalTitle &&
        decision.approval.preview === node.displayTitle &&
        decision.approval.artifact === null &&
        decision.approval.expiresAfterMinutes === (node.config.expiresAfterMinutes ?? null)) ||
      (node.kind === "natal_chart_ai_draft" &&
        decision.approval.kind === "ai_output" &&
        decision.approval.title === node.config.approvalTitle &&
        decision.approval.artifact !== null &&
        decision.approval.expiresAfterMinutes === (node.config.expiresAfterMinutes ?? null))
    )
  ) {
    throw new FlowRuntimeTraceValidationError();
  }
  return decision;
}

const astrologerWorkItemNodeExecutor: FlowNodeExecutor = {
  kind: "astrologer_work_item",
  configSchemaVersion: 1,
  executorContractVersion: 1,
  evaluate: async (node, context) => {
    if (node.kind !== "astrologer_work_item") {
      throw new FlowExecutionIntegrityError(
        "FLOW_TOKEN_NODE_METADATA_MISMATCH",
        "Astrologer work-item executor received a different node kind"
      );
    }

    const policy = resolveFlowWorkItemNodePolicy(node);
    return {
      kind: "wait_work_item",
      sourceNodeId: node.id,
      completionHandle: "success",
      resultCode: "FLOW_WAITING_WORK_ITEM",
      workItem: {
        taskKind: node.config.taskKind,
        title: node.config.taskTitle,
        instructions: node.config.instructions ?? null,
        priority: node.config.priority,
        ...policy,
        dueAt: resolveFlowWorkItemDueAt(policy.duePolicy, context.effectiveRunSnapshot)
      },
      trace: {
        schemaVersion: "flow-runtime-trace.v1",
        outcome: "waiting",
        nodeKind: node.kind,
        reasonCode: "FLOW_WORK_ITEM_CREATED",
        resultCode: "FLOW_WAITING_WORK_ITEM"
      }
    };
  }
};

const astrologerApprovalNodeExecutor: FlowNodeExecutor = {
  kind: "astrologer_approval",
  configSchemaVersion: 1,
  executorContractVersion: 1,
  evaluate: async (node) => {
    if (node.kind !== "astrologer_approval") {
      throw new FlowExecutionIntegrityError(
        "FLOW_TOKEN_NODE_METADATA_MISMATCH",
        "Astrologer approval executor received a different node kind"
      );
    }

    return {
      kind: "wait_approval",
      sourceNodeId: node.id,
      resultCode: "FLOW_WAITING_APPROVAL",
      approval: {
        kind: node.config.approvalKind,
        title: node.config.approvalTitle,
        preview: node.displayTitle,
        artifact: null,
        expiresAfterMinutes: node.config.expiresAfterMinutes ?? null
      },
      trace: {
        schemaVersion: "flow-runtime-trace.v1",
        outcome: "waiting",
        nodeKind: "astrologer_approval",
        reasonCode: "FLOW_APPROVAL_CREATED",
        resultCode: "FLOW_WAITING_APPROVAL"
      }
    };
  }
};

export function resolveFlowWorkItemNodePolicy(
  node: Extract<FlowExecutableNodeV2, { readonly kind: "astrologer_work_item" }>
): {
  readonly duePolicy: FlowWorkItemDuePolicyV2;
  readonly completionRequirements: FlowWorkItemCompletionRequirementsV2;
} {
  return {
    duePolicy: node.config.duePolicy ?? { kind: "none" },
    completionRequirements: node.config.completionRequirements ?? { resultSummary: "optional" }
  };
}

export function resolveFlowWorkItemDueAt(
  duePolicy: FlowWorkItemDuePolicyV2,
  runSnapshot: unknown
): string | null {
  if (duePolicy.kind === "none") return null;
  const snapshot = flowRunSnapshotV2Schema.safeParse(runSnapshot);
  if (!snapshot.success || snapshot.data.subject.type !== "booking") {
    throw new FlowExecutionIntegrityError(
      "FLOW_TOKEN_RUNTIME_STATE_INVALID",
      "A booking-relative work-item deadline requires a pinned booking snapshot"
    );
  }
  return new Date(
    Date.parse(snapshot.data.subject.startAt) - duePolicy.leadTimeMinutes * 60_000
  ).toISOString();
}

function workItemDecisionMatchesNode(
  workItem: Extract<FlowExecutionDecision, { readonly kind: "wait_work_item" }>["workItem"],
  node: Extract<FlowExecutableNodeV2, { readonly kind: "astrologer_work_item" }>,
  runSnapshot: unknown
): boolean {
  const policy = resolveFlowWorkItemNodePolicy(node);
  return (
    workItem.taskKind === node.config.taskKind &&
    workItem.title === node.config.taskTitle &&
    workItem.instructions === (node.config.instructions ?? null) &&
    workItem.priority === node.config.priority &&
    workItem.completionRequirements.resultSummary === policy.completionRequirements.resultSummary &&
    workItem.dueAt === resolveFlowWorkItemDueAt(policy.duePolicy, runSnapshot) &&
    workItem.duePolicy.kind === policy.duePolicy.kind &&
    (workItem.duePolicy.kind === "none" ||
      (policy.duePolicy.kind === "before_booking_start" &&
        workItem.duePolicy.leadTimeMinutes === policy.duePolicy.leadTimeMinutes))
  );
}

const completedNodeExecutor: FlowNodeExecutor = {
  kind: "completed",
  configSchemaVersion: 1,
  executorContractVersion: 1,
  evaluate: async (node) => {
    if (node.kind !== "completed") {
      throw new FlowExecutionIntegrityError(
        "FLOW_TOKEN_NODE_METADATA_MISMATCH",
        "Completed executor received a different node kind"
      );
    }

    return {
      kind: "terminal",
      sourceNodeId: node.id,
      terminalStatus: "completed",
      resultCode: node.config.goalKey,
      trace: {
        schemaVersion: "flow-runtime-trace.v1",
        outcome: "terminal",
        nodeKind: node.kind,
        reasonCode: "FLOW_GOAL_REACHED",
        resultCode: node.config.goalKey
      }
    };
  }
};

const suppressedNodeExecutor: FlowNodeExecutor = {
  kind: "suppressed",
  configSchemaVersion: 1,
  executorContractVersion: 1,
  evaluate: async (node) => {
    if (node.kind !== "suppressed") {
      throw new FlowExecutionIntegrityError(
        "FLOW_TOKEN_NODE_METADATA_MISMATCH",
        "Suppressed executor received a different node kind"
      );
    }

    return terminalFlowDecision(node, node.config.reasonCode);
  }
};

const failedNodeExecutor: FlowNodeExecutor = {
  kind: "failed",
  configSchemaVersion: 1,
  executorContractVersion: 1,
  evaluate: async (node) => {
    if (node.kind !== "failed") {
      throw new FlowExecutionIntegrityError(
        "FLOW_TOKEN_NODE_METADATA_MISMATCH",
        "Failed executor received a different node kind"
      );
    }

    return terminalFlowDecision(node, node.config.errorCode);
  }
};

function terminalFlowDecision(
  node: Extract<FlowExecutableNodeV2, { readonly kind: "suppressed" | "failed" }>,
  resultCode: string
): FlowNodeExecutorDecision {
  return {
    kind: "terminal",
    sourceNodeId: node.id,
    terminalStatus: "completed",
    resultCode,
    trace: {
      schemaVersion: "flow-runtime-trace.v1",
      outcome: "terminal",
      nodeKind: node.kind,
      reasonCode: "FLOW_GOAL_REACHED",
      resultCode
    }
  };
}

function parsePinnedGraph(value: unknown): FlowGraphV2 {
  const result = flowGraphV2Schema.safeParse(value);
  if (!result.success) {
    throw new FlowExecutionIntegrityError(
      "FLOW_PINNED_GRAPH_INVALID",
      "Pinned flow version graph is not a valid flow-graph.v2 document"
    );
  }
  return result.data;
}

function parsePinnedCapabilityManifest(value: unknown): FlowCapabilityManifest {
  const result = flowCapabilityManifestSchema.safeParse(value);
  if (!result.success) {
    throw new FlowExecutionIntegrityError(
      "FLOW_PINNED_CAPABILITY_MANIFEST_INVALID",
      "Pinned flow version capability manifest is invalid or uses unsupported interpreter semantics"
    );
  }
  return result.data;
}

function assertExecutorManifest(
  claim: Pick<
    PinnedFlowExecutionDefinition,
    "flowVersionId" | "nodeKind" | "configSchemaVersion" | "executorContractVersion"
  >,
  manifest: FlowCapabilityManifest
): void {
  const authorized = manifest.nodeExecutors.some(
    (executor) =>
      executor.kind === claim.nodeKind &&
      executor.configSchemaVersion === claim.configSchemaVersion &&
      executor.executorContractVersion === claim.executorContractVersion
  );
  if (!authorized) {
    throw new FlowExecutionIntegrityError(
      "FLOW_TOKEN_EXECUTOR_MANIFEST_MISMATCH",
      `Token executor ${formatFlowNodeExecutorKey({
        kind: claim.nodeKind,
        configSchemaVersion: claim.configSchemaVersion,
        executorContractVersion: claim.executorContractVersion
      })} is not pinned by flow version ${claim.flowVersionId}`
    );
  }
}

function isFlowExecutableNode(node: FlowNodeV2): node is FlowExecutableNodeV2 {
  return flowExecutableNodeKindV2Schema.safeParse(node.kind).success;
}

function compareBinary(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
