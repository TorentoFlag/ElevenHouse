import { describe, expect, it } from "vitest";
import {
  capturePaymentProviderWebhook,
  createCapturedSaleHoldReleaseLedgerTransaction,
  PaymentWebhookAmountMismatchError,
  PaymentWebhookCurrencyMismatchError,
  recordPaymentReversalProviderWebhook,
  releaseDueCapturedSaleHolds,
  type CapturedSaleOutboxEvent,
  type CapturedSaleTransactionStore,
  type CapturedSaleUnitOfWork,
  type CreateLedgerTransactionInput,
  type FinanceOrder,
  type PaymentAttempt,
  type PaymentProviderEvent,
  type PayoutRequestRecord,
  type RefundRecord,
  type RefundReversalTransactionStore,
  type RefundReversalUnitOfWork,
  type WalletBalance
} from "../index";

const now = "2026-07-24T12:00:00.000Z";
const paymentAttemptId = "11111111-1111-4111-8111-111111111111";
const orderId = "22222222-2222-4222-8222-222222222222";
const providerPaymentId = "33333333-3333-4333-8333-333333333333";
const bookingId = "99999999-9999-4999-8999-999999999999";
const payoutRequestId = "55555555-5555-4555-8555-555555555555";
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
        metadata: expect.objectContaining({
          environment: "sandbox",
          provider: "arc_pay",
          providerPaymentId,
          holdDurationHours: 48,
          holdReleaseAt: "2026-07-26T12:00:00.000Z",
          financePolicySnapshotId: "88888888-8888-4888-8888-888888888888",
          financePolicyRiskTier: "standard"
        }),
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
            metadata: expect.objectContaining({
              holdDurationHours: 48,
              holdReleaseAt: "2026-07-26T12:00:00.000Z",
              financePolicySnapshotId: "88888888-8888-4888-8888-888888888888"
            }),
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

