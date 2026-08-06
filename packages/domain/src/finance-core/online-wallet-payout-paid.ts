import { createFinanceJournalTransaction, type FinanceJournalTransaction } from "./journal";

export type OnlineWalletPayoutPaidPendingSource = Readonly<{
  payoutPendingAllocationId: string;
  rootLotId: string;
  orderId: string;
  amountMinor: number;
}>;

export class OnlineWalletPayoutPaidIntegrityError extends Error {
  readonly code = "online_wallet_payout_paid_integrity_error";

  constructor() {
    super("Online payout paid confirmation requires exact payout-pending sources");
    this.name = "OnlineWalletPayoutPaidIntegrityError";
  }
}

/**
 * The manual-bank transfer fact settles the astrologer's exact payout-pending liability. It does
 * not alter bank cash: the later, deduplicated bank-statement debit settles outbound clearing.
 */
export function createOnlineWalletPayoutPaidJournal(input: {
  readonly payoutRequestId: string;
  readonly astrologerUserId: string;
  readonly bankCashPoolId: string;
  readonly occurredAt: string;
  readonly postedAt: string;
  readonly pendingSources: readonly OnlineWalletPayoutPaidPendingSource[];
}): FinanceJournalTransaction {
  identifier(input.payoutRequestId, 160);
  identifier(input.astrologerUserId, 160);
  identifier(input.bankCashPoolId, 160);
  if (input.pendingSources.length === 0) fail();

  const seen = new Set<string>();
  const entries = input.pendingSources.flatMap((source) => {
    identifier(source.payoutPendingAllocationId, 200);
    identifier(source.rootLotId, 200);
    identifier(source.orderId, 160);
    positiveMinor(source.amountMinor);
    if (seen.has(source.payoutPendingAllocationId)) fail();
    seen.add(source.payoutPendingAllocationId);
    const amount = Object.freeze({ amountMinor: source.amountMinor, currency: "RUB" as const });
    const links = Object.freeze({
      originalSaleId: source.orderId,
      componentId: source.rootLotId,
      payableLotId: source.payoutPendingAllocationId,
      payoutAllocationId: source.payoutPendingAllocationId
    });
    return [
      {
        account: {
          code: "astrologer_payout_pending" as const,
          astrologerUserId: input.astrologerUserId,
          currency: "RUB" as const
        },
        side: "debit" as const,
        amount,
        links
      },
      {
        account: {
          code: "bank_outbound_clearing" as const,
          bankCashPoolId: input.bankCashPoolId,
          currency: "RUB" as const
        },
        side: "credit" as const,
        amount,
        links
      }
    ];
  });

  return createFinanceJournalTransaction({
    id: `online-wallet-payout-paid:${input.payoutRequestId}`,
    sourceKey: { kind: "payout", sourceId: input.payoutRequestId, operation: "paid" },
    occurredAt: input.occurredAt,
    postedAt: input.postedAt,
    reversesTransactionId: null,
    entries
  });
}

function identifier(value: string, maximum: number): void {
  if (value.trim() !== value || value.length === 0 || value.length > maximum) fail();
}

function positiveMinor(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) fail();
}

function fail(): never {
  throw new OnlineWalletPayoutPaidIntegrityError();
}
