import type { FinanceSourceKey } from "../finance-source-key";
import {
  compareFinancePostingInstants,
  FinancePostingIntegrityError,
  readExactDataRecord,
  readFinancePostingDigest,
  readFinancePostingIdentifier,
  readFinancePostingInstant,
  readFinancePostingSourceKey,
  readFinancePostingUnsignedDecimal
} from "./posting-codec";
import {
  normalizeFinancePostingDecoderEnvelope,
  type FinancePostingDecoderEnvelope
} from "./posting-decoder-envelope";
import type { FinancePostingOperationSnapshotRef } from "./posting-types";

export type FinanceJournalPostingContext = Readonly<{
  journalTransactionId: string;
  linkProofId: string;
  operationId: string;
  sourceKey: FinanceSourceKey;
  occurredAt: string;
  postedAt: string;
}>;

export function readFinanceJournalPostingContext(
  input: unknown,
  decoderEnvelopeInput: FinancePostingDecoderEnvelope
): FinanceJournalPostingContext {
  normalizeFinancePostingDecoderEnvelope(decoderEnvelopeInput);
  const value = readExactDataRecord(input, [
    "journalTransactionId",
    "linkProofId",
    "operationId",
    "sourceKey",
    "occurredAt",
    "postedAt"
  ]);
  const occurredAt = readFinancePostingInstant(value.occurredAt);
  const postedAt = readFinancePostingInstant(value.postedAt);
  if (compareFinancePostingInstants(postedAt, occurredAt) < 0) {
    throw new FinancePostingIntegrityError("invalid_chronology");
  }
  return Object.freeze({
    journalTransactionId: readFinancePostingIdentifier(value.journalTransactionId),
    linkProofId: readFinancePostingIdentifier(value.linkProofId),
    operationId: readFinancePostingIdentifier(value.operationId),
    sourceKey: readFinancePostingSourceKey(value.sourceKey),
    occurredAt,
    postedAt
  });
}

export function readFinancePostingOperationSnapshotRef(
  input: unknown,
  operationId: string,
  journalSourceKey: FinanceSourceKey,
  decoderEnvelopeInput: FinancePostingDecoderEnvelope
): FinancePostingOperationSnapshotRef | null {
  const decoderEnvelope = normalizeFinancePostingDecoderEnvelope(decoderEnvelopeInput);
  if (input === null) return null;
  const fields = readExactDataRecord(input, [
    "snapshotId",
    "operationId",
    "sourceKey",
    "previousWalletRevision",
    "nextWalletRevision",
    "previousLotStateDigest",
    "nextLotStateDigest",
    "historyRecordDigest",
    "snapshotDigest"
  ]);
  const snapshotOperationId = readFinancePostingIdentifier(fields.operationId);
  const sourceKey = readFinancePostingSourceKey(fields.sourceKey);
  const previousWalletRevision = readFinancePostingUnsignedDecimal(
    fields.previousWalletRevision,
    decoderEnvelope.maxDecimalDigits
  );
  const nextWalletRevision = readFinancePostingUnsignedDecimal(
    fields.nextWalletRevision,
    decoderEnvelope.maxDecimalDigits
  );
  if (
    snapshotOperationId !== operationId ||
    sourceKey.kind !== journalSourceKey.kind ||
    sourceKey.sourceId !== journalSourceKey.sourceId ||
    sourceKey.operation !== journalSourceKey.operation ||
    BigInt(nextWalletRevision) !== BigInt(previousWalletRevision) + 1n
  ) {
    throw new FinancePostingIntegrityError("authority_mismatch");
  }
  return Object.freeze({
    snapshotId: readFinancePostingIdentifier(fields.snapshotId),
    operationId: snapshotOperationId,
    sourceKey,
    previousWalletRevision,
    nextWalletRevision,
    previousLotStateDigest: readFinancePostingDigest(fields.previousLotStateDigest),
    nextLotStateDigest: readFinancePostingDigest(fields.nextLotStateDigest),
    historyRecordDigest: readFinancePostingDigest(fields.historyRecordDigest),
    snapshotDigest: readFinancePostingDigest(fields.snapshotDigest)
  });
}
