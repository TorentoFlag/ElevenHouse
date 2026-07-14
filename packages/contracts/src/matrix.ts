import { z } from "@elevenhouse/validation";
import { calculationRecordResponseSchema } from "./calculations";
import { isoDateNotFutureSchema } from "./numerology";

const uuidSchema = z.string().uuid();
const sha256DigestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const isoCalendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => isIsoCalendarDate(value), "Invalid calendar date");
const forecastYearSchema = z.number().int().min(1900).max(2200);

export const matrixMethodCodeSchema = z.literal("ladini_22");
export type MatrixMethodCode = z.infer<typeof matrixMethodCodeSchema>;
export const matrixEngineRevisionSchema = z.literal(1);
export type MatrixEngineRevision = z.infer<typeof matrixEngineRevisionSchema>;
export const matrixInterpretationRevisionSchema = z.literal(1);
export type MatrixInterpretationRevision = z.infer<typeof matrixInterpretationRevisionSchema>;
export const matrixArcanaSchema = z.number().int().min(1).max(22);
export type MatrixArcana = z.infer<typeof matrixArcanaSchema>;

export const matrixPointCodeSchema = z.enum([
  "A",
  "B",
  "C",
  "D",
  "E",
  "tl",
  "tr",
  "br",
  "bl",
  "A1",
  "B1",
  "C1",
  "D1",
  "tl1",
  "tr1",
  "br1",
  "bl1"
]);
export type MatrixPointCode = z.infer<typeof matrixPointCodeSchema>;

const subjectRequestSchema = z
  .object({
    role: z.literal("subject"),
    source: z.literal("crm_client"),
    clientId: uuidSchema
  })
  .strict();
const partnerRequestSchema = z
  .object({
    role: z.literal("partner"),
    source: z.literal("crm_client"),
    clientId: uuidSchema
  })
  .strict();

export const matrixParticipantRequestSchema = z.discriminatedUnion("role", [
  subjectRequestSchema,
  partnerRequestSchema
]);
export type MatrixParticipantRequest = z.infer<typeof matrixParticipantRequestSchema>;

export const matrixProjectionRequestSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("none") }).strict(),
  z.object({ kind: z.literal("current_year") }).strict(),
  z.object({ kind: z.literal("explicit_year"), year: forecastYearSchema }).strict()
]);
export type MatrixProjectionRequest = z.infer<typeof matrixProjectionRequestSchema>;

const individualPreviewRequestSchema = z
  .object({
    methodCode: matrixMethodCodeSchema,
    mode: z.literal("individual"),
    participants: z.tuple([subjectRequestSchema]),
    projection: matrixProjectionRequestSchema.optional().default({ kind: "none" })
  })
  .strict();
const compatibilityPreviewRequestSchema = z
  .object({
    methodCode: matrixMethodCodeSchema,
    mode: z.literal("compatibility"),
    participants: z.tuple([subjectRequestSchema, partnerRequestSchema]),
    projection: z
      .object({ kind: z.literal("none") })
      .strict()
      .optional()
      .default({ kind: "none" })
  })
  .strict()
  .superRefine(requireDistinctClients);

export const previewMatrixRequestSchema = z.discriminatedUnion("mode", [
  individualPreviewRequestSchema,
  compatibilityPreviewRequestSchema
]);
export type PreviewMatrixRequest = z.infer<typeof previewMatrixRequestSchema>;

const individualPersistRequestSchema = z
  .object({
    methodCode: matrixMethodCodeSchema,
    mode: z.literal("individual"),
    participants: z.tuple([subjectRequestSchema])
  })
  .strict();
const compatibilityPersistRequestSchema = z
  .object({
    methodCode: matrixMethodCodeSchema,
    mode: z.literal("compatibility"),
    participants: z.tuple([subjectRequestSchema, partnerRequestSchema])
  })
  .strict()
  .superRefine(requireDistinctClients);

export const persistMatrixCalculationRequestSchema = z.discriminatedUnion("mode", [
  individualPersistRequestSchema,
  compatibilityPersistRequestSchema
]);
export type PersistMatrixCalculationRequest = z.infer<typeof persistMatrixCalculationRequestSchema>;

export const recalculateMatrixCalculationRequestSchema = z.object({}).strict();
export type RecalculateMatrixCalculationRequest = z.infer<
  typeof recalculateMatrixCalculationRequestSchema
>;

export const matrixProjectionQuerySchema = z
  .object({ year: z.coerce.number().int().min(1900).max(2200) })
  .strict();
export type MatrixProjectionQuery = z.infer<typeof matrixProjectionQuerySchema>;

