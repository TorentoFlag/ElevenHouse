import { describe, expect, it, vi } from "vitest";
import type {
  ProviderSettlementLedgerEntry,
  ReconciliationRecord,
  ReconciliationStore
} from "@elevenhouse/domain";
import { createSettlementLedgerReconciliationProcessor } from "./settlement-ledger.processor";

const now = new Date("2026-07-27T08:00:00.000Z");

describe("settlement ledger reconciliation processor", () => {
  it("pulls all pages in an overlap window and aggregates reconciliation counts", async () => {
    const calls: Array<{
      readonly from: string;
      readonly to: string;
      readonly limit: number;
      readonly cursor?: string;
      readonly currency?: "RUB";
    }> = [];
    const client = {
      listSettlementLedger: vi.fn(async (input) => {
        calls.push(input);
        if (!input.cursor) {
          return {
            entries: [settlementEntry("ledger-entry-1", "payment-1", 50_000)],
            nextCursor: "cursor-2",
            totalCount: 2
          };
        }
        return {
          entries: [
            settlementEntry("ledger-entry-2", "payment-2", 50_000),
            settlementEntry("ledger-entry-payout", null, 45_000, "payout", "debit")
          ],
          nextCursor: null,
          totalCount: 2
        };
      })
    };
    const store = createProcessorStore();

    const processor = createSettlementLedgerReconciliationProcessor({
      client,
      store,
      provider: "arc_pay",
      lookbackMs: 48 * 60 * 60 * 1000,
      pageLimit: 100,
      currency: "RUB",
      now: () => now
    });

    await expect(processor.tick()).resolves.toEqual({
      pages: 2,
      processed: 2,
      matched: 2,
      exceptions: 0,
      skipped: 1,
      replayed: 0
    });
    expect(calls).toEqual([
      {
        from: "2026-07-25T08:00:00.000Z",
        to: "2026-07-27T08:00:00.000Z",
        limit: 100,
        currency: "RUB"
      },
      {
        from: "2026-07-25T08:00:00.000Z",
        to: "2026-07-27T08:00:00.000Z",
        limit: 100,
        cursor: "cursor-2",
        currency: "RUB"
      }
    ]);
  });
});

function createProcessorStore(): ReconciliationStore {
  const attempts = new Map([
    ["payment-1", paymentAttempt("attempt-1", "payment-1")],
    ["payment-2", paymentAttempt("attempt-2", "payment-2")]
  ]);
  const records: ReconciliationRecord[] = [];
  return {
    findAttemptById: async () => null,
    findAttemptByProviderPaymentId: async (input) => attempts.get(input.providerPaymentId) ?? null,
    createRecord: async (input) => {
      const existing = records.find(
        (record) =>
          record.provider === input.provider &&
          record.providerSettlementId === input.providerSettlementId &&
          record.status === input.status
      );
      if (existing) return { kind: "replayed" as const, record: existing };
      const record: ReconciliationRecord = {
        id: `record-${records.length + 1}`,
        provider: input.provider,
        providerPaymentId: input.providerPaymentId,
        providerPayoutId: input.providerPayoutId,
        providerSettlementId: input.providerSettlementId,
        providerEventId: input.providerEventId,
        status: input.status,
        exceptionCode: input.exceptionCode,
        exceptionMessage: input.exceptionMessage,
        providerOccurredAt: input.providerOccurredAt,
        checkedAt: input.checkedAt,
        resolvedAt: null,
        payload: input.payload
      };
      records.push(record);
      return { kind: "created" as const, record };
    },
    listOpenExceptions: async () => [],
    resolveException: async () => null
  };
}

function paymentAttempt(id: string, providerPaymentId: string) {
  return {
    id,
    orderId: `order-${id}`,
    provider: "arc_pay" as const,
    status: "settled" as const,
    amount: { amountMinor: 50_000, currency: "RUB" as const },
    providerPaymentId,
    providerCheckoutId: `checkout-${id}`,
    idempotencyKey: `checkout:${id}`,
    metadata: {},
    createdAt: "2026-07-27T07:00:00.000Z",
    updatedAt: "2026-07-27T07:00:00.000Z"
  };
}

function settlementEntry(
  providerLedgerEntryId: string,
  providerPaymentId: string | null,
  amountMinor: number,
  referenceType = "payment",
  direction = "credit"
): ProviderSettlementLedgerEntry {
  return {
    provider: "arc_pay",
    providerLedgerEntryId,
    providerPaymentId,
    amount: { amountMinor, currency: "RUB" },
    direction,
    referenceType,
    providerOccurredAt: "2026-07-27T07:45:00.000Z",
    settlementStatus: "cleared",
    raw: {
      entry_id: providerLedgerEntryId,
      reference_type: referenceType,
      reference_id: providerPaymentId
    }
  };
}
