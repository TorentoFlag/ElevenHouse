import type { FinanceAuthorizationPayloadHash } from "../../finance-authorization/canonical-command-payload";
import type { Money } from "../../money";
import type { FinancePostingAuthorityRef } from "./posting-types";

export const payoutBankExposureStatusValues = Object.freeze([
  "committed",
  "initiated_unreflected",
  "paid_unreflected",
  "statement_reflected",
  "returned_reflected",
  "released",
  "returned_without_debit"
] as const);

export type PayoutBankExposureStatus = (typeof payoutBankExposureStatusValues)[number];

export const payoutBankExposureTransitionKindValues = Object.freeze([
  "approval_committed",
  "bank_work_initiated",
  "paid_proven",
  "statement_debit_reflected",
  "pre_transfer_released",
  "returned_without_debit",
  "return_credit_reflected"
] as const);

export type PayoutBankExposureTransitionKind =
  (typeof payoutBankExposureTransitionKindValues)[number];

export type PayoutBeneficiarySnapshotBinding = Readonly<{
  snapshotId: string;
  schemaVersion: 1;
  fingerprint: string;
  canonicalDigest: FinanceAuthorizationPayloadHash;
}>;

export function isPayoutBankExposureStatus(value: unknown): value is PayoutBankExposureStatus {
  return payoutBankExposureStatusValues.includes(value as PayoutBankExposureStatus);
}

export function isPayoutBankExposureTransitionKind(
  value: unknown
): value is PayoutBankExposureTransitionKind {
  return payoutBankExposureTransitionKindValues.includes(value as PayoutBankExposureTransitionKind);
}

export function payoutBankExposureTransitionMatches(
  kind: PayoutBankExposureTransitionKind,
  previous: PayoutBankExposureStatus,
  next: PayoutBankExposureStatus
): boolean {
  switch (kind) {
    case "bank_work_initiated":
      return previous === "committed" && next === "initiated_unreflected";
    case "paid_proven":
      return previous === "initiated_unreflected" && next === "paid_unreflected";
    case "statement_debit_reflected":
      return previous === "paid_unreflected" && next === "statement_reflected";
    case "pre_transfer_released":
      return (
        (previous === "committed" || previous === "initiated_unreflected") && next === "released"
      );
    case "returned_without_debit":
      return previous === "paid_unreflected" && next === "returned_without_debit";
    case "return_credit_reflected":
      return previous === "statement_reflected" && next === "returned_reflected";
    case "approval_committed":
      return false;
  }
}

export function samePayoutBeneficiarySnapshot(
  left: PayoutBeneficiarySnapshotBinding,
  right: PayoutBeneficiarySnapshotBinding
): boolean {
  return (
    left.snapshotId === right.snapshotId &&
    left.schemaVersion === right.schemaVersion &&
    left.fingerprint === right.fingerprint &&
    left.canonicalDigest === right.canonicalDigest
  );
}

export type PayoutBankExposureBindingRef = Readonly<{
  bindingId: string;
  exposureVersion: string;
  status: PayoutBankExposureStatus;
  bindingDigest: FinanceAuthorizationPayloadHash;
}>;

/**
 * Consistency-only exposure transition. A self-hash cannot grant authority or
 * prove the payout, liquidity row and exposure changed atomically.
 */
export type UnverifiedPayoutBankExposureTransitionBinding = Readonly<{
  kind: "unverified_payout_bank_exposure_transition_binding";
  schemaVersion: 1;
  bindingId: string;
  authorizationStatus: "unverified";
  atomicityStatus: "unverified";
  digestPurpose: "drift_detection_only";
  bankExposureId: string;
  payoutRequestId: string;
  astrologerUserId: string;
  beneficiarySnapshot: PayoutBeneficiarySnapshotBinding;
  bankCashPoolId: string;
  amount: Money;
  approvedByActorUserId: string;
  transitionKind: PayoutBankExposureTransitionKind;
  previousBindingRef: PayoutBankExposureBindingRef | null;
  exposureVersion: string;
  status: PayoutBankExposureStatus;
  transitionAuthorityRef: FinancePostingAuthorityRef;
  occurredAt: string;
  bindingDigest: FinanceAuthorizationPayloadHash;
}>;

export type PayoutBankExposureTransitionBindingReadInput = Readonly<{
  binding: UnverifiedPayoutBankExposureTransitionBinding;
  previousBinding: UnverifiedPayoutBankExposureTransitionBinding | null;
}>;

export type UnverifiedPayoutOutboundClearingCoverageBinding = Readonly<{
  kind: "unverified_payout_outbound_clearing_coverage_binding";
  schemaVersion: 1;
  bindingId: string;
  authorizationStatus: "unverified";
  atomicityStatus: "unverified";
  digestPurpose: "drift_detection_only";
  bankExposureId: string;
  payoutRequestId: string;
  bankCashPoolId: string;
  amount: Money;
  claimedRemainingAmount: Money;
  claimedConsumptionStatus: "unconsumed";
  paidExposureBindingRef: PayoutBankExposureBindingRef;
  paidOperationReceiptId: string;
  paidOperationReceiptDigest: FinanceAuthorizationPayloadHash;
  paidAuthorityRef: FinancePostingAuthorityRef;
  bankReference: string;
  clearingJournalTransactionId: string;
  clearingJournalTransactionDigest: FinanceAuthorizationPayloadHash;
  issuedAt: string;
  bindingDigest: FinanceAuthorizationPayloadHash;
}>;
