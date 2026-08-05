import { z } from "@elevenhouse/validation";

const uuidSchema = z.string().uuid();
const stableIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(/^[a-z0-9][a-z0-9_-]*$/);
const titleSchema = z.string().trim().min(1).max(180);
const descriptionSchema = z.string().trim().min(1).max(1_000);
const instantSchema = z.string().datetime({ offset: true });
const recordSchema = z.record(z.string(), z.unknown());

export const flowApprovalModeValues = [
  "draft_only",
  "manual_approve",
  "auto_internal",
  "auto_send"
] as const;
export const flowApprovalModeSchema = z.enum(flowApprovalModeValues);
export type FlowApprovalMode = z.infer<typeof flowApprovalModeSchema>;

export const flowStatusValues = ["draft", "published", "active", "paused", "archived"] as const;
export const flowStatusSchema = z.enum(flowStatusValues);
export type FlowStatus = z.infer<typeof flowStatusSchema>;

export const flowRunStatusValues = [
  "pending",
  "running",
  "waiting",
  "approval_required",
  "completed",
  "skipped",
  "failed_retryable",
  "failed_terminal",
  "suppressed",
  "expired",
  "canceled"
] as const;
export const flowRunStatusSchema = z.enum(flowRunStatusValues);
export type FlowRunStatus = z.infer<typeof flowRunStatusSchema>;

export const flowStepRunStatusValues = [
  "pending",
  "running",
  "waiting",
  "approval_required",
  "completed",
  "skipped",
  "failed_retryable",
  "failed_terminal",
  "suppressed",
  "expired",
  "canceled"
] as const;
export const flowStepRunStatusSchema = z.enum(flowStepRunStatusValues);
export type FlowStepRunStatus = z.infer<typeof flowStepRunStatusSchema>;

export const flowRuntimeEventSourceValues = [
  "crm",
  "product",
  "order",
  "booking",
  "message",
  "chart",
  "astro_calendar",
  "manual"
] as const;
export const flowRuntimeEventSourceSchema = z.enum(flowRuntimeEventSourceValues);
export type FlowRuntimeEventSource = z.infer<typeof flowRuntimeEventSourceSchema>;

export const flowRunSubjectTypeValues = [
  "client",
  "segment",
  "order",
  "booking",
  "global_event",
  "manual"
] as const;
export const flowRunSubjectTypeSchema = z.enum(flowRunSubjectTypeValues);
export type FlowRunSubjectType = z.infer<typeof flowRunSubjectTypeSchema>;

export const flowApprovalStatusValues = [
  "pending",
  "approved",
  "rejected",
  "snoozed",
  "expired"
] as const;
export const flowApprovalStatusSchema = z.enum(flowApprovalStatusValues);
export type FlowApprovalStatus = z.infer<typeof flowApprovalStatusSchema>;

export const flowApprovalDecisionValues = ["approved", "rejected", "snoozed"] as const;
export const flowApprovalDecisionSchema = z.enum(flowApprovalDecisionValues);
export type FlowApprovalDecision = z.infer<typeof flowApprovalDecisionSchema>;

export const flowApprovalKindValues = [
  "message",
  "ai_output",
  "delivery",
  "payment_offer",
  "manual_task"
] as const;
export const flowApprovalKindSchema = z.enum(flowApprovalKindValues);
export type FlowApprovalKind = z.infer<typeof flowApprovalKindSchema>;

export const flowTemplateCategoryValues = [
  "sales",
  "service_delivery",
  "retention",
  "content",
  "astro_calendar",
  "client_care",
  "advanced"
] as const;
export const flowTemplateCategorySchema = z.enum(flowTemplateCategoryValues);
export type FlowTemplateCategory = z.infer<typeof flowTemplateCategorySchema>;

export const flowRunSnapshotV2Schema = z
  .object({
    schemaVersion: z.literal("flow-run-snapshot.v2"),
    enrollment: z
      .object({
        activationEpochId: uuidSchema,
        triggerNodeId: stableIdSchema,
        occurrenceKey: uuidSchema,
        policyKey: z.literal("once_per_occurrence"),
        policyRevision: z.literal(1),
        rolloutPolicyRevision: z.number().int().positive(),
        eventOccurredAt: instantSchema,
        enrolledAt: instantSchema
      })
      .strict(),
    subject: z
      .object({
        type: z.literal("booking"),
        bookingId: uuidSchema,
        clientUserId: uuidSchema,
        productId: uuidSchema,
        startAt: instantSchema,
        endAt: instantSchema
      })
      .strict(),
    executionAuthority: z
      .object({
        basis: z.enum(["current_entitlement", "paid_order_obligation"]),
        referenceId: uuidSchema
      })
      .strict()
  })
  .strict();