export const matrixPointsSchema = z
  .object({
    A: matrixArcanaSchema,
    B: matrixArcanaSchema,
    C: matrixArcanaSchema,
    D: matrixArcanaSchema,
    E: matrixArcanaSchema,
    tl: matrixArcanaSchema,
    tr: matrixArcanaSchema,
    br: matrixArcanaSchema,
    bl: matrixArcanaSchema,
    A1: matrixArcanaSchema,
    B1: matrixArcanaSchema,
    C1: matrixArcanaSchema,
    D1: matrixArcanaSchema,
    tl1: matrixArcanaSchema,
    tr1: matrixArcanaSchema,
    br1: matrixArcanaSchema,
    bl1: matrixArcanaSchema
  })
  .strict();
export type MatrixPoints = z.infer<typeof matrixPointsSchema>;

export const matrixPurposesSchema = z
  .object({
    earth: matrixArcanaSchema,
    sky: matrixArcanaSchema,
    male: matrixArcanaSchema,
    female: matrixArcanaSchema,
    personal: matrixArcanaSchema,
    social: matrixArcanaSchema,
    spiritual: matrixArcanaSchema
  })
  .strict();
export type MatrixPurposes = z.infer<typeof matrixPurposesSchema>;

export const matrixZonesSchema = z
  .object({
    purpose: matrixArcanaSchema,
    money: matrixArcanaSchema,
    love: matrixArcanaSchema,
    energy: matrixArcanaSchema
  })
  .strict();
export type MatrixZones = z.infer<typeof matrixZonesSchema>;

export const matrixEnergyRowCodeSchema = z.enum([
  "sahasrara",
  "ajna",
  "vishuddha",
  "anahata",
  "manipura",
  "svadhisthana",
  "muladhara"
]);
export type MatrixEnergyRowCode = z.infer<typeof matrixEnergyRowCodeSchema>;

export const matrixEnergyRowSchema = z
  .object({
    code: matrixEnergyRowCodeSchema,
    physical: matrixArcanaSchema,
    energy: matrixArcanaSchema,
    emotions: matrixArcanaSchema
  })
  .strict();
export type MatrixEnergyRow = z.infer<typeof matrixEnergyRowSchema>;

const energyRowFor = (code: MatrixEnergyRowCode) =>
  matrixEnergyRowSchema.extend({ code: z.literal(code) });

export const matrixEnergyMapSchema = z
  .object({
    rows: z.tuple([
      energyRowFor("sahasrara"),
      energyRowFor("ajna"),
      energyRowFor("vishuddha"),
      energyRowFor("anahata"),
      energyRowFor("manipura"),
      energyRowFor("svadhisthana"),
      energyRowFor("muladhara")
    ]),
    totals: z
      .object({
        physical: matrixArcanaSchema,
        energy: matrixArcanaSchema,
        emotions: matrixArcanaSchema
      })
      .strict()
  })
  .strict();
export type MatrixEnergyMap = z.infer<typeof matrixEnergyMapSchema>;

export const matrixDataSchema = z
  .object({
    points: matrixPointsSchema,
    purposes: matrixPurposesSchema,
    zones: matrixZonesSchema,
    energyMap: matrixEnergyMapSchema
  })
  .strict();
export type MatrixData = z.infer<typeof matrixDataSchema>;

export const matrixParticipantSnapshotSchema = z
  .object({
    displayName: z.string().trim().min(1).max(200),
    birthDate: isoDateNotFutureSchema
  })
  .strict();
export type MatrixParticipantSnapshot = z.infer<typeof matrixParticipantSnapshotSchema>;

const matrixResultCommonShape = {
  methodCode: matrixMethodCodeSchema,
  engineRevision: matrixEngineRevisionSchema,
  interpretationRevision: matrixInterpretationRevisionSchema
};

export const matrixIndividualBaseResultSchema = z
  .object({
    ...matrixResultCommonShape,
    mode: z.literal("individual"),
    participant: matrixParticipantSnapshotSchema,
    matrix: matrixDataSchema
  })
  .strict();
export type MatrixIndividualBaseResult = z.infer<typeof matrixIndividualBaseResultSchema>;

export const matrixCompatibilityBaseResultSchema = z
  .object({
    ...matrixResultCommonShape,
    mode: z.literal("compatibility"),
    participants: z
      .object({
        first: matrixParticipantSnapshotSchema,
        second: matrixParticipantSnapshotSchema
      })
      .strict(),
    individuals: z.tuple([matrixIndividualBaseResultSchema, matrixIndividualBaseResultSchema]),
    composite: matrixDataSchema
  })
  .strict();
export type MatrixCompatibilityBaseResult = z.infer<typeof matrixCompatibilityBaseResultSchema>;

export const matrixBaseResultSchema = z.discriminatedUnion("mode", [
  matrixIndividualBaseResultSchema,
  matrixCompatibilityBaseResultSchema
]);
export type MatrixBaseResult = z.infer<typeof matrixBaseResultSchema>;

export const matrixAgeCycleSchema = z
  .object({
    age: z.number().int().min(0),
    cycleAge: z.number().int().min(0).max(79),
    decadeIndex: z.number().int().min(0).max(7),
    pointCode: z.enum(["A", "tl", "B", "tr", "C", "br", "D", "bl"]),
    arcana: matrixArcanaSchema
  })
  .strict();
