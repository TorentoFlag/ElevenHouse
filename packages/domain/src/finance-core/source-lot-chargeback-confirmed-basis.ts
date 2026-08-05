import { digestValue } from "./source-lot-operation-receipt-core";
import { sameProviderAccountIdentityBinding } from "./provider-account-binding";
import type {
  ChargebackConfirmedAuthority,
  ChargebackPrincipalAllocationAuthority,
  ChargebackRestriction,
  PayableLotReferenceState
} from "./source-lot-types";
import { sameMoney } from "./source-lot-validation";

export function latestChargebackConfirmation(
  state: PayableLotReferenceState,
  chargebackCaseId: string
): ChargebackConfirmedAuthority | null {
  const record = state.history
    .filter(
      (candidate) =>
        candidate.previousVersion < state.version &&
        candidate.kind === "chargeback_confirmed" &&
        candidate.authority?.kind === "chargeback_confirmed" &&
        candidate.authority.chargebackCaseId === chargebackCaseId
    )
    .at(-1);
  return record?.authority?.kind === "chargeback_confirmed" ? record.authority : null;
}

export function chargebackPrincipalConfirmedBasisMatches(
  allocation: ChargebackPrincipalAllocationAuthority,
  restriction: ChargebackRestriction,
  confirmation: ChargebackConfirmedAuthority | null
): boolean {
  if (!confirmation) return false;
  const basis = allocation.confirmedBasis;
  return (
    restriction.chargebackCaseId === allocation.chargebackCaseId &&
    restriction.orderId === allocation.orderId &&
    restriction.astrologerUserId === allocation.astrologerUserId &&
    restriction.restrictionId === confirmation.restrictionId &&
    restriction.providerAccountId === confirmation.providerAccount.providerAccountId &&
    restriction.providerPaymentId === confirmation.providerPaymentId &&
    sameMoney(restriction.disputedAmount, confirmation.nextCumulativeDisputedAmount) &&
    confirmation.chargebackCaseId === allocation.chargebackCaseId &&
    confirmation.orderId === allocation.orderId &&
    confirmation.astrologerUserId === allocation.astrologerUserId &&
    basis.restrictionId === restriction.restrictionId &&
    basis.restrictionVersion === restriction.version &&
    basis.confirmationAuthorityId === confirmation.authorityId &&
    basis.confirmationAuthorityVersion === confirmation.version &&
    basis.confirmationId === confirmation.confirmationId &&
    basis.confirmationAuthorityDigest === digestValue(confirmation) &&
    basis.canonicalEvidenceId === confirmation.canonicalEvidenceId &&
    sameProviderAccountIdentityBinding(basis.providerAccount, confirmation.providerAccount) &&
    basis.providerPaymentId === confirmation.providerPaymentId &&
    sameMoney(basis.cumulativeDisputedAmount, confirmation.nextCumulativeDisputedAmount) &&
    basis.confirmedAt === confirmation.confirmedAt
  );
}
