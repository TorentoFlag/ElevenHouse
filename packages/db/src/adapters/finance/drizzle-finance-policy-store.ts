import { and, eq } from "drizzle-orm";
import type {
  AstrologerRiskProfile,
  CreateFinancePolicyInput,
  EffectiveFinancePolicy,
  FinancePolicySnapshot,
  FinancePolicyStore,
  RiskTier,
  UpsertAstrologerRiskProfileInput
} from "@elevenhouse/domain";
import type { ElevenHouseDatabase } from "../../runtime";
import { astrologerRiskProfiles, financePolicies } from "../../schema";
import type { FinanceDatabase } from "./drizzle-finance-command-store";

type FinancePolicyRow = typeof financePolicies.$inferSelect;
type AstrologerRiskProfileRow = typeof astrologerRiskProfiles.$inferSelect;

export function createDrizzleFinancePolicyStore(
  database: ElevenHouseDatabase
): FinancePolicyStore {
  return {
    findActivePolicyByRiskTier: (riskTier) => findActivePolicyByRiskTier(database, riskTier),
    findEffectivePolicyForAstrologer: (astrologerUserId) =>
      findEffectivePolicyForAstrologer(database, astrologerUserId),
    createPolicySnapshot: (input) => createPolicySnapshot(database, input),
    upsertAstrologerRiskProfile: (input) => upsertAstrologerRiskProfile(database, input)
  };
}

async function findActivePolicyByRiskTier(
  database: FinanceDatabase,
  riskTier: RiskTier
): Promise<FinancePolicySnapshot | null> {
  const [row] = await database
    .select()
    .from(financePolicies)
    .where(and(eq(financePolicies.riskTier, riskTier), eq(financePolicies.isActive, true)))
    .limit(1);
  if (!row) return null;
  return toFinancePolicySnapshot(row);
}

async function findEffectivePolicyForAstrologer(
  database: FinanceDatabase,
  astrologerUserId: string
): Promise<EffectiveFinancePolicy | null> {
  const [profileRow] = await database
    .select()
    .from(astrologerRiskProfiles)
    .where(eq(astrologerRiskProfiles.astrologerUserId, astrologerUserId))
    .limit(1);
  const profile = profileRow ? toAstrologerRiskProfile(profileRow) : null;
  const baseRiskTier = profile?.riskTier ?? "standard";
  const effectiveRiskTier = profile?.manualRiskTier ?? baseRiskTier;
  const policy = await findActivePolicyByRiskTier(database, effectiveRiskTier);
  if (!policy) return null;

  return {
    policyId: policy.id,
    policyVersion: policy.policyVersion,
    riskTier: effectiveRiskTier,
    baseRiskTier,
    profile,
    holdDurationHours: profile?.holdDurationHoursOverride ?? policy.holdDurationHours,
    reserveBps: profile?.reserveBpsOverride ?? policy.reserveBps,
    reserveReleaseDelayDays:
      profile?.reserveReleaseDelayDaysOverride ?? policy.reserveReleaseDelayDays,
    platformFeeBps: profile?.platformFeeBpsOverride ?? policy.platformFeeBps,
    providerSettlementRequired:
      profile?.providerSettlementRequiredOverride ?? policy.providerSettlementRequired
  };
}

async function createPolicySnapshot(
  database: ElevenHouseDatabase,
  input: CreateFinancePolicyInput
): Promise<FinancePolicySnapshot> {
  return database.transaction(async (transaction) => {
    await transaction
      .update(financePolicies)
      .set({ isActive: false })
      .where(eq(financePolicies.riskTier, input.riskTier));
    const timestamp = new Date(input.now);
    const [row] = await transaction
      .insert(financePolicies)
      .values({
        ...(input.id ? { id: input.id } : {}),
        policyVersion: input.policyVersion,
        riskTier: input.riskTier,
        holdDurationHours: input.holdDurationHours,
        reserveBps: input.reserveBps,
        reserveReleaseDelayDays: input.reserveReleaseDelayDays,
        platformFeeBps: input.platformFeeBps,
        providerSettlementRequired: input.providerSettlementRequired,
        isActive: true,
        createdByUserId: input.createdByUserId,
        snapshottedAt: timestamp,
        createdAt: timestamp
      })
      .returning();
    if (!row) throw new Error("Expected finance policy insert to return a row");
    return toFinancePolicySnapshot(row);
  });
}

