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
    sourceEventId: stableIdSchema,
    subjectType: z.enum(["client", "segment", "order", "booking", "global_event", "manual"]),
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

export const flowApprovalSchema = z
  .object({
    id: uuidSchema,
    flowRunId: uuidSchema,
    stepRunId: uuidSchema.nullable(),
    status: z.enum(["pending", "approved", "rejected", "snoozed", "expired"]),
    kind: z.enum(["message", "ai_output", "delivery", "payment_offer", "manual_task"]),
    title: titleSchema,
    preview: descriptionSchema,
    createdAt: instantSchema,
    decidedAt: instantSchema.nullable()
  })
  .strict();
export type FlowApproval = z.infer<typeof flowApprovalSchema>;

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
