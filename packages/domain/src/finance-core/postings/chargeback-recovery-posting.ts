import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import type { PayableLotReceiptDecoderEnvelope } from "../source-lot-operation-receipt";
import { assertFinanceJournalLinkProofMatchesOperationReceipt } from "./payable-lot-posting-link";
import { readFinancePostingReceiptDecoderEnvelope } from "./payable-lot-receipt-envelope";
import { FinancePostingIntegrityError, readExactDataRecord } from "./posting-codec";
import {
  normalizeFinancePostingDecoderEnvelope,
  type FinancePostingDecoderEnvelope
} from "./posting-decoder-envelope";
import { readFinanceJournalPostingContext } from "./posting-event-identity";
import { createUnverifiedFinanceJournalPostingRecipe } from "./posting-recipe";
import { readChargebackRecoveryPostingAllocationAuthority } from "./chargeback-recovery-posting-authority";
import { assertChargebackRecoveryAllocationHistory } from "./chargeback-recovery-posting-proof";
import { readChargebackRecoveryPriorHistory } from "./chargeback-recovery-prior-history";
import {
  assertChargebackRecoveryOutcome,
  assertChargebackRecoveryReceipt
} from "./chargeback-recovery-posting-source-proof";
import { projectUnverifiedReceiptLinkedPostingRows } from "./receipt-linked-posting-projection";
import type { UnverifiedFinancePostingRecipe } from "./posting-types";

type JournalRecipe = Extract<UnverifiedFinancePostingRecipe, { readonly kind: "journal" }>;

export function buildChargebackRecoveryCollectionPosting(
  input: unknown,
  postingEnvelopeInput: FinancePostingDecoderEnvelope,
  receiptEnvelopeInput: PayableLotReceiptDecoderEnvelope
): JournalRecipe;
export function buildChargebackRecoveryCollectionPosting(
  input: unknown,
  postingEnvelopeInput: unknown,
  receiptEnvelopeInput: unknown
): JournalRecipe {
  const postingEnvelope = normalizeFinancePostingDecoderEnvelope(postingEnvelopeInput);
  const receiptEnvelope = readFinancePostingReceiptDecoderEnvelope(receiptEnvelopeInput);
  const root = readExactDataRecord(input, [
    "context",
    "authority",
    "resolvedPriorAuthorities",
    "resolvedAllocationAuthorities",
    "resolvedPrincipalPositionTransitionBindings",
    "originalAllocationJournals",
    "latestOutcomeEvidence",
    "operationReceipt",
    "componentBindings",
    "operationSnapshotRef"
  ]);
  const context = readFinanceJournalPostingContext(root.context, postingEnvelope);
  const authority = readChargebackRecoveryPostingAllocationAuthority(
    root.authority,
    postingEnvelope
  );
  readChargebackRecoveryPriorHistory(authority, root.resolvedPriorAuthorities, postingEnvelope);
  assertChargebackRecoveryAllocationHistory(
    authority,
    root.resolvedAllocationAuthorities,
    root.resolvedPrincipalPositionTransitionBindings,
    root.originalAllocationJournals,
    postingEnvelope
  );
  assertChargebackRecoveryOutcome(authority, root.latestOutcomeEvidence, postingEnvelope);
  const projection = projectUnverifiedReceiptLinkedPostingRows(
    { operationReceipt: root.operationReceipt, componentBindings: root.componentBindings },
    postingEnvelope,
    receiptEnvelope
  );
  if (authority.componentBindingsDigest !== hashFinanceCommandPayload(root.componentBindings)) {
    throw new FinancePostingIntegrityError("authority_mismatch");
  }
  assertChargebackRecoveryReceipt(authority, projection);
  if (context.operationId !== projection.receipt.operationId) {
    throw new FinancePostingIntegrityError("source_mismatch");
  }
  const recipe = createUnverifiedFinanceJournalPostingRecipe(
    {
      context,
      authorityRef: {
        kind: authority.kind,
        authorityId: authority.authorityId,
        version: authority.version,
        canonicalDigest: authority.canonicalDigest
      },
      sourceEvidenceRef: projection.sourceEvidenceRef,
      operationSnapshotRef: root.operationSnapshotRef as never,
      entries: projection.rows.map((row) => row.entry),
      entrySourceLinks: projection.rows.map((row) => row.sourceLink)
    },
    postingEnvelope
  );
  assertFinanceJournalLinkProofMatchesOperationReceipt(
    {
      proof: recipe.linkProof,
      operationReceipt: root.operationReceipt,
      componentBindings: root.componentBindings as never
    },
    postingEnvelope,
    receiptEnvelope
  );
  return recipe;
}
