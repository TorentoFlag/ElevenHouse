import { readChargebackLostResolutionPostingAuthority } from "./chargeback-resolution-authority";
import type { PayableLotReceiptDecoderEnvelope } from "../source-lot-operation-receipt";
import { readFinancePostingReceiptDecoderEnvelope } from "./payable-lot-receipt-envelope";
import { readChargebackResolutionHistory } from "./chargeback-resolution-history";
import { assertChargebackResolutionOutcomeEvidence } from "./chargeback-resolution-proof";
import { readExactDataRecord } from "./posting-codec";
import {
  normalizeFinancePostingDecoderEnvelope,
  type FinancePostingDecoderEnvelope
} from "./posting-decoder-envelope";
import { createUnverifiedFinanceNoPostingRecipe } from "./posting-recipe";
import type { UnverifiedFinancePostingRecipe } from "./posting-types";

type NoPostingRecipe = Extract<UnverifiedFinancePostingRecipe, { readonly kind: "no_posting" }>;

export function buildChargebackLostResolutionNoPosting(
  input: unknown,
  envelopeInput: FinancePostingDecoderEnvelope,
  receiptEnvelopeInput: PayableLotReceiptDecoderEnvelope
): NoPostingRecipe;
export function buildChargebackLostResolutionNoPosting(
  input: unknown,
  envelopeInput: unknown,
  receiptEnvelopeInput: unknown
): NoPostingRecipe {
  const envelope = normalizeFinancePostingDecoderEnvelope(envelopeInput);
  const receiptEnvelope = readFinancePostingReceiptDecoderEnvelope(receiptEnvelopeInput);
  const root = readExactDataRecord(input, [
    "authority",
    "resolvedProviderConfirmationChain",
    "resolvedAllocationAuthorities",
    "resolvedPrincipalPositionTransitionBindings",
    "allocationJournals",
    "resolvedRecoveryAuthorities",
    "recoveryJournals",
    "outcomeEvidence"
  ]);
  const authority = readChargebackLostResolutionPostingAuthority(root.authority, envelope);
  readChargebackResolutionHistory(
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
  assertChargebackResolutionOutcomeEvidence(authority, root.outcomeEvidence, envelope);
  return createUnverifiedFinanceNoPostingRecipe(
    {
      eventKey: {
        kind: "chargeback_state",
        sourceId: authority.chargebackCaseId,
        operation: "lost_outcome_recorded"
      },
      reason: "chargeback_outcome_only",
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
