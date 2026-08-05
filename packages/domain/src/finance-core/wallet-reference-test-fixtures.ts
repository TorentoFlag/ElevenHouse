import { createFinanceSourceKey } from "./finance-source-key";
import {
  createFinanceJournalTransaction,
  type FinanceJournalEntryInput,
  type FinanceJournalTransaction
} from "./journal";
import { createFinanceLedgerAccountRef } from "./ledger-chart";
import type { PayableLotOperationReceipt } from "./source-lot-operation-receipt";
import { rebuildAstrologerWalletProjection as rebuildAstrologerWalletProjectionWithEnvelope } from "./wallet-projection";
import { releasedSourceLotFixture } from "./wallet-reference-source-test-fixtures";

export const receiptDecoderEnvelope = Object.freeze({
  maxAuthorityRefs: 32,
  maxEffects: 32,
  maxLineage: 64,
  maxComponentSlots: 32,
  maxDecimalDigits: 32
});

export function rebuildAstrologerWalletProjection(input: unknown) {
  return rebuildAstrologerWalletProjectionWithEnvelope(input, receiptDecoderEnvelope);
}

export const noLinks = Object.freeze({
  originalSaleId: null,
  componentId: null,
  payableLotId: null,
  payoutAllocationId: null
});

export const pendingAccount = createFinanceLedgerAccountRef({
  code: "astrologer_pending",
  astrologerUserId: "astrologer-1",
  currency: "RUB"
});
export const availableAccount = createFinanceLedgerAccountRef({
  code: "astrologer_available",
  astrologerUserId: "astrologer-1",
  currency: "RUB"
});
const reservedAccount = createFinanceLedgerAccountRef({
  code: "astrologer_reserved",
  astrologerUserId: "astrologer-1",
  currency: "RUB"
});
export const providerAccount = createFinanceLedgerAccountRef({
  code: "arc_provider_clearing",
  arcProviderAccountId: "arc-account-live",
  currency: "RUB"
});
const deferredAccount = createFinanceLedgerAccountRef({
  code: "platform_commission_deferred",
  currency: "RUB"
});
export const recoveryAccount = createFinanceLedgerAccountRef({
  code: "astrologer_recovery_receivable",
  astrologerUserId: "astrologer-1",
  currency: "RUB"
});
export const chargebackSuspenseAccount = createFinanceLedgerAccountRef({
  code: "chargeback_principal_suspense",
  arcProviderAccountId: "arc-account-live",
  currency: "RUB"
});
const accountByReceiptBucket = Object.freeze({
  pending: pendingAccount,
  available: availableAccount,
  reserved: reservedAccount,
  payout_pending: createFinanceLedgerAccountRef({
    code: "astrologer_payout_pending",
    astrologerUserId: "astrologer-1",
    currency: "RUB"
  }),
  refund_pending: createFinanceLedgerAccountRef({
    code: "astrologer_refund_pending",
    astrologerUserId: "astrologer-1",
    currency: "RUB"
  }),
  recovery_receivable: recoveryAccount
});

export function saleJournal(): FinanceJournalTransaction {
  return createFinanceJournalTransaction({
    id: "journal-sale",
    sourceKey: createFinanceSourceKey({
      kind: "order",
      sourceId: "order-1",
      operation: "sale_captured"
    }),
    occurredAt: "2026-08-01T09:00:00Z",
    postedAt: "2026-08-01T09:00:01Z",
    reversesTransactionId: null,
    entries: [
      {
        account: providerAccount,
        side: "debit",
        amount: { amountMinor: 10_000, currency: "RUB" },
        links: noLinks
      },
      {
        account: pendingAccount,
        side: "credit",
        amount: { amountMinor: 9_600, currency: "RUB" },
        links: {
          ...noLinks,
          originalSaleId: "order-1",
          componentId: "payable-order-1",
          payableLotId: "lot-order-1"
        }
      },
      {
        account: deferredAccount,
        side: "credit",
        amount: { amountMinor: 400, currency: "RUB" },
        links: { ...noLinks, originalSaleId: "order-1", componentId: "commission-order-1" }
      }
    ]
  });
}

