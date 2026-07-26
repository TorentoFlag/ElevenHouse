import type { FinancePaymentProvider, PaymentProviderEnvironment } from "../payments/payment-store";
import type { Money } from "../money";

export type PayoutRequestStatus =
  | "requested"
  | "under_review"
  | "approved"
  | "processing_manual"
  | "processing_provider"
  | "paid"
  | "failed"
  | "rejected"
  | "cancelled";

export type PayoutMethod = "manual_bank_transfer" | "arc_pay_provider";

export type PayoutMethodRecord = {
  readonly id: string;
  readonly astrologerUserId: string;
  readonly method: PayoutMethod;
  readonly currency: Money["currency"];
  readonly displayName: string;
  readonly manualBankTransferDetails: Record<string, unknown> | null;
  readonly provider: FinancePaymentProvider | null;
  readonly environment: PaymentProviderEnvironment | null;
  readonly providerPayoutAccountId: string | null;
  readonly isDefault: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type PayoutRequestRecord = {
  readonly id: string;
  readonly astrologerUserId: string;
  readonly payoutMethodId: string;
  readonly status: PayoutRequestStatus;
  readonly amount: Money;
  readonly method: PayoutMethod;
  readonly provider: FinancePaymentProvider | null;
  readonly environment: PaymentProviderEnvironment | null;
  readonly requestedAt: string;
  readonly reviewedAt: string | null;
  readonly completedAt: string | null;
  readonly adminUserId: string | null;
  readonly adminNote: string | null;
  readonly failureReason: string | null;
  readonly externalReference: string | null;
  readonly transferredAt: string | null;
  readonly providerPayoutId: string | null;
  readonly metadata: Record<string, unknown>;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type CreatePayoutMethodInput = {
  readonly id?: string;
  readonly astrologerUserId: string;
  readonly method: PayoutMethod;
  readonly currency: Money["currency"];
  readonly displayName: string;
  readonly manualBankTransferDetails: Record<string, unknown> | null;
  readonly provider: FinancePaymentProvider | null;
  readonly environment: PaymentProviderEnvironment | null;
  readonly providerPayoutAccountId: string | null;
  readonly isDefault: boolean;
  readonly now: string;
};

export type CreatePayoutRequestInput = {
  readonly id?: string;
  readonly astrologerUserId: string;
  readonly payoutMethodId: string;
  readonly amount: Money;
  readonly metadata: Record<string, unknown>;
  readonly now: string;
};

export type UpdatePayoutRequestStatusInput = {
  readonly payoutRequestId: string;
  readonly status: PayoutRequestStatus;
  readonly adminUserId: string | null;
  readonly adminNote?: string | null;
  readonly failureReason?: string | null;
  readonly externalReference?: string | null;
  readonly transferredAt?: string | null;
  readonly providerPayoutId?: string | null;
  readonly now: string;
};

export type ListPayoutRequestsInput = {
  readonly astrologerUserId?: string;
  readonly statuses?: readonly PayoutRequestStatus[];
  readonly limit?: number;
};

export class PayoutStatusEvidenceError extends Error {
  readonly code = "payout_status_evidence_invalid";

  constructor(message: string) {
    super(message);
    this.name = "PayoutStatusEvidenceError";
  }
}

export type PayoutStore = {
  readonly createMethod: (input: CreatePayoutMethodInput) => Promise<PayoutMethodRecord>;
  readonly findDefaultMethod: (astrologerUserId: string) => Promise<PayoutMethodRecord | null>;
  readonly createRequest: (input: CreatePayoutRequestInput) => Promise<PayoutRequestRecord>;
  readonly updateRequestStatus: (
    input: UpdatePayoutRequestStatusInput
  ) => Promise<PayoutRequestRecord | null>;
  readonly findRequestById: (payoutRequestId: string) => Promise<PayoutRequestRecord | null>;
  readonly listRequests: (
    input?: ListPayoutRequestsInput
  ) => Promise<readonly PayoutRequestRecord[]>;
};
