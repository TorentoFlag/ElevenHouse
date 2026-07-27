import { describe, expect, it, vi } from "vitest";
import {
  recordProviderReconciliationException,
  recordProviderSettlementMatch,
  ReconciliationAttemptNotFoundError,
  type PaymentAttempt,
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
        environment: "sandbox",
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
});

function createHarness(options: { readonly attemptMissing?: boolean } = {}) {
  const records: ReconciliationRecord[] = [];
  const attempt: PaymentAttempt = {
    id: paymentAttemptId,
    orderId: "55555555-5555-4555-8555-555555555555",
    provider: "arc_pay",
    environment: "sandbox",
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
    createRecord: vi.fn(async (input) => {
      const existing = records.find(
        (record) =>
          record.provider === input.provider &&
          record.environment === input.environment &&
          record.providerPaymentId === input.providerPaymentId &&
          record.status === input.status
      );
      if (existing) return { kind: "replayed" as const, record: existing };
      const record: ReconciliationRecord = {
        id: `record-${records.length + 1}`,
        provider: input.provider,
        environment: input.environment,
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

function settledEvent(): PaymentProviderEvent & { readonly type: "payment.settled" } {
  return {
    id: providerEventId,
    paymentAttemptId,
    provider: "arc_pay",
    environment: "sandbox",
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
