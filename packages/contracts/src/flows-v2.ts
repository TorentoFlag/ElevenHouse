import { z } from "@elevenhouse/validation";

import {
  flowApprovalModeSchema,
  flowRuntimeAvailabilitySchema,
  flowStatusSchema,
  flowStatusValues,
  flowTemplateCategorySchema
} from "./flows";
import { chartSettingsSchema } from "./charts";
import type { ChartInterpretationMode } from "./calculations";

const uuidSchema = z.string().uuid();
const stableIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(/^[a-z0-9][a-z0-9_-]*$/);
const displayTitleSchema = z.string().trim().min(1).max(180);
const descriptionSchema = z.string().trim().min(1).max(1_000);
export const flowWorkItemInstructionsV2Schema = z.string().trim().min(1).max(4_000);
const instantSchema = z.string().datetime({ offset: true });
const versionOneSchema = z.literal(1);
const positiveRevisionSchema = z.number().int().positive();
const flowLocaleSchema = z.enum(["ru", "en"]);
const capabilityKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(180)
  .regex(/^[a-z0-9][a-z0-9._:-]*$/);

export const FLOW_GRAPH_V2_MAX_NODES = 200;
export const FLOW_GRAPH_V2_MAX_EDGES = 400;
export const flowNodeKindV2Values = [
  "booking_confirmed",
  "manual_client",
  "product_purchased",
  "first_inbound_message",
  "client_lifecycle_changed",
  "birth_data_available",
  "natal_chart_request",
  "natal_chart_ai_draft",
  "send_message",
  "astrologer_work_item",
  "astrologer_approval",
  "completed",
  "suppressed",
  "failed"
] as const;
export const flowNodeKindV2Schema = z.enum(flowNodeKindV2Values);
export type FlowNodeKindV2 = z.infer<typeof flowNodeKindV2Schema>;

export const flowTriggerNodeKindV2Values = [
  "booking_confirmed",
  "manual_client",
  "product_purchased",
  "first_inbound_message",
  "client_lifecycle_changed"
] as const;
export const flowTriggerNodeKindV2Schema = z.enum(flowTriggerNodeKindV2Values);
export type FlowTriggerNodeKindV2 = z.infer<typeof flowTriggerNodeKindV2Schema>;

export const flowExecutableNodeKindV2Values = [
  "birth_data_available",
  "natal_chart_request",
  "natal_chart_ai_draft",
  "send_message",
  "astrologer_work_item",
  "astrologer_approval",
  "completed",
  "suppressed",
  "failed"
] as const;
export const flowExecutableNodeKindV2Schema = z.enum(flowExecutableNodeKindV2Values);
export type FlowExecutableNodeKindV2 = z.infer<typeof flowExecutableNodeKindV2Schema>;

export const flowSourceHandleV2Values = [
  "next",
  "true",
  "false",
  "success",
  "error",
  "timeout",
  "approved",
  "rejected"
] as const;
export const flowSourceHandleV2Schema = z.enum(flowSourceHandleV2Values);
export type FlowSourceHandleV2 = z.infer<typeof flowSourceHandleV2Schema>;

const nodeBaseShape = {
  id: stableIdSchema,
  displayTitle: displayTitleSchema,
  configSchemaVersion: versionOneSchema,
  executorContractVersion: versionOneSchema
} as const;

const bookingConfirmedConfigSchema = z
  .object({
    productIds: z.array(uuidSchema).min(1).max(100)
  })
  .strict()
  .superRefine((config, context) => {
    if (new Set(config.productIds).size !== config.productIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["productIds"],
        message: "Booking product filters must be unique"
      });
    }
  });

export const flowEnrollmentPolicyKeyValues = [
  "once_per_client",
  "each_occurrence",
  "after_previous_terminal"
] as const;
export const flowEnrollmentPolicyKeySchema = z.enum(flowEnrollmentPolicyKeyValues);
export type FlowEnrollmentPolicyKey = z.infer<typeof flowEnrollmentPolicyKeySchema>;

const clientLifecycleStatusValues = [
  "new",
  "active",
  "waiting_for_client",
  "in_service",
  "inactive"
] as const;
const clientLifecycleStatusSchema = z.enum(clientLifecycleStatusValues);

export const flowBookingConfirmedNodeV2Schema = z
  .object({
    ...nodeBaseShape,
    kind: z.literal("booking_confirmed"),
    config: bookingConfirmedConfigSchema
  })
  .strict();
export type FlowBookingConfirmedNodeV2 = z.infer<typeof flowBookingConfirmedNodeV2Schema>;

export const flowManualClientNodeV2Schema = z
  .object({
    ...nodeBaseShape,
    kind: z.literal("manual_client"),
    config: z.object({}).strict()
  })
  .strict();
export type FlowManualClientNodeV2 = z.infer<typeof flowManualClientNodeV2Schema>;

export const flowProductPurchasedNodeV2Schema = z
  .object({
    ...nodeBaseShape,
    kind: z.literal("product_purchased"),
    config: bookingConfirmedConfigSchema.extend({ enrollmentPolicy: flowEnrollmentPolicyKeySchema })
  })
  .strict();
export type FlowProductPurchasedNodeV2 = z.infer<typeof flowProductPurchasedNodeV2Schema>;

export const flowFirstInboundMessageNodeV2Schema = z
  .object({
    ...nodeBaseShape,
    kind: z.literal("first_inbound_message"),
    config: z.object({ enrollmentPolicy: flowEnrollmentPolicyKeySchema }).strict()
  })
  .strict();
export type FlowFirstInboundMessageNodeV2 = z.infer<typeof flowFirstInboundMessageNodeV2Schema>;

