export type RiskTier = "low" | "standard" | "elevated" | "high" | "manual_review";

export type FinancePolicySnapshot = {
  readonly id: string;
  readonly policyVersion: number;
  readonly riskTier: RiskTier;
  readonly holdDurationHours: number;
  readonly reserveBps: number;
  readonly reserveReleaseDelayDays: number;
  readonly platformFeeBps: number;
  readonly providerSettlementRequired: boolean;
  readonly isActive: boolean;
  readonly createdByUserId: string | null;
  readonly snapshottedAt: string;
  readonly createdAt: string;
};

export type AstrologerRiskProfile = {
  readonly astrologerUserId: string;
  readonly riskTier: RiskTier;
  readonly manualRiskTier: RiskTier | null;
  readonly manualOverrideReason: string | null;
  readonly holdDurationHoursOverride: number | null;
  readonly reserveBpsOverride: number | null;
  readonly reserveReleaseDelayDaysOverride: number | null;
  readonly platformFeeBpsOverride: number | null;
  readonly providerSettlementRequiredOverride: boolean | null;
  readonly reviewedByUserId: string | null;
  readonly reviewedAt: string | null;
  readonly updatedAt: string;
};

export type EffectiveFinancePolicy = Omit<
  FinancePolicySnapshot,
  "id" | "riskTier" | "isActive" | "createdByUserId" | "snapshottedAt" | "createdAt"
> & {
  readonly policyId: string;
  readonly riskTier: RiskTier;
  readonly baseRiskTier: RiskTier;
  readonly profile: AstrologerRiskProfile | null;
};

export type CreateFinancePolicyInput = {
  readonly id?: string;
  readonly policyVersion: number;
  readonly riskTier: RiskTier;
  readonly holdDurationHours: number;
  readonly reserveBps: number;
  readonly reserveReleaseDelayDays: number;
  readonly platformFeeBps: number;
  readonly providerSettlementRequired: boolean;
  readonly createdByUserId: string | null;
  readonly now: string;
};

export type UpsertAstrologerRiskProfileInput = {
  readonly astrologerUserId: string;
  readonly riskTier: RiskTier;
  readonly manualRiskTier: RiskTier | null;
  readonly manualOverrideReason: string | null;
  readonly holdDurationHoursOverride: number | null;
  readonly reserveBpsOverride: number | null;
  readonly reserveReleaseDelayDaysOverride: number | null;
  readonly platformFeeBpsOverride: number | null;
  readonly providerSettlementRequiredOverride: boolean | null;
  readonly reviewedByUserId: string | null;
  readonly reviewedAt: string | null;
  readonly now: string;
};

export type FinancePolicyStore = {
  readonly findActivePolicyByRiskTier: (
    riskTier: RiskTier
  ) => Promise<FinancePolicySnapshot | null>;
  readonly findLatestPolicyVersion: () => Promise<number>;
  readonly findEffectivePolicyForAstrologer: (
    astrologerUserId: string
  ) => Promise<EffectiveFinancePolicy | null>;
  readonly createPolicySnapshot: (
    input: CreateFinancePolicyInput
  ) => Promise<FinancePolicySnapshot>;
  readonly upsertAstrologerRiskProfile: (
    input: UpsertAstrologerRiskProfileInput
  ) => Promise<AstrologerRiskProfile>;
};
