import { FinancePostingIntegrityError, readExactDataRecord } from "./posting-codec";

export type FinancePostingDecoderEnvelope = Readonly<{
  maxJournalEntries: number;
  maxProofEdges: number;
  maxComponentBindings: number;
  maxAllocations: number;
  maxDecimalDigits: number;
}>;

const envelopeKeys = [
  "maxJournalEntries",
  "maxProofEdges",
  "maxComponentBindings",
  "maxAllocations",
  "maxDecimalDigits"
] as const;

/**
 * Trusted out-of-band policy only. Callers must enforce a serialized byte cap
 * before parsing; this envelope bounds post-parse collections and decimals.
 */
export function normalizeFinancePostingDecoderEnvelope(
  input: unknown
): FinancePostingDecoderEnvelope {
  let fields;
  try {
    fields = readExactDataRecord(input, envelopeKeys);
  } catch {
    throw new FinancePostingIntegrityError("decoder_envelope_required");
  }
  for (const key of envelopeKeys) {
    if (!Number.isSafeInteger(fields[key]) || (fields[key] as number) <= 0) {
      throw new FinancePostingIntegrityError("decoder_envelope_required");
    }
  }
  return Object.freeze({
    maxJournalEntries: fields.maxJournalEntries as number,
    maxProofEdges: fields.maxProofEdges as number,
    maxComponentBindings: fields.maxComponentBindings as number,
    maxAllocations: fields.maxAllocations as number,
    maxDecimalDigits: fields.maxDecimalDigits as number
  });
}
