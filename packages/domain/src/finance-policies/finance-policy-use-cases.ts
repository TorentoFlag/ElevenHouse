import { randomUUID } from "node:crypto";
import type {
  AstrologerRiskProfile,
  FinancePolicySnapshot,
  FinancePolicyStore,
  RiskTier
} from "./finance-policy-store";

const defaultPolicy = {
  riskTier: "standard" as const,
  holdDurationHours: 48,
  reserveBps: 0,
  reserveReleaseDelayDays: 0,
  platformFeeBps: 1_000,
  providerSettlementRequired: true
};

export type UpdateFinancePolicyCommand = {
  readonly riskTier: RiskTier;
  readonly holdDurationHours: number;
  readonly reserveBps: number;
  readonly reserveReleaseDelayDays: number;
  readonly platformFeeBps: number;
  readonly providerSettlementRequired: boolean;
};

export type AssignAstrologerRiskProfileCommand = {
  readonly riskTier: RiskTier;
  readonly manualRiskTier: RiskTier | null;
  readonly manualOverrideReason: string | null;
  readonly holdDurationHoursOverride: number | null;
  readonly reserveBpsOverride: number | null;
  readonly reserveReleaseDelayDaysOverride: number | null;
  readonly platformFeeBpsOverride: number | null;
  readonly providerSettlementRequiredOverride: boolean | null;
};

export class FinancePolicyValidationError extends Error {
  readonly code = "finance_policy_validation_failed";

  constructor(message: string) {
    super(message);
    this.name = "FinancePolicyValidationError";
  }
}

export async function ensureDefaultFinancePolicy(input: {
  readonly store: Pick<
    FinancePolicyStore,
    "findActivePolicyByRiskTier" | "findLatestPolicyVersion" | "createPolicySnapshot"
  >;
  readonly adminUserId: string | null;
  readonly now: Date;
  readonly idGenerator?: () => string;
}): Promise<FinancePolicySnapshot> {
  const existing = await input.store.findActivePolicyByRiskTier(defaultPolicy.riskTier);
  if (existing) return existing;
  return createPolicySnapshot(input.store, {
    id: (input.idGenerator ?? randomUUID)(),
    adminUserId: input.adminUserId,
    request: defaultPolicy,
    now: input.now
  });
}

export async function updateFinancePolicy(input: {
  readonly store: Pick<
    FinancePolicyStore,
    "findLatestPolicyVersion" | "createPolicySnapshot"
  >;
  readonly adminUserId: string;
  readonly request: UpdateFinancePolicyCommand;
  readonly now: Date;
  readonly idGenerator?: () => string;
}): Promise<FinancePolicySnapshot> {
  validatePolicyCommand(input.request);
  return createPolicySnapshot(input.store, {
    id: (input.idGenerator ?? randomUUID)(),
    adminUserId: input.adminUserId,
    request: input.request,
    now: input.now
  });
}

export async function assignAstrologerRiskProfile(input: {
  readonly store: Pick<FinancePolicyStore, "upsertAstrologerRiskProfile">;
  readonly adminUserId: string;
  readonly astrologerUserId: string;
  readonly request: AssignAstrologerRiskProfileCommand;
  readonly now: Date;
}): Promise<AstrologerRiskProfile> {
  validateRiskProfileCommand(input.request);
  const nowIso = input.now.toISOString();
  return input.store.upsertAstrologerRiskProfile({
    astrologerUserId: input.astrologerUserId,
    riskTier: input.request.riskTier,
    manualRiskTier: input.request.manualRiskTier,
    manualOverrideReason: normalizeNullableText(input.request.manualOverrideReason),
    holdDurationHoursOverride: input.request.holdDurationHoursOverride,
    reserveBpsOverride: input.request.reserveBpsOverride,
    reserveReleaseDelayDaysOverride: input.request.reserveReleaseDelayDaysOverride,
    platformFeeBpsOverride: input.request.platformFeeBpsOverride,
    providerSettlementRequiredOverride: input.request.providerSettlementRequiredOverride,
    reviewedByUserId: input.request.manualRiskTier ? input.adminUserId : null,
    reviewedAt: input.request.manualRiskTier ? nowIso : null,
    now: nowIso
  });
}

async function createPolicySnapshot(
  store: Pick<FinancePolicyStore, "findLatestPolicyVersion" | "createPolicySnapshot">,
  input: {
    readonly id: string;
    readonly adminUserId: string | null;
    readonly request: UpdateFinancePolicyCommand;
    readonly now: Date;
  }
): Promise<FinancePolicySnapshot> {
  validatePolicyCommand(input.request);
  const latestVersion = await store.findLatestPolicyVersion();
  return store.createPolicySnapshot({
    id: input.id,
    policyVersion: latestVersion + 1,
    riskTier: input.request.riskTier,
    holdDurationHours: input.request.holdDurationHours,
    reserveBps: input.request.reserveBps,
    reserveReleaseDelayDays: input.request.reserveReleaseDelayDays,
    platformFeeBps: input.request.platformFeeBps,
    providerSettlementRequired: input.request.providerSettlementRequired,
    createdByUserId: input.adminUserId,
    now: input.now.toISOString()
  });
}

function validatePolicyCommand(command: UpdateFinancePolicyCommand): void {
  assertIntegerRange(command.holdDurationHours, 0, 24 * 180, "holdDurationHours");
  assertIntegerRange(command.reserveBps, 0, 10_000, "reserveBps");
  assertIntegerRange(command.reserveReleaseDelayDays, 0, 540, "reserveReleaseDelayDays");
  assertIntegerRange(command.platformFeeBps, 0, 10_000, "platformFeeBps");
}

function validateRiskProfileCommand(command: AssignAstrologerRiskProfileCommand): void {
  if (command.manualRiskTier && !normalizeNullableText(command.manualOverrideReason)) {
    throw new FinancePolicyValidationError("Manual risk override reason is required");
  }
  if (!command.manualRiskTier && normalizeNullableText(command.manualOverrideReason)) {
    throw new FinancePolicyValidationError("Manual override reason requires a manual risk tier");
  }
  assertNullableIntegerRange(command.holdDurationHoursOverride, 0, 24 * 180, "holdDurationHoursOverride");
  assertNullableIntegerRange(command.reserveBpsOverride, 0, 10_000, "reserveBpsOverride");
  assertNullableIntegerRange(
    command.reserveReleaseDelayDaysOverride,
    0,
    540,
    "reserveReleaseDelayDaysOverride"
  );
  assertNullableIntegerRange(command.platformFeeBpsOverride, 0, 10_000, "platformFeeBpsOverride");
}

function assertNullableIntegerRange(
  value: number | null,
  min: number,
  max: number,
  field: string
): void {
  if (value === null) return;
  assertIntegerRange(value, min, max, field);
}

function assertIntegerRange(value: number, min: number, max: number, field: string): void {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new FinancePolicyValidationError(`${field} is outside the allowed range`);
  }
}

function normalizeNullableText(value: string | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}
