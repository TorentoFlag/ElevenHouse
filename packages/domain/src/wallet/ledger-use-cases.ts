import type { FinanceOrder, FinanceOrderStore } from "../orders";
import type {
  PaymentProviderEvent,
  PaymentProviderEventType,
  PaymentStore
} from "../payments/payment-store";
import type { PayoutRequestRecord, PayoutRequestStatus, PayoutStore } from "../payouts";
import type { Money } from "../money";
import {
  assertPaymentMatchesOrder,
  assertWebhookMoneyFacts,
  PaymentWebhookAmountMismatchError,
  PaymentWebhookAttemptNotFoundError,
  PaymentWebhookCurrencyMismatchError,
  PaymentWebhookOrderNotFoundError,
  PaymentWebhookProviderContextMismatchError,
  type IngestPaymentProviderWebhookRequest
} from "../payments/payment-use-cases";
import type {
  CreateLedgerEntryInput,
  CreateLedgerTransactionInput,
  LedgerStore,
  WalletBalance
} from "./ledger-store";

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

export type RefundReversalProviderEventType =
  | "payment.refunded"
  | "payment.partially_refunded"
  | "payment.chargeback";

export type RefundReversalTransactionStore = Pick<
  PaymentStore,
  | "findAttemptById"
  | "findProviderEventByWebhookId"
  | "linkAttemptToProviderPayment"
  | "recordProviderEvent"
  | "createRefund"
> &
  Pick<FinanceOrderStore, "findById" | "updateStatus"> &
  Pick<LedgerStore, "createTransaction" | "findWalletBalance"> &
  Pick<PayoutStore, "listRequests" | "updateRequestStatus">;

export type RefundReversalUnitOfWork = {
  readonly transact: <T>(
    operation: (store: RefundReversalTransactionStore) => Promise<T>
  ) => Promise<T>;
};

export type RecordPaymentReversalProviderWebhookInput = {
  readonly reversal: RefundReversalUnitOfWork;
  readonly request: IngestPaymentProviderWebhookRequest & {
    readonly type: RefundReversalProviderEventType;
  };
};

