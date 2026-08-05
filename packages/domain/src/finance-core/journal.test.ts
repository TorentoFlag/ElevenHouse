import { describe, expect, it } from "vitest";
import { createFinanceSourceKey } from "./finance-source-key";
import {
  createFinanceJournalTransaction,
  FinanceJournalIntegrityError,
  projectFinanceAccountBalance,
  reverseFinanceJournalTransaction
} from "./journal";
import { createFinanceLedgerAccountRef } from "./ledger-chart";

const occurredAt = "2026-08-03T10:00:00.000Z";
const postedAt = "2026-08-03T10:00:01.000Z";
const providerAccount = createFinanceLedgerAccountRef({
  code: "arc_provider_clearing",
  arcProviderAccountId: "arc-account-1",
  currency: "RUB"
});
const pending = createFinanceLedgerAccountRef({
  code: "astrologer_pending",
  astrologerUserId: "astrologer-1",
  currency: "RUB"
});
const deferred = createFinanceLedgerAccountRef({
  code: "platform_commission_deferred",
  currency: "RUB"
});
const noLinks = Object.freeze({
  originalSaleId: null,
  componentId: null,
  payableLotId: null,
  payoutAllocationId: null
});
const saleLinks = Object.freeze({
  originalSaleId: "order-1",
  componentId: "payable-component-1",
  payableLotId: "payable-lot-1",
  payoutAllocationId: null
});

