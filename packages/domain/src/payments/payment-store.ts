import type { Money } from "../money";
import type {
  FinanceIdempotentCommand,
  FinanceIdempotentCommandResult
} from "../finance/shared/idempotent-command";

export type FinancePaymentProvider = "arc_pay";
export type PaymentProviderEnvironment = "sandbox" | "live";

export type PaymentAttemptStatus =
  | "created"
  | "checkout_opened"
  | "pending"
  | "authorized"
  | "captured"
  | "settled"
  | "failed"
  | "declined"
  | "timeout"
  | "expired"
  | "voided"
  | "partially_refunded"
  | "refunded"
  | "chargeback";

export type PaymentProviderEventType =
  | "payment.created"
  | "payment.checkout_opened"
  | "payment.pending"
  | "payment.pending_3ds"
  | "payment.authorized"
  | "payment.processing"
  | "payment.captured"
  | "payment.settled"
  | "payment.failed"
  | "payment.declined"
  | "payment.timeout"
  | "payment.expired"
  | "payment.voided"
  | "payment.refunded"
  | "payment.partially_refunded"
  | "payment.chargeback"
  | "settlement.cleared"
  | "reconciliation.exception";

export type RefundStatus = "requested" | "processing" | "succeeded" | "failed";

export type PaymentAttempt = {
  readonly id: string;
  readonly orderId: string;
  readonly provider: FinancePaymentProvider;
  readonly environment: PaymentProviderEnvironment;
  readonly status: PaymentAttemptStatus;
  readonly amount: Money;
  readonly providerPaymentId: string | null;
  readonly providerCheckoutId: string | null;
  readonly idempotencyKey: string;
  readonly metadata: Record<string, unknown>;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type PaymentProviderEvent = {
  readonly id: string;
  readonly paymentAttemptId: string | null;
  readonly provider: FinancePaymentProvider;
  readonly environment: PaymentProviderEnvironment;
  readonly providerWebhookId: string;
  readonly providerPaymentId: string | null;
  readonly type: PaymentProviderEventType;
  readonly occurredAt: string;
  readonly receivedAt: string;
  readonly payload: Record<string, unknown>;
};

export type RefundRecord = {
  readonly id: string;
  readonly orderId: string;
  readonly paymentAttemptId: string;
  readonly providerEventId: string | null;
  readonly provider: FinancePaymentProvider;
  readonly environment: PaymentProviderEnvironment;
  readonly status: RefundStatus;
  readonly amount: Money;
  readonly reason: string | null;
  readonly providerRefundId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type CreatePaymentAttemptInput = {
  readonly id?: string;
  readonly orderId: string;
  readonly provider: FinancePaymentProvider;
  readonly environment: PaymentProviderEnvironment;
  readonly status?: PaymentAttemptStatus;
  readonly amount: Money;
  readonly providerPaymentId: string | null;
  readonly providerCheckoutId: string | null;
  readonly idempotencyKey: string;
  readonly metadata: Record<string, unknown>;
  readonly now: string;
};

export type MarkPaymentAttemptCheckoutOpenedInput = {
  readonly paymentAttemptId: string;
  readonly providerCheckoutId: string;
  readonly checkoutUrl: string;
  readonly now: string;
};

export type LinkPaymentAttemptToProviderPaymentInput = {
  readonly paymentAttemptId: string;
  readonly provider: FinancePaymentProvider;
  readonly environment: PaymentProviderEnvironment;
  readonly providerPaymentId: string;
  readonly now: string;
};

export type RecordPaymentProviderEventInput = {
  readonly id?: string;
  readonly paymentAttemptId: string | null;
  readonly provider: FinancePaymentProvider;
  readonly environment: PaymentProviderEnvironment;
  readonly providerWebhookId: string;
  readonly providerPaymentId: string | null;
  readonly type: PaymentProviderEventType;
  readonly occurredAt: string;
  readonly receivedAt: string;
  readonly payload: Record<string, unknown>;
};

export type CreateRefundInput = {
  readonly id?: string;
  readonly orderId: string;
  readonly paymentAttemptId: string;
  readonly providerEventId: string | null;
  readonly provider?: FinancePaymentProvider;
  readonly environment?: PaymentProviderEnvironment;
  readonly status?: RefundStatus;
  readonly amount: Money;
  readonly reason: string | null;
  readonly providerRefundId: string | null;
  readonly now: string;
};

export class FinanceProviderContextMismatchError extends Error {
  readonly code = "finance_provider_context_mismatch";

  constructor() {
    super("Finance provider context does not match the linked payment attempt");
    this.name = "FinanceProviderContextMismatchError";
  }
}

export class FinanceProviderPaymentMismatchError extends Error {
  readonly code = "finance_provider_payment_mismatch";

  constructor() {
    super("Finance provider payment id does not match the linked payment attempt");
    this.name = "FinanceProviderPaymentMismatchError";
  }
}

export type PaymentStore = {
  readonly executeCreateCheckout: (
    command: FinanceIdempotentCommand,
    createInput: () => Promise<CreatePaymentAttemptInput>
  ) => Promise<FinanceIdempotentCommandResult<PaymentAttempt>>;
  readonly createAttempt: (input: CreatePaymentAttemptInput) => Promise<PaymentAttempt>;
  readonly markAttemptCheckoutOpened: (
    input: MarkPaymentAttemptCheckoutOpenedInput
  ) => Promise<PaymentAttempt | null>;
  readonly linkAttemptToProviderPayment: (
    input: LinkPaymentAttemptToProviderPaymentInput
  ) => Promise<PaymentAttempt | null>;
  readonly recordProviderEvent: (
    input: RecordPaymentProviderEventInput
  ) => Promise<{ readonly kind: "created" | "replayed"; readonly event: PaymentProviderEvent }>;
  readonly findProviderEventByWebhookId: (input: {
    readonly provider: FinancePaymentProvider;
    readonly environment: PaymentProviderEnvironment;
    readonly providerWebhookId: string;
  }) => Promise<PaymentProviderEvent | null>;
  readonly createRefund: (
    input: CreateRefundInput
  ) => Promise<{ readonly kind: "created" | "replayed"; readonly refund: RefundRecord }>;
  readonly findAttemptById: (paymentAttemptId: string) => Promise<PaymentAttempt | null>;
  readonly findAttemptByProviderPaymentId: (input: {
    readonly provider: FinancePaymentProvider;
    readonly environment: PaymentProviderEnvironment;
    readonly providerPaymentId: string;
  }) => Promise<PaymentAttempt | null>;
};
