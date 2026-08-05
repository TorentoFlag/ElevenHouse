import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import {
  FinancePostingIntegrityError,
  readExactDataArray,
  readExactDataRecord,
  readFinancePostingDigest,
  readFinancePostingIdentifier,
  readFinancePostingInstant
} from "./posting-codec";
import {
  normalizeFinancePostingDecoderEnvelope,
  type FinancePostingDecoderEnvelope
} from "./posting-decoder-envelope";
import type { RefundPostingAllocationAuthorityV1 } from "./refund-posting-types";
import { readRefundPostingAuthorityRef } from "./refund-posting-value-codec";
import { readUnverifiedRefundSourceConsumptionTransition } from "./refund-source-consumption-codec";
import { assertRefundSourceConsumptionBindingMatchesAllocation } from "./refund-source-consumption-integrity";
import type { UnverifiedRefundSourceConsumptionBinding } from "./refund-source-consumption-types";

export type {
  RefundSourceConsumptionIdentity,
  UnverifiedRefundSourceConsumptionBinding,
  UnverifiedRefundSourceConsumptionTransition
} from "./refund-source-consumption-types";

export function readAndAssertUnverifiedRefundSourceConsumptionBinding(
  input: unknown,
  allocation: RefundPostingAllocationAuthorityV1,
  envelopeInput: FinancePostingDecoderEnvelope
): UnverifiedRefundSourceConsumptionBinding {
  const envelope = normalizeFinancePostingDecoderEnvelope(envelopeInput);
  const fields = readExactDataRecord(input, [
    "kind",
    "schemaVersion",
    "bindingId",
    "authorizationStatus",
    "atomicityStatus",
    "digestPurpose",
    "allocationAuthorityRef",
    "sourceTransitions",
    "observedAt",
    "bindingDigest"
  ]);
  if (
    fields.kind !== "unverified_refund_source_consumption_binding" ||
    fields.schemaVersion !== 1 ||
    fields.authorizationStatus !== "unverified" ||
    fields.atomicityStatus !== "unverified" ||
    fields.digestPurpose !== "drift_detection_only"
  ) {
    throw new FinancePostingIntegrityError("authority_mismatch");
  }
  const sourceTransitions = Object.freeze(
    readExactDataArray(fields.sourceTransitions, 0, envelope.maxAllocations).map(
      readUnverifiedRefundSourceConsumptionTransition
    )
  );
  const core = Object.freeze({
    kind: "unverified_refund_source_consumption_binding" as const,
    schemaVersion: 1 as const,
    bindingId: readFinancePostingIdentifier(fields.bindingId),
    authorizationStatus: "unverified" as const,
    atomicityStatus: "unverified" as const,
    digestPurpose: "drift_detection_only" as const,
    allocationAuthorityRef: readRefundPostingAuthorityRef(fields.allocationAuthorityRef, [
      "refund_posting_allocation_authority"
    ]),
    sourceTransitions,
    observedAt: readFinancePostingInstant(fields.observedAt)
  });
  const bindingDigest = readFinancePostingDigest(fields.bindingDigest);
  if (bindingDigest !== hashFinanceCommandPayload(core)) {
    throw new FinancePostingIntegrityError("evidence_mismatch");
  }
  const binding = Object.freeze({ ...core, bindingDigest });
  assertRefundSourceConsumptionBindingMatchesAllocation(binding, allocation);
  return binding;
}
