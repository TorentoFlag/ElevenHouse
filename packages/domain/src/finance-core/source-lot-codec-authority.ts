import {
  ChargebackPrincipalConfirmedBasisIntegrityError,
  readChargebackPrincipalConfirmedBasis
} from "./chargeback-principal-confirmed-basis";
import {
  createProviderAccountIdentityBinding,
  type ProviderAccountIdentityBinding
} from "./provider-account-binding";
import {
  type ChargebackConfirmedAuthority,
  type ChargebackLostAuthority,
  type ChargebackPrincipalAllocationAuthority,
  type ChargebackRecoveryCollectionAuthority,
  type ChargebackWonAuthority,
  type HoldReleaseEvidence,
  type PayableLotBlockSnapshot,
  type PayableLotOperationAuthority,
  type PaymentCaptureIntegrityAuthority,
  type PayoutNoTransferOutcomeAuthority,
  type PayoutPaidAuthority,
  type PayoutRequestAuthority,
  type PayoutReturnAuthority,
  type RefundApprovalAuthority,
  type RefundBridgePayoutFailedAuthority,
  type RefundBridgePayoutPaidAuthority,
  type RefundConfirmedAuthority,
  type RefundFailedAuthority,
  type ReserveAllocationDecision,
  type ReserveReleaseAuthority
} from "./source-lot-types";
import {
  dataRecord,
  exactDataArray,
  exactDataRecord,
  fail,
  identifier,
  instant,
  integer,
  isBoolean,
  money,
  nullableIdentifier,
  positiveVersion
} from "./source-lot-validation";

import { rubCurrency, sha256Digest } from "./source-lot-codec-core";
import {
  chargebackConfirmedAuthorityKeys,
  chargebackLostAuthorityKeys,
  chargebackPrincipalAuthorityKeys,
  chargebackRecoveryCollectionAuthorityKeys,
  chargebackWonAuthorityKeys,
  payableLotBlockKeys,
  paymentIntegrityKeys,
  payoutNoTransferAuthorityKeys,
  payoutPaidAuthorityKeys,
  payoutRequestAuthorityKeys,
  payoutReturnAuthorityKeys,
  refundApprovalAuthorityKeys,
  refundBridgePayoutFailedAuthorityKeys,
  refundBridgePayoutPaidAuthorityKeys,
  refundConfirmedAuthorityKeys,
  refundFailedAuthorityKeys,
  reserveDecisionKeys,
  reserveReleaseAuthorityKeys
} from "./source-lot-codec-shapes";
export function createPaymentCaptureIntegrityAuthority(
  input: unknown
): PaymentCaptureIntegrityAuthority {
  const fields = exactDataRecord(input, paymentIntegrityKeys);
  if (fields.kind !== "current_payment_capture_integrity") fail("invalid_field");
  if (fields.status !== "capture_clear" && fields.status !== "over_capture_blocked") {
    fail("invalid_field");
  }
  const overCaptureIncidentId = nullableIdentifier(fields.overCaptureIncidentId);
  if ((fields.status === "capture_clear") !== (overCaptureIncidentId === null)) {
    fail("invalid_field");
  }
  return Object.freeze({
    kind: "current_payment_capture_integrity",
    authorityId: identifier(fields.authorityId),
    version: positiveVersion(fields.version, "invalid_field"),
    status: fields.status,
    intentId: identifier(fields.intentId),
    intentVersion: positiveVersion(fields.intentVersion, "invalid_field"),
    providerAccountId: identifier(fields.providerAccountId),
    providerPaymentId: identifier(fields.providerPaymentId),
    canonicalEvidenceId: identifier(fields.canonicalEvidenceId),
    overCaptureIncidentId,
    evaluatedAt: instant(fields.evaluatedAt)
  });
}

