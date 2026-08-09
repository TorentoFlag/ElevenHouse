import { createHash, randomUUID } from "node:crypto";
import type { BookingCommandStore } from "../bookings";
import type { Money } from "../money";
import type { FinanceOrder, FinanceOrderStore } from "../orders";
import type {
  PaymentAttempt,
  PaymentProviderEvent,
  PaymentProviderEventType,
  PaymentStore
} from "./payment-store";
import type { PaymentProviderPort } from "./payment-provider-port";

const createCheckoutScopePrefix = "payments.checkout";
const createCheckoutIdempotencyTtlMs = 24 * 60 * 60 * 1000;

export type CreatePaymentCheckoutRequest = {
  readonly orderId: string;
  readonly successUrl: string;
  readonly failureUrl: string;
  readonly cancelUrl: string;
};

export type CreatePaymentCheckoutUseCaseInput = {
  readonly orderStore: Pick<FinanceOrderStore, "findById">;
  readonly paymentStore: Pick<PaymentStore, "executeCreateCheckout" | "markAttemptCheckoutOpened">;
  readonly provider: PaymentProviderPort;
  readonly clientUserId: string;
  readonly request: CreatePaymentCheckoutRequest;
  readonly idempotencyKey: string;
  readonly now: Date;
  readonly idGenerator?: () => string;
};

export type PaymentCheckout = {
  readonly paymentAttemptId: string;
  readonly checkoutUrl: string;
  readonly providerCheckoutId: string;
};

export type TerminalPaymentProviderEventType =
  | "payment.failed"
  | "payment.declined"
  | "payment.expired"
  | "payment.voided";

export type TerminalPaymentTransactionStore = Pick<
  PaymentStore,
  | "findAttemptById"
  | "findProviderEventByWebhookId"
  | "linkAttemptToProviderPayment"
  | "recordProviderEvent"
> &
  Pick<FinanceOrderStore, "findById" | "updateStatus"> &
  Pick<BookingCommandStore, "releasePaidBookingPaymentHold">;

export type TerminalPaymentUnitOfWork = {
  readonly transact: <T>(
    operation: (store: TerminalPaymentTransactionStore) => Promise<T>
  ) => Promise<T>;
};

export class PaymentCheckoutOrderNotFoundError extends Error {
  readonly code = "payment_checkout_order_not_found";

  constructor() {
    super("Order was not found for payment checkout");
    this.name = "PaymentCheckoutOrderNotFoundError";
  }
}

export class PaymentCheckoutOrderAccessDeniedError extends Error {
  readonly code = "payment_checkout_order_access_denied";

  constructor() {
    super("Client cannot open checkout for this order");
    this.name = "PaymentCheckoutOrderAccessDeniedError";
  }
}

export class PaymentCheckoutOrderNotPayableError extends Error {
  readonly code = "payment_checkout_order_not_payable";

  constructor() {
    super("Order is not pending payment");
    this.name = "PaymentCheckoutOrderNotPayableError";
  }
}

export class PaymentCheckoutPersistenceError extends Error {
  readonly code = "payment_checkout_persistence_failed";

  constructor() {
    super("Payment checkout could not be persisted");
    this.name = "PaymentCheckoutPersistenceError";
  }
}

export type PaymentWebhookMoney = {
  readonly amountMinor: number;
  readonly currency: string;
};

export type PaymentWebhookMoneyFacts =
  | {
      readonly kind: "exact";
      readonly amounts: readonly [PaymentWebhookMoney, ...PaymentWebhookMoney[]];
    }
  | {
      readonly kind: "bounded";
      readonly amounts: readonly [PaymentWebhookMoney, ...PaymentWebhookMoney[]];
    }
  | { readonly kind: "none"; readonly amounts: readonly [] };

export type IngestPaymentProviderWebhookRequest = {
  readonly paymentAttemptId: string;
  readonly provider: "arc_pay";
  readonly providerWebhookId: string;
  readonly providerPaymentId: string;
  readonly type: PaymentProviderEventType;
  readonly occurredAt: string;
  readonly receivedAt: string;
  readonly payload: Record<string, unknown>;
  readonly moneyFacts: PaymentWebhookMoneyFacts;
};

export type IngestPaymentProviderWebhookInput = {
  readonly paymentStore: Pick<
    PaymentStore,
    "findAttemptById" | "linkAttemptToProviderPayment" | "recordProviderEvent"
  >;
  readonly orderStore: Pick<FinanceOrderStore, "findById">;
  readonly request: IngestPaymentProviderWebhookRequest;
};

