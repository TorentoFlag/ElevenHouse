import { describe, expect, it } from "vitest";
import { createFinanceSourceKey } from "./finance-source-key";
import { createFinanceJournalTransaction } from "./journal";
import { createFinanceLedgerAccountRef } from "./ledger-chart";
import {
  availableAccount,
  noLinks,
  pendingAccount,
  projectionInput,
  providerAccount,
  rebuildAstrologerWalletProjection,
  releaseJournal,
  saleJournal
} from "./wallet-reference-test-fixtures";

describe("wallet reference source-lot journal edges", () => {
  it("reports journal rows belonging to another astrologer instead of silently ignoring them", () => {
    const foreignPending = createFinanceLedgerAccountRef({
      code: "astrologer_pending",
      astrologerUserId: "astrologer-2",
      currency: "RUB"
    });
    const foreignSale = createFinanceJournalTransaction({
      id: "journal-foreign-owner",
      sourceKey: createFinanceSourceKey({
        kind: "order",
        sourceId: "order-foreign",
        operation: "sale_captured"
      }),
      occurredAt: "2026-08-04T00:00:00Z",
      postedAt: "2026-08-04T00:00:01Z",
      reversesTransactionId: null,
      entries: [
        {
          account: providerAccount,
          side: "debit",
          amount: { amountMinor: 100, currency: "RUB" },
          links: noLinks
        },
        {
          account: foreignPending,
          side: "credit",
          amount: { amountMinor: 100, currency: "RUB" },
          links: {
            ...noLinks,
            originalSaleId: "order-foreign",
            componentId: "payable-foreign",
            payableLotId: "lot-foreign"
          }
        }
      ]
    });

    const result = rebuildAstrologerWalletProjection({
      ...projectionInput(),
      journalTransactions: [...projectionInput().journalTransactions, foreignSale]
    });

    expect(result.status).toBe("discrepant");
    expect(result.discrepancies).toContainEqual({
      kind: "journal_foreign_astrologer_account",
      transactionId: "journal-foreign-owner",
      entryIndex: 1,
      astrologerUserId: "astrologer-2"
    });
  });

  it("reports a payable-lot journal edge whose source does not match the lot history", () => {
    const sale = saleJournal();
    const wrongSource = createFinanceJournalTransaction({
      id: "journal-wrong-lot-source",
      sourceKey: createFinanceSourceKey({
        kind: "order",
        sourceId: "order-other",
        operation: "sale_captured"
      }),
      occurredAt: sale.occurredAt,
      postedAt: sale.postedAt,
      reversesTransactionId: null,
      entries: sale.entries.map((entry) => ({
        ...entry,
        links:
          entry.account.code === "astrologer_pending"
            ? { ...entry.links, originalSaleId: "order-other" }
            : entry.links
      }))
    });

    const result = rebuildAstrologerWalletProjection({
      ...projectionInput(),
      journalTransactions: [wrongSource, releaseJournal()]
    });

    expect(result.status).toBe("discrepant");
    expect(result.discrepancies).toContainEqual({
      kind: "source_lot_journal_edge_mismatch",
      reason: "source_key_mismatch",
      transactionId: "journal-wrong-lot-source",
      entryIndex: 1,
      payableLotId: "lot-order-1"
    });
  });

  it("reports each exact payable-lot journal mapping field independently", () => {
    const sale = saleJournal();
    const payableEntryIndex = sale.entries.findIndex(
      (entry) => entry.account.code === "astrologer_pending"
    );
    if (payableEntryIndex < 0) throw new Error("expected payable sale entry");

    const mappedCases = [
      {
        reason: "account_bucket_mismatch",
        entryIndex: payableEntryIndex,
        payableLotId: "lot-order-1",
        transaction: createFinanceJournalTransaction({
          id: "journal-wrong-lot-account",
          sourceKey: sale.sourceKey,
          occurredAt: sale.occurredAt,
          postedAt: sale.postedAt,
          reversesTransactionId: sale.reversesTransactionId,
          entries: sale.entries.map((entry, index) =>
            index === payableEntryIndex ? { ...entry, account: availableAccount } : entry
          )
        })
      },
      {
        reason: "original_sale_link_mismatch",
        entryIndex: payableEntryIndex,
        payableLotId: "lot-order-1",
        transaction: createFinanceJournalTransaction({
          id: "journal-wrong-original-sale-link",
          sourceKey: sale.sourceKey,
          occurredAt: sale.occurredAt,
          postedAt: sale.postedAt,
          reversesTransactionId: sale.reversesTransactionId,
          entries: sale.entries.map((entry, index) =>
            index === payableEntryIndex
              ? { ...entry, links: { ...entry.links, originalSaleId: "order-other" } }
              : entry
          )
        })
      },
      {
        reason: "payable_lot_link_required",
        entryIndex: payableEntryIndex,
        payableLotId: null,
        transaction: createFinanceJournalTransaction({
          id: "journal-missing-payable-lot-link",
          sourceKey: sale.sourceKey,
          occurredAt: sale.occurredAt,
          postedAt: sale.postedAt,
          reversesTransactionId: sale.reversesTransactionId,
          entries: sale.entries.map((entry, index) =>
            index === payableEntryIndex
              ? { ...entry, links: { ...entry.links, payableLotId: null } }
              : entry
          )
        })
      },
      {
        reason: "payable_lot_link_mismatch",
        entryIndex: payableEntryIndex,
        payableLotId: "lot-order-1-available",
        transaction: createFinanceJournalTransaction({
          id: "journal-wrong-payable-lot-link",
          sourceKey: sale.sourceKey,
          occurredAt: sale.occurredAt,
          postedAt: sale.postedAt,
          reversesTransactionId: sale.reversesTransactionId,
          entries: sale.entries.map((entry, index) =>
            index === payableEntryIndex
              ? { ...entry, links: { ...entry.links, payableLotId: "lot-order-1-available" } }
              : entry
          )
        })
      },
      {
        reason: "side_mismatch",
        entryIndex: 0,
        payableLotId: "lot-order-1",
        transaction: createFinanceJournalTransaction({
          id: "journal-wrong-lot-side",
          sourceKey: sale.sourceKey,
          occurredAt: sale.occurredAt,
          postedAt: sale.postedAt,
          reversesTransactionId: null,
          entries: [
            {
              account: pendingAccount,
              side: "debit",
              amount: { amountMinor: 9_600, currency: "RUB" },
              links: {
                ...noLinks,
                originalSaleId: "order-1",
                payableLotId: "lot-order-1"
              }
            },
            {
              account: providerAccount,
              side: "credit",
              amount: { amountMinor: 9_600, currency: "RUB" },
              links: noLinks
            }
          ]
        })
      }
    ] as const;

    for (const testCase of mappedCases) {
      const result = rebuildAstrologerWalletProjection({
        ...projectionInput(),
        journalTransactions: [testCase.transaction, releaseJournal()]
      });

      expect(result.discrepancies, testCase.reason).toContainEqual({
        kind: "source_lot_journal_edge_mismatch",
        reason: testCase.reason,
        transactionId: testCase.transaction.id,
        entryIndex: testCase.entryIndex,
        payableLotId: testCase.payableLotId
      });
    }
  });

  it("reports duplicate and extra payable-lot journal edges even when their net balance matches", () => {
    const sale = saleJournal();
    const pendingEntry = sale.entries.find((entry) => entry.account.code === "astrologer_pending");
    const providerEntry = sale.entries.find(
      (entry) => entry.account.code === "arc_provider_clearing"
    );
    const deferredEntry = sale.entries.find(
      (entry) => entry.account.code === "platform_commission_deferred"
    );
    if (!pendingEntry || !providerEntry || !deferredEntry) {
      throw new Error("expected complete sale journal fixture");
    }
    const duplicateEdge = createFinanceJournalTransaction({
      id: "journal-duplicate-lot-edge",
      sourceKey: sale.sourceKey,
      occurredAt: sale.occurredAt,
      postedAt: sale.postedAt,
      reversesTransactionId: null,
      entries: [
        providerEntry,
        {
          ...pendingEntry,
          amount: { amountMinor: 4_800, currency: "RUB" }
        },
        {
          ...pendingEntry,
          amount: { amountMinor: 4_800, currency: "RUB" }
        },
        deferredEntry
      ]
    });
    const extraEdge = createFinanceJournalTransaction({
      id: "journal-extra-lot-edge",
      sourceKey: createFinanceSourceKey({
        kind: "provider_fee",
        sourceId: "provider-fee-extra-edge",
        operation: "confirmed"
      }),
      occurredAt: "2026-08-04T00:00:00Z",
      postedAt: "2026-08-04T00:00:01Z",
      reversesTransactionId: null,
      entries: [
        {
          account: pendingAccount,
          side: "debit",
          amount: { amountMinor: 1, currency: "RUB" },
          links: { ...noLinks, payableLotId: "lot-not-in-history" }
        },
        {
          account: pendingAccount,
          side: "credit",
          amount: { amountMinor: 1, currency: "RUB" },
          links: { ...noLinks, payableLotId: "lot-not-in-history" }
        }
      ]
    });

    const duplicate = rebuildAstrologerWalletProjection({
      ...projectionInput(),
      journalTransactions: [duplicateEdge, releaseJournal()]
    });
    expect(duplicate.status).toBe("discrepant");
    expect(duplicate.discrepancies).toContainEqual({
      kind: "source_lot_journal_edge_mismatch",
      reason: "amount_mismatch",
      transactionId: "journal-duplicate-lot-edge",
      entryIndex: 1,
      payableLotId: "lot-order-1"
    });
    expect(duplicate.discrepancies).toContainEqual({
      kind: "source_lot_journal_edge_mismatch",
      reason: "duplicate_journal_entry",
      transactionId: "journal-duplicate-lot-edge",
      entryIndex: 2,
      payableLotId: "lot-order-1"
    });

    const extra = rebuildAstrologerWalletProjection({
      ...projectionInput(),
      journalTransactions: [...projectionInput().journalTransactions, extraEdge]
    });
    expect(extra.status).toBe("discrepant");
    expect(extra.discrepancies).toContainEqual({
      kind: "source_lot_journal_edge_mismatch",
      reason: "extra_journal_entry",
      transactionId: "journal-extra-lot-edge",
      entryIndex: 0,
      payableLotId: "lot-not-in-history"
    });
  });

  it("reports lot-history edges that have no journal entry", () => {
    const result = rebuildAstrologerWalletProjection({
      ...projectionInput(),
      journalTransactions: [saleJournal()]
    });

    expect(result.status).toBe("discrepant");
    expect(result.discrepancies).toContainEqual({
      kind: "source_lot_journal_edge_mismatch",
      reason: "missing_journal_entry",
      transactionId: null,
      entryIndex: null,
      payableLotId: "lot-order-1-available"
    });
    expect(result.journalBalances.pendingMinor).toBe("9600");
    expect(result.lotBalances.availableMinor).toBe("8640");
  });
});