export type MatrixAgeCycle = z.infer<typeof matrixAgeCycleSchema>;

export const matrixYearForecastSchema = z
  .object({
    year: forecastYearSchema,
    personalYear: matrixArcanaSchema,
    challenge: matrixArcanaSchema,
    resource: matrixArcanaSchema
  })
  .strict();
export type MatrixYearForecast = z.infer<typeof matrixYearForecastSchema>;

export const matrixDerivedProjectionSchema = z
  .object({
    methodCode: matrixMethodCodeSchema,
    engineRevision: matrixEngineRevisionSchema,
    timezone: z.string().trim().min(1).max(120),
    currentDate: isoCalendarDateSchema,
    participant: matrixParticipantSnapshotSchema,
    ageCycle: matrixAgeCycleSchema,
    yearForecast: matrixYearForecastSchema
  })
  .strict();
export type MatrixDerivedProjection = z.infer<typeof matrixDerivedProjectionSchema>;

export const matrixPreviewResponseSchema = z
  .object({
    result: matrixBaseResultSchema,
    projection: matrixDerivedProjectionSchema.nullable()
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.result.mode === "compatibility" && value.projection !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["projection"],
        message: "Compatibility Matrix preview cannot include a projection"
      });
    }
  });
export type MatrixPreviewResponse = z.infer<typeof matrixPreviewResponseSchema>;

export const matrixProjectionResponseSchema = z
  .object({
    calculationId: uuidSchema,
    resultChecksum: sha256DigestSchema,
    projection: matrixDerivedProjectionSchema
  })
  .strict();
export type MatrixProjectionResponse = z.infer<typeof matrixProjectionResponseSchema>;

const matrixCalculationParticipantInputSchema = z
  .object({
    role: z.enum(["subject", "partner"]),
    clientId: uuidSchema,
    displayName: z.string().trim().min(1).max(200),
    birthDate: isoDateNotFutureSchema
  })
  .strict();

const matrixIndividualCalculationInputSchema = z
  .object({
    methodCode: matrixMethodCodeSchema,
    engineRevision: matrixEngineRevisionSchema,
    mode: z.literal("individual"),
    participants: z.tuple([
      matrixCalculationParticipantInputSchema.extend({ role: z.literal("subject") })
    ])
  })
  .strict();
const matrixCompatibilityCalculationInputSchema = z
  .object({
    methodCode: matrixMethodCodeSchema,
    engineRevision: matrixEngineRevisionSchema,
    mode: z.literal("compatibility"),
    participants: z.tuple([
      matrixCalculationParticipantInputSchema.extend({ role: z.literal("subject") }),
      matrixCalculationParticipantInputSchema.extend({ role: z.literal("partner") })
    ])
  })
  .strict()
  .superRefine(requireDistinctClients);

export const matrixCalculationInputSchema = z.discriminatedUnion("mode", [
  matrixIndividualCalculationInputSchema,
  matrixCompatibilityCalculationInputSchema
]);
export type MatrixCalculationInput = z.infer<typeof matrixCalculationInputSchema>;

const matrixCalculationRecordResponseSchema = calculationRecordResponseSchema.extend({
  module: z.literal("matrix"),
  methodCode: matrixMethodCodeSchema
});

export const matrixCalculationResponseSchema = z
  .object({
    calculation: matrixCalculationRecordResponseSchema,
    result: matrixBaseResultSchema
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.calculation.mode !== value.result.mode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["result", "mode"],
        message: "Matrix result mode must match calculation mode"
      });
    }
    if (value.calculation.methodCode !== value.result.methodCode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["result", "methodCode"],
        message: "Matrix result method must match calculation method"
      });
    }
    if (!deepEqual(value.calculation.resultData, value.result)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["result"],
        message: "Matrix result must equal calculation resultData"
      });
    }
  });
export type MatrixCalculationResponse = z.infer<typeof matrixCalculationResponseSchema>;

function requireDistinctClients(
  value: {
    readonly participants: readonly [{ readonly clientId: string }, { readonly clientId: string }];
  },
  ctx: z.RefinementCtx
): void {
  if (value.participants[0].clientId === value.participants[1].clientId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["participants", 1, "clientId"],
      message: "Compatibility Matrix requires two distinct CRM clients"
    });
  }
}

function deepEqual(first: unknown, second: unknown): boolean {
  if (Object.is(first, second)) return true;
  if (Array.isArray(first) || Array.isArray(second)) {
    return (
      Array.isArray(first) &&
      Array.isArray(second) &&
      first.length === second.length &&
      first.every((item, index) => deepEqual(item, second[index]))
    );
  }
  if (!isPlainObject(first) || !isPlainObject(second)) return false;
  const firstKeys = Object.keys(first).sort();
  const secondKeys = Object.keys(second).sort();
  return (
    deepEqual(firstKeys, secondKeys) && firstKeys.every((key) => deepEqual(first[key], second[key]))
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isIsoCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}
