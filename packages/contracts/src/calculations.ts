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

export const calculationSnapshotObjectSchema = plainObjectSchema.pipe(
  z.record(z.string(), jsonValueSchema)
);

const parseIsoDate = (value: string): Date | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return parsed;
};

const isNotFutureIsoDate = (value: string): boolean => {
  const parsed = parseIsoDate(value);
  if (!parsed) return false;

  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  return parsed.getTime() <= todayUtc;
};

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => parseIsoDate(value) !== null, { message: "Invalid calendar date" })
  .refine(isNotFutureIsoDate, { message: "Date must not be in the future" });

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
    inputSnapshot: calculationSnapshotObjectSchema,
    manuallyOverridden: z.boolean()
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
export type CalculationParticipantResponse = z.infer<
  typeof calculationParticipantResponseSchema
>;

export const calculationVersionResponseSchema = z
  .object({
    id: uuidSchema,
    versionNumber: z.number().int().positive(),
    methodVersion: z.string().trim().min(1).max(120),
    settingsSnapshot: calculationSnapshotObjectSchema,
    inputSnapshot: calculationSnapshotObjectSchema,
    resultSnapshot: calculationSnapshotObjectSchema,
    resultSummary: calculationSnapshotObjectSchema,
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
