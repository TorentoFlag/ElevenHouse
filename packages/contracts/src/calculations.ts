import { z } from "@elevenhouse/validation";

const uuidSchema = z.string().uuid();
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const dateTimeSchema = z.string().datetime();
const snapshotObjectSchema = z.record(z.string(), z.unknown());

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

export const calculationInterpretationSourceSchema = z.enum(["ai", "manual"]);
export type CalculationInterpretationSource = z.infer<
  typeof calculationInterpretationSourceSchema
>;

export const calculationInterpretationStatusSchema = z.enum(["draft", "approved"]);
export type CalculationInterpretationStatus = z.infer<
  typeof calculationInterpretationStatusSchema
>;

export const calculationIdParamSchema = z
  .object({
    calculationId: uuidSchema
  })
  .strict();
export type CalculationIdParam = z.infer<typeof calculationIdParamSchema>;

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
    displayName: z.string().trim().min(1).max(200),
    birthDate: dateSchema.nullable(),
    inputSnapshot: snapshotObjectSchema,
    manuallyOverridden: z.boolean()
  })
  .strict();
export type CalculationParticipantResponse = z.infer<
  typeof calculationParticipantResponseSchema
>;

export const calculationVersionResponseSchema = z
  .object({
    id: uuidSchema,
    versionNumber: z.number().int().positive(),
    methodVersion: z.string().trim().min(1).max(120),
    settingsSnapshot: snapshotObjectSchema,
    inputSnapshot: snapshotObjectSchema,
    resultSnapshot: snapshotObjectSchema,
    resultSummary: snapshotObjectSchema,
    resultChecksum: z.string().trim().min(1).max(256),
    createdAt: dateTimeSchema
  })
  .strict();
export type CalculationVersionResponse = z.infer<typeof calculationVersionResponseSchema>;

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
    versionId: uuidSchema,
    source: calculationInterpretationSourceSchema,
    status: calculationInterpretationStatusSchema,
    text: z.string().trim().min(1),
    modelId: z.string().trim().min(1).max(120).nullable(),
    promptVersion: z.string().trim().min(1).max(120).nullable(),
    approvedAt: dateTimeSchema.nullable()
  })
  .strict();
export type CalculationInterpretationResponse = z.infer<
  typeof calculationInterpretationResponseSchema
>;

export const calculationArtifactResponseSchema = z
  .object({
    id: uuidSchema,
    versionId: uuidSchema,
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
    methodCode: z.string().trim().min(1).max(80),
    currentMethodVersion: z.string().trim().min(1).max(120),
    title: z.string().trim().min(1).max(200),
    status: calculationStatusSchema,
    participants: z.array(calculationParticipantResponseSchema).min(1).max(2),
    versions: z.array(calculationVersionResponseSchema).min(1),
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
