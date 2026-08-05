import { describe, expect, it } from "vitest";
import { createFinanceSourceKey } from "./finance-source-key";
import { createFinanceJournalTransaction, reverseFinanceJournalTransaction } from "./journal";
import { createFinanceLedgerAccountRef } from "./ledger-chart";
import { emptySourceLotState } from "./wallet-reference-source-test-fixtures";
import {
  noLinks,
  projectionInput,
  providerAccount,
  rebuildAstrologerWalletProjection,
  saleJournal,
  stored
} from "./wallet-reference-test-fixtures";

describe("wallet reference journal integrity", () => {
  it("reports duplicate journal identity and source as typed journal discrepancies", () => {
    const sale = saleJournal();
    const result = rebuildAstrologerWalletProjection({
      ...projectionInput(),
      journalTransactions: [sale, sale]
    });

    expect(result.status).toBe("discrepant");
    expect(result.discrepancies).toContainEqual({
      kind: "journal_duplicate_transaction_id",
      transactionId: "journal-sale"
    });
    expect(result.discrepancies).toContainEqual({
      kind: "journal_duplicate_source_key",
      sourceKey: '["order","order-1","sale_captured"]'
    });
  });

  it("rejects unrelated journal authority for a stored recovery receivable", () => {
    const recoveryAccount = createFinanceLedgerAccountRef({
      code: "astrologer_recovery_receivable",
      astrologerUserId: "astrologer-1",
      currency: "RUB"
    });
    const unrelatedRecovery = createFinanceJournalTransaction({
      id: "journal-unapproved-recovery",
      sourceKey: createFinanceSourceKey({
        kind: "provider_fee",
        sourceId: "provider-fee-1",
        operation: "confirmed"
      }),
      occurredAt: "2026-08-04T00:00:00Z",
      postedAt: "2026-08-04T00:00:01Z",
      reversesTransactionId: null,
      entries: [
        {
          account: recoveryAccount,
          side: "debit",
          amount: { amountMinor: 2_000, currency: "RUB" },
          links: noLinks
        },
        {
          account: providerAccount,
          side: "credit",
          amount: { amountMinor: 2_000, currency: "RUB" },
          links: noLinks
        }
      ]
    });

    const result = rebuildAstrologerWalletProjection({
      ...projectionInput(),
      journalTransactions: [...projectionInput().journalTransactions, unrelatedRecovery],
      storedWallet: stored({
        balances: { ...stored().balances, recoveryReceivableMinor: "2000" }
      })
    });

    expect(result.status).toBe("discrepant");
    expect(result.discrepancies).toContainEqual({
      kind: "journal_recovery_authority_mismatch",
      transactionId: "journal-unapproved-recovery",
      entryIndex: 0,
      reason: "source_not_approved"
    });
  });

  it("requires operation-specific recovery links and journal side", () => {
    const recoveryAccount = createFinanceLedgerAccountRef({
      code: "astrologer_recovery_receivable",
      astrologerUserId: "astrologer-1",
      currency: "RUB"
    });
    const cases = [
      {
        id: "missing-original-sale",
        sourceKey: createFinanceSourceKey({
          kind: "refund",
          sourceId: "refund-1",
          operation: "confirmed"
        }),
        side: "debit" as const,
        links: { ...noLinks, componentId: "recovery-1", payoutAllocationId: "allocation-1" },
        reason: "original_sale_link_required"
      },
      {
        id: "missing-component",
        sourceKey: createFinanceSourceKey({
          kind: "chargeback",
          sourceId: "chargeback-1",
          operation: "principal_allocated"
        }),
        side: "debit" as const,
        links: { ...noLinks, originalSaleId: "order-1", payoutAllocationId: "allocation-1" },
        reason: "component_link_required"
      },
      {
        id: "missing-payout-allocation",
        sourceKey: createFinanceSourceKey({
          kind: "refund",
          sourceId: "refund-2",
          operation: "bridge_payout_paid"
        }),
        side: "debit" as const,
        links: { ...noLinks, originalSaleId: "order-1", componentId: "recovery-1" },
        reason: "payout_allocation_link_required"
      },
      {
        id: "missing-collection-lot",
        sourceKey: createFinanceSourceKey({
          kind: "chargeback",
          sourceId: "chargeback-2",
          operation: "recovery_collected"
        }),
        side: "credit" as const,
        links: { ...noLinks, originalSaleId: "order-1", componentId: "recovery-1" },
        reason: "payable_lot_link_required"
      },
      {
        id: "wrong-side",
        sourceKey: createFinanceSourceKey({
          kind: "chargeback",
          sourceId: "chargeback-3",
          operation: "principal_allocated"
        }),
        side: "credit" as const,
        links: {
          ...noLinks,
          originalSaleId: "order-1",
          componentId: "recovery-1",
          payoutAllocationId: "allocation-1"
        },
        reason: "side_mismatch"
      }
    ] as const;

    for (const testCase of cases) {
      const journal = createFinanceJournalTransaction({
        id: `journal-${testCase.id}`,
        sourceKey: testCase.sourceKey,
        occurredAt: "2026-08-04T00:00:00Z",
        postedAt: "2026-08-04T00:00:01Z",
        reversesTransactionId: null,
        entries: [
          {
            account: recoveryAccount,
            side: testCase.side,
            amount: { amountMinor: 100, currency: "RUB" },
            links: testCase.links
          },
          {
            account: providerAccount,
            side: testCase.side === "debit" ? "credit" : "debit",
            amount: { amountMinor: 100, currency: "RUB" },
            links: testCase.links
          }
        ]
      });
      const result = rebuildAstrologerWalletProjection({
        ...projectionInput(),
        journalTransactions: [...projectionInput().journalTransactions, journal],
        storedWallet: stored({
          balances: {
            ...stored().balances,
            recoveryReceivableMinor: testCase.side === "debit" ? "100" : "0"
          }
        })
      });

      expect(result.discrepancies, testCase.id).toContainEqual({
        kind: "journal_recovery_authority_mismatch",
        transactionId: journal.id,
        entryIndex: 0,
        reason: testCase.reason
      });
    }
  });

  it("reports an orphan reversal even when the stored wallet mirrors its balance", () => {
    const recoveryAccount = createFinanceLedgerAccountRef({
      code: "astrologer_recovery_receivable",
      astrologerUserId: "astrologer-1",
      currency: "RUB"
    });
    const orphan = createFinanceJournalTransaction({
      id: "journal-orphan-reversal",
      sourceKey: createFinanceSourceKey({
        kind: "correction",
        sourceId: "journal-missing-original",
        operation: "reversal"
      }),
      occurredAt: "2026-08-04T00:00:00Z",
      postedAt: "2026-08-04T00:00:01Z",
      reversesTransactionId: "journal-missing-original",
      entries: [
        {
          account: recoveryAccount,
          side: "debit",
          amount: { amountMinor: 2_000, currency: "RUB" },
          links: noLinks
        },
        {
          account: providerAccount,
          side: "credit",
          amount: { amountMinor: 2_000, currency: "RUB" },
          links: noLinks
        }
      ]
    });

    const result = rebuildAstrologerWalletProjection({
      ...projectionInput(),
      journalTransactions: [...projectionInput().journalTransactions, orphan],
      storedWallet: stored({
        balances: { ...stored().balances, recoveryReceivableMinor: "2000" }
      })
    });

    expect(result.discrepancies).toContainEqual({
      kind: "journal_orphan_reversal",
      transactionId: "journal-orphan-reversal",
      reversesTransactionId: "journal-missing-original"
    });
  });

  it("reports a forged or repeated reversal by comparing the whole canonical transaction", () => {
    const original = saleJournal();
    const exactReversal = reverseFinanceJournalTransaction({
      original,
      id: "journal-sale-reversal",
      sourceKey: createFinanceSourceKey({
        kind: "correction",
        sourceId: original.id,
        operation: "reversal"
      }),
      occurredAt: "2026-08-04T00:00:00Z",
      postedAt: "2026-08-04T00:00:01Z"
    });
    const forgedReversal = createFinanceJournalTransaction({
      id: "journal-forged-reversal",
      sourceKey: createFinanceSourceKey({
        kind: "correction",
        sourceId: original.id,
        operation: "reversal"
      }),
      occurredAt: "2026-08-04T00:00:00Z",
      postedAt: "2026-08-04T00:00:01Z",
      reversesTransactionId: original.id,
      entries: exactReversal.entries.map((entry, index) => ({
        ...entry,
        links: index === 1 ? { ...entry.links, payableLotId: "lot-forged-reversal" } : entry.links
      }))
    });

    const forged = rebuildAstrologerWalletProjection({
      ...projectionInput(),
      journalTransactions: [original, forgedReversal],
      sourceLotState: emptySourceLotState(),
      storedWallet: stored({
        balances: {
          pendingMinor: "0",
          availableMinor: "0",
          reservedMinor: "0",
          payoutPendingMinor: "0",
          refundPendingMinor: "0",
          recoveryReceivableMinor: "0"
        }
      })
    });
    expect(forged.discrepancies).toContainEqual({
      kind: "journal_reversal_mismatch",
      transactionId: "journal-forged-reversal",
      reversesTransactionId: original.id
    });

    const repeated = rebuildAstrologerWalletProjection({
      ...projectionInput(),
      journalTransactions: [
        original,
        exactReversal,
        { ...exactReversal, id: "journal-sale-reversal-again" }
      ],
      sourceLotState: emptySourceLotState(),
      storedWallet: stored({
        balances: {
          pendingMinor: "0",
          availableMinor: "0",
          reservedMinor: "0",
          payoutPendingMinor: "0",
          refundPendingMinor: "0",
          recoveryReceivableMinor: "0"
        }
      })
    });
    expect(repeated.discrepancies).toContainEqual({
      kind: "journal_duplicate_reversal",
      transactionId: "journal-sale-reversal-again",
      reversesTransactionId: original.id,
      firstReversalTransactionId: "journal-sale-reversal"
    });
  });

  it("selects the first duplicate reversal by instant rather than ISO string ordering", () => {
    const original = saleJournal();
    const early = reverseFinanceJournalTransaction({
      original,
      id: "journal-z-early-reversal",
      sourceKey: createFinanceSourceKey({
        kind: "correction",
        sourceId: original.id,
        operation: "reversal"
      }),
      occurredAt: "2026-08-04T00:00:00Z",
      postedAt: "2026-08-04T00:00:00Z"
    });
    const late = reverseFinanceJournalTransaction({
      original,
      id: "journal-a-late-reversal",
      sourceKey: createFinanceSourceKey({
        kind: "correction",
        sourceId: original.id,
        operation: "reversal"
      }),
      occurredAt: "2026-08-04T00:00:00.1Z",
      postedAt: "2026-08-04T00:00:00.1Z"
    });

    const result = rebuildAstrologerWalletProjection({
      ...projectionInput(),
      journalTransactions: [original, late, early],
      sourceLotState: emptySourceLotState(),
      storedWallet: stored({
        balances: {
          pendingMinor: "0",
          availableMinor: "0",
          reservedMinor: "0",
          payoutPendingMinor: "0",
          refundPendingMinor: "0",
          recoveryReceivableMinor: "0"
        }
      })
    });

    expect(result.discrepancies).toContainEqual({
      kind: "journal_duplicate_reversal",
      transactionId: late.id,
      reversesTransactionId: original.id,
      firstReversalTransactionId: early.id
    });
  });
});