export type FlowRunSnapshotV2 = z.infer<typeof flowRunSnapshotV2Schema>;

export const flowRunSnapshotSchema = flowRunSnapshotV2Schema;
export type FlowRunSnapshot = FlowRunSnapshotV2;

export const flowRunSchema = z
  .object({
    id: uuidSchema,
    flowId: uuidSchema,
    flowVersionId: uuidSchema,
    ownerAstrologerId: uuidSchema,
    status: flowRunStatusSchema,
    snapshot: flowRunSnapshotSchema,
    currentNodeId: stableIdSchema.nullable(),
    createdAt: instantSchema,
    updatedAt: instantSchema
  })
  .strict();
export type FlowRun = z.infer<typeof flowRunSchema>;

export const flowRuntimeEventSchema = z
  .object({
    id: uuidSchema,
    ownerUserId: uuidSchema,
    source: flowRuntimeEventSourceSchema,
    sourceEventId: z.string().trim().min(1).max(180),
    dedupeKey: z.string().trim().min(1).max(240),
    subjectType: flowRunSubjectTypeSchema,
    subjectId: z.string().trim().min(1).max(180),
    occurredAt: instantSchema,
    payload: recordSchema.default({})
  })
  .strict();
export type FlowRuntimeEvent = z.infer<typeof flowRuntimeEventSchema>;

export const flowApprovalSchema = z
  .object({
    id: uuidSchema,
    flowRunId: uuidSchema,
    stepRunId: uuidSchema.nullable(),
    status: flowApprovalStatusSchema,
    kind: flowApprovalKindSchema,
    title: titleSchema,
    preview: descriptionSchema,
    createdAt: instantSchema,
    decidedAt: instantSchema.nullable()
  })
  .strict();
export type FlowApproval = z.infer<typeof flowApprovalSchema>;

export const flowStepRunResponseSchema = z
  .object({
    id: uuidSchema,
    flowRunId: uuidSchema,
    nodeId: stableIdSchema,
    status: flowStepRunStatusSchema,
    inputSnapshot: recordSchema,
    outputSnapshot: recordSchema.nullable(),
    errorCode: z.string().trim().min(1).max(120).nullable(),
    errorMessage: z.string().trim().min(1).max(1_000).nullable(),
    createdAt: instantSchema,
    updatedAt: instantSchema,
    completedAt: instantSchema.nullable()
  })
  .strict();
export type FlowStepRunResponse = z.infer<typeof flowStepRunResponseSchema>;

export const flowRunResponseSchema = z
  .object({
    id: uuidSchema,
    flowId: uuidSchema,
    flowVersionId: uuidSchema,
    ownerUserId: uuidSchema,
    sourceEventId: z.string().trim().min(1).max(180),
    status: flowRunStatusSchema,
    snapshot: flowRunSnapshotSchema,
    currentNodeId: stableIdSchema.nullable(),
    createdAt: instantSchema,
    updatedAt: instantSchema,
    completedAt: instantSchema.nullable()
  })
  .strict();
export type FlowRunResponse = z.infer<typeof flowRunResponseSchema>;

export const flowRuntimeAvailabilitySchema = z
  .object({
    mode: z.enum(["definition_only", "canary", "enabled"]),
    executionAvailable: z.boolean(),
    reasonCode: z.literal("FLOW_RUNTIME_EXECUTION_UNAVAILABLE").nullable(),
    historySemantics: z.literal("durable_execution")
  })
  .strict()
  .superRefine((availability, context) => {
    if (
      availability.mode === "definition_only" &&
      (availability.executionAvailable ||
        availability.reasonCode !== "FLOW_RUNTIME_EXECUTION_UNAVAILABLE" ||
        availability.historySemantics !== "durable_execution")
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Definition-only flow runtime must fail closed with V2 durable execution semantics"
      });
    }
    if (availability.executionAvailable === (availability.reasonCode !== null)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Flow runtime availability and reason code are inconsistent"
      });
    }
    if (availability.mode === "enabled" && !availability.executionAvailable) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enabled flow runtime must be executable"
      });
    }
  });
export type FlowRuntimeAvailability = z.infer<typeof flowRuntimeAvailabilitySchema>;

export const simulateFlowRunRequestSchema = z
  .object({
    source: flowRuntimeEventSourceSchema,
    subjectType: flowRunSubjectTypeSchema,
    subjectId: z.string().trim().min(1).max(180),
    occurredAt: instantSchema,
    timeZone: z.string().trim().min(1).max(120),
    payload: recordSchema.default({})
  })
  .strict();
