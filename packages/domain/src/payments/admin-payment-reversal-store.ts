import type { Money } from "../money";
import type {
  FinancePaymentProvider,
  PaymentAttemptStatus,
  PaymentProviderEnvironment
} from "./payment-store";
import type { WalletBalance } from "../wallet";

export type AdminPaymentReversalCaseType = "refund" | "chargeback";
export type AdminPaymentReversalCaseSeverity = "info" | "attention" | "critical";

export type AdminPaymentReversalCaseRecord = {
  readonly id: string;
  readonly type: AdminPaymentReversalCaseType;
  readonly severity: AdminPaymentReversalCaseSeverity;
  readonly provider: FinancePaymentProvider;
  readonly environment: PaymentProviderEnvironment;
  readonly providerWebhookId: string;
  readonly providerPaymentId: string | null;
  readonly providerRefundId: string | null;
  readonly paymentAttemptId: string;
  readonly orderId: string;
  readonly clientUserId: string;
  readonly astrologerUserId: string;
  readonly orderStatus: "partially_refunded" | "refunded" | "chargeback";
  readonly paymentAttemptStatus: PaymentAttemptStatus;
  readonly amount: Money;
  readonly refundStatus: "requested" | "processing" | "succeeded" | "failed" | null;
  readonly ledgerOperationType: "refund_recorded" | "chargeback_recorded" | null;
  readonly ledgerTransactionId: string | null;
  readonly walletBalance: WalletBalance | null;
  readonly occurredAt: string;
  readonly receivedAt: string;
};

export type AdminPaymentReversalCaseListInput = {
  readonly types?: readonly AdminPaymentReversalCaseType[];
  readonly limit: number;
};

export type AdminPaymentReversalCaseStore = {
  readonly listCases: (
    input: AdminPaymentReversalCaseListInput
  ) => Promise<readonly AdminPaymentReversalCaseRecord[]>;
};