export type ReleaseTerminalPaymentProviderWebhookInput = {
  readonly terminalPayment: TerminalPaymentUnitOfWork;
  readonly request: IngestPaymentProviderWebhookRequest & {
    readonly type: TerminalPaymentProviderEventType;
  };
};

export class PaymentWebhookAttemptNotFoundError extends Error {
  readonly code = "payment_webhook_attempt_not_found";

  constructor() {
    super("Payment attempt was not found for provider webhook");
    this.name = "PaymentWebhookAttemptNotFoundError";
  }
}

export class PaymentWebhookOrderNotFoundError extends Error {
  readonly code = "payment_webhook_order_not_found";

  constructor() {
    super("Order was not found for provider webhook");
    this.name = "PaymentWebhookOrderNotFoundError";
  }
}

export class PaymentWebhookProviderContextMismatchError extends Error {
  readonly code = "payment_webhook_provider_context_mismatch";

  constructor() {
    super("Provider webhook does not match the linked payment attempt context");
    this.name = "PaymentWebhookProviderContextMismatchError";
  }
}

export class PaymentWebhookAmountMismatchError extends Error {
  readonly code = "payment_amount_mismatch";

  constructor() {
    super("Provider webhook amount does not match the linked payment");
    this.name = "PaymentWebhookAmountMismatchError";
  }
}

export class PaymentWebhookCurrencyMismatchError extends Error {
  readonly code = "payment_currency_mismatch";

  constructor() {
    super("Provider webhook currency does not match the linked payment");
    this.name = "PaymentWebhookCurrencyMismatchError";
  }
}

export class PaymentTerminalBookingNotReleasableError extends Error {
  readonly code = "payment_terminal_booking_not_releasable";

  constructor() {
    super("Terminal payment booking could not be released");
    this.name = "PaymentTerminalBookingNotReleasableError";
  }
}

export async function createPaymentCheckout(
  input: CreatePaymentCheckoutUseCaseInput
): Promise<PaymentCheckout> {
  const order = await requirePayableOrder(input);
  const nowIso = input.now.toISOString();
  const attemptResult = await input.paymentStore.executeCreateCheckout(
    {
      scope: `${createCheckoutScopePrefix}:${input.clientUserId}`,
      idempotencyKey: input.idempotencyKey,
      actorUserId: input.clientUserId,
      requestHash: hashCheckoutRequest(input.clientUserId, input.request),
      now: nowIso,
      expiresAt: new Date(input.now.getTime() + createCheckoutIdempotencyTtlMs).toISOString()
    },
    async () => ({
      id: (input.idGenerator ?? randomUUID)(),
      orderId: order.id,
      provider: input.provider.provider,
      status: "created",
      amount: order.grossAmount,
      providerPaymentId: null,
      providerCheckoutId: null,
      idempotencyKey: input.idempotencyKey,
      metadata: {},
      now: nowIso
    })
  );

  const existingCheckout = checkoutFromAttempt(attemptResult.value);
  if (existingCheckout) return existingCheckout;

  // The provider call intentionally happens after the local idempotent command commits.
  const providerCheckout = await input.provider.openCheckout({
    paymentAttemptId: attemptResult.value.id,
    orderId: order.id,
    amount: order.grossAmount,
    successUrl: input.request.successUrl,
    failureUrl: input.request.failureUrl,
    cancelUrl: input.request.cancelUrl
  });
  const persistedAttempt = await input.paymentStore.markAttemptCheckoutOpened({
    paymentAttemptId: attemptResult.value.id,
    providerCheckoutId: providerCheckout.providerCheckoutId,
    checkoutUrl: providerCheckout.checkoutUrl,
    now: nowIso
  });
  const checkout = persistedAttempt ? checkoutFromAttempt(persistedAttempt) : null;
  if (!checkout || checkout.providerCheckoutId !== providerCheckout.providerCheckoutId) {
    throw new PaymentCheckoutPersistenceError();
  }
  return checkout;
}

