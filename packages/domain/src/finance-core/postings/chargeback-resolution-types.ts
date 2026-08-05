import type { FinanceAuthorizationPayloadHash } from "../../finance-authorization/canonical-command-payload";
import type { Money } from "../../money";
import type { ChargebackLostAuthority, ChargebackWonAuthority } from "../source-lot-types";
import type {
  ChargebackRecoveryProviderBindingRef,
  ChargebackResolvedAllocationRef
} from "./chargeback-recovery-posting-types";
import type { UnverifiedChargebackOutcomeEvidenceRef } from "./chargeback-resolution-outcome-evidence";

export type ChargebackResolutionRecoveryRef = Readonly<{
  kind: "chargeback_recovery_posting_allocation";
  authorityId: string;
  version: number;
  canonicalDigest: FinanceAuthorizationPayloadHash;
  journalTransactionId: string;
  journalDigest: FinanceAuthorizationPayloadHash;
}>;

type ChargebackResolutionAuthorityBase = Readonly<{
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
  sourceAuthorityDigest: FinanceAuthorizationPayloadHash;
  outcomeEvidenceRef: UnverifiedChargebackOutcomeEvidenceRef;
  latestProviderBindingRef: ChargebackRecoveryProviderBindingRef;
  allocationRefs: readonly ChargebackResolvedAllocationRef[];
  recoveryRefs: readonly ChargebackResolutionRecoveryRef[];
  disputedPrincipal: Money;
  unallocatedSuspense: Money;
  decidedAt: string;
  canonicalDigest: FinanceAuthorizationPayloadHash;
}>;

export type ChargebackWonResolutionPostingAuthority = ChargebackResolutionAuthorityBase &
  Readonly<{
    kind: "chargeback_won_resolution_posting";
    sourceAuthority: ChargebackWonAuthority;
    operationReceiptId: string;
    operationReceiptDigest: FinanceAuthorizationPayloadHash;
    componentBindingsDigest: FinanceAuthorizationPayloadHash;
    outstandingRecovery: Money;
    restoredPayable: Money;
    platformReversal: Money;
  }>;

export type ChargebackLostResolutionPostingAuthority = ChargebackResolutionAuthorityBase &
  Readonly<{
    kind: "chargeback_lost_resolution_no_posting";
    sourceAuthority: ChargebackLostAuthority;
    resultingRestrictionStatus: "allocation_blocked" | "closed_lost";
  }>;

export type ChargebackResolutionHistory = Readonly<{
  allocations: readonly import("./chargeback-posting-allocation-types").ChargebackPrincipalPostingAllocationAuthority[];
  principalPositions: readonly import("./chargeback-principal-position-types").UnverifiedChargebackPrincipalPositionTransitionBinding[];
  allocationJournals: readonly import("../journal").FinanceJournalTransaction[];
  latestAllocation: import("./chargeback-posting-allocation-types").ChargebackPrincipalPostingAllocationAuthority;
  providerEvidenceBindings: readonly import("./chargeback-provider-evidence").UnverifiedChargebackProviderEvidenceBinding[];
  latestProviderEvidenceBinding: import("./chargeback-provider-evidence").UnverifiedChargebackProviderEvidenceBinding;
  recoveryAuthorities: readonly import("./chargeback-recovery-posting-types").ChargebackRecoveryPostingAllocationAuthority[];
  recoveryJournals: readonly import("../journal").FinanceJournalTransaction[];
  recoveredByExposure: ReadonlyMap<string, number>;
}>;
