import { z } from "@elevenhouse/validation";

import {
  flowWorkItemCompletionRequirementsV2Schema,
  flowWorkItemInstructionsV2Schema,
  flowWorkItemPriorityV2Schema,
  flowAstrologerWorkItemTaskKindV2Values
} from "./flows-v2";
import { bookingLifecycleStateSchema } from "./calendar";

const uuidSchema = z.string().uuid();
const instantSchema = z.string().datetime({ offset: true });
const positiveRevisionSchema = z.number().int().positive();
const nonNegativeRevisionSchema = z.number().int().min(0);
const stableNodeIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(/^[a-z0-9][a-z0-9_-]*$/);

export const flowWorkItemStatusValues = [
  "pending",
  "in_progress",
  "snoozed",
  "completed",
  "expired",
  "canceled"
] as const;
export const flowWorkItemStatusSchema = z.enum(flowWorkItemStatusValues);
export type FlowWorkItemStatus = z.infer<typeof flowWorkItemStatusSchema>;

export const flowWorkItemListStatusValues = ["active", ...flowWorkItemStatusValues] as const;
export const flowWorkItemListStatusSchema = z.enum(flowWorkItemListStatusValues);
export type FlowWorkItemListStatus = z.infer<typeof flowWorkItemListStatusSchema>;

export const flowWorkItemTaskKindValues = flowAstrologerWorkItemTaskKindV2Values;
export const flowWorkItemTaskKindSchema = z.enum(flowWorkItemTaskKindValues);
export type FlowWorkItemTaskKind = z.infer<typeof flowWorkItemTaskKindSchema>;

export const flowWorkItemSchema = z
  .object({
    id: uuidSchema,
    flowRunId: uuidSchema,
    flowVersionId: uuidSchema,
    nodeId: stableNodeIdSchema,
    status: flowWorkItemStatusSchema,
    taskKind: flowWorkItemTaskKindSchema,
    title: z.string().trim().min(1).max(180),
    instructions: flowWorkItemInstructionsV2Schema.nullable(),
    assigneeUserId: uuidSchema,
    priority: flowWorkItemPriorityV2Schema,
    dueAt: instantSchema.nullable(),
    availableAt: instantSchema,
    snoozedUntil: instantSchema.nullable(),
    revision: positiveRevisionSchema,
    resultSummary: z.string().trim().min(1).max(1_000).nullable(),
    createdAt: instantSchema,
    updatedAt: instantSchema,
    startedAt: instantSchema.nullable(),
    completedAt: instantSchema.nullable(),
    completedByUserId: uuidSchema.nullable(),
    expiredAt: instantSchema.nullable(),
    canceledAt: instantSchema.nullable()
  })
  .strict()
  .superRefine((item, context) => {
    const rejectPresent = (fields: readonly (keyof typeof item)[], message: string): void => {
      for (const field of fields) {
        if (item[field] !== null) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: [field],
            message
          });
        }
      }
    };
    const requirePresent = (fields: readonly (keyof typeof item)[], message: string): void => {
      for (const field of fields) {
        if (item[field] === null) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: [field],
            message
          });
        }
      }
    };

    if (item.status === "pending") {
      rejectPresent(
        ["snoozedUntil", "completedAt", "completedByUserId", "expiredAt", "canceledAt"],
        "Pending work items cannot expose snooze or terminal evidence"
      );
    }
    if (item.status === "in_progress") {
      requirePresent(["startedAt"], "In-progress work items require start evidence");
      rejectPresent(
        ["snoozedUntil", "completedAt", "completedByUserId", "expiredAt", "canceledAt"],
        "In-progress work items cannot expose snooze or terminal evidence"
      );
    }
    if (item.status === "snoozed") {
      requirePresent(["snoozedUntil"], "Snoozed work items require a resume instant");
      rejectPresent(
        ["completedAt", "completedByUserId", "expiredAt", "canceledAt"],
        "Snoozed work items cannot expose terminal evidence"
      );
    }
    if (item.status === "completed") {
      requirePresent(["startedAt", "completedAt"], "Completed work items require start and completion evidence");
      rejectPresent(
        ["snoozedUntil", "expiredAt", "canceledAt"],
        "Completed work items cannot expose another lifecycle outcome"
      );
    }
    if (item.status === "expired") {
      requirePresent(["expiredAt"], "Expired work items require expiry evidence");
      rejectPresent(
        ["snoozedUntil", "completedAt", "completedByUserId", "canceledAt"],
        "Expired work items cannot expose another lifecycle outcome"
      );
    }
    if (item.status === "canceled") {
      requirePresent(["canceledAt"], "Canceled work items require cancellation evidence");
      rejectPresent(
        ["snoozedUntil", "completedAt", "completedByUserId", "expiredAt"],
        "Canceled work items cannot expose another lifecycle outcome"
      );
    }

    if (Date.parse(item.updatedAt) < Date.parse(item.createdAt)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["updatedAt"],
        message: "Work-item update time cannot precede creation"
      });
    }
    if (item.startedAt !== null && Date.parse(item.startedAt) < Date.parse(item.createdAt)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["startedAt"],
        message: "Work-item start time cannot precede creation"
      });
    }
    if (
      item.completedAt !== null &&
      item.startedAt !== null &&
      Date.parse(item.completedAt) < Date.parse(item.startedAt)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["completedAt"],
        message: "Work-item completion time cannot precede its start"
      });
    }
  });
