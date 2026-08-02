import { z } from "@elevenhouse/validation";

import { flowGraphSchema, type FlowGraph } from "./flows";

const uuidSchema = z.string().uuid();
const stableIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(/^[a-z0-9][a-z0-9_-]*$/);
const displayTitleSchema = z.string().trim().min(1).max(180);
const instructionsSchema = z.string().trim().min(1).max(4_000);
const versionOneSchema = z.literal(1);

export const FLOW_GRAPH_V2_MAX_NODES = 200;
export const FLOW_GRAPH_V2_MAX_EDGES = 400;

export const flowNodeKindV2Values = [
  "booking_confirmed",
  "manual_client",
  "birth_data_available",
  "astrologer_work_item",
  "astrologer_approval",
  "completed",
  "suppressed",
  "failed"
] as const;
export const flowNodeKindV2Schema = z.enum(flowNodeKindV2Values);
export type FlowNodeKindV2 = z.infer<typeof flowNodeKindV2Schema>;

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

export const flowWorkItemPriorityV2Values = ["low", "normal", "high", "urgent"] as const;
export const flowWorkItemPriorityV2Schema = z.enum(flowWorkItemPriorityV2Values);
export type FlowWorkItemPriorityV2 = z.infer<typeof flowWorkItemPriorityV2Schema>;

export const flowAstrologerWorkItemNodeV2Schema = z
  .object({
    ...nodeBaseShape,
    kind: z.literal("astrologer_work_item"),
    config: z
      .object({
        taskKind: z.literal("consultation_preparation"),
        taskTitle: displayTitleSchema,
        instructions: instructionsSchema.optional(),
        priority: flowWorkItemPriorityV2Schema
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
  flowBirthDataAvailableNodeV2Schema,
  flowAstrologerWorkItemNodeV2Schema,
  flowAstrologerApprovalNodeV2Schema,
  flowCompletedNodeV2Schema,
  flowSuppressedNodeV2Schema,
  flowFailedNodeV2Schema
]);
export type FlowNodeV2 = z.infer<typeof flowNodeV2Schema>;

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

export const flowGraphReadSchema = z.union([flowGraphSchema, flowGraphV2Schema]);
export type FlowGraphRead = FlowGraph | FlowGraphV2;

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
  "unterminated_path"
] as const;
export const flowGraphV2CompileIssueCodeSchema = z.enum(flowGraphV2CompileIssueCodeValues);
export type FlowGraphV2CompileIssueCode = z.infer<typeof flowGraphV2CompileIssueCodeSchema>;

export const flowCapabilityRequirementValues = [
  "bookings.events.booking_confirmed",
  "clients.birth_data.read.service_preparation",
  "products.read"
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

export const flowCapabilityManifestV1Schema = z
  .object({
    schemaVersion: z.literal("flow-capability-manifest.v1"),
    executionSemanticsVersion: z.literal("flow-interpreter.v1"),
    nodeExecutors: z.array(flowNodeExecutorRequirementSchema).max(FLOW_GRAPH_V2_MAX_NODES),
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
export type FlowCapabilityManifestV1 = z.infer<typeof flowCapabilityManifestV1Schema>;

export const flowDefinitionValidationIssueCodeValues = [
  ...flowGraphV2CompileIssueCodeValues,
  "migration_required"
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
  "FLOW_GRAPH_MIGRATION_REQUIRED",
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

export const validateFlowDefinitionResponseSchema = z
  .object({
    schemaVersion: z.literal("flow-definition-validation.v1"),
    graphSchemaVersion: z.enum(["flow-graph.v1", "flow-graph.v2"]),
    publishable: z.boolean(),
    activatable: z.boolean(),
    issues: z.array(flowDefinitionValidationIssueSchema).max(2_000),
    activationBlockers: z.array(flowActivationBlockerCodeSchema).max(10),
    normalizedGraph: flowGraphV2Schema.nullable(),
    capabilityManifest: flowCapabilityManifestV1Schema.nullable()
  })
  .strict()
  .superRefine((result, context) => {
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

    const issueCodes = new Set(result.issues.map((issue) => issue.code));
    const blockerCodes = new Set(result.activationBlockers);
    const isLegacyGraph = result.graphSchemaVersion === "flow-graph.v1";
    const hasMigrationIssue = issueCodes.has("migration_required");
    const hasMigrationBlocker = blockerCodes.has("FLOW_GRAPH_MIGRATION_REQUIRED");
    const hasNotPublishableBlocker = blockerCodes.has("FLOW_GRAPH_NOT_PUBLISHABLE");

    if (hasMigrationIssue !== isLegacyGraph) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["issues"],
        message: "Migration issues must agree with the graph schema version"
      });
    }
    if (hasMigrationBlocker !== isLegacyGraph) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["activationBlockers"],
        message: "Migration blockers must agree with the graph schema version"
      });
    }
    if (
      hasNotPublishableBlocker !==
      (result.graphSchemaVersion === "flow-graph.v2" && !result.publishable)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["activationBlockers"],
        message: "Graph publishability blockers must agree with V2 compilation"
      });
    }
    if (isLegacyGraph && result.issues.some((issue) => issue.code !== "migration_required")) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["issues"],
        message: "Legacy graph validation cannot report V2 compiler issues"
      });
    }
    if (isLegacyGraph && hasNormalizedGraph) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["normalizedGraph"],
        message: "Legacy v1 validation cannot return a compiled v2 graph"
      });
    }
  });
export type ValidateFlowDefinitionResponse = z.infer<typeof validateFlowDefinitionResponseSchema>;

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
