import type { FinanceAuthorizationPayloadHash } from "../../finance-authorization/canonical-command-payload";
import type { Money } from "../../money";
import type { ChargebackPrincipalConfirmedBasis } from "../chargeback-principal-confirmed-basis";
import type { FinancePostingAuthorityRef } from "./posting-types";

export type { ChargebackPrincipalConfirmedBasis } from "../chargeback-principal-confirmed-basis";

export type UnverifiedChargebackTreatmentDecision = Readonly<{
  kind: "unverified_chargeback_treatment_decision";
  schemaVersion: 1;
  decisionId: string;
  version: number;
  approvalStatus: "approved";
  authorizationStatus: "unverified";
  digestPurpose: "drift_detection_only";
  chargebackCaseId: string;
  orderId: string;
  astrologerUserId: string;
  positionId: string;
  treatment: "astrologer_recovery" | "platform_loss";
  approvedAmount: Money;
  policyId: string;
  policyVersion: number;
  proposedByActorUserId: string;
  approvedByActorUserId: string;
  approvedAt: string;
  canonicalDigest: FinanceAuthorizationPayloadHash;
}>;

export type ChargebackPaidRecoveryPosition = Readonly<{
  kind: "paid_recovery";
  positionId: string;
  originalSaleId: string;
  componentId: string;
  payableLotId: string;
  payoutRequestId: string;
  payoutAllocationId: string;
  sourceCapacity: Money;
  consumedBefore: Money;
  currentDelta: Money;
  consumedAfter: Money;
  remainingAfter: Money;
  paidEvidence: Readonly<{
    payoutPaidAuthorityId: string;
    payoutPaidAuthorityVersion: number;
    payoutPaidAuthorityDigest: FinanceAuthorizationPayloadHash;
    operationReceiptId: string;
    operationReceiptDigest: FinanceAuthorizationPayloadHash;
    journalTransactionId: string;
    journalTransactionDigest: FinanceAuthorizationPayloadHash;
    bankReference: string;
    transferredAt: string;
  }>;
  treatmentDecision: UnverifiedChargebackTreatmentDecision;
}>;

export type ChargebackPlatformCommissionPosition = Readonly<{
  kind: "platform_commission_reversal";
  positionId: string;
  originalSaleId: string;
  componentId: string;
  debitAccount: "platform_commission_deferred" | "platform_commission_revenue";
  originalJournalEntry: Readonly<{
    transactionId: string;
    entryIndex: number;
    canonicalDigest: FinanceAuthorizationPayloadHash;
  }>;
  originalCommissionAmount: Money;
  deferredRemainingBefore: Money;
  revenueRemainingBefore: Money;
  reversedBefore: Money;
  currentDelta: Money;
  deferredRemainingAfter: Money;
  revenueRemainingAfter: Money;
  reversedAfter: Money;
  ledgerPositionAuthorityRef: FinancePostingAuthorityRef;
}>;

export type ChargebackPlatformLossPosition = Readonly<{
  kind: "platform_loss";
  positionId: string;
  originalSaleId: string;
  componentId: string;
  sourceCapacity: Money;
  consumedBefore: Money;
  currentDelta: Money;
  consumedAfter: Money;
  remainingAfter: Money;
  treatmentDecision: UnverifiedChargebackTreatmentDecision;
}>;

export type ChargebackPrincipalPositionPreviousRef = Readonly<{
  bindingId: string;
  nextPositionVersion: string;
  bindingDigest: FinanceAuthorizationPayloadHash;
}>;

export type UnverifiedChargebackPrincipalPositionTransitionBinding = Readonly<{
  kind: "unverified_chargeback_principal_position_transition_binding";
  schemaVersion: 1;
  bindingId: string;
  authorizationStatus: "unverified";
  atomicityStatus: "unverified";
  digestPurpose: "drift_detection_only";
  positionId: string;
  expectedPositionVersion: string;
  nextPositionVersion: string;
  previousBindingRef: ChargebackPrincipalPositionPreviousRef | null;
  chargebackCaseId: string;
  orderId: string;
  astrologerUserId: string;
  providerAccountId: string;
  accountingAllocationId: string;
  accountingAllocationRevisionId: string;
  accountingAllocationVersion: number;
  providerEvidenceBindingDigest: FinanceAuthorizationPayloadHash;
  confirmedBasis: ChargebackPrincipalConfirmedBasis;
  caseExposure: Readonly<{
    disputedPrincipal: Money;
    allocatedBefore: Money;
    payableDelta: Money;
    recoveryDelta: Money;
    platformDelta: Money;
    allocationDelta: Money;
    allocatedAfter: Money;
    unallocatedAfter: Money;
  }>;
  recoveryPositions: readonly ChargebackPaidRecoveryPosition[];
  platformPositions: readonly (
    | ChargebackPlatformCommissionPosition
    | ChargebackPlatformLossPosition
  )[];
  observedAt: string;
  bindingDigest: FinanceAuthorizationPayloadHash;
}>;

export type ChargebackPrincipalPositionTransitionRef = Readonly<{
  kind: "unverified_chargeback_principal_position_transition_binding";
  bindingId: string;
  nextPositionVersion: string;
  bindingDigest: FinanceAuthorizationPayloadHash;
}>;
