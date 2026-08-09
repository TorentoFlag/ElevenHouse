import type { Money } from "../money";
import type {
  FinancePaymentProvider,
  PaymentAttemptStatus
} from "./payment-store";
import type { WalletBalance } from "../wallet";

export type AdminPaymentReversalCaseType = "refund" | "chargeback";
export type AdminPaymentReversalCaseSeverity = "info" | "attention" | "critical";
export type AdminPaymentReversalCaseReviewResolution =
  | "ledger_verified"
  | "provider_follow_up_required"
  | "evidence_sent";

export type AdminPaymentReversalCaseReview = {
  readonly resolution: AdminPaymentReversalCaseReviewResolution;
  readonly adminNote: string;
  readonly reviewedByUserId: string | null;
  readonly reviewedAt: string;
};

export type AdminPaymentReversalCaseRecord = {
  readonly id: string;
  readonly type: AdminPaymentReversalCaseType;
  readonly severity: AdminPaymentReversalCaseSeverity;
  readonly provider: FinancePaymentProvider;
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
  readonly review: AdminPaymentReversalCaseReview | null;
  readonly walletBalance: WalletBalance | null;
  readonly occurredAt: string;
  readonly receivedAt: string;
};

export type AdminPaymentReversalCaseListInput = {
  readonly types?: readonly AdminPaymentReversalCaseType[];
  readonly reviewStatus?: "open" | "reviewed" | "all";
  readonly limit: number;
};

export type RecordAdminPaymentReversalCaseReviewInput = {
  readonly caseId: string;
  readonly resolution: AdminPaymentReversalCaseReviewResolution;
  readonly adminUserId: string;
  readonly adminNote: string;
  readonly reviewedAt: string;
};

export type AdminPaymentReversalCaseStore = {
  readonly findCaseById: (caseId: string) => Promise<AdminPaymentReversalCaseRecord | null>;
  readonly listCases: (
    input: AdminPaymentReversalCaseListInput
  ) => Promise<readonly AdminPaymentReversalCaseRecord[]>;
  readonly recordReview: (
    input: RecordAdminPaymentReversalCaseReviewInput
  ) => Promise<AdminPaymentReversalCaseRecord | null>;
};
