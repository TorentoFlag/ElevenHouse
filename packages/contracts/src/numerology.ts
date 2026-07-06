import { z } from "@elevenhouse/validation";
import {
  calculationSnapshotObjectSchema,
  calculationModeSchema,
  calculationParticipantRoleSchema,
  calculationParticipantSourceSchema,
  calculationRecordResponseSchema,
  calculationVersionResponseSchema
} from "./calculations";

const uuidSchema = z.string().uuid();

const isValidIsoDate = (value: string): boolean => parseIsoDate(value) !== null;

const isNotFutureIsoDate = (value: string): boolean => {
  const parsed = parseIsoDate(value);
  if (!parsed) return false;

  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  return parsed.getTime() <= todayUtc;
};

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

export const numerologyMethodCodeSchema = z.enum([
  "pythagorean",
  "vedic",
  "kabbalistic",
  "author"
]);
export type NumerologyMethodCode = z.infer<typeof numerologyMethodCodeSchema>;

export const createNumerologyMethodCodeSchema = z.literal("pythagorean");
export type CreateNumerologyMethodCode = z.infer<typeof createNumerologyMethodCodeSchema>;

export const numerologyCalculationModeSchema = calculationModeSchema;
export type NumerologyCalculationMode = z.infer<typeof numerologyCalculationModeSchema>;

export const isoDateNotFutureSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(isValidIsoDate, { message: "Invalid calendar date" })
  .refine(isNotFutureIsoDate, { message: "Date must not be in the future" });
export type IsoDateNotFuture = z.infer<typeof isoDateNotFutureSchema>;

export const masterNumberSchema = z.union([z.literal(11), z.literal(22), z.literal(33)]);
export type MasterNumber = z.infer<typeof masterNumberSchema>;

export const masterNumberSettingsSchema = z.discriminatedUnion("mode", [
  z
    .object({
      mode: z.literal("reduce_all")
    })
    .strict(),
  z
    .object({
      mode: z.literal("preserve_all")
    })
    .strict(),
  z
    .object({
      mode: z.literal("preserve_selected"),
      values: z.array(masterNumberSchema).min(1).max(3)
    })
    .strict()
]);
export type MasterNumberSettings = z.infer<typeof masterNumberSettingsSchema>;

export const nameNormalizationSettingsSchema = z
  .object({
    yoPolicy: z.enum(["separate", "as_e"]),
    shortIPolicy: z.enum(["separate", "as_i"])
  })
  .strict();
export type NameNormalizationSettings = z.infer<typeof nameNormalizationSettingsSchema>;

export const pythagoreanSettingsSchema = z
  .object({
    masterNumbers: masterNumberSettingsSchema,
    nameNormalization: nameNormalizationSettingsSchema,
    includeNameNumbers: z.boolean(),
    includePsychomatrix: z.boolean(),
    includeStrengthLines: z.boolean(),
    forecastDate: isoDateNotFutureSchema.optional()
  })
  .strict();
export type PythagoreanSettings = z.infer<typeof pythagoreanSettingsSchema>;

export const numerologyParticipantRequestSchema = z
  .object({
    role: calculationParticipantRoleSchema,
    source: calculationParticipantSourceSchema,
    clientId: uuidSchema.nullable(),
    displayName: z.string().trim().min(1).max(200).optional(),
    fullName: z.string().trim().min(1).max(200).optional(),
    birthDate: isoDateNotFutureSchema.optional()
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.source === "manual") {
      if (value.clientId !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["clientId"],
          message: "Manual participant clientId must be null"
        });
      }
      if (!value.fullName) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["fullName"],
          message: "Manual participant fullName is required"
        });
      }
      if (!value.birthDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["birthDate"],
          message: "Manual participant birthDate is required"
        });
      }
      return;
    }

    if (!value.clientId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["clientId"],
        message: "CRM participant clientId is required"
      });
    }
    if (!value.displayName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["displayName"],
        message: "CRM participant displayName is required"
      });
    }
    if (!value.fullName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["fullName"],
        message: "CRM participant fullName is required"
      });
    }
    if (!value.birthDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["birthDate"],
        message: "CRM participant birthDate is required"
      });
    }
  });
