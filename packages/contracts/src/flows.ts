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

export const flowNodeCategoryValues = [
  "trigger",
  "action",
  "ai",
  "condition",
  "delay",
  "handoff",
  "terminal"
] as const;
export const flowNodeCategorySchema = z.enum(flowNodeCategoryValues);
export type FlowNodeCategory = z.infer<typeof flowNodeCategorySchema>;

export const flowTriggerKindValues = [
  "lead_created",
  "product_purchased",
  "incoming_message",
  "astro_event",
  "segment_changed",
  "form_completed",
  "booking_confirmed",
  "schedule",
  "review_received",
  "subscription_changed",
  "chart_ready",
  "journal_entry",
  "manual"
] as const;
export const flowTriggerKindSchema = z.enum(flowTriggerKindValues);
export type FlowTriggerKind = z.infer<typeof flowTriggerKindSchema>;

export const flowActionKindValues = [
  "send_message",
  "request_birth_data",
  "calculate_chart",
  "offer_slot",
  "request_payment",
  "deliver_result",
  "open_access",
  "issue_certificate",
  "update_tag",
  "create_task",
  "webhook",
  "publish_content"
] as const;
export const flowActionKindSchema = z.enum(flowActionKindValues);
export type FlowActionKind = z.infer<typeof flowActionKindSchema>;

export const flowAiKindValues = [
  "classify",
  "summarize",
  "score",
  "extract",
  "reply_draft",
  "content_draft",
  "interpretation_draft"
] as const;
export const flowAiKindSchema = z.enum(flowAiKindValues);
export type FlowAiKind = z.infer<typeof flowAiKindSchema>;

export const flowConditionKindValues = [
  "if_else",
  "chart_condition",
  "segment_split",
  "ab_split",
  "consent_check",
  "reply_received",
  "data_available"
] as const;
export const flowConditionKindSchema = z.enum(flowConditionKindValues);
export type FlowConditionKind = z.infer<typeof flowConditionKindSchema>;

export const flowDelayKindValues = ["delay_for", "wait_until", "wait_for_event"] as const;
export const flowDelayKindSchema = z.enum(flowDelayKindValues);
export type FlowDelayKind = z.infer<typeof flowDelayKindSchema>;

export const flowHandoffKindValues = ["approval", "manual_task", "live_session"] as const;
export const flowHandoffKindSchema = z.enum(flowHandoffKindValues);
export type FlowHandoffKind = z.infer<typeof flowHandoffKindSchema>;

export const flowTerminalKindValues = [
  "completed",
  "suppressed",
  "expired",
  "canceled"
] as const;
export const flowTerminalKindSchema = z.enum(flowTerminalKindValues);
export type FlowTerminalKind = z.infer<typeof flowTerminalKindSchema>;

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

export const flowNodePositionSchema = z
  .object({
    x: z.number().int().min(-100_000).max(100_000),
    y: z.number().int().min(-100_000).max(100_000)
  })
  .strict();
export type FlowNodePosition = z.infer<typeof flowNodePositionSchema>;

const flowBaseNodeSchema = z
  .object({
    id: stableIdSchema,
    title: titleSchema,
    description: descriptionSchema.nullable().optional(),
    config: recordSchema.default({}),
    position: flowNodePositionSchema.optional()
  })
  .strict();

export const flowTriggerNodeSchema = flowBaseNodeSchema
  .extend({
    category: z.literal("trigger"),
    kind: flowTriggerKindSchema
  })
  .strict();
export type FlowTriggerNode = z.infer<typeof flowTriggerNodeSchema>;

export const flowActionNodeSchema = flowBaseNodeSchema
  .extend({
    category: z.literal("action"),
    kind: flowActionKindSchema,
    approvalMode: flowApprovalModeSchema
  })
  .strict();
export type FlowActionNode = z.infer<typeof flowActionNodeSchema>;

export const flowAiNodeSchema = flowBaseNodeSchema
  .extend({
    category: z.literal("ai"),
    kind: flowAiKindSchema,
    approvalMode: flowApprovalModeSchema
  })
  .strict();
export type FlowAiNode = z.infer<typeof flowAiNodeSchema>;

export const flowConditionNodeSchema = flowBaseNodeSchema
  .extend({
    category: z.literal("condition"),
    kind: flowConditionKindSchema
  })
  .strict();
export type FlowConditionNode = z.infer<typeof flowConditionNodeSchema>;

