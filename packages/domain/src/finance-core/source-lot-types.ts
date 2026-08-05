import type { Money } from "../money";
import type { PaidProductFulfillmentDecision } from "../products/paid-product-fulfillment-registry";
import type { ChargebackPrincipalConfirmedBasis } from "./chargeback-principal-confirmed-basis";
import type { EconomicPaymentIntent } from "./economic-payment";
import type { FinanceSourceKey } from "./finance-source-key";
import type { OrderEconomicsSnapshot } from "./order-economics";
import type { ProviderAccountIdentityBinding } from "./provider-account-binding";
import type { RiskPolicySnapshot } from "./risk-policy";

export type { ChargebackPrincipalConfirmedBasis } from "./chargeback-principal-confirmed-basis";

export const payableLotBucketValues = Object.freeze([
  "pending",
  "available",
  "reserved",
  "payout_pending",
  "refund_pending"
] as const);

export type PayableLotBucket = (typeof payableLotBucketValues)[number];
export type PayableLotStatus = "active" | "consumed";

export type PayableLotCaptureSource = Readonly<{
  intentId: string;
  providerAccountId: string;
  providerPaymentId: string;
  canonicalEvidenceId: string;
  paymentIntent: EconomicPaymentIntent;
  sourceKey: Readonly<{
    kind: "order";
    sourceId: string;
    operation: "sale_captured";
  }>;
}>;

export type SupportedFulfillmentSnapshot = Extract<
  PaidProductFulfillmentDecision,
  { supported: true }
>;

export type PayableSourceLot = Readonly<{
  lotId: string;
  rootLotId: string;
  parentLotId: string | null;
  lineageDepth: number;
  sourceId: string;
  astrologerUserId: string;
  amount: Money;
  bucket: PayableLotBucket;
  status: PayableLotStatus;
  capturedAt: string;
  createdAt: string;
  becameAvailableAt: string | null;
  createdByOperationId: string;
  consumedByOperationId: string | null;
  consumedAt: string | null;
  payoutRequestId: string | null;
  payoutAllocationId: string | null;
  refundId: string | null;
  economics: OrderEconomicsSnapshot;
  riskPolicy: RiskPolicySnapshot;
  fulfillment: SupportedFulfillmentSnapshot;
  captureSource: PayableLotCaptureSource;
}>;

export type ReserveAllocationDecision = Readonly<{
  decisionId: string;
  version: number;
  authority: Readonly<{
    kind: "reserve_allocation";
    id: string;
    version: number;
  }>;
  orderId: string;
  astrologerUserId: string;
  riskPolicyId: string;
  riskPolicyVersion: number;
  reserveBps: number;
  payable: Money;
  available: Money;
  reserved: Money;
}>;

export type PaymentCaptureIntegrityAuthority = Readonly<{
  kind: "current_payment_capture_integrity";
  authorityId: string;
  version: number;
  status: "capture_clear" | "over_capture_blocked";
  intentId: string;
  intentVersion: number;
  providerAccountId: string;
  providerPaymentId: string;
  canonicalEvidenceId: string;
  overCaptureIncidentId: string | null;
  evaluatedAt: string;
}>;

export type PayableLotBlockSnapshot = Readonly<{
  kind: "payable_release_blocks";
  snapshotId: string;
  version: number;
  orderId: string;
  astrologerUserId: string;
  providerAccountId: string;
  paymentIntentId: string;
  currency: "RUB";
  evaluatedAt: string;
  refund: boolean;
  chargeback: boolean;
  reconciliation: boolean;
  manualRisk: boolean;
}>;

export type BookingCompletionEvidence = Readonly<{
  bookingId: string;
  orderId: string;
  owner: string;
  status: string;
  contractVersion: number;
  completedAt: string;
  evidenceId: string;
}>;

export type ProviderSettlementMatchedEvidence = Readonly<{
  kind: "provider_settlement_matched";
  providerAccountId: string;
  paymentIntentId: string;
  providerPaymentId: string;
  evidenceId: string;
  matchedAt: string;
}>;