export function releaseJournal(): FinanceJournalTransaction {
  return createFinanceJournalTransaction({
    id: "journal-release",
    sourceKey: createFinanceSourceKey({
      kind: "reserve",
      sourceId: "hold-release-1",
      operation: "hold_released"
    }),
    occurredAt: "2026-08-03T10:00:00Z",
    postedAt: "2026-08-03T10:00:01Z",
    reversesTransactionId: null,
    entries: [
      {
        account: pendingAccount,
        side: "debit",
        amount: { amountMinor: 9_600, currency: "RUB" },
        links: { ...noLinks, originalSaleId: "order-1", payableLotId: "lot-order-1" }
      },
      {
        account: availableAccount,
        side: "credit",
        amount: { amountMinor: 8_640, currency: "RUB" },
        links: {
          ...noLinks,
          originalSaleId: "order-1",
          payableLotId: "lot-order-1-available"
        }
      },
      {
        account: reservedAccount,
        side: "credit",
        amount: { amountMinor: 960, currency: "RUB" },
        links: {
          ...noLinks,
          originalSaleId: "order-1",
          payableLotId: "lot-order-1-reserved"
        }
      }
    ]
  });
}

export function payoutRequestJournal(): FinanceJournalTransaction {
  return createFinanceJournalTransaction({
    id: "journal-payout-request",
    sourceKey: createFinanceSourceKey({
      kind: "payout",
      sourceId: "payout-1",
      operation: "requested"
    }),
    occurredAt: "2026-08-04T00:00:00Z",
    postedAt: "2026-08-04T00:00:01Z",
    reversesTransactionId: null,
    entries: [
      {
        account: availableAccount,
        side: "debit",
        amount: { amountMinor: 1_000, currency: "RUB" },
        links: {
          ...noLinks,
          originalSaleId: "order-1",
          payableLotId: "lot-order-1-available",
          payoutAllocationId: "payout-1-allocation-1"
        }
      },
      {
        account: createFinanceLedgerAccountRef({
          code: "astrologer_payout_pending",
          astrologerUserId: "astrologer-1",
          currency: "RUB"
        }),
        side: "credit",
        amount: { amountMinor: 1_000, currency: "RUB" },
        links: {
          ...noLinks,
          originalSaleId: "order-1",
          payableLotId: "lot-order-1-payout-pending",
          payoutAllocationId: "payout-1-allocation-1"
        }
      }
    ]
  });
}

export function receiptJournalEntries(
  receipt: PayableLotOperationReceipt
): readonly FinanceJournalEntryInput[] {
  return receipt.effects.map((effect) => ({
    account: accountByReceiptBucket[effect.bucket],
    side: effect.side,
    amount: effect.amount,
    links: {
      originalSaleId: effect.knownLinks.originalSaleId,
      componentId: `component:${effect.effectId}`,
      payableLotId: effect.knownLinks.payableLotId,
      payoutAllocationId: effect.knownLinks.payoutAllocationId
    }
  }));
}

export function receiptJournal(
  receipt: PayableLotOperationReceipt,
  supplementalEntries: readonly FinanceJournalEntryInput[] = []
): FinanceJournalTransaction {
  return createFinanceJournalTransaction({
    id: `journal:${receipt.operationId}`,
    sourceKey: receipt.sourceKey,
    occurredAt: receipt.occurredAt,
    postedAt: receipt.occurredAt,
    reversesTransactionId: null,
    entries: [...receiptJournalEntries(receipt), ...supplementalEntries]
  });
}

export function stored(overrides: Record<string, unknown> = {}) {
  return {
    walletId: "wallet-astrologer-1-rub",
    version: "7",
    astrologerUserId: "astrologer-1",
    currency: "RUB",
    balances: {
      pendingMinor: "0",
      availableMinor: "8640",
      reservedMinor: "960",
      payoutPendingMinor: "0",
      refundPendingMinor: "0",
      recoveryReceivableMinor: "0"
    },
    ...overrides
  };
}

export function projectionInput(overrides: Record<string, unknown> = {}) {
  const source = releasedSourceLotFixture();
  return {
    astrologerUserId: "astrologer-1",
    currency: "RUB",
    journalTransactions: [saleJournal(), releaseJournal()],
    sourceLotState: source.state,
    sourceOperationReceipts: source.receipts,
    storedWallet: stored(),
    ...overrides
  };
}
