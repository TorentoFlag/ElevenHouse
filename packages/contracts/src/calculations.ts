import { z } from "@elevenhouse/validation";

const uuidSchema = z.string().uuid();
const dateTimeSchema = z.string().datetime();

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { readonly [key: string]: JsonValue };

const plainObjectSchema = z.custom<Record<string, unknown>>(
  (value) => isPlainObject(value),
  "Expected a plain JSON object"
);
const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    plainObjectSchema.pipe(z.record(z.string(), jsonValueSchema))
  ])
);

export const calculationJsonObjectSchema = plainObjectSchema.pipe(
  z.record(z.string(), jsonValueSchema)
);
export const sha256DigestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);

export const calculationModuleSchema = z.enum(["numerology", "chart", "matrix", "human_design"]);
export type CalculationModule = z.infer<typeof calculationModuleSchema>;

export const calculationModuleFilterSchema = z.enum([
  "all",
  "numerology",
  "chart",
  "matrix",
  "human_design"
]);
export type CalculationModuleFilter = z.infer<typeof calculationModuleFilterSchema>;

export const calculationModeSchema = z.enum(["individual", "compatibility"]);
export type CalculationMode = z.infer<typeof calculationModeSchema>;

export const chartInterpretationModeSchema = z.enum([
  "adult_natal",
  "child",
  "legacy_unclassified"
]);
export type ChartInterpretationMode = z.infer<typeof chartInterpretationModeSchema>;

export const calculationStatusSchema = z.enum(["calculated", "linked", "published", "archived"]);
export type CalculationStatus = z.infer<typeof calculationStatusSchema>;

export const calculationStatusFilterSchema = z.enum([
  "all",
  "calculated",
  "linked",
  "published",
  "archived"
]);
export type CalculationStatusFilter = z.infer<typeof calculationStatusFilterSchema>;

export const calculationParticipantRoleSchema = z.enum(["subject", "partner"]);
export type CalculationParticipantRole = z.infer<typeof calculationParticipantRoleSchema>;

export const calculationParticipantSourceSchema = z.enum(["crm_client", "manual"]);
export type CalculationParticipantSource = z.infer<typeof calculationParticipantSourceSchema>;

export const calculationClientVisibilitySchema = z.enum([
  "private_to_astrologer",
  "visible_to_client"
]);
export type CalculationClientVisibility = z.infer<typeof calculationClientVisibilitySchema>;

export const calculationInterpretationStatusSchema = z.enum(["draft", "approved"]);
export type CalculationInterpretationStatus = z.infer<typeof calculationInterpretationStatusSchema>;

export const calculationIdParamSchema = z
  .object({
    calculationId: uuidSchema
  })
  .strict();
export type CalculationIdParam = z.infer<typeof calculationIdParamSchema>;

export const calculationInterpretationIdParamSchema = z
  .object({
    calculationId: uuidSchema,
    interpretationId: uuidSchema
  })
  .strict();
export type CalculationInterpretationIdParam = z.infer<
  typeof calculationInterpretationIdParamSchema
>;

export const listCalculationsQuerySchema = z
  .object({
    module: calculationModuleFilterSchema.default("all"),
    status: calculationStatusFilterSchema.default("all"),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).default(0)
  })
  .strict();
export type ListCalculationsQuery = z.infer<typeof listCalculationsQuerySchema>;

export const calculationParticipantResponseSchema = z
  .object({
    role: calculationParticipantRoleSchema,
    source: calculationParticipantSourceSchema,
    clientId: uuidSchema.nullable(),
    displayName: z.string().trim().min(1).max(200)
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.source === "manual" && value.clientId !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["clientId"],
        message: "Manual participant clientId must be null"
      });
    }
    if (value.source === "crm_client" && value.clientId === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["clientId"],
        message: "CRM participant clientId is required"
      });
    }
  });
export type CalculationParticipantResponse = z.infer<typeof calculationParticipantResponseSchema>;

export const calculationClientLinkResponseSchema = z
  .object({
    clientId: uuidSchema,
    visibility: calculationClientVisibilitySchema,
    linkedAt: dateTimeSchema,
    publishedAt: dateTimeSchema.nullable()
  })
  .strict();
export type CalculationClientLinkResponse = z.infer<typeof calculationClientLinkResponseSchema>;

export const calculationInterpretationResponseSchema = z
  .object({
    id: uuidSchema,
    status: calculationInterpretationStatusSchema,
    text: z.string().trim().min(1)
  })
  .strict();
export type CalculationInterpretationResponse = z.infer<
  typeof calculationInterpretationResponseSchema
>;

export const calculationArtifactResponseSchema = z
  .object({
    id: uuidSchema,
    mediaAssetId: uuidSchema,
    artifactType: z.literal("pdf"),
    status: z.enum(["generating", "ready", "failed"])
  })
  .strict();
export type CalculationArtifactResponse = z.infer<typeof calculationArtifactResponseSchema>;

export const calculationRecordResponseSchema = z
  .object({
    id: uuidSchema,
    ownerUserId: uuidSchema,
    module: calculationModuleSchema,
    mode: calculationModeSchema,
    interpretationMode: chartInterpretationModeSchema.nullable(),
    methodCode: z.string().trim().min(1).max(80),
    title: z.string().trim().min(1).max(200),
    status: calculationStatusSchema,
    requestFingerprint: sha256DigestSchema,
    inputData: calculationJsonObjectSchema,
    resultData: calculationJsonObjectSchema,
    resultSummary: calculationJsonObjectSchema,
    resultChecksum: sha256DigestSchema,
    participants: z.array(calculationParticipantResponseSchema).min(1).max(2),
    links: z.array(calculationClientLinkResponseSchema),
    interpretations: z.array(calculationInterpretationResponseSchema),
    artifacts: z.array(calculationArtifactResponseSchema),
    createdAt: dateTimeSchema,
    updatedAt: dateTimeSchema
  })
  .strict();
export type CalculationRecordResponse = z.infer<typeof calculationRecordResponseSchema>;

export const listCalculationsResponseSchema = z
  .object({
    calculations: z.array(calculationRecordResponseSchema),
    total: z.number().int().min(0)
  })
  .strict();
export type ListCalculationsResponse = z.infer<typeof listCalculationsResponseSchema>;

export const linkCalculationClientRequestSchema = z
  .object({
    clientId: uuidSchema
  })
  .strict();
export type LinkCalculationClientRequest = z.infer<typeof linkCalculationClientRequestSchema>;

export const publishCalculationRequestSchema = z
  .object({
    clientId: uuidSchema,
    expectedResultChecksum: sha256DigestSchema
  })
  .strict();
export type PublishCalculationRequest = z.infer<typeof publishCalculationRequestSchema>;

export const saveCalculationInterpretationRequestSchema = z
  .object({
    text: z.string().trim().min(1).max(20_000),
    expectedResultChecksum: sha256DigestSchema
  })
  .strict();
export type SaveCalculationInterpretationRequest = z.infer<
  typeof saveCalculationInterpretationRequestSchema
>;

export const approveCalculationInterpretationRequestSchema = z.object({}).strict();
export type ApproveCalculationInterpretationRequest = z.infer<
  typeof approveCalculationInterpretationRequestSchema
>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
