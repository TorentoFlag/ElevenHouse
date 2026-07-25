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
    platformFeeBps: basisPointsSchema,
    providerSettlementRequired: z.boolean(),
    snapshottedAt: isoDateTimeSchema
  })
  .strict();
export type FinancePolicySnapshot = z.infer<typeof financePolicySnapshotSchema>;

export const updateFinancePolicyRequestSchema = z
  .object({
    riskTier: riskTierSchema,
    holdDurationHours: holdDurationHoursSchema,
    reserveBps: basisPointsSchema,
    reserveReleaseDelayDays: reserveReleaseDelayDaysSchema,
    platformFeeBps: basisPointsSchema,
    providerSettlementRequired: z.boolean()
  })
  .strict();
export type UpdateFinancePolicyRequest = z.infer<typeof updateFinancePolicyRequestSchema>;
