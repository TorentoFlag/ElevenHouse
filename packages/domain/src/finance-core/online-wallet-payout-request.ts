export type OnlineWalletAvailableSource = Readonly<{
  allocationId: string;
  rootLotId: string;
  amountMinor: number;
}>;

export type OnlineWalletPayoutRequestConsumption = Readonly<{
  allocationId: string;
  rootLotId: string;
  sourceAmountMinor: number;
  payoutPendingMinor: number;
  availableRemainderMinor: number;
  payoutAllocationId: string;
}>;

export type OnlineWalletPayoutRequestPlan = Readonly<{
  payoutPendingMinor: number;
  availableMinor: number;
  consumptions: readonly OnlineWalletPayoutRequestConsumption[];
}>;

export type OnlineWalletPayoutJournalConsumption = Readonly<{
  allocationId: string;
  rootLotId: string;
  orderId: string;
  sourceAmountMinor: number;
  payoutPendingMinor: number;
  availableRemainderMinor: number;
  payoutAllocationId: string;
}>;

export class OnlineWalletPayoutRequestIntegrityError extends Error {
  readonly code = "online_wallet_payout_request_integrity_error";

  constructor() {
    super("Online wallet payout request input is invalid");
    this.name = "OnlineWalletPayoutRequestIntegrityError";
  }
}

/**
 * Deterministically selects whole v2 available positions for a manual payout request. A selected
 * position is fully consumed by the persistence transaction; any unrequested remainder is a new
 * immutable available child position, never an in-place balance adjustment.
 */
export function createOnlineWalletPayoutRequestPlan(input: {
  readonly payoutRequestId: string;
  readonly amountMinor: number;
  readonly availableSources: readonly OnlineWalletAvailableSource[];
}): OnlineWalletPayoutRequestPlan {
  identifier(input.payoutRequestId);
  positiveMinor(input.amountMinor);
  if (input.availableSources.length === 0) throw new OnlineWalletPayoutRequestIntegrityError();

  const sources = [...input.availableSources]
    .map((source) => {
      allocationIdentifier(source.allocationId);
      identifier(source.rootLotId);
      positiveMinor(source.amountMinor);
      return Object.freeze({ ...source });
    })
    .sort((left, right) => left.allocationId.localeCompare(right.allocationId));
  if (new Set(sources.map((source) => source.allocationId)).size !== sources.length) {
    throw new OnlineWalletPayoutRequestIntegrityError();
  }

  let remaining = input.amountMinor;
  const consumptions: OnlineWalletPayoutRequestConsumption[] = [];
  for (const source of sources) {
    if (remaining === 0) break;
    const payoutPendingMinor = Math.min(source.amountMinor, remaining);
    const availableRemainderMinor = source.amountMinor - payoutPendingMinor;
    consumptions.push(
      Object.freeze({
        allocationId: source.allocationId,
        rootLotId: source.rootLotId,
        sourceAmountMinor: source.amountMinor,
        payoutPendingMinor,
        availableRemainderMinor,
        payoutAllocationId: `online-wallet-payout:${digestFinanceCanonicalValueV1([
          input.payoutRequestId,
          source.allocationId
        ])}`
      })
    );
    remaining -= payoutPendingMinor;
  }
  if (remaining !== 0) throw new OnlineWalletPayoutRequestIntegrityError();

  return Object.freeze({
    payoutPendingMinor: input.amountMinor,
    availableMinor: consumptions.reduce(
      (total, consumption) => total + consumption.availableRemainderMinor,
      0
    ),
    consumptions: Object.freeze(consumptions)
  });
}

/**
 * The initial manual-payout journal only reclassifies the astrologer's liability. It never
 * represents a bank transfer: that later fact is recorded only after manual execution is
 * evidenced and confirmed.
 */
export function createOnlineWalletPayoutRequestJournal(input: {
  readonly payoutRequestId: string;
  readonly astrologerUserId: string;
  readonly occurredAt: string;
  readonly postedAt: string;
  readonly consumptions: readonly OnlineWalletPayoutJournalConsumption[];
}): FinanceJournalTransaction {
  identifier(input.payoutRequestId);
  identifier(input.astrologerUserId);
  if (input.consumptions.length === 0) throw new OnlineWalletPayoutRequestIntegrityError();

  const entries = input.consumptions.flatMap((consumption) => {
    allocationIdentifier(consumption.allocationId);
    identifier(consumption.rootLotId);
    identifier(consumption.orderId);
    identifier(consumption.payoutAllocationId);
    positiveMinor(consumption.sourceAmountMinor);
    positiveMinor(consumption.payoutPendingMinor);
    if (
      !Number.isSafeInteger(consumption.availableRemainderMinor) ||
      consumption.availableRemainderMinor < 0 ||
      consumption.sourceAmountMinor !==
        consumption.payoutPendingMinor + consumption.availableRemainderMinor
    ) {
      throw new OnlineWalletPayoutRequestIntegrityError();
    }
    const links = Object.freeze({
      originalSaleId: consumption.orderId,
      componentId: consumption.rootLotId,
      payableLotId: consumption.allocationId,
      payoutAllocationId: null
    });
    const money = (amountMinor: number) => Object.freeze({ amountMinor, currency: "RUB" as const });
    return [
      {
        account: {
          code: "astrologer_available" as const,
          astrologerUserId: input.astrologerUserId,
          currency: "RUB" as const
        },
        side: "debit" as const,
        amount: money(consumption.sourceAmountMinor),
        links
      },
      {
        account: {
          code: "astrologer_payout_pending" as const,
          astrologerUserId: input.astrologerUserId,
          currency: "RUB" as const
        },
        side: "credit" as const,
        amount: money(consumption.payoutPendingMinor),
        links: Object.freeze({ ...links, payoutAllocationId: consumption.payoutAllocationId })
      },
      ...(consumption.availableRemainderMinor > 0
        ? [
            {
              account: {
                code: "astrologer_available" as const,
                astrologerUserId: input.astrologerUserId,
                currency: "RUB" as const
              },
              side: "credit" as const,
              amount: money(consumption.availableRemainderMinor),
              links
            }
          ]
        : [])
    ];
  });
  return createFinanceJournalTransaction({
    id: `online-wallet-payout-request:${input.payoutRequestId}`,
    sourceKey: { kind: "payout", sourceId: input.payoutRequestId, operation: "requested" },
    occurredAt: input.occurredAt,
    postedAt: input.postedAt,
    reversesTransactionId: null,
    entries
  });
}

function identifier(value: string): void {
  if (value.trim() !== value || value.length === 0 || value.length > 160) {
    throw new OnlineWalletPayoutRequestIntegrityError();
  }
}

function allocationIdentifier(value: string): void {
  if (value.trim() !== value || value.length === 0 || value.length > 200) {
    throw new OnlineWalletPayoutRequestIntegrityError();
  }
}

function positiveMinor(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new OnlineWalletPayoutRequestIntegrityError();
  }
}
import { digestFinanceCanonicalValueV1 } from "./finance-canonical-digest";
import { createFinanceJournalTransaction, type FinanceJournalTransaction } from "./journal";