export async function ingestPaymentProviderWebhook(
  input: IngestPaymentProviderWebhookInput
): Promise<{ readonly kind: "created" | "replayed"; readonly event: PaymentProviderEvent }> {
  const attempt = await input.paymentStore.findAttemptById(input.request.paymentAttemptId);
  if (!attempt) throw new PaymentWebhookAttemptNotFoundError();
  if (attempt.provider !== input.request.provider) {
    throw new PaymentWebhookProviderContextMismatchError();
  }

  const order = await input.orderStore.findById(attempt.orderId);
  if (!order) throw new PaymentWebhookOrderNotFoundError();
  assertPaymentMatchesOrder(attempt, order);
  assertWebhookMoneyFacts(input.request.moneyFacts, attempt.amount);

  const linkedAttempt = await input.paymentStore.linkAttemptToProviderPayment({
    paymentAttemptId: attempt.id,
    provider: input.request.provider,
    providerPaymentId: input.request.providerPaymentId,
    now: input.request.receivedAt
  });
  if (!linkedAttempt) throw new PaymentWebhookAttemptNotFoundError();

  return input.paymentStore.recordProviderEvent({
    paymentAttemptId: linkedAttempt.id,
    provider: input.request.provider,
    providerWebhookId: input.request.providerWebhookId,
    providerPaymentId: input.request.providerPaymentId,
    type: input.request.type,
    occurredAt: input.request.occurredAt,
    receivedAt: input.request.receivedAt,
    payload: input.request.payload
  });
}

/**
 * Terminal provider events for an unpaid order must release the booking slot in
 * the same transaction as webhook persistence. Otherwise a stored duplicate
 * webhook could suppress the retry that frees the reservation.
 */
export async function releaseTerminalPaymentProviderWebhook(
  input: ReleaseTerminalPaymentProviderWebhookInput
): Promise<{ readonly kind: "created" | "replayed"; readonly event: PaymentProviderEvent }> {
  return input.terminalPayment.transact(async (store) => {
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

    if (order.status !== "pending_payment") return providerEvent;

    const nextState = terminalBookingState(input.request.type);
    await store.updateStatus({
      orderId: order.id,
      status: nextState,
      now: input.request.receivedAt
    });
    if (order.bookingId) {
      const booking = await store.releasePaidBookingPaymentHold({
        bookingId: order.bookingId,
        state: nextState,
        now: input.request.receivedAt
      });
      if (!booking) throw new PaymentTerminalBookingNotReleasableError();
    }

    return providerEvent;
  });
}

async function requirePayableOrder(
  input: CreatePaymentCheckoutUseCaseInput
): Promise<FinanceOrder> {
  const order = await input.orderStore.findById(input.request.orderId);
  if (!order) throw new PaymentCheckoutOrderNotFoundError();
  if (order.clientUserId !== input.clientUserId) throw new PaymentCheckoutOrderAccessDeniedError();
  if (order.status !== "pending_payment") throw new PaymentCheckoutOrderNotPayableError();
  return order;
}

function checkoutFromAttempt(attempt: PaymentAttempt): PaymentCheckout | null {
  const checkoutUrl = attempt.metadata.checkoutUrl;
  if (attempt.providerCheckoutId && typeof checkoutUrl === "string" && checkoutUrl.length > 0) {
    return {
      paymentAttemptId: attempt.id,
      providerCheckoutId: attempt.providerCheckoutId,
      checkoutUrl
    };
  }
  return null;
}

function terminalBookingState(
  type: TerminalPaymentProviderEventType
): "cancelled" | "expired" {
  return type === "payment.expired" ? "expired" : "cancelled";
}

export function assertPaymentMatchesOrder(attempt: PaymentAttempt, order: FinanceOrder): void {
  assertSameMoney(attempt.amount, order.grossAmount);
}

export function assertWebhookMoneyFacts(facts: PaymentWebhookMoneyFacts, expected: Money): void {
  for (const amount of facts.amounts) {
    if (amount.currency !== expected.currency) throw new PaymentWebhookCurrencyMismatchError();
    if (facts.kind === "exact" && amount.amountMinor !== expected.amountMinor) {
      throw new PaymentWebhookAmountMismatchError();
    }
    if (
      facts.kind === "bounded" &&
      (amount.amountMinor <= 0 || amount.amountMinor > expected.amountMinor)
    ) {
      throw new PaymentWebhookAmountMismatchError();
    }
  }
}

function assertSameMoney(left: Money, right: Money): void {
  if (left.currency !== right.currency) throw new PaymentWebhookCurrencyMismatchError();
  if (left.amountMinor !== right.amountMinor) throw new PaymentWebhookAmountMismatchError();
}

function hashCheckoutRequest(
  clientUserId: string,
  request: CreatePaymentCheckoutRequest
): `sha256:${string}` {
  return `sha256:${createHash("sha256")
    .update(JSON.stringify({ clientUserId, ...request }))
    .digest("hex")}`;
}
