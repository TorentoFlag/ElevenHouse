import type { FinanceAuthorizationPayloadHash } from "../../finance-authorization/canonical-command-payload";
import type { Money } from "../../money";
import type { ChargebackLostAuthority } from "../source-lot-types";
import type {
  ChargebackRecoveryProviderBindingRef,
  ChargebackResolvedAllocationRef
} from "./chargeback-recovery-posting-types";
import type { ChargebackResolutionRecoveryRef } from "./chargeback-resolution-types";
import type { UnverifiedChargebackOutcomeEvidenceRef } from "./chargeback-resolution-outcome-evidence";

export type ChargebackLostResolutionAuthorityRef = Readonly<{
  kind: "chargeback_lost_resolution_no_posting";
  authorityId: string;
  version: number;
  canonicalDigest: FinanceAuthorizationPayloadHash;
}>;

export type ChargebackLostClosureTransitionRef = Readonly<{
  kind: "chargeback_lost_allocation_closure_transition";
  operationId: string;
  restrictionId: string;
  previousVersion: number;
  nextVersion: number;
  previousStateDigest: FinanceAuthorizationPayloadHash;
  nextStateDigest: FinanceAuthorizationPayloadHash;
  sourceAuthorityDigest: FinanceAuthorizationPayloadHash;
  occurredAt: string;
  canonicalDigest: FinanceAuthorizationPayloadHash;
}>;

export type ChargebackLostAllocationClosureAuthority = Readonly<{
  kind: "chargeback_lost_allocation_closure_no_posting";
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
  sourceAuthority: ChargebackLostAuthority;
  sourceAuthorityDigest: FinanceAuthorizationPayloadHash;
  initialLostOutcomeRef: UnverifiedChargebackOutcomeEvidenceRef;
  priorLostResolutionRef: ChargebackLostResolutionAuthorityRef;
  restrictionTransitionRef: ChargebackLostClosureTransitionRef;
  latestProviderBindingRef: ChargebackRecoveryProviderBindingRef;
  allocationRefs: readonly ChargebackResolvedAllocationRef[];
  recoveryRefs: readonly ChargebackResolutionRecoveryRef[];
  disputedPrincipal: Money;
  unallocatedSuspense: Money;
  decidedAt: string;
  canonicalDigest: FinanceAuthorizationPayloadHash;
}>;
