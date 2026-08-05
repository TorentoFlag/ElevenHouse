import type { PayableLotReceiptDecoderEnvelope } from "../source-lot-operation-receipt";
import { readChargebackLostAllocationClosureAuthority } from "./chargeback-lost-closure-authority";
import { readChargebackLostClosureTransition } from "./chargeback-lost-closure-transition";
import { readChargebackLostResolutionPostingAuthority } from "./chargeback-resolution-authority";
import { readChargebackResolutionHistory } from "./chargeback-resolution-history";
import { assertChargebackResolutionOutcomeEvidence } from "./chargeback-resolution-proof";
import { readFinancePostingReceiptDecoderEnvelope } from "./payable-lot-receipt-envelope";
import {
  compareFinancePostingInstants,
  FinancePostingIntegrityError,
  readExactDataRecord,
  sameCanonicalFinancePostingValue
} from "./posting-codec";
import {
  normalizeFinancePostingDecoderEnvelope,
  type FinancePostingDecoderEnvelope
} from "./posting-decoder-envelope";
import { createUnverifiedFinanceNoPostingRecipe } from "./posting-recipe";
import type { UnverifiedFinancePostingRecipe } from "./posting-types";

type NoPostingRecipe = Extract<UnverifiedFinancePostingRecipe, { readonly kind: "no_posting" }>;

export function buildChargebackLostAllocationClosureNoPosting(
  input: unknown,
  envelopeInput: FinancePostingDecoderEnvelope,
  receiptEnvelopeInput: PayableLotReceiptDecoderEnvelope
): NoPostingRecipe {
  const envelope = normalizeFinancePostingDecoderEnvelope(envelopeInput);
  const receiptEnvelope = readFinancePostingReceiptDecoderEnvelope(receiptEnvelopeInput);
  const root = readExactDataRecord(input, [
    "authority",
    "resolvedPriorLostResolutionAuthority",
    "initialLostOutcomeEvidence",
    "restrictionTransition",
    "resolvedProviderConfirmationChain",
    "resolvedAllocationAuthorities",
    "resolvedPrincipalPositionTransitionBindings",
    "allocationJournals",
    "resolvedRecoveryAuthorities",
    "recoveryJournals"
  ]);
  const authority = readChargebackLostAllocationClosureAuthority(root.authority, envelope);
  const prior = readChargebackLostResolutionPostingAuthority(
    root.resolvedPriorLostResolutionAuthority,
    envelope
  );
  const transition = readChargebackLostClosureTransition(root.restrictionTransition);
  assertPriorResolution(authority, prior);
  if (
    !sameCanonicalFinancePostingValue(authority.restrictionTransitionRef, transition.ref) ||
    !sameCanonicalFinancePostingValue(authority.sourceAuthority, transition.sourceAuthority)
  ) {
    mismatch("authority_mismatch");
  }
  assertChargebackResolutionOutcomeEvidence(prior, root.initialLostOutcomeEvidence, envelope);
  const history = readChargebackResolutionHistory(
    authority,
    root.resolvedProviderConfirmationChain,
    root.resolvedAllocationAuthorities,
    root.resolvedPrincipalPositionTransitionBindings,
    root.allocationJournals,
    authority.recoveryRefs,
    root.resolvedRecoveryAuthorities,
    root.recoveryJournals,
    envelope,
    receiptEnvelope
  );
  assertHistoryExtendsPrior(authority, prior, history);
  return createUnverifiedFinanceNoPostingRecipe(
    {
      eventKey: {
        kind: "chargeback_state",
        sourceId: authority.chargebackCaseId,
        operation: "lost_allocation_closed"
      },
      reason: "chargeback_state_only",
      authorityRef: {
        kind: authority.kind,
        authorityId: authority.authorityId,
        version: authority.version,
        canonicalDigest: authority.canonicalDigest
      },
      operationSnapshotRef: null
    },
    envelope
  );
}

function assertPriorResolution(
  current: ReturnType<typeof readChargebackLostAllocationClosureAuthority>,
  prior: ReturnType<typeof readChargebackLostResolutionPostingAuthority>
): void {
  const ref = current.priorLostResolutionRef;
  if (
    ref.authorityId !== prior.authorityId ||
    ref.version !== prior.version ||
    ref.canonicalDigest !== prior.canonicalDigest ||
    prior.resultingRestrictionStatus !== "allocation_blocked" ||
    prior.unallocatedSuspense.amountMinor === 0 ||
    !sameCanonicalFinancePostingValue(current.initialLostOutcomeRef, prior.outcomeEvidenceRef) ||
    current.chargebackCaseId !== prior.chargebackCaseId ||
    current.originalOrderId !== prior.originalOrderId ||
    current.astrologerUserId !== prior.astrologerUserId ||
    current.arcProviderAccountId !== prior.arcProviderAccountId ||
    current.providerPaymentId !== prior.providerPaymentId ||
    current.version <= prior.version ||
    current.sourceAuthority.accountingAllocationVersion <=
      prior.sourceAuthority.accountingAllocationVersion ||
    current.sourceAuthority.accountingAllocationId ===
      prior.sourceAuthority.accountingAllocationId ||
    compareFinancePostingInstants(current.decidedAt, prior.decidedAt) < 0
  ) {
    mismatch("authority_mismatch");
  }
}

function assertHistoryExtendsPrior(
  current: ReturnType<typeof readChargebackLostAllocationClosureAuthority>,
  prior: ReturnType<typeof readChargebackLostResolutionPostingAuthority>,
  history: ReturnType<typeof readChargebackResolutionHistory>
): void {
  if (
    prior.allocationRefs.some(
      (reference, index) =>
        !sameCanonicalFinancePostingValue(reference, current.allocationRefs[index])
    ) ||
    prior.recoveryRefs.some(
      (reference, index) =>
        !sameCanonicalFinancePostingValue(reference, current.recoveryRefs[index])
    ) ||
    !history.allocations.some(
      (allocation) =>
        allocation.confirmedProviderEvidenceBinding.bindingId ===
          prior.latestProviderBindingRef.bindingId &&
        allocation.confirmedProviderEvidenceBinding.bindingDigest ===
          prior.latestProviderBindingRef.canonicalDigest
    )
  ) {
    mismatch("authority_mismatch");
  }
}

function mismatch(reason: ConstructorParameters<typeof FinancePostingIntegrityError>[0]): never {
  throw new FinancePostingIntegrityError(reason);
}