export const flowClientLifecycleChangedNodeV2Schema = z
  .object({
    ...nodeBaseShape,
    kind: z.literal("client_lifecycle_changed"),
    config: z
      .object({
        fromStatus: clientLifecycleStatusSchema.nullable(),
        toStatus: clientLifecycleStatusSchema.nullable(),
        enrollmentPolicy: flowEnrollmentPolicyKeySchema
      })
      .strict()
      .superRefine((config, context) => {
        if (config.fromStatus === null && config.toStatus === null) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: [],
            message: "Lifecycle trigger must filter by a source or target status"
          });
        }
      })
  })
  .strict();
export type FlowClientLifecycleChangedNodeV2 = z.infer<typeof flowClientLifecycleChangedNodeV2Schema>;

export const flowBirthDataAvailableNodeV2Schema = z
  .object({
    ...nodeBaseShape,
    kind: z.literal("birth_data_available"),
    config: z
      .object({
        purpose: z.literal("service_preparation")
      })
      .strict()
  })
  .strict();
export type FlowBirthDataAvailableNodeV2 = z.infer<typeof flowBirthDataAvailableNodeV2Schema>;

export const flowNatalChartRequestNodeV2Schema = z
  .object({
    ...nodeBaseShape,
    kind: z.literal("natal_chart_request"),
    config: z
      .object({
        interpretationMode: z.enum(["adult_natal", "child"] satisfies readonly ChartInterpretationMode[]),
        settings: chartSettingsSchema
      })
      .strict()
  })
  .strict();
export type FlowNatalChartRequestNodeV2 = z.infer<typeof flowNatalChartRequestNodeV2Schema>;

export const flowNatalChartAiDraftNodeV2Schema = z
  .object({
    ...nodeBaseShape,
    kind: z.literal("natal_chart_ai_draft"),
    config: z
      .object({
        /** Exact natal-chart request node whose completed job is the immutable source. */
        chartRequestNodeId: stableIdSchema,
        locale: flowLocaleSchema,
        approvalTitle: displayTitleSchema,
        expiresAfterMinutes: z.number().int().min(1).max(525_600).optional()
      })
      .strict()
  })
  .strict();
export type FlowNatalChartAiDraftNodeV2 = z.infer<typeof flowNatalChartAiDraftNodeV2Schema>;

/**
 * Sends a pre-authored text template only to the Flow subject's unambiguous,
 * already-connected Messaging thread. Template interpolation is deliberately
 * not accepted by V2: any new personal-data placeholder needs its own
 * provenance, consent and redaction contract before it can enter a durable
 * outbound command.
 */
export const flowSendMessageNodeV2Schema = z
  .object({
    ...nodeBaseShape,
    kind: z.literal("send_message"),
    config: z
      .object({
        textTemplate: z.string().trim().min(1).max(4_000)
      })
      .strict()
  })
  .strict();
export type FlowSendMessageNodeV2 = z.infer<typeof flowSendMessageNodeV2Schema>;

export const flowAstrologerWorkItemTaskKindV2Values = [
  "consultation_preparation",
  "birth_data_collection"
] as const;
export const flowAstrologerWorkItemTaskKindV2Schema = z.enum(flowAstrologerWorkItemTaskKindV2Values);
export type FlowAstrologerWorkItemTaskKindV2 = z.infer<
  typeof flowAstrologerWorkItemTaskKindV2Schema
>;

export const flowWorkItemPriorityV2Values = ["low", "normal", "high", "urgent"] as const;
export const flowWorkItemPriorityV2Schema = z.enum(flowWorkItemPriorityV2Values);
export type FlowWorkItemPriorityV2 = z.infer<typeof flowWorkItemPriorityV2Schema>;

export const flowWorkItemDuePolicyV2Schema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("none") }).strict(),
  z
    .object({
      kind: z.literal("before_booking_start"),
      leadTimeMinutes: z.number().int().min(0).max(525_600)
    })
    .strict()
]);
export type FlowWorkItemDuePolicyV2 = z.infer<typeof flowWorkItemDuePolicyV2Schema>;

export const flowWorkItemResultSummaryRequirementV2Values = ["optional", "required"] as const;
export const flowWorkItemResultSummaryRequirementV2Schema = z.enum(
  flowWorkItemResultSummaryRequirementV2Values
);
export type FlowWorkItemResultSummaryRequirementV2 = z.infer<
  typeof flowWorkItemResultSummaryRequirementV2Schema
>;

export const flowWorkItemCompletionRequirementsV2Schema = z
  .object({ resultSummary: flowWorkItemResultSummaryRequirementV2Schema })
  .strict();
export type FlowWorkItemCompletionRequirementsV2 = z.infer<
  typeof flowWorkItemCompletionRequirementsV2Schema
>;

export const flowAstrologerWorkItemNodeV2Schema = z
  .object({
    ...nodeBaseShape,
    kind: z.literal("astrologer_work_item"),
    config: z
      .object({
        taskKind: flowAstrologerWorkItemTaskKindV2Schema,
        taskTitle: displayTitleSchema,
        instructions: flowWorkItemInstructionsV2Schema.optional(),
        priority: flowWorkItemPriorityV2Schema,
        duePolicy: flowWorkItemDuePolicyV2Schema.optional(),
        completionRequirements: flowWorkItemCompletionRequirementsV2Schema.optional()
      })
      .strict()
  })
  .strict();
export type FlowAstrologerWorkItemNodeV2 = z.infer<typeof flowAstrologerWorkItemNodeV2Schema>;

export const flowApprovalKindV2Values = ["ai_output", "manual_task"] as const;
export const flowApprovalKindV2Schema = z.enum(flowApprovalKindV2Values);
export type FlowApprovalKindV2 = z.infer<typeof flowApprovalKindV2Schema>;

