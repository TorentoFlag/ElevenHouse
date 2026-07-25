import type { FinanceOrder, FinanceOrderStore } from "../orders";
import type { PaymentProviderEvent, PaymentStore } from "../payments/payment-store";
import {
  assertPaymentMatchesOrder,
  assertWebhookMoneyFacts,
  PaymentWebhookAttemptNotFoundError,
  PaymentWebhookOrderNotFoundError,
  PaymentWebhookProviderContextMismatchError,
  type IngestPaymentProviderWebhookRequest
} from "../payments/payment-use-cases";
import type { CreateLedgerTransactionInput, LedgerStore } from "./ledger-store";

export type CapturedSaleOutboxEventType =
  | "finance.payment_captured"
  | "orders.order_paid"
  | "booking.payment_confirmed"
  | "notifications.payment_confirmation_requested";

export type CapturedSaleOutboxEvent = {
  readonly eventType: CapturedSaleOutboxEventType;
  readonly aggregateId: string;
  readonly payload: {
    readonly orderId: string;
    readonly paymentAttemptId: string;
    readonly providerEventId: string;
  };
  readonly occurredAt: string;
};

export type CapturedSaleTransactionStore = Pick<
  PaymentStore,
  | "findAttemptById"
  | "findProviderEventByWebhookId"
  | "linkAttemptToProviderPayment"
  | "recordProviderEvent"
> &
  Pick<FinanceOrderStore, "findById"> &
  Pick<LedgerStore, "createTransaction"> & {
    readonly markOrderPaid: (input: {
      readonly orderId: string;
      readonly now: string;
    }) => Promise<FinanceOrder | null>;
    readonly confirmPaidBooking: (input: {
      readonly bookingId: string;
      readonly orderId: string;
      readonly now: string;
    }) => Promise<unknown | null>;
    readonly recordCapturedSaleOutboxEvents: (
      input: readonly CapturedSaleOutboxEvent[]
    ) => Promise<void>;
  };

export type CapturedSaleUnitOfWork = {
  readonly transact: <T>(
    operation: (store: CapturedSaleTransactionStore) => Promise<T>
  ) => Promise<T>;
};

export type CapturePaymentProviderWebhookInput = {
  readonly capturedSale: CapturedSaleUnitOfWork;
  readonly request: IngestPaymentProviderWebhookRequest & { readonly type: "payment.captured" };
};

export type CapturePaymentProviderWebhookResult = {
  readonly kind: "created" | "replayed";
  readonly event: PaymentProviderEvent;
};

export class PaymentCaptureOrderNotPayableError extends Error {
  readonly code = "payment_capture_order_not_payable";

  constructor() {
    super("Captured payment order is not pending payment");
    this.name = "PaymentCaptureOrderNotPayableError";
  }
}

export class PaymentCaptureBookingNotConfirmableError extends Error {
  readonly code = "payment_capture_booking_not_confirmable";

  constructor() {
    super("Captured payment booking is not pending payment");
    this.name = "PaymentCaptureBookingNotConfirmableError";
  }
}

/**
 * The provider event, order transition, ledger posting, wallet projection and
 * outbox rows deliberately execute through one unit of work. A failed posting
 * leaves no duplicate webhook evidence that could suppress the provider retry.
 */
