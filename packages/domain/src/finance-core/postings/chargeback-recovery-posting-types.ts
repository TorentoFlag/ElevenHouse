import type { FinanceAuthorizationPayloadHash } from "../../finance-authorization/canonical-command-payload";
import type { Money } from "../../money";
import type { ChargebackRecoveryCollectionAuthority } from "../source-lot-types";
import type { UnverifiedChargebackOutcomeEvidenceRef } from "./chargeback-resolution-outcome-evidence";

export type ChargebackResolvedAllocationRef = Readonly<{
  kind: "chargeback_principal_posting_allocation";
  authorityId: string;
  accountingAllocationId: string;
  version: number;
  nextAllocatedPrincipal: Money;
  canonicalDigest: FinanceAuthorizationPayloadHash;
  journalTransactionId: string;
  journalDigest: FinanceAuthorizationPayloadHash;
}>;

export type ChargebackRecoveryProviderBindingRef = Readonly<{
  kind: "unverified_chargeback_provider_evidence_binding";
  bindingId: string;
  version: number;
  canonicalDigest: FinanceAuthorizationPayloadHash;
}>;

export type ChargebackRecoveryPriorAuthorityRef = Readonly<{
  kind: "chargeback_recovery_posting_allocation";
  authorityId: string;
  version: number;
  canonicalDigest: FinanceAuthorizationPayloadHash;
}>;

export type ChargebackRecoveryExposure = Readonly<{
  exposureId: string;
  originalComponentId: string;
  originalSaleId: string;
  payableLotId: string;
  payoutAllocationId: string;
  sourceCapacity: Money;
  allocatedAmount: Money;
  priorCollectedAmount: Money;
  collectionDelta: Money;
  nextCollectedAmount: Money;
}>;

export type ChargebackRecoveryTranche = Readonly<{
  exposureId: string;
  allocationAuthorityId: string;
  allocationAuthorityVersion: number;
  accountingAllocationRevisionId: string;
  positionTransitionBindingId: string;
  positionTransitionVersion: string;
  originalJournalEntry: Readonly<{
    transactionId: string;
    entryIndex: number;
    canonicalDigest: FinanceAuthorizationPayloadHash;
  }>;
  amount: Money;
}>;

export type ChargebackRecoveryCollectionRow = Readonly<{
  exposureId: string;
  amount: Money;
  receiptPayableEffectId: string;
  receiptPayableComponentId: string;
  receiptRecoveryEffectId: string;
  receiptRecoveryComponentId: string;
}>;

export type ChargebackRecoveryPostingAllocationAuthority = Readonly<{
  kind: "chargeback_recovery_posting_allocation";
  schemaVersion: 1;
  authorityId: string;
  version: number;
  authorizationStatus: "unverified";
  atomicityStatus: "unverified";
  digestPurpose: "drift_detection_only";
  chargebackCaseId: string;
  originalOrderId: string;
  astrologerUserId: string;
  arcProviderAccountId: string;
  providerPaymentId: string;
  sourceAuthority: ChargebackRecoveryCollectionAuthority;
  sourceAuthorityDigest: FinanceAuthorizationPayloadHash;
  latestProviderBindingRef: ChargebackRecoveryProviderBindingRef;
  allocationRefs: readonly ChargebackResolvedAllocationRef[];
  priorAuthorityRef: ChargebackRecoveryPriorAuthorityRef | null;
  latestOutcomeEvidenceRef: UnverifiedChargebackOutcomeEvidenceRef | null;
  operationReceiptId: string;
  operationReceiptDigest: FinanceAuthorizationPayloadHash;
  componentBindingsDigest: FinanceAuthorizationPayloadHash;
  collectionTotal: Money;
  exposures: readonly ChargebackRecoveryExposure[];
  tranches: readonly ChargebackRecoveryTranche[];
  collectionRows: readonly ChargebackRecoveryCollectionRow[];
  collectedAt: string;
  canonicalDigest: FinanceAuthorizationPayloadHash;
}>;