export type RecordPaymentReversalProviderWebhookResult = {
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

export class PaymentReversalProviderRefundIdMissingError extends Error {
  readonly code = "payment_reversal_provider_refund_id_missing";

  constructor() {
    super("Refund webhook is missing provider refund id");
    this.name = "PaymentReversalProviderRefundIdMissingError";
  }
}

export class PaymentReversalOrderNotReversibleError extends Error {
  readonly code = "payment_reversal_order_not_reversible";

  constructor() {
    super("Payment reversal order cannot be reversed from its current state");
    this.name = "PaymentReversalOrderNotReversibleError";
  }
}

export class PaymentReversalPayoutBlockError extends Error {
  readonly code = "payment_reversal_payout_block_failed";

  constructor() {
    super("Payment reversal could not block an open payout request");
    this.name = "PaymentReversalPayoutBlockError";
  }
}

export const chargebackBlockedPayoutFailureReason =
  "Provider chargeback blocked payout before paid confirmation";

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
      providerWebhookId: input.request.providerWebhookId
    });
    if (existing) return { kind: "replayed", event: existing };

    const attempt = await store.findAttemptById(input.request.paymentAttemptId);
    if (!attempt) throw new PaymentWebhookAttemptNotFoundError();
    if (attempt.provider !== input.request.provider) {
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
      providerPaymentId: input.request.providerPaymentId,
      now: input.request.receivedAt
    });
    if (!linkedAttempt) throw new PaymentWebhookAttemptNotFoundError();

    const providerEvent = await store.recordProviderEvent({
      paymentAttemptId: linkedAttempt.id,
      provider: input.request.provider,
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

/**
 * Refunds and chargebacks are provider evidence first, but the business balance
 * impact is ElevenHouse-owned. The whole reversal posts through one unit of
 * work so webhook retries cannot persist evidence without the wallet clawback.
 */
export async function recordPaymentReversalProviderWebhook(
  input: RecordPaymentReversalProviderWebhookInput
): Promise<RecordPaymentReversalProviderWebhookResult> {
  return input.reversal.transact(async (store) => {
    const existing = await store.findProviderEventByWebhookId({
      provider: input.request.provider,
      providerWebhookId: input.request.providerWebhookId
    });
    if (existing) return { kind: "replayed", event: existing };

    const attempt = await store.findAttemptById(input.request.paymentAttemptId);
    if (!attempt) throw new PaymentWebhookAttemptNotFoundError();
    if (attempt.provider !== input.request.provider) {
      throw new PaymentWebhookProviderContextMismatchError();
    }

    const order = await store.findById(attempt.orderId);
    if (!order) throw new PaymentWebhookOrderNotFoundError();
    assertPaymentMatchesOrder(attempt, order);
    assertWebhookMoneyFacts(input.request.moneyFacts, attempt.amount);
    assertOrderReversible(order);

    const linkedAttempt = await store.linkAttemptToProviderPayment({
      paymentAttemptId: attempt.id,
      provider: input.request.provider,
      providerPaymentId: input.request.providerPaymentId,
      now: input.request.receivedAt
    });
    if (!linkedAttempt) throw new PaymentWebhookAttemptNotFoundError();

    const providerEvent = await store.recordProviderEvent({
      paymentAttemptId: linkedAttempt.id,
      provider: input.request.provider,
      providerWebhookId: input.request.providerWebhookId,
      providerPaymentId: input.request.providerPaymentId,
      type: input.request.type,
      occurredAt: input.request.occurredAt,
      receivedAt: input.request.receivedAt,
      payload: input.request.payload
    });
    if (providerEvent.kind === "replayed") return providerEvent;

    const reversalAmount = requirePrimaryReversalAmount(input.request);
    const providerRefundId =
      input.request.type === "payment.chargeback"
        ? null
        : requireProviderRefundId(input.request.payload);

    if (input.request.type !== "payment.chargeback") {
      const refund = await store.createRefund({
        orderId: order.id,
        paymentAttemptId: linkedAttempt.id,
        providerEventId: providerEvent.event.id,
        provider: input.request.provider,
        status: "succeeded",
        amount: reversalAmount,
        reason: "provider_refund",
        providerRefundId,
        now: input.request.receivedAt
      });
      if (refund.kind === "replayed") return { kind: "replayed", event: providerEvent.event };
    }

    const updatedOrder = await store.updateStatus({
      orderId: order.id,
      status: nextReversalOrderStatus(input.request.type, input.request, order),
      now: input.request.receivedAt
    });
    if (!updatedOrder) throw new PaymentReversalOrderNotReversibleError();

    let walletBalance = await store.findWalletBalance(order.astrologerUserId);

    if (input.request.type === "payment.chargeback") {
      walletBalance = await blockOpenPayoutRequestsForChargeback({
        store,
        order,
        providerEvent: providerEvent.event,
        walletBalance
      });
    }

    await store.createTransaction(
      createPaymentReversalLedgerTransaction({
        order,
        providerEvent: providerEvent.event,
        reversalAmount,
        walletBalance,
        providerRefundId,
        operationType:
          input.request.type === "payment.chargeback" ? "chargeback_recorded" : "refund_recorded"
      })
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

export function createPaymentReversalLedgerTransaction(input: {
  readonly order: FinanceOrder;
  readonly providerEvent: PaymentProviderEvent;
  readonly reversalAmount: Money;
  readonly walletBalance: WalletBalance | null;
  readonly providerRefundId: string | null;
  readonly operationType: "refund_recorded" | "chargeback_recorded";
}): CreateLedgerTransactionInput {
  assertPositiveRubMoney(input.reversalAmount);
  const grossMinor = input.reversalAmount.amountMinor;
  const platformFeeMinor = proratePlatformFee(input.order, grossMinor);
  const astrologerShareMinor = grossMinor - platformFeeMinor;
  const entries: CreateLedgerEntryInput[] = [];

  if (platformFeeMinor > 0) {
    entries.push({
      account: {
        accountType: "platform_revenue",
        astrologerUserId: null,
        currency: input.reversalAmount.currency
      },
      side: "debit",
      amount: money(platformFeeMinor, input.reversalAmount.currency),
      metadata: { orderId: input.order.id, providerEventId: input.providerEvent.id }
    });
  }

  entries.push(
    ...allocateAstrologerReversal(
      astrologerShareMinor,
      input.walletBalance,
      input.order.astrologerUserId
    )
  );
  entries.push({
    account: {
      accountType: "platform_clearing",
      astrologerUserId: null,
      currency: input.reversalAmount.currency
    },
    side: "credit",
    amount: input.reversalAmount,
    metadata: { orderId: input.order.id, providerEventId: input.providerEvent.id }
  });

  return {
    operationType: input.operationType,
    orderId: input.order.id,
    payoutRequestId: null,
    occurredAt: input.providerEvent.occurredAt,
    postedAt: input.providerEvent.receivedAt,
    metadata: {
      reason:
        input.operationType === "chargeback_recorded" ? "provider_chargeback" : "provider_refund",
      providerEventId: input.providerEvent.id,
      paymentAttemptId: input.providerEvent.paymentAttemptId,
      provider: input.providerEvent.provider,
      providerPaymentId: input.providerEvent.providerPaymentId,
      providerRefundId: input.providerRefundId,
      reversalGrossAmountMinor: grossMinor,
      platformFeeReversalAmountMinor: platformFeeMinor,
      astrologerShareReversalAmountMinor: astrologerShareMinor,
      financePolicySnapshotId: input.order.financePolicySnapshotId,
      financePolicyRiskTier: input.order.financePolicyRiskTier
    },
    entries
  };
}

async function blockOpenPayoutRequestsForChargeback(input: {
  readonly store: RefundReversalTransactionStore;
  readonly order: FinanceOrder;
  readonly providerEvent: PaymentProviderEvent;
  readonly walletBalance: WalletBalance | null;
}): Promise<WalletBalance | null> {
  if ((input.walletBalance?.payoutPending.amountMinor ?? 0) <= 0) return input.walletBalance;

  const requests = await input.store.listRequests({
    astrologerUserId: input.order.astrologerUserId,
    statuses: chargebackBlockablePayoutStatuses,
    limit: 100
  });

  for (const request of requests) {
    const status = chargebackBlockedPayoutStatus(request);
    const updated = await input.store.updateRequestStatus({
      payoutRequestId: request.id,
      expectedVersion: request.version,
      status,
      adminUserId: null,
      adminNote: `Blocked automatically by provider chargeback ${input.providerEvent.providerWebhookId} for order ${input.order.id}`,
      failureReason: chargebackBlockedPayoutFailureReason,
      now: input.providerEvent.receivedAt
    });
    if (!updated) throw new PaymentReversalPayoutBlockError();
    await input.store.createTransaction(
      createChargebackBlockedPayoutReleaseLedgerTransaction({
        before: request,
        after: updated,
        providerEvent: input.providerEvent,
        order: input.order
      })
    );
  }

  return input.store.findWalletBalance(input.order.astrologerUserId);
}

function chargebackBlockedPayoutStatus(
  request: PayoutRequestRecord
): Extract<PayoutRequestStatus, "cancelled" | "failed"> {
  return request.status === "processing_manual"
    ? "failed"
    : "cancelled";
}

const chargebackBlockablePayoutStatuses = [
  "requested",
  "under_review",
  "approved",
  "processing_manual"
] as const satisfies readonly PayoutRequestStatus[];

function createChargebackBlockedPayoutReleaseLedgerTransaction(input: {
  readonly before: PayoutRequestRecord;
  readonly after: PayoutRequestRecord;
  readonly providerEvent: PaymentProviderEvent;
  readonly order: FinanceOrder;
}): CreateLedgerTransactionInput {
  return {
    operationType: "payout_failed",
    orderId: null,
    payoutRequestId: input.after.id,
    occurredAt: input.providerEvent.receivedAt,
    postedAt: input.providerEvent.receivedAt,
    metadata: {
      reason: "provider_chargeback_blocked_payout",
      providerEventId: input.providerEvent.id,
      providerWebhookId: input.providerEvent.providerWebhookId,
      orderId: input.order.id,
      fromStatus: input.before.status,
      toStatus: input.after.status,
      failureReason: input.after.failureReason,
      adminUserId: null
    },
    entries: [
      {
        account: {
          accountType: "astrologer_payout_pending",
          astrologerUserId: input.after.astrologerUserId,
          currency: input.after.amount.currency
        },
        side: "debit",
        amount: input.after.amount,
        metadata: { payoutRequestId: input.after.id, reason: "provider_chargeback_blocked_payout" }
      },
      {
        account: {
          accountType: "astrologer_available",
          astrologerUserId: input.after.astrologerUserId,
          currency: input.after.amount.currency
        },
        side: "credit",
        amount: input.after.amount,
        metadata: { payoutRequestId: input.after.id, reason: "provider_chargeback_blocked_payout" }
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

function requirePrimaryReversalAmount(
  request: IngestPaymentProviderWebhookRequest & { readonly type: RefundReversalProviderEventType }
): Money {
  const amount = request.moneyFacts.amounts[0];
  if (!amount) throw new PaymentWebhookAmountMismatchError();
  if (amount.currency !== "RUB") throw new PaymentWebhookCurrencyMismatchError();
  return { amountMinor: amount.amountMinor, currency: amount.currency };
}

function requireProviderRefundId(payload: Record<string, unknown>): string {
  const data = payload.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const refundId = (data as Record<string, unknown>).refund_id;
    if (typeof refundId === "string" && refundId.length > 0) return refundId;
  }
  throw new PaymentReversalProviderRefundIdMissingError();
}

function nextReversalOrderStatus(
  type: PaymentProviderEventType,
  request: IngestPaymentProviderWebhookRequest,
  order: FinanceOrder
): "partially_refunded" | "refunded" | "chargeback" {
  if (type === "payment.chargeback") return "chargeback";
  const totalRefunded =
    request.moneyFacts.amounts[1]?.amountMinor ?? request.moneyFacts.amounts[0]?.amountMinor;
  return totalRefunded === order.grossAmount.amountMinor ? "refunded" : "partially_refunded";
}

function assertOrderReversible(order: FinanceOrder): void {
  if (!["paid", "fulfilled", "partially_refunded"].includes(order.status)) {
    throw new PaymentReversalOrderNotReversibleError();
  }
}

function proratePlatformFee(order: FinanceOrder, reversalGrossMinor: number): number {
  if (reversalGrossMinor === order.grossAmount.amountMinor) return order.platformFee.amountMinor;
  return Math.floor(
    (order.platformFee.amountMinor * reversalGrossMinor) / order.grossAmount.amountMinor
  );
}

function allocateAstrologerReversal(
  amountMinor: number,
  walletBalance: WalletBalance | null,
  astrologerUserId: string
): CreateLedgerEntryInput[] {
  const pendingMinor = Math.min(walletBalance?.pending.amountMinor ?? 0, amountMinor);
  let remainingMinor = amountMinor - pendingMinor;
  const availableMinor = Math.min(walletBalance?.available.amountMinor ?? 0, remainingMinor);
  remainingMinor -= availableMinor;
  const reservedMinor = Math.min(walletBalance?.reserved.amountMinor ?? 0, remainingMinor);
  remainingMinor -= reservedMinor;
  const payoutPendingMinor = Math.min(
    walletBalance?.payoutPending.amountMinor ?? 0,
    remainingMinor
  );
  remainingMinor -= payoutPendingMinor;

  return [
    createAstrologerReversalEntry("astrologer_pending", astrologerUserId, pendingMinor),
    createAstrologerReversalEntry("astrologer_available", astrologerUserId, availableMinor),
    createAstrologerReversalEntry("astrologer_reserved", astrologerUserId, reservedMinor),
    createAstrologerReversalEntry(
      "astrologer_payout_pending",
      astrologerUserId,
      payoutPendingMinor
    ),
    createAstrologerReversalEntry("astrologer_negative_balance", astrologerUserId, remainingMinor)
  ].filter((entry): entry is CreateLedgerEntryInput => entry !== null);
}

function createAstrologerReversalEntry(
  accountType:
    | "astrologer_pending"
    | "astrologer_available"
    | "astrologer_reserved"
    | "astrologer_payout_pending"
    | "astrologer_negative_balance",
  astrologerUserId: string,
  amountMinor: number
): CreateLedgerEntryInput | null {
  if (amountMinor <= 0) return null;
  return {
    account: { accountType, astrologerUserId, currency: "RUB" },
    side: "debit",
    amount: money(amountMinor, "RUB"),
    metadata: { reason: "payment_reversal" }
  };
}

function assertPositiveRubMoney(amount: Money): void {
  if (amount.currency !== "RUB")
    throw new Error(`Unsupported finance currency: ${amount.currency}`);
  if (!Number.isSafeInteger(amount.amountMinor) || amount.amountMinor <= 0) {
    throw new Error("Finance money amount must be a positive safe integer");
  }
}

function money(amountMinor: number, currency: Money["currency"]): Money {
  return { amountMinor, currency };
}
