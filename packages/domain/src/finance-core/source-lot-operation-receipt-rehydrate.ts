import { safeSourceKey, sha256Digest } from "./source-lot-integrity";
import { deepFreeze, digestValue } from "./source-lot-operation-receipt-core";
import {
  assertAuthorityRefOrder,
  authorityReference
} from "./source-lot-operation-receipt-rehydrate-authority";
import {
  assertLineageOrder,
  componentSlot,
  lineageEntry,
  operationEffect
} from "./source-lot-operation-receipt-rehydrate-edges";
import {
  positiveReceiptVersion,
  receiptHistoryKind
} from "./source-lot-operation-receipt-rehydrate-values";
import type {
  PayableLotOperationReceipt,
  PayableLotReceiptDecoderEnvelope
} from "./source-lot-operation-receipt-types";
import type { PayableLotHistoryRecord } from "./source-lot-types";
import {
  exactDataArray,
  exactDataRecord,
  fail,
  identifier,
  integer,
  instant
} from "./source-lot-validation";

const decoderEnvelopeKeys = [
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
 * Strict persisted-shape rehydration. The trusted out-of-band envelope is
 * mandatory and bounds post-parse collections and decimal parsing. The adapter
 * must also enforce a serialized byte limit before JSON parsing. A matching
 * digest detects drift only; this function deliberately preserves
 * integrityStatus="unverified" and does not grant journal or component
 * authority.
 */
export function rehydratePayableLotOperationReceipt(
  input: unknown,
  decoderEnvelopeInput: unknown
): PayableLotOperationReceipt {
  const decoderEnvelope = normalizePayableLotReceiptDecoderEnvelope(decoderEnvelopeInput);
  const fields = exactDataRecord(input, receiptKeys);
  if (
    fields.kind !== "payable_lot_operation_receipt" ||
    fields.schemaVersion !== 1 ||
    fields.digestPurpose !== "drift_detection_only" ||
    fields.integrityStatus !== "unverified"
  ) {
    fail("invalid_field");
  }
  const operationId = identifier(fields.operationId);
  if (identifier(fields.receiptId) !== operationId) fail("invalid_field");
  const operationKind = receiptHistoryKind(fields.operationKind);
  const sourceKey = safeSourceKey(fields.sourceKey);
  const occurredAt = instant(fields.occurredAt);
  const astrologerUserId = identifier(fields.astrologerUserId);
  if (fields.currency !== "RUB") fail("owner_currency_mismatch");
  const previousLotState = lotStateRef(fields.previousLotState, decoderEnvelope.maxDecimalDigits);
  const nextLotState = lotStateRef(fields.nextLotState, decoderEnvelope.maxDecimalDigits);
  if (BigInt(nextLotState.version) !== BigInt(previousLotState.version) + 1n) {
    fail("version_conflict");
  }
  const historyRecord = historyRecordRef(fields.historyRecord, operationKind);
  const authorityRefs = Object.freeze(
    boundedDataArray(fields.authorityRefs, decoderEnvelope.maxAuthorityRefs).map((reference) =>
      authorityReference(reference, decoderEnvelope.maxDecimalDigits)
    )
  );
  assertAuthorityRefOrder(operationKind, authorityRefs);
  const effects = Object.freeze(
    boundedDataArray(fields.effects, decoderEnvelope.maxEffects).map((effect, index) =>
      operationEffect(effect, operationId, operationKind, index)
    )
  );
  const componentSlots = Object.freeze(
    boundedDataArray(fields.requiredExternalLinkSlots, decoderEnvelope.maxComponentSlots).map(
      (slot, index) => componentSlot(slot, operationId, operationKind, effects, index)
    )
  );
  if (effects.length !== componentSlots.length) fail("invalid_shape");
  const effectIds = new Set(effects.map((effect) => effect.effectId));
  const lineage = Object.freeze(
    boundedDataArray(fields.lineage, decoderEnvelope.maxLineage).map((entry) =>
      lineageEntry(entry, effectIds)
    )
  );
  assertLineageOrder(lineage);

  const content = {
    kind: "payable_lot_operation_receipt" as const,
    schemaVersion: 1 as const,
    receiptId: operationId,
    operationId,
    operationKind,
    sourceKey,
    occurredAt,
    astrologerUserId,
    currency: "RUB" as const,
    previousLotState,
    nextLotState,
    historyRecord,
    authorityRefs,
    effects,
    lineage,
    requiredExternalLinkSlots: componentSlots,
    digestPurpose: "drift_detection_only" as const,
    integrityStatus: "unverified" as const
  };
  const canonicalDigest = sha256Digest(fields.canonicalDigest);
  if (canonicalDigest !== digestValue(content)) fail("state_digest_mismatch");
  return deepFreeze({ ...content, canonicalDigest });
}

export function normalizePayableLotReceiptDecoderEnvelope(
  input: unknown
): PayableLotReceiptDecoderEnvelope {
  const fields = exactDataRecord(input, decoderEnvelopeKeys);
  return Object.freeze({
    maxAuthorityRefs: integer(fields.maxAuthorityRefs, 1, Number.MAX_SAFE_INTEGER, "invalid_shape"),
    maxEffects: integer(fields.maxEffects, 1, Number.MAX_SAFE_INTEGER, "invalid_shape"),
    maxLineage: integer(fields.maxLineage, 1, Number.MAX_SAFE_INTEGER, "invalid_shape"),
    maxComponentSlots: integer(
      fields.maxComponentSlots,
      1,
      Number.MAX_SAFE_INTEGER,
      "invalid_shape"
    ),
    maxDecimalDigits: integer(fields.maxDecimalDigits, 1, Number.MAX_SAFE_INTEGER, "invalid_shape")
  });
}

function boundedDataArray(input: unknown, maximumLength: number): readonly unknown[] {
  try {
    if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype) {
      fail("invalid_shape");
    }
    const lengthDescriptor = Object.getOwnPropertyDescriptor(input, "length");
    if (!lengthDescriptor || !("value" in lengthDescriptor)) fail("invalid_shape");
    integer(lengthDescriptor.value, 0, maximumLength, "invalid_shape");
  } catch {
    fail("invalid_shape");
  }
  return exactDataArray(input);
}

function lotStateRef(input: unknown, maxDecimalDigits: number) {
  const fields = exactDataRecord(input, ["version", "digest"]);
  return Object.freeze({
    version: positiveReceiptVersion(fields.version, maxDecimalDigits),
    digest: sha256Digest(fields.digest)
  });
}

function historyRecordRef(input: unknown, operationKind: PayableLotHistoryRecord["kind"]) {
  const fields = exactDataRecord(input, ["kind", "canonicalDigest", "digestPurpose"]);
  if (
    receiptHistoryKind(fields.kind) !== operationKind ||
    fields.digestPurpose !== "drift_detection_only"
  ) {
    fail("invalid_field");
  }
  return Object.freeze({
    kind: operationKind,
    canonicalDigest: sha256Digest(fields.canonicalDigest),
    digestPurpose: "drift_detection_only" as const
  });
}
