import { describe, expect, it } from "vitest";
import { createFinanceSourceKey } from "./finance-source-key";
import { createFinanceJournalTransaction, FinanceJournalIntegrityError } from "./journal";
import { createFinanceLedgerAccountRef } from "./ledger-chart";

describe("finance journal strict own-data boundary", () => {
  it("rejects a non-enumerable transaction field", () => {
    const providerClearing = createFinanceLedgerAccountRef({
      code: "arc_provider_clearing",
      arcProviderAccountId: "arc-account-1",
      currency: "RUB"
    });
    const deferredRevenue = createFinanceLedgerAccountRef({
      code: "platform_commission_deferred",
      currency: "RUB"
    });
    const input = {
      id: "journal-hidden-field",
      sourceKey: createFinanceSourceKey({
        kind: "order",
        sourceId: "order-hidden-field",
        operation: "sale_captured"
      }),
      occurredAt: "2026-08-03T10:00:00Z",
      postedAt: "2026-08-03T10:00:01Z",
      reversesTransactionId: null,
      entries: [
        {
          account: providerClearing,
          side: "debit" as const,
          amount: { amountMinor: 100, currency: "RUB" as const },
          links: {
            originalSaleId: null,
            componentId: null,
            payableLotId: null,
            payoutAllocationId: null
          }
        },
        {
          account: deferredRevenue,
          side: "credit" as const,
          amount: { amountMinor: 100, currency: "RUB" as const },
          links: {
            originalSaleId: null,
            componentId: null,
            payableLotId: null,
            payoutAllocationId: null
          }
        }
      ]
    };
    Object.defineProperty(input, "postedAt", {
      enumerable: false,
      value: input.postedAt
    });

    expect(() => createFinanceJournalTransaction(input)).toThrow(FinanceJournalIntegrityError);
  });
});
