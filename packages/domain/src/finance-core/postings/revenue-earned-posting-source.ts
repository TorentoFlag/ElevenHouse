import {
  hashFinanceCommandPayload,
  type FinanceAuthorizationPayloadHash
} from "../../finance-authorization/canonical-command-payload";
import type { FinanceSourceKey } from "../finance-source-key";
import type { FinanceJournalEntryInput } from "../journal";
import { readFinancePostingJournalEntry } from "./journal-posting-codec";
import {
  FinancePostingIntegrityError,
  readExactDataRecord,
  readFinancePostingDigest,
  readFinancePostingIdentifier,
  readFinancePostingSourceKey
} from "./posting-codec";
import type { FinancePostingDecoderEnvelope } from "./posting-decoder-envelope";

export type UnverifiedDeferredRevenueSource = Readonly<{
  kind: "unverified_deferred_revenue_source";
  schemaVersion: 1;
  sourceTransactionId: string;
  sourceEntryIndex: number;
  sourceKey: FinanceSourceKey;
  entry: FinanceJournalEntryInput;
  integrityStatus: "unverified";
  digestPurpose: "drift_detection_only";
  canonicalDigest: FinanceAuthorizationPayloadHash;
}>;

export function readUnverifiedDeferredRevenueSource(
  input: unknown,
  envelope: FinancePostingDecoderEnvelope
): UnverifiedDeferredRevenueSource {
  const fields = readExactDataRecord(input, [
    "kind",
    "schemaVersion",
    "sourceTransactionId",
    "sourceEntryIndex",
    "sourceKey",
    "entry",
    "integrityStatus",
    "digestPurpose",
    "canonicalDigest"
  ]);
  if (
    fields.kind !== "unverified_deferred_revenue_source" ||
    fields.schemaVersion !== 1 ||
    fields.integrityStatus !== "unverified" ||
    fields.digestPurpose !== "drift_detection_only"
  ) {
    throw new FinancePostingIntegrityError("evidence_mismatch");
  }
  if (
    !Number.isSafeInteger(fields.sourceEntryIndex) ||
    (fields.sourceEntryIndex as number) < 0 ||
    (fields.sourceEntryIndex as number) >= envelope.maxJournalEntries
  ) {
    throw new FinancePostingIntegrityError("decoder_envelope_exceeded");
  }
  const core = Object.freeze({
    kind: "unverified_deferred_revenue_source" as const,
    schemaVersion: 1 as const,
    sourceTransactionId: readFinancePostingIdentifier(fields.sourceTransactionId),
    sourceEntryIndex: fields.sourceEntryIndex as number,
    sourceKey: readFinancePostingSourceKey(fields.sourceKey),
    entry: readFinancePostingJournalEntry(fields.entry, envelope),
    integrityStatus: "unverified" as const,
    digestPurpose: "drift_detection_only" as const
  });
  const canonicalDigest = readFinancePostingDigest(fields.canonicalDigest);
  if (canonicalDigest !== hashFinanceCommandPayload(core)) {
    throw new FinancePostingIntegrityError("evidence_mismatch");
  }
  return Object.freeze({ ...core, canonicalDigest });
}