export type HoldReleaseEvidence = Readonly<{
  kind: "hold_release_evidence";
  lotId: string;
  orderId: string;
  evaluatedAt: string;
  bookingCompletion: BookingCompletionEvidence;
  providerSettlement: ProviderSettlementMatchedEvidence | null;
  blocks: PayableLotBlockSnapshot;
}>;

export type ReserveReleaseAuthority = Readonly<{
  kind: "reserve_release";
  authorityId: string;
  version: number;
  holdReleaseOperationId: string;
  reserveDecisionId: string;
  reserveDecisionVersion: number;
}>;

export type PayoutRequestLotAllocation = Readonly<{
  payoutAllocationId: string;
  sourceLotId: string;
  payoutPendingLotId: string;
  amountMinor: number;
}>;

export type PayoutRequestAuthority = Readonly<{
  kind: "payout_request";
  authorityId: string;
  version: number;
  payoutRequestId: string;
  astrologerUserId: string;
  amount: Money;
  allocations: readonly PayoutRequestLotAllocation[];
}>;

export type PayoutNoTransferOutcomeAuthority = Readonly<{
  kind: "payout_no_transfer_outcome";
  authorityId: string;
  version: number;
  payoutRequestId: string;
  outcome: "rejected" | "cancelled" | "failed_pre_transfer";
  bankInitiation: "not_started" | "started";
  bankDebit: "not_possible";
  evidenceId: string;
  decidedAt: string;
}>;

export type PayoutPaidAuthority = Readonly<{
  kind: "payout_paid";
  authorityId: string;
  version: number;
  payoutRequestId: string;
  bankReference: string;
  transferredAt: string;
  evidenceRef: string;
  evidenceHash: string;
}>;

export type PayoutReturnAuthority = Readonly<{
  kind: "payout_return";
  authorityId: string;
  version: number;
  payoutRequestId: string;
  outcome: "returned_without_debit" | "returned_after_matched_debit";
  bankReference: string;
  bankStatementEntryId: string | null;
  bankCreditEvidencePath: "direct_match" | "unknown_credit_reclassification" | null;
  suspenseReclassificationId: string | null;
  returnedAt: string;
  evidenceId: string;
}>;

export type RefundApprovalAuthority = Readonly<{
  kind: "refund_approval";
  authorityId: string;
  version: number;
  refundId: string;
  orderId: string;
  astrologerUserId: string;
  payableAmount: Money;
  accountingAllocationId: string;
  accountingAllocationVersion: number;
  fundingStatus: "fully_funded";
}>;

export type RefundConfirmedAuthority = Readonly<{
  kind: "refund_confirmed";
  authorityId: string;
  version: number;
  refundId: string;
  providerAccountId: string;
  providerPaymentId: string;
  providerRefundId: string;
  providerAmountBasis: "incremental";
  providerRefundAmount: Money;
  priorProviderTotalRefunded: Money;
  nextProviderTotalRefunded: Money;
  payableAmount: Money;
  accountingAllocationId: string;
  accountingAllocationVersion: number;
  canonicalEvidenceId: string;
  confirmedAt: string;
}>;

export type RefundFailedAuthority = Readonly<{
  kind: "refund_failed";
  authorityId: string;
  version: number;
  refundId: string;
  providerAccountId: string;
  providerPaymentId: string;
  providerRefundId: string;
  providerRefundAmount: Money;
  payableAmount: Money;
  accountingAllocationId: string;
  accountingAllocationVersion: number;
  failureCode: string;
  canonicalEvidenceId: string;
  failedAt: string;
}>;

export type RefundBridgePayoutFailedAuthority = Readonly<{
  kind: "refund_bridge_payout_failed";
  authorityId: string;
  version: number;
  refundId: string;
  refundedOrderId: string;
  payoutRequestId: string;
  payoutAllocationId: string;
  amount: Money;
  bridgeAllocationId: string;
  bridgeAllocationVersion: number;
  bridgeStatus: "allocated";
  accountingAllocationId: string;
  accountingAllocationVersion: number;
  confirmedRefundAuthorityId: string;
  confirmedRefundAuthorityVersion: number;
  confirmedRefundEvidenceId: string;
  payoutOutcomeAuthority: PayoutNoTransferOutcomeAuthority;
}>;

