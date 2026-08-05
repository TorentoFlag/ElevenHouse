import type { PayableLotReceiptDecoderEnvelope } from "../source-lot-operation-receipt";
import { readFinancePostingReceiptDecoderEnvelope } from "./payable-lot-receipt-envelope";
import { assertFinanceJournalLinkProofMatchesOperationReceipt } from "./payable-lot-posting-link";
import { FinancePostingIntegrityError, readExactDataRecord } from "./posting-codec";
import {
  normalizeFinancePostingDecoderEnvelope,
  type FinancePostingDecoderEnvelope
} from "./posting-decoder-envelope";
import { readFinanceJournalPostingContext } from "./posting-event-identity";
import { createUnverifiedFinanceJournalPostingRecipe } from "./posting-recipe";
import { readChargebackProviderReceiptBinding } from "./chargeback-provider-receipt-binding";
import type {
  FinancePostingOperationSnapshotRef,
  UnverifiedFinanceComponentSlotResolutionBinding,
  UnverifiedFinancePostingRecipe
} from "./posting-types";

export { FinancePostingIntegrityError } from "./posting-codec";

type JournalRecipe = Extract<UnverifiedFinancePostingRecipe, { readonly kind: "journal" }>;

export function buildChargebackPrincipalConfirmedPosting(
  input: {
    readonly context: Parameters<typeof readFinanceJournalPostingContext>[0];
    readonly providerEvidenceBinding: unknown;
    readonly operationReceipt: unknown;
    readonly operationSnapshotRef: unknown;
    readonly componentBindings: readonly UnverifiedFinanceComponentSlotResolutionBinding[];
  },
  postingDecoderEnvelopeInput: FinancePostingDecoderEnvelope,
  receiptDecoderEnvelopeInput: PayableLotReceiptDecoderEnvelope
): JournalRecipe;
export function buildChargebackPrincipalConfirmedPosting(
  input: unknown,
  postingDecoderEnvelopeInput: unknown,
  receiptDecoderEnvelopeInput: unknown
): JournalRecipe {
  const postingEnvelope = normalizeFinancePostingDecoderEnvelope(postingDecoderEnvelopeInput);
  const receiptEnvelope = readReceiptEnvelope(receiptDecoderEnvelopeInput);
  const root = readExactDataRecord(input, [
    "context",
    "providerEvidenceBinding",
    "operationReceipt",
    "operationSnapshotRef",
    "componentBindings"
  ]);
  const context = readFinanceJournalPostingContext(root.context, postingEnvelope);
  const { binding, projection } = readChargebackProviderReceiptBinding(
    {
      providerEvidenceBinding: root.providerEvidenceBinding,
      operationReceipt: root.operationReceipt,
      componentBindings: root.componentBindings
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
  const source = binding.sourceAuthority;
  const links = Object.freeze({
    originalSaleId: source.orderId,
    componentId: binding.principalComponentId,
    payableLotId: null,
    payoutAllocationId: null
  });
  const amount = binding.providerEvidence.amount;
  const recipe = createUnverifiedFinanceJournalPostingRecipe(
    {
      context,
      authorityRef: {
        kind: source.kind,
        authorityId: source.authorityId,
        version: source.version,
        canonicalDigest: binding.sourceAuthorityDigest
      },
      sourceEvidenceRef: projection.sourceEvidenceRef,
      operationSnapshotRef: root.operationSnapshotRef as FinancePostingOperationSnapshotRef,
      entrySourceLinks: [null, null],
      entries: [
        {
          account: {
            code: "chargeback_principal_suspense",
            arcProviderAccountId: source.providerAccount.providerAccountId,
            currency: "RUB"
          },
          side: "debit",
          amount,
          links
        },
        {
          account: {
            code: "arc_provider_clearing",
            arcProviderAccountId: source.providerAccount.providerAccountId,
            currency: "RUB"
          },
          side: "credit",
          amount,
          links
        }
      ]
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

function readReceiptEnvelope(input: unknown): PayableLotReceiptDecoderEnvelope {
  return readFinancePostingReceiptDecoderEnvelope(input);
}
