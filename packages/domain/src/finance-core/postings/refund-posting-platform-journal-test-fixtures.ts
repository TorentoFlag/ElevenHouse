import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import { createFinanceSourceKey } from "../finance-source-key";
import { createFinanceJournalTransaction } from "../journal";
import { createFinanceLedgerAccountRef } from "../ledger-chart";

export type RefundPlatformJournalSourceSpec = Readonly<{
  componentId: string;
  accountCode: "platform_commission_deferred" | "platform_commission_revenue";
  transactionId: string;
  sourceAmountMinor: number;
  allocationAmountMinor: number;
}>;

export function buildRefundPlatformJournalSources(
  orderId: string,
  providerAccountId: string,
  specs: readonly RefundPlatformJournalSourceSpec[]
) {
  const sources = specs.map((spec, index) => {
    const links = Object.freeze({
      originalSaleId: orderId,
      componentId: spec.componentId,
      payableLotId: null,
      payoutAllocationId: null
    });
    const sourceEntry = Object.freeze({
      account: createFinanceLedgerAccountRef({ code: spec.accountCode, currency: "RUB" }),
      side: "credit" as const,
      amount: money(spec.sourceAmountMinor),
      links
    });
    const balancingEntry = Object.freeze({
      account:
        spec.accountCode === "platform_commission_deferred"
          ? createFinanceLedgerAccountRef({
              code: "arc_provider_clearing",
              arcProviderAccountId: providerAccountId,
              currency: "RUB"
            })
          : createFinanceLedgerAccountRef({
              code: "platform_commission_deferred",
              currency: "RUB"
            }),
      side: "debit" as const,
      amount: money(spec.sourceAmountMinor),
      links
    });
    const occurredAt = `2026-08-03T0${index + 7}:00:00Z`;
    const transaction = createFinanceJournalTransaction({
      id: spec.transactionId,
      sourceKey: createFinanceSourceKey({
        kind: "order",
        sourceId: orderId,
        operation:
          spec.accountCode === "platform_commission_deferred"
            ? "sale_captured"
            : "commission_earned"
      }),
      occurredAt,
      postedAt: occurredAt,
      reversesTransactionId: null,
      entries: [sourceEntry, balancingEntry]
    });
    return Object.freeze({
      ...spec,
      sourceJournalEntryIndex: 0,
      sourceEntryDigest: hashFinanceCommandPayload(sourceEntry),
      transaction
    });
  });
  return Object.freeze({
    sources: Object.freeze(sources),
    journals: Object.freeze(sources.map((source) => source.transaction))
  });
}

function money(amountMinor: number) {
  return Object.freeze({ amountMinor, currency: "RUB" as const });
}