export function createPayableLotBlockSnapshot(input: unknown): PayableLotBlockSnapshot {
  const fields = exactDataRecord(input, payableLotBlockKeys);
  if (fields.kind !== "payable_release_blocks") fail("invalid_field");
  for (const value of [
    fields.refund,
    fields.chargeback,
    fields.reconciliation,
    fields.manualRisk
  ]) {
    if (!isBoolean(value)) fail("invalid_field");
  }
  return Object.freeze({
    kind: "payable_release_blocks",
    snapshotId: identifier(fields.snapshotId),
    version: positiveVersion(fields.version, "invalid_field"),
    orderId: identifier(fields.orderId),
    astrologerUserId: identifier(fields.astrologerUserId),
    providerAccountId: identifier(fields.providerAccountId),
    paymentIntentId: identifier(fields.paymentIntentId),
    currency: rubCurrency(fields.currency),
    evaluatedAt: instant(fields.evaluatedAt),
    refund: fields.refund as boolean,
    chargeback: fields.chargeback as boolean,
    reconciliation: fields.reconciliation as boolean,
    manualRisk: fields.manualRisk as boolean
  });
}

export function createHoldReleaseEvidence(input: unknown): HoldReleaseEvidence {
  const fields = exactDataRecord(input, [
    "kind",
    "lotId",
    "orderId",
    "evaluatedAt",
    "bookingCompletion",
    "providerSettlement",
    "blocks"
  ]);
  if (fields.kind !== "hold_release_evidence") fail("invalid_field");
  const bookingFields = exactDataRecord(fields.bookingCompletion, [
    "bookingId",
    "orderId",
    "owner",
    "status",
    "contractVersion",
    "completedAt",
    "evidenceId"
  ]);
  const bookingCompletion = Object.freeze({
    bookingId: identifier(bookingFields.bookingId),
    orderId: identifier(bookingFields.orderId),
    owner: identifier(bookingFields.owner),
    status: identifier(bookingFields.status),
    contractVersion: positiveVersion(bookingFields.contractVersion, "invalid_field"),
    completedAt: instant(bookingFields.completedAt),
    evidenceId: identifier(bookingFields.evidenceId)
  });
  const providerSettlement =
    fields.providerSettlement === null
      ? null
      : (() => {
          const settlement = exactDataRecord(fields.providerSettlement, [
            "kind",
            "providerAccountId",
            "paymentIntentId",
            "providerPaymentId",
            "evidenceId",
            "matchedAt"
          ]);
          if (settlement.kind !== "provider_settlement_matched") fail("invalid_field");
          return Object.freeze({
            kind: "provider_settlement_matched" as const,
            providerAccountId: identifier(settlement.providerAccountId),
            paymentIntentId: identifier(settlement.paymentIntentId),
            providerPaymentId: identifier(settlement.providerPaymentId),
            evidenceId: identifier(settlement.evidenceId),
            matchedAt: instant(settlement.matchedAt)
          });
        })();
  return Object.freeze({
    kind: "hold_release_evidence",
    lotId: identifier(fields.lotId),
    orderId: identifier(fields.orderId),
    evaluatedAt: instant(fields.evaluatedAt),
    bookingCompletion,
    providerSettlement,
    blocks: createPayableLotBlockSnapshot(fields.blocks)
  });
}

export function createReserveReleaseAuthority(input: unknown): ReserveReleaseAuthority {
  const fields = exactDataRecord(input, reserveReleaseAuthorityKeys);
  if (fields.kind !== "reserve_release") fail("invalid_field");
  return Object.freeze({
    kind: "reserve_release",
    authorityId: identifier(fields.authorityId),
    version: positiveVersion(fields.version, "invalid_field"),
    holdReleaseOperationId: identifier(fields.holdReleaseOperationId),
    reserveDecisionId: identifier(fields.reserveDecisionId),
    reserveDecisionVersion: positiveVersion(fields.reserveDecisionVersion, "invalid_field")
  });
}