export type SimulateFlowRunRequestInput = z.input<typeof simulateFlowRunRequestSchema>;
export type SimulateFlowRunRequest = z.infer<typeof simulateFlowRunRequestSchema>;

export const listFlowRunsQuerySchema = z
  .object({
    status: z
      .enum(["all", ...flowRunStatusValues])
      .optional()
      .default("all"),
    limit: z.coerce.number().int().min(1).max(100).optional().default(50),
    offset: z.coerce.number().int().min(0).max(10_000).optional().default(0)
  })
  .strict();
export type ListFlowRunsQueryInput = z.input<typeof listFlowRunsQuerySchema>;
export type ListFlowRunsQuery = z.infer<typeof listFlowRunsQuerySchema>;

export const listFlowRunsResponseSchema = z
  .object({
    runs: z.array(flowRunResponseSchema).max(100),
    total: z.number().int().min(0),
    runtime: flowRuntimeAvailabilitySchema
  })
  .strict();
export type ListFlowRunsResponse = z.infer<typeof listFlowRunsResponseSchema>;

export const getFlowRunResponseSchema = z
  .object({
    run: flowRunResponseSchema,
    runtime: flowRuntimeAvailabilitySchema
  })
  .strict();
export type GetFlowRunResponse = z.infer<typeof getFlowRunResponseSchema>;

export const cancelFlowRunRequestSchema = z.object({}).strict();
export type CancelFlowRunRequest = z.infer<typeof cancelFlowRunRequestSchema>;

export const cancelFlowRunResponseSchema = z
  .object({
    run: flowRunResponseSchema
  })
  .strict();
export type CancelFlowRunResponse = z.infer<typeof cancelFlowRunResponseSchema>;

export const listFlowApprovalsQuerySchema = z
  .object({
    status: z
      .enum(["all", ...flowApprovalStatusValues])
      .optional()
      .default("pending"),
    limit: z.coerce.number().int().min(1).max(100).optional().default(50),
    offset: z.coerce.number().int().min(0).max(10_000).optional().default(0)
  })
  .strict();
export type ListFlowApprovalsQueryInput = z.input<typeof listFlowApprovalsQuerySchema>;
export type ListFlowApprovalsQuery = z.infer<typeof listFlowApprovalsQuerySchema>;

export const listFlowApprovalsResponseSchema = z
  .object({
    approvals: z.array(flowApprovalSchema).max(100),
    total: z.number().int().min(0),
    runtime: flowRuntimeAvailabilitySchema
  })
  .strict();
export type ListFlowApprovalsResponse = z.infer<typeof listFlowApprovalsResponseSchema>;

export const decideFlowApprovalRequestSchema = z
  .object({
    decision: flowApprovalDecisionSchema,
    note: z.string().trim().min(1).max(1_000).optional()
  })
  .strict();
export type DecideFlowApprovalRequest = z.infer<typeof decideFlowApprovalRequestSchema>;

export const decideFlowApprovalResponseSchema = z
  .object({
    approval: flowApprovalSchema
  })
  .strict();
export type DecideFlowApprovalResponse = z.infer<typeof decideFlowApprovalResponseSchema>;

export const flowSimulationStepSchema = z
  .object({
    nodeId: stableIdSchema,
    status: z.enum(["planned", "approval_required", "blocked"]),
    reason: z.string().trim().min(1).max(240).nullable()
  })
  .strict();
export type FlowSimulationStep = z.infer<typeof flowSimulationStepSchema>;

export const simulateFlowRunResponseSchema = z
  .object({
    flowId: uuidSchema,
    flowVersionId: uuidSchema,
    plannedSteps: z.array(flowSimulationStepSchema).max(100),
    warnings: z.array(z.string().trim().min(1).max(240)).max(100)
  })
  .strict();
export type SimulateFlowRunResponse = z.infer<typeof simulateFlowRunResponseSchema>;

export const manualFlowRunResponseSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.enum(["created", "duplicate"]),
      event: flowRuntimeEventSchema,
      run: flowRunResponseSchema,
      stepRuns: z.array(flowStepRunResponseSchema).max(100),
      approvals: z.array(flowApprovalSchema).max(100)
    })
    .strict(),
  z
    .object({
      status: z.literal("suppressed"),
      event: flowRuntimeEventSchema,
      reason: z.string().trim().min(1).max(240)
    })
    .strict()
]);
export type ManualFlowRunResponse = z.infer<typeof manualFlowRunResponseSchema>;