export type FlowWorkItem = z.infer<typeof flowWorkItemSchema>;

export const flowWorkItemBookingContextSchema = z
  .object({
    status: z.literal("available"),
    subjectType: z.literal("booking"),
    completionRequirements: flowWorkItemCompletionRequirementsV2Schema,
    flow: z
      .object({
        id: uuidSchema,
        currentName: z.string().trim().min(1).max(180)
      })
      .strict(),
    booking: z
      .object({
        id: uuidSchema,
        lifecycleRevision: positiveRevisionSchema,
        state: bookingLifecycleStateSchema,
        currentStartAt: instantSchema,
        currentEndAt: instantSchema,
        timeZoneSnapshot: z.string().trim().min(1).max(100)
      })
      .strict(),
    client: z
      .object({
        userId: uuidSchema,
        currentDisplayName: z.string().trim().min(1).max(200).nullable()
      })
      .strict(),
    product: z
      .object({
        id: uuidSchema,
        titleSnapshot: z.string().trim().min(1).max(200)
      })
      .strict()
  })
  .strict();
export type FlowWorkItemBookingContext = z.infer<typeof flowWorkItemBookingContextSchema>;

const bookingContextPendingShape = {
  code: z.literal("FLOW_WORK_ITEM_BOOKING_CONTEXT_PENDING"),
  bookingId: uuidSchema,
  appliedRevision: nonNegativeRevisionSchema,
  aggregateRevision: positiveRevisionSchema
} as const;

export const flowWorkItemBookingContextPendingSchema = z
  .object({ status: z.literal("context_pending"), ...bookingContextPendingShape })
  .strict()
  .refine((context) => context.aggregateRevision > context.appliedRevision, {
    path: ["aggregateRevision"],
    message: "Pending Booking context requires an aggregate revision ahead of Flow projection"
  });
export type FlowWorkItemBookingContextPending = z.infer<
  typeof flowWorkItemBookingContextPendingSchema
>;

export const flowWorkItemContextIntegrityErrorSchema = z
  .object({
    status: z.literal("integrity_error"),
    code: z.literal("FLOW_WORK_ITEM_CONTEXT_INTEGRITY_ERROR")
  })
  .strict();
export type FlowWorkItemContextIntegrityError = z.infer<
  typeof flowWorkItemContextIntegrityErrorSchema
>;

export const flowWorkItemQueueEntrySchema = z
  .object({
    workItem: flowWorkItemSchema,
    context: z.discriminatedUnion("status", [
      flowWorkItemBookingContextSchema,
      flowWorkItemBookingContextPendingSchema,
      flowWorkItemContextIntegrityErrorSchema
    ])
  })
  .strict();
export type FlowWorkItemQueueEntry = z.infer<typeof flowWorkItemQueueEntrySchema>;

export const listFlowWorkItemsQuerySchema = z
  .object({
    status: flowWorkItemListStatusSchema.optional().default("active"),
    limit: z.coerce.number().int().min(1).max(100).optional().default(50),
    offset: z.coerce.number().int().min(0).max(10_000).optional().default(0)
  })
  .strict();
export type ListFlowWorkItemsQueryInput = z.input<typeof listFlowWorkItemsQuerySchema>;
export type ListFlowWorkItemsQuery = z.infer<typeof listFlowWorkItemsQuerySchema>;

export const listFlowWorkItemsResponseSchema = z
  .object({
    items: z.array(flowWorkItemQueueEntrySchema).max(100),
    total: z.number().int().min(0),
    asOf: instantSchema
  })
  .strict();
export type ListFlowWorkItemsResponse = z.infer<typeof listFlowWorkItemsResponseSchema>;

export const startFlowWorkItemRequestSchema = z
  .object({
    expectedRevision: positiveRevisionSchema,
    expectedBookingLifecycleRevision: positiveRevisionSchema.optional()
  })
  .strict();