describe("finance journal", () => {
  it("creates an immutable balanced one-currency sale transaction", () => {
    const transaction = createFinanceJournalTransaction({
      id: "journal-sale-1",
      sourceKey: createFinanceSourceKey({
        kind: "order",
        sourceId: "order-1",
        operation: "sale_captured"
      }),
      occurredAt,
      postedAt,
      reversesTransactionId: null,
      entries: [
        {
          account: providerAccount,
          side: "debit",
          amount: { amountMinor: 100_000, currency: "RUB" },
          links: noLinks
        },
        {
          account: pending,
          side: "credit",
          amount: { amountMinor: 96_000, currency: "RUB" },
          links: saleLinks
        },
        {
          account: deferred,
          side: "credit",
          amount: { amountMinor: 4_000, currency: "RUB" },
          links: { ...saleLinks, payableLotId: null }
        }
      ]
    });

    expect(transaction.entries).toHaveLength(3);
    expect(transaction.totalDebitMinor).toBe("100000");
    expect(transaction.totalCreditMinor).toBe("100000");
    expect(Object.isFrozen(transaction)).toBe(true);
    expect(Object.isFrozen(transaction.entries)).toBe(true);
    expect(transaction.entries.every(Object.isFrozen)).toBe(true);
    expect(transaction.occurredAt).toBe("2026-08-03T10:00:00Z");
    expect(transaction.postedAt).toBe("2026-08-03T10:00:01Z");
    expect(Object.isFrozen(transaction.entries[1]?.links)).toBe(true);
  });

  it("balances with BigInt when safe entry sums exceed Number.MAX_SAFE_INTEGER", () => {
    const max = Number.MAX_SAFE_INTEGER;
    const transaction = createFinanceJournalTransaction({
      id: "journal-large-1",
      sourceKey: createFinanceSourceKey({
        kind: "order",
        sourceId: "order-large-1",
        operation: "sale_captured"
      }),
      occurredAt,
      postedAt,
      reversesTransactionId: null,
      entries: [
        {
          account: providerAccount,
          side: "debit",
          amount: { amountMinor: max, currency: "RUB" },
          links: noLinks
        },
        {
          account: providerAccount,
          side: "debit",
          amount: { amountMinor: max, currency: "RUB" },
          links: noLinks
        },
        {
          account: deferred,
          side: "credit",
          amount: { amountMinor: max, currency: "RUB" },
          links: noLinks
        },
        {
          account: deferred,
          side: "credit",
          amount: { amountMinor: max, currency: "RUB" },
          links: noLinks
        }
      ]
    });

    expect(transaction.totalDebitMinor).toBe((BigInt(max) * 2n).toString());
    expect(transaction.totalCreditMinor).toBe((BigInt(max) * 2n).toString());
  });

  it.each([
    {
      name: "one entry",
      entries: [
        {
          account: providerAccount,
          side: "debit" as const,
          amount: { amountMinor: 1, currency: "RUB" as const },
          links: noLinks
        }
      ]
    },
    {
      name: "zero entry",
      entries: [
        {
          account: providerAccount,
          side: "debit" as const,
          amount: { amountMinor: 0, currency: "RUB" as const },
          links: noLinks
        },
        {
          account: deferred,
          side: "credit" as const,
          amount: { amountMinor: 0, currency: "RUB" as const },
          links: noLinks
        }
      ]
    },
    {
      name: "unsafe entry",
      entries: [
        {
          account: providerAccount,
          side: "debit" as const,
          amount: { amountMinor: Number.MAX_SAFE_INTEGER + 1, currency: "RUB" as const },
          links: noLinks
        },
        {
          account: deferred,
          side: "credit" as const,
          amount: { amountMinor: Number.MAX_SAFE_INTEGER + 1, currency: "RUB" as const },
          links: noLinks
        }
      ]
    },
    {
      name: "unbalanced",
      entries: [
        {
          account: providerAccount,
          side: "debit" as const,
          amount: { amountMinor: 10, currency: "RUB" as const },
          links: noLinks
        },
        {
          account: deferred,
          side: "credit" as const,
          amount: { amountMinor: 9, currency: "RUB" as const },
          links: noLinks
        }
      ]
    }
  ])("rejects $name journal input", ({ entries }) => {
    expect(() =>
      createFinanceJournalTransaction({
        id: "journal-invalid",
        sourceKey: createFinanceSourceKey({
          kind: "order",
          sourceId: "order-invalid",
          operation: "sale_captured"
        }),
        occurredAt,
        postedAt,
        reversesTransactionId: null,
        entries
      })
    ).toThrow(FinanceJournalIntegrityError);
  });

  it("reverses every original entry without adding a balancing row", () => {
    const original = createFinanceJournalTransaction({
      id: "journal-original",
      sourceKey: createFinanceSourceKey({
        kind: "order",
        sourceId: "order-1",
        operation: "sale_captured"
      }),
      occurredAt,
      postedAt,
      reversesTransactionId: null,
      entries: [
        {
          account: providerAccount,
          side: "debit",
          amount: { amountMinor: 100, currency: "RUB" },
          links: noLinks
        },
        {
          account: pending,
          side: "credit",
          amount: { amountMinor: 96, currency: "RUB" },
          links: saleLinks
        },
        {
          account: deferred,
          side: "credit",
          amount: { amountMinor: 4, currency: "RUB" },
          links: { ...saleLinks, payableLotId: null }
        }
      ]
    });

    const reversal = reverseFinanceJournalTransaction({
      original,
      id: "journal-reversal",
      sourceKey: createFinanceSourceKey({
        kind: "correction",
        sourceId: original.id,
        operation: "reversal"
      }),
      occurredAt: "2026-08-03T11:00:00.000Z",
      postedAt: "2026-08-03T11:00:01.000Z"
    });

    expect(reversal.reversesTransactionId).toBe(original.id);
    expect(reversal.entries).toHaveLength(original.entries.length);
    expect(reversal.entries.map((entry) => entry.side)).toEqual(["credit", "debit", "debit"]);
    expect(reversal.entries.map((entry) => entry.amount)).toEqual(
      original.entries.map((entry) => entry.amount)
    );
    expect(reversal.entries.map((entry) => entry.links)).toEqual(
      original.entries.map((entry) => entry.links)
    );
  });

  it("returns a typed abnormal normal-balance result without clamping it", () => {
    const result = projectFinanceAccountBalance({
      account: pending,
      entries: [
        {
          account: pending,
          side: "debit",
          amount: { amountMinor: 120, currency: "RUB" },
          links: noLinks
        },
        {
          account: pending,
          side: "credit",
          amount: { amountMinor: 20, currency: "RUB" },
          links: noLinks
        }
      ]
    });

    expect(result).toEqual({
      status: "abnormal",
      account: pending,
      currency: "RUB",
      signedNormalBalanceMinor: "-100",
      discrepancy: {
        code: "abnormal_normal_balance",
        expectedNormalSide: "credit"
      }
    });
  });

  it("rejects projection entries from another scoped account", () => {
    const anotherPending = createFinanceLedgerAccountRef({
      code: "astrologer_pending",
      astrologerUserId: "astrologer-2",
      currency: "RUB"
    });
    expect(() =>
      projectFinanceAccountBalance({
        account: pending,
        entries: [
          {
            account: anotherPending,
            side: "credit",
            amount: { amountMinor: 1, currency: "RUB" },
            links: noLinks
          }
        ]
      })
    ).toThrow(FinanceJournalIntegrityError);
  });

  it("requires a reversal source to identify the exact referenced transaction", () => {
    expect(() =>
      createFinanceJournalTransaction({
        id: "journal-reversal-mismatch",
        sourceKey: createFinanceSourceKey({
          kind: "correction",
          sourceId: "journal-original-a",
          operation: "reversal"
        }),
        occurredAt,
        postedAt,
        reversesTransactionId: "journal-original-b",
        entries: [
          {
            account: providerAccount,
            side: "credit",
            amount: { amountMinor: 100, currency: "RUB" },
            links: noLinks
          },
          {
            account: deferred,
            side: "debit",
            amount: { amountMinor: 100, currency: "RUB" },
            links: noLinks
          }
        ]
      })
    ).toThrow(FinanceJournalIntegrityError);

    expect(() =>
      createFinanceJournalTransaction({
        id: "journal-self-reversal",
        sourceKey: createFinanceSourceKey({
          kind: "correction",
          sourceId: "journal-self-reversal",
          operation: "reversal"
        }),
        occurredAt,
        postedAt,
        reversesTransactionId: "journal-self-reversal",
        entries: [
          {
            account: providerAccount,
            side: "credit",
            amount: { amountMinor: 100, currency: "RUB" },
            links: noLinks
          },
          {
            account: deferred,
            side: "debit",
            amount: { amountMinor: 100, currency: "RUB" },
            links: noLinks
          }
        ]
      })
    ).toThrow(FinanceJournalIntegrityError);
  });

  it("strictly rehydrates the original and rejects a reused reversal transaction id", () => {
    const original = createFinanceJournalTransaction({
      id: "journal-original-strict",
      sourceKey: createFinanceSourceKey({
        kind: "order",
        sourceId: "order-1",
        operation: "sale_captured"
      }),
      occurredAt,
      postedAt,
      reversesTransactionId: null,
      entries: [
        {
          account: providerAccount,
          side: "debit",
          amount: { amountMinor: 100, currency: "RUB" },
          links: noLinks
        },
        {
          account: deferred,
          side: "credit",
          amount: { amountMinor: 100, currency: "RUB" },
          links: noLinks
        }
      ]
    });
    const reversalSource = createFinanceSourceKey({
      kind: "correction",
      sourceId: original.id,
      operation: "reversal"
    });

    expect(() =>
      reverseFinanceJournalTransaction({
        original: {
          id: original.id,
          entries: original.entries
        } as never,
        id: "journal-reversal",
        sourceKey: reversalSource,
        occurredAt,
        postedAt
      })
    ).toThrow(FinanceJournalIntegrityError);

    expect(() =>
      reverseFinanceJournalTransaction({
        original,
        id: original.id,
        sourceKey: reversalSource,
        occurredAt,
        postedAt
      })
    ).toThrow(FinanceJournalIntegrityError);
  });

  it("rejects accessors at journal, nested link, reversal, projection, and array boundaries", () => {
    let getterCalls = 0;
    const sourceKey = createFinanceSourceKey({
      kind: "order",
      sourceId: "order-hostile",
      operation: "sale_captured"
    });
    const base = {
      id: "journal-hostile",
      sourceKey,
      occurredAt,
      postedAt,
      reversesTransactionId: null,
      entries: [
        {
          account: providerAccount,
          side: "debit",
          amount: { amountMinor: 1, currency: "RUB" },
          links: noLinks
        },
        {
          account: deferred,
          side: "credit",
          amount: { amountMinor: 1, currency: "RUB" },
          links: noLinks
        }
      ]
    } as const;
    const hostileTop = { ...base } as Record<string, unknown>;
    Object.defineProperty(hostileTop, "occurredAt", {
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error("must not execute");
      }
    });
    expect(() => createFinanceJournalTransaction(hostileTop as never)).toThrow(
      FinanceJournalIntegrityError
    );

    const hostileLinks = { ...noLinks } as Record<string, unknown>;
    Object.defineProperty(hostileLinks, "originalSaleId", {
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error("must not execute");
      }
    });
    expect(() =>
      createFinanceJournalTransaction({
        ...base,
        entries: [{ ...base.entries[0], links: hostileLinks }, base.entries[1]] as never
      })
    ).toThrow(FinanceJournalIntegrityError);

    const hostileEntries = [...base.entries] as unknown[];
    Object.defineProperty(hostileEntries, "0", {
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error("must not execute");
      }
    });
    expect(() =>
      createFinanceJournalTransaction({ ...base, entries: hostileEntries as never })
    ).toThrow(FinanceJournalIntegrityError);

    const original = createFinanceJournalTransaction(base);
    const reversalInput = {
      original,
      id: "journal-hostile-reversal",
      sourceKey: createFinanceSourceKey({
        kind: "correction",
        sourceId: original.id,
        operation: "reversal"
      }),
      occurredAt,
      postedAt
    } as Record<string, unknown>;
    Object.defineProperty(reversalInput, "original", {
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error("must not execute");
      }
    });
    expect(() => reverseFinanceJournalTransaction(reversalInput as never)).toThrow(
      FinanceJournalIntegrityError
    );

    const projectionInput = { account: pending, entries: [] } as Record<string, unknown>;
    Object.defineProperty(projectionInput, "account", {
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error("must not execute");
      }
    });
    expect(() => projectFinanceAccountBalance(projectionInput as never)).toThrow(
      FinanceJournalIntegrityError
    );
    expect(getterCalls).toBe(0);
  });

  it("rejects Proxy-backed journal, nested, reversal, and projection inputs without traps", () => {
    let getCalls = 0;
    const trap = {
      get() {
        getCalls += 1;
        throw new Error("must not execute");
      }
    };
    const base = {
      id: "journal-proxy",
      sourceKey: createFinanceSourceKey({
        kind: "order",
        sourceId: "order-proxy",
        operation: "sale_captured"
      }),
      occurredAt,
      postedAt,
      reversesTransactionId: null,
      entries: [
        {
          account: providerAccount,
          side: "debit" as const,
          amount: { amountMinor: 1, currency: "RUB" as const },
          links: noLinks
        },
        {
          account: deferred,
          side: "credit" as const,
          amount: { amountMinor: 1, currency: "RUB" as const },
          links: noLinks
        }
      ]
    };
    expect(() => createFinanceJournalTransaction(new Proxy(base, trap))).toThrow(
      FinanceJournalIntegrityError
    );
    const firstBaseEntry = base.entries[0];
    const secondBaseEntry = base.entries[1];
    if (!firstBaseEntry || !secondBaseEntry) throw new Error("journal fixture entries required");
    expect(() =>
      createFinanceJournalTransaction({
        ...base,
        entries: [{ ...firstBaseEntry, links: new Proxy({ ...noLinks }, trap) }, secondBaseEntry]
      })
    ).toThrow(FinanceJournalIntegrityError);

    const original = createFinanceJournalTransaction(base);
    const reversalInput = new Proxy(
      {
        original,
        id: "journal-proxy-reversal",
        sourceKey: createFinanceSourceKey({
          kind: "correction",
          sourceId: original.id,
          operation: "reversal"
        }),
        occurredAt: "2026-08-03T11:00:00.000Z",
        postedAt: "2026-08-03T11:00:01.000Z"
      },
      trap
    );
    expect(() => reverseFinanceJournalTransaction(reversalInput)).toThrow(
      FinanceJournalIntegrityError
    );
    expect(() =>
      projectFinanceAccountBalance(
        new Proxy(
          {
            account: pending,
            entries: [
              {
                account: pending,
                side: "credit" as const,
                amount: { amountMinor: 1, currency: "RUB" as const },
                links: noLinks
              }
            ]
          },
          trap
        )
      )
    ).toThrow(FinanceJournalIntegrityError);
    expect(getCalls).toBe(0);
  });
});
