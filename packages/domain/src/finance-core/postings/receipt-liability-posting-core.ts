import type { FinanceJournalEntryInput } from "../journal";
import type {
  PayableLotOperationReceipt,
  PayableLotReceiptDecoderEnvelope
} from "../source-lot-operation-receipt";
import {
  assertPayableLotPostingBindingMatchesReceipt,
  readUnverifiedPayableLotPostingAuthorityBinding
} from "./hold-payout-receipt-binding";
import { assertFinanceJournalLinkProofMatchesOperationReceipt } from "./payable-lot-posting-link";
import {
  FinancePostingIntegrityError,
  readExactDataRecord,
  sameFinancePostingSourceKey
} from "./posting-codec";
import {
  normalizeFinancePostingDecoderEnvelope,
  type FinancePostingDecoderEnvelope
} from "./posting-decoder-envelope";
import {
  readFinanceJournalPostingContext,
  type FinanceJournalPostingContext
} from "./posting-event-identity";
import { createUnverifiedFinanceJournalPostingRecipe } from "./posting-recipe";
import type { UnverifiedPayableLotPostingAuthorityBinding } from "./hold-payout-posting-types";
import type {
  FinancePostingAuthorityRef,
  FinancePostingEntrySourceLink,
  UnverifiedFinanceComponentSlotResolutionBinding,
  UnverifiedFinancePostingRecipe
} from "./posting-types";
import { readFinancePostingReceiptDecoderEnvelope } from "./payable-lot-receipt-envelope";
import {
  projectUnverifiedReceiptLinkedPostingRows,
  type UnverifiedReceiptLinkedPostingRow
} from "./receipt-linked-posting-projection";

type JournalRecipe = Extract<UnverifiedFinancePostingRecipe, { readonly kind: "journal" }>;

export type ReceiptPostingPrepared = Readonly<{
  context: FinanceJournalPostingContext;
  receiptBinding: UnverifiedPayableLotPostingAuthorityBinding;
  receipt: PayableLotOperationReceipt;
  rows: readonly UnverifiedReceiptLinkedPostingRow[];
  sourceEvidenceRef: ReturnType<
    typeof projectUnverifiedReceiptLinkedPostingRows
  >["sourceEvidenceRef"];
  componentBindings: readonly UnverifiedFinanceComponentSlotResolutionBinding[];
  operationSnapshotRef: unknown;
}>;

export function normalizeReceiptPostingEnvelopes(
  postingInput: unknown,
  receiptInput: unknown
): Readonly<{
  posting: FinancePostingDecoderEnvelope;
  receipt: PayableLotReceiptDecoderEnvelope;
}> {
  const posting = normalizeFinancePostingDecoderEnvelope(postingInput);
  return Object.freeze({
    posting,
    receipt: readFinancePostingReceiptDecoderEnvelope(receiptInput)
  });
}

export function prepareReceiptPosting(
  input: {
    readonly context: unknown;
    readonly receiptBinding: unknown;
    readonly operationReceipt: unknown;
    readonly componentBindings: unknown;
    readonly operationSnapshotRef: unknown;
  },
  expectedOperationKind: PayableLotOperationReceipt["operationKind"],
  envelopes: ReturnType<typeof normalizeReceiptPostingEnvelopes>
): ReceiptPostingPrepared {
  const context = readFinanceJournalPostingContext(input.context, envelopes.posting);
  const projection = projectUnverifiedReceiptLinkedPostingRows(
    {
      operationReceipt: input.operationReceipt,
      componentBindings: input.componentBindings
    },
    envelopes.posting,
    envelopes.receipt
  );
  const receiptBinding = readUnverifiedPayableLotPostingAuthorityBinding(
    input.receiptBinding,
    envelopes.posting
  );
  assertPayableLotPostingBindingMatchesReceipt(receiptBinding, projection.receipt);
  if (
    projection.receipt.operationKind !== expectedOperationKind ||
    context.operationId !== projection.receipt.operationId ||
    context.occurredAt !== projection.receipt.occurredAt ||
    !sameFinancePostingSourceKey(context.sourceKey, projection.receipt.sourceKey)
  ) {
    throw new FinancePostingIntegrityError("authority_mismatch");
  }
  const componentBindings = readComponentBindings(input.componentBindings);
  return Object.freeze({
    context,
    receiptBinding,
    receipt: projection.receipt,
    rows: projection.rows,
    sourceEvidenceRef: projection.sourceEvidenceRef,
    componentBindings,
    operationSnapshotRef: input.operationSnapshotRef
  });
}

export function buildReceiptPostingRecipe(
  prepared: ReceiptPostingPrepared,
  authorityRef: FinancePostingAuthorityRef,
  envelopes: ReturnType<typeof normalizeReceiptPostingEnvelopes>,
  extras: readonly FinanceJournalEntryInput[] = [],
  extrasFirst = false
): JournalRecipe {
  const linkedEntries = prepared.rows.map((row) => row.entry);
  const linkedSources = prepared.rows.map((row) => row.sourceLink);
  const nullSources = extras.map(() => null);
  const entries = extrasFirst ? [...extras, ...linkedEntries] : [...linkedEntries, ...extras];
  const entrySourceLinks: readonly (FinancePostingEntrySourceLink | null)[] = extrasFirst
    ? [...nullSources, ...linkedSources]
    : [...linkedSources, ...nullSources];
  const recipe = createUnverifiedFinanceJournalPostingRecipe(
    {
      context: prepared.context,
      authorityRef,
      sourceEvidenceRef: prepared.sourceEvidenceRef,
      operationSnapshotRef: prepared.operationSnapshotRef as never,
      entries,
      entrySourceLinks
    },
    envelopes.posting
  );
  assertFinanceJournalLinkProofMatchesOperationReceipt(
    {
      proof: recipe.linkProof,
      operationReceipt: prepared.receipt,
      componentBindings: prepared.componentBindings
    },
    envelopes.posting,
    envelopes.receipt
  );
  return recipe;
}

export const emptyJournalLinks = Object.freeze({
  originalSaleId: null,
  componentId: null,
  payableLotId: null,
  payoutAllocationId: null
});

export function receiptAuthorityRef(
  binding: UnverifiedPayableLotPostingAuthorityBinding
): FinancePostingAuthorityRef {
  return Object.freeze({
    kind: binding.kind,
    authorityId: binding.bindingId,
    version: binding.version,
    canonicalDigest: binding.bindingDigest
  });
}

export function sumReceiptRows(prepared: ReceiptPostingPrepared, side: "debit" | "credit"): number {
  return prepared.rows.reduce(
    (sum, row) => sum + (row.entry.side === side ? row.entry.amount.amountMinor : 0),
    0
  );
}

function readComponentBindings(
  input: unknown
): readonly UnverifiedFinanceComponentSlotResolutionBinding[] {
  if (!Array.isArray(input)) throw new FinancePostingIntegrityError("invalid_shape");
  return input as readonly UnverifiedFinanceComponentSlotResolutionBinding[];
}

export function readReceiptPostingRoot(input: unknown) {
  return readExactDataRecord(input, [
    "context",
    "receiptBinding",
    "operationReceipt",
    "componentBindings",
    "operationSnapshotRef"
  ]);
}
