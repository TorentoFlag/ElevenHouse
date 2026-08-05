import { describe, expect, it } from "vitest";
import { createFinanceSourceKey } from "./finance-source-key";
import { createFinanceJournalTransaction } from "./journal";
import { createFinanceLedgerAccountRef } from "./ledger-chart";
import {
  WalletProjectionIntegrityError,
  rebuildAstrologerWalletProjection as rebuildAstrologerWalletProjectionWithEnvelope
} from "./wallet-projection";
import {
  emptySourceLotState,
  releasedSourceLotState
} from "./wallet-reference-source-test-fixtures";
import {
  availableAccount,
  noLinks,
  projectionInput,
  providerAccount,
  rebuildAstrologerWalletProjection,
  releaseJournal,
  saleJournal,
  stored
} from "./wallet-reference-test-fixtures";

describe("astrologer wallet projection facade and hydration", () => {
  it("rebuilds five journal liabilities, exact active lots and recovery receivable consistently", () => {
    const result = rebuildAstrologerWalletProjection(projectionInput());

    expect(result.status).toBe("consistent");
    expect(result.integrityStatus).toBe("unverified");
    expect(result.journalBalances).toEqual({
      pendingMinor: "0",
      availableMinor: "8640",
      reservedMinor: "960",
      payoutPendingMinor: "0",
      refundPendingMinor: "0",
      recoveryReceivableMinor: "0"
    });
    expect(result.lotBalances).toEqual({
      pendingMinor: "0",
      availableMinor: "8640",
      reservedMinor: "960",
      payoutPendingMinor: "0",
      refundPendingMinor: "0"
    });
    expect(result.storedBalances).toEqual(result.journalBalances);
    expect(result.discrepancies).toEqual([]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.discrepancies)).toBe(true);
    expect(Object.isFrozen(result.journalBalances)).toBe(true);
    expect(Object.isFrozen(result.lotBalances)).toBe(true);
    expect(Object.isFrozen(result.storedBalances)).toBe(true);
  });

  it("returns typed source-lot and stored-wallet discrepancies without choosing a correction", () => {
    const result = rebuildAstrologerWalletProjection({
      ...projectionInput(),
      sourceLotState: releasedSourceLotState({
        reserveBps: 1_667,
        availableMinor: 8_000,
        reservedMinor: 1_600
      }),
      storedWallet: stored({
        balances: {
          pendingMinor: "0",
          availableMinor: "8500",
          reservedMinor: "960",
          payoutPendingMinor: "0",
          refundPendingMinor: "0",
          recoveryReceivableMinor: "0"
        }
      })
    });

    expect(result.status).toBe("discrepant");
    expect(
      result.discrepancies.filter(
        (discrepancy) =>
          discrepancy.kind !== "source_lot_journal_edge_mismatch" &&
          discrepancy.kind !== "source_lot_receipt_mismatch"
      )
    ).toEqual([
      {
        kind: "source_lot_balance_mismatch",
        bucket: "available",
        journalMinor: "8640",
        lotMinor: "8000"
      },
      {
        kind: "source_lot_balance_mismatch",
        bucket: "reserved",
        journalMinor: "960",
        lotMinor: "1600"
      },
      {
        kind: "stored_wallet_balance_mismatch",
        balance: "available",
        journalMinor: "8640",
        storedMinor: "8500"
      }
    ]);
    expect(result.discrepancies).toContainEqual({
      kind: "source_lot_receipt_mismatch",
      reason: "history_digest_mismatch",
      operationId: "hold-release-1"
    });
    expect(result.discrepancies).toContainEqual({
      kind: "source_lot_receipt_mismatch",
      reason: "state_digest_mismatch",
      operationId: "hold-release-1"
    });
    expect(result.journalBalances.availableMinor).toBe("8640");
    expect(result.lotBalances.availableMinor).toBe("8000");
    expect(result.storedBalances.availableMinor).toBe("8500");
    expect(result.discrepancies.every((discrepancy) => Object.isFrozen(discrepancy))).toBe(true);
  });

  it("projects an approved astrologer recovery receivable from the journal, never from payable lots", () => {
    const recovery = createFinanceLedgerAccountRef({
      code: "astrologer_recovery_receivable",
      astrologerUserId: "astrologer-1",
      currency: "RUB"
    });
    const suspense = createFinanceLedgerAccountRef({
      code: "chargeback_principal_suspense",
      arcProviderAccountId: "arc-account-live",
      currency: "RUB"
    });
    const recoveryJournal = createFinanceJournalTransaction({
      id: "journal-recovery",
      sourceKey: createFinanceSourceKey({
        kind: "chargeback",
        sourceId: "chargeback-1",
        operation: "principal_allocated"
      }),
      occurredAt: "2026-08-04T00:00:00Z",
      postedAt: "2026-08-04T00:00:01Z",
      reversesTransactionId: null,
      entries: [
        {
          account: recovery,
          side: "debit",
          amount: { amountMinor: 2_000, currency: "RUB" },
          links: {
            ...noLinks,
            originalSaleId: "order-1",
            componentId: "recovery-1",
            payoutAllocationId: "payout-allocation-1"
          }
        },
        {
          account: suspense,
          side: "credit",
          amount: { amountMinor: 2_000, currency: "RUB" },
          links: { ...noLinks, originalSaleId: "order-1", componentId: "recovery-1" }
        }
      ]
    });

    const result = rebuildAstrologerWalletProjection({
      ...projectionInput(),
      journalTransactions: [saleJournal(), releaseJournal(), recoveryJournal],
      storedWallet: stored({
        balances: { ...stored().balances, recoveryReceivableMinor: "2000" }
      })
    });

    expect(result.status).toBe("consistent");
    expect(result.journalBalances.recoveryReceivableMinor).toBe("2000");
    expect("recoveryReceivableMinor" in result.lotBalances).toBe(false);
  });

  it("returns an abnormal journal balance discrepancy instead of clamping it", () => {
    const abnormal = createFinanceJournalTransaction({
      id: "journal-abnormal-available",
      sourceKey: createFinanceSourceKey({
        kind: "payout",
        sourceId: "payout-abnormal",
        operation: "requested"
      }),
      occurredAt: "2026-08-04T00:00:00Z",
      postedAt: "2026-08-04T00:00:01Z",
      reversesTransactionId: null,
      entries: [
        {
          account: availableAccount,
          side: "debit",
          amount: { amountMinor: 9_000, currency: "RUB" },
          links: noLinks
        },
        {
          account: providerAccount,
          side: "credit",
          amount: { amountMinor: 9_000, currency: "RUB" },
          links: noLinks
        }
      ]
    });
    const result = rebuildAstrologerWalletProjection({
      ...projectionInput(),
      journalTransactions: [abnormal],
      sourceLotState: emptySourceLotState(),
      storedWallet: stored({
        balances: {
          ...stored().balances,
          availableMinor: "0",
          reservedMinor: "0"
        }
      })
    });

    expect(result.status).toBe("discrepant");
    expect(result.discrepancies).toContainEqual({
      kind: "journal_abnormal_balance",
      balance: "available",
      signedNormalBalanceMinor: "-9000",
      expectedNormalSide: "credit"
    });
    expect(result.journalBalances.availableMinor).toBe("-9000");
  });

  it("uses BigInt for aggregate balances beyond the safe integer range", () => {
    const recoveryAccount = createFinanceLedgerAccountRef({
      code: "astrologer_recovery_receivable",
      astrologerUserId: "astrologer-1",
      currency: "RUB"
    });
    const amountMinor = Number.MAX_SAFE_INTEGER;
    const recoveryTransactions = [1, 2].map((sequence) =>
      createFinanceJournalTransaction({
        id: `journal-large-recovery-${sequence}`,
        sourceKey: createFinanceSourceKey({
          kind: "refund",
          sourceId: `refund-large-${sequence}`,
          operation: "confirmed"
        }),
        occurredAt: "2026-08-04T00:00:00Z",
        postedAt: "2026-08-04T00:00:01Z",
        reversesTransactionId: null,
        entries: [
          {
            account: recoveryAccount,
            side: "debit",
            amount: { amountMinor, currency: "RUB" },
            links: {
              ...noLinks,
              originalSaleId: `order-large-${sequence}`,
              componentId: `recovery-large-${sequence}`,
              payoutAllocationId: `allocation-large-${sequence}`
            }
          },
          {
            account: providerAccount,
            side: "credit",
            amount: { amountMinor, currency: "RUB" },
            links: noLinks
          }
        ]
      })
    );
    const expected = "18014398509481982";

    const result = rebuildAstrologerWalletProjection({
      ...projectionInput(),
      journalTransactions: [...projectionInput().journalTransactions, ...recoveryTransactions],
      storedWallet: stored({
        balances: { ...stored().balances, recoveryReceivableMinor: expected }
      })
    });

    expect(result.status).toBe("consistent");
    expect(result.journalBalances.recoveryReceivableMinor).toBe(expected);
    expect(result.storedBalances.recoveryReceivableMinor).toBe(expected);
  });

  it("rejects mixed currency at every wallet hydration boundary", () => {
    expect(() =>
      rebuildAstrologerWalletProjection({ ...projectionInput(), currency: "USD" })
    ).toThrow(WalletProjectionIntegrityError);
    expect(() =>
      rebuildAstrologerWalletProjection({
        ...projectionInput(),
        storedWallet: stored({ currency: "USD" })
      })
    ).toThrow(WalletProjectionIntegrityError);
    expect(() =>
      rebuildAstrologerWalletProjection({
        ...projectionInput(),
        sourceLotState: {
          ...releasedSourceLotState(),
          lots: releasedSourceLotState().lots.map((lot) =>
            lot.lotId === "lot-order-1-available"
              ? { ...lot, amount: { amountMinor: 8_640, currency: "USD" } }
              : lot
          )
        }
      })
    ).toThrow(WalletProjectionIntegrityError);

    const sale = saleJournal();
    expect(() =>
      rebuildAstrologerWalletProjection({
        ...projectionInput(),
        journalTransactions: [
          {
            ...sale,
            entries: sale.entries.map((entry, index) =>
              index === 0
                ? { ...entry, amount: { amountMinor: entry.amount.amountMinor, currency: "USD" } }
                : entry
            )
          }
        ]
      })
    ).toThrow(WalletProjectionIntegrityError);
  });

  it("requires the complete versioned source-lot state and rejects a raw-lot fallback", () => {
    const input = projectionInput();
    const { sourceLotState, ...walletWithoutState } = input;

    expect(() =>
      rebuildAstrologerWalletProjection({
        ...walletWithoutState,
        sourceLots: sourceLotState.lots
      })
    ).toThrow(WalletProjectionIntegrityError);
  });

  it("rejects malformed stored balances and hostile projection envelopes with typed errors", () => {
    expect(() =>
      rebuildAstrologerWalletProjectionWithEnvelope(projectionInput(), undefined)
    ).toThrow(WalletProjectionIntegrityError);
    expect(() =>
      rebuildAstrologerWalletProjection({
        ...projectionInput(),
        storedWallet: stored({ balances: { ...stored().balances, pendingMinor: "01" } })
      })
    ).toThrow(WalletProjectionIntegrityError);
    expect(() =>
      rebuildAstrologerWalletProjection({
        ...projectionInput(),
        storedWallet: stored({ version: 7 })
      })
    ).toThrow(WalletProjectionIntegrityError);
    expect(() =>
      rebuildAstrologerWalletProjection({
        ...projectionInput(),
        storedWallet: stored({ version: "07" })
      })
    ).toThrow(WalletProjectionIntegrityError);

    let getterCalls = 0;
    const input = projectionInput();
    Object.defineProperty(input, "currency", {
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error("must not execute");
      }
    });
    expect(() => rebuildAstrologerWalletProjection(input)).toThrow(WalletProjectionIntegrityError);
    expect(getterCalls).toBe(0);

    expect(() =>
      rebuildAstrologerWalletProjection(
        new Proxy(projectionInput(), {
          ownKeys() {
            throw new Error("proxy trap");
          }
        })
      )
    ).toThrow(WalletProjectionIntegrityError);

    const nestedBalances = { ...stored().balances };
    Object.defineProperty(nestedBalances, "availableMinor", {
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error("must not execute nested getter");
      }
    });
    expect(() =>
      rebuildAstrologerWalletProjection({
        ...projectionInput(),
        storedWallet: stored({ balances: nestedBalances })
      })
    ).toThrow(WalletProjectionIntegrityError);
    expect(getterCalls).toBe(0);

    const sale = saleJournal();
    const sparseEntries = new Array(sale.entries.length);
    sparseEntries[0] = sale.entries[0];
    expect(() =>
      rebuildAstrologerWalletProjection({
        ...projectionInput(),
        journalTransactions: [{ ...sale, entries: sparseEntries }]
      })
    ).toThrow(WalletProjectionIntegrityError);

    let proxyGetCalls = 0;
    const firstEntry = sale.entries[0];
    if (!firstEntry) throw new Error("expected sale journal entry");
    const accountProxy = new Proxy(firstEntry.account, {
      get() {
        proxyGetCalls += 1;
        throw new Error("must not invoke Proxy get");
      }
    });
    const proxiedSale = {
      ...sale,
      entries: [{ ...firstEntry, account: accountProxy }, ...sale.entries.slice(1)]
    };
    const proxiedResult = rebuildAstrologerWalletProjection({
      ...projectionInput(),
      journalTransactions: [proxiedSale, releaseJournal()]
    });
    expect(proxiedResult.status).toBe("consistent");
    expect(proxyGetCalls).toBe(0);
  });
});
