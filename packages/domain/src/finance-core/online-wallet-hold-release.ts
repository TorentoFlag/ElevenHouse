import { allocateBps } from "../money";
import { createFinanceJournalTransaction, type FinanceJournalTransaction } from "./journal";

export type OnlineWalletHoldReleasePlan = Readonly<{
  pendingMinor: 0;
  availableMinor: number;
  reservedMinor: number;
}>;

export class OnlineWalletHoldReleaseIntegrityError extends Error {
  readonly code = "online_wallet_hold_release_integrity_error";

  constructor() {
    super("Online wallet hold release input is invalid");
    this.name = "OnlineWalletHoldReleaseIntegrityError";
  }
}

/**
 * Pure financial allocation for the first post-capture v2 transition. The persistence adapter
 * supplies the exact root source, expected wallet revision and trusted release authority; this
 * function owns only the deterministic minor-unit split.
 */
export function createOnlineWalletHoldReleasePlan(input: {
  readonly payableAmountMinor: number;
  readonly reserveBps: number;
}): OnlineWalletHoldReleasePlan {
  if (
    !Number.isSafeInteger(input.payableAmountMinor) ||
    input.payableAmountMinor <= 0 ||
    !Number.isSafeInteger(input.reserveBps) ||
    input.reserveBps < 0 ||
    input.reserveBps > 10_000
  ) {
    throw new OnlineWalletHoldReleaseIntegrityError();
  }

  const allocation = allocateBps({ amountMinor: input.payableAmountMinor, bps: input.reserveBps });
  return Object.freeze({
    pendingMinor: 0,
    availableMinor: allocation.remainderMinor,
    reservedMinor: allocation.feeMinor
  });
}

/**
 * Canonical first movement of an online payable: it never changes total astrologer liability;
 * it only replaces the exact pending source with available and/or reserved child positions.
 */
export function createOnlineWalletHoldReleaseJournal(input: {
  readonly rootLotId: string;
  readonly orderId: string;
  readonly astrologerUserId: string;
  readonly payableAmountMinor: number;
  readonly reserveBps: number;
  readonly occurredAt: string;
  readonly postedAt: string;
}): FinanceJournalTransaction {
  const rootLotId = identifier(input.rootLotId);
  const orderId = identifier(input.orderId);
  const astrologerUserId = identifier(input.astrologerUserId);
  const plan = createOnlineWalletHoldReleasePlan(input);
  const links = Object.freeze({
    originalSaleId: orderId,
    componentId: rootLotId,
    payableLotId: rootLotId,
    payoutAllocationId: null
  });
  const money = (amountMinor: number) => Object.freeze({ amountMinor, currency: "RUB" as const });
  const entries = [
    {
      account: { code: "astrologer_pending" as const, astrologerUserId, currency: "RUB" as const },
      side: "debit" as const,
      amount: money(input.payableAmountMinor),
      links
    },
    ...(plan.availableMinor > 0
      ? [
          {
            account: {
              code: "astrologer_available" as const,
              astrologerUserId,
              currency: "RUB" as const
            },
            side: "credit" as const,
            amount: money(plan.availableMinor),
            links
          }
        ]
      : []),
    ...(plan.reservedMinor > 0
      ? [
          {
            account: {
              code: "astrologer_reserved" as const,
              astrologerUserId,
              currency: "RUB" as const
            },
            side: "credit" as const,
            amount: money(plan.reservedMinor),
            links
          }
        ]
      : [])
  ];
  return createFinanceJournalTransaction({
    id: `online-wallet-hold-release:${rootLotId}`,
    sourceKey: { kind: "reserve", sourceId: rootLotId, operation: "hold_released" },
    occurredAt: input.occurredAt,
    postedAt: input.postedAt,
    reversesTransactionId: null,
    entries
  });
}

function identifier(value: string): string {
  if (value.trim() !== value || value.length === 0 || value.length > 150) {
    throw new OnlineWalletHoldReleaseIntegrityError();
  }
  return value;
}