export const flowAstrologerApprovalNodeV2Schema = z
  .object({
    ...nodeBaseShape,
    kind: z.literal("astrologer_approval"),
    config: z
      .object({
        approvalKind: flowApprovalKindV2Schema,
        approvalTitle: displayTitleSchema,
        expiresAfterMinutes: z.number().int().min(1).max(525_600).optional()
      })
      .strict()
  })
  .strict();
export type FlowAstrologerApprovalNodeV2 = z.infer<typeof flowAstrologerApprovalNodeV2Schema>;

export const flowCompletedNodeV2Schema = z
  .object({
    ...nodeBaseShape,
    kind: z.literal("completed"),
    config: z
      .object({
        goalKey: stableIdSchema
      })
      .strict()
  })
  .strict();
export type FlowCompletedNodeV2 = z.infer<typeof flowCompletedNodeV2Schema>;

export const flowSuppressedNodeV2Schema = z
  .object({
    ...nodeBaseShape,
    kind: z.literal("suppressed"),
    config: z
      .object({
        reasonCode: stableIdSchema
      })
      .strict()
  })
  .strict();
export type FlowSuppressedNodeV2 = z.infer<typeof flowSuppressedNodeV2Schema>;

export const flowFailedNodeV2Schema = z
  .object({
    ...nodeBaseShape,
    kind: z.literal("failed"),
    config: z
      .object({
        errorCode: stableIdSchema
      })
      .strict()
  })
  .strict();
export type FlowFailedNodeV2 = z.infer<typeof flowFailedNodeV2Schema>;

export const flowNodeV2Schema = z.discriminatedUnion("kind", [
  flowBookingConfirmedNodeV2Schema,
  flowManualClientNodeV2Schema,
  flowProductPurchasedNodeV2Schema,
  flowFirstInboundMessageNodeV2Schema,
  flowClientLifecycleChangedNodeV2Schema,
  flowBirthDataAvailableNodeV2Schema,
  flowNatalChartRequestNodeV2Schema,
  flowNatalChartAiDraftNodeV2Schema,
  flowSendMessageNodeV2Schema,
  flowAstrologerWorkItemNodeV2Schema,
  flowAstrologerApprovalNodeV2Schema,
  flowCompletedNodeV2Schema,
  flowSuppressedNodeV2Schema,
  flowFailedNodeV2Schema
]);
export type FlowNodeV2 = z.infer<typeof flowNodeV2Schema>;
export type FlowTriggerNodeV2 = Extract<FlowNodeV2, { kind: FlowTriggerNodeKindV2 }>;
export type FlowExecutableNodeV2 = Extract<FlowNodeV2, { kind: FlowExecutableNodeKindV2 }>;

export const flowEdgeV2Schema = z
  .object({
    id: stableIdSchema,
    sourceNodeId: stableIdSchema,
    targetNodeId: stableIdSchema,
    sourceHandle: flowSourceHandleV2Schema
  })
  .strict();
export type FlowEdgeV2 = z.infer<typeof flowEdgeV2Schema>;

export const flowGraphV2Schema = z
  .object({
    schemaVersion: z.literal("flow-graph.v2"),
    nodes: z.array(flowNodeV2Schema).min(1).max(FLOW_GRAPH_V2_MAX_NODES),
    edges: z.array(flowEdgeV2Schema).max(FLOW_GRAPH_V2_MAX_EDGES)
  })
  .strict();
export type FlowGraphV2 = z.infer<typeof flowGraphV2Schema>;

export const flowGraphReadSchema = flowGraphV2Schema;
export type FlowGraphRead = FlowGraphV2;

export const flowGraphV2CompileIssueCodeValues = [
  "duplicate_node_id",
  "duplicate_edge_id",
  "node_limit_exceeded",
  "edge_limit_exceeded",
  "invalid_trigger_count",
  "missing_edge_endpoint",
  "invalid_source_handle",
  "duplicate_source_handle",
  "missing_required_source_handle",
  "implicit_fan_out",
  "implicit_fan_in",
  "trigger_has_incoming_edge",
  "terminal_has_outgoing_edge",
  "cycle_detected",
  "unreachable_node",
  "unterminated_path",
  "work_item_due_policy_requires_booking_trigger",
  "manual_trigger_booking_context_unsupported",
  "chart_ai_draft_source_invalid"
] as const;
export const flowGraphV2CompileIssueCodeSchema = z.enum(flowGraphV2CompileIssueCodeValues);
export type FlowGraphV2CompileIssueCode = z.infer<typeof flowGraphV2CompileIssueCodeSchema>;

export const flowCapabilityRequirementValues = [
  "bookings.events.booking_confirmed",
  "finance.events.client_order_captured",
  "messaging.events.first_inbound_message",
  "clients.events.lifecycle_changed",
  "clients.birth_data.read.service_preparation",
  "products.read",
  "charts.calculate.natal.booking_context",
  "charts.interpret.natal.ai_draft",
  "messaging.outbound.send.existing_thread"
] as const;
export const flowCapabilityRequirementSchema = z.enum(flowCapabilityRequirementValues);
export type FlowCapabilityRequirement = z.infer<typeof flowCapabilityRequirementSchema>;

export const flowNodeExecutorRequirementSchema = z
  .object({
    kind: flowNodeKindV2Schema,
    configSchemaVersion: versionOneSchema,
    executorContractVersion: versionOneSchema
  })
  .strict();
export type FlowNodeExecutorRequirement = z.infer<typeof flowNodeExecutorRequirementSchema>;

export const flowExecutableNodeExecutorRequirementSchema = z
  .object({
    kind: flowExecutableNodeKindV2Schema,
    configSchemaVersion: versionOneSchema,
    executorContractVersion: versionOneSchema
  })
  .strict();
export type FlowExecutableNodeExecutorRequirement = z.infer<
  typeof flowExecutableNodeExecutorRequirementSchema
>;