describe("releaseDueCapturedSaleHolds", () => {
  it("releases due captured-sale holds with an idempotent command per order", async () => {
    const hold = {
      orderId,
      astrologerUserId: "44444444-4444-4444-8444-444444444444",
      amount: { amountMinor: 43_000, currency: "RUB" as const },
      capturedAt: now,
      holdReleaseAt: "2026-07-26T12:00:00.000Z",
      paymentAttemptId,
      providerEventId: "provider-event-1"
    };
    const releases: Parameters<
      NonNullable<
        Parameters<typeof releaseDueCapturedSaleHolds>[0]["store"]["releaseCapturedSaleHold"]
      >
    >[0][] = [];
    const result = await releaseDueCapturedSaleHolds({
      store: {
        listReleasableCapturedSaleHolds: async (input) => {
          expect(input).toEqual({ now: "2026-07-27T12:00:00.000Z", limit: 10 });
          return [hold, { ...hold, orderId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }];
        },
        releaseCapturedSaleHold: async (input) => {
          releases.push(input);
          return {
            kind: input.hold.orderId === orderId ? "released" : "replayed",
            transactionId: `ledger:${input.hold.orderId}`
          };
        }
      },
      now: new Date("2026-07-27T12:00:00.000Z"),
      limit: 10
    });

    expect(result).toEqual({
      scanned: 2,
      released: 1,
      replayed: 1,
      orderIds: [orderId, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"]
    });
    expect(releases).toEqual([
      expect.objectContaining({
        hold,
        now: "2026-07-27T12:00:00.000Z",
        commandExpiresAt: "2026-08-26T12:00:00.000Z"
      }),
      expect.objectContaining({
        hold: expect.objectContaining({ orderId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }),
        now: "2026-07-27T12:00:00.000Z",
        commandExpiresAt: "2026-08-26T12:00:00.000Z"
      })
    ]);
  });

  it("builds a balanced pending-to-available release transaction for a captured sale hold", () => {
    expect(
      createCapturedSaleHoldReleaseLedgerTransaction(
        {
          orderId,
          astrologerUserId: "44444444-4444-4444-8444-444444444444",
          amount: { amountMinor: 43_000, currency: "RUB" },
          capturedAt: now,
          holdReleaseAt: "2026-07-26T12:00:00.000Z",
          paymentAttemptId,
          providerEventId: "provider-event-1"
        },
        "2026-07-27T12:00:00.000Z"
      )
    ).toEqual({
      operationType: "funds_released",
      orderId,
      payoutRequestId: null,
      occurredAt: "2026-07-27T12:00:00.000Z",
      postedAt: "2026-07-27T12:00:00.000Z",
      metadata: {
        reason: "captured_sale_hold_elapsed",
        holdReleaseAt: "2026-07-26T12:00:00.000Z",
        providerEventId: "provider-event-1",
        paymentAttemptId
      },
      entries: [
        expect.objectContaining({
          account: {
            accountType: "astrologer_pending",
            astrologerUserId: "44444444-4444-4444-8444-444444444444",
            currency: "RUB"
          },
          side: "debit",
          amount: { amountMinor: 43_000, currency: "RUB" }
        }),
        expect.objectContaining({
          account: {
            accountType: "astrologer_available",
            astrologerUserId: "44444444-4444-4444-8444-444444444444",
            currency: "RUB"
          },
          side: "credit",
          amount: { amountMinor: 43_000, currency: "RUB" }
        })
      ]
    });
  });
});

describe("recordPaymentReversalProviderWebhook", () => {
  it("records a full refund before hold release by reversing platform revenue and pending astrologer funds", async () => {
    const harness = createReversalHarness({
      orderStatus: "paid",
      wallet: { pending: 43_000, available: 0, reserved: 0, negativeBalance: 0 }
    });

    const result = await recordRefund(harness);
    const replay = await recordRefund(harness);

    expect(result.kind).toBe("created");
    expect(replay.kind).toBe("replayed");
    expect(harness.refunds).toEqual([
      expect.objectContaining({
        orderId,
        paymentAttemptId,
        providerEventId: "provider-reversal-event-1",
        providerRefundId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        status: "succeeded",
        amount: { amountMinor: 50_000, currency: "RUB" },
        reason: "provider_refund"
      })
    ]);
    expect(harness.order.status).toBe("refunded");
    expect(harness.ledgerTransactions).toEqual([
      expect.objectContaining({
        operationType: "refund_recorded",
        orderId,
        metadata: expect.objectContaining({
          providerEventId: "provider-reversal-event-1",
          paymentAttemptId,
          providerRefundId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          reversalGrossAmountMinor: 50_000,
          platformFeeReversalAmountMinor: 7_000,
          astrologerShareReversalAmountMinor: 43_000
        }),
        entries: [
          reversalEntry("platform_revenue", null, "debit", 7_000),
          reversalEntry(
            "astrologer_pending",
            "44444444-4444-4444-8444-444444444444",
            "debit",
            43_000
          ),
          reversalEntry("platform_clearing", null, "credit", 50_000)
        ]
      })
    ]);
  });

  it("records a partial refund after hold release by prorating order-snapshot platform fee and debiting available funds", async () => {
    const harness = createReversalHarness({
      orderStatus: "fulfilled",
      wallet: { pending: 0, available: 43_000, reserved: 0, negativeBalance: 0 }
    });

    await expect(
      recordRefund(harness, {
        refundAmountMinor: 10_000,
        totalRefundedMinor: 10_000,
        providerWebhookId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
      })
    ).resolves.toMatchObject({ kind: "created" });

    expect(harness.order.status).toBe("partially_refunded");
    expect(harness.ledgerTransactions).toEqual([
      expect.objectContaining({
        operationType: "refund_recorded",
        entries: [
          reversalEntry("platform_revenue", null, "debit", 1_400),
          reversalEntry(
            "astrologer_available",
            "44444444-4444-4444-8444-444444444444",
            "debit",
            8_600
          ),
          reversalEntry("platform_clearing", null, "credit", 10_000)
        ]
      })
    ]);
  });

  it("records chargeback shortfall as explicit negative balance after astrologer funds were paid out", async () => {
    const harness = createReversalHarness({
      orderStatus: "fulfilled",
      wallet: { pending: 0, available: 0, reserved: 0, payoutPending: 0, negativeBalance: 0 }
    });

    await expect(recordChargeback(harness)).resolves.toMatchObject({ kind: "created" });

    expect(harness.refunds).toEqual([]);
    expect(harness.order.status).toBe("chargeback");
    expect(harness.ledgerTransactions).toEqual([
      expect.objectContaining({
        operationType: "chargeback_recorded",
        entries: [
          reversalEntry("platform_revenue", null, "debit", 7_000),
          reversalEntry(
            "astrologer_negative_balance",
            "44444444-4444-4444-8444-444444444444",
            "debit",
            43_000
          ),
          reversalEntry("platform_clearing", null, "credit", 50_000)
        ]
      })
    ]);
  });

  it("blocks an open payout request before clawing chargeback back from astrologer funds", async () => {
    const harness = createReversalHarness({
      orderStatus: "fulfilled",
      wallet: { pending: 0, available: 0, reserved: 0, payoutPending: 43_000, negativeBalance: 0 },
      payoutRequests: [payoutRequest({ status: "approved" })]
    });

    await expect(recordChargeback(harness)).resolves.toMatchObject({ kind: "created" });

    expect(harness.refunds).toEqual([]);
    expect(harness.order.status).toBe("chargeback");
    expect(harness.ledgerTransactions).toEqual([
      expect.objectContaining({
        operationType: "payout_failed",
        payoutRequestId,
        entries: [
          reversalEntry(
            "astrologer_payout_pending",
            "44444444-4444-4444-8444-444444444444",
            "debit",
            43_000
          ),
          reversalEntry(
            "astrologer_available",
            "44444444-4444-4444-8444-444444444444",
            "credit",
            43_000
          )
        ]
      }),
      expect.objectContaining({
        operationType: "chargeback_recorded",
        entries: [
          reversalEntry("platform_revenue", null, "debit", 7_000),
          reversalEntry(
            "astrologer_available",
            "44444444-4444-4444-8444-444444444444",
            "debit",
            43_000
          ),
          reversalEntry("platform_clearing", null, "credit", 50_000)
        ]
      })
    ]);
    expect(harness.payoutStatusUpdates).toEqual([
      expect.objectContaining({
        payoutRequestId,
        status: "cancelled",
        adminUserId: null,
        adminNote: expect.stringContaining("provider chargeback"),
        now
      })
    ]);
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

function recordRefund(
  harness: ReturnType<typeof createReversalHarness>,
  options: {
    readonly refundAmountMinor?: number;
    readonly totalRefundedMinor?: number;
    readonly providerWebhookId?: string;
  } = {}
) {
  const refundAmountMinor = options.refundAmountMinor ?? 50_000;
  const totalRefundedMinor = options.totalRefundedMinor ?? refundAmountMinor;
  return recordPaymentReversalProviderWebhook({
    reversal: harness.unitOfWork,
    request: {
      paymentAttemptId,
      provider: "arc_pay",
      environment: "sandbox",
      providerWebhookId: options.providerWebhookId ?? "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      providerPaymentId,
      type: "payment.refunded",
      occurredAt: now,
      receivedAt: now,
      payload: {
        data: {
          payment_id: providerPaymentId,
          refund_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          refund_amount: refundAmountMinor,
          total_refunded: totalRefundedMinor,
          currency: "RUB"
        }
      },
      moneyFacts: {
        kind: "bounded",
        amounts: [
          { amountMinor: refundAmountMinor, currency: "RUB" },
          { amountMinor: totalRefundedMinor, currency: "RUB" }
        ]
      }
    }
  });
}

function recordChargeback(harness: ReturnType<typeof createReversalHarness>) {
  return recordPaymentReversalProviderWebhook({
    reversal: harness.unitOfWork,
    request: {
      paymentAttemptId,
      provider: "arc_pay",
      environment: "sandbox",
      providerWebhookId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      providerPaymentId,
      type: "payment.chargeback",
      occurredAt: now,
      receivedAt: now,
      payload: {
        data: {
          payment_id: providerPaymentId,
          amount: 50_000,
          currency: "RUB"
        }
      },
      moneyFacts: {
        kind: "bounded",
        amounts: [{ amountMinor: 50_000, currency: "RUB" }]
      }
    }
  });
}

function createReversalHarness(input: {
  readonly orderStatus: FinanceOrder["status"];
  readonly wallet: {
    readonly pending: number;
    readonly available: number;
    readonly reserved: number;
    readonly payoutPending?: number;
    readonly negativeBalance: number;
  };
  readonly payoutRequests?: readonly PayoutRequestRecord[];
}) {
  const attempt: Mutable<PaymentAttempt> = {
    id: paymentAttemptId,
    orderId,
    provider: "arc_pay",
    environment: "sandbox",
    status: "captured",
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
    status: input.orderStatus,
    grossAmount: { amountMinor: 50_000, currency: "RUB" },
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
  const refunds: RefundRecord[] = [];
  const ledgerTransactions: CreateLedgerTransactionInput[] = [];
  let payoutRequests = [...(input.payoutRequests ?? [])];
  const payoutStatusUpdates: Parameters<
    RefundReversalTransactionStore["updateRequestStatus"]
  >[0][] = [];
  const walletBalance: Mutable<WalletBalance> = {
    astrologerUserId: order.astrologerUserId,
    pending: { amountMinor: input.wallet.pending, currency: "RUB" },
    available: { amountMinor: input.wallet.available, currency: "RUB" },
    reserved: { amountMinor: input.wallet.reserved, currency: "RUB" },
    payoutPending: { amountMinor: input.wallet.payoutPending ?? 0, currency: "RUB" },
    negativeBalance: { amountMinor: input.wallet.negativeBalance, currency: "RUB" },
    updatedAt: now
  };

  const store: RefundReversalTransactionStore = {
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
        id: "provider-reversal-event-1",
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
    createRefund: async (refundInput) => {
      const existing = refunds.find(
        (refund) => refund.providerRefundId === refundInput.providerRefundId
      );
      if (existing) return { kind: "replayed" as const, refund: existing };
      const refund: RefundRecord = {
        id: "refund-1",
        orderId: refundInput.orderId,
        paymentAttemptId: refundInput.paymentAttemptId,
        providerEventId: refundInput.providerEventId,
        provider: refundInput.provider ?? attempt.provider,
        environment: refundInput.environment ?? attempt.environment,
        status: refundInput.status ?? "requested",
        amount: refundInput.amount,
        reason: refundInput.reason,
        providerRefundId: refundInput.providerRefundId,
        createdAt: refundInput.now,
        updatedAt: refundInput.now
      };
      refunds.push(refund);
      return { kind: "created" as const, refund };
    },
    findById: async (id) => (id === order.id ? { ...order } : null),
    updateStatus: async (input) => {
      if (input.orderId !== order.id) return null;
      order.status = input.status;
      order.updatedAt = input.now;
      return { ...order };
    },
    listRequests: async (requestInput) =>
      payoutRequests
        .filter((request) =>
          requestInput?.astrologerUserId
            ? request.astrologerUserId === requestInput.astrologerUserId
            : true
        )
        .filter((request) =>
          requestInput?.statuses?.length ? requestInput.statuses.includes(request.status) : true
        )
        .slice(0, requestInput?.limit ?? 50),
    updateRequestStatus: async (requestInput) => {
      payoutStatusUpdates.push(requestInput);
      const existing = payoutRequests.find(
        (request) => request.id === requestInput.payoutRequestId
      );
      if (!existing) return null;
      const updated: PayoutRequestRecord = {
        ...existing,
        status: requestInput.status,
        adminUserId: requestInput.adminUserId,
        adminNote: requestInput.adminNote ?? existing.adminNote,
        failureReason: requestInput.failureReason ?? existing.failureReason,
        completedAt:
          requestInput.status === "paid" ||
          requestInput.status === "failed" ||
          requestInput.status === "rejected" ||
          requestInput.status === "cancelled"
            ? requestInput.now
            : existing.completedAt,
        updatedAt: requestInput.now
      };
      payoutRequests = payoutRequests.map((request) =>
        request.id === updated.id ? updated : request
      );
      return updated;
    },
    findWalletBalance: async (astrologerUserId) =>
      astrologerUserId === order.astrologerUserId ? { ...walletBalance } : null,
    createTransaction: async (transaction) => {
      ledgerTransactions.push(transaction);
      applyWalletTransaction(walletBalance, transaction);
      return { ...transaction, id: "ledger-reversal-1", entries: [] };
    }
  };

  const unitOfWork: RefundReversalUnitOfWork = {
    transact: async (operation) => operation(store)
  };

  return {
    unitOfWork,
    order,
    providerEvents,
    refunds,
    ledgerTransactions,
    payoutStatusUpdates
  };
}

function applyWalletTransaction(
  walletBalance: Mutable<WalletBalance>,
  transaction: CreateLedgerTransactionInput
): void {
  for (const entry of transaction.entries) {
    if (entry.account.astrologerUserId !== walletBalance.astrologerUserId) continue;
    const delta = entry.side === "credit" ? entry.amount.amountMinor : -entry.amount.amountMinor;
    if (entry.account.accountType === "astrologer_available") {
      walletBalance.available = {
        ...walletBalance.available,
        amountMinor: walletBalance.available.amountMinor + delta
      };
    }
    if (entry.account.accountType === "astrologer_payout_pending") {
      walletBalance.payoutPending = {
        ...walletBalance.payoutPending,
        amountMinor: walletBalance.payoutPending.amountMinor + delta
      };
    }
  }
}

function payoutRequest(overrides: Partial<PayoutRequestRecord> = {}): PayoutRequestRecord {
  return {
    id: overrides.id ?? payoutRequestId,
    astrologerUserId: overrides.astrologerUserId ?? "44444444-4444-4444-8444-444444444444",
    payoutMethodId: overrides.payoutMethodId ?? "66666666-6666-4666-8666-666666666666",
    status: overrides.status ?? "requested",
    amount: overrides.amount ?? { amountMinor: 43_000, currency: "RUB" },
    method: overrides.method ?? "manual_bank_transfer",
    provider: overrides.provider ?? null,
    environment: overrides.environment ?? null,
    requestedAt: overrides.requestedAt ?? now,
    reviewedAt: overrides.reviewedAt ?? null,
    completedAt: overrides.completedAt ?? null,
    adminUserId: overrides.adminUserId ?? null,
    adminNote: overrides.adminNote ?? null,
    failureReason: overrides.failureReason ?? null,
    externalReference: overrides.externalReference ?? null,
    transferredAt: overrides.transferredAt ?? null,
    providerPayoutId: overrides.providerPayoutId ?? null,
    metadata: overrides.metadata ?? {},
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now
  };
}

function reversalEntry(
  accountType: CreateLedgerTransactionInput["entries"][number]["account"]["accountType"],
  astrologerUserId: string | null,
  side: CreateLedgerTransactionInput["entries"][number]["side"],
  amountMinor: number
) {
  return expect.objectContaining({
    account: { accountType, astrologerUserId, currency: "RUB" },
    side,
    amount: { amountMinor, currency: "RUB" }
  });
}
