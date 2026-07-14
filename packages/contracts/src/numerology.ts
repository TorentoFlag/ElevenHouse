import { z } from "@elevenhouse/validation";
import {
  calculationModeSchema,
  calculationParticipantRoleSchema,
  calculationRecordResponseSchema
} from "./calculations";

const uuidSchema = z.string().uuid();

function parseIsoDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
    ? parsed
    : null;
}

function isNotFuture(value: string): boolean {
  const parsed = parseIsoDate(value);
  if (!parsed) return false;
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return parsed.getTime() <= today;
}

export const isoDateNotFutureSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => parseIsoDate(value) !== null, "Invalid calendar date")
  .refine(isNotFuture, "Date must not be in the future");
export type IsoDateNotFuture = z.infer<typeof isoDateNotFutureSchema>;

const isoCalendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => parseIsoDate(value) !== null, "Invalid calendar date");
const yearSchema = z.number().int().min(1).max(9999);

export const numerologyMethodCodeSchema = z.literal("pythagorean");
export type NumerologyMethodCode = z.infer<typeof numerologyMethodCodeSchema>;
export const createNumerologyMethodCodeSchema = numerologyMethodCodeSchema;
export type CreateNumerologyMethodCode = NumerologyMethodCode;
export const numerologyCalculationModeSchema = calculationModeSchema;
export type NumerologyCalculationMode = z.infer<typeof numerologyCalculationModeSchema>;

export const numerologyPeriodRequestSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("current_year") }).strict(),
  z
    .object({
      kind: z.literal("explicit"),
      personalYear: z.object({ year: yearSchema }).strict().optional(),
      personalMonths: z.object({ year: yearSchema }).strict().optional(),
      personalDay: z.object({ date: isoCalendarDateSchema }).strict().optional()
    })
    .strict()
    .superRefine((value, ctx) => {
      if (!value.personalYear && !value.personalMonths && !value.personalDay) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [],
          message: "Explicit period request requires at least one target"
        });
      }
    })
]);
export type NumerologyPeriodRequest = z.infer<typeof numerologyPeriodRequestSchema>;

const crmParticipantSchema = z
  .object({
    role: calculationParticipantRoleSchema,
    source: z.literal("crm_client"),
    clientId: uuidSchema
  })
  .strict();

const manualParticipantSchema = z
  .object({
    role: calculationParticipantRoleSchema,
    source: z.literal("manual"),
    clientId: z.null(),
    displayName: z.string().trim().min(1).max(200),
    calculationName: z.string().trim().min(1).max(200),
    calculationNameSource: z.literal("manual_entry"),
    birthDate: isoDateNotFutureSchema
  })
  .strict();

export const numerologyParticipantRequestSchema = z.discriminatedUnion("source", [
  crmParticipantSchema,
  manualParticipantSchema
]);
export type NumerologyParticipantRequest = z.infer<typeof numerologyParticipantRequestSchema>;

const commonRequestShape = {
  methodCode: numerologyMethodCodeSchema,
  periodRequest: numerologyPeriodRequestSchema
};

function individualRequestSchema(title: "none" | "required" | "optional") {
  return z
    .object({
      mode: z.literal("individual"),
      ...commonRequestShape,
      participants: z.tuple([numerologyParticipantRequestSchema]),
      ...(title === "required"
        ? { title: z.string().trim().min(1).max(200) }
        : title === "optional"
          ? { title: z.string().trim().min(1).max(200).optional() }
          : {})
    })
    .strict()
    .superRefine((value, ctx) => {
      if (value.participants[0].role !== "subject") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["participants", 0, "role"],
          message: "Individual numerology participant must be subject"
        });
      }
    });
}

function compatibilityRequestSchema(title: "none" | "required" | "optional") {
  return z
    .object({
      mode: z.literal("compatibility"),
      ...commonRequestShape,
      participants: z.tuple([
        numerologyParticipantRequestSchema,
        numerologyParticipantRequestSchema
      ]),
      ...(title === "required"
        ? { title: z.string().trim().min(1).max(200) }
        : title === "optional"
          ? { title: z.string().trim().min(1).max(200).optional() }
          : {})
    })
    .strict()
    .superRefine((value, ctx) => {
      const [first, second] = value.participants;
      if (first.role !== "subject" || second.role !== "partner") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["participants"],
          message: "Compatibility numerology requires ordered subject and partner roles"
        });
      }
      if (
        first.source === "crm_client" &&
        second.source === "crm_client" &&
        first.clientId === second.clientId
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["participants", 1, "clientId"],
          message: "Compatibility numerology requires two distinct CRM clients"
        });
      }
    });
}