export const flowTriggerMatcherRequirementSchema = z
  .object({
    kind: flowTriggerNodeKindV2Schema,
    configSchemaVersion: versionOneSchema,
    matcherContractVersion: versionOneSchema,
    eventSchemaVersion: versionOneSchema
  })
  .strict();
export type FlowTriggerMatcherRequirement = z.infer<typeof flowTriggerMatcherRequirementSchema>;

export const flowCapabilityManifestV2Schema = z
  .object({
    schemaVersion: z.literal("flow-capability-manifest.v2"),
    executionSemanticsVersion: z.literal("flow-interpreter.v1"),
    triggerMatcher: flowTriggerMatcherRequirementSchema,
    nodeExecutors: z
      .array(flowExecutableNodeExecutorRequirementSchema)
      .max(FLOW_GRAPH_V2_MAX_NODES),
    requiredCapabilities: z.array(flowCapabilityRequirementSchema).max(50)
  })
  .strict()
  .superRefine((manifest, context) => {
    const executorKeys = manifest.nodeExecutors.map(
      (executor) =>
        `${executor.kind}:${executor.configSchemaVersion}:${executor.executorContractVersion}`
    );
    if (new Set(executorKeys).size !== executorKeys.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["nodeExecutors"],
        message: "Flow capability manifest executors must be unique"
      });
    }
    if (new Set(manifest.requiredCapabilities).size !== manifest.requiredCapabilities.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["requiredCapabilities"],
        message: "Flow capability manifest requirements must be unique"
      });
    }
  });
export type FlowCapabilityManifestV2 = z.infer<typeof flowCapabilityManifestV2Schema>;

export const flowCapabilityManifestSchema = flowCapabilityManifestV2Schema;
export type FlowCapabilityManifest = FlowCapabilityManifestV2;

export const flowDefinitionValidationIssueCodeValues = [
  ...flowGraphV2CompileIssueCodeValues
] as const;
export const flowDefinitionValidationIssueCodeSchema = z.enum(
  flowDefinitionValidationIssueCodeValues
);
export type FlowDefinitionValidationIssueCode = z.infer<
  typeof flowDefinitionValidationIssueCodeSchema
>;

export const flowDefinitionValidationIssueSchema = z
  .object({
    code: flowDefinitionValidationIssueCodeSchema,
    severity: z.literal("error"),
    blocking: z.literal(true),
    path: z.string().trim().min(1).max(500),
    message: z.string().trim().min(1).max(1_000)
  })
  .strict();
export type FlowDefinitionValidationIssue = z.infer<typeof flowDefinitionValidationIssueSchema>;

export const flowActivationBlockerCodeValues = [
  "FLOW_GRAPH_NOT_PUBLISHABLE",
  "FLOW_RUNTIME_EXECUTION_UNAVAILABLE",
  "FLOW_CAPABILITY_UNAVAILABLE",
  "FLOW_RESOURCE_UNAVAILABLE"
] as const;
export const flowActivationBlockerCodeSchema = z.enum(flowActivationBlockerCodeValues);
export type FlowActivationBlockerCode = z.infer<typeof flowActivationBlockerCodeSchema>;

export const validateFlowDefinitionRequestSchema = z
  .object({
    graph: flowGraphReadSchema
  })
  .strict();
export type ValidateFlowDefinitionRequest = z.infer<typeof validateFlowDefinitionRequestSchema>;

const flowDefinitionValidationResponseCommonShape = {
  graphSchemaVersion: z.literal("flow-graph.v2"),
  publishable: z.boolean(),
  activatable: z.boolean(),
  issues: z.array(flowDefinitionValidationIssueSchema).max(2_000),
  activationBlockers: z.array(flowActivationBlockerCodeSchema).max(10),
  normalizedGraph: flowGraphV2Schema.nullable()
} as const;

export const validateFlowDefinitionResponseSchema = z
  .object({
    ...flowDefinitionValidationResponseCommonShape,
    capabilityManifest: flowCapabilityManifestV2Schema.nullable()
  })
  .strict()
  .superRefine(refineFlowDefinitionValidationResponse);
export type ValidateFlowDefinitionResponse = z.infer<typeof validateFlowDefinitionResponseSchema>;

function refineFlowDefinitionValidationResponse(
  result: {
    readonly graphSchemaVersion: "flow-graph.v2";
    readonly publishable: boolean;
    readonly activatable: boolean;
    readonly issues: readonly FlowDefinitionValidationIssue[];
    readonly activationBlockers: readonly FlowActivationBlockerCode[];
    readonly normalizedGraph: FlowGraphV2 | null;
    readonly capabilityManifest: FlowCapabilityManifest | null;
  },
  context: z.RefinementCtx
): void {
  const hasNormalizedGraph = result.normalizedGraph !== null;
  const hasCapabilityManifest = result.capabilityManifest !== null;
  const hasCompiledSnapshot = hasNormalizedGraph && hasCapabilityManifest;
  if (hasNormalizedGraph !== hasCapabilityManifest) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["capabilityManifest"],
      message: "Normalized graph and capability manifest must be returned together"
    });
  }
  if (result.publishable !== hasCompiledSnapshot) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["publishable"],
      message: "Publishable validation requires a normalized graph and capability manifest"
    });
  }
  if (result.publishable === result.issues.length > 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["issues"],
      message: "Blocking validation issues must agree with publishability"
    });
  }
  if (result.activatable !== (result.publishable && result.activationBlockers.length === 0)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["activatable"],
      message: "Activation readiness must agree with publishability and blockers"
    });
  }
  if (new Set(result.activationBlockers).size !== result.activationBlockers.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["activationBlockers"],
      message: "Activation blocker codes must be unique"
    });
  }

  const blockerCodes = new Set(result.activationBlockers);
  const hasNotPublishableBlocker = blockerCodes.has("FLOW_GRAPH_NOT_PUBLISHABLE");
  if (hasNotPublishableBlocker !== !result.publishable) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["activationBlockers"],
      message: "Graph publishability blockers must agree with V2 compilation"
    });
  }
}

