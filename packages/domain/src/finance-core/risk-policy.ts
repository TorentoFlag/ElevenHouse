import { Temporal } from "@js-temporal/polyfill";
import { riskTierValues, type RiskTier } from "@elevenhouse/contracts";
import type { Money } from "../money";

export type RiskPolicyHoldAnchor = "booking_completed";

export type RiskPolicyExceptionAuthorityRef = {
  readonly id: string;
  readonly version: number;
};

export type RiskPolicySnapshot = {
  readonly id: string;
  readonly policyVersion: number;
  readonly effectiveRiskTier: RiskTier;
  readonly holdAnchor: RiskPolicyHoldAnchor;
  readonly holdDurationHours: number;
  readonly reserveBps: number;
  readonly reserveReleaseDelayDays: number;
  readonly providerSettlementRequired: boolean;
  readonly payoutMinimum: Money;
  readonly exceptionAuthority: RiskPolicyExceptionAuthorityRef | null;
  readonly effectiveAt: string;
};

export class RiskPolicySnapshotValidationError extends Error {
  readonly code = "invalid_risk_policy_snapshot";

  constructor() {
    super("Risk policy snapshot is invalid");
    this.name = "RiskPolicySnapshotValidationError";
  }
}

const riskPolicyKeys = [
  "id",
  "policyVersion",
  "effectiveRiskTier",
  "holdAnchor",
  "holdDurationHours",
  "reserveBps",
  "reserveReleaseDelayDays",
  "providerSettlementRequired",
  "payoutMinimum",
  "exceptionAuthority",
  "effectiveAt"
] as const;
const riskTiers = new Set<unknown>(riskTierValues);

export function createRiskPolicySnapshot(input: unknown): RiskPolicySnapshot {
  const candidate = exactRecord(input, riskPolicyKeys);
  const payoutMinimum = money(candidate.payoutMinimum);
  const exceptionAuthority = exceptionAuthorityRef(candidate.exceptionAuthority);

  return Object.freeze({
    id: identifier(candidate.id),
    policyVersion: integer(candidate.policyVersion, 1, Number.MAX_SAFE_INTEGER),
    effectiveRiskTier: riskTier(candidate.effectiveRiskTier),
    holdAnchor: holdAnchor(candidate.holdAnchor),
    holdDurationHours: integer(candidate.holdDurationHours, 0, 24 * 180),
    reserveBps: integer(candidate.reserveBps, 0, 10_000),
    reserveReleaseDelayDays: integer(candidate.reserveReleaseDelayDays, 0, 540),
    providerSettlementRequired: boolean(candidate.providerSettlementRequired),
    payoutMinimum,
    exceptionAuthority,
    effectiveAt: instant(candidate.effectiveAt)
  });
}

function money(value: unknown): Money {
  const candidate = exactRecord(value, ["amountMinor", "currency"]);
  if (candidate.currency !== "RUB") invalid();

  return Object.freeze({
    amountMinor: integer(candidate.amountMinor, 0, Number.MAX_SAFE_INTEGER),
    currency: "RUB"
  });
}

function exceptionAuthorityRef(value: unknown): RiskPolicyExceptionAuthorityRef | null {
  if (value === null) return null;
  const candidate = exactRecord(value, ["id", "version"]);

  return Object.freeze({
    id: identifier(candidate.id),
    version: integer(candidate.version, 1, Number.MAX_SAFE_INTEGER)
  });
}

function riskTier(value: unknown): RiskTier {
  if (!riskTiers.has(value)) invalid();
  return value as RiskTier;
}

function holdAnchor(value: unknown): RiskPolicyHoldAnchor {
  if (value !== "booking_completed") invalid();
  return value;
}

function identifier(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 200 ||
    value.trim() !== value
  ) {
    invalid();
  }
  return value;
}

function integer(value: unknown, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    invalid();
  }
  return value as number;
}

function boolean(value: unknown): boolean {
  if (typeof value !== "boolean") invalid();
  return value;
}

function instant(value: unknown): string {
  if (typeof value !== "string") invalid();
  try {
    return Temporal.Instant.from(value).toString();
  } catch {
    return invalid();
  }
}

function exactRecord<const Keys extends readonly string[]>(
  value: unknown,
  expectedKeys: Keys
): Record<Keys[number], unknown> {
  try {
    if (!isPlainRecord(value)) invalid();
    const actualKeys = Reflect.ownKeys(value)
      .map((key) => {
        if (typeof key !== "string") return invalid();
        return key;
      })
      .sort();
    const sortedExpectedKeys = [...expectedKeys].sort();
    if (
      actualKeys.length !== sortedExpectedKeys.length ||
      actualKeys.some((key, index) => key !== sortedExpectedKeys[index])
    ) {
      invalid();
    }
    const projected = Object.create(null) as Record<string, unknown>;
    for (const key of actualKeys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor) || descriptor.enumerable !== true) invalid();
      projected[key] = descriptor.value;
    }
    return Object.freeze(projected) as Record<Keys[number], unknown>;
  } catch {
    return invalid();
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function invalid(): never {
  throw new RiskPolicySnapshotValidationError();
}