export async function capturePaymentProviderWebhook(
  input: CapturePaymentProviderWebhookInput
): Promise<CapturePaymentProviderWebhookResult> {
  return input.capturedSale.transact(async (store) => {
    const existing = await store.findProviderEventByWebhookId({
      provider: input.request.provider,
      environment: input.request.environment,
      providerWebhookId: input.request.providerWebhookId
    });
    if (existing) return { kind: "replayed", event: existing };

    const attempt = await store.findAttemptById(input.request.paymentAttemptId);
    if (!attempt) throw new PaymentWebhookAttemptNotFoundError();
    if (
      attempt.provider !== input.request.provider ||
      attempt.environment !== input.request.environment
    ) {
      throw new PaymentWebhookProviderContextMismatchError();
    }

    const order = await store.findById(attempt.orderId);
    if (!order) throw new PaymentWebhookOrderNotFoundError();
    if (order.status !== "pending_payment") throw new PaymentCaptureOrderNotPayableError();
    assertPaymentMatchesOrder(attempt, order);
    assertWebhookMoneyFacts(input.request.moneyFacts, attempt.amount);

    const linkedAttempt = await store.linkAttemptToProviderPayment({
      paymentAttemptId: attempt.id,
      provider: input.request.provider,
      environment: input.request.environment,
      providerPaymentId: input.request.providerPaymentId,
      now: input.request.receivedAt
    });
    if (!linkedAttempt) throw new PaymentWebhookAttemptNotFoundError();

    const providerEvent = await store.recordProviderEvent({
      paymentAttemptId: linkedAttempt.id,
      provider: input.request.provider,
      environment: input.request.environment,
      providerWebhookId: input.request.providerWebhookId,
      providerPaymentId: input.request.providerPaymentId,
      type: input.request.type,
      occurredAt: input.request.occurredAt,
      receivedAt: input.request.receivedAt,
      payload: input.request.payload
    });
    if (providerEvent.kind === "replayed") return providerEvent;

    const paidOrder = await store.markOrderPaid({
      orderId: order.id,
      now: input.request.receivedAt
    });
    if (!paidOrder) throw new PaymentCaptureOrderNotPayableError();
    if (order.bookingId) {
      const booking = await store.confirmPaidBooking({
        bookingId: order.bookingId,
        orderId: order.id,
        now: input.request.receivedAt
      });
      if (!booking) throw new PaymentCaptureBookingNotConfirmableError();
    }

    await store.createTransaction(createCapturedSaleLedgerTransaction(order, providerEvent.event));
    await store.recordCapturedSaleOutboxEvents(
      createCapturedSaleOutboxEvents(order, linkedAttempt.id, providerEvent.event)
    );

    return providerEvent;
  });
}

export function createCapturedSaleLedgerTransaction(
  order: FinanceOrder,
  providerEvent: PaymentProviderEvent
): CreateLedgerTransactionInput {
  return {
    operationType: "sale_captured",
    orderId: order.id,
    payoutRequestId: null,
    occurredAt: providerEvent.occurredAt,
    postedAt: providerEvent.receivedAt,
    metadata: {
      providerEventId: providerEvent.id,
      paymentAttemptId: providerEvent.paymentAttemptId,
      provider: providerEvent.provider,
      providerPaymentId: providerEvent.providerPaymentId
    },
    entries: [
      {
        account: {
          accountType: "platform_clearing",
          astrologerUserId: null,
          currency: order.grossAmount.currency
        },
        side: "debit",
        amount: order.grossAmount,
        metadata: { orderId: order.id, providerEventId: providerEvent.id }
      },
      {
        account: {
          accountType: "astrologer_pending",
          astrologerUserId: order.astrologerUserId,
          currency: order.astrologerNetAmount.currency
        },
        side: "credit",
        amount: order.astrologerNetAmount,
        metadata: { orderId: order.id, providerEventId: providerEvent.id }
      },
      {
        account: {
          accountType: "platform_revenue",
          astrologerUserId: null,
          currency: order.platformFee.currency
        },
        side: "credit",
        amount: order.platformFee,
        metadata: { orderId: order.id, providerEventId: providerEvent.id }
      }
    ]
  };
}

export function createCapturedSaleOutboxEvents(
  order: FinanceOrder,
  paymentAttemptId: string,
  providerEvent: PaymentProviderEvent
): readonly CapturedSaleOutboxEvent[] {
  const payload = {
    orderId: order.id,
    paymentAttemptId,
    providerEventId: providerEvent.id
  };
  return [
    {
      eventType: "finance.payment_captured",
      aggregateId: paymentAttemptId,
      payload,
      occurredAt: providerEvent.receivedAt
    },
    {
      eventType: "orders.order_paid",
      aggregateId: order.id,
      payload,
      occurredAt: providerEvent.receivedAt
    },
    ...(order.bookingId
      ? [
          {
            eventType: "booking.payment_confirmed" as const,
            aggregateId: order.bookingId,
            payload,
            occurredAt: providerEvent.receivedAt
          }
        ]
      : []),
    {
      eventType: "notifications.payment_confirmation_requested",
      aggregateId: order.id,
      payload,
      occurredAt: providerEvent.receivedAt
    }
  ];
}
