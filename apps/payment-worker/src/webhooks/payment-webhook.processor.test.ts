import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type {
  Booking,
  CapturedSaleTransactionStore,
  CapturedSaleUnitOfWork,
  CreateLedgerTransactionInput,
  FinanceOrder,
  PaymentAttempt,
  PaymentProviderEvent,
  RefundRecord,
  RefundReversalTransactionStore,
  RefundReversalUnitOfWork,
  TerminalPaymentTransactionStore,
  TerminalPaymentUnitOfWork,
  WalletBalance
} from "@elevenhouse/domain";
import { verifyArcPayWebhookSignature } from "../arc-pay/arc-pay-signature";
import { createPaymentWebhookHandler } from "./payment-webhook.server";
import { createPaymentWebhookProcessor } from "./payment-webhook.processor";

const webhookSecret = "arc-pay-webhook-secret";
const now = new Date("2026-07-24T12:00:00.000Z");
const paymentAttemptId = "11111111-1111-4111-8111-111111111111";
const providerPaymentId = "22222222-2222-4222-8222-222222222222";
const orderId = "33333333-3333-4333-8333-333333333333";
const bookingId = "99999999-9999-4999-8999-999999999999";

describe("Arc Pay payment webhook ingestion", () => {
  it("returns 401 for an invalid signature before parsing or processing the body", async () => {
    const harness = createHarness();

    await expect(
      harness.handler.handle({
        headers: {
          "webhook-id": eventId(1),
          "webhook-timestamp": String(unix(now)),
          "webhook-signature": "t=1784894400,v1=not-a-valid-signature"
        },
        rawBody: "not-json"
      })
    ).resolves.toEqual({ statusCode: 401, body: { error: "invalid_webhook_signature" } });

    expect(harness.resolvePaymentAttemptId).not.toHaveBeenCalled();
    expect(harness.createdEvents).toEqual([]);
  });

  it("persists a valid captured event exactly once when Arc Pay retries the same webhook id", async () => {
    const harness = createHarness();
    const request = signedRequest(capturedPayload({ eventId: eventId(2) }));

    await expect(harness.handler.handle(request)).resolves.toEqual({
      statusCode: 200,
      body: { accepted: true, duplicate: false }
    });
    await expect(harness.handler.handle(request)).resolves.toEqual({
      statusCode: 200,
      body: { accepted: true, duplicate: true }
    });

    expect(harness.createdEvents).toHaveLength(1);
    expect(harness.createdEvents[0]).toMatchObject({
      providerWebhookId: eventId(2),
      providerPaymentId,
      type: "payment.captured"
    });
    expect(harness.linkedProviderPaymentIds).toEqual([providerPaymentId]);
    expect(harness.ledgerTransactions).toHaveLength(1);
    expect(harness.outboxEvents).toHaveLength(4);
    expect(harness.resolvePaymentAttemptId).toHaveBeenCalledTimes(1);
  });

  it("rejects a captured event whose amount does not match its linked order and attempt", async () => {
    const harness = createHarness();

    await expect(
      harness.handler.handle(
        signedRequest(capturedPayload({ eventId: eventId(3), amount: 49_999 }))
      )
    ).resolves.toEqual({ statusCode: 422, body: { error: "payment_amount_mismatch" } });

    expect(harness.createdEvents).toEqual([]);
    expect(harness.linkedProviderPaymentIds).toEqual([]);
  });

  it("rejects a captured event whose currency does not match its linked order and attempt", async () => {
    const harness = createHarness();

    await expect(
      harness.handler.handle(
        signedRequest(capturedPayload({ eventId: eventId(4), currency: "KZT" }))
      )
    ).resolves.toEqual({ statusCode: 422, body: { error: "payment_currency_mismatch" } });

    expect(harness.createdEvents).toEqual([]);
    expect(harness.linkedProviderPaymentIds).toEqual([]);
  });

  it("rejects refunded and chargeback amounts or currencies that do not match the linked payment", async () => {
    const refundHarness = createHarness();
    await expect(
      refundHarness.handler.handle(
        signedRequest({
          ...basePayload(eventId(7)),
          event_type: "payment.refunded",
          data: {
            payment_id: providerPaymentId,
            refund_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            refund_amount: 50_001,
            total_refunded: 50_001,
            currency: "RUB"
          }
        })
      )
    ).resolves.toEqual({ statusCode: 422, body: { error: "payment_amount_mismatch" } });

    const chargebackHarness = createHarness();
    await expect(
      chargebackHarness.handler.handle(
        signedRequest({
          ...basePayload(eventId(8)),
          event_type: "payment.chargeback",
          data: { payment_id: providerPaymentId, amount: 50_000, currency: "KZT" }
        })
      )
    ).resolves.toEqual({ statusCode: 422, body: { error: "payment_currency_mismatch" } });
  });

  it("records a provider refund through the reversal unit of work", async () => {
    const harness = createHarness({
      orderStatus: "paid",
      wallet: { pending: 45_000, available: 0, reserved: 0, negativeBalance: 0 }
    });
    const request = signedRequest({
      ...basePayload(eventId(13)),
      event_type: "payment.refunded",
      data: {
        payment_id: providerPaymentId,
        refund_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        refund_amount: 50_000,
        total_refunded: 50_000,
        currency: "RUB"
      }
    });

    await expect(harness.handler.handle(request)).resolves.toEqual({
      statusCode: 200,
      body: { accepted: true, duplicate: false }
    });
    await expect(harness.handler.handle(request)).resolves.toEqual({
      statusCode: 200,
      body: { accepted: true, duplicate: true }
    });

    expect(harness.refunds).toEqual([
      expect.objectContaining({
        providerRefundId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        amount: { amountMinor: 50_000, currency: "RUB" }
      })
    ]);
    expect(harness.ledgerTransactions).toHaveLength(1);
    expect(harness.ledgerTransactions[0]).toMatchObject({ operationType: "refund_recorded" });
    expect(harness.orderStore.updateStatus).toHaveBeenCalledWith({
      orderId,
      status: "refunded",
      now: now.toISOString()
    });
  });

  it("records a provider chargeback through the reversal unit of work", async () => {
    const harness = createHarness({
      orderStatus: "fulfilled",
      wallet: { pending: 0, available: 0, reserved: 0, negativeBalance: 0 }
    });

    await expect(
      harness.handler.handle(
        signedRequest({
          ...basePayload(eventId(14)),
          event_type: "payment.chargeback",
          data: { payment_id: providerPaymentId, amount: 50_000, currency: "RUB" }
        })
      )
    ).resolves.toEqual({ statusCode: 200, body: { accepted: true, duplicate: false } });

    expect(harness.refunds).toEqual([]);
    expect(harness.ledgerTransactions).toHaveLength(1);
    expect(harness.ledgerTransactions[0]).toMatchObject({
      operationType: "chargeback_recorded",
      entries: [
        expect.objectContaining({
          account: expect.objectContaining({ accountType: "platform_revenue" })
        }),
        expect.objectContaining({
          account: expect.objectContaining({ accountType: "astrologer_negative_balance" })
        }),
        expect.objectContaining({
          account: expect.objectContaining({ accountType: "platform_clearing" })
        })
      ]
    });
    expect(harness.orderStore.updateStatus).toHaveBeenCalledWith({
      orderId,
      status: "chargeback",
      now: now.toISOString()
    });
  });

  it("deduplicates a duplicate captured event by webhook id without another order or ledger effect", async () => {
    const harness = createHarness();
    const request = signedRequest(capturedPayload({ eventId: eventId(5) }));

    await harness.handler.handle(request);
    await harness.handler.handle(request);

    expect(harness.createdEvents).toHaveLength(1);
    expect(harness.markOrderPaid).toHaveBeenCalledTimes(1);
    expect(harness.ledgerTransactions).toHaveLength(1);
    expect(harness.outboxEvents).toHaveLength(4);
  });

  it("persists payment.timeout as non-terminal evidence without changing the order", async () => {
    const harness = createHarness();

    await expect(
      harness.handler.handle(
        signedRequest({
          ...basePayload(eventId(6)),
          event_type: "payment.timeout",
          data: {
            payment_id: providerPaymentId,
            amount: 50_000,
            currency: "RUB"
          }
        })
      )
    ).resolves.toEqual({ statusCode: 200, body: { accepted: true, duplicate: false } });

    expect(harness.createdEvents).toMatchObject([{ type: "payment.timeout" }]);
    expect(harness.attempt.status).toBe("checkout_opened");
    expect(harness.orderStore.updateStatus).not.toHaveBeenCalled();
  });

  it("persists Arc Pay pending_3ds without fulfillment effects and expires bookings on terminal expiry", async () => {
    const harness = createHarness();

    await expect(
      harness.handler.handle(
        signedRequest({
          ...basePayload(eventId(10)),
          event_type: "payment.pending_3ds",
          data: { payment_id: providerPaymentId }
        })
      )
    ).resolves.toEqual({ statusCode: 200, body: { accepted: true, duplicate: false } });
    await expect(
      harness.handler.handle(
        signedRequest({
          ...basePayload(eventId(11)),
          event_type: "payment.expired",
          data: {
            payment_id: providerPaymentId,
            amount: 50_000,
            from_status: "authorized"
          }
        })
      )
    ).resolves.toEqual({ statusCode: 200, body: { accepted: true, duplicate: false } });

    expect(harness.createdEvents).toMatchObject([
      { type: "payment.pending_3ds" },
      { type: "payment.expired" }
    ]);
    expect(harness.orderStore.updateStatus).toHaveBeenCalledWith({
      orderId,
      status: "expired",
      now: now.toISOString()
    });
    expect(harness.releasedBookingHolds).toEqual([
      {
        bookingId,
        state: "expired",
        now: now.toISOString()
      }
    ]);
  });

  it("returns retryable 500 when the local attempt is not available yet", async () => {
    const harness = createHarness({ attemptMissing: true });

    await expect(
      harness.handler.handle(signedRequest(capturedPayload({ eventId: eventId(12) })))
    ).resolves.toEqual({ statusCode: 500, body: { error: "payment_webhook_attempt_not_found" } });

    expect(harness.createdEvents).toEqual([]);
  });

  it("accepts a rotated v1 signature and rejects a timestamp outside the 300 second window", () => {
    const rawBody = JSON.stringify(capturedPayload({ eventId: eventId(9) }));
    const timestamp = String(unix(now));
    const validSignature = signatureFor(eventId(9), timestamp, rawBody);

    expect(
      verifyArcPayWebhookSignature({
        headers: {
          "webhook-id": eventId(9),
          "webhook-attempt": "1",
          "webhook-timestamp": timestamp,
          "webhook-signature": `t=${timestamp},v1=${"0".repeat(64)},v1=${validSignature}`
        },
        rawBody,
        secret: webhookSecret,
        timestampToleranceSeconds: 300,
        now
      })
    ).toBe(true);

    const expiredTimestamp = String(unix(now) - 301);
    expect(
      verifyArcPayWebhookSignature({
        headers: {
          "webhook-id": eventId(9),
          "webhook-attempt": "1",
          "webhook-timestamp": expiredTimestamp,
          "webhook-signature": `t=${expiredTimestamp},v1=${signatureFor(eventId(9), expiredTimestamp, rawBody)}`
        },
        rawBody,
        secret: webhookSecret,
        timestampToleranceSeconds: 300,
        now
      })
    ).toBe(false);

    expect(
      verifyArcPayWebhookSignature({
        headers: {
          "webhook-id": eventId(9),
          "webhook-attempt": "0",
          "webhook-timestamp": timestamp,
          "webhook-signature": `t=${timestamp},v1=${validSignature}`
        },
        rawBody,
        secret: webhookSecret,
        timestampToleranceSeconds: 300,
        now
      })
    ).toBe(false);
  });
});