const flowPresentationPositionSchema = z
  .object({
    x: z.number().min(-1_000_000).max(1_000_000),
    y: z.number().min(-1_000_000).max(1_000_000)
  })
  .strict();

export const flowPresentationV1Schema = z
  .object({
    schemaVersion: z.literal("flow-presentation.v1"),
    nodes: z
      .array(
        z
          .object({
            nodeId: stableIdSchema,
            position: flowPresentationPositionSchema,
            collapsed: z.boolean().optional()
          })
          .strict()
      )
      .max(200),
    viewport: z
      .object({
        x: z.number().min(-1_000_000).max(1_000_000),
        y: z.number().min(-1_000_000).max(1_000_000),
        zoom: z.number().min(0.1).max(4)
      })
      .strict()
  })
  .strict()
  .superRefine((presentation, context) => {
    const nodeIds = new Set<string>();
    presentation.nodes.forEach((node, index) => {
      if (nodeIds.has(node.nodeId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["nodes", index, "nodeId"],
          message: "Flow presentation node ids must be unique"
        });
      }
      nodeIds.add(node.nodeId);
    });
  });
export type FlowPresentationV1 = z.infer<typeof flowPresentationV1Schema>;

export const flowDefinitionStateSchema = z.enum(["draft", "versioned", "archived"]);
export type FlowDefinitionState = z.infer<typeof flowDefinitionStateSchema>;

export const flowDefinitionOriginV1Schema = z.discriminatedUnion("type", [
  z
    .object({
      schemaVersion: z.literal("flow-definition-origin.v1"),
      type: z.literal("blank")
    })
    .strict(),
  z
    .object({
      schemaVersion: z.literal("flow-definition-origin.v1"),
      type: z.literal("template"),
      templateKey: stableIdSchema,
      templateVersion: positiveRevisionSchema
    })
    .strict(),
]);
export type FlowDefinitionOriginV1 = z.infer<typeof flowDefinitionOriginV1Schema>;

export const flowDefinitionV2Schema = z
  .object({
    schemaVersion: z.literal("flow-definition.v2"),
    id: uuidSchema,
    ownerUserId: uuidSchema,
    name: displayTitleSchema,
    origin: flowDefinitionOriginV1Schema,
    state: flowDefinitionStateSchema,
    approvalMode: flowApprovalModeSchema,
    revision: positiveRevisionSchema,
    draftBaseVersionId: uuidSchema.nullable(),
    draftGraph: flowGraphV2Schema,
    draftPresentation: flowPresentationV1Schema.nullable(),
    latestPublishedVersionId: uuidSchema.nullable(),
    latestPublishedVersion: z.number().int().positive().nullable(),
    createdAt: instantSchema,
    updatedAt: instantSchema,
    publishedAt: instantSchema.nullable()
  })
  .strict()
  .superRefine((definition, context) => {
    const publicationPointerCount = [
      definition.latestPublishedVersionId,
      definition.latestPublishedVersion,
      definition.publishedAt
    ].filter((value) => value !== null).length;
    if (publicationPointerCount !== 0 && publicationPointerCount !== 3) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["latestPublishedVersionId"],
        message: "Latest published version pointers must be returned together"
      });
    }
    if (definition.state === "versioned" && publicationPointerCount !== 3) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["state"],
        message: "A versioned flow definition requires a complete published-version pointer"
      });
    }
    if (definition.draftBaseVersionId !== null && definition.latestPublishedVersionId === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["draftBaseVersionId"],
        message: "A draft base version requires a published version"
      });
    }
    if (
      definition.state === "draft" &&
      publicationPointerCount === 3 &&
      definition.draftBaseVersionId !== definition.latestPublishedVersionId
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["draftBaseVersionId"],
        message: "A next-version draft must use the latest immutable version as its base"
      });
    }
    if (definition.state === "versioned" && definition.draftBaseVersionId !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["draftBaseVersionId"],
        message: "A versioned definition cannot expose an editable draft base"
      });
    }
    if (
      definition.draftPresentation &&
      !presentationMatchesGraph(definition.draftGraph, definition.draftPresentation)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["draftPresentation", "nodes"],
        message: "Flow presentation node ids must exactly match the draft graph"
      });
    }
  });
export type FlowDefinitionV2 = z.infer<typeof flowDefinitionV2Schema>;

const flowDefinitionReadCommonShape = {
  id: uuidSchema,
  ownerUserId: uuidSchema,
  name: displayTitleSchema,
  state: flowDefinitionStateSchema,
  runtimeStatus: flowStatusSchema,
  approvalMode: flowApprovalModeSchema,
  revision: positiveRevisionSchema,
  draftBaseVersionId: uuidSchema.nullable(),
  latestPublishedVersionId: uuidSchema.nullable(),
  latestPublishedVersion: z.number().int().positive().nullable(),
  activeRunCount: z.number().int().min(0),
  createdAt: instantSchema,
  updatedAt: instantSchema,
  publishedAt: instantSchema.nullable()
} as const;

export const flowDefinitionSummaryV2Schema = z
  .object({
    schemaVersion: z.literal("flow-definition-summary.v2"),
    ...flowDefinitionReadCommonShape,
    graphSchemaVersion: z.literal("flow-graph.v2"),
    origin: flowDefinitionOriginV1Schema,
    /** Read-only gallery preview derived from the persisted draft graph. */
    graphNodeKinds: z.array(flowNodeKindV2Schema).min(1).max(64).optional()
  })
  .strict()
  .superRefine(refineFlowDefinitionReadLifecycle);
export type FlowDefinitionSummaryV2 = z.infer<typeof flowDefinitionSummaryV2Schema>;

