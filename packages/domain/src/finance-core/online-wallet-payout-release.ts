import {
  createFinanceJournalTransaction,
  type FinanceJournalTransaction
} from "./journal";

export type OnlineWalletPayoutPendingSource = Readonly<{
  payoutPendingAllocationId: string;
  rootLotId: string;
  orderId: string;
  amountMinor: number;
}>;

export class OnlineWalletPayoutReleaseIntegrityError extends Error {
  readonly code = "online_wallet_payout_release_integrity_error";

  constructor() {
    super("Online payout release cannot restore an invalid pending allocation set");
    this.name = "OnlineWalletPayoutReleaseIntegrityError";
  }
}

/**
 * A payout that definitively did not leave ElevenHouse's bank account restores exactly its
 * original v2 payout-pending positions. No balance is edited in place and no bank/cash entry is
 * invented: this is only the liability reclassification back to available.
 */
export function createOnlineWalletPayoutReleaseJournal(input: {
  readonly payoutRequestId: string;
  readonly astrologerUserId: string;
  readonly occurredAt: string;
  readonly postedAt: string;
  readonly pendingSources: readonly OnlineWalletPayoutPendingSource[];
}): FinanceJournalTransaction {
  identifier(input.payoutRequestId);
  identifier(input.astrologerUserId);
  if (input.pendingSources.length === 0) throw new OnlineWalletPayoutReleaseIntegrityError();
  const seen = new Set<string>();
  const entries = input.pendingSources.flatMap((source) => {
    identifier(source.payoutPendingAllocationId);
    identifier(source.rootLotId);
    identifier(source.orderId);
    positiveMinor(source.amountMinor);
    if (seen.has(source.payoutPendingAllocationId)) throw new OnlineWalletPayoutReleaseIntegrityError();
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
          code: "astrologer_available" as const,
          astrologerUserId: input.astrologerUserId,
          currency: "RUB" as const
        },
        side: "credit" as const,
        amount,
        links
      }
    ];
  });
  return createFinanceJournalTransaction({
    id: `online-wallet-payout-release:${input.payoutRequestId}`,
    sourceKey: { kind: "payout", sourceId: input.payoutRequestId, operation: "released" },
    occurredAt: input.occurredAt,
    postedAt: input.postedAt,
    reversesTransactionId: null,
    entries
  });
}

function identifier(value: string): void {
  if (value.trim() !== value || value.length === 0 || value.length > 200) {
    throw new OnlineWalletPayoutReleaseIntegrityError();
  }
}

function positiveMinor(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw new OnlineWalletPayoutReleaseIntegrityError();
}