export const previewNumerologyRequestSchema = z.discriminatedUnion("mode", [
  individualRequestSchema("none"),
  compatibilityRequestSchema("none")
]);
export type PreviewNumerologyRequest = z.infer<typeof previewNumerologyRequestSchema>;

export const persistNumerologyCalculationRequestSchema = z.discriminatedUnion("mode", [
  individualRequestSchema("required"),
  compatibilityRequestSchema("required")
]);
export type PersistNumerologyCalculationRequest = z.infer<
  typeof persistNumerologyCalculationRequestSchema
>;

export const recalculateNumerologyCalculationRequestSchema = z.discriminatedUnion("mode", [
  individualRequestSchema("optional"),
  compatibilityRequestSchema("optional")
]);
export type RecalculateNumerologyCalculationRequest = z.infer<
  typeof recalculateNumerologyCalculationRequestSchema
>;

export const createNumerologyCalculationRequestSchema = persistNumerologyCalculationRequestSchema;
export type CreateNumerologyCalculationRequest = PersistNumerologyCalculationRequest;

export const createNumerologyAiDraftRequestSchema = z.object({}).strict();
export type CreateNumerologyAiDraftRequest = z.infer<typeof createNumerologyAiDraftRequestSchema>;

const calculationNameSourceSchema = z.enum(["crm_display_name", "manual_entry"]);
const numerologyParticipantResultSchema = z
  .object({
    calculationName: z.string().trim().min(1).max(200),
    calculationNameSource: calculationNameSourceSchema,
    birthDate: isoDateNotFutureSchema
  })
  .strict();
const keyNumbersSchema = z
  .object({
    lifePath: z.number().int().min(0).max(33),
    birthday: z.number().int().min(0).max(33),
    expression: z.number().int().min(0).max(33),
    soul: z.number().int().min(0).max(33),
    personality: z.number().int().min(0).max(33)
  })
  .strict();
const periodNumbersSchema = z
  .object({
    personalYear: z
      .object({ year: yearSchema, value: z.number().int().min(0).max(33) })
      .strict()
      .optional(),
    personalMonths: z
      .array(
        z
          .object({
            year: yearSchema,
            month: z.number().int().min(1).max(12),
            value: z.number().int().min(0).max(33)
          })
          .strict()
      )
      .length(12)
      .optional(),
    personalDay: z
      .object({ date: isoCalendarDateSchema, value: z.number().int().min(0).max(33) })
      .strict()
      .optional()
  })
  .strict();
const digitSchema = z.enum(["1", "2", "3", "4", "5", "6", "7", "8", "9"]);
const psychomatrixCellsSchema = z
  .object({
    "1": z.string().regex(/^1*$/),
    "2": z.string().regex(/^2*$/),
    "3": z.string().regex(/^3*$/),
    "4": z.string().regex(/^4*$/),
    "5": z.string().regex(/^5*$/),
    "6": z.string().regex(/^6*$/),
    "7": z.string().regex(/^7*$/),
    "8": z.string().regex(/^8*$/),
    "9": z.string().regex(/^9*$/)
  })
  .strict();
const psychomatrixSchema = z
  .object({
    sourceDigits: z.array(z.number().int().min(0).max(9)).length(8),
    workingNumbers: z
      .object({
        first: z.number().int().min(0),
        second: z.number().int().min(0),
        third: z.number().int().min(0),
        fourth: z.number().int().min(0)
      })
      .strict(),
    cells: psychomatrixCellsSchema
  })
  .strict();
const strengthLineSchema = z
  .object({
    code: z.string().trim().min(1),
    label: z.string().trim().min(1),
    cells: z.array(digitSchema).length(3),
    value: z.number().int().min(0),
    level: z.enum(["absent", "weak", "moderate", "expressed", "strong"]),
    levelLabel: z.string().trim().min(1)
  })
  .strict();

export const pythagoreanIndividualResultSchema = z
  .object({
    methodCode: z.literal("pythagorean"),
    mode: z.literal("individual"),
    participant: numerologyParticipantResultSchema,
    keyNumbers: keyNumbersSchema,
    periods: periodNumbersSchema,
    psychomatrix: psychomatrixSchema,
    strengthLines: z.array(strengthLineSchema).length(8)
  })
  .strict();