export type RefundBridgePayoutPaidAuthority = Readonly<{
  kind: "refund_bridge_payout_paid";
  authorityId: string;
  version: number;
  refundId: string;
  refundedOrderId: string;
  payoutRequestId: string;
  payoutAllocationId: string;
  amount: Money;
  bridgeAllocationId: string;
  bridgeAllocationVersion: number;
  bridgeStatus: "allocated";
  accountingAllocationId: string;
  accountingAllocationVersion: number;
  confirmedRefundAuthorityId: string;
  confirmedRefundAuthorityVersion: number;
  confirmedRefundEvidenceId: string;
  payoutPaidAuthorityId: string;
  payoutPaidAuthorityVersion: number;
  bankReference: string;
  canonicalEvidenceId: string;
  decidedAt: string;
}>;

export type ChargebackConfirmedAuthority = Readonly<{
  kind: "chargeback_confirmed";
  authorityId: string;
  version: number;
  confirmationId: string;
  restrictionId: string;
  confirmationKind: "initial" | "cumulative_update";
  amountBasis: "cumulative";
  priorRestrictionVersion: number | null;
  chargebackCaseId: string;
  orderId: string;
  astrologerUserId: string;
  providerAccount: ProviderAccountIdentityBinding;
  providerPaymentId: string;
  priorCumulativeDisputedAmount: Money;
  nextCumulativeDisputedAmount: Money;
  disputedDelta: Money;
  canonicalEvidenceId: string;
  confirmedAt: string;
}>;

export type ChargebackPrincipalAllocationAuthority = Readonly<{
  kind: "chargeback_principal_allocation";
  authorityId: string;
  version: number;
  chargebackCaseId: string;
  orderId: string;
  astrologerUserId: string;
  payableAmount: Money;
  accountingAllocationId: string;
  accountingAllocationRevisionId: string;
  accountingAllocationVersion: number;
  allocationStatus: "approved";
  confirmedBasis: ChargebackPrincipalConfirmedBasis;
}>;

export type ChargebackRecoveryCollectionSource =
  | Readonly<{
      kind: "future_payable";
      sourceOrderId: string;
    }>
  | Readonly<{
      kind: "returned_payout";
      sourceOrderId: string;
      payoutRequestId: string;
      payoutAllocationId: string;
      payoutReturnAuthorityId: string;
      payoutReturnAuthorityVersion: number;
      payoutReturnEvidenceId: string;
    }>;

export type ChargebackRecoveryCollectionAuthority = Readonly<{
  kind: "chargeback_recovery_collection";
  authorityId: string;
  version: number;
  recoveryCollectionId: string;
  chargebackCaseId: string;
  astrologerUserId: string;
  collectionSource: ChargebackRecoveryCollectionSource;
  collectedPayableAmount: Money;
  accountingAllocationId: string;
  accountingAllocationVersion: number;
  allocationStatus: "approved";
  canonicalEvidenceId: string;
  collectedAt: string;
}>;

export type ChargebackWonAuthority = Readonly<{
  kind: "chargeback_won";
  authorityId: string;
  version: number;
  chargebackCaseId: string;
  restoredPayableAmount: Money;
  suspenseClearedAmount: Money;
  accountingAllocationId: string;
  accountingAllocationVersion: number;
  allocationStatus: "approved";
  canonicalEvidenceId: string;
  wonAt: string;
}>;

export type ChargebackLostAuthority = Readonly<{
  kind: "chargeback_lost";
  authorityId: string;
  version: number;
  chargebackCaseId: string;
  unallocatedSuspense: Money;
  accountingAllocationId: string;
  accountingAllocationVersion: number;
  allocationStatus: "approved";
  canonicalEvidenceId: string;
  lostAt: string;
}>;

