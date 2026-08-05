import { z } from "@elevenhouse/validation";
import { basisPointsSchema } from "./money";

const isoDateTimeSchema = z.string().datetime({ offset: true });
const uuidSchema = z.string().uuid();

export const riskTierValues = ["low", "standard", "elevated", "high", "manual_review"] as const;
export const riskTierSchema = z.enum(riskTierValues);
export type RiskTier = z.infer<typeof riskTierSchema>;

const holdDurationHoursSchema = z.number().int().min(0).max(24 * 180);
const reserveReleaseDelayDaysSchema = z.number().int().min(0).max(540);

export const financePolicySnapshotSchema = z
  .object({
    id: uuidSchema,
    policyVersion: z.number().int().positive(),
    riskTier: riskTierSchema,
    holdDurationHours: holdDurationHoursSchema,
    reserveBps: basisPointsSchema,
    reserveReleaseDelayDays: reserveReleaseDelayDaysSchema,
    providerSettlementRequired: z.boolean(),
    snapshottedAt: isoDateTimeSchema
  })
  .strict();
export type FinancePolicySnapshot = z.infer<typeof financePolicySnapshotSchema>;

export const financePolicyResponseSchema = financePolicySnapshotSchema
  .extend({
    isActive: z.boolean(),
    createdByUserId: uuidSchema.nullable(),
    createdAt: isoDateTimeSchema
  })
  .strict();
export type FinancePolicyResponse = z.infer<typeof financePolicyResponseSchema>;

export const financePoliciesResponseSchema = z
  .object({
    policies: z.array(financePolicyResponseSchema)
  })
  .strict();
export type FinancePoliciesResponse = z.infer<typeof financePoliciesResponseSchema>;

export const updateFinancePolicyRequestSchema = z
  .object({
    riskTier: riskTierSchema,
    holdDurationHours: holdDurationHoursSchema,
    reserveBps: basisPointsSchema,
    reserveReleaseDelayDays: reserveReleaseDelayDaysSchema,
    providerSettlementRequired: z.boolean()
  })
  .strict();
export type UpdateFinancePolicyRequest = z.infer<typeof updateFinancePolicyRequestSchema>;

const nullableOverrideNumber = <T extends z.ZodNumber>(schema: T) => schema.nullable();

export const updateAstrologerRiskProfileRequestSchema = z
  .object({
    riskTier: riskTierSchema,
    manualRiskTier: riskTierSchema.nullable(),
    manualOverrideReason: z.string().trim().min(1).max(2_000).nullable(),
    holdDurationHoursOverride: nullableOverrideNumber(holdDurationHoursSchema),
    reserveBpsOverride: nullableOverrideNumber(basisPointsSchema),
    reserveReleaseDelayDaysOverride: nullableOverrideNumber(reserveReleaseDelayDaysSchema),
    providerSettlementRequiredOverride: z.boolean().nullable()
  })
  .strict()
  .superRefine((request, context) => {
    if (request.manualRiskTier && request.manualOverrideReason === null) {
      context.addIssue({
        code: "custom",
        path: ["manualOverrideReason"],
        message: "Manual risk override reason is required"
      });
    }
    if (!request.manualRiskTier && request.manualOverrideReason !== null) {
      context.addIssue({
        code: "custom",
        path: ["manualOverrideReason"],
        message: "Manual override reason requires a manual risk tier"
      });
    }
  });
export type UpdateAstrologerRiskProfileRequest = z.infer<
  typeof updateAstrologerRiskProfileRequestSchema
>;

export const astrologerRiskProfileResponseSchema = updateAstrologerRiskProfileRequestSchema
  .extend({
    astrologerUserId: uuidSchema,
    reviewedByUserId: uuidSchema.nullable(),
    reviewedAt: isoDateTimeSchema.nullable(),
    updatedAt: isoDateTimeSchema
  })
  .strict();
export type AstrologerRiskProfileResponse = z.infer<
  typeof astrologerRiskProfileResponseSchema
>;
