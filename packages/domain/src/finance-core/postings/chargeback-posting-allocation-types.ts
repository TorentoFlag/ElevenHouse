import type { FinanceAuthorizationPayloadHash } from "../../finance-authorization/canonical-command-payload";
import type { Money } from "../../money";
import type { ChargebackPrincipalAllocationAuthority } from "../source-lot-types";
import type { UnverifiedChargebackProviderEvidenceBinding } from "./chargeback-provider-evidence";
import type { ChargebackPrincipalPositionTransitionRef } from "./chargeback-principal-position-types";
import type { FinancePostingAuthorityRef } from "./posting-types";

export type ChargebackRecoveryPostingAllocation = Readonly<{
  kind: "recovery_receivable";
  allocationId: string;
  componentId: string;
  originalSaleId: string;
  payableLotId: string;
  payoutRequestId: string;
  payoutAllocationId: string;
  amount: Money;
  treatmentAuthorityRef: FinancePostingAuthorityRef & {
    readonly kind: "chargeback_recovery_treatment";
  };
}>;

export type ChargebackPlatformPostingAccountCode =
  | "platform_commission_deferred"
  | "platform_commission_revenue"
  | "platform_chargeback_loss";

type ChargebackPlatformPostingAllocationBase = Readonly<{
  kind: "platform_component";
  allocationId: string;
  componentId: string;
  originalSaleId: string;
  amount: Money;
}>;

export type ChargebackPlatformPostingAllocation =
  | (ChargebackPlatformPostingAllocationBase &
      Readonly<{
        accountCode: "platform_commission_deferred" | "platform_commission_revenue";
        originalJournalEntry: Readonly<{
          transactionId: string;
          entryIndex: number;
          canonicalDigest: FinanceAuthorizationPayloadHash;
        }>;
        treatmentAuthorityRef: FinancePostingAuthorityRef & {
          readonly kind: "chargeback_component_reversal";
        };
      }>)
  | (ChargebackPlatformPostingAllocationBase &
      Readonly<{
        accountCode: "platform_chargeback_loss";
        originalJournalEntry: null;
        treatmentAuthorityRef: FinancePostingAuthorityRef & {
          readonly kind: "chargeback_platform_loss_treatment";
        };
      }>);

export type ChargebackPlatformPostingOriginalJournalEntry = Readonly<{
  transactionId: string;
  entryIndex: number;
  canonicalDigest: FinanceAuthorizationPayloadHash;
}>;

export type ChargebackPrincipalPostingPriorAllocationAuthorityRef = Readonly<{
  kind: "chargeback_principal_posting_allocation";
  authorityId: string;
  accountingAllocationId: string;
  version: number;
  nextAllocatedPrincipal: Money;
  canonicalDigest: FinanceAuthorizationPayloadHash;
}>;

export type ChargebackPrincipalPostingAllocationAuthority = Readonly<{
  kind: "chargeback_principal_posting_allocation";
  schemaVersion: 1;
  authorityId: string;
  version: number;
  authorizationStatus: "unverified";
  digestPurpose: "drift_detection_only";
  chargebackCaseId: string;
  orderId: string;
  astrologerUserId: string;
  arcProviderAccountId: string;
  allocationStatus: "approved";
  sourceAuthority: ChargebackPrincipalAllocationAuthority;
  confirmedProviderEvidenceBinding: UnverifiedChargebackProviderEvidenceBinding;
  priorAllocationAuthorityRef: ChargebackPrincipalPostingPriorAllocationAuthorityRef | null;
  positionTransitionRef: ChargebackPrincipalPositionTransitionRef;
  disputedPrincipal: Money;
  payablePrincipal: Money;
  recoveryPrincipal: Money;
  platformPrincipal: Money;
  principalAllocationDelta: Money;
  nextAllocatedPrincipal: Money;
  unallocatedSuspense: Money;
  recoveryAllocations: readonly ChargebackRecoveryPostingAllocation[];
  platformAllocations: readonly ChargebackPlatformPostingAllocation[];
  approvedAt: string;
  canonicalDigest: FinanceAuthorizationPayloadHash;
}>;
