import {
  normalizePayableLotReceiptDecoderEnvelope,
  type PayableLotReceiptDecoderEnvelope
} from "../source-lot-operation-receipt";
import {
  assertFinancePostingNotProxy,
  FinancePostingIntegrityError,
  readExactDataArray,
  readExactDataRecord
} from "./posting-codec";

const receiptEnvelopeKeys = [
  "maxAuthorityRefs",
  "maxEffects",
  "maxLineage",
  "maxComponentSlots",
  "maxDecimalDigits"
] as const;

const receiptKeys = [
  "kind",
  "schemaVersion",
  "receiptId",
  "operationId",
  "operationKind",
  "sourceKey",
  "occurredAt",
  "astrologerUserId",
  "currency",
  "previousLotState",
  "nextLotState",
  "historyRecord",
  "authorityRefs",
  "effects",
  "lineage",
  "requiredExternalLinkSlots",
  "digestPurpose",
  "integrityStatus",
  "canonicalDigest"
] as const;

/**
 * Refund-owned structural gate used before the Task5 receipt rehydrator. It
 * bounds all root collections and rejects proxies/accessors/cycles without
 * invoking caller-controlled properties. Semantic receipt validation remains
 * the responsibility of the canonical Task5 rehydrator.
 */
export function assertRefundReceiptStructuralPreflight(
  input: unknown,
  envelopeInput: unknown
): void {
  try {
    const envelope = readReceiptEnvelope(envelopeInput);
    const fields = readExactDataRecord(input, receiptKeys);
    const authorityRefs = readExactDataArray(fields.authorityRefs, 0, envelope.maxAuthorityRefs);
    const effects = readExactDataArray(fields.effects, 0, envelope.maxEffects);
    const lineage = readExactDataArray(fields.lineage, 0, envelope.maxLineage);
    const componentSlots = readExactDataArray(
      fields.requiredExternalLinkSlots,
      0,
      envelope.maxComponentSlots
    );
    const active = new WeakSet<object>();
    for (const value of [
      fields.sourceKey,
      fields.previousLotState,
      fields.nextLotState,
      fields.historyRecord,
      ...authorityRefs,
      ...effects,
      ...lineage,
      ...componentSlots
    ]) {
      assertProxyFreeDataRecord(value, active, 0);
    }
  } catch {
    throw mismatch();
  }
}

function readReceiptEnvelope(input: unknown): PayableLotReceiptDecoderEnvelope {
  const fields = readExactDataRecord(input, receiptEnvelopeKeys);
  return normalizePayableLotReceiptDecoderEnvelope(fields);
}

function assertProxyFreeDataRecord(input: unknown, active: WeakSet<object>, depth: number): void {
  if (typeof input !== "object" || input === null) return;
  assertFinancePostingNotProxy(input);
  if (Array.isArray(input) || depth > 4 || active.has(input)) throw mismatch();
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) throw mismatch();
  active.add(input);
  for (const key of Reflect.ownKeys(input)) {
    if (typeof key !== "string") throw mismatch();
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) throw mismatch();
    assertProxyFreeDataRecord(descriptor.value, active, depth + 1);
  }
  active.delete(input);
}

function mismatch(): FinancePostingIntegrityError {
  return new FinancePostingIntegrityError("proof_operation_receipt_mismatch");
}