export function createPayoutRequestAuthority(input: unknown): PayoutRequestAuthority {
  const fields = exactDataRecord(input, payoutRequestAuthorityKeys);
  if (fields.kind !== "payout_request") fail("invalid_field");
  const amount = money(fields.amount, true, "invalid_field");
  const allocations = exactDataArray(fields.allocations).map((entry) => {
    const allocation = exactDataRecord(entry, [
      "payoutAllocationId",
      "sourceLotId",
      "payoutPendingLotId",
      "amountMinor"
    ]);
    return Object.freeze({
      payoutAllocationId: identifier(allocation.payoutAllocationId),
      sourceLotId: identifier(allocation.sourceLotId),
      payoutPendingLotId: identifier(allocation.payoutPendingLotId),
      amountMinor: integer(allocation.amountMinor, 1, Number.MAX_SAFE_INTEGER, "invalid_field")
    });
  });
  if (
    allocations.length === 0 ||
    new Set(allocations.map((allocation) => allocation.payoutAllocationId)).size !==
      allocations.length ||
    new Set(allocations.map((allocation) => allocation.sourceLotId)).size !== allocations.length ||
    new Set(allocations.map((allocation) => allocation.payoutPendingLotId)).size !==
      allocations.length ||
    allocations.reduce((sum, allocation) => sum + BigInt(allocation.amountMinor), 0n) !==
      BigInt(amount.amountMinor)
  ) {
    fail("invalid_field");
  }
  return Object.freeze({
    kind: "payout_request",
    authorityId: identifier(fields.authorityId),
    version: positiveVersion(fields.version, "invalid_field"),
    payoutRequestId: identifier(fields.payoutRequestId),
    astrologerUserId: identifier(fields.astrologerUserId),
    amount,
    allocations: Object.freeze(allocations)
  });
}

export function createPayoutNoTransferOutcomeAuthority(
  input: unknown
): PayoutNoTransferOutcomeAuthority {
  const fields = exactDataRecord(input, payoutNoTransferAuthorityKeys);
  const bankInitiation = fields.bankInitiation;
  if (
    fields.kind !== "payout_no_transfer_outcome" ||
    (fields.outcome !== "rejected" &&
      fields.outcome !== "cancelled" &&
      fields.outcome !== "failed_pre_transfer") ||
    (bankInitiation !== "not_started" && bankInitiation !== "started") ||
    (bankInitiation === "started" && fields.outcome !== "failed_pre_transfer") ||
    fields.bankDebit !== "not_possible"
  ) {
    fail("invalid_field");
  }
  return Object.freeze({
    kind: "payout_no_transfer_outcome",
    authorityId: identifier(fields.authorityId),
    version: positiveVersion(fields.version, "invalid_field"),
    payoutRequestId: identifier(fields.payoutRequestId),
    outcome: fields.outcome,
    bankInitiation,
    bankDebit: "not_possible",
    evidenceId: identifier(fields.evidenceId),
    decidedAt: instant(fields.decidedAt)
  });
}

export function createPayoutPaidAuthority(input: unknown): PayoutPaidAuthority {
  const fields = exactDataRecord(input, payoutPaidAuthorityKeys);
  if (fields.kind !== "payout_paid") fail("invalid_field");
  const evidenceHash = sha256Digest(fields.evidenceHash);
  return Object.freeze({
    kind: "payout_paid",
    authorityId: identifier(fields.authorityId),
    version: positiveVersion(fields.version, "invalid_field"),
    payoutRequestId: identifier(fields.payoutRequestId),
    bankReference: identifier(fields.bankReference),
    transferredAt: instant(fields.transferredAt),
    evidenceRef: identifier(fields.evidenceRef),
    evidenceHash
  });
}

export function createPayoutReturnAuthority(input: unknown): PayoutReturnAuthority {
  const fields = exactDataRecord(input, payoutReturnAuthorityKeys);
  if (
    fields.kind !== "payout_return" ||
    (fields.outcome !== "returned_without_debit" &&
      fields.outcome !== "returned_after_matched_debit")
  ) {
    fail("invalid_field");
  }
  const bankStatementEntryId = nullableIdentifier(fields.bankStatementEntryId);
  const suspenseReclassificationId = nullableIdentifier(fields.suspenseReclassificationId);
  if (
    fields.bankCreditEvidencePath !== null &&
    fields.bankCreditEvidencePath !== "direct_match" &&
    fields.bankCreditEvidencePath !== "unknown_credit_reclassification"
  ) {
    fail("invalid_field");
  }
  const bankCreditEvidencePath = fields.bankCreditEvidencePath;
  if (
    (fields.outcome === "returned_without_debit") !== (bankStatementEntryId === null) ||
    (fields.outcome === "returned_without_debit") !== (bankCreditEvidencePath === null) ||
    (bankCreditEvidencePath === "unknown_credit_reclassification") !==
      (suspenseReclassificationId !== null) ||
    (fields.outcome === "returned_after_matched_debit" &&
      bankCreditEvidencePath !== "direct_match" &&
      bankCreditEvidencePath !== "unknown_credit_reclassification")
  ) {
    fail("invalid_field");
  }
  return Object.freeze({
    kind: "payout_return",
    authorityId: identifier(fields.authorityId),
    version: positiveVersion(fields.version, "invalid_field"),
    payoutRequestId: identifier(fields.payoutRequestId),
    outcome: fields.outcome,
    bankReference: identifier(fields.bankReference),
    bankStatementEntryId,
    bankCreditEvidencePath,
    suspenseReclassificationId,
    returnedAt: instant(fields.returnedAt),
    evidenceId: identifier(fields.evidenceId)
  });
}

