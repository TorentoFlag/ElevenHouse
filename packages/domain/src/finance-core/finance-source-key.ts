export const financeSourceOperationsByKind = Object.freeze({
  bank: Object.freeze([
    "payout_debit_matched",
    "payout_return_credit_matched",
    "unknown_debit_recorded",
    "unknown_credit_recorded",
    "suspense_reclassified"
  ] as const),
  order: Object.freeze(["sale_captured", "commission_earned"] as const),
  platform_invoice: Object.freeze(["captured", "revenue_earned"] as const),
  provider_fee: Object.freeze(["confirmed", "returned"] as const),
  reserve: Object.freeze(["hold_released", "released"] as const),
  payout: Object.freeze(["requested", "released", "paid", "returned_without_debit"] as const),
  refund: Object.freeze([
    "approved",
    "confirmed",
    "failed",
    "bridge_payout_failed",
    "bridge_payout_paid"
  ] as const),
  chargeback: Object.freeze([
    "confirmed",
    "principal_allocated",
    "recovery_collected",
    "won"
  ] as const),
  settlement: Object.freeze(["merchant_payout_confirmed", "merchant_payout_bank_matched"] as const),
  correction: Object.freeze(["reversal", "replacement"] as const)
});

export type FinanceSourceKind = keyof typeof financeSourceOperationsByKind;
type FinanceSourceOperation<K extends FinanceSourceKind> =
  (typeof financeSourceOperationsByKind)[K][number];

export type FinanceSourceKey = {
  [K in FinanceSourceKind]: {
    readonly kind: K;
    readonly sourceId: string;
    readonly operation: FinanceSourceOperation<K>;
  };
}[FinanceSourceKind];

export class FinanceSourceKeyIntegrityError extends Error {
  readonly code = "finance_source_key_integrity_error";

  constructor() {
    super("Finance source key does not match the approved source vocabulary");
    this.name = "FinanceSourceKeyIntegrityError";
  }
}

const sourceKinds = new Set<string>(Object.keys(financeSourceOperationsByKind));

export function createFinanceSourceKey(input: unknown): FinanceSourceKey {
  const candidate = readStrictOwnDataRecord(
    input,
    ["kind", "sourceId", "operation"] as const,
    failSourceKeyIntegrity
  );
  if (
    typeof candidate.kind !== "string" ||
    !sourceKinds.has(candidate.kind) ||
    typeof candidate.sourceId !== "string" ||
    candidate.sourceId.trim() !== candidate.sourceId ||
    candidate.sourceId.length === 0 ||
    candidate.sourceId.length > 200 ||
    typeof candidate.operation !== "string"
  ) {
    throw new FinanceSourceKeyIntegrityError();
  }
  const operations = financeSourceOperationsByKind[
    candidate.kind as FinanceSourceKind
  ] as readonly string[];
  if (!operations.includes(candidate.operation)) throw new FinanceSourceKeyIntegrityError();

  return Object.freeze({
    kind: candidate.kind,
    sourceId: candidate.sourceId,
    operation: candidate.operation
  }) as FinanceSourceKey;
}

export function serializeFinanceSourceKey(sourceKey: FinanceSourceKey): string {
  const canonical = createFinanceSourceKey(sourceKey);
  return JSON.stringify([canonical.kind, canonical.sourceId, canonical.operation]);
}

function failSourceKeyIntegrity(): never {
  throw new FinanceSourceKeyIntegrityError();
}
import { readStrictOwnDataRecord } from "./strict-own-data";
