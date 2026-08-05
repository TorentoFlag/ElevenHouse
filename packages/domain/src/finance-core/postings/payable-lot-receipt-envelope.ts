import {
  normalizePayableLotReceiptDecoderEnvelope,
  type PayableLotReceiptDecoderEnvelope
} from "../source-lot-operation-receipt";
import { FinancePostingIntegrityError, readExactDataRecord } from "./posting-codec";

const receiptEnvelopeKeys = [
  "maxAuthorityRefs",
  "maxEffects",
  "maxLineage",
  "maxComponentSlots",
  "maxDecimalDigits"
] as const;

/**
 * Reads the trusted receipt envelope through the posting-layer descriptor gate
 * before delegating to the Task 5 validator. This prevents a Proxy/accessor
 * envelope from executing while the older validator enumerates its fields.
 */
export function readFinancePostingReceiptDecoderEnvelope(
  input: unknown
): PayableLotReceiptDecoderEnvelope {
  try {
    return normalizePayableLotReceiptDecoderEnvelope(
      readExactDataRecord(input, receiptEnvelopeKeys)
    );
  } catch {
    throw new FinancePostingIntegrityError("proof_operation_receipt_mismatch");
  }
}