export function createRefundApprovalAuthority(input: unknown): RefundApprovalAuthority {
  const fields = exactDataRecord(input, refundApprovalAuthorityKeys);
  if (fields.kind !== "refund_approval" || fields.fundingStatus !== "fully_funded") {
    fail("invalid_field");
  }
  return Object.freeze({
    kind: "refund_approval",
    authorityId: identifier(fields.authorityId),
    version: positiveVersion(fields.version, "invalid_field"),
    refundId: identifier(fields.refundId),
    orderId: identifier(fields.orderId),
    astrologerUserId: identifier(fields.astrologerUserId),
    payableAmount: money(fields.payableAmount, false, "invalid_field"),
    accountingAllocationId: identifier(fields.accountingAllocationId),
    accountingAllocationVersion: positiveVersion(
      fields.accountingAllocationVersion,
      "invalid_field"
    ),
    fundingStatus: "fully_funded"
  });
}

export function createRefundConfirmedAuthority(input: unknown): RefundConfirmedAuthority {
  const fields = exactDataRecord(input, refundConfirmedAuthorityKeys);
  if (fields.kind !== "refund_confirmed" || fields.providerAmountBasis !== "incremental") {
    fail("invalid_field");
  }
  const providerRefundAmount = money(fields.providerRefundAmount, true, "invalid_field");
  const priorProviderTotalRefunded = money(
    fields.priorProviderTotalRefunded,
    false,
    "invalid_field"
  );
  const nextProviderTotalRefunded = money(fields.nextProviderTotalRefunded, true, "invalid_field");
  const payableAmount = money(fields.payableAmount, false, "invalid_field");
  if (
    providerRefundAmount.currency !== payableAmount.currency ||
    providerRefundAmount.currency !== priorProviderTotalRefunded.currency ||
    providerRefundAmount.currency !== nextProviderTotalRefunded.currency ||
    providerRefundAmount.amountMinor < payableAmount.amountMinor ||
    priorProviderTotalRefunded.amountMinor + providerRefundAmount.amountMinor !==
      nextProviderTotalRefunded.amountMinor
  ) {
    fail("invalid_field");
  }
  return Object.freeze({
    kind: "refund_confirmed",
    authorityId: identifier(fields.authorityId),
    version: positiveVersion(fields.version, "invalid_field"),
    refundId: identifier(fields.refundId),
    providerAccountId: identifier(fields.providerAccountId),
    providerPaymentId: identifier(fields.providerPaymentId),
    providerRefundId: identifier(fields.providerRefundId),
    providerAmountBasis: "incremental",
    providerRefundAmount,
    priorProviderTotalRefunded,
    nextProviderTotalRefunded,
    payableAmount,
    accountingAllocationId: identifier(fields.accountingAllocationId),
    accountingAllocationVersion: positiveVersion(
      fields.accountingAllocationVersion,
      "invalid_field"
    ),
    canonicalEvidenceId: identifier(fields.canonicalEvidenceId),
    confirmedAt: instant(fields.confirmedAt)
  });
}