export const flowDelayNodeSchema = flowBaseNodeSchema
  .extend({
    category: z.literal("delay"),
    kind: flowDelayKindSchema
  })
  .strict();
export type FlowDelayNode = z.infer<typeof flowDelayNodeSchema>;

export const flowHandoffNodeSchema = flowBaseNodeSchema
  .extend({
    category: z.literal("handoff"),
    kind: flowHandoffKindSchema,
    approvalMode: flowApprovalModeSchema
  })
  .strict();
export type FlowHandoffNode = z.infer<typeof flowHandoffNodeSchema>;

export const flowTerminalNodeSchema = flowBaseNodeSchema
  .extend({
    category: z.literal("terminal"),
    kind: flowTerminalKindSchema
  })
  .strict();
export type FlowTerminalNode = z.infer<typeof flowTerminalNodeSchema>;

export const flowNodeSchema = z.discriminatedUnion("category", [
  flowTriggerNodeSchema,
  flowActionNodeSchema,
  flowAiNodeSchema,
  flowConditionNodeSchema,
  flowDelayNodeSchema,
  flowHandoffNodeSchema,
  flowTerminalNodeSchema
]);
export type FlowNode = z.infer<typeof flowNodeSchema>;

export const flowEdgeSchema = z
  .object({
    id: stableIdSchema,
    fromNodeId: stableIdSchema,
    toNodeId: stableIdSchema,
    label: z.string().trim().min(1).max(80).optional(),
    branchKey: stableIdSchema.optional()
  })
  .strict();
export type FlowEdge = z.infer<typeof flowEdgeSchema>;

export const flowGraphSchema = z
  .object({
    schemaVersion: z.literal("flow-graph.v1"),
    nodes: z.array(flowNodeSchema).min(1).max(200),
    edges: z.array(flowEdgeSchema).max(400)
  })
  .strict()
  .superRefine((graph, context) => {
    const nodeIds = new Set<string>();
    for (const node of graph.nodes) {
      if (nodeIds.has(node.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["nodes"],
          message: "Flow graph node ids must be unique"
        });
        break;
      }
      nodeIds.add(node.id);
    }

    const triggerCount = graph.nodes.filter((node) => node.category === "trigger").length;
    if (triggerCount !== 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["nodes"],
        message: "Flow graph requires exactly one trigger node"
      });
    }

    if (
      graph.edges.some((edge) => !nodeIds.has(edge.fromNodeId) || !nodeIds.has(edge.toNodeId))
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["edges"],
        message: "Flow graph edges must reference existing nodes"
      });
    }
  });
export type FlowGraph = z.infer<typeof flowGraphSchema>;

export const flowDraftSchema = z
  .object({
    id: uuidSchema,
    ownerAstrologerId: uuidSchema,
    name: titleSchema,
    status: z.literal("draft"),
    approvalMode: flowApprovalModeSchema,
    graph: flowGraphSchema,
    updatedAt: instantSchema
  })
  .strict();
export type FlowDraft = z.infer<typeof flowDraftSchema>;

export const flowVersionSchema = z
  .object({
    id: uuidSchema,
    flowId: uuidSchema,
    version: z.number().int().positive(),
    status: z.literal("published"),
    approvalMode: flowApprovalModeSchema,
    graph: flowGraphSchema,
    publishedAt: instantSchema
  })
  .strict();
export type FlowVersion = z.infer<typeof flowVersionSchema>;

export const flowRunSnapshotSchema = z
  .object({
    schemaVersion: z.literal("flow-run-snapshot.v1"),
    flowVersionId: uuidSchema,
    sourceEventId: z.string().trim().min(1).max(180),
    subjectType: flowRunSubjectTypeSchema,
    subjectId: z.string().trim().min(1).max(180),
    occurredAt: instantSchema,
    timeZone: z.string().trim().min(1).max(120),
    consent: recordSchema.default({}),
    channels: recordSchema.default({}),
    payload: recordSchema.default({})
  })
  .strict();
export type FlowRunSnapshot = z.infer<typeof flowRunSnapshotSchema>;

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

export const flowTemplateSchema = z
  .object({
    key: stableIdSchema,
    name: titleSchema,
    description: descriptionSchema,
    category: flowTemplateCategorySchema,
    recommendedApprovalMode: flowApprovalModeSchema,
    requiredCapabilities: z.array(stableIdSchema).max(30),
    graph: flowGraphSchema
  })
  .strict();
export type FlowTemplate = z.infer<typeof flowTemplateSchema>;

