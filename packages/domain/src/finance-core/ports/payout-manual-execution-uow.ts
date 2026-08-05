import type { ResolvedFinanceOperationEnvelope } from "./finance-port-types";
import type { PayoutApprovalCommitReceiptRef } from "./payout-review-approval-uow";
import type {
  VerifiedPayoutDestinationSnapshot,
  VerifiedPayoutExecutionEvidence
} from "./trusted-finance-evidence";

declare const payoutManualExecutionCommitReceiptBrand: unique symbol;

export type StartManualPayoutExecutionCommand = Readonly<{
  payoutRequestId: string;
  expectedPayoutVersion: number;
  bankExposureId: string;
  expectedBankExposureVersion: number;
  approval: PayoutApprovalCommitReceiptRef;
  destination: VerifiedPayoutDestinationSnapshot;
  executionEvidence: VerifiedPayoutExecutionEvidence;
  operationEnvelope: ResolvedFinanceOperationEnvelope;
}>;

export type PayoutManualExecutionCommitReceipt = Readonly<{
  kind: "payout_manual_execution_commit_receipt";
  payoutRequestId: string;
  payoutVersion: number;
  state: "processing_manual";
  bankExposureId: string;
  bankExposureVersion: number;
  bankExposureState: "initiated_unreflected";
  journalTransactionId: null;
  persistenceTransactionBoundaryRef: string;
  committedAt: string;
  [payoutManualExecutionCommitReceiptBrand]: true;
}>;

export type PayoutManualExecutionUnitOfWork = Readonly<{
  /**
   * Locks request, exact payout-method version, active approval and exposure; rejects a changed,
   * replaced or revoked destination and any evidence not bound to that same approval snapshot.
   */
  startManualPayoutExecution(
    command: StartManualPayoutExecutionCommand
  ): Promise<PayoutManualExecutionCommitReceipt>;
}>;