export type ChargebackRestriction = Readonly<{
  restrictionId: string;
  version: number;
  chargebackCaseId: string;
  orderId: string;
  astrologerUserId: string;
  providerAccountId: string;
  providerPaymentId: string;
  disputedAmount: Money;
  canonicalEvidenceId: string;
  status: "active" | "allocation_blocked" | "closed_won" | "closed_lost";
  confirmedAt: string;
  closedAt: string | null;
}>;

export type ChargebackRestrictionOperationKey = Readonly<{
  kind: "chargeback_restriction";
  restrictionId: string;
  operation: "lost_final" | "lost_allocation_closed";
}>;

export type ChargebackRestrictionHistoryRecord = Readonly<{
  kind: "chargeback_lost_closed" | "chargeback_lost_blocked" | "chargeback_lost_allocation_closed";
  operationId: string;
  operationKey: ChargebackRestrictionOperationKey;
  previousVersion: number;
  nextVersion: number;
  occurredAt: string;
  authority: ChargebackLostAuthority;
}>;

export type ChargebackRestrictionStateTransition = Readonly<{
  kind: ChargebackRestrictionHistoryRecord["kind"];
  operationId: string;
  operationKey: ChargebackRestrictionOperationKey;
  previousVersion: number;
  nextVersion: number;
  previousStateDigest: string;
  nextStateDigest: string;
  record: ChargebackRestrictionHistoryRecord;
  state: PayableLotReferenceState;
}>;

export type RefundBridgePayoutPaidNoLotDecision = Readonly<{
  kind: "no_lot_transition";
  stateVersion: number;
  stateDigest: string;
  sourceKey: FinanceSourceKey;
  authority: RefundBridgePayoutPaidAuthority;
}>;

export type RefundLotOrigin = Readonly<{
  refundPendingLotId: string;
  sourceLotId: string;
  rootLotId: string;
  originalBucket: "pending" | "available" | "reserved";
  amountMinor: number;
  becameAvailableAt: string | null;
}>;

export type ChargebackLotAllocation = Readonly<{
  sourceLotId: string;
  rootLotId: string;
  originalBucket: "pending" | "available" | "reserved";
  allocatedAmountMinor: number;
  remainderLotId: string | null;
}>;

export type PayableLotOperationAuthority =
  | ReserveReleaseAuthority
  | PayoutRequestAuthority
  | PayoutNoTransferOutcomeAuthority
  | PayoutPaidAuthority
  | PayoutReturnAuthority
  | RefundApprovalAuthority
  | RefundConfirmedAuthority
  | RefundFailedAuthority
  | RefundBridgePayoutFailedAuthority
  | ChargebackConfirmedAuthority
  | ChargebackPrincipalAllocationAuthority
  | ChargebackRecoveryCollectionAuthority
  | ChargebackWonAuthority
  | ChargebackLostAuthority;

export type PayableLotHistoryRecord = Readonly<{
  kind:
    | "sale_capture"
    | "hold_release"
    | "reserve_release"
    | "payout_requested"
    | "payout_released"
    | "payout_paid"
    | "payout_returned_reserved"
    | "refund_approved"
    | "refund_confirmed"
    | "refund_failed"
    | "refund_bridge_payout_failed"
    | "chargeback_confirmed"
    | "chargeback_principal_allocated"
    | "chargeback_recovery_collected"
    | "chargeback_won_reserved";
  operationId: string;
  sourceKey: FinanceSourceKey;
  previousVersion: number;
  nextVersion: number;
  occurredAt: string;
  consumedLotIds: readonly string[];
  createdLotIds: readonly string[];
  referencedLotIds: readonly string[];
  refundOrigins: readonly RefundLotOrigin[];
  chargebackAllocations: readonly ChargebackLotAllocation[];
  reserveAllocation: ReserveAllocationDecision | null;
  paymentIntegrity: PaymentCaptureIntegrityAuthority | null;
  blocks: PayableLotBlockSnapshot | null;
  holdReleaseEvidence: HoldReleaseEvidence | null;
  authority: PayableLotOperationAuthority | null;
}>;

/**
 * Deterministic full-history rebuild oracle for source-lot verification.
 *
 * This object is intentionally not an online wallet mutation aggregate. Online
 * mutation must consume a validated operation receipt under the wallet lock;
 * this reference state exists to rebuild and audit the resulting source-lot
 * history.
 */