export const createFlowRequestSchema = z
  .object({
    name: titleSchema,
    approvalMode: flowApprovalModeSchema.default("manual_approve"),
    graph: flowGraphSchema
  })
  .strict();
export type CreateFlowRequestInput = z.input<typeof createFlowRequestSchema>;
export type CreateFlowRequest = z.infer<typeof createFlowRequestSchema>;

export const updateFlowDraftRequestSchema = z
  .object({
    name: titleSchema.optional(),
    approvalMode: flowApprovalModeSchema.optional(),
    graph: flowGraphSchema.optional()
  })
  .strict()
  .superRefine((request, context) => {
    if (
      request.name === undefined &&
      request.approvalMode === undefined &&
      request.graph === undefined
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Flow draft update requires at least one field"
      });
    }
  });
export type UpdateFlowDraftRequestInput = z.input<typeof updateFlowDraftRequestSchema>;
export type UpdateFlowDraftRequest = z.infer<typeof updateFlowDraftRequestSchema>;

export const flowResponseSchema = z
  .object({
    id: uuidSchema,
    ownerUserId: uuidSchema,
    name: titleSchema,
    status: flowStatusSchema,
    approvalMode: flowApprovalModeSchema,
    draftGraph: flowGraphSchema,
    publishedVersionId: uuidSchema.nullable(),
    publishedVersion: z.number().int().positive().nullable(),
    createdAt: instantSchema,
    updatedAt: instantSchema,
    publishedAt: instantSchema.nullable()
  })
  .strict();
export type FlowResponse = z.infer<typeof flowResponseSchema>;

export const listFlowsQuerySchema = z
  .object({
    status: z.enum(["all", ...flowStatusValues]).optional().default("all"),
    limit: z.coerce.number().int().min(1).max(100).optional().default(50),
    offset: z.coerce.number().int().min(0).max(10_000).optional().default(0)
  })
  .strict();
export type ListFlowsQueryInput = z.input<typeof listFlowsQuerySchema>;
export type ListFlowsQuery = z.infer<typeof listFlowsQuerySchema>;

export const flowRuntimeAvailabilitySchema = z
  .object({
    mode: z.enum(["definition_only", "canary", "enabled"]),
    executionAvailable: z.boolean(),
    reasonCode: z.literal("FLOW_RUNTIME_EXECUTION_UNAVAILABLE").nullable(),
    historySemantics: z.enum(["legacy_preview", "mixed", "durable_execution"])
  })
  .strict()
  .superRefine((availability, context) => {
    if (
      availability.mode === "definition_only" &&
      (availability.executionAvailable ||
        availability.reasonCode !== "FLOW_RUNTIME_EXECUTION_UNAVAILABLE" ||
        availability.historySemantics !== "legacy_preview")
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Definition-only flow runtime must fail closed with legacy-preview history"
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
    if (
      availability.mode === "enabled" &&
      availability.historySemantics !== "durable_execution"
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enabled flow runtime must expose durable execution history"
      });
    }
    if (
      availability.mode === "canary" &&
      availability.historySemantics === "legacy_preview"
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Canary flow runtime must distinguish rollout history"
      });
    }
  });
export type FlowRuntimeAvailability = z.infer<typeof flowRuntimeAvailabilitySchema>;

export const listFlowsResponseSchema = z
  .object({
    flows: z.array(flowResponseSchema).max(100),
    total: z.number().int().min(0),
    runtime: flowRuntimeAvailabilitySchema
  })
  .strict();
export type ListFlowsResponse = z.infer<typeof listFlowsResponseSchema>;

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
    status: z.enum(["all", ...flowRunStatusValues]).optional().default("all"),
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

export const cancelFlowRunResponseSchema = z
  .object({
    run: flowRunResponseSchema
  })
  .strict();
export type CancelFlowRunResponse = z.infer<typeof cancelFlowRunResponseSchema>;

export const listFlowApprovalsQuerySchema = z
  .object({
    status: z.enum(["all", ...flowApprovalStatusValues]).optional().default("pending"),
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

export const publishFlowResponseSchema = z
  .object({
    flow: flowResponseSchema,
    version: flowVersionSchema.nullable()
  })
  .strict();
export type PublishFlowResponse = z.infer<typeof publishFlowResponseSchema>;

export const listFlowTemplatesResponseSchema = z
  .object({
    templates: z.array(flowTemplateSchema).max(100)
  })
  .strict();
export type ListFlowTemplatesResponse = z.infer<typeof listFlowTemplatesResponseSchema>;
