import type { FinanceOrder, FinanceOrderStore } from "../orders";
import type { PaymentProviderEvent, PaymentStore } from "../payments/payment-store";
import type { Money } from "../money";
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

export type ReleasableCapturedSaleHold = {
  readonly orderId: string;
  readonly astrologerUserId: string;
  readonly amount: Money;
  readonly capturedAt: string;
  readonly holdReleaseAt: string;
  readonly paymentAttemptId: string | null;
  readonly providerEventId: string | null;
};

export type HoldReleaseStore = {
  readonly listReleasableCapturedSaleHolds: (input: {
    readonly now: string;
    readonly limit: number;
  }) => Promise<readonly ReleasableCapturedSaleHold[]>;
  readonly releaseCapturedSaleHold: (input: {
    readonly hold: ReleasableCapturedSaleHold;
    readonly now: string;
    readonly commandExpiresAt: string;
  }) => Promise<{ readonly kind: "released" | "replayed"; readonly transactionId: string }>;
};

export type ReleaseDueCapturedSaleHoldsResult = {
  readonly scanned: number;
  readonly released: number;
  readonly replayed: number;
  readonly orderIds: readonly string[];
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
  const holdReleaseAt = computeHoldReleaseAt(
    providerEvent.receivedAt,
    order.financePolicyHoldDurationHours
  );
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
      providerPaymentId: providerEvent.providerPaymentId,
      holdDurationHours: order.financePolicyHoldDurationHours,
      holdReleaseAt,
      financePolicySnapshotId: order.financePolicySnapshotId,
      financePolicyRiskTier: order.financePolicyRiskTier
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
        metadata: {
          orderId: order.id,
          providerEventId: providerEvent.id,
          holdDurationHours: order.financePolicyHoldDurationHours,
          holdReleaseAt,
          financePolicySnapshotId: order.financePolicySnapshotId
        }
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

export async function releaseDueCapturedSaleHolds(input: {
  readonly store: HoldReleaseStore;
  readonly now: Date;
  readonly limit: number;
  readonly commandTtlMs?: number;
}): Promise<ReleaseDueCapturedSaleHoldsResult> {
  if (!Number.isSafeInteger(input.limit) || input.limit <= 0) {
    throw new Error("Captured sale hold release limit must be a positive safe integer");
  }
  const now = input.now.toISOString();
  const commandExpiresAt = new Date(
    input.now.getTime() + (input.commandTtlMs ?? 30 * 24 * 60 * 60 * 1000)
  ).toISOString();
  const holds = await input.store.listReleasableCapturedSaleHolds({ now, limit: input.limit });
  let released = 0;
  let replayed = 0;

  for (const hold of holds) {
    const result = await input.store.releaseCapturedSaleHold({ hold, now, commandExpiresAt });
    if (result.kind === "released") released += 1;
    else replayed += 1;
  }

  return {
    scanned: holds.length,
    released,
    replayed,
    orderIds: holds.map((hold) => hold.orderId)
  };
}

export function createCapturedSaleHoldReleaseLedgerTransaction(
  hold: ReleasableCapturedSaleHold,
  now: string
): CreateLedgerTransactionInput {
  assertPositiveRubMoney(hold.amount);
  return {
    operationType: "funds_released",
    orderId: hold.orderId,
    payoutRequestId: null,
    occurredAt: now,
    postedAt: now,
    metadata: {
      reason: "captured_sale_hold_elapsed",
      holdReleaseAt: hold.holdReleaseAt,
      providerEventId: hold.providerEventId,
      paymentAttemptId: hold.paymentAttemptId
    },
    entries: [
      {
        account: {
          accountType: "astrologer_pending",
          astrologerUserId: hold.astrologerUserId,
          currency: hold.amount.currency
        },
        side: "debit",
        amount: hold.amount,
        metadata: {
          orderId: hold.orderId,
          reason: "captured_sale_hold_elapsed",
          holdReleaseAt: hold.holdReleaseAt
        }
      },
      {
        account: {
          accountType: "astrologer_available",
          astrologerUserId: hold.astrologerUserId,
          currency: hold.amount.currency
        },
        side: "credit",
        amount: hold.amount,
        metadata: {
          orderId: hold.orderId,
          reason: "captured_sale_hold_elapsed",
          holdReleaseAt: hold.holdReleaseAt
        }
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

function computeHoldReleaseAt(capturedAt: string, holdDurationHours: number): string {
  if (
    !Number.isSafeInteger(holdDurationHours) ||
    holdDurationHours < 0 ||
    holdDurationHours > 4_320
  ) {
    throw new Error("Finance policy hold duration must be a safe integer between 0 and 4320 hours");
  }
  const capturedTime = new Date(capturedAt).getTime();
  if (!Number.isFinite(capturedTime)) throw new Error("Captured sale timestamp is invalid");
  return new Date(capturedTime + holdDurationHours * 60 * 60 * 1000).toISOString();
}

function assertPositiveRubMoney(amount: Money): void {
  if (amount.currency !== "RUB") throw new Error(`Unsupported finance currency: ${amount.currency}`);
  if (!Number.isSafeInteger(amount.amountMinor) || amount.amountMinor <= 0) {
    throw new Error("Finance money amount must be a positive safe integer");
  }
}
