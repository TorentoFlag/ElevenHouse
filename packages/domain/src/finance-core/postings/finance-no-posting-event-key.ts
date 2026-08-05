import {
  FinancePostingIntegrityError,
  readExactDataRecord,
  readFinancePostingIdentifier
} from "./posting-codec";
import {
  normalizeFinancePostingDecoderEnvelope,
  type FinancePostingDecoderEnvelope
} from "./posting-decoder-envelope";
import type { FinanceNoPostingEventKey } from "./posting-types";

export function readFinanceNoPostingEventKey(
  input: unknown,
  decoderEnvelopeInput: FinancePostingDecoderEnvelope
): FinanceNoPostingEventKey {
  normalizeFinancePostingDecoderEnvelope(decoderEnvelopeInput);
  const fields = readExactDataRecord(input, ["kind", "sourceId", "operation"]);
  const sourceId = readFinancePostingIdentifier(fields.sourceId);
  if (
    fields.kind === "payout_state" &&
    (fields.operation === "approved" || fields.operation === "bank_work_initiated")
  ) {
    return Object.freeze({ kind: "payout_state", sourceId, operation: fields.operation });
  }
  if (
    fields.kind === "chargeback_state" &&
    (fields.operation === "lost_outcome_recorded" || fields.operation === "lost_allocation_closed")
  ) {
    return Object.freeze({ kind: "chargeback_state", sourceId, operation: fields.operation });
  }
  throw new FinancePostingIntegrityError("source_mismatch");
}

export function serializeFinanceNoPostingEventKey(
  input: unknown,
  decoderEnvelopeInput: FinancePostingDecoderEnvelope
): string {
  const eventKey = readFinanceNoPostingEventKey(input, decoderEnvelopeInput);
  return JSON.stringify([eventKey.kind, eventKey.sourceId, eventKey.operation]);
}
