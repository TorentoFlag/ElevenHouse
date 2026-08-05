import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import type { FinanceJournalEntryInput } from "../journal";
import type { PayableLotReceiptDecoderEnvelope } from "../source-lot-operation-receipt";
import { readUnverifiedFinanceComponentSlotResolutionBindings } from "./component-slot-resolution";
import { assertFinanceJournalLinkProofMatchesOperationReceipt } from "./payable-lot-posting-link";
import { readFinancePostingReceiptDecoderEnvelope } from "./payable-lot-receipt-envelope";
import { FinancePostingIntegrityError, readExactDataRecord } from "./posting-codec";
import {
  normalizeFinancePostingDecoderEnvelope,
  type FinancePostingDecoderEnvelope
} from "./posting-decoder-envelope";
import { readFinanceJournalPostingContext } from "./posting-event-identity";
import { createUnverifiedFinanceJournalPostingRecipe } from "./posting-recipe";
import { readChargebackWonResolutionPostingAuthority } from "./chargeback-resolution-authority";
import { readChargebackResolutionHistory } from "./chargeback-resolution-history";
import { assertChargebackResolutionPlatformHistory } from "./chargeback-resolution-platform-history";
import {
  assertAndBuildChargebackWonResolutionComponents,
  assertChargebackResolutionOutcomeEvidence,
  assertChargebackWonResolutionReceipt
} from "./chargeback-resolution-proof";
import { projectUnverifiedReceiptLinkedPostingRows } from "./receipt-linked-posting-projection";
import type { UnverifiedFinancePostingRecipe } from "./posting-types";

type JournalRecipe = Extract<UnverifiedFinancePostingRecipe, { readonly kind: "journal" }>;

export function buildChargebackWonResolutionPosting(
  input: unknown,
  postingEnvelopeInput: FinancePostingDecoderEnvelope,
  receiptEnvelopeInput: PayableLotReceiptDecoderEnvelope
): JournalRecipe;
export function buildChargebackWonResolutionPosting(
  input: unknown,
  postingEnvelopeInput: unknown,
  receiptEnvelopeInput: unknown
): JournalRecipe {
  const envelope = normalizeFinancePostingDecoderEnvelope(postingEnvelopeInput);
  const receiptEnvelope = readFinancePostingReceiptDecoderEnvelope(receiptEnvelopeInput);
  const root = readExactDataRecord(input, [
    "context",
    "authority",
    "resolvedProviderConfirmationChain",
    "resolvedAllocationAuthorities",
    "resolvedPrincipalPositionTransitionBindings",
    "allocationJournals",
    "resolvedRecoveryAuthorities",
    "recoveryJournals",
    "originalPlatformJournals",
    "outcomeEvidence",
    "operationReceipt",
    "componentBindings",
    "operationSnapshotRef"
  ]);
  const context = readFinanceJournalPostingContext(root.context, envelope);
  const authority = readChargebackWonResolutionPostingAuthority(root.authority, envelope);
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
  assertChargebackResolutionOutcomeEvidence(authority, root.outcomeEvidence, envelope);
  assertChargebackResolutionPlatformHistory(root.originalPlatformJournals, history, envelope);
  const bindings = readUnverifiedFinanceComponentSlotResolutionBindings(
    root.componentBindings,
    envelope
  );
  if (authority.componentBindingsDigest !== hashFinanceCommandPayload(bindings)) {
    throw new FinancePostingIntegrityError("authority_mismatch");
  }
  const projection = projectUnverifiedReceiptLinkedPostingRows(
    { operationReceipt: root.operationReceipt, componentBindings: bindings },
    envelope,
    receiptEnvelope
  );
  assertChargebackWonResolutionReceipt(authority, projection);
  if (
    context.operationId !== projection.receipt.operationId ||
    context.sourceKey.kind !== "chargeback" ||
    context.sourceKey.operation !== "won" ||
    context.sourceKey.sourceId !== authority.chargebackCaseId ||
    context.occurredAt !== authority.decidedAt
  ) {
    throw new FinancePostingIntegrityError("source_mismatch");
  }
  const components = assertAndBuildChargebackWonResolutionComponents(authority, history);
  const principalComponentId = history.latestProviderEvidenceBinding.principalComponentId;
  const entries: FinanceJournalEntryInput[] = [
    {
      account: {
        code: "arc_provider_clearing",
        arcProviderAccountId: authority.arcProviderAccountId,
        currency: "RUB"
      },
      side: "debit",
      amount: authority.disputedPrincipal,
      links: {
        originalSaleId: authority.originalOrderId,
        componentId: principalComponentId,
        payableLotId: null,
        payoutAllocationId: null
      }
    },
    ...components.recovery.map((row) => ({
      account: {
        code: "astrologer_recovery_receivable" as const,
        astrologerUserId: authority.astrologerUserId,
        currency: "RUB" as const
      },
      side: "credit" as const,
      amount: { amountMinor: row.amountMinor, currency: "RUB" as const },
      links: {
        originalSaleId: row.originalSaleId,
        componentId: row.componentId,
        payableLotId: row.payableLotId,
        payoutAllocationId: row.payoutAllocationId
      }
    })),
    ...projection.rows.map((row) => row.entry),
    ...components.platform.map((row) => ({
      account: { code: row.accountCode, currency: "RUB" as const },
      side: "credit" as const,
      amount: row.amount,
      links: {
        originalSaleId: row.originalSaleId,
        componentId: row.componentId,
        payableLotId: null,
        payoutAllocationId: null
      }
    })),
    ...(authority.unallocatedSuspense.amountMinor === 0
      ? []
      : [
          {
            account: {
              code: "chargeback_principal_suspense" as const,
              arcProviderAccountId: authority.arcProviderAccountId,
              currency: "RUB" as const
            },
            side: "credit" as const,
            amount: authority.unallocatedSuspense,
            links: {
              originalSaleId: authority.originalOrderId,
              componentId: principalComponentId,
              payableLotId: null,
              payoutAllocationId: null
            }
          }
        ])
  ];
  const receiptOffset = 1 + components.recovery.length;
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
      entries,
      entrySourceLinks: entries.map((_, index) =>
        index >= receiptOffset && index < receiptOffset + projection.rows.length
          ? projection.rows[index - receiptOffset]!.sourceLink
          : null
      )
    },
    envelope
  );
  assertFinanceJournalLinkProofMatchesOperationReceipt(
    {
      proof: recipe.linkProof,
      operationReceipt: root.operationReceipt,
      componentBindings: bindings
    },
    envelope,
    receiptEnvelope
  );
  return recipe;
}