function createHarness(
  options: {
    readonly attemptMissing?: boolean;
    readonly orderStatus?: FinanceOrder["status"];
    readonly wallet?: {
      readonly pending: number;
      readonly available: number;
      readonly reserved: number;
      readonly negativeBalance: number;
    };
  } = {}
) {
  const attempt: PaymentAttempt = {
    id: paymentAttemptId,
    orderId,
    provider: "arc_pay",
    environment: "sandbox",
    status: "checkout_opened",
    amount: { amountMinor: 50_000, currency: "RUB" },
    providerPaymentId: null,
    providerCheckoutId: "44444444-4444-4444-8444-444444444444",
    idempotencyKey: "checkout-request-1",
    metadata: {},
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
  const order: FinanceOrder = {
    id: attempt.orderId,
    clientUserId: "55555555-5555-4555-8555-555555555555",
    astrologerUserId: "66666666-6666-4666-8666-666666666666",
    productId: "77777777-7777-4777-8777-777777777777",
    directLinkIntentId: null,
    bookingId,
    status: options.orderStatus ?? "pending_payment",
    grossAmount: { amountMinor: 50_000, currency: "RUB" },
    platformFee: { amountMinor: 5_000, currency: "RUB" },
    astrologerNetAmount: { amountMinor: 45_000, currency: "RUB" },
    financePolicySnapshotId: "88888888-8888-4888-8888-888888888888",
    financePolicyRiskTier: "standard",
    financePolicyHoldDurationHours: 48,
    financePolicyReserveBps: 0,
    financePolicyReserveReleaseDelayDays: 0,
    financePolicyPlatformFeeBps: 1_000,
    financePolicyProviderSettlementRequired: true,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
  const createdEvents: PaymentProviderEvent[] = [];
  const refunds: RefundRecord[] = [];
  const linkedProviderPaymentIds: string[] = [];
  const ledgerTransactions: CreateLedgerTransactionInput[] = [];
  const outboxEvents: unknown[] = [];
  const releasedBookingHolds: unknown[] = [];
  const eventByWebhookId = new Map<string, PaymentProviderEvent>();
  const walletBalance: WalletBalance = {
    astrologerUserId: order.astrologerUserId,
    pending: { amountMinor: options.wallet?.pending ?? 0, currency: "RUB" },
    available: { amountMinor: options.wallet?.available ?? 0, currency: "RUB" },
    reserved: { amountMinor: options.wallet?.reserved ?? 0, currency: "RUB" },
    payoutPending: { amountMinor: 0, currency: "RUB" },
    negativeBalance: { amountMinor: options.wallet?.negativeBalance ?? 0, currency: "RUB" },
    updatedAt: now.toISOString()
  };
  const orderStore = {
    findById: vi.fn(async () => order),
    updateStatus: vi.fn(async (input) => ({ ...order, status: input.status, updatedAt: input.now }))
  };
  const paymentStore = {
    findProviderEventByWebhookId: vi.fn(
      async (input) => eventByWebhookId.get(input.providerWebhookId) ?? null
    ),
    findAttemptById: vi.fn(async () => (options.attemptMissing ? null : attempt)),
    linkAttemptToProviderPayment: vi.fn(async (input) => {
      linkedProviderPaymentIds.push(input.providerPaymentId);
      return { ...attempt, providerPaymentId: input.providerPaymentId };
    }),
    recordProviderEvent: vi.fn(async (input) => {
      const replay = eventByWebhookId.get(input.providerWebhookId);
      if (replay) return { kind: "replayed" as const, event: replay };
      const event: PaymentProviderEvent = {
        id: `provider-event-${createdEvents.length + 1}`,
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
      eventByWebhookId.set(input.providerWebhookId, event);
      createdEvents.push(event);
      return { kind: "created" as const, event };
    }),
    createRefund: vi.fn(async (input) => {
      const existing = refunds.find((refund) => refund.providerRefundId === input.providerRefundId);
      if (existing) return { kind: "replayed" as const, refund: existing };
      const refund: RefundRecord = {
        id: `refund-${refunds.length + 1}`,
        orderId: input.orderId,
        paymentAttemptId: input.paymentAttemptId,
        providerEventId: input.providerEventId,
        provider: input.provider ?? attempt.provider,
        environment: input.environment ?? attempt.environment,
        status: input.status ?? "requested",
        amount: input.amount,
        reason: input.reason,
        providerRefundId: input.providerRefundId,
        createdAt: input.now,
        updatedAt: input.now
      };
      refunds.push(refund);
      return { kind: "created" as const, refund };
    })
  };
  const resolvePaymentAttemptId = vi.fn(async () => paymentAttemptId);
  const markOrderPaidSpy = vi.fn(async (input: { readonly now: string }) => ({
    ...order,
    status: "paid" as const,
    updatedAt: input.now
  }));
  const markOrderPaid: CapturedSaleTransactionStore["markOrderPaid"] = markOrderPaidSpy;
  const confirmPaidBooking: CapturedSaleTransactionStore["confirmPaidBooking"] = vi.fn(
    async () => ({ id: bookingId })
  );
  const capturedSale: CapturedSaleUnitOfWork = {
    transact: async (operation) => {
      const transactionStore: CapturedSaleTransactionStore = {
        findAttemptById: paymentStore.findAttemptById,
        findProviderEventByWebhookId: paymentStore.findProviderEventByWebhookId,
        linkAttemptToProviderPayment: paymentStore.linkAttemptToProviderPayment,
        recordProviderEvent: paymentStore.recordProviderEvent,
        findById: orderStore.findById,
        markOrderPaid,
        confirmPaidBooking,
        createTransaction: async (input) => {
          ledgerTransactions.push(input);
          return { ...input, id: "ledger-transaction-1", entries: [] };
        },
        recordCapturedSaleOutboxEvents: async (input) => {
          outboxEvents.push(...input);
        }
      };
      return operation(transactionStore);
    }
  };
  const terminalPayment: TerminalPaymentUnitOfWork = {
    transact: async (operation) => {
      const transactionStore: TerminalPaymentTransactionStore = {
        findAttemptById: paymentStore.findAttemptById,
        findProviderEventByWebhookId: paymentStore.findProviderEventByWebhookId,
        linkAttemptToProviderPayment: paymentStore.linkAttemptToProviderPayment,
        recordProviderEvent: paymentStore.recordProviderEvent,
        findById: orderStore.findById,
        updateStatus: orderStore.updateStatus,
        releasePaidBookingPaymentHold: async (input) => {
          releasedBookingHolds.push(input);
          return paidBooking(input.state);
        }
      };
      return operation(transactionStore);
    }
  };
  const reversal: RefundReversalUnitOfWork = {
    transact: async (operation) => {
      const transactionStore: RefundReversalTransactionStore = {
        findAttemptById: paymentStore.findAttemptById,
        findProviderEventByWebhookId: paymentStore.findProviderEventByWebhookId,
        linkAttemptToProviderPayment: paymentStore.linkAttemptToProviderPayment,
        recordProviderEvent: paymentStore.recordProviderEvent,
        createRefund: paymentStore.createRefund,
        findById: orderStore.findById,
        updateStatus: orderStore.updateStatus,
        findWalletBalance: async (astrologerUserId) =>
          astrologerUserId === order.astrologerUserId ? walletBalance : null,
        createTransaction: async (input) => {
          ledgerTransactions.push(input);
          return { ...input, id: "ledger-reversal-1", entries: [] };
        }
      };
      return operation(transactionStore);
    }
  };
  const processor = createPaymentWebhookProcessor({
    paymentStore,
    orderStore,
    capturedSale,
    terminalPayment,
    reversal,
    resolvePaymentAttemptId,
    now: () => now
  });

  return {
    attempt,
    orderStore,
    markOrderPaid: markOrderPaidSpy,
    createdEvents,
    refunds,
    ledgerTransactions,
    outboxEvents,
    releasedBookingHolds,
    linkedProviderPaymentIds,
    resolvePaymentAttemptId,
    handler: createPaymentWebhookHandler({
      webhookSecret,
      timestampToleranceSeconds: 300,
      now: () => now,
      processor
    })
  };
}

function paidBooking(state: "cancelled" | "expired"): Booking {
  return {
    id: bookingId,
    reservationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    ownerUserId: "44444444-4444-4444-8444-444444444444",
    clientUserId: "33333333-3333-4333-8333-333333333333",
    productId: "55555555-5555-4555-8555-555555555555",
    source: "client_paid",
    state,
    holdExpiresAt: null,
    startAt: "2026-07-25T09:00:00.000Z",
    endAt: "2026-07-25T10:00:00.000Z",
    productTitle: "Натальный разбор",
    durationMinutes: 60,
    deliveryFormat: "video",
    priceMinor: 50_000,
    currency: "RUB",
    timeZone: "Europe/Moscow",
    policySnapshot: {
      bufferBeforeMinutes: 10,
      bufferAfterMinutes: 10,
      minimumNoticeMinutes: 360
    },
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
}

function capturedPayload(input: {
  readonly eventId: string;
  readonly amount?: number;
  readonly currency?: string;
}) {
  return {
    ...basePayload(input.eventId),
    event_type: "payment.captured",
    data: {
      payment_id: providerPaymentId,
      amount: input.amount ?? 50_000,
      captured_amount: input.amount ?? 50_000,
      currency: input.currency ?? "RUB",
      payment_method: "bank_card"
    }
  };
}

function basePayload(id: string) {
  return {
    event_id: id,
    created_at: now.toISOString(),
    tenant_id: "99999999-9999-4999-8999-999999999999",
    environment: "sandbox",
    livemode: false,
    data: { payment_id: providerPaymentId }
  };
}

function signedRequest(payload: Record<string, unknown>) {
  const rawBody = JSON.stringify(payload);
  const timestamp = String(unix(now));
  const webhookId = String(payload.event_id);
  const signature = signatureFor(webhookId, timestamp, rawBody);
  return {
    headers: {
      "webhook-id": webhookId,
      "webhook-attempt": "1",
      "webhook-timestamp": timestamp,
      "webhook-signature": `t=${timestamp},v1=${signature}`
    },
    rawBody
  };
}

function signatureFor(webhookId: string, timestamp: string, rawBody: string): string {
  return createHmac("sha256", webhookSecret)
    .update(`${webhookId}.${timestamp}.${rawBody}`)
    .digest("hex");
}

function unix(value: Date): number {
  return Math.floor(value.getTime() / 1000);
}

function eventId(lastDigit: number): string {
  return `aaaaaaaa-aaaa-4aaa-8aaa-${String(lastDigit).padStart(12, "a")}`;
}