export type StartFlowWorkItemRequest = z.infer<typeof startFlowWorkItemRequestSchema>;

export const snoozeFlowWorkItemRequestSchema = z
  .object({
    expectedRevision: positiveRevisionSchema,
    expectedBookingLifecycleRevision: positiveRevisionSchema.optional(),
    snoozedUntil: instantSchema
  })
  .strict();
export type SnoozeFlowWorkItemRequest = z.infer<typeof snoozeFlowWorkItemRequestSchema>;

export const completeFlowWorkItemRequestSchema = z
  .object({
    expectedRevision: positiveRevisionSchema,
    expectedBookingLifecycleRevision: positiveRevisionSchema.optional(),
    resultSummary: z.string().trim().min(1).max(1_000).optional()
  })
  .strict();
export type CompleteFlowWorkItemRequest = z.infer<typeof completeFlowWorkItemRequestSchema>;

export const flowWorkItemMutationResponseSchema = z
  .object({ workItem: flowWorkItemSchema })
  .strict();
export type FlowWorkItemMutationResponse = z.infer<typeof flowWorkItemMutationResponseSchema>;

const flowWorkItemNotFoundRejectionSchema = z
  .object({ code: z.literal("FLOW_WORK_ITEM_NOT_FOUND") })
  .strict();
const flowWorkItemRevisionConflictRejectionSchema = z
  .object({
    code: z.literal("FLOW_WORK_ITEM_REVISION_CONFLICT"),
    currentRevision: positiveRevisionSchema
  })
  .strict();
const flowWorkItemTransitionNotAllowedRejectionSchema = z
  .object({
    code: z.literal("FLOW_WORK_ITEM_TRANSITION_NOT_ALLOWED"),
    status: z.string().trim().min(1).max(80)
  })
  .strict();
const flowWorkItemSnoozeNotFutureRejectionSchema = z
  .object({ code: z.literal("FLOW_WORK_ITEM_SNOOZE_NOT_FUTURE") })
  .strict();
const flowWorkItemResultSummaryRequiredRejectionSchema = z
  .object({ code: z.literal("FLOW_WORK_ITEM_RESULT_SUMMARY_REQUIRED") })
  .strict();
const flowWorkItemRuntimeUnavailableRejectionSchema = z
  .object({ code: z.literal("FLOW_RUNTIME_EXECUTION_UNAVAILABLE") })
  .strict();
const flowWorkItemBookingContextPendingRejectionSchema = z
  .object(bookingContextPendingShape)
  .strict()
  .refine((context) => context.aggregateRevision > context.appliedRevision, {
    path: ["aggregateRevision"],
    message: "Pending Booking context requires an aggregate revision ahead of Flow projection"
  });
const flowWorkItemBookingContextChangedRejectionSchema = z
  .object({
    code: z.literal("FLOW_WORK_ITEM_BOOKING_CONTEXT_CHANGED"),
    currentBookingLifecycleRevision: positiveRevisionSchema
  })
  .strict();

export const flowWorkItemCommandRejectionSchema = z.union([
  flowWorkItemNotFoundRejectionSchema,
  flowWorkItemRevisionConflictRejectionSchema,
  flowWorkItemTransitionNotAllowedRejectionSchema,
  flowWorkItemSnoozeNotFutureRejectionSchema,
  flowWorkItemResultSummaryRequiredRejectionSchema,
  flowWorkItemBookingContextPendingRejectionSchema,
  flowWorkItemBookingContextChangedRejectionSchema,
  flowWorkItemRuntimeUnavailableRejectionSchema
]);
export type FlowWorkItemCommandRejection = z.infer<typeof flowWorkItemCommandRejectionSchema>;

export const flowWorkItemCommandRejectionResponseSchema = z.union([
  z.object({ statusCode: z.literal(404), body: flowWorkItemNotFoundRejectionSchema }).strict(),
  z
    .object({
      statusCode: z.literal(409),
      body: z.union([
        flowWorkItemRevisionConflictRejectionSchema,
        flowWorkItemTransitionNotAllowedRejectionSchema,
        flowWorkItemSnoozeNotFutureRejectionSchema,
        flowWorkItemResultSummaryRequiredRejectionSchema,
        flowWorkItemBookingContextPendingRejectionSchema,
        flowWorkItemBookingContextChangedRejectionSchema,
        flowWorkItemRuntimeUnavailableRejectionSchema
      ])
    })
    .strict()
]);
export type FlowWorkItemCommandRejectionResponse = z.infer<
  typeof flowWorkItemCommandRejectionResponseSchema
>;
