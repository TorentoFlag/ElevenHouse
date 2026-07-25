import type {
  FinancePolicyResponse,
  RiskTier,
  UpdateAstrologerRiskProfileRequest,
  UpdateFinancePolicyRequest
} from "@elevenhouse/contracts";

export const financePolicyRiskTierOptions = [
  { value: "low", label: "Low", tone: "positive" },
  { value: "standard", label: "Standard", tone: "neutral" },
  { value: "elevated", label: "Elevated", tone: "warning" },
  { value: "high", label: "High", tone: "danger" },
  { value: "manual_review", label: "Manual review", tone: "danger" }
] as const satisfies readonly {
  readonly value: RiskTier;
  readonly label: string;
  readonly tone: "positive" | "neutral" | "warning" | "danger";
}[];

export type FinancePolicyFormState = {
  readonly riskTier: RiskTier;
  readonly holdDurationHours: number;
  readonly reserveBps: number;
  readonly reserveReleaseDelayDays: number;
  readonly platformFeeBps: number;
  readonly providerSettlementRequired: boolean;
};

export type AstrologerRiskProfileFormState = {
  readonly astrologerUserId: string;
  readonly riskTier: RiskTier;
  readonly manualRiskTier: RiskTier;
  readonly manualOverrideReason: string;
  readonly holdDurationHoursOverride: number;
  readonly reserveBpsOverride: number;
  readonly reserveReleaseDelayDaysOverride: number;
  readonly platformFeeBpsOverride: number | null;
  readonly providerSettlementRequiredOverride: boolean;
};

export function policyToForm(policy: FinancePolicyResponse | null): FinancePolicyFormState {
  return {
    riskTier: policy?.riskTier ?? "standard",
    holdDurationHours: policy?.holdDurationHours ?? 48,
    reserveBps: policy?.reserveBps ?? 0,
    reserveReleaseDelayDays: policy?.reserveReleaseDelayDays ?? 0,
    platformFeeBps: policy?.platformFeeBps ?? 1000,
    providerSettlementRequired: policy?.providerSettlementRequired ?? true
  };
}

export function policyFormToRequest(form: FinancePolicyFormState): UpdateFinancePolicyRequest {
  return {
    riskTier: form.riskTier,
    holdDurationHours: form.holdDurationHours,
    reserveBps: form.reserveBps,
    reserveReleaseDelayDays: form.reserveReleaseDelayDays,
    platformFeeBps: form.platformFeeBps,
    providerSettlementRequired: form.providerSettlementRequired
  };
}

export function createInitialRiskProfileForm(): AstrologerRiskProfileFormState {
  return {
    astrologerUserId: "",
    riskTier: "standard",
    manualRiskTier: "high",
    manualOverrideReason: "",
    holdDurationHoursOverride: 168,
    reserveBpsOverride: 1500,
    reserveReleaseDelayDaysOverride: 30,
    platformFeeBpsOverride: null,
    providerSettlementRequiredOverride: true
  };
}

export function riskProfileFormToRequest(
  form: AstrologerRiskProfileFormState
): UpdateAstrologerRiskProfileRequest {
  return {
    riskTier: form.riskTier,
    manualRiskTier: form.manualRiskTier,
    manualOverrideReason: form.manualOverrideReason.trim(),
    holdDurationHoursOverride: form.holdDurationHoursOverride,
    reserveBpsOverride: form.reserveBpsOverride,
    reserveReleaseDelayDaysOverride: form.reserveReleaseDelayDaysOverride,
    platformFeeBpsOverride: form.platformFeeBpsOverride,
    providerSettlementRequiredOverride: form.providerSettlementRequiredOverride
  };
}

export function formatBasisPoints(value: number): string {
  return `${(value / 100).toLocaleString("ru-RU", {
    maximumFractionDigits: 2,
    minimumFractionDigits: value % 100 === 0 ? 0 : 2
  })}%`;
}

export function holdLabel(hours: number): string {
  if (hours % 24 === 0) {
    return `${hours / 24} д`;
  }
  return `${hours} ч`;
}
