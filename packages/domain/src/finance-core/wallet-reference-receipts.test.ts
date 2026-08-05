import { describe, expect, it } from "vitest";
import { createFinanceJournalTransaction, type FinanceJournalEntryInput } from "./journal";
import { digestValue } from "./source-lot-operation-receipt-core";
import type { PayableLotOperationReceipt } from "./source-lot-operation-receipt";
import { WalletProjectionIntegrityError } from "./wallet-projection";
import { chargebackRecoveryCollectedSourceLotFixture } from "./wallet-reference-recovery-test-fixtures";
import {
  lostRestrictionSourceLotFixture,
  payoutRequestedSourceLotFixture,
  releasedSourceLotFixture
} from "./wallet-reference-source-test-fixtures";
import {
  chargebackSuspenseAccount,
  noLinks,
  payoutRequestJournal,
  projectionInput,
  providerAccount,
  rebuildAstrologerWalletProjection,
  receiptJournal,
  receiptJournalEntries,
  recoveryAccount,
  releaseJournal,
  saleJournal,
  stored
} from "./wallet-reference-test-fixtures";

describe("wallet reference receipt consistency", () => {
  it("compares the economic payout delta without treating a structural remainder as journal turnover", () => {
    const source = payoutRequestedSourceLotFixture();
    const result = rebuildAstrologerWalletProjection({
      astrologerUserId: "astrologer-1",
      currency: "RUB",
      journalTransactions: [saleJournal(), releaseJournal(), payoutRequestJournal()],
      sourceLotState: source.state,
      sourceOperationReceipts: source.receipts,
      storedWallet: stored({
        version: "8",
        balances: {
          pendingMinor: "0",
          availableMinor: "7640",
          reservedMinor: "960",
          payoutPendingMinor: "1000",
          refundPendingMinor: "0",
          recoveryReceivableMinor: "0"
        }
      })
    });

    expect(result.status).toBe("consistent");
    expect(result.discrepancies).toEqual([]);
  });

  it("requires the exact payout allocation link on every payout journal edge", () => {
    const source = payoutRequestedSourceLotFixture();
    const payout = payoutRequestJournal();
    const result = rebuildAstrologerWalletProjection({
      astrologerUserId: "astrologer-1",
      currency: "RUB",
      journalTransactions: [
        saleJournal(),
        releaseJournal(),
        {
          ...payout,
          entries: payout.entries.map((entry) =>
            entry.account.code === "astrologer_payout_pending"
              ? {
                  ...entry,
                  links: { ...entry.links, payoutAllocationId: "payout-forged-allocation" }
                }
              : entry
          )
        }
      ],
      sourceLotState: source.state,
      sourceOperationReceipts: source.receipts,
      storedWallet: stored({
        version: "8",
        balances: {
          pendingMinor: "0",
          availableMinor: "7640",
          reservedMinor: "960",
          payoutPendingMinor: "1000",
          refundPendingMinor: "0",
          recoveryReceivableMinor: "0"
        }
      })
    });

    expect(result.status).toBe("discrepant");
    expect(result.discrepancies).toContainEqual({
      kind: "source_lot_journal_edge_mismatch",
      reason: "payout_allocation_link_mismatch",
      transactionId: "journal-payout-request",
      entryIndex: 1,
      payableLotId: "lot-order-1-payout-pending"
    });
  });

  it("does not require a payable-lot receipt for a restriction-history-only version", () => {
    const source = lostRestrictionSourceLotFixture();
    const result = rebuildAstrologerWalletProjection({
      ...projectionInput(),
      sourceLotState: source.state,
      sourceOperationReceipts: source.receipts
    });

    expect(result.status).toBe("consistent");
    expect(result.integrityStatus).toBe("unverified");
    expect(result.sourceReceiptCoverage).toBe("payable_lot_history_only");
    expect(result.discrepancies).toEqual([]);
  });

  it("reports missing and reordered source receipts and rejects receipt digest drift", () => {
    const source = releasedSourceLotFixture();
    const captureReceipt = source.receipts[0];
    if (!captureReceipt) throw new Error("expected capture receipt");
    const missing = rebuildAstrologerWalletProjection({
      ...projectionInput(),
      sourceOperationReceipts: source.receipts.slice(1)
    });
    expect(missing.discrepancies).toContainEqual({
      kind: "source_lot_receipt_mismatch",
      reason: "missing_receipt",
      operationId: captureReceipt.operationId
    });

    const reordered = rebuildAstrologerWalletProjection({
      ...projectionInput(),
      sourceOperationReceipts: [...source.receipts].reverse()
    });
    expect(reordered.discrepancies).toContainEqual({
      kind: "source_lot_receipt_mismatch",
      reason: "order_mismatch",
      operationId: captureReceipt.operationId
    });

    const drifted = source.receipts.map((receipt, receiptIndex) => ({
      ...receipt,
      effects: receipt.effects.map((effect, effectIndex) =>
        receiptIndex === 0 && effectIndex === 0
          ? {
              ...effect,
              amount: { ...effect.amount, amountMinor: effect.amount.amountMinor + 1 }
            }
          : effect
      )
    }));
    expect(() =>
      rebuildAstrologerWalletProjection({
        ...projectionInput(),
        sourceOperationReceipts: drifted
      })
    ).toThrow(WalletProjectionIntegrityError);
  });

  it("detects a whole-object rehashed receipt and matching forged journal links", () => {
    const source = releasedSourceLotFixture();
    const captureReceipt = source.receipts[0];
    if (!captureReceipt) throw new Error("expected capture receipt");
    const forgedEffects = captureReceipt.effects.map((effect, index) =>
      index === 0
        ? {
            ...effect,
            knownLinks: {
              ...effect.knownLinks,
              originalSaleId: "order-forged",
              payableLotId: "lot-forged"
            }
          }
        : effect
    );
    const forgedSlots = captureReceipt.requiredExternalLinkSlots.map((slot, index) =>
      index === 0
        ? {
            ...slot,
            requiredAuthority: {
              ...slot.requiredAuthority,
              originalSaleId: "order-forged",
              payableLotId: "lot-forged"
            }
          }
        : slot
    );
    const { canonicalDigest: _discardedCaptureDigest, ...forgedCaptureReceiptContent } = {
      ...captureReceipt,
      effects: forgedEffects,
      requiredExternalLinkSlots: forgedSlots
    };
    expect(_discardedCaptureDigest).toBe(captureReceipt.canonicalDigest);
    const forgedCaptureReceipt = {
      ...forgedCaptureReceiptContent,
      canonicalDigest: digestValue(forgedCaptureReceiptContent)
    };
    const sale = saleJournal();
    const forgedSale = {
      ...sale,
      entries: sale.entries.map((entry) =>
        entry.account.code === "astrologer_pending"
          ? {
              ...entry,
              links: {
                ...entry.links,
                originalSaleId: "order-forged",
                payableLotId: "lot-forged"
              }
            }
          : entry
      )
    };

    const result = rebuildAstrologerWalletProjection({
      ...projectionInput(),
      journalTransactions: [forgedSale, releaseJournal()],
      sourceLotState: source.state,
      sourceOperationReceipts: [forgedCaptureReceipt, ...source.receipts.slice(1)]
    });

    expect(result.status).toBe("discrepant");
    expect(result.discrepancies).toContainEqual({
      kind: "source_lot_receipt_mismatch",
      reason: "receipt_semantics_mismatch",
      operationId: captureReceipt.operationId
    });
  });

  it("binds an exact recovery-receivable credit to the recovery-collection receipt", () => {
    const source = chargebackRecoveryCollectedSourceLotFixture();
    const [
      disputedSale,
      disputedHold,
      futureSale,
      futureHold,
      _confirmed,
      principalAllocated,
      recoveryCollected
    ] = source.receipts;
    if (
      !disputedSale ||
      !disputedHold ||
      !futureSale ||
      !futureHold ||
      !principalAllocated ||
      !recoveryCollected
    ) {
      throw new Error("expected complete recovery source receipts");
    }
    expect(_confirmed?.effects).toEqual([]);
    const saleCounterEntry = (receipt: PayableLotOperationReceipt): FinanceJournalEntryInput => ({
      account: providerAccount,
      side: "debit",
      amount: receipt.effects[0]?.amount ?? { amountMinor: 0, currency: "RUB" },
      links: noLinks
    });
    const principalJournal = receiptJournal(principalAllocated, [
      {
        account: recoveryAccount,
        side: "debit",
        amount: { amountMinor: 500, currency: "RUB" },
        links: {
          ...noLinks,
          originalSaleId: "order-wallet-disputed",
          componentId: "wallet-recovery-shortfall",
          payoutAllocationId: "wallet-recovery-shortfall-allocation"
        }
      },
      {
        account: chargebackSuspenseAccount,
        side: "credit",
        amount: { amountMinor: 2_500, currency: "RUB" },
        links: noLinks
      }
    ]);
    const forgedCollectionEntries = receiptJournalEntries(recoveryCollected).map((entry) =>
      entry.account.code === "astrologer_recovery_receivable"
        ? { ...entry, amount: { amountMinor: 100, currency: "RUB" as const } }
        : entry
    );
    const forgedCollectionJournal = createFinanceJournalTransaction({
      id: `journal:${recoveryCollected.operationId}`,
      sourceKey: recoveryCollected.sourceKey,
      occurredAt: recoveryCollected.occurredAt,
      postedAt: recoveryCollected.occurredAt,
      reversesTransactionId: null,
      entries: [
        ...forgedCollectionEntries,
        {
          account: chargebackSuspenseAccount,
          side: "credit",
          amount: { amountMinor: 400, currency: "RUB" },
          links: noLinks
        }
      ]
    });

    const result = rebuildAstrologerWalletProjection({
      astrologerUserId: "astrologer-1",
      currency: "RUB",
      journalTransactions: [
        receiptJournal(disputedSale, [saleCounterEntry(disputedSale)]),
        receiptJournal(disputedHold),
        receiptJournal(futureSale, [saleCounterEntry(futureSale)]),
        receiptJournal(futureHold),
        principalJournal,
        forgedCollectionJournal
      ],
      sourceLotState: source.state,
      sourceOperationReceipts: source.receipts,
      storedWallet: stored({
        version: String(source.state.version),
        balances: {
          pendingMinor: "0",
          availableMinor: "14780",
          reservedMinor: "1920",
          payoutPendingMinor: "0",
          refundPendingMinor: "0",
          recoveryReceivableMinor: "400"
        }
      })
    });

    expect(result.status).toBe("discrepant");
    expect(result.discrepancies).toContainEqual({
      kind: "source_lot_journal_edge_mismatch",
      reason: "amount_mismatch",
      transactionId: `journal:${recoveryCollected.operationId}`,
      entryIndex: 1,
      payableLotId: "lot-order-wallet-future-available"
    });
  });
});
