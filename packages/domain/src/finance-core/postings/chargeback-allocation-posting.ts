import type { PayableLotReceiptDecoderEnvelope } from "../source-lot-operation-receipt";
import { readFinancePostingReceiptDecoderEnvelope } from "./payable-lot-receipt-envelope";
import { assertChargebackAllocationReceipt } from "./chargeback-allocation-receipt";
import { readAndAssertChargebackOriginalPlatformJournals } from "./chargeback-original-platform-journal";
import { FinancePostingIntegrityError, readExactDataRecord } from "./posting-codec";
import {
  normalizeFinancePostingDecoderEnvelope,
  type FinancePostingDecoderEnvelope
} from "./posting-decoder-envelope";
import { readFinanceJournalPostingContext } from "./posting-event-identity";
import { createUnverifiedFinanceJournalPostingRecipe } from "./posting-recipe";
import { readChargebackPrincipalPostingAllocationAuthority } from "./chargeback-posting-allocation";
import { assertChargebackPrincipalPostingPriorAuthorityResolved } from "./chargeback-posting-prior-allocation";
import {
  assertChargebackPrincipalPriorChainsAligned,
  assertChargebackPrincipalPositionPriorResolved,
  readUnverifiedChargebackPrincipalPositionTransitionBinding
} from "./chargeback-principal-position";
import { assertChargebackPrincipalPositionMatchesAllocation } from "./chargeback-principal-position-allocation";
import { readChargebackProviderReceiptBinding } from "./chargeback-provider-receipt-binding";
import { assertFinanceJournalLinkProofMatchesOperationReceipt } from "./payable-lot-posting-link";
import { projectUnverifiedReceiptLinkedPostingRows } from "./receipt-linked-posting-projection";
import type {
  FinancePostingOperationSnapshotRef,
  UnverifiedFinancePostingRecipe
} from "./posting-types";

export { FinancePostingIntegrityError } from "./posting-codec";

type JournalRecipe = Extract<UnverifiedFinancePostingRecipe, { readonly kind: "journal" }>;

export function buildChargebackPrincipalAllocationPosting(
  input: {
    readonly context: Parameters<typeof readFinanceJournalPostingContext>[0];
    readonly allocationAuthority: unknown;
    readonly resolvedPriorAllocationAuthority: unknown | null;
    readonly principalPositionTransitionBinding: unknown;
    readonly resolvedPriorPrincipalPositionTransitionBinding: unknown | null;
    readonly providerConfirmationOperationReceipt: unknown;
    readonly providerConfirmationComponentBindings: unknown;
    readonly allocationOperationReceipt: unknown;
    readonly allocationComponentBindings: unknown;
    readonly operationSnapshotRef: unknown;
    readonly originalPlatformJournals: unknown;
  },
  postingDecoderEnvelopeInput: FinancePostingDecoderEnvelope,
  receiptDecoderEnvelopeInput: PayableLotReceiptDecoderEnvelope
): JournalRecipe;
export function buildChargebackPrincipalAllocationPosting(
  input: unknown,
  postingDecoderEnvelopeInput: unknown,
  receiptDecoderEnvelopeInput: unknown
): JournalRecipe {
  const postingEnvelope = normalizeFinancePostingDecoderEnvelope(postingDecoderEnvelopeInput);
  const receiptEnvelope = readReceiptEnvelope(receiptDecoderEnvelopeInput);
  const root = readExactDataRecord(input, [
    "context",
    "allocationAuthority",
    "resolvedPriorAllocationAuthority",
    "principalPositionTransitionBinding",
    "resolvedPriorPrincipalPositionTransitionBinding",
    "providerConfirmationOperationReceipt",
    "providerConfirmationComponentBindings",
    "allocationOperationReceipt",
    "allocationComponentBindings",
    "operationSnapshotRef",
    "originalPlatformJournals"
  ]);
  const context = readFinanceJournalPostingContext(root.context, postingEnvelope);
  const authority = readChargebackPrincipalPostingAllocationAuthority(
    root.allocationAuthority,
    postingEnvelope
  );
  const resolvedPrior =
    root.resolvedPriorAllocationAuthority === null
      ? null
      : readChargebackPrincipalPostingAllocationAuthority(
          root.resolvedPriorAllocationAuthority,
          postingEnvelope
        );
  assertChargebackPrincipalPostingPriorAuthorityResolved(authority, resolvedPrior);
  const principalPosition = readUnverifiedChargebackPrincipalPositionTransitionBinding(
    root.principalPositionTransitionBinding,
    postingEnvelope
  );
  const priorPrincipalPosition =
    root.resolvedPriorPrincipalPositionTransitionBinding === null
      ? null
      : readUnverifiedChargebackPrincipalPositionTransitionBinding(
          root.resolvedPriorPrincipalPositionTransitionBinding,
          postingEnvelope
        );
  assertChargebackPrincipalPositionPriorResolved(principalPosition, priorPrincipalPosition);
  assertChargebackPrincipalPriorChainsAligned(
    authority,
    resolvedPrior,
    principalPosition,
    priorPrincipalPosition
  );
  readChargebackProviderReceiptBinding(
    {
      providerEvidenceBinding: authority.confirmedProviderEvidenceBinding,
      operationReceipt: root.providerConfirmationOperationReceipt,
      componentBindings: root.providerConfirmationComponentBindings
    },
    postingEnvelope,
    receiptEnvelope
  );
  const projection = projectUnverifiedReceiptLinkedPostingRows(
    {
      operationReceipt: root.allocationOperationReceipt,
      componentBindings: root.allocationComponentBindings
    },
    postingEnvelope,
    receiptEnvelope
  );
  if (
    projection.receipt.operationId !== context.operationId ||
    projection.receipt.occurredAt !== context.occurredAt
  ) {
    throw new FinancePostingIntegrityError("proof_operation_receipt_mismatch");
  }
  assertChargebackAllocationReceipt(projection, authority);
  assertChargebackPrincipalPositionMatchesAllocation(principalPosition, authority, projection);
  readAndAssertChargebackOriginalPlatformJournals(
    root.originalPlatformJournals,
    authority.platformAllocations,
    principalPosition.platformPositions,
    authority.approvedAt,
    postingEnvelope
  );
  const recipe = createAllocationRecipe(
    context,
    authority,
    projection,
    root.operationSnapshotRef as FinancePostingOperationSnapshotRef,
    postingEnvelope
  );
  assertFinanceJournalLinkProofMatchesOperationReceipt(
    {
      proof: recipe.linkProof,
      operationReceipt: root.allocationOperationReceipt,
      componentBindings: root.allocationComponentBindings as never
    },
    postingEnvelope,
    receiptEnvelope
  );
  return recipe;
}