export const flowDefinitionDetailV2Schema = z
  .object({
    schemaVersion: z.literal("flow-definition-detail.v2"),
    ...flowDefinitionReadCommonShape,
    graphSchemaVersion: z.literal("flow-graph.v2"),
    origin: flowDefinitionOriginV1Schema,
    draftGraph: flowGraphV2Schema,
    draftPresentation: flowPresentationV1Schema.nullable()
  })
  .strict()
  .superRefine((definition, context) => {
    refineFlowDefinitionReadLifecycle(definition, context);
    if (
      definition.draftPresentation &&
      !presentationMatchesGraph(definition.draftGraph, definition.draftPresentation)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["draftPresentation", "nodes"],
        message: "Flow presentation node ids must exactly match the draft graph"
      });
    }
  });
export type FlowDefinitionDetailV2 = z.infer<typeof flowDefinitionDetailV2Schema>;

export const listFlowDefinitionsV2QuerySchema = z
  .object({
    state: z.enum(["all", "draft", "versioned", "archived"]).optional().default("all"),
    runtimeStatus: z
      .enum(["all", ...flowStatusValues])
      .optional()
      .default("all"),
    limit: z.coerce.number().int().min(1).max(100).optional().default(50),
    offset: z.coerce.number().int().min(0).max(10_000).optional().default(0)
  })
  .strict();
export type ListFlowDefinitionsV2QueryInput = z.input<typeof listFlowDefinitionsV2QuerySchema>;
export type ListFlowDefinitionsV2Query = z.infer<typeof listFlowDefinitionsV2QuerySchema>;

export const listFlowDefinitionsV2ResponseSchema = z
  .object({
    schemaVersion: z.literal("flow-definition-list.v2"),
    flows: z.array(flowDefinitionSummaryV2Schema).max(100),
    total: z.number().int().min(0),
    runtime: flowRuntimeAvailabilitySchema
  })
  .strict()
  .superRefine((response, context) => {
    if (response.total < response.flows.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["total"],
        message: "Flow definition list total cannot be smaller than the returned page"
      });
    }
    const flowIds = response.flows.map((flow) => flow.id);
    if (new Set(flowIds).size !== flowIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["flows"],
        message: "Flow definition list cannot contain duplicate definitions"
      });
    }
  });
export type ListFlowDefinitionsV2Response = z.infer<typeof listFlowDefinitionsV2ResponseSchema>;

export const flowDefinitionTemplateAvailabilityValues = [
  "available",
  "unavailable"
] as const;
export const flowDefinitionTemplateAvailabilitySchema = z.enum(
  flowDefinitionTemplateAvailabilityValues
);
export type FlowDefinitionTemplateAvailability = z.infer<
  typeof flowDefinitionTemplateAvailabilitySchema
>;

export const flowDefinitionTemplateBlockerCodeValues = [
  "FLOW_TEMPLATE_CAPABILITY_UNAVAILABLE"
] as const;
export const flowDefinitionTemplateBlockerCodeSchema = z.enum(
  flowDefinitionTemplateBlockerCodeValues
);
export type FlowDefinitionTemplateBlockerCode = z.infer<
  typeof flowDefinitionTemplateBlockerCodeSchema
>;

export const flowDefinitionTemplateParameterV2Schema = z
  .object({
    key: stableIdSchema,
    kind: z.literal("product_ids"),
    required: z.boolean(),
    minimumItems: z.number().int().min(0).max(100),
    maximumItems: z.number().int().min(1).max(100)
  })
  .strict()
  .superRefine((parameter, context) => {
    if (parameter.minimumItems > parameter.maximumItems) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["minimumItems"],
        message: "Template parameter minimum cannot exceed its maximum"
      });
    }
  });
export type FlowDefinitionTemplateParameterV2 = z.infer<
  typeof flowDefinitionTemplateParameterV2Schema
>;

export const flowDefinitionTemplateDescriptorV2Schema = z
  .object({
    schemaVersion: z.literal("flow-definition-template.v2"),
    key: stableIdSchema,
    version: positiveRevisionSchema,
    name: displayTitleSchema,
    description: descriptionSchema,
    category: flowTemplateCategorySchema,
    availability: flowDefinitionTemplateAvailabilitySchema,
    recommendedApprovalMode: flowApprovalModeSchema,
    parameters: z.array(flowDefinitionTemplateParameterV2Schema).max(20),
    requiredCapabilities: z.array(capabilityKeySchema).max(50),
    blockerCode: flowDefinitionTemplateBlockerCodeSchema.nullable()
  })
  .strict()
  .superRefine((template, context) => {
    if ((template.availability === "available") !== (template.blockerCode === null)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["blockerCode"],
        message: "Template availability and blocker must agree"
      });
    }
    if (new Set(template.requiredCapabilities).size !== template.requiredCapabilities.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["requiredCapabilities"],
        message: "Template capability requirements must be unique"
      });
    }
  });
export type FlowDefinitionTemplateDescriptorV2 = z.infer<
  typeof flowDefinitionTemplateDescriptorV2Schema
>;

export const listFlowDefinitionTemplatesV2QuerySchema = z
  .object({ locale: flowLocaleSchema.optional().default("ru") })
  .strict();
export type ListFlowDefinitionTemplatesV2QueryInput = z.input<
  typeof listFlowDefinitionTemplatesV2QuerySchema
>;
export type ListFlowDefinitionTemplatesV2Query = z.infer<
  typeof listFlowDefinitionTemplatesV2QuerySchema
>;

export const listFlowDefinitionTemplatesV2ResponseSchema = z
  .object({
    schemaVersion: z.literal("flow-definition-template-catalog.v2"),
    catalogVersion: positiveRevisionSchema,
    locale: flowLocaleSchema,
    templates: z.array(flowDefinitionTemplateDescriptorV2Schema).max(100)
  })
  .strict()
  .superRefine((catalog, context) => {
    const identities = catalog.templates.map((template) => `${template.key}:${template.version}`);
    if (new Set(identities).size !== identities.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["templates"],
        message: "Template catalog identities must be unique"
      });
    }
  });
