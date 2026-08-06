import { allocateBps } from "../money";
import { createFinanceJournalTransaction, type FinanceJournalTransaction } from "./journal";

export type OnlineWalletRefundApprovalSourceBucket =
  | "pending"
  | "available"
  | "reserved"
  | "payout_pending";

export type OnlineWalletRefundApprovalSource = Readonly<{
  sourceKind: "root" | "allocation";
  sourceId: string;
  rootLotId: string;
  bucket: OnlineWalletRefundApprovalSourceBucket;
  amountMinor: number;
}>;

export type OnlineWalletRefundApprovalConsumption = Readonly<{
  sourceKind: "root" | "allocation";
  sourceId: string;
  rootLotId: string;
  bucket: Exclude<OnlineWalletRefundApprovalSourceBucket, "payout_pending">;
  sourceAmountMinor: number;
  reservedMinor: number;
  remainderMinor: number;
  refundPendingAllocationId: string;
}>;

export type OnlineWalletRefundApprovalPlan = Readonly<{
  commissionReversalMinor: number;
  payableReservationMinor: number;
  /** Value already entered manual payout processing; recovery/platform-loss policy owns it. */
  blockedPayoutOutcomeMinor: number;
  consumptions: readonly OnlineWalletRefundApprovalConsumption[];
}>;

export type OnlineWalletRefundApprovalJournalConsumption =
  OnlineWalletRefundApprovalConsumption &
    Readonly<{
      orderId: string;
    }>;

export class OnlineWalletRefundApprovalIntegrityError extends Error {
  readonly code = "online_wallet_refund_approval_integrity_error" as const;

  constructor() {
    super("Online wallet refund approval plan is invalid");
    this.name = "OnlineWalletRefundApprovalIntegrityError";
  }
}

/**
 * Freezes a refund's payable allocation before ArcPay I/O. The later terminal handler must
 * consume these `refund_pending` children, never re-plan from a mutable live wallet.
 */
export function createOnlineWalletRefundApprovalPlan(input: Readonly<{
  refundCaseId: string;
  grossAmountMinor: number;
  originalGrossAmountMinor: number;
  commissionBps: number;
  previousRefundedGrossMinor: number;
  cumulativeRefundedGrossMinor: number;
  sources: readonly OnlineWalletRefundApprovalSource[];
}>): OnlineWalletRefundApprovalPlan {
  identifier(input.refundCaseId);
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
    fail();
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
  const payableReservationMinor = input.grossAmountMinor - commissionReversalMinor;
  if (commissionReversalMinor < 0 || payableReservationMinor < 0) fail();

  let remaining = payableReservationMinor;
  const consumptions: OnlineWalletRefundApprovalConsumption[] = [];
  for (const source of normalizeSources(input.sources)) {
    const bucket = source.bucket;
    if (bucket === "payout_pending" || remaining === 0) continue;
    const reservedMinor = Math.min(source.amountMinor, remaining);
    consumptions.push(
      Object.freeze({
        sourceKind: source.sourceKind,
        sourceId: source.sourceId,
        rootLotId: source.rootLotId,
        bucket,
        sourceAmountMinor: source.amountMinor,
        reservedMinor,
        remainderMinor: source.amountMinor - reservedMinor,
        refundPendingAllocationId: `online-wallet-refund-pending:${input.refundCaseId}:${consumptions.length}`
      })
    );
    remaining -= reservedMinor;
  }
  return Object.freeze({
    commissionReversalMinor,
    payableReservationMinor,
    blockedPayoutOutcomeMinor: remaining,
    consumptions: Object.freeze(consumptions)
  });
}

/**
 * Reservation is a balanced liability reclassification only. It never represents an ArcPay
 * refund: provider clearing is touched exclusively by the later canonical terminal result.
 */
export function createOnlineWalletRefundApprovalJournal(input: Readonly<{
  refundCaseId: string;
  astrologerUserId: string;
  occurredAt: string;
  postedAt: string;
  consumptions: readonly OnlineWalletRefundApprovalJournalConsumption[];
}>): FinanceJournalTransaction {
  identifier(input.refundCaseId);
  identifier(input.astrologerUserId);
  if (input.consumptions.length === 0) fail();
  const seen = new Set<string>();
  const entries = input.consumptions.flatMap((consumption) => {
    identifier(consumption.sourceId);
    identifier(consumption.rootLotId);
    identifier(consumption.orderId);
    identifier(consumption.refundPendingAllocationId);
    positiveMinor(consumption.sourceAmountMinor);
    positiveMinor(consumption.reservedMinor);
    nonNegativeMinor(consumption.remainderMinor);
    if (
      consumption.sourceAmountMinor !== consumption.reservedMinor + consumption.remainderMinor ||
      seen.has(consumption.sourceId)
    ) {
      fail();
    }
    seen.add(consumption.sourceId);
    const amount = Object.freeze({ amountMinor: consumption.reservedMinor, currency: "RUB" as const });
    const links = Object.freeze({
      originalSaleId: consumption.orderId,
      componentId: consumption.rootLotId,
      payableLotId: consumption.sourceId,
      payoutAllocationId: null
    });
    return [
      {
        account: {
          code: accountCode(consumption.bucket),
          astrologerUserId: input.astrologerUserId,
          currency: "RUB" as const
        },
        side: "debit" as const,
        amount,
        links
      },
      {
        account: {
          code: "astrologer_refund_pending" as const,
          astrologerUserId: input.astrologerUserId,
          currency: "RUB" as const
        },
        side: "credit" as const,
        amount,
        links: Object.freeze({ ...links, payableLotId: consumption.refundPendingAllocationId })
      }
    ];
  });
  return createFinanceJournalTransaction({
    id: `online-wallet-refund-approved:${input.refundCaseId}`,
    sourceKey: { kind: "refund", sourceId: input.refundCaseId, operation: "approved" },
    occurredAt: input.occurredAt,
    postedAt: input.postedAt,
    reversesTransactionId: null,
    entries
  });
}

function accountCode(bucket: OnlineWalletRefundApprovalJournalConsumption["bucket"]):
  | "astrologer_pending"
  | "astrologer_available"
  | "astrologer_reserved" {
  if (bucket === "pending") return "astrologer_pending";
  if (bucket === "available") return "astrologer_available";
  if (bucket === "reserved") return "astrologer_reserved";
  fail();
}

function normalizeSources(
  sources: readonly OnlineWalletRefundApprovalSource[]
): readonly OnlineWalletRefundApprovalSource[] {
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
      fail();
    }
    return Object.freeze({ ...source });
  });
  const keys = normalized.map((source) => `${source.sourceKind}:${source.sourceId}`);
  if (new Set(keys).size !== normalized.length) fail();
  return Object.freeze(
    normalized.sort((left, right) =>
      `${left.rootLotId}:${left.sourceKind}:${left.sourceId}`.localeCompare(
        `${right.rootLotId}:${right.sourceKind}:${right.sourceId}`
      )
    )
  );
}

function identifier(value: unknown): asserts value is string {
  if (typeof value !== "string" || value.length < 1 || value.length > 200 || value.trim() !== value) {
    fail();
  }
}

function positiveMinor(value: unknown): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) fail();
}

function nonNegativeMinor(value: unknown): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) fail();
}

function bps(value: unknown): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > 10_000
  )
    fail();
}

function fail(): never {
  throw new OnlineWalletRefundApprovalIntegrityError();
}