export function createRefundFailedAuthority(input: unknown): RefundFailedAuthority {
  const fields = exactDataRecord(input, refundFailedAuthorityKeys);
  if (fields.kind !== "refund_failed") fail("invalid_field");
  const providerRefundAmount = money(fields.providerRefundAmount, true, "invalid_field");
  const payableAmount = money(fields.payableAmount, false, "invalid_field");
  if (
    providerRefundAmount.currency !== payableAmount.currency ||
    providerRefundAmount.amountMinor < payableAmount.amountMinor
  ) {
    fail("invalid_field");
  }
  return Object.freeze({
    kind: "refund_failed",
    authorityId: identifier(fields.authorityId),
    version: positiveVersion(fields.version, "invalid_field"),
    refundId: identifier(fields.refundId),
    providerAccountId: identifier(fields.providerAccountId),
    providerPaymentId: identifier(fields.providerPaymentId),
    providerRefundId: identifier(fields.providerRefundId),
    providerRefundAmount,
    payableAmount,
    accountingAllocationId: identifier(fields.accountingAllocationId),
    accountingAllocationVersion: positiveVersion(
      fields.accountingAllocationVersion,
      "invalid_field"
    ),
    failureCode: identifier(fields.failureCode),
    canonicalEvidenceId: identifier(fields.canonicalEvidenceId),
    failedAt: instant(fields.failedAt)
  });
}

export function createRefundBridgePayoutFailedAuthority(
  input: unknown
): RefundBridgePayoutFailedAuthority {
  const fields = exactDataRecord(input, refundBridgePayoutFailedAuthorityKeys);
  const payoutOutcomeAuthority = createPayoutNoTransferOutcomeAuthority(
    fields.payoutOutcomeAuthority
  );
  if (
    fields.kind !== "refund_bridge_payout_failed" ||
    fields.bridgeStatus !== "allocated" ||
    payoutOutcomeAuthority.payoutRequestId !== fields.payoutRequestId
  ) {
    fail("invalid_field");
  }
  return Object.freeze({
    kind: "refund_bridge_payout_failed",
    authorityId: identifier(fields.authorityId),
    version: positiveVersion(fields.version, "invalid_field"),
    refundId: identifier(fields.refundId),
    refundedOrderId: identifier(fields.refundedOrderId),
    payoutRequestId: identifier(fields.payoutRequestId),
    payoutAllocationId: identifier(fields.payoutAllocationId),
    amount: money(fields.amount, true, "invalid_field"),
    bridgeAllocationId: identifier(fields.bridgeAllocationId),
    bridgeAllocationVersion: positiveVersion(fields.bridgeAllocationVersion, "invalid_field"),
    bridgeStatus: "allocated",
    accountingAllocationId: identifier(fields.accountingAllocationId),
    accountingAllocationVersion: positiveVersion(
      fields.accountingAllocationVersion,
      "invalid_field"
    ),
    confirmedRefundAuthorityId: identifier(fields.confirmedRefundAuthorityId),
    confirmedRefundAuthorityVersion: positiveVersion(
      fields.confirmedRefundAuthorityVersion,
      "invalid_field"
    ),
    confirmedRefundEvidenceId: identifier(fields.confirmedRefundEvidenceId),
    payoutOutcomeAuthority
  });
}

export function createRefundBridgePayoutPaidAuthority(
  input: unknown
): RefundBridgePayoutPaidAuthority {
  const fields = exactDataRecord(input, refundBridgePayoutPaidAuthorityKeys);
  if (fields.kind !== "refund_bridge_payout_paid" || fields.bridgeStatus !== "allocated") {
    fail("invalid_field");
  }
  return Object.freeze({
    kind: "refund_bridge_payout_paid",
    authorityId: identifier(fields.authorityId),
    version: positiveVersion(fields.version, "invalid_field"),
    refundId: identifier(fields.refundId),
    refundedOrderId: identifier(fields.refundedOrderId),
    payoutRequestId: identifier(fields.payoutRequestId),
    payoutAllocationId: identifier(fields.payoutAllocationId),
    amount: money(fields.amount, true, "invalid_field"),
    bridgeAllocationId: identifier(fields.bridgeAllocationId),
    bridgeAllocationVersion: positiveVersion(fields.bridgeAllocationVersion, "invalid_field"),
    bridgeStatus: "allocated",
    accountingAllocationId: identifier(fields.accountingAllocationId),
    accountingAllocationVersion: positiveVersion(
      fields.accountingAllocationVersion,
      "invalid_field"
    ),
    confirmedRefundAuthorityId: identifier(fields.confirmedRefundAuthorityId),
    confirmedRefundAuthorityVersion: positiveVersion(
      fields.confirmedRefundAuthorityVersion,
      "invalid_field"
    ),
    confirmedRefundEvidenceId: identifier(fields.confirmedRefundEvidenceId),
    payoutPaidAuthorityId: identifier(fields.payoutPaidAuthorityId),
    payoutPaidAuthorityVersion: positiveVersion(fields.payoutPaidAuthorityVersion, "invalid_field"),
    bankReference: identifier(fields.bankReference),
    canonicalEvidenceId: identifier(fields.canonicalEvidenceId),
    decidedAt: instant(fields.decidedAt)
  });
}