export type ListFlowDefinitionTemplatesV2Response = z.infer<
  typeof listFlowDefinitionTemplatesV2ResponseSchema
>;

const flowDefinitionTemplateParameterValueSchema = z.union([
  z.string().trim().min(1).max(500),
  z.number().finite(),
  z.boolean(),
  z.array(z.string().trim().min(1).max(500)).max(100)
]);
const flowDefinitionTemplateParametersSchema = z
  .record(stableIdSchema, flowDefinitionTemplateParameterValueSchema)
  .superRefine((parameters, context) => {
    if (Object.keys(parameters).length > 50) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Flow template parameters exceed the supported limit"
      });
    }
  });

export const createFlowDefinitionV2RequestSchema = z
  .object({
    schemaVersion: z.literal("flow-definition-create.v2"),
    name: displayTitleSchema,
    locale: flowLocaleSchema,
    approvalMode: flowApprovalModeSchema.optional().default("manual_approve"),
    source: z.discriminatedUnion("type", [
      z.object({ type: z.literal("blank") }).strict(),
      z
        .object({
          type: z.literal("template"),
          templateKey: stableIdSchema,
          templateVersion: positiveRevisionSchema,
          parameters: flowDefinitionTemplateParametersSchema
        })
        .strict()
    ])
  })
  .strict();
export type CreateFlowDefinitionV2RequestInput = z.input<
  typeof createFlowDefinitionV2RequestSchema
>;
export type CreateFlowDefinitionV2Request = z.infer<typeof createFlowDefinitionV2RequestSchema>;

export const updateFlowDefinitionDraftV2RequestSchema = z
  .object({
    expectedRevision: positiveRevisionSchema,
    name: displayTitleSchema.optional(),
    approvalMode: flowApprovalModeSchema.optional(),
    graph: flowGraphV2Schema.optional(),
    presentation: flowPresentationV1Schema.nullable().optional()
  })
  .strict()
  .superRefine((request, context) => {
    if (
      request.name === undefined &&
      request.approvalMode === undefined &&
      request.graph === undefined &&
      request.presentation === undefined
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Flow draft update requires at least one mutation field"
      });
    }
    if (
      request.graph &&
      request.presentation &&
      !presentationMatchesGraph(request.graph, request.presentation)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["presentation", "nodes"],
        message: "Flow presentation node ids must exactly match the request graph"
      });
    }
  });
export type UpdateFlowDefinitionDraftV2Request = z.infer<
  typeof updateFlowDefinitionDraftV2RequestSchema
>;

export const publishFlowDefinitionV2RequestSchema = z
  .object({
    expectedRevision: positiveRevisionSchema
  })
  .strict();
export type PublishFlowDefinitionV2Request = z.infer<typeof publishFlowDefinitionV2RequestSchema>;

export const createNextFlowDraftV2RequestSchema = z
  .object({
    expectedRevision: positiveRevisionSchema,
    baseVersionId: uuidSchema
  })
  .strict();
export type CreateNextFlowDraftV2Request = z.infer<typeof createNextFlowDraftV2RequestSchema>;

export const flowGraphV2CompileIssueSchema = flowDefinitionValidationIssueSchema
  .extend({ code: flowGraphV2CompileIssueCodeSchema })
  .strict();
export type FlowGraphV2CompileIssue = z.infer<typeof flowGraphV2CompileIssueSchema>;

export const flowDefinitionCommandRejectionSchema = z.discriminatedUnion("code", [
  z.object({ code: z.literal("FLOW_DEFINITION_NOT_FOUND") }).strict(),
  z
    .object({
      code: z.literal("FLOW_TEMPLATE_NOT_FOUND"),
      templateKey: stableIdSchema
    })
    .strict(),
  z
    .object({
      code: z.literal("FLOW_DRAFT_REVISION_CONFLICT"),
      expectedRevision: positiveRevisionSchema,
      currentRevision: positiveRevisionSchema
    })
    .strict(),
  z
    .object({
      code: z.literal("FLOW_DRAFT_NOT_EDITABLE"),
      state: flowDefinitionStateSchema
    })
    .strict(),
  z
    .object({
      code: z.literal("FLOW_NEXT_DRAFT_NOT_AVAILABLE"),
      state: flowDefinitionStateSchema
    })
    .strict(),
  z
    .object({
      code: z.literal("FLOW_NEXT_DRAFT_BASE_CONFLICT"),
      expectedBaseVersionId: uuidSchema,
      currentBaseVersionId: uuidSchema
    })
    .strict(),
  z.object({ code: z.literal("FLOW_IDEMPOTENCY_KEY_INVALID") }).strict(),
  z.object({ code: z.literal("FLOW_IDEMPOTENCY_KEY_REUSED") }).strict(),
  z.object({ code: z.literal("FLOW_IDEMPOTENCY_KEY_EXPIRED") }).strict(),
  z
    .object({
      code: z.literal("FLOW_TEMPLATE_VERSION_CONFLICT"),
      templateKey: stableIdSchema,
      requestedVersion: positiveRevisionSchema,
      currentVersion: positiveRevisionSchema
    })
    .strict(),
  z
    .object({
      code: z.literal("FLOW_TEMPLATE_NOT_AVAILABLE"),
      templateKey: stableIdSchema,
      reasonCode: flowDefinitionTemplateBlockerCodeSchema
    })
    .strict(),
  z
    .object({
      code: z.literal("FLOW_TEMPLATE_PARAMETERS_INVALID"),
      templateKey: stableIdSchema,
      parameterPaths: z.array(stableIdSchema).min(1).max(50)
    })
    .strict(),
  z.object({ code: z.literal("FLOW_DRAFT_MUTATION_INVALID") }).strict(),
  z
    .object({
      code: z.literal("FLOW_GRAPH_NOT_PUBLISHABLE"),
      issues: z.array(flowGraphV2CompileIssueSchema).max(2_000).readonly()
    })
    .strict()
]);
export type FlowDefinitionCommandRejection = z.infer<typeof flowDefinitionCommandRejectionSchema>;