function createAllocationRecipe(
  context: ReturnType<typeof readFinanceJournalPostingContext>,
  authority: ReturnType<typeof readChargebackPrincipalPostingAllocationAuthority>,
  projection: ReturnType<typeof projectUnverifiedReceiptLinkedPostingRows>,
  operationSnapshotRef: FinancePostingOperationSnapshotRef,
  envelope: FinancePostingDecoderEnvelope
): JournalRecipe {
  const recoveryEntries = authority.recoveryAllocations.map((row) => ({
    account: {
      code: "astrologer_recovery_receivable" as const,
      astrologerUserId: authority.astrologerUserId,
      currency: "RUB" as const
    },
    side: "debit" as const,
    amount: row.amount,
    links: {
      originalSaleId: row.originalSaleId,
      componentId: row.componentId,
      payableLotId: row.payableLotId,
      payoutAllocationId: row.payoutAllocationId
    }
  }));
  const platformEntries = authority.platformAllocations.map((row) => ({
    account: { code: row.accountCode, currency: "RUB" as const },
    side: "debit" as const,
    amount: row.amount,
    links: {
      originalSaleId: row.originalSaleId,
      componentId: row.componentId,
      payableLotId: null,
      payoutAllocationId: null
    }
  }));
  return createUnverifiedFinanceJournalPostingRecipe(
    {
      context,
      authorityRef: {
        kind: authority.kind,
        authorityId: authority.authorityId,
        version: authority.version,
        canonicalDigest: authority.canonicalDigest
      },
      sourceEvidenceRef: projection.sourceEvidenceRef,
      operationSnapshotRef,
      entries: [
        ...projection.rows.map((row) => row.entry),
        ...recoveryEntries,
        ...platformEntries,
        {
          account: {
            code: "chargeback_principal_suspense",
            arcProviderAccountId: authority.arcProviderAccountId,
            currency: "RUB"
          },
          side: "credit",
          amount: authority.principalAllocationDelta,
          links: {
            originalSaleId: authority.orderId,
            componentId: authority.confirmedProviderEvidenceBinding.principalComponentId,
            payableLotId: null,
            payoutAllocationId: null
          }
        }
      ],
      entrySourceLinks: [
        ...projection.rows.map((row) => row.sourceLink),
        ...recoveryEntries.map(() => null),
        ...platformEntries.map(() => null),
        null
      ]
    },
    envelope
  );
}

function readReceiptEnvelope(input: unknown): PayableLotReceiptDecoderEnvelope {
  return readFinancePostingReceiptDecoderEnvelope(input);
}
