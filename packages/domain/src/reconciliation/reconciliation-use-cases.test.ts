import { describe, expect, it, vi } from "vitest";
import {
  reconcileProviderSettlementLedgerBatch,
  recordProviderReconciliationException,
  recordProviderSettlementMatch,
  ReconciliationAttemptNotFoundError,
  type PaymentAttempt,
  type ProviderSettlementLedgerEntry,
  type PaymentProviderEvent,
  type ReconciliationRecord,
  type ReconciliationStore
} from "../index";

const now = new Date("2026-07-27T08:00:00.000Z");
const paymentAttemptId = "11111111-1111-4111-8111-111111111111";
const providerPaymentId = "22222222-2222-4222-8222-222222222222";
const providerWebhookId = "33333333-3333-4333-8333-333333333333";
const providerEventId = "44444444-4444-4444-8444-444444444444";

describe("provider reconciliation use cases", () => {
  it("records a settled provider event as a matched reconciliation record", async () => {
    const harness = createHarness();

    const result = await recordProviderSettlementMatch({
      store: harness.store,
      paymentAttemptId,
      providerEvent: settledEvent(),
      checkedAt: now
    });

    expect(result.kind).toBe("created");
    expect(harness.records).toEqual([
      expect.objectContaining({
        provider: "arc_pay",
        providerPaymentId,
        providerEventId,
        status: "matched",
        exceptionCode: null,
        checkedAt: now.toISOString(),
        payload: expect.objectContaining({ source: "payment.settled" })
      })
    ]);
  });

  it("records an unresolved reconciliation exception with provider evidence", async () => {
    const harness = createHarness();

    const result = await recordProviderReconciliationException({
      store: harness.store,
      paymentAttemptId,
      providerEvent: exceptionEvent({
        exception_code: "missing_on_bank",
        exception_message: "Capture is absent from bank settlement file"
      }),
      checkedAt: now
    });

    expect(result.kind).toBe("created");
    expect(harness.records).toEqual([
      expect.objectContaining({
        status: "exception",
        exceptionCode: "missing_on_bank",
        exceptionMessage: "Capture is absent from bank settlement file",
        resolvedAt: null
      })
    ]);
  });

  it("rejects settlement reconciliation for an unknown payment attempt", async () => {
    const harness = createHarness({ attemptMissing: true });

    await expect(
      recordProviderSettlementMatch({
        store: harness.store,
        paymentAttemptId,
        providerEvent: settledEvent(),
        checkedAt: now
      })
    ).rejects.toBeInstanceOf(ReconciliationAttemptNotFoundError);

    expect(harness.records).toEqual([]);
  });

  it("matches payment settlement ledger rows by provider payment id without mutating money", async () => {
    const harness = createHarness();

    const result = await reconcileProviderSettlementLedgerBatch({
      store: harness.store,
      provider: "arc_pay",
      checkedAt: now,
      entries: [
        settlementLedgerEntry({
          providerLedgerEntryId: "ledger-entry-1",
          providerPaymentId,
          amountMinor: 50_000,
          currency: "RUB"
        })
      ]
    });

    expect(result).toEqual({ processed: 1, matched: 1, exceptions: 0, skipped: 0, replayed: 0 });
    expect(harness.records).toEqual([
      expect.objectContaining({
        providerPaymentId,
        providerSettlementId: "ledger-entry-1",
        providerEventId: null,
        status: "matched",
        exceptionCode: null,
        payload: expect.objectContaining({
          source: "settlement.ledger",
          providerLedgerEntryId: "ledger-entry-1",
          referenceType: "payment",
          direction: "credit"
        })
      })
    ]);
  });

  it("creates operator-visible exceptions for missing and mismatched settlement ledger rows", async () => {
    const harness = createHarness();

    const result = await reconcileProviderSettlementLedgerBatch({
      store: harness.store,
      provider: "arc_pay",
      checkedAt: now,
      entries: [
        settlementLedgerEntry({
          providerLedgerEntryId: "ledger-entry-missing",
          providerPaymentId: "missing-provider-payment",
          amountMinor: 50_000,
          currency: "RUB"
        }),
        settlementLedgerEntry({
          providerLedgerEntryId: "ledger-entry-mismatch",
          providerPaymentId,
          amountMinor: 49_999,
          currency: "RUB"
        })
      ]
    });

    expect(result).toEqual({ processed: 2, matched: 0, exceptions: 2, skipped: 0, replayed: 0 });
    expect(harness.records).toEqual([
      expect.objectContaining({
        providerPaymentId: "missing-provider-payment",
        providerSettlementId: "ledger-entry-missing",
        status: "exception",
        exceptionCode: "missing_in_elevenhouse",
        exceptionMessage:
          "Provider settlement ledger entry has no matching ElevenHouse payment attempt"
      }),
      expect.objectContaining({
        providerPaymentId,
        providerSettlementId: "ledger-entry-mismatch",
        status: "exception",
        exceptionCode: "amount_mismatch",
        exceptionMessage: "Provider amount differs from local payment attempt"
      })
    ]);
  });

  it("skips non-payment settlement ledger rows and counts idempotent replays", async () => {
    const harness = createHarness();
    harness.records.push({
      id: "existing-record-1",
      provider: "arc_pay",
      providerPaymentId,
      providerPayoutId: null,
      providerSettlementId: "ledger-entry-existing",
      providerEventId: null,
      status: "matched",
      exceptionCode: null,
      exceptionMessage: null,
      providerOccurredAt: "2026-07-27T07:45:00.000Z",
      checkedAt: now.toISOString(),
      resolvedAt: null,
      payload: { source: "settlement.ledger" }
    });

    const result = await reconcileProviderSettlementLedgerBatch({
      store: harness.store,
      provider: "arc_pay",
      checkedAt: now,
      entries: [
        settlementLedgerEntry({
          providerLedgerEntryId: "ledger-entry-existing",
          providerPaymentId,
          amountMinor: 50_000,
          currency: "RUB"
        }),
        settlementLedgerEntry({
          providerLedgerEntryId: "ledger-entry-payout",
          providerPaymentId: null,
          amountMinor: 45_000,
          currency: "RUB",
          referenceType: "payout",
          direction: "debit"
        })
      ]
    });

    expect(result).toEqual({ processed: 1, matched: 0, exceptions: 0, skipped: 1, replayed: 1 });
    expect(harness.records).toHaveLength(1);
  });
});

