import { describe, expect, it } from "vitest";
import {
  capturePaymentProviderWebhook,
  PaymentWebhookAmountMismatchError,
  PaymentWebhookCurrencyMismatchError,
  type CapturedSaleOutboxEvent,
  type CapturedSaleTransactionStore,
  type CapturedSaleUnitOfWork,
  type CreateLedgerTransactionInput,
  type FinanceOrder,
  type PaymentAttempt,
  type PaymentProviderEvent
} from "../index";

const now = "2026-07-24T12:00:00.000Z";
const paymentAttemptId = "11111111-1111-4111-8111-111111111111";
const orderId = "22222222-2222-4222-8222-222222222222";
const providerPaymentId = "33333333-3333-4333-8333-333333333333";
const bookingId = "99999999-9999-4999-8999-999999999999";
type Mutable<T> = { -readonly [Key in keyof T]: T[Key] };

describe("capturePaymentProviderWebhook", () => {
  it("posts a balanced captured sale from the order commission snapshot and emits all outbox requests", async () => {
    const harness = createHarness();

    const result = await capture(harness);

    expect(result.kind).toBe("created");
    expect(harness.transactCalls).toBe(1);
    expect(harness.order.status).toBe("paid");
    expect(harness.ledgerTransactions).toEqual([
      expect.objectContaining({
        operationType: "sale_captured",
        orderId,
        entries: [
          expect.objectContaining({
            side: "debit",
            amount: { amountMinor: 50_000, currency: "RUB" },
            account: {
              accountType: "platform_clearing",
              astrologerUserId: null,
              currency: "RUB"
            }
          }),
          expect.objectContaining({
            side: "credit",
            amount: { amountMinor: 43_000, currency: "RUB" },
            account: {
              accountType: "astrologer_pending",
              astrologerUserId: "44444444-4444-4444-8444-444444444444",
              currency: "RUB"
            }
          }),
          expect.objectContaining({
            side: "credit",
            amount: { amountMinor: 7_000, currency: "RUB" },
            account: {
              accountType: "platform_revenue",
              astrologerUserId: null,
              currency: "RUB"
            }
          })
        ]
      })
    ]);
    expect(harness.walletPendingAmountMinor).toBe(43_000);
    expect(harness.outboxEvents).toEqual([
      expect.objectContaining({
        eventType: "finance.payment_captured",
        aggregateId: paymentAttemptId
      }),
      expect.objectContaining({ eventType: "orders.order_paid", aggregateId: orderId }),
      expect.objectContaining({ eventType: "booking.payment_confirmed", aggregateId: bookingId }),
      expect.objectContaining({
        eventType: "notifications.payment_confirmation_requested",
        aggregateId: orderId
      })
    ]);
    expect(harness.bookingMutationCalls).toBe(1);
  });

  it("replays a captured webhook without another ledger posting, wallet projection, outbox insert, or booking mutation", async () => {
    const harness = createHarness();

    await capture(harness);
    const replay = await capture(harness);

    expect(replay.kind).toBe("replayed");
    expect(harness.providerEvents).toHaveLength(1);
    expect(harness.ledgerTransactions).toHaveLength(1);
    expect(harness.outboxEvents).toHaveLength(4);
    expect(harness.walletPendingAmountMinor).toBe(43_000);
    expect(harness.bookingMutationCalls).toBe(1);
  });

  it("rejects amount and currency mismatches before any captured-sale state is persisted", async () => {
    const amountHarness = createHarness();
    await expect(capture(amountHarness, { amountMinor: 49_999 })).rejects.toBeInstanceOf(
      PaymentWebhookAmountMismatchError
    );
    expect(amountHarness.persistedEffectCount()).toBe(0);

    const currencyHarness = createHarness();
    await expect(capture(currencyHarness, { currency: "KZT" })).rejects.toBeInstanceOf(
      PaymentWebhookCurrencyMismatchError
    );
    expect(currencyHarness.persistedEffectCount()).toBe(0);
  });

  it("rolls back the provider event with every sale effect so the same webhook remains retryable", async () => {
    const harness = createHarness({ failOutbox: true });

    await expect(capture(harness)).rejects.toThrow("outbox unavailable");
    expect(harness.persistedEffectCount()).toBe(0);

    harness.failOutbox = false;
    await expect(capture(harness)).resolves.toMatchObject({ kind: "created" });
    expect(harness.providerEvents).toHaveLength(1);
    expect(harness.ledgerTransactions).toHaveLength(1);
    expect(harness.outboxEvents).toHaveLength(4);
  });
});