export function createChargebackConfirmedAuthority(input: unknown): ChargebackConfirmedAuthority {
  const fields = exactDataRecord(input, chargebackConfirmedAuthorityKeys);
  if (
    fields.kind !== "chargeback_confirmed" ||
    (fields.confirmationKind !== "initial" && fields.confirmationKind !== "cumulative_update") ||
    fields.amountBasis !== "cumulative"
  ) {
    fail("invalid_field");
  }
  const priorRestrictionVersion =
    fields.priorRestrictionVersion === null
      ? null
      : positiveVersion(fields.priorRestrictionVersion, "invalid_field");
  const priorCumulativeDisputedAmount = money(
    fields.priorCumulativeDisputedAmount,
    false,
    "invalid_field"
  );
  const nextCumulativeDisputedAmount = money(
    fields.nextCumulativeDisputedAmount,
    true,
    "invalid_field"
  );
  const disputedDelta = money(fields.disputedDelta, true, "invalid_field");
  if (
    (fields.confirmationKind === "initial") !== (priorRestrictionVersion === null) ||
    priorCumulativeDisputedAmount.currency !== nextCumulativeDisputedAmount.currency ||
    disputedDelta.currency !== nextCumulativeDisputedAmount.currency ||
    BigInt(priorCumulativeDisputedAmount.amountMinor) + BigInt(disputedDelta.amountMinor) !==
      BigInt(nextCumulativeDisputedAmount.amountMinor) ||
    (fields.confirmationKind === "initial" && priorCumulativeDisputedAmount.amountMinor !== 0)
  ) {
    fail("invalid_field");
  }
  return Object.freeze({
    kind: "chargeback_confirmed",
    authorityId: identifier(fields.authorityId),
    version: positiveVersion(fields.version, "invalid_field"),
    confirmationId: identifier(fields.confirmationId),
    restrictionId: identifier(fields.restrictionId),
    confirmationKind: fields.confirmationKind,
    amountBasis: "cumulative",
    priorRestrictionVersion,
    chargebackCaseId: identifier(fields.chargebackCaseId),
    orderId: identifier(fields.orderId),
    astrologerUserId: identifier(fields.astrologerUserId),
    providerAccount: safeProviderAccountIdentityBinding(fields.providerAccount),
    providerPaymentId: identifier(fields.providerPaymentId),
    priorCumulativeDisputedAmount,
    nextCumulativeDisputedAmount,
    disputedDelta,
    canonicalEvidenceId: identifier(fields.canonicalEvidenceId),
    confirmedAt: instant(fields.confirmedAt)
  });
}

export function createChargebackPrincipalAllocationAuthority(
  input: unknown
): ChargebackPrincipalAllocationAuthority {
  const fields = exactDataRecord(input, chargebackPrincipalAuthorityKeys);
  if (fields.kind !== "chargeback_principal_allocation" || fields.allocationStatus !== "approved") {
    fail("invalid_field");
  }
  const confirmedBasis = safeChargebackPrincipalConfirmedBasis(fields.confirmedBasis);
  return Object.freeze({
    kind: "chargeback_principal_allocation",
    authorityId: identifier(fields.authorityId),
    version: positiveVersion(fields.version, "invalid_field"),
    chargebackCaseId: identifier(fields.chargebackCaseId),
    orderId: identifier(fields.orderId),
    astrologerUserId: identifier(fields.astrologerUserId),
    payableAmount: money(fields.payableAmount, false, "invalid_field"),
    accountingAllocationId: identifier(fields.accountingAllocationId),
    accountingAllocationRevisionId: identifier(fields.accountingAllocationRevisionId),
    accountingAllocationVersion: positiveVersion(
      fields.accountingAllocationVersion,
      "invalid_field"
    ),
    allocationStatus: "approved",
    confirmedBasis
  });
}

