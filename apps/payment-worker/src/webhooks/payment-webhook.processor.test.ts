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
  PayoutRequestRecord,
  ReconciliationRecord,
  ReconciliationStore,
  RefundRecord,
  RefundReversalTransactionStore,
  RefundReversalUnitOfWork,
  TerminalPaymentTransactionStore,
  TerminalPaymentUnitOfWork,
  WalletBalance
} from "@elevenhouse/domain";
import { verifyArcPayWebhookSignature } from "../arc-pay/arc-pay-signature";
import type { FinanceReversalWebhookIngress } from "./finance-reversal-webhook-ingress";
import { createPaymentWebhookHandler } from "./payment-webhook.server";
import { createPaymentWebhookProcessor } from "./payment-webhook.processor";

const webhookSecret = "arc-pay-webhook-secret";
const now = new Date("2026-07-24T12:00:00.000Z");
const paymentAttemptId = "11111111-1111-4111-8111-111111111111";
const providerPaymentId = "22222222-2222-4222-8222-222222222222";
const orderId = "33333333-3333-4333-8333-333333333333";
const bookingId = "99999999-9999-4999-8999-999999999999";
type Mutable<T> = { -readonly [Key in keyof T]: T[Key] };

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

  it("acknowledges Arc Pay's signed endpoint test without invoking money processing", async () => {
    const financeIngress = {
      store: vi.fn(async () => ({ duplicate: false }))
    } satisfies FinanceReversalWebhookIngress;
    const harness = createHarness({ financeIngress });
    const request = signedRequest({
      ...basePayload(eventId(97)),
      event_type: "webhook.test",
      data: { message: "This is a test webhook delivery from Arc Pay" }
    });

    await expect(harness.handler.handle(request)).resolves.toEqual({
      statusCode: 200,
      body: { accepted: true, test: true }
    });

    expect(financeIngress.store).not.toHaveBeenCalled();
    expect(harness.resolvePaymentAttemptId).not.toHaveBeenCalled();
    expect(harness.createdEvents).toEqual([]);
  });

  it("stores a verified payment.created event through canonical ingress without invoking the legacy projector", async () => {
    const financeIngress = {
      store: vi.fn(async () => ({ duplicate: false }))
    } satisfies FinanceReversalWebhookIngress;
    const harness = createHarness({ financeIngress, attemptMissing: true });
    const request = signedRequest({
      ...basePayload(eventId(98)),
      event_type: "payment.created",
      data: { payment_id: providerPaymentId, amount: 50_000, currency: "RUB" }
    });

    await expect(harness.handler.handle(request)).resolves.toEqual({
      statusCode: 200,
      body: { accepted: true, duplicate: false }
    });

    expect(financeIngress.store).toHaveBeenCalledWith(
      expect.objectContaining({
        transport: expect.objectContaining({ providerEventType: "payment.created" }),
        rawBody: new TextEncoder().encode(request.rawBody)
      })
    );
    expect(harness.resolvePaymentAttemptId).not.toHaveBeenCalled();
    expect(harness.createdEvents).toEqual([]);
  });

  it("seals an undocumented signed chargeback outcome without inventing a ledger effect", async () => {
    const financeIngress = {
      store: vi.fn(async () => ({ duplicate: false }))
    } satisfies FinanceReversalWebhookIngress;
    const harness = createHarness({ financeIngress, attemptMissing: true });
    const request = signedRequest({
      ...basePayload(eventId(99)),
      event_type: "chargeback.outcome",
      data: { payment_id: providerPaymentId, chargeback_id: "provider-case-opaque" }
    });

    await expect(harness.handler.handle(request)).resolves.toEqual({
      statusCode: 200,
      body: { accepted: true, duplicate: false }
    });

    expect(financeIngress.store).toHaveBeenCalledWith(
      expect.objectContaining({
        transport: expect.objectContaining({ providerEventType: "chargeback.outcome" }),
        rawBody: new TextEncoder().encode(request.rawBody)
      })
    );
    expect(harness.createdEvents).toEqual([]);
    expect(harness.ledgerTransactions).toEqual([]);
    expect(harness.resolvePaymentAttemptId).not.toHaveBeenCalled();
  });

  it("fails closed for a captured event until v2 canonical ingress is configured", async () => {
    const harness = createHarness();
    const request = signedRequest(capturedPayload({ eventId: eventId(2) }));

    await expect(harness.handler.handle(request)).resolves.toEqual({
      statusCode: 503,
      body: { error: "canonical_capture_not_configured" }
    });

    expect(harness.createdEvents).toEqual([]);
    expect(harness.linkedProviderPaymentIds).toEqual([]);
    expect(harness.ledgerTransactions).toEqual([]);
    expect(harness.outboxEvents).toEqual([]);
    expect(harness.resolvePaymentAttemptId).not.toHaveBeenCalled();
  });

  it("queues a verified refund for the canonical V2 worker without running the legacy reversal projector", async () => {
    const financeIngress = {
      store: vi.fn(async () => ({ duplicate: false }))
    } satisfies FinanceReversalWebhookIngress;
    const harness = createHarness({
      financeIngress,
      orderStatus: "paid",
      wallet: { pending: 45_000, available: 0, reserved: 0, negativeBalance: 0 }
    });
    const request = signedRequest({
      ...basePayload(eventId(91)),
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

    expect(financeIngress.store).toHaveBeenCalledWith(
      expect.objectContaining({
        signature: expect.objectContaining({ kind: "verified", webhookId: eventId(91) }),
        transport: expect.objectContaining({ providerEventType: "payment.refunded" }),
        rawBody: new TextEncoder().encode(request.rawBody)
      })
    );
    expect(harness.createdEvents).toHaveLength(0);
    expect(harness.ledgerTransactions).toHaveLength(0);
    expect(harness.resolvePaymentAttemptId).not.toHaveBeenCalled();
  });

  it("queues a verified partial refund for the canonical V2 worker without running the legacy reversal projector", async () => {
    const financeIngress = {
      store: vi.fn(async () => ({ duplicate: false }))
    } satisfies FinanceReversalWebhookIngress;
    const harness = createHarness({ financeIngress });
    const request = signedRequest({
      ...basePayload(eventId(95)),
      event_type: "payment.partially_refunded",
      data: {
        payment_id: providerPaymentId,
        refund_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        refund_amount: 20_000,
        total_refunded: 20_000,
        currency: "RUB"
      }
    });

    await expect(harness.handler.handle(request)).resolves.toEqual({
      statusCode: 200,
      body: { accepted: true, duplicate: false }
    });

    expect(financeIngress.store).toHaveBeenCalledWith(expect.objectContaining({
      transport: expect.objectContaining({ providerEventType: "payment.partially_refunded" }),
      rawBody: new TextEncoder().encode(request.rawBody)
    }));
    expect(harness.createdEvents).toEqual([]);
    expect(harness.ledgerTransactions).toEqual([]);
    expect(harness.resolvePaymentAttemptId).not.toHaveBeenCalled();
  });

  it("fails closed for a refund until V2 canonical ingress is configured", async () => {
    const harness = createHarness();
    const request = signedRequest({
      ...basePayload(eventId(94)),
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
      statusCode: 503,
      body: { error: "canonical_refund_not_configured" }
    });
    expect(harness.createdEvents).toEqual([]);
    expect(harness.ledgerTransactions).toEqual([]);
    expect(harness.resolvePaymentAttemptId).not.toHaveBeenCalled();
  });

  it("fails closed for a partial refund until V2 canonical ingress is configured", async () => {
    const harness = createHarness();
    await expect(harness.handler.handle(signedRequest({
      ...basePayload(eventId(96)),
      event_type: "payment.partially_refunded",
      data: {
        payment_id: providerPaymentId,
        refund_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        refund_amount: 20_000,
        total_refunded: 20_000,
        currency: "RUB"
      }
    }))).resolves.toEqual({
      statusCode: 503,
      body: { error: "canonical_refund_not_configured" }
    });
    expect(harness.createdEvents).toEqual([]);
    expect(harness.ledgerTransactions).toEqual([]);
    expect(harness.resolvePaymentAttemptId).not.toHaveBeenCalled();
  });

  it("stores verified capture transport evidence without running the legacy capture projector", async () => {
    const calls: string[] = [];
    const financeIngress = {
      store: vi.fn(async () => {
        calls.push("sealed");
        return { duplicate: false };
      })
    } satisfies FinanceReversalWebhookIngress;
    const harness = createHarness({ financeIngress });
    const request = signedRequest(capturedPayload({ eventId: eventId(92) }));

    await expect(harness.handler.handle(request)).resolves.toEqual({
      statusCode: 200,
      body: { accepted: true, duplicate: false }
    });

    expect(financeIngress.store).toHaveBeenCalledWith(
      expect.objectContaining({
        signature: expect.objectContaining({ kind: "verified", webhookId: eventId(92) }),
        transport: expect.objectContaining({ providerEventType: "payment.captured" }),
        rawBody: new TextEncoder().encode(request.rawBody)
      })
    );
    expect(harness.createdEvents).toHaveLength(0);
    expect(harness.ledgerTransactions).toHaveLength(0);
    expect(harness.resolvePaymentAttemptId).not.toHaveBeenCalled();
    expect(calls).toEqual(["sealed"]);
  });

  it("does not run the legacy capture projector when durable capture ingress fails", async () => {
    const financeIngress = {
      store: vi.fn(async () => {
        throw new Error("object storage unavailable");
      })
    } satisfies FinanceReversalWebhookIngress;
    const harness = createHarness({ financeIngress });

    await expect(
      harness.handler.handle(signedRequest(capturedPayload({ eventId: eventId(93) })))
    ).resolves.toEqual({ statusCode: 500, body: { error: "webhook_processing_failed" } });

    expect(harness.createdEvents).toEqual([]);
    expect(harness.ledgerTransactions).toEqual([]);
    expect(harness.resolvePaymentAttemptId).not.toHaveBeenCalled();
  });

  it("queues a verified chargeback for the V2 worker without running the legacy reversal projector", async () => {
    const financeIngress = { store: vi.fn(async () => ({ duplicate: false })) } satisfies FinanceReversalWebhookIngress;
    const harness = createHarness({ financeIngress });
    const request = signedRequest({
      ...basePayload(eventId(14)),
      event_type: "payment.chargeback",
      data: { payment_id: providerPaymentId, amount: 50_000, currency: "RUB" }
    });

    await expect(harness.handler.handle(request)).resolves.toEqual({
      statusCode: 200,
      body: { accepted: true, duplicate: false }
    });
    expect(financeIngress.store).toHaveBeenCalledWith(expect.objectContaining({
      transport: expect.objectContaining({ providerEventType: "payment.chargeback" }),
      rawBody: new TextEncoder().encode(request.rawBody)
    }));
    expect(harness.ledgerTransactions).toEqual([]);
    expect(harness.orderStore.updateStatus).not.toHaveBeenCalled();
    expect(harness.resolvePaymentAttemptId).not.toHaveBeenCalled();
  });

  it("fails closed for a chargeback until V2 canonical ingress is configured", async () => {
    const harness = createHarness();
    await expect(harness.handler.handle(signedRequest({
      ...basePayload(eventId(8)),
      event_type: "payment.chargeback",
      data: { payment_id: providerPaymentId, amount: 50_000, currency: "RUB" }
    }))).resolves.toEqual({
      statusCode: 503,
      body: { error: "canonical_chargeback_not_configured" }
    });
    expect(harness.ledgerTransactions).toEqual([]);
    expect(harness.resolvePaymentAttemptId).not.toHaveBeenCalled();
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

  it("records payment.settled as matched reconciliation evidence without fulfillment effects", async () => {
    const harness = createHarness({ orderStatus: "paid" });

    await expect(
      harness.handler.handle(
        signedRequest({
          ...basePayload(eventId(15)),
          event_type: "payment.settled",
          data: {
            payment_id: providerPaymentId,
            settlement_id: "settlement-2026-07-27"
          }
        })
      )
    ).resolves.toEqual({ statusCode: 200, body: { accepted: true, duplicate: false } });

    expect(harness.createdEvents).toMatchObject([{ type: "payment.settled" }]);
    expect(harness.reconciliationRecords).toEqual([
      expect.objectContaining({
        status: "matched",
        providerPaymentId,
        providerSettlementId: "settlement-2026-07-27",
        payload: expect.objectContaining({ source: "payment.settled" })
      })
    ]);
    expect(harness.ledgerTransactions).toEqual([]);
    expect(harness.orderStore.updateStatus).not.toHaveBeenCalled();
  });

  it("records reconciliation.exception as an open provider exception", async () => {
    const harness = createHarness({ orderStatus: "paid" });

    await expect(
      harness.handler.handle(
        signedRequest({
          ...basePayload(eventId(16)),
          event_type: "reconciliation.exception",
          data: {
            payment_id: providerPaymentId,
            settlement_id: "settlement-2026-07-27",
            exception_code: "missing_on_bank",
            exception_message: "Capture is absent from bank settlement file"
          }
        })
      )
    ).resolves.toEqual({ statusCode: 200, body: { accepted: true, duplicate: false } });

    expect(harness.createdEvents).toMatchObject([{ type: "reconciliation.exception" }]);
    expect(harness.reconciliationRecords).toEqual([
      expect.objectContaining({
        status: "exception",
        exceptionCode: "missing_on_bank",
        exceptionMessage: "Capture is absent from bank settlement file",
        resolvedAt: null
      })
    ]);
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
      readonly payoutPending?: number;
      readonly negativeBalance: number;
    };
    readonly payoutRequests?: readonly PayoutRequestRecord[];
    readonly financeIngress?: FinanceReversalWebhookIngress;
  } = {}
) {
  const attempt: PaymentAttempt = {
    id: paymentAttemptId,
    orderId,
    provider: "arc_pay",
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
    productTitleSnapshot: "Natal reading",
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
    tariffSeriesId: "pro",
    tariffVersion: 1,
    tariffVersionDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    tariffCommissionBps: 1_000,
    financePolicyProviderSettlementRequired: true,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
  const createdEvents: PaymentProviderEvent[] = [];
  const refunds: RefundRecord[] = [];
  const reconciliationRecords: ReconciliationRecord[] = [];
  const linkedProviderPaymentIds: string[] = [];
  const ledgerTransactions: CreateLedgerTransactionInput[] = [];
  const outboxEvents: unknown[] = [];
  const releasedBookingHolds: unknown[] = [];
  let payoutRequests = [...(options.payoutRequests ?? [])];
  const payoutStatusUpdates: Parameters<
    RefundReversalTransactionStore["updateRequestStatus"]
  >[0][] = [];
  const eventByWebhookId = new Map<string, PaymentProviderEvent>();
  const walletBalance: Mutable<WalletBalance> = {
    astrologerUserId: order.astrologerUserId,
    pending: { amountMinor: options.wallet?.pending ?? 0, currency: "RUB" },
    available: { amountMinor: options.wallet?.available ?? 0, currency: "RUB" },
    reserved: { amountMinor: options.wallet?.reserved ?? 0, currency: "RUB" },
    payoutPending: { amountMinor: options.wallet?.payoutPending ?? 0, currency: "RUB" },
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
    findAttemptByProviderPaymentId: vi.fn(
      async (input: {
        readonly provider: "arc_pay";
        readonly providerPaymentId: string;
      }) => {
        if (
          options.attemptMissing ||
          input.provider !== attempt.provider ||
          input.providerPaymentId !== attempt.providerPaymentId
        ) {
          return null;
        }
        return attempt;
      }
    ),
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
        listRequests: async (input) =>
          payoutRequests
            .filter((request) =>
              input?.astrologerUserId ? request.astrologerUserId === input.astrologerUserId : true
            )
            .filter((request) =>
              input?.statuses?.length ? input.statuses.includes(request.status) : true
            )
            .slice(0, input?.limit ?? 50),
        updateRequestStatus: async (input) => {
          payoutStatusUpdates.push(input);
          const existing = payoutRequests.find((request) => request.id === input.payoutRequestId);
          if (!existing) return null;
          const updated: PayoutRequestRecord = {
            ...existing,
            status: input.status,
            adminUserId: input.adminUserId,
            adminNote: input.adminNote ?? existing.adminNote,
            failureReason: input.failureReason ?? existing.failureReason,
            completedAt:
              input.status === "paid" ||
              input.status === "failed" ||
              input.status === "rejected" ||
              input.status === "cancelled"
                ? input.now
                : existing.completedAt,
            updatedAt: input.now
          };
          payoutRequests = payoutRequests.map((request) =>
            request.id === updated.id ? updated : request
          );
          return updated;
        },
        createTransaction: async (input) => {
          ledgerTransactions.push(input);
          applyWalletTransaction(walletBalance, input);
          return { ...input, id: "ledger-reversal-1", entries: [] };
        }
      };
      return operation(transactionStore);
    }
  };
  const reconciliationStore: ReconciliationStore = {
    findAttemptById: paymentStore.findAttemptById,
    findAttemptByProviderPaymentId: paymentStore.findAttemptByProviderPaymentId,
    createRecord: vi.fn(async (input) => {
      const existing = reconciliationRecords.find(
        (record) =>
          record.provider === input.provider &&
          record.providerPaymentId === input.providerPaymentId &&
          record.status === input.status
      );
      if (existing) return { kind: "replayed" as const, record: existing };
      const record: ReconciliationRecord = {
        id: `reconciliation-${reconciliationRecords.length + 1}`,
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
      reconciliationRecords.push(record);
      return { kind: "created" as const, record };
    }),
    listOpenExceptions: vi.fn(),
    resolveException: vi.fn()
  };
  const processor = createPaymentWebhookProcessor({
    paymentStore,
    orderStore,
    capturedSale,
    terminalPayment,
    reversal,
    reconciliationStore,
    resolvePaymentAttemptId,
    now: () => now
  });

  return {
    attempt,
    orderStore,
    markOrderPaid: markOrderPaidSpy,
    createdEvents,
    refunds,
    reconciliationRecords,
    payoutStatusUpdates,
    ledgerTransactions,
    outboxEvents,
    releasedBookingHolds,
    linkedProviderPaymentIds,
    resolvePaymentAttemptId,
    handler: createPaymentWebhookHandler({
      webhookSecret,
      timestampToleranceSeconds: 300,
      now: () => now,
      processor,
      financeIngress: options.financeIngress
    })
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

function paidBooking(state: "cancelled" | "expired"): Booking {
  return {
    id: bookingId,
    reservationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    ownerUserId: "44444444-4444-4444-8444-444444444444",
    clientUserId: "33333333-3333-4333-8333-333333333333",
    productId: "55555555-5555-4555-8555-555555555555",
    source: "client_paid",
    state,
    lifecycleRevision: 1,
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
    clientDataRequirementsSnapshot: {
      schemaVersion: "booking-client-data-requirements.v1",
      executionMode: "live",
      participantMode: "solo",
      requiredClientData: ["chart1"],
      methods: ["natal"]
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
