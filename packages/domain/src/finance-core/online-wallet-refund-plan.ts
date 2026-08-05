import { allocateBps } from "../money";

export type OnlineWalletRefundSourceBucket =
  | "pending"
  | "available"
  | "reserved"
  | "payout_pending";

export type OnlineWalletRefundSource = Readonly<{
  sourceKind: "root" | "allocation";
  sourceId: string;
  rootLotId: string;
  bucket: OnlineWalletRefundSourceBucket;
  amountMinor: number;
}>;

export type OnlineWalletRefundConsumption = Readonly<{
  sourceKind: "root" | "allocation";
  sourceId: string;
  rootLotId: string;
  bucket: OnlineWalletRefundSourceBucket;
  sourceAmountMinor: number;
  consumedMinor: number;
  remainderMinor: number;
}>;

export type OnlineWalletRefundPlan = Readonly<{
  commissionReversalMinor: number;
  payableReversalMinor: number;
  /**
   * Payable already consumed by a paid/in-flight payout. It deliberately cannot become a new
   * wallet position until a separately authorized recovery or platform-loss policy resolves it.
   */
  blockedPayoutOutcomeMinor: number;
  consumptions: readonly OnlineWalletRefundConsumption[];
}>;

export class OnlineWalletRefundPlanIntegrityError extends Error {
  readonly code = "online_wallet_refund_plan_integrity_error";

  constructor() {
    super("Online wallet refund plan input is invalid");
    this.name = "OnlineWalletRefundPlanIntegrityError";
  }
}

/**
 * Derives one refund's exact commission/payable delta from the immutable sale snapshot and
 * consumes only whole, currently-open v2 source positions. A deficit is intentionally exposed as
 * `blockedPayoutOutcomeMinor`: persistence must not manufacture a negative wallet balance, reuse
 * an already-consumed payout source, or create a recovery claim without an explicit policy.
 */
export function createOnlineWalletRefundPlan(
  input: Readonly<{
    refundId: string;
    grossAmountMinor: number;
    originalGrossAmountMinor: number;
    commissionBps: number;
    previousRefundedGrossMinor: number;
    cumulativeRefundedGrossMinor: number;
    sources: readonly OnlineWalletRefundSource[];
  }>
): OnlineWalletRefundPlan {
  identifier(input.refundId);
  positiveMinor(input.grossAmountMinor);
  positiveMinor(input.originalGrossAmountMinor);
  bps(input.commissionBps);
  nonNegativeMinor(input.previousRefundedGrossMinor);
  positiveMinor(input.cumulativeRefundedGrossMinor);
  if (
    input.previousRefundedGrossMinor >= input.cumulativeRefundedGrossMinor ||
    input.cumulativeRefundedGrossMinor > input.originalGrossAmountMinor ||
    input.cumulativeRefundedGrossMinor - input.previousRefundedGrossMinor !== input.grossAmountMinor
  ) {
    throw new OnlineWalletRefundPlanIntegrityError();
  }

  const priorCommissionMinor = allocateBps({
    amountMinor: input.previousRefundedGrossMinor,
    bps: input.commissionBps
  }).feeMinor;
  const cumulativeCommissionMinor = allocateBps({
    amountMinor: input.cumulativeRefundedGrossMinor,
    bps: input.commissionBps
  }).feeMinor;
  const commissionReversalMinor = cumulativeCommissionMinor - priorCommissionMinor;
  const payableReversalMinor = input.grossAmountMinor - commissionReversalMinor;
  if (commissionReversalMinor < 0 || payableReversalMinor < 0) {
    throw new OnlineWalletRefundPlanIntegrityError();
  }

  const sources = normalizeSources(input.sources);
  let remaining = payableReversalMinor;
  const consumptions: OnlineWalletRefundConsumption[] = [];
  for (const source of sources) {
    // A component already assigned to a manual payout may be in a bank-processing window.
    // It remains immutable until that payout reaches a separately evidenced terminal outcome.
    if (source.bucket === "payout_pending") continue;
    if (remaining === 0) break;
    const consumedMinor = Math.min(source.amountMinor, remaining);
    const remainderMinor = source.amountMinor - consumedMinor;
    consumptions.push(
      Object.freeze({
        ...source,
        sourceAmountMinor: source.amountMinor,
        consumedMinor,
        remainderMinor
      })
    );
    remaining -= consumedMinor;
  }

  return Object.freeze({
    commissionReversalMinor,
    payableReversalMinor,
    blockedPayoutOutcomeMinor: remaining,
    consumptions: Object.freeze(consumptions)
  });
}

function normalizeSources(
  sources: readonly OnlineWalletRefundSource[]
): readonly OnlineWalletRefundSource[] {
  const normalized = sources.map((source) => {
    identifier(source.sourceId);
    identifier(source.rootLotId);
    positiveMinor(source.amountMinor);
    if (
      (source.sourceKind !== "root" && source.sourceKind !== "allocation") ||
      (source.bucket !== "pending" &&
        source.bucket !== "available" &&
        source.bucket !== "reserved" &&
        source.bucket !== "payout_pending")
    ) {
      throw new OnlineWalletRefundPlanIntegrityError();
    }
    return Object.freeze({ ...source });
  });
  const keys = normalized.map((source) => `${source.sourceKind}:${source.sourceId}`);
  if (new Set(keys).size !== normalized.length) throw new OnlineWalletRefundPlanIntegrityError();
  return Object.freeze(
    normalized.sort((left, right) =>
      `${left.rootLotId}:${left.sourceKind}:${left.sourceId}`.localeCompare(
        `${right.rootLotId}:${right.sourceKind}:${right.sourceId}`
      )
    )
  );
}

function identifier(value: string): void {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    value.length === 0 ||
    value.length > 200
  ) {
    throw new OnlineWalletRefundPlanIntegrityError();
  }
}

function positiveMinor(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw new OnlineWalletRefundPlanIntegrityError();
}

function nonNegativeMinor(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new OnlineWalletRefundPlanIntegrityError();
}

function bps(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > 10_000) {
    throw new OnlineWalletRefundPlanIntegrityError();
  }
}
