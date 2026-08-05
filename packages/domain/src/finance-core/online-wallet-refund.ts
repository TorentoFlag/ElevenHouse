import { createFinanceJournalTransaction, type FinanceJournalTransaction } from "./journal";

export type OnlineWalletRefundJournalConsumption = Readonly<{
  sourceId: string;
  rootLotId: string;
  bucket: "pending" | "available" | "reserved" | "payout_pending";
  consumedMinor: number;
}>;

export class OnlineWalletRefundIntegrityError extends Error {
  readonly code = "online_wallet_refund_integrity_error";

  constructor() {
    super("Online wallet refund journal input is invalid");
    this.name = "OnlineWalletRefundIntegrityError";
  }
}

/**
 * Builds the terminal, provider-confirmed v2 refund journal only for value that remains in an
 * active payable position. A paid or in-flight payout deficit is intentionally refused here: it
 * needs a separately authorised recovery/platform-loss resolution, not a silent wallet debit.
 */
export function createOnlineWalletRefundConfirmedJournal(
  input: Readonly<{
    refundId: string;
    orderId: string;
    providerAccountId: string;
    astrologerUserId: string;
    occurredAt: string;
    postedAt: string;
    commissionReversalMinor: number;
    grossAmountMinor: number;
    consumptions: readonly OnlineWalletRefundJournalConsumption[];
    blockedPayoutOutcomeMinor: number;
  }>
): FinanceJournalTransaction {
  identifier(input.refundId);
  identifier(input.orderId);
  identifier(input.providerAccountId);
  identifier(input.astrologerUserId);
  nonNegativeMinor(input.commissionReversalMinor);
  positiveMinor(input.grossAmountMinor);
  nonNegativeMinor(input.blockedPayoutOutcomeMinor);
  if (input.blockedPayoutOutcomeMinor !== 0 || input.consumptions.length === 0) {
    throw new OnlineWalletRefundIntegrityError();
  }

  const seen = new Set<string>();
  const consumptions = input.consumptions.map((consumption) => {
    identifier(consumption.sourceId);
    identifier(consumption.rootLotId);
    positiveMinor(consumption.consumedMinor);
    if (
      (consumption.bucket !== "pending" &&
        consumption.bucket !== "available" &&
        consumption.bucket !== "reserved" &&
        consumption.bucket !== "payout_pending") ||
      seen.has(consumption.sourceId)
    ) {
      throw new OnlineWalletRefundIntegrityError();
    }
    seen.add(consumption.sourceId);
    return Object.freeze({ ...consumption });
  });
  const payableReversalMinor = consumptions.reduce(
    (total, consumption) => total + consumption.consumedMinor,
    0
  );
  if (input.commissionReversalMinor + payableReversalMinor !== input.grossAmountMinor) {
    throw new OnlineWalletRefundIntegrityError();
  }

  const money = (amountMinor: number) => Object.freeze({ amountMinor, currency: "RUB" as const });
  const entries = [
    ...(input.commissionReversalMinor > 0
      ? [
          {
            account: { code: "platform_commission_revenue" as const, currency: "RUB" as const },
            side: "debit" as const,
            amount: money(input.commissionReversalMinor),
            links: emptyLinks()
          }
        ]
      : []),
    ...consumptions.map((consumption) => ({
      account: {
        code: bucketAccountCode(consumption.bucket),
        astrologerUserId: input.astrologerUserId,
        currency: "RUB" as const
      },
      side: "debit" as const,
      amount: money(consumption.consumedMinor),
      links: Object.freeze({
        originalSaleId: input.orderId,
        componentId: consumption.rootLotId,
        payableLotId: consumption.sourceId,
        payoutAllocationId: consumption.bucket === "payout_pending" ? consumption.sourceId : null
      })
    })),
    {
      account: {
        code: "arc_provider_clearing" as const,
        arcProviderAccountId: input.providerAccountId,
        currency: "RUB" as const
      },
      side: "credit" as const,
      amount: money(input.grossAmountMinor),
      links: emptyLinks()
    }
  ];

  return createFinanceJournalTransaction({
    id: `online-wallet-refund:${input.refundId}`,
    sourceKey: { kind: "refund", sourceId: input.refundId, operation: "confirmed" },
    occurredAt: input.occurredAt,
    postedAt: input.postedAt,
    reversesTransactionId: null,
    entries
  });
}

function bucketAccountCode(
  bucket: OnlineWalletRefundJournalConsumption["bucket"]
):
  | "astrologer_pending"
  | "astrologer_available"
  | "astrologer_reserved"
  | "astrologer_payout_pending" {
  switch (bucket) {
    case "pending":
      return "astrologer_pending";
    case "available":
      return "astrologer_available";
    case "reserved":
      return "astrologer_reserved";
    case "payout_pending":
      return "astrologer_payout_pending";
  }
}

function emptyLinks() {
  return Object.freeze({
    originalSaleId: null,
    componentId: null,
    payableLotId: null,
    payoutAllocationId: null
  });
}

function identifier(value: string): void {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    value.length === 0 ||
    value.length > 200
  ) {
    throw new OnlineWalletRefundIntegrityError();
  }
}

function positiveMinor(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw new OnlineWalletRefundIntegrityError();
}

function nonNegativeMinor(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new OnlineWalletRefundIntegrityError();
}
