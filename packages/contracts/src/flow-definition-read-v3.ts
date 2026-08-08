import { z } from "@elevenhouse/validation";

import { flowEnrollmentControlSchema } from "./flow-enrollment-control";
import { flowApprovalModeSchema, flowRuntimeAvailabilitySchema } from "./flows";
import {
  flowDefinitionOriginV1Schema,
  flowDefinitionStateSchema,
  flowGraphV2Schema,
  flowPresentationV1Schema
} from "./flows-v2";

const uuidSchema = z.string().uuid();
const instantSchema = z.string().datetime({ offset: true });
const positiveRevisionSchema = z.number().int().positive();
const displayTitleSchema = z.string().trim().min(1).max(180);

export const FLOW_DEFINITION_LIST_V3_MEDIA_TYPE =
  "application/vnd.elevenhouse.flow-definition-list.v3+json";
export const FLOW_DEFINITION_DETAIL_V3_MEDIA_TYPE =
  "application/vnd.elevenhouse.flow-definition-detail.v3+json";

export const flowDefinitionEnrollmentProjectionSchema = z
  .object({
    schemaVersion: z.literal("flow-enrollment-read-authority.v1"),
    authority: z.literal("enrollment_v1"),
    control: flowEnrollmentControlSchema
  })
  .strict();
export type FlowDefinitionEnrollmentProjection = z.infer<
  typeof flowDefinitionEnrollmentProjectionSchema
>;

const definitionReadCommonShape = {
  id: uuidSchema,
  ownerUserId: uuidSchema,
  name: displayTitleSchema,
  state: flowDefinitionStateSchema,
  approvalMode: flowApprovalModeSchema,
  revision: positiveRevisionSchema,
  draftBaseVersionId: uuidSchema.nullable(),
  latestPublishedVersionId: uuidSchema.nullable(),
  latestPublishedVersion: z.number().int().positive().nullable(),
  createdAt: instantSchema,
  updatedAt: instantSchema,
  publishedAt: instantSchema.nullable(),
  enrollment: flowDefinitionEnrollmentProjectionSchema
} as const;

export const flowDefinitionSummaryV3Schema = z
  .object({
    schemaVersion: z.literal("flow-definition-summary.v3"),
    ...definitionReadCommonShape,
    graphSchemaVersion: z.literal("flow-graph.v2"),
    origin: flowDefinitionOriginV1Schema
  })
  .strict()
  .superRefine(refineDefinitionRead);
export type FlowDefinitionSummaryV3 = z.infer<typeof flowDefinitionSummaryV3Schema>;

export const flowDefinitionDetailV3Schema = z
  .object({
    schemaVersion: z.literal("flow-definition-detail.v3"),
    ...definitionReadCommonShape,
    graphSchemaVersion: z.literal("flow-graph.v2"),
    origin: flowDefinitionOriginV1Schema,
    draftGraph: flowGraphV2Schema,
    draftPresentation: flowPresentationV1Schema.nullable()
  })
  .strict()
  .superRefine((definition, context) => {
    refineDefinitionRead(definition, context);
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
export type FlowDefinitionDetailV3 = z.infer<typeof flowDefinitionDetailV3Schema>;

export const flowDefinitionEnrollmentStateFilterValues = [
  "all",
  "inactive",
  "active",
  "paused"
] as const;
export const flowDefinitionEnrollmentStateFilterSchema = z.enum(
  flowDefinitionEnrollmentStateFilterValues
);
export type FlowDefinitionEnrollmentStateFilter = z.infer<
  typeof flowDefinitionEnrollmentStateFilterSchema
>;

export const listFlowDefinitionsV3QuerySchema = z
  .object({
    state: z.enum(["all", "draft", "versioned", "archived"]).optional().default("all"),
    enrollmentState: flowDefinitionEnrollmentStateFilterSchema.optional().default("all"),
    limit: z.coerce.number().int().min(1).max(100).optional().default(50),
    offset: z.coerce.number().int().min(0).max(10_000).optional().default(0)
  })
  .strict();
export type ListFlowDefinitionsV3QueryInput = z.input<typeof listFlowDefinitionsV3QuerySchema>;
export type ListFlowDefinitionsV3Query = z.infer<typeof listFlowDefinitionsV3QuerySchema>;

export const listFlowDefinitionsV3ResponseSchema = z
  .object({
    schemaVersion: z.literal("flow-definition-list.v3"),
    flows: z.array(flowDefinitionSummaryV3Schema).max(100),
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
export type ListFlowDefinitionsV3Response = z.infer<typeof listFlowDefinitionsV3ResponseSchema>;

function refineDefinitionRead(
  definition: {
    readonly id: string;
    readonly state: "draft" | "versioned" | "archived";
    readonly revision: number;
    readonly draftBaseVersionId: string | null;
    readonly latestPublishedVersionId: string | null;
    readonly latestPublishedVersion: number | null;
    readonly publishedAt: string | null;
    readonly enrollment: FlowDefinitionEnrollmentProjection;
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

  if (definition.enrollment.control.flowId !== definition.id) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["enrollment", "flowId"],
      message: "Enrollment authority must belong to the returned flow definition"
    });
  }
  if (definition.enrollment.control.definitionRevision !== definition.revision) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["enrollment", "control", "definitionRevision"],
      message: "Enrollment authority must pin the returned definition revision"
    });
  }
}

function presentationMatchesGraph(
  graph: { readonly nodes: readonly { readonly id: string }[] },
  presentation: { readonly nodes: readonly { readonly nodeId: string }[] }
): boolean {
  const graphNodeIds = graph.nodes.map((node) => node.id).sort();
  const presentationNodeIds = presentation.nodes.map((node) => node.nodeId).sort();
  return (
    graphNodeIds.length === presentationNodeIds.length &&
    graphNodeIds.every((nodeId, index) => nodeId === presentationNodeIds[index])
  );
}
