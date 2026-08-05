import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import {
  FinancePostingIntegrityError,
  readExactDataArray,
  readExactDataRecord,
  readFinancePostingDigest,
  readFinancePostingIdentifier,
  readFinancePostingSourceKey,
  readFinancePostingVersion,
  sameCanonicalFinancePostingValue,
  sameFinancePostingSourceKey
} from "./posting-codec";
import {
  readFinanceJournalLinkProofEdge,
  readFinancePostingJournalTransaction
} from "./journal-posting-codec";
import { readFinancePostingOperationSnapshotRef } from "./posting-event-identity";
import {
  normalizeFinancePostingDecoderEnvelope,
  type FinancePostingDecoderEnvelope
} from "./posting-decoder-envelope";
import type { FinanceJournalLinkProof, FinancePostingEntrySourceLink } from "./posting-types";

export function rehydrateFinanceJournalLinkProof(
  input: unknown,
  decoderEnvelopeInput: FinancePostingDecoderEnvelope
): FinanceJournalLinkProof {
  const decoderEnvelope = normalizeFinancePostingDecoderEnvelope(decoderEnvelopeInput);
  const fields = readExactDataRecord(input, [
    "kind",
    "proofId",
    "version",
    "allocationAuthorityRef",
    "sourceEvidenceRef",
    "journalTransactionId",
    "journalSourceKey",
    "operationId",
    "operationSnapshotRef",
    "edges",
    "proofDigest"
  ]);
  if (fields.kind !== "finance_allocation_link_proof" || fields.version !== 1) {
    throw new FinancePostingIntegrityError("invalid_shape");
  }
  const proofId = readFinancePostingIdentifier(fields.proofId);
  const authorityFields = readExactDataRecord(fields.allocationAuthorityRef, [
    "kind",
    "authorityId",
    "version",
    "canonicalDigest"
  ]);
  const allocationAuthorityRef = Object.freeze({
    kind: readFinancePostingIdentifier(authorityFields.kind),
    authorityId: readFinancePostingIdentifier(authorityFields.authorityId),
    version: readFinancePostingVersion(authorityFields.version),
    canonicalDigest: readFinancePostingDigest(authorityFields.canonicalDigest)
  });
  const evidenceFields = readExactDataRecord(fields.sourceEvidenceRef, [
    "kind",
    "evidenceId",
    "canonicalDigest"
  ]);
  const sourceEvidenceRef = Object.freeze({
    kind: readFinancePostingIdentifier(evidenceFields.kind),
    evidenceId: readFinancePostingIdentifier(evidenceFields.evidenceId),
    canonicalDigest: readFinancePostingDigest(evidenceFields.canonicalDigest)
  });
  const journalTransactionId = readFinancePostingIdentifier(fields.journalTransactionId);
  const journalSourceKey = readFinancePostingSourceKey(fields.journalSourceKey);
  const operationId = readFinancePostingIdentifier(fields.operationId);
  const operationSnapshotRef = readFinancePostingOperationSnapshotRef(
    fields.operationSnapshotRef,
    operationId,
    journalSourceKey,
    decoderEnvelope
  );
  const edgeIds = new Set<string>();
  const lotAllocationIds = new Set<string>();
  const edges = Object.freeze(
    readExactDataArray(fields.edges, 2, decoderEnvelope.maxProofEdges).map((edge, index) => {
      const normalized = readFinanceJournalLinkProofEdge(edge, index, decoderEnvelope);
      if ((normalized.semanticEdgeId === null) !== (normalized.lotAllocationId === null)) {
        throw new FinancePostingIntegrityError("invalid_shape");
      }
      if (normalized.semanticEdgeId !== null) {
        if (edgeIds.has(normalized.semanticEdgeId)) {
          throw new FinancePostingIntegrityError("invalid_shape");
        }
        edgeIds.add(normalized.semanticEdgeId);
      }
      if (normalized.lotAllocationId !== null) {
        if (lotAllocationIds.has(normalized.lotAllocationId)) {
          throw new FinancePostingIntegrityError("invalid_shape");
        }
        lotAllocationIds.add(normalized.lotAllocationId);
      }
      return normalized;
    })
  );
  let debitMinor = 0n;
  let creditMinor = 0n;
  for (const edge of edges) {
    if (edge.side === "debit") debitMinor += BigInt(edge.amount.amountMinor);
    else creditMinor += BigInt(edge.amount.amountMinor);
  }
  if (debitMinor !== creditMinor) {
    throw new FinancePostingIntegrityError("unbalanced_proof");
  }
  const proofDigest = readFinancePostingDigest(fields.proofDigest);
  const proofCore = Object.freeze({
    kind: "finance_allocation_link_proof" as const,
    proofId,
    version: 1 as const,
    allocationAuthorityRef,
    sourceEvidenceRef,
    journalTransactionId,
    journalSourceKey,
    operationId,
    operationSnapshotRef,
    edges
  });
  if (hashFinanceCommandPayload(proofCore) !== proofDigest) {
    throw new FinancePostingIntegrityError("proof_digest_mismatch");
  }
  return Object.freeze({ ...proofCore, proofDigest });
}

