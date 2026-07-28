import type {
  FinancePaymentProvider,
  PaymentAttempt,
  PaymentProviderEnvironment
} from "../payments";
import type { Money } from "../money";

export type ReconciliationStatus = "pending" | "matched" | "exception" | "ignored";

export type ReconciliationRecord = {
  readonly id: string;
  readonly provider: FinancePaymentProvider;
  readonly environment: PaymentProviderEnvironment;
  readonly providerPaymentId: string | null;
  readonly providerPayoutId: string | null;
  readonly providerSettlementId: string | null;
  readonly providerEventId: string | null;
  readonly status: ReconciliationStatus;
  readonly exceptionCode: string | null;
  readonly exceptionMessage: string | null;
  readonly providerOccurredAt: string | null;
  readonly checkedAt: string;
  readonly resolvedAt: string | null;
  readonly payload: Record<string, unknown>;
};

export type CreateReconciliationRecordInput = {
  readonly provider: FinancePaymentProvider;
  readonly environment: PaymentProviderEnvironment;
  readonly providerPaymentId: string | null;
  readonly providerPayoutId: string | null;
  readonly providerSettlementId: string | null;
  readonly providerEventId: string | null;
  readonly status: ReconciliationStatus;
  readonly exceptionCode: string | null;
  readonly exceptionMessage: string | null;
  readonly providerOccurredAt: string | null;
  readonly checkedAt: string;
  readonly payload: Record<string, unknown>;
};

export type ReconciliationExceptionResolution = "resolved" | "waived";

export type ReconciliationExceptionEvidenceFilter =
  | "all"
  | "payment"
  | "payout"
  | "settlement"
  | "provider_event";

export type ProviderSettlementLedgerEntry = {
  readonly provider: FinancePaymentProvider;
  readonly environment: PaymentProviderEnvironment;
  readonly providerLedgerEntryId: string;
  readonly providerPaymentId: string | null;
  readonly amount: Money;
  readonly direction: string;
  readonly referenceType: string;
  readonly providerOccurredAt: string | null;
  readonly settlementStatus: string | null;
  readonly raw: Record<string, unknown>;
};

export type ReconciliationStore = {
  readonly findAttemptById: (paymentAttemptId: string) => Promise<PaymentAttempt | null>;
  readonly findAttemptByProviderPaymentId: (input: {
    readonly provider: FinancePaymentProvider;
    readonly environment: PaymentProviderEnvironment;
    readonly providerPaymentId: string;
  }) => Promise<PaymentAttempt | null>;
  readonly createRecord: (
    input: CreateReconciliationRecordInput
  ) => Promise<{ readonly kind: "created" | "replayed"; readonly record: ReconciliationRecord }>;
  readonly listOpenExceptions: (input: {
    readonly limit: number;
    readonly provider?: FinancePaymentProvider;
    readonly environment?: PaymentProviderEnvironment;
    readonly evidence?: ReconciliationExceptionEvidenceFilter;
  }) => Promise<readonly ReconciliationRecord[]>;
  readonly resolveException: (input: {
    readonly reconciliationRecordId: string;
    readonly resolution: ReconciliationExceptionResolution;
    readonly resolvedAt: string;
    readonly adminNote: string;
  }) => Promise<ReconciliationRecord | null>;
};