export type PayableLotReferenceState = Readonly<{
  version: number;
  astrologerUserId: string;
  currency: "RUB";
  lots: readonly PayableSourceLot[];
  history: readonly PayableLotHistoryRecord[];
  chargebackRestrictions: readonly ChargebackRestriction[];
  restrictionHistory: readonly ChargebackRestrictionHistoryRecord[];
  stateDigest: string;
}>;

/** @deprecated Reference/rebuild oracle; forbidden for online mutation. */
export type PayableLotState = PayableLotReferenceState;

export type PayableLotReferenceStateTransition = Readonly<{
  kind: PayableLotHistoryRecord["kind"];
  operationId: string;
  sourceKey: FinanceSourceKey;
  previousVersion: number;
  nextVersion: number;
  previousStateDigest: string;
  nextStateDigest: string;
  consumedLots: readonly PayableSourceLot[];
  createdLots: readonly PayableSourceLot[];
  historyRecord: PayableLotHistoryRecord;
  state: PayableLotReferenceState;
}>;

/** @deprecated Reference/rebuild oracle; forbidden for online mutation. */
export type PayableLotStateTransition = PayableLotReferenceStateTransition;

export type PayableLotAllocation = Readonly<{
  lotId: string;
  rootLotId: string;
  sourceId: string;
  bucket: PayableLotBucket;
  amountMinor: number;
  becameAvailableAt: string | null;
}>;

export type PayableLotSelection = Readonly<{
  kind: "payout" | "refund";
  stateVersion: number;
  stateDigest: string;
  astrologerUserId: string;
  currency: "RUB";
  orderId: string | null;
  totalAmountMinor: number;
  allocations: readonly PayableLotAllocation[];
}>;

export type PayableLotTransition = Readonly<{
  operationId: string;
  consumedLots: readonly PayableSourceLot[];
  createdLots: readonly PayableSourceLot[];
}>;

export type PayableLotBucketProjection = Readonly<{
  pendingMinor: string;
  availableMinor: string;
  reservedMinor: string;
  payoutPendingMinor: string;
  refundPendingMinor: string;
}>;

export const payoutExecutionExternalGateValues = Object.freeze([
  "wallet_recovery_receivable",
  "bank_liquidity",
  "payout_method",
  "kyc",
  "risk"
] as const);

export type PayoutExecutionExternalGate = (typeof payoutExecutionExternalGateValues)[number];

export type PayableLotPayoutExecutionPrerequisite = Readonly<{
  kind: "source_lot_payout_execution_prerequisite";
  status: "source_lot_clear" | "blocked";
  stateVersion: number;
  stateDigest: string;
  astrologerUserId: string;
  currency: "RUB";
  blockingChargebackCaseIds: readonly string[];
  blockingRefundIds: readonly string[];
  remainingExternalGates: readonly PayoutExecutionExternalGate[];
}>;

export type PayableSourceLotIntegrityReason =
  | "invalid_shape"
  | "invalid_field"
  | "duplicate_lot_id"
  | "duplicate_capture_source"
  | "capture_correlation_mismatch"
  | "authoritative_capture_required"
  | "owner_currency_mismatch"
  | "lot_already_consumed"
  | "lot_bucket_ineligible"
  | "insufficient_lot_funds"
  | "selection_mismatch"
  | "lineage_invalid"
  | "conservation_violation"
  | "reserve_allocation_required"
  | "reserve_allocation_invalid"
  | "fulfillment_evidence_required"
  | "hold_not_elapsed"
  | "settlement_evidence_required"
  | "release_blocked"
  | "version_conflict"
  | "state_digest_mismatch"
  | "duplicate_operation_source";

export class PayableSourceLotIntegrityError extends Error {
  readonly code = "payable_source_lot_integrity_violation";

  constructor(readonly reason: PayableSourceLotIntegrityReason) {
    super("Payable source lot integrity check failed");
    this.name = "PayableSourceLotIntegrityError";
  }
}
