import { payableLotBucketValues } from "./source-lot-types";

export const lotKeys = [
  "lotId",
  "rootLotId",
  "parentLotId",
  "lineageDepth",
  "sourceId",
  "astrologerUserId",
  "amount",
  "bucket",
  "status",
  "capturedAt",
  "createdAt",
  "becameAvailableAt",
  "createdByOperationId",
  "consumedByOperationId",
  "consumedAt",
  "payoutRequestId",
  "payoutAllocationId",
  "refundId",
  "economics",
  "riskPolicy",
  "fulfillment",
  "captureSource"
] as const;
export const captureResultKeys = [
  "kind",
  "authorityStatus",
  "receiptId",
  "intent",
  "effect"
] as const;
export const intentKeys = [
  "intentId",
  "version",
  "purpose",
  "sourceId",
  "providerAccount",
  "amount",
  "state",
  "sessions",
  "capture",
  "captureSessionId"
] as const;
export const captureEffectKeys = [
  "kind",
  "intentId",
  "sourceId",
  "providerAccount",
  "providerPaymentId",
  "amount",
  "canonicalEvidenceId"
] as const;
export const captureSourceKeys = [
  "intentId",
  "providerAccountId",
  "providerPaymentId",
  "canonicalEvidenceId",
  "paymentIntent",
  "sourceKey"
] as const;
export const fulfillmentKeys = [
  "supported",
  "registryKey",
  "registryRevision",
  "holdAnchor",
  "terminalEvidence",
  "cancellationAllocator"
] as const;
export const reserveDecisionKeys = [
  "decisionId",
  "version",
  "authority",
  "orderId",
  "astrologerUserId",
  "riskPolicyId",
  "riskPolicyVersion",
  "reserveBps",
  "payable",
  "available",
  "reserved"
] as const;
export const selectionKeys = [
  "kind",
  "stateVersion",
  "stateDigest",
  "astrologerUserId",
  "currency",
  "orderId",
  "totalAmountMinor",
  "allocations"
] as const;
export const allocationKeys = [
  "lotId",
  "rootLotId",
  "sourceId",
  "bucket",
  "amountMinor",
  "becameAvailableAt"
] as const;
export const paymentIntegrityKeys = [
  "kind",
  "authorityId",
  "version",
  "status",
  "intentId",
  "intentVersion",
  "providerAccountId",
  "providerPaymentId",
  "canonicalEvidenceId",
  "overCaptureIncidentId",
  "evaluatedAt"
] as const;
export const payableLotBlockKeys = [
  "kind",
  "snapshotId",
  "version",
  "orderId",
  "astrologerUserId",
  "providerAccountId",
  "paymentIntentId",
  "currency",
  "evaluatedAt",
  "refund",
  "chargeback",
  "reconciliation",
  "manualRisk"
] as const;
export const reserveReleaseAuthorityKeys = [
  "kind",
  "authorityId",
  "version",
  "holdReleaseOperationId",
  "reserveDecisionId",
  "reserveDecisionVersion"
] as const;
export const payoutRequestAuthorityKeys = [
  "kind",
  "authorityId",
  "version",
  "payoutRequestId",
  "astrologerUserId",
  "amount",
  "allocations"
] as const;
export const payoutNoTransferAuthorityKeys = [
  "kind",
  "authorityId",
  "version",
  "payoutRequestId",
  "outcome",
  "bankInitiation",
  "bankDebit",
  "evidenceId",
  "decidedAt"
] as const;
export const payoutPaidAuthorityKeys = [
  "kind",
  "authorityId",
  "version",
  "payoutRequestId",
  "bankReference",
  "transferredAt",
  "evidenceRef",
  "evidenceHash"
] as const;
export const payoutReturnAuthorityKeys = [
  "kind",
  "authorityId",
  "version",
  "payoutRequestId",
  "outcome",
  "bankReference",
  "bankStatementEntryId",
  "bankCreditEvidencePath",
  "suspenseReclassificationId",
  "returnedAt",
  "evidenceId"
] as const;
export const refundApprovalAuthorityKeys = [
  "kind",
  "authorityId",
  "version",
  "refundId",
  "orderId",
  "astrologerUserId",
  "payableAmount",
  "accountingAllocationId",
  "accountingAllocationVersion",
  "fundingStatus"
] as const;
export const refundConfirmedAuthorityKeys = [
  "kind",
  "authorityId",
  "version",
  "refundId",
  "providerAccountId",
  "providerPaymentId",
  "providerRefundId",
  "providerAmountBasis",
  "providerRefundAmount",
  "priorProviderTotalRefunded",
  "nextProviderTotalRefunded",
  "payableAmount",
  "accountingAllocationId",
  "accountingAllocationVersion",
  "canonicalEvidenceId",
  "confirmedAt"
] as const;
export const refundFailedAuthorityKeys = [
  "kind",
  "authorityId",
  "version",
  "refundId",
  "providerAccountId",
  "providerPaymentId",
  "providerRefundId",
  "providerRefundAmount",
  "payableAmount",
  "accountingAllocationId",
  "accountingAllocationVersion",
  "failureCode",
  "canonicalEvidenceId",
  "failedAt"
] as const;
export const refundBridgePayoutFailedAuthorityKeys = [
  "kind",
  "authorityId",
  "version",
  "refundId",
  "refundedOrderId",
  "payoutRequestId",
  "payoutAllocationId",
  "amount",
  "bridgeAllocationId",
  "bridgeAllocationVersion",
  "bridgeStatus",
  "accountingAllocationId",
  "accountingAllocationVersion",
  "confirmedRefundAuthorityId",
  "confirmedRefundAuthorityVersion",
  "confirmedRefundEvidenceId",
  "payoutOutcomeAuthority"
] as const;
export const refundBridgePayoutPaidAuthorityKeys = [
  "kind",
  "authorityId",
  "version",
  "refundId",
  "refundedOrderId",
  "payoutRequestId",
  "payoutAllocationId",
  "amount",
  "bridgeAllocationId",
  "bridgeAllocationVersion",
  "bridgeStatus",
  "accountingAllocationId",
  "accountingAllocationVersion",
  "confirmedRefundAuthorityId",
  "confirmedRefundAuthorityVersion",
  "confirmedRefundEvidenceId",
  "payoutPaidAuthorityId",
  "payoutPaidAuthorityVersion",
  "bankReference",
  "canonicalEvidenceId",
  "decidedAt"
] as const;
export const chargebackConfirmedAuthorityKeys = [
  "kind",
  "authorityId",
  "version",
  "confirmationId",
  "restrictionId",
  "confirmationKind",
  "amountBasis",
  "priorRestrictionVersion",
  "chargebackCaseId",
  "orderId",
  "astrologerUserId",
  "providerAccount",
  "providerPaymentId",
  "priorCumulativeDisputedAmount",
  "nextCumulativeDisputedAmount",
  "disputedDelta",
  "canonicalEvidenceId",
  "confirmedAt"
] as const;
export const chargebackPrincipalAuthorityKeys = [
  "kind",
  "authorityId",
  "version",
  "chargebackCaseId",
  "orderId",
  "astrologerUserId",
  "payableAmount",
  "accountingAllocationId",
  "accountingAllocationRevisionId",
  "accountingAllocationVersion",
  "allocationStatus",
  "confirmedBasis"
] as const;
export const chargebackRecoveryCollectionAuthorityKeys = [
  "kind",
  "authorityId",
  "version",
  "recoveryCollectionId",
  "chargebackCaseId",
  "astrologerUserId",
  "collectionSource",
  "collectedPayableAmount",
  "accountingAllocationId",
  "accountingAllocationVersion",
  "allocationStatus",
  "canonicalEvidenceId",
  "collectedAt"
] as const;
export const chargebackWonAuthorityKeys = [
  "kind",
  "authorityId",
  "version",
  "chargebackCaseId",
  "restoredPayableAmount",
  "suspenseClearedAmount",
  "accountingAllocationId",
  "accountingAllocationVersion",
  "allocationStatus",
  "canonicalEvidenceId",
  "wonAt"
] as const;
export const chargebackLostAuthorityKeys = [
  "kind",
  "authorityId",
  "version",
  "chargebackCaseId",
  "unallocatedSuspense",
  "accountingAllocationId",
  "accountingAllocationVersion",
  "allocationStatus",
  "canonicalEvidenceId",
  "lostAt"
] as const;
export const chargebackRestrictionKeys = [
  "restrictionId",
  "version",
  "chargebackCaseId",
  "orderId",
  "astrologerUserId",
  "providerAccountId",
  "providerPaymentId",
  "disputedAmount",
  "canonicalEvidenceId",
  "status",
  "confirmedAt",
  "closedAt"
] as const;
export const chargebackRestrictionHistoryKeys = [
  "kind",
  "operationId",
  "operationKey",
  "previousVersion",
  "nextVersion",
  "occurredAt",
  "authority"
] as const;
export const payableLotStateKeys = [
  "version",
  "astrologerUserId",
  "currency",
  "lots",
  "history",
  "chargebackRestrictions",
  "restrictionHistory",
  "stateDigest"
] as const;
export const payableLotHistoryKeys = [
  "kind",
  "operationId",
  "sourceKey",
  "previousVersion",
  "nextVersion",
  "occurredAt",
  "consumedLotIds",
  "createdLotIds",
  "referencedLotIds",
  "refundOrigins",
  "chargebackAllocations",
  "reserveAllocation",
  "paymentIntegrity",
  "blocks",
  "holdReleaseEvidence",
  "authority"
] as const;
export const bucketSet = new Set<unknown>(payableLotBucketValues);
