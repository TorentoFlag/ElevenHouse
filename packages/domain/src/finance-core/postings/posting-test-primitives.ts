import type { FinancePostingDecoderEnvelope } from "./posting-decoder-envelope";

export const postingDecoderEnvelope = Object.freeze({
  maxJournalEntries: 32,
  maxProofEdges: 32,
  maxComponentBindings: 32,
  maxAllocations: 32,
  maxDecimalDigits: 32
}) satisfies FinancePostingDecoderEnvelope;

export function withPostingDecoderEnvelope<Input, Result>(
  decoder: (input: Input, decoderEnvelope: FinancePostingDecoderEnvelope) => Result
): (input: Input) => Result {
  return (input) => decoder(input, postingDecoderEnvelope);
}

export const sha = (character: string): `sha256:${string}` => `sha256:${character.repeat(64)}`;

export function postingContext(
  journalTransactionId: string,
  linkProofId: string,
  operationId: string,
  sourceKey: {
    kind: "bank" | "settlement";
    sourceId: string;
    operation:
      | "unknown_debit_recorded"
      | "unknown_credit_recorded"
      | "suspense_reclassified"
      | "merchant_payout_confirmed"
      | "merchant_payout_bank_matched";
  },
  occurredAt: string,
  postedAt: string
) {
  return { journalTransactionId, linkProofId, operationId, sourceKey, occurredAt, postedAt };
}
