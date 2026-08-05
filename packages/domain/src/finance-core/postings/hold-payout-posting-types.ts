import type { FinanceAuthorizationPayloadHash } from "../../finance-authorization/canonical-command-payload";
import type { FinanceTransactionAuthorizationProof } from "../../finance-authorization/finance-authorization-boundary";
import type { Money } from "../../money";
import type { FinanceSourceKey } from "../finance-source-key";
import type {
  PayoutNoTransferOutcomeAuthority,
  PayoutPaidAuthority,
  PayoutReturnAuthority,
  PayableLotHistoryRecord
} from "../source-lot-types";
import type { BankStatementEntryEvidence } from "./bank-statement-evidence";
import type { UnverifiedBankSuspenseReclassificationBinding } from "./bank-suspense-reclassification-types";
import type {
  PayoutBeneficiarySnapshotBinding,
  UnverifiedPayoutBankExposureTransitionBinding,
  UnverifiedPayoutOutboundClearingCoverageBinding
} from "./payout-bank-exposure-types";
import type { FinancePostingAuthorityRef, FinancePostingEvidenceRef } from "./posting-types";

export type UnverifiedPayableLotPostingAuthorityBinding = Readonly<{
  kind: "unverified_payable_lot_posting_authority_binding";
  schemaVersion: 1;
  bindingId: string;
  version: number;
  authorizationStatus: "unverified";
  atomicityStatus: "unverified";
  digestPurpose: "drift_detection_only";
  operationReceiptId: string;
  operationReceiptDigest: FinanceAuthorizationPayloadHash;
  operationKind: PayableLotHistoryRecord["kind"];
  sourceKey: FinanceSourceKey;
  authorityRefsDigest: FinanceAuthorizationPayloadHash;
  issuedAt: string;
  bindingDigest: FinanceAuthorizationPayloadHash;
}>;

export type PayoutPostingStatus =
  | "requested"
  | "under_review"
  | "approved"
  | "processing_manual"
  | "paid"
  | "failed"
  | "rejected"
  | "cancelled";

export type PayoutStateTransitionBinding = Readonly<{
  expectedVersion: string;
  from: PayoutPostingStatus;
  nextVersion: string;
  to: PayoutPostingStatus;
}>;

export type UnverifiedPayoutBankLiquidityDecisionBinding = Readonly<{
  kind: "unverified_payout_bank_liquidity_decision_binding";
  schemaVersion: 1;
  bindingId: string;
  authorizationStatus: "unverified";
  atomicityStatus: "unverified";
  digestPurpose: "drift_detection_only";
  decisionId: string;
  decisionVersion: string;
  payoutRequestId: string;
  bankCashPoolId: string;
  amount: Money;
  balanceBasis: "unrestricted_available";
  snapshotId: string;
  snapshotVersion: string;
  snapshotDigest: FinanceAuthorizationPayloadHash;
  sourceCheckpointId: string;
  expectedLiquidityRevision: string;
  nextLiquidityRevision: string;
  decision: "sufficient";
  decidedAt: string;
  bindingDigest: FinanceAuthorizationPayloadHash;
}>;

export type PayoutBridgeClosurePostingRef = Readonly<{
  bridgeAllocationId: string;
  operationReceiptId: string;
  operationReceiptDigest: FinanceAuthorizationPayloadHash;
  journalTransactionId: string;
  journalTransactionDigest: FinanceAuthorizationPayloadHash;
  amount: Money;
  payoutOutcomeAuthorityRef: FinancePostingAuthorityRef;
}>;

export type PayoutApprovalNoPostingAuthority = Readonly<{
  kind: "payout_approval_no_posting";
  authorityId: string;
  version: number;
  payoutRequestId: string;
  astrologerUserId: string;
  amount: Money;
  beneficiarySnapshot: PayoutBeneficiarySnapshotBinding;
  bankCashPoolId: string;
  payoutState: PayoutStateTransitionBinding;
  requestReceiptBinding: UnverifiedPayableLotPostingAuthorityBinding;
  liquidityDecision: UnverifiedPayoutBankLiquidityDecisionBinding;
  exposureTransition: UnverifiedPayoutBankExposureTransitionBinding;
  authorizationProof: FinanceTransactionAuthorizationProof;
  approvedAt: string;
}>;

export type PayoutBankWorkInitiatedNoPostingAuthority = Readonly<{
  kind: "payout_bank_work_initiated_no_posting";
  authorityId: string;
  version: number;
  payoutRequestId: string;
  amount: Money;
  beneficiarySnapshot: PayoutBeneficiarySnapshotBinding;
  bankCashPoolId: string;
  payoutState: PayoutStateTransitionBinding;
  exposureTransition: UnverifiedPayoutBankExposureTransitionBinding;
  authorizationProof: FinanceTransactionAuthorizationProof;
  initiatedAt: string;
}>;

export type PayoutNoTransferReleasePostingAuthority = Readonly<{
  kind: "payout_no_transfer_release_posting";
  sourceAuthority: PayoutNoTransferOutcomeAuthority;
  receiptBinding: UnverifiedPayableLotPostingAuthorityBinding;
  payoutState: PayoutStateTransitionBinding;
  exposureTransition: UnverifiedPayoutBankExposureTransitionBinding | null;
  bridgeClosures: readonly PayoutBridgeClosurePostingRef[];
}>;

export type PayoutPaidPostingAuthority = Readonly<{
  kind: "payout_paid_posting";
  sourceAuthority: PayoutPaidAuthority;
  receiptBinding: UnverifiedPayableLotPostingAuthorityBinding;
  payoutState: PayoutStateTransitionBinding;
  exposureTransition: UnverifiedPayoutBankExposureTransitionBinding;
  authorizationProof: FinanceTransactionAuthorizationProof;
}>;

export type PayoutBankDebitDirectMatchAuthority = Readonly<{
  kind: "payout_bank_debit_direct_match";
  authorityId: string;
  version: number;
  operationId: string;
  payoutRequestId: string;
  bankCashPoolId: string;
  amount: Money;
  matchedAt: string;
  priorClearingCoverage: UnverifiedPayoutOutboundClearingCoverageBinding;
  exposureTransition: UnverifiedPayoutBankExposureTransitionBinding;
  evidence: BankStatementEntryEvidence;
  matchAuthorityRef: FinancePostingAuthorityRef;
}>;

type PayoutReturnPostingAuthorityBase = Readonly<{
  sourceAuthority: PayoutReturnAuthority;
  receiptBinding: UnverifiedPayableLotPostingAuthorityBinding;
  exposureTransition: UnverifiedPayoutBankExposureTransitionBinding;
  priorClearingCoverage: UnverifiedPayoutOutboundClearingCoverageBinding;
}>;

export type PayoutReturnWithoutDebitPostingAuthority = PayoutReturnPostingAuthorityBase &
  Readonly<{
    kind: "payout_return_without_debit_posting";
    noDebitEvidenceRef: FinancePostingEvidenceRef;
  }>;

export type PayoutReturnDirectCreditPostingAuthority = PayoutReturnPostingAuthorityBase &
  Readonly<{
    kind: "payout_return_direct_credit_posting";
    evidence: BankStatementEntryEvidence;
  }>;

export type PayoutReturnSuspenseReclassificationPostingAuthority =
  PayoutReturnPostingAuthorityBase &
    Readonly<{
      kind: "payout_return_suspense_reclassification_posting";
      reclassificationBinding: UnverifiedBankSuspenseReclassificationBinding;
    }>;

export type PayoutPostingContradictionReason =
  | "paid_after_definitive_no_transfer"
  | "bank_debit_after_definitive_no_debit";
