import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import { createFinanceJournalTransaction, type FinanceJournalEntryInput } from "../journal";
import {
  assertFinanceJournalLinkProofMatchesTransaction,
  readFinancePostingEntrySourceLinks
} from "./journal-link-proof";
import { readFinancePostingJournalEntry } from "./journal-posting-codec";
import { readFinanceNoPostingEventKey } from "./finance-no-posting-event-key";
import {
  FinancePostingIntegrityError,
  readExactDataArray,
  readExactDataRecord,
  readFinancePostingDigest,
  readFinancePostingIdentifier,
  readFinancePostingVersion
} from "./posting-codec";
import {
  normalizeFinancePostingDecoderEnvelope,
  type FinancePostingDecoderEnvelope
} from "./posting-decoder-envelope";
import {
  readFinanceJournalPostingContext,
  readFinancePostingOperationSnapshotRef,
  type FinanceJournalPostingContext
} from "./posting-event-identity";
import type {
  FinancePostingAuthorityRef,
  FinancePostingEntrySourceLink,
  FinancePostingEvidenceRef,
  FinanceNoPostingEventKey,
  FinanceNoPostingReason,
  FinancePostingOperationSnapshotRef,
  UnverifiedFinancePostingRecipe
} from "./posting-types";

type JournalRecipe = Extract<UnverifiedFinancePostingRecipe, { readonly kind: "journal" }>;
type NoPostingRecipe = Extract<UnverifiedFinancePostingRecipe, { readonly kind: "no_posting" }>;

export function createUnverifiedFinanceJournalPostingRecipe(
  input: {
    readonly context: FinanceJournalPostingContext;
    readonly authorityRef: FinancePostingAuthorityRef;
    readonly sourceEvidenceRef: FinancePostingEvidenceRef;
    readonly operationSnapshotRef: FinancePostingOperationSnapshotRef | null;
    readonly entries: readonly FinanceJournalEntryInput[];
    readonly entrySourceLinks: readonly (FinancePostingEntrySourceLink | null)[];
  },
  decoderEnvelopeInput: FinancePostingDecoderEnvelope
): JournalRecipe;
export function createUnverifiedFinanceJournalPostingRecipe(
  input: unknown,
  decoderEnvelopeInput: unknown
): JournalRecipe {
  const decoderEnvelope = normalizeFinancePostingDecoderEnvelope(decoderEnvelopeInput);
  try {
    const fields = readExactDataRecord(input, [
      "context",
      "authorityRef",
      "sourceEvidenceRef",
      "operationSnapshotRef",
      "entries",
      "entrySourceLinks"
    ]);
    const context = readFinanceJournalPostingContext(fields.context, decoderEnvelope);
    const operationSnapshotRef = readFinancePostingOperationSnapshotRef(
      fields.operationSnapshotRef,
      context.operationId,
      context.sourceKey,
      decoderEnvelope
    );
    const entries = readExactDataArray(fields.entries, 2, decoderEnvelope.maxJournalEntries).map(
      (entry) => readFinancePostingJournalEntry(entry, decoderEnvelope)
    );
    const transaction = createFinanceJournalTransaction({
      id: context.journalTransactionId,
      sourceKey: context.sourceKey,
      occurredAt: context.occurredAt,
      postedAt: context.postedAt,
      reversesTransactionId: null,
      entries
    });
    const entrySourceLinks = readFinancePostingEntrySourceLinks(
      fields.entrySourceLinks,
      transaction.entries.length,
      decoderEnvelope
    );
    const allocationAuthorityRef = readFinancePostingAuthorityRef(fields.authorityRef);
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
    const edges = Object.freeze(
      transaction.entries.map((entry, entryIndex) => {
        const sourceLink = entrySourceLinks[entryIndex] ?? null;
        return Object.freeze({
          entryIndex,
          account: entry.account,
          side: entry.side,
          amount: entry.amount,
          links: entry.links,
          semanticEdgeId: sourceLink?.semanticEdgeId ?? null,
          lotAllocationId: sourceLink?.lotAllocationId ?? null
        });
      })
    );
    const proofCore = Object.freeze({
      kind: "finance_allocation_link_proof" as const,
      proofId: context.linkProofId,
      version: 1 as const,
      allocationAuthorityRef,
      sourceEvidenceRef,
      journalTransactionId: transaction.id,
      journalSourceKey: transaction.sourceKey,
      operationId: context.operationId,
      operationSnapshotRef,
      edges
    });
    const linkProof = Object.freeze({
      ...proofCore,
      proofDigest: hashFinanceCommandPayload(proofCore)
    });
    const decision = Object.freeze({
      kind: "journal" as const,
      authorizationStatus: "unverified" as const,
      atomicityStatus: "unverified" as const,
      transaction,
      linkProof
    });
    assertFinanceJournalLinkProofMatchesTransaction(
      { proof: linkProof, transaction },
      decoderEnvelope
    );
    return decision;
  } catch (error) {
    if (error instanceof FinancePostingIntegrityError) throw error;
    throw new FinancePostingIntegrityError("invalid_shape");
  }
}

export function createUnverifiedFinanceNoPostingRecipe(
  input: {
    readonly eventKey: FinanceNoPostingEventKey;
    readonly reason: FinanceNoPostingReason;
    readonly authorityRef: FinancePostingAuthorityRef;
    readonly operationSnapshotRef: null;
  },
  decoderEnvelopeInput: FinancePostingDecoderEnvelope
): NoPostingRecipe;
export function createUnverifiedFinanceNoPostingRecipe(
  input: unknown,
  decoderEnvelopeInput: unknown
): NoPostingRecipe {
  const decoderEnvelope = normalizeFinancePostingDecoderEnvelope(decoderEnvelopeInput);
  const fields = readExactDataRecord(input, [
    "eventKey",
    "reason",
    "authorityRef",
    "operationSnapshotRef"
  ]);
  const eventKey = readFinanceNoPostingEventKey(fields.eventKey, decoderEnvelope);
  const expectedReason: FinanceNoPostingReason =
    eventKey.kind === "payout_state"
      ? "payout_state_only"
      : eventKey.operation === "lost_outcome_recorded"
        ? "chargeback_outcome_only"
        : "chargeback_state_only";
  if (fields.reason !== expectedReason) {
    throw new FinancePostingIntegrityError("no_posting_reason_mismatch");
  }
  if (fields.operationSnapshotRef !== null) {
    throw new FinancePostingIntegrityError("authority_mismatch");
  }
  return Object.freeze({
    kind: "no_posting",
    authorizationStatus: "unverified",
    atomicityStatus: "unverified",
    eventKey,
    reason: expectedReason,
    authorityRef: readFinancePostingAuthorityRef(fields.authorityRef),
    operationSnapshotRef: null
  });
}

function readFinancePostingAuthorityRef(input: unknown): FinancePostingAuthorityRef {
  const fields = readExactDataRecord(input, ["kind", "authorityId", "version", "canonicalDigest"]);
  return Object.freeze({
    kind: readFinancePostingIdentifier(fields.kind),
    authorityId: readFinancePostingIdentifier(fields.authorityId),
    version: readFinancePostingVersion(fields.version),
    canonicalDigest: readFinancePostingDigest(fields.canonicalDigest)
  });
}