function safeProviderAccountIdentityBinding(input: unknown): ProviderAccountIdentityBinding {
  try {
    return createProviderAccountIdentityBinding(input);
  } catch {
    return fail("invalid_field");
  }
}

function safeChargebackPrincipalConfirmedBasis(input: unknown) {
  try {
    return readChargebackPrincipalConfirmedBasis(input);
  } catch (error) {
    if (error instanceof ChargebackPrincipalConfirmedBasisIntegrityError) {
      return fail("invalid_field");
    }
    throw error;
  }
}

export function createChargebackRecoveryCollectionAuthority(
  input: unknown
): ChargebackRecoveryCollectionAuthority {
  const fields = exactDataRecord(input, chargebackRecoveryCollectionAuthorityKeys);
  if (fields.kind !== "chargeback_recovery_collection" || fields.allocationStatus !== "approved") {
    fail("invalid_field");
  }
  const collectionSourceFields = dataRecord(fields.collectionSource);
  const collectionSource = (() => {
    if (collectionSourceFields.kind === "future_payable") {
      const source = exactDataRecord(fields.collectionSource, ["kind", "sourceOrderId"]);
      return Object.freeze({
        kind: "future_payable" as const,
        sourceOrderId: identifier(source.sourceOrderId)
      });
    }
    if (collectionSourceFields.kind === "returned_payout") {
      const source = exactDataRecord(fields.collectionSource, [
        "kind",
        "sourceOrderId",
        "payoutRequestId",
        "payoutAllocationId",
        "payoutReturnAuthorityId",
        "payoutReturnAuthorityVersion",
        "payoutReturnEvidenceId"
      ]);
      return Object.freeze({
        kind: "returned_payout" as const,
        sourceOrderId: identifier(source.sourceOrderId),
        payoutRequestId: identifier(source.payoutRequestId),
        payoutAllocationId: identifier(source.payoutAllocationId),
        payoutReturnAuthorityId: identifier(source.payoutReturnAuthorityId),
        payoutReturnAuthorityVersion: positiveVersion(
          source.payoutReturnAuthorityVersion,
          "invalid_field"
        ),
        payoutReturnEvidenceId: identifier(source.payoutReturnEvidenceId)
      });
    }
    return fail("invalid_field");
  })();
  return Object.freeze({
    kind: "chargeback_recovery_collection",
    authorityId: identifier(fields.authorityId),
    version: positiveVersion(fields.version, "invalid_field"),
    recoveryCollectionId: identifier(fields.recoveryCollectionId),
    chargebackCaseId: identifier(fields.chargebackCaseId),
    astrologerUserId: identifier(fields.astrologerUserId),
    collectionSource,
    collectedPayableAmount: money(fields.collectedPayableAmount, true, "invalid_field"),
    accountingAllocationId: identifier(fields.accountingAllocationId),
    accountingAllocationVersion: positiveVersion(
      fields.accountingAllocationVersion,
      "invalid_field"
    ),
    allocationStatus: "approved",
    canonicalEvidenceId: identifier(fields.canonicalEvidenceId),
    collectedAt: instant(fields.collectedAt)
  });
}

export function createChargebackWonAuthority(input: unknown): ChargebackWonAuthority {
  const fields = exactDataRecord(input, chargebackWonAuthorityKeys);
  if (fields.kind !== "chargeback_won" || fields.allocationStatus !== "approved") {
    fail("invalid_field");
  }
  return Object.freeze({
    kind: "chargeback_won",
    authorityId: identifier(fields.authorityId),
    version: positiveVersion(fields.version, "invalid_field"),
    chargebackCaseId: identifier(fields.chargebackCaseId),
    restoredPayableAmount: money(fields.restoredPayableAmount, false, "invalid_field"),
    suspenseClearedAmount: money(fields.suspenseClearedAmount, false, "invalid_field"),
    accountingAllocationId: identifier(fields.accountingAllocationId),
    accountingAllocationVersion: positiveVersion(
      fields.accountingAllocationVersion,
      "invalid_field"
    ),
    allocationStatus: "approved",
    canonicalEvidenceId: identifier(fields.canonicalEvidenceId),
    wonAt: instant(fields.wonAt)
  });
}