async function upsertAstrologerRiskProfile(
  database: ElevenHouseDatabase,
  input: UpsertAstrologerRiskProfileInput
): Promise<AstrologerRiskProfile> {
  const [row] = await database
    .insert(astrologerRiskProfiles)
    .values({
      astrologerUserId: input.astrologerUserId,
      riskTier: input.riskTier,
      manualRiskTier: input.manualRiskTier,
      manualOverrideReason: input.manualOverrideReason,
      holdDurationHoursOverride: input.holdDurationHoursOverride,
      reserveBpsOverride: input.reserveBpsOverride,
      reserveReleaseDelayDaysOverride: input.reserveReleaseDelayDaysOverride,
      platformFeeBpsOverride: input.platformFeeBpsOverride,
      providerSettlementRequiredOverride: input.providerSettlementRequiredOverride,
      reviewedByUserId: input.reviewedByUserId,
      reviewedAt: input.reviewedAt ? new Date(input.reviewedAt) : null,
      updatedAt: new Date(input.now)
    })
    .onConflictDoUpdate({
      target: astrologerRiskProfiles.astrologerUserId,
      set: {
        riskTier: input.riskTier,
        manualRiskTier: input.manualRiskTier,
        manualOverrideReason: input.manualOverrideReason,
        holdDurationHoursOverride: input.holdDurationHoursOverride,
        reserveBpsOverride: input.reserveBpsOverride,
        reserveReleaseDelayDaysOverride: input.reserveReleaseDelayDaysOverride,
        platformFeeBpsOverride: input.platformFeeBpsOverride,
        providerSettlementRequiredOverride: input.providerSettlementRequiredOverride,
        reviewedByUserId: input.reviewedByUserId,
        reviewedAt: input.reviewedAt ? new Date(input.reviewedAt) : null,
        updatedAt: new Date(input.now)
      }
    })
    .returning();
  if (!row) throw new Error("Expected astrologer risk profile upsert to return a row");
  return toAstrologerRiskProfile(row);
}

function toFinancePolicySnapshot(row: FinancePolicyRow): FinancePolicySnapshot {
  return {
    id: row.id,
    policyVersion: row.policyVersion,
    riskTier: row.riskTier as RiskTier,
    holdDurationHours: row.holdDurationHours,
    reserveBps: row.reserveBps,
    reserveReleaseDelayDays: row.reserveReleaseDelayDays,
    platformFeeBps: row.platformFeeBps,
    providerSettlementRequired: row.providerSettlementRequired,
    isActive: row.isActive,
    createdByUserId: row.createdByUserId,
    snapshottedAt: row.snapshottedAt.toISOString(),
    createdAt: row.createdAt.toISOString()
  };
}

function toAstrologerRiskProfile(row: AstrologerRiskProfileRow): AstrologerRiskProfile {
  return {
    astrologerUserId: row.astrologerUserId,
    riskTier: row.riskTier as RiskTier,
    manualRiskTier: row.manualRiskTier as RiskTier | null,
    manualOverrideReason: row.manualOverrideReason,
    holdDurationHoursOverride: row.holdDurationHoursOverride,
    reserveBpsOverride: row.reserveBpsOverride,
    reserveReleaseDelayDaysOverride: row.reserveReleaseDelayDaysOverride,
    platformFeeBpsOverride: row.platformFeeBpsOverride,
    providerSettlementRequiredOverride: row.providerSettlementRequiredOverride,
    reviewedByUserId: row.reviewedByUserId,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString()
  };
}