export function assertFinanceJournalLinkProofMatchesTransaction(
  input: {
    readonly proof: unknown;
    readonly transaction: unknown;
  },
  decoderEnvelopeInput: FinancePostingDecoderEnvelope
): void {
  const decoderEnvelope = normalizeFinancePostingDecoderEnvelope(decoderEnvelopeInput);
  const root = readExactDataRecord(input, ["proof", "transaction"]);
  const proof = rehydrateFinanceJournalLinkProof(root.proof, decoderEnvelope);
  const transaction = readFinancePostingJournalTransaction(root.transaction, decoderEnvelope);
  if (
    proof.journalTransactionId !== transaction.id ||
    !sameFinancePostingSourceKey(proof.journalSourceKey, transaction.sourceKey) ||
    proof.edges.length !== transaction.entries.length
  ) {
    throw new FinancePostingIntegrityError("proof_transaction_mismatch");
  }
  for (let index = 0; index < transaction.entries.length; index += 1) {
    const edge = proof.edges[index];
    const entry = transaction.entries[index];
    if (
      !edge ||
      !entry ||
      edge.entryIndex !== index ||
      edge.side !== entry.side ||
      !sameCanonicalFinancePostingValue(edge.account, entry.account) ||
      !sameCanonicalFinancePostingValue(edge.amount, entry.amount) ||
      !sameCanonicalFinancePostingValue(edge.links, entry.links)
    ) {
      throw new FinancePostingIntegrityError("proof_transaction_mismatch");
    }
  }
}

export function readFinancePostingEntrySourceLinks(
  input: unknown,
  expectedLength: number,
  decoderEnvelopeInput: FinancePostingDecoderEnvelope
): readonly (FinancePostingEntrySourceLink | null)[] {
  const decoderEnvelope = normalizeFinancePostingDecoderEnvelope(decoderEnvelopeInput);
  const rows = readExactDataArray(input, 0, decoderEnvelope.maxJournalEntries);
  if (rows.length !== expectedLength) {
    throw new FinancePostingIntegrityError("invalid_shape");
  }
  const semanticEdgeIds = new Set<string>();
  const lotAllocationIds = new Set<string>();
  return Object.freeze(
    rows.map((row) => {
      if (row === null) return null;
      const fields = readExactDataRecord(row, ["semanticEdgeId", "lotAllocationId"]);
      const semanticEdgeId = readFinancePostingIdentifier(fields.semanticEdgeId);
      const lotAllocationId = readFinancePostingIdentifier(fields.lotAllocationId);
      if (semanticEdgeIds.has(semanticEdgeId) || lotAllocationIds.has(lotAllocationId)) {
        throw new FinancePostingIntegrityError("invalid_shape");
      }
      semanticEdgeIds.add(semanticEdgeId);
      lotAllocationIds.add(lotAllocationId);
      return Object.freeze({ semanticEdgeId, lotAllocationId });
    })
  );
}