export function createChargebackLostAuthority(input: unknown): ChargebackLostAuthority {
  const fields = exactDataRecord(input, chargebackLostAuthorityKeys);
  if (fields.kind !== "chargeback_lost" || fields.allocationStatus !== "approved") {
    fail("invalid_field");
  }
  return Object.freeze({
    kind: "chargeback_lost",
    authorityId: identifier(fields.authorityId),
    version: positiveVersion(fields.version, "invalid_field"),
    chargebackCaseId: identifier(fields.chargebackCaseId),
    unallocatedSuspense: money(fields.unallocatedSuspense, false, "invalid_field"),
    accountingAllocationId: identifier(fields.accountingAllocationId),
    accountingAllocationVersion: positiveVersion(
      fields.accountingAllocationVersion,
      "invalid_field"
    ),
    allocationStatus: "approved",
    canonicalEvidenceId: identifier(fields.canonicalEvidenceId),
    lostAt: instant(fields.lostAt)
  });
}

export function createReserveAllocationDecision(input: unknown): ReserveAllocationDecision {
  const fields = exactDataRecord(input, reserveDecisionKeys);
  const payable = money(fields.payable, true, "reserve_allocation_invalid");
  const available = money(fields.available, false, "reserve_allocation_invalid");
  const reserved = money(fields.reserved, false, "reserve_allocation_invalid");
  if (
    BigInt(payable.amountMinor) !==
    BigInt(available.amountMinor) + BigInt(reserved.amountMinor)
  ) {
    fail("reserve_allocation_invalid");
  }
  const authorityFields = exactDataRecord(fields.authority, ["kind", "id", "version"]);
  if (authorityFields.kind !== "reserve_allocation") fail("reserve_allocation_invalid");

  return Object.freeze({
    decisionId: identifier(fields.decisionId),
    version: positiveVersion(fields.version, "reserve_allocation_invalid"),
    authority: Object.freeze({
      kind: "reserve_allocation" as const,
      id: identifier(authorityFields.id),
      version: positiveVersion(authorityFields.version, "reserve_allocation_invalid")
    }),
    orderId: identifier(fields.orderId),
    astrologerUserId: identifier(fields.astrologerUserId),
    riskPolicyId: identifier(fields.riskPolicyId),
    riskPolicyVersion: positiveVersion(fields.riskPolicyVersion, "reserve_allocation_invalid"),
    reserveBps: integer(fields.reserveBps, 0, 10_000, "reserve_allocation_invalid"),
    payable,
    available,
    reserved
  });
}

export function hydratePayableLotOperationAuthority(value: unknown): PayableLotOperationAuthority {
  const fields = dataRecord(value);
  switch (fields.kind) {
    case "reserve_release":
      return createReserveReleaseAuthority(value);
    case "payout_request":
      return createPayoutRequestAuthority(value);
    case "payout_no_transfer_outcome":
      return createPayoutNoTransferOutcomeAuthority(value);
    case "payout_paid":
      return createPayoutPaidAuthority(value);
    case "payout_return":
      return createPayoutReturnAuthority(value);
    case "refund_approval":
      return createRefundApprovalAuthority(value);
    case "refund_confirmed":
      return createRefundConfirmedAuthority(value);
    case "refund_failed":
      return createRefundFailedAuthority(value);
    case "refund_bridge_payout_failed":
      return createRefundBridgePayoutFailedAuthority(value);
    case "chargeback_confirmed":
      return createChargebackConfirmedAuthority(value);
    case "chargeback_principal_allocation":
      return createChargebackPrincipalAllocationAuthority(value);
    case "chargeback_recovery_collection":
      return createChargebackRecoveryCollectionAuthority(value);
    case "chargeback_won":
      return createChargebackWonAuthority(value);
    case "chargeback_lost":
      return createChargebackLostAuthority(value);
    default:
      return fail("invalid_field");
  }
}