function createHarness(options: { readonly attemptMissing?: boolean } = {}) {
  const records: ReconciliationRecord[] = [];
  const attempt: PaymentAttempt = {
    id: paymentAttemptId,
    orderId: "55555555-5555-4555-8555-555555555555",
    provider: "arc_pay",
    status: "captured",
    amount: { amountMinor: 50_000, currency: "RUB" },
    providerPaymentId,
    providerCheckoutId: "66666666-6666-4666-8666-666666666666",
    idempotencyKey: "checkout-key",
    metadata: {},
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
  const store: ReconciliationStore = {
    findAttemptById: vi.fn(async () => (options.attemptMissing ? null : attempt)),
    findAttemptByProviderPaymentId: vi.fn(async (input) => {
      if (
        options.attemptMissing ||
        input.provider !== attempt.provider ||
        input.providerPaymentId !== attempt.providerPaymentId
      ) {
        return null;
      }
      return attempt;
    }),
    createRecord: vi.fn(async (input) => {
      const existing = records.find(
        (record) =>
          record.provider === input.provider &&
          record.providerSettlementId === input.providerSettlementId &&
          record.providerEventId === input.providerEventId &&
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
    }),
    listOpenExceptions: vi.fn(),
    resolveException: vi.fn()
  };
  return { records, store };
}

function settlementLedgerEntry(
  overrides: Partial<ProviderSettlementLedgerEntry> & {
    readonly amountMinor?: number;
    readonly currency?: "RUB";
  }
): ProviderSettlementLedgerEntry {
  const amountMinor = overrides.amountMinor ?? overrides.amount?.amountMinor ?? 50_000;
  const currency = overrides.currency ?? overrides.amount?.currency ?? "RUB";
  const providerLedgerEntryId = overrides.providerLedgerEntryId ?? "ledger-entry-default";
  const referenceType = overrides.referenceType ?? "payment";
  const entryOverrides = { ...overrides };
  delete entryOverrides.amountMinor;
  delete entryOverrides.currency;
  delete entryOverrides.amount;
  const entry = {
    provider: "arc_pay",
    providerLedgerEntryId,
    providerPaymentId,
    direction: "credit",
    referenceType,
    providerOccurredAt: "2026-07-27T07:45:00.000Z",
    settlementStatus: "cleared",
    raw: {
      entry_id: providerLedgerEntryId,
      reference_type: referenceType,
      reference_id: providerPaymentId
    },
    ...entryOverrides,
    amount: { amountMinor, currency }
  } satisfies ProviderSettlementLedgerEntry;
  return {
    ...entry,
    raw: {
      ...entry.raw,
      reference_id: entry.providerPaymentId
    }
  };
}

function settledEvent(): PaymentProviderEvent & { readonly type: "payment.settled" } {
  return {
    id: providerEventId,
    paymentAttemptId,
    provider: "arc_pay",
    providerWebhookId,
    providerPaymentId,
    type: "payment.settled",
    occurredAt: "2026-07-27T07:30:00.000Z",
    receivedAt: now.toISOString(),
    payload: {
      event_type: "payment.settled",
      data: {
        payment_id: providerPaymentId,
        settlement_id: "settlement-2026-07-27"
      }
    }
  };
}

function exceptionEvent(
  data: Record<string, unknown>
): PaymentProviderEvent & { readonly type: "reconciliation.exception" } {
  return {
    ...settledEvent(),
    type: "reconciliation.exception",
    payload: {
      event_type: "reconciliation.exception",
      data: { payment_id: providerPaymentId, ...data }
    }
  };
}
