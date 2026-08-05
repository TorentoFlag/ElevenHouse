import type { Money } from "../money";
import type { SealedPayoutDestinationSnapshot } from "../finance-core/finance-payout-destination-vault";

export type PayoutRequestStatus =
  | "requested"
  | "under_review"
  | "approved"
  | "processing_manual"
  | "paid"
  | "failed"
  | "rejected"
  | "cancelled";

export type PayoutMethod = "manual_bank_transfer";

/**
 * Untrusted transport reference to a proof artifact. The persistence adapter proves that it is
 * an active KMS/private `bank_transfer_evidence` artifact before a payout can become paid.
 */
export type PayoutPaidProofArtifact = Readonly<{
  artifactId: string;
  sha256Digest: string;
  byteLength: number;
}>;

export type PayoutMethodRecord = {
  readonly id: string;
  readonly astrologerUserId: string;
  readonly method: PayoutMethod;
  readonly currency: Money["currency"];
  readonly displayName: string;
  /** Immutable KMS-backed recipient snapshot. Never contains plaintext bank details. */
  readonly destination: SealedPayoutDestinationSnapshot;
  readonly isDefault: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type PayoutRequestRecord = {
  readonly id: string;
  readonly astrologerUserId: string;
  readonly payoutMethodId: string;
  readonly payoutMethodVersion: number;
  readonly destination: SealedPayoutDestinationSnapshot;
  readonly status: PayoutRequestStatus;
  readonly amount: Money;
  readonly method: PayoutMethod;
  readonly requestedAt: string;
  readonly reviewedAt: string | null;
  readonly completedAt: string | null;
  readonly adminUserId: string | null;
  readonly adminNote: string | null;
  readonly failureReason: string | null;
  readonly externalReference: string | null;
  readonly transferredAt: string | null;
  /** Exact immutable private proof used for the paid transition; never returned to astrologers. */
  readonly paidProofArtifact: PayoutPaidProofArtifact | null;
  /** Monotonic optimistic-lock revision of this payout request. */
  readonly version: number;
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
  readonly destination: SealedPayoutDestinationSnapshot;
  readonly isDefault: boolean;
  readonly now: string;
};

export type CreatePayoutRequestInput = {
  readonly id?: string;
  readonly astrologerUserId: string;
  readonly payoutMethodId: string;
  readonly payoutMethodVersion: number;
  readonly destination: SealedPayoutDestinationSnapshot;
  readonly amount: Money;
  readonly metadata: Record<string, unknown>;
  readonly now: string;
};

export type UpdatePayoutRequestStatusInput = {
  readonly payoutRequestId: string;
  /** Version observed by the administrator when deciding this transition. */
  readonly expectedVersion: number;
  readonly status: PayoutRequestStatus;
  readonly adminUserId: string | null;
  readonly adminNote?: string | null;
  readonly failureReason?: string | null;
  readonly externalReference?: string | null;
  readonly transferredAt?: string | null;
  readonly proofArtifact?: PayoutPaidProofArtifact | null;
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