export type NumerologyParticipantRequest = z.infer<typeof numerologyParticipantRequestSchema>;

export const createNumerologyCalculationRequestSchema = z
  .object({
    mode: numerologyCalculationModeSchema,
    methodCode: createNumerologyMethodCodeSchema,
    title: z.string().trim().min(1).max(200),
    participants: z.array(numerologyParticipantRequestSchema).min(1).max(2),
    settings: pythagoreanSettingsSchema
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.mode === "individual") {
      if (value.participants.length !== 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["participants"],
          message: "Individual numerology requires exactly one participant"
        });
      }
      if (value.participants[0]?.role !== "subject") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["participants", 0, "role"],
          message: "Individual numerology participant must be subject"
        });
      }
      return;
    }

    if (value.participants.length !== 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["participants"],
        message: "Compatibility numerology requires exactly two participants"
      });
      return;
    }

    const roles = value.participants.map((participant) => participant.role);
    if (!roles.includes("subject") || !roles.includes("partner")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["participants"],
        message: "Compatibility numerology requires subject and partner roles"
      });
    }
  });
export type CreateNumerologyCalculationRequest = z.infer<
  typeof createNumerologyCalculationRequestSchema
>;

export const recalculateNumerologyCalculationRequestSchema =
  createNumerologyCalculationRequestSchema;
export type RecalculateNumerologyCalculationRequest = z.infer<
  typeof recalculateNumerologyCalculationRequestSchema
>;

export const createNumerologyAiDraftRequestSchema = z
  .object({
    versionId: uuidSchema
  })
  .strict();
export type CreateNumerologyAiDraftRequest = z.infer<
  typeof createNumerologyAiDraftRequestSchema
>;

const numerologyCalculationRecordResponseSchema = calculationRecordResponseSchema.extend({
  module: z.literal("numerology"),
  methodCode: numerologyMethodCodeSchema
});

export const numerologyCalculationResponseSchema = z
  .object({
    calculation: numerologyCalculationRecordResponseSchema,
    currentVersion: calculationVersionResponseSchema,
    resultSnapshot: calculationSnapshotObjectSchema,
    settingsSnapshot: calculationSnapshotObjectSchema,
    inputSnapshot: calculationSnapshotObjectSchema
  })
  .strict()
  .superRefine((value, ctx) => {
    const currentVersion = value.calculation.versions.find(
      (version) => version.id === value.currentVersion.id
    );

    if (!currentVersion) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["currentVersion", "id"],
        message: "Current version must belong to calculation versions"
      });
      return;
    }

    if (!sameSnapshot(value.currentVersion, currentVersion)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["currentVersion"],
        message: "Current version must match calculation version"
      });
    }

    if (!sameSnapshot(value.resultSnapshot, currentVersion.resultSnapshot)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["resultSnapshot"],
        message: "Result snapshot must match current version"
      });
    }

    if (!sameSnapshot(value.settingsSnapshot, currentVersion.settingsSnapshot)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["settingsSnapshot"],
        message: "Settings snapshot must match current version"
      });
    }

    if (!sameSnapshot(value.inputSnapshot, currentVersion.inputSnapshot)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["inputSnapshot"],
        message: "Input snapshot must match current version"
      });
    }
  });
export type NumerologyCalculationResponse = z.infer<
  typeof numerologyCalculationResponseSchema
>;

function sameSnapshot(first: unknown, second: unknown): boolean {
  if (Object.is(first, second)) return true;
  if (Array.isArray(first) || Array.isArray(second)) {
    if (!Array.isArray(first) || !Array.isArray(second) || first.length !== second.length) {
      return false;
    }

    return first.every((item, index) => sameSnapshot(item, second[index]));
  }

  if (!isPlainObject(first) || !isPlainObject(second)) return false;

  const firstKeys = Object.keys(first).sort();
  const secondKeys = Object.keys(second).sort();
  if (!sameSnapshot(firstKeys, secondKeys)) return false;

  return firstKeys.every((key) => sameSnapshot(first[key], second[key]));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