export const flowDefinitionCommandRejectionResponseSchema = z
  .object({
    statusCode: z.union([z.literal(400), z.literal(404), z.literal(409), z.literal(422)]),
    body: flowDefinitionCommandRejectionSchema
  })
  .strict()
  .superRefine((response, context) => {
    const expectedStatus =
      response.body.code === "FLOW_IDEMPOTENCY_KEY_INVALID"
        ? 400
        : response.body.code === "FLOW_DEFINITION_NOT_FOUND" ||
            response.body.code === "FLOW_TEMPLATE_NOT_FOUND"
          ? 404
          : response.body.code === "FLOW_GRAPH_NOT_PUBLISHABLE" ||
              response.body.code === "FLOW_TEMPLATE_PARAMETERS_INVALID"
            ? 422
            : 409;
    if (response.statusCode !== expectedStatus) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["statusCode"],
        message: "Flow definition rejection code and response status must agree"
      });
    }
  });
export type FlowDefinitionCommandRejectionResponse = z.infer<
  typeof flowDefinitionCommandRejectionResponseSchema
>;

const flowPublishedVersionCommonShape = {
  id: uuidSchema,
  flowId: uuidSchema,
  version: z.number().int().positive(),
  sourceRevision: positiveRevisionSchema,
  status: z.literal("published"),
  approvalMode: flowApprovalModeSchema,
  graph: flowGraphV2Schema,
  presentation: flowPresentationV1Schema.nullable(),
  publishedAt: instantSchema
} as const;

export const flowPublishedVersionSchema = z
  .object({
    ...flowPublishedVersionCommonShape,
    capabilityManifest: flowCapabilityManifestV2Schema
  })
  .strict()
  .superRefine(refineFlowPublishedVersion);
export type FlowPublishedVersion = z.infer<typeof flowPublishedVersionSchema>;

export const publishFlowDefinitionResponseSchema = z
  .object({
    flow: flowDefinitionV2Schema,
    version: flowPublishedVersionSchema
  })
  .strict()
  .superRefine(refinePublishFlowDefinitionResponse);
export type PublishFlowDefinitionResponse = z.infer<typeof publishFlowDefinitionResponseSchema>;

function refineFlowPublishedVersion(
  version: {
    readonly graph: FlowGraphV2;
    readonly presentation: FlowPresentationV1 | null;
  },
  context: z.RefinementCtx
): void {
  if (version.presentation && !presentationMatchesGraph(version.graph, version.presentation)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["presentation", "nodes"],
      message: "Published presentation node ids must exactly match the version graph"
    });
  }
}

function refinePublishFlowDefinitionResponse(
  response: {
    readonly flow: FlowDefinitionV2;
    readonly version: FlowPublishedVersion;
  },
  context: z.RefinementCtx
): void {
  if (
    response.flow.id !== response.version.flowId ||
    response.flow.latestPublishedVersionId !== response.version.id ||
    response.flow.latestPublishedVersion !== response.version.version ||
    response.flow.publishedAt !== response.version.publishedAt
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["version"],
      message: "Published version must match the flow latest-version pointers"
    });
  }
  if (
    response.flow.state !== "versioned" ||
    response.flow.revision !== response.version.sourceRevision + 1 ||
    response.flow.approvalMode !== response.version.approvalMode ||
    !jsonValuesEqual(response.flow.draftGraph, response.version.graph) ||
    !jsonValuesEqual(response.flow.draftPresentation, response.version.presentation)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["version"],
      message: "Published version must be the exact immutable source-revision snapshot"
    });
  }
}

function refineFlowDefinitionReadLifecycle(
  definition: {
    state: FlowDefinitionState;
    draftBaseVersionId: string | null;
    latestPublishedVersionId: string | null;
    latestPublishedVersion: number | null;
    publishedAt: string | null;
  },
  context: z.RefinementCtx
): void {
  const publicationPointerCount = [
    definition.latestPublishedVersionId,
    definition.latestPublishedVersion,
    definition.publishedAt
  ].filter((value) => value !== null).length;
  if (publicationPointerCount !== 0 && publicationPointerCount !== 3) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["latestPublishedVersionId"],
      message: "Latest published version pointers must be returned together"
    });
  }
  if (definition.state === "versioned" && publicationPointerCount !== 3) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["state"],
      message: "A versioned flow definition requires a complete published-version pointer"
    });
  }
  if (definition.draftBaseVersionId !== null && definition.latestPublishedVersionId === null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["draftBaseVersionId"],
      message: "A draft base version requires a published version"
    });
  }
  if (
    definition.state === "draft" &&
    publicationPointerCount === 3 &&
    definition.draftBaseVersionId !== definition.latestPublishedVersionId
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["draftBaseVersionId"],
      message: "A next-version draft must use the latest immutable version as its base"
    });
  }
  if (definition.state === "versioned" && definition.draftBaseVersionId !== null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["draftBaseVersionId"],
      message: "A versioned definition cannot expose an editable draft base"
    });
  }
}

function presentationMatchesGraph(graph: FlowGraphV2, presentation: FlowPresentationV1): boolean {
  if (graph.nodes.length !== presentation.nodes.length) return false;
  const graphNodeIds = new Set(graph.nodes.map((node) => node.id));
  return presentation.nodes.every((node) => graphNodeIds.has(node.nodeId));
}

function jsonValuesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
