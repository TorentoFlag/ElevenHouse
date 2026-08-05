import type { PayableLotReceiptDecoderEnvelope } from "../source-lot-operation-receipt";
import { rehydrateFinanceJournalLinkProof } from "./journal-link-proof";
import {
  FinancePostingIntegrityError,
  readExactDataRecord,
  sameCanonicalFinancePostingValue,
  sameFinancePostingSourceKey
} from "./posting-codec";
import {
  normalizeFinancePostingDecoderEnvelope,
  type FinancePostingDecoderEnvelope
} from "./posting-decoder-envelope";
import type { UnverifiedFinanceComponentSlotResolutionBinding } from "./posting-types";
import { readFinancePostingReceiptDecoderEnvelope } from "./payable-lot-receipt-envelope";
import { projectUnverifiedReceiptLinkedPostingRows } from "./receipt-linked-posting-projection";

/**
 * Consistency-only comparison; it grants neither authorization nor atomicity.
 * The adapter must enforce a serialized byte cap before parsing the receipt and
 * pass both trusted out-of-band decoder envelopes separately from the target
 * input. A serialized byte cap remains an adapter responsibility before parse.
 */
export function assertFinanceJournalLinkProofMatchesOperationReceipt(
  input: {
    readonly proof: unknown;
    readonly operationReceipt: unknown;
    readonly componentBindings: readonly UnverifiedFinanceComponentSlotResolutionBinding[];
  },
  postingDecoderEnvelopeInput: FinancePostingDecoderEnvelope,
  receiptDecoderEnvelopeInput: PayableLotReceiptDecoderEnvelope
): void;
export function assertFinanceJournalLinkProofMatchesOperationReceipt(
  input: unknown,
  postingDecoderEnvelopeInput: unknown,
  receiptDecoderEnvelopeInput: unknown
): void {
  const postingDecoderEnvelope = normalizeFinancePostingDecoderEnvelope(
    postingDecoderEnvelopeInput
  );
  const receiptDecoderEnvelope = readFinancePostingReceiptDecoderEnvelope(
    receiptDecoderEnvelopeInput
  );
  const root = readExactDataRecord(input, ["proof", "operationReceipt", "componentBindings"]);
  let proof;
  try {
    proof = rehydrateFinanceJournalLinkProof(root.proof, postingDecoderEnvelope);
  } catch {
    throw new FinancePostingIntegrityError("proof_operation_receipt_mismatch");
  }
  const projection = projectUnverifiedReceiptLinkedPostingRows(
    {
      operationReceipt: root.operationReceipt,
      componentBindings: root.componentBindings
    },
    postingDecoderEnvelope,
    receiptDecoderEnvelope
  );
  const { receipt, rows, sourceEvidenceRef } = projection;
  if (
    !sameCanonicalFinancePostingValue(proof.sourceEvidenceRef, sourceEvidenceRef) ||
    proof.operationId !== receipt.operationId ||
    !sameFinancePostingSourceKey(proof.journalSourceKey, receipt.sourceKey) ||
    proof.operationSnapshotRef === null ||
    proof.operationSnapshotRef.operationId !== receipt.operationId ||
    !sameFinancePostingSourceKey(proof.operationSnapshotRef.sourceKey, receipt.sourceKey) ||
    proof.operationSnapshotRef.historyRecordDigest !== receipt.historyRecord.canonicalDigest ||
    proof.operationSnapshotRef.previousLotStateDigest !== receipt.previousLotState.digest ||
    proof.operationSnapshotRef.nextLotStateDigest !== receipt.nextLotState.digest
  ) {
    throw new FinancePostingIntegrityError("proof_operation_receipt_mismatch");
  }

  const linkedEdges = proof.edges.filter((edge) => edge.semanticEdgeId !== null);
  if (linkedEdges.length !== rows.length) {
    throw new FinancePostingIntegrityError("proof_operation_receipt_mismatch");
  }
  const edgesByEffectId = new Map(
    linkedEdges.map((edge) => [edge.semanticEdgeId as string, edge] as const)
  );
  if (edgesByEffectId.size !== linkedEdges.length) {
    throw new FinancePostingIntegrityError("proof_operation_receipt_mismatch");
  }
  for (const row of rows) {
    const edge = edgesByEffectId.get(row.sourceLink.semanticEdgeId);
    if (
      !edge ||
      edge.lotAllocationId !== row.sourceLink.lotAllocationId ||
      edge.side !== row.entry.side ||
      !sameCanonicalFinancePostingValue(edge.account, row.entry.account) ||
      !sameCanonicalFinancePostingValue(edge.amount, row.entry.amount) ||
      !sameCanonicalFinancePostingValue(edge.links, row.entry.links)
    ) {
      throw new FinancePostingIntegrityError("proof_operation_receipt_mismatch");
    }
  }
}