export type PythagoreanIndividualResult = z.infer<typeof pythagoreanIndividualResultSchema>;

export const numerologyRelationSchema = z.enum(["match", "close", "different", "tension"]);
export type NumerologyRelation = z.infer<typeof numerologyRelationSchema>;

export const numerologyRelationCountsSchema = z
  .object({
    match: z.number().int().min(0),
    close: z.number().int().min(0),
    different: z.number().int().min(0),
    tension: z.number().int().min(0)
  })
  .strict();
export type NumerologyRelationCounts = z.infer<typeof numerologyRelationCountsSchema>;

export const numerologyComparisonSchema = z
  .object({
    block: z.enum(["key_numbers", "psychomatrix", "strength_lines"]),
    code: z.string().trim().min(1),
    valueA: z.number().int().min(0),
    valueB: z.number().int().min(0),
    difference: z.number().int().min(0),
    relation: numerologyRelationSchema,
    explanation: z.string().trim().min(1)
  })
  .strict();
export type NumerologyComparison = z.infer<typeof numerologyComparisonSchema>;

export const numerologyCompatibilityZoneSchema = z
  .object({
    code: z.enum(["identity", "inner_world", "resources", "dynamics"]),
    comparisonCodes: z.array(z.string().trim().min(1)).min(1),
    counts: numerologyRelationCountsSchema,
    relation: numerologyRelationSchema,
    explanation: z.string().trim().min(1)
  })
  .strict();
export type NumerologyCompatibilityZone = z.infer<typeof numerologyCompatibilityZoneSchema>;

export const numerologyCompatibilityConclusionSchema = z
  .object({
    code: z.enum(["harmonious", "mixed", "attention"]),
    matchAndClose: z.number().int().min(0),
    differentAndTension: z.number().int().min(0),
    tension: z.number().int().min(0),
    explanation: z.string().trim().min(1)
  })
  .strict();
export type NumerologyCompatibilityConclusion = z.infer<
  typeof numerologyCompatibilityConclusionSchema
>;

export const pythagoreanCompatibilityResultSchema = z
  .object({
    methodCode: z.literal("pythagorean"),
    mode: z.literal("compatibility"),
    participants: z
      .object({
        first: numerologyParticipantResultSchema,
        second: numerologyParticipantResultSchema
      })
      .strict(),
    individuals: z.tuple([pythagoreanIndividualResultSchema, pythagoreanIndividualResultSchema]),
    pairNumber: z.number().int().min(0).max(33),
    comparisons: z.array(numerologyComparisonSchema).length(22),
    zones: z.array(numerologyCompatibilityZoneSchema).length(4),
    counts: z
      .object({
        key_numbers: numerologyRelationCountsSchema,
        psychomatrix: numerologyRelationCountsSchema,
        strength_lines: numerologyRelationCountsSchema,
        total: numerologyRelationCountsSchema
      })
      .strict(),
    conclusion: numerologyCompatibilityConclusionSchema
  })
  .strict();
export type PythagoreanCompatibilityResult = z.infer<typeof pythagoreanCompatibilityResultSchema>;

export const numerologyResultSchema = z.discriminatedUnion("mode", [
  pythagoreanIndividualResultSchema,
  pythagoreanCompatibilityResultSchema
]);
export type NumerologyResult = z.infer<typeof numerologyResultSchema>;

export const numerologyPreviewResponseSchema = z
  .object({ result: numerologyResultSchema })
  .strict();
export type NumerologyPreviewResponse = z.infer<typeof numerologyPreviewResponseSchema>;

const numerologyCalculationRecordResponseSchema = calculationRecordResponseSchema.extend({
  module: z.literal("numerology"),
  methodCode: z.literal("pythagorean")
});

export const numerologyCalculationResponseSchema = z
  .object({
    calculation: numerologyCalculationRecordResponseSchema,
    result: numerologyResultSchema
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.calculation.mode !== value.result.mode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["result", "mode"],
        message: "Numerology result mode must match calculation mode"
      });
    }
    if (value.calculation.methodCode !== value.result.methodCode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["result", "methodCode"],
        message: "Numerology result method must match calculation method"
      });
    }
    if (!deepEqual(value.calculation.resultData, value.result)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["result"],
        message: "Numerology result must equal calculation resultData"
      });
    }
  });
export type NumerologyCalculationResponse = z.infer<typeof numerologyCalculationResponseSchema>;

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
