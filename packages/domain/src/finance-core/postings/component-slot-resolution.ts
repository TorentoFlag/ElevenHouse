import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import {
  FinancePostingIntegrityError,
  readExactDataArray,
  readExactDataRecord,
  readFinancePostingDigest,
  readFinancePostingIdentifier,
  readPositiveFinancePostingDecimal
} from "./posting-codec";
import {
  normalizeFinancePostingDecoderEnvelope,
  type FinancePostingDecoderEnvelope
} from "./posting-decoder-envelope";
import type { UnverifiedFinanceComponentSlotResolutionBinding } from "./posting-types";

/** Consistency-only decoder; these bindings never grant component authority. */
export function readUnverifiedFinanceComponentSlotResolutionBindings(
  input: unknown,
  decoderEnvelopeInput: FinancePostingDecoderEnvelope
): readonly UnverifiedFinanceComponentSlotResolutionBinding[] {
  const decoderEnvelope = normalizeFinancePostingDecoderEnvelope(decoderEnvelopeInput);
  const bindingIds = new Set<string>();
  const slotIds = new Set<string>();
  const effectIds = new Set<string>();
  return Object.freeze(
    readExactDataArray(input, 0, decoderEnvelope.maxComponentBindings).map((row) => {
      const fields = readExactDataRecord(row, [
        "kind",
        "bindingId",
        "version",
        "authorizationStatus",
        "digestPurpose",
        "operationReceiptId",
        "operationReceiptDigest",
        "slotId",
        "effectId",
        "componentId",
        "requiredAuthorityDigest",
        "bindingDigest"
      ]);
      if (
        fields.kind !== "finance_component_slot_resolution_binding" ||
        fields.authorizationStatus !== "unverified" ||
        fields.digestPurpose !== "drift_detection_only"
      ) {
        throw new FinancePostingIntegrityError("proof_operation_receipt_mismatch");
      }
      const core = Object.freeze({
        kind: "finance_component_slot_resolution_binding" as const,
        bindingId: readFinancePostingIdentifier(fields.bindingId),
        version: readPositiveFinancePostingDecimal(
          fields.version,
          decoderEnvelope.maxDecimalDigits
        ),
        authorizationStatus: "unverified" as const,
        digestPurpose: "drift_detection_only" as const,
        operationReceiptId: readFinancePostingIdentifier(fields.operationReceiptId),
        operationReceiptDigest: readFinancePostingDigest(fields.operationReceiptDigest),
        slotId: readFinancePostingIdentifier(fields.slotId),
        effectId: readFinancePostingIdentifier(fields.effectId),
        componentId: readFinancePostingIdentifier(fields.componentId),
        requiredAuthorityDigest: readFinancePostingDigest(fields.requiredAuthorityDigest)
      });
      const bindingDigest = readFinancePostingDigest(fields.bindingDigest);
      if (
        bindingDigest !== hashFinanceCommandPayload(core) ||
        bindingIds.has(core.bindingId) ||
        slotIds.has(core.slotId) ||
        effectIds.has(core.effectId)
      ) {
        throw new FinancePostingIntegrityError("proof_operation_receipt_mismatch");
      }
      bindingIds.add(core.bindingId);
      slotIds.add(core.slotId);
      effectIds.add(core.effectId);
      return Object.freeze({ ...core, bindingDigest });
    })
  );
}