function capture(
  harness: ReturnType<typeof createHarness>,
  money: { readonly amountMinor?: number; readonly currency?: string } = {}
) {
  return capturePaymentProviderWebhook({
    capturedSale: harness.unitOfWork,
    request: {
      paymentAttemptId,
      provider: "arc_pay",
      environment: "sandbox",
      providerWebhookId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      providerPaymentId,
      type: "payment.captured",
      occurredAt: now,
      receivedAt: now,
      payload: { source: "arc_pay" },
      moneyFacts: {
        kind: "exact",
        amounts: [
          {
            amountMinor: money.amountMinor ?? 50_000,
            currency: money.currency ?? "RUB"
          }
        ]
      }
    }
  });
}

function createHarness(options: { readonly failOutbox?: boolean } = {}) {
  const attempt: Mutable<PaymentAttempt> = {
    id: paymentAttemptId,
    orderId,
    provider: "arc_pay",
    environment: "sandbox",
    status: "checkout_opened",
    amount: { amountMinor: 50_000, currency: "RUB" },
    providerPaymentId: null,
    providerCheckoutId: "55555555-5555-4555-8555-555555555555",
    idempotencyKey: "checkout:1",
    metadata: {},
    createdAt: now,
    updatedAt: now
  };
  const order: Mutable<FinanceOrder> = {
    id: orderId,
    clientUserId: "66666666-6666-4666-8666-666666666666",
    astrologerUserId: "44444444-4444-4444-8444-444444444444",
    productId: "77777777-7777-4777-8777-777777777777",
    directLinkIntentId: null,
    bookingId,
    status: "pending_payment",
    grossAmount: { amountMinor: 50_000, currency: "RUB" },
    // These deliberately differ from any current policy calculation.
    platformFee: { amountMinor: 7_000, currency: "RUB" },
    astrologerNetAmount: { amountMinor: 43_000, currency: "RUB" },
    financePolicySnapshotId: "88888888-8888-4888-8888-888888888888",
    financePolicyRiskTier: "standard",
    financePolicyHoldDurationHours: 48,
    financePolicyReserveBps: 0,
    financePolicyReserveReleaseDelayDays: 0,
    financePolicyPlatformFeeBps: 1_400,
    financePolicyProviderSettlementRequired: true,
    createdAt: now,
    updatedAt: now
  };
  const providerEvents: PaymentProviderEvent[] = [];
  const ledgerTransactions: CreateLedgerTransactionInput[] = [];
  const outboxEvents: CapturedSaleOutboxEvent[] = [];
  let walletPendingAmountMinor = 0;
  let transactCalls = 0;
  let failOutbox = options.failOutbox ?? false;
  let bookingMutationCalls = 0;

  const store: CapturedSaleTransactionStore = {
    findAttemptById: async (id) => (id === attempt.id ? { ...attempt } : null),
    findProviderEventByWebhookId: async (input) =>
      providerEvents.find((event) => event.providerWebhookId === input.providerWebhookId) ?? null,
    linkAttemptToProviderPayment: async (input) => {
      if (input.paymentAttemptId !== attempt.id) return null;
      attempt.providerPaymentId = input.providerPaymentId;
      return { ...attempt, updatedAt: input.now };
    },
    recordProviderEvent: async (input) => {
      const existing = providerEvents.find(
        (event) => event.providerWebhookId === input.providerWebhookId
      );
      if (existing) return { kind: "replayed" as const, event: existing };
      const event: PaymentProviderEvent = {
        id: "provider-event-1",
        paymentAttemptId: input.paymentAttemptId,
        provider: input.provider,
        environment: input.environment,
        providerWebhookId: input.providerWebhookId,
        providerPaymentId: input.providerPaymentId,
        type: input.type,
        occurredAt: input.occurredAt,
        receivedAt: input.receivedAt,
        payload: input.payload
      };
      providerEvents.push(event);
      return { kind: "created" as const, event };
    },
    findById: async (id) => (id === order.id ? { ...order } : null),
    markOrderPaid: async (input) => {
      if (input.orderId !== order.id) return null;
      if (order.status !== "pending_payment") return null;
      order.status = "paid";
      order.updatedAt = input.now;
      return { ...order };
    },
    confirmPaidBooking: async (input) => {
      if (input.bookingId !== bookingId || input.orderId !== orderId) return null;
      bookingMutationCalls += 1;
      return {
        id: bookingId,
        reservationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        ownerUserId: order.astrologerUserId,
        clientUserId: order.clientUserId,
        productId: order.productId,
        source: "client_paid",
        state: "confirmed",
        holdExpiresAt: null,
        startAt: "2026-07-25T10:00:00.000Z",
        endAt: "2026-07-25T11:00:00.000Z",
        productTitle: "Natal reading",
        durationMinutes: 60,
        deliveryFormat: "video",
        priceMinor: order.grossAmount.amountMinor,
        currency: order.grossAmount.currency,
        timeZone: "Europe/Moscow",
        policySnapshot: {
          bufferBeforeMinutes: 0,
          bufferAfterMinutes: 0,
          minimumNoticeMinutes: 0
        },
        createdAt: now,
        updatedAt: input.now
      };
    },
    createTransaction: async (input) => {
      ledgerTransactions.push(input);
      walletPendingAmountMinor = input.entries
        .filter((entry) => entry.account.accountType === "astrologer_pending")
        .reduce(
          (total, entry) =>
            total +
            (entry.side === "credit" ? entry.amount.amountMinor : -entry.amount.amountMinor),
          0
        );
      return {
        ...input,
        id: "ledger-transaction-1",
        entries: []
      };
    },
    recordCapturedSaleOutboxEvents: async (input) => {
      if (failOutbox) throw new Error("outbox unavailable");
      outboxEvents.push(...input);
    }
  };
  const unitOfWork: CapturedSaleUnitOfWork = {
    transact: async (operation) => {
      transactCalls += 1;
      const snapshot = {
        attempt: { ...attempt },
        order: { ...order },
        providerEvents: [...providerEvents],
        ledgerTransactions: [...ledgerTransactions],
        outboxEvents: [...outboxEvents],
        walletPendingAmountMinor,
        bookingMutationCalls
      };
      try {
        return await operation(store);
      } catch (error) {
        Object.assign(attempt, snapshot.attempt);
        Object.assign(order, snapshot.order);
        providerEvents.splice(0, providerEvents.length, ...snapshot.providerEvents);
        ledgerTransactions.splice(0, ledgerTransactions.length, ...snapshot.ledgerTransactions);
        outboxEvents.splice(0, outboxEvents.length, ...snapshot.outboxEvents);
        walletPendingAmountMinor = snapshot.walletPendingAmountMinor;
        bookingMutationCalls = snapshot.bookingMutationCalls;
        throw error;
      }
    }
  };

  return {
    unitOfWork,
    attempt,
    order,
    providerEvents,
    ledgerTransactions,
    outboxEvents,
    get bookingMutationCalls() {
      return bookingMutationCalls;
    },
    get transactCalls() {
      return transactCalls;
    },
    get walletPendingAmountMinor() {
      return walletPendingAmountMinor;
    },
    get failOutbox() {
      return failOutbox;
    },
    set failOutbox(value: boolean) {
      failOutbox = value;
    },
    persistedEffectCount() {
      return providerEvents.length + ledgerTransactions.length + outboxEvents.length;
    }
  };
}
