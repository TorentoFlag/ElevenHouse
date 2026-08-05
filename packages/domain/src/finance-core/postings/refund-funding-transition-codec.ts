import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import {
  FinancePostingIntegrityError,
  readExactDataArray,
  readExactDataRecord,
  readFinancePostingDigest,
  readFinancePostingIdentifier,
  readFinancePostingInstant,
  sameCanonicalFinancePostingValue
} from "./posting-codec";
import {
  normalizeFinancePostingDecoderEnvelope,
  type FinancePostingDecoderEnvelope
} from "./posting-decoder-envelope";
import { readUnverifiedRefundFundingPosition } from "./refund-funding-position-codec";
import {
  readRefundFundingPositionRef,
  readRefundFundingReservationAuthorityRef,
  readRefundFundingSource,
  readRefundFundingTransitionBindingRef
} from "./refund-funding-source-codec";
import type {
  RefundFundingPositionTransition,
  UnverifiedRefundFundingTransitionBinding
} from "./refund-funding-position-types";
import {
  readRefundPostingAuthorityRef,
  readRefundPostingMoney
} from "./refund-posting-value-codec";

export function readUnverifiedRefundFundingTransitionBinding(
  input: unknown,
  envelopeInput: FinancePostingDecoderEnvelope
): UnverifiedRefundFundingTransitionBinding {
  const envelope = normalizeFinancePostingDecoderEnvelope(envelopeInput);
  const fields = readExactDataRecord(input, [
    "kind",
    "schemaVersion",
    "authorizationStatus",
    "atomicityStatus",
    "digestPurpose",
    "bindingId",
    "operation",
    "positionMutationMode",
    "allocationAuthorityRef",
    "priorTransitionBindingRef",
    "terminalAuthorityRef",
    "transitions",
    "occurredAt",
    "bindingDigest"
  ]);
  if (
    fields.kind !== "unverified_refund_funding_transition_binding" ||
    fields.schemaVersion !== 1 ||
    fields.authorizationStatus !== "unverified" ||
    fields.atomicityStatus !== "unverified" ||
    fields.digestPurpose !== "drift_detection_only" ||
    fields.positionMutationMode !== "patch_existing_only" ||
    (fields.operation !== "approved" &&
      fields.operation !== "confirmed" &&
      fields.operation !== "failed")
  ) {
    mismatch();
  }
  const operation = fields.operation;
  const transitions = Object.freeze(
    readExactDataArray(fields.transitions, 1, envelope.maxAllocations).map((row) =>
      readTransition(row, operation, envelope)
    )
  );
  const core = Object.freeze({
    kind: "unverified_refund_funding_transition_binding" as const,
    schemaVersion: 1 as const,
    authorizationStatus: "unverified" as const,
    atomicityStatus: "unverified" as const,
    digestPurpose: "drift_detection_only" as const,
    bindingId: readFinancePostingIdentifier(fields.bindingId),
    operation,
    positionMutationMode: "patch_existing_only" as const,
    allocationAuthorityRef: readRefundPostingAuthorityRef(fields.allocationAuthorityRef, [
      "refund_posting_allocation_authority"
    ]),
    priorTransitionBindingRef:
      fields.priorTransitionBindingRef === null
        ? null
        : readRefundFundingTransitionBindingRef(fields.priorTransitionBindingRef),
    terminalAuthorityRef:
      fields.terminalAuthorityRef === null
        ? null
        : readRefundPostingAuthorityRef(fields.terminalAuthorityRef, [
            "refund_confirmed",
            "refund_failed"
          ]),
    transitions,
    occurredAt: readFinancePostingInstant(fields.occurredAt)
  });
  assertBindingShape(core);
  const bindingDigest = readFinancePostingDigest(fields.bindingDigest);
  if (bindingDigest !== hashFinanceCommandPayload(core)) evidenceMismatch();
  return Object.freeze({ ...core, bindingDigest });
}

function readTransition(
  input: unknown,
  operation: "approved" | "confirmed" | "failed",
  envelope: FinancePostingDecoderEnvelope
): RefundFundingPositionTransition {
  const fields = readExactDataRecord(input, [
    "source",
    "components",
    "amount",
    "transition",
    "expectedPositionRef",
    "nextPosition"
  ]);
  const expectedTransition =
    operation === "approved"
      ? "free_to_reserved"
      : operation === "confirmed"
        ? "reserved_to_consumed"
        : "reserved_to_free";
  if (fields.transition !== expectedTransition) mismatch();
  const source = readRefundFundingSource(fields.source);
  const components = Object.freeze(
    readExactDataArray(fields.components, 1, envelope.maxAllocations).map((row) => {
      const component = readExactDataRecord(row, [
        "componentId",
        "reservationAuthorityRef",
        "amount"
      ]);
      return Object.freeze({
        componentId: readFinancePostingIdentifier(component.componentId),
        reservationAuthorityRef: readRefundFundingReservationAuthorityRef(
          component.reservationAuthorityRef
        ),
        amount: readRefundPostingMoney(component.amount, true)
      });
    })
  );
  const amount = readRefundPostingMoney(fields.amount, true);
  const expectedPositionRef = readRefundFundingPositionRef(fields.expectedPositionRef);
  const nextPosition = readUnverifiedRefundFundingPosition(fields.nextPosition, envelope);
  if (
    nextPosition.positionId !== expectedPositionRef.positionId ||
    nextPosition.version !== expectedPositionRef.version + 1 ||
    !sameCanonicalFinancePostingValue(nextPosition.source, source) ||
    (operation === "approved") !== (nextPosition.activeReservation !== null) ||
    components.reduce((sum, component) => sum + BigInt(component.amount.amountMinor), 0n) !==
      BigInt(amount.amountMinor)
  ) {
    mismatch();
  }
  if (
    nextPosition.activeReservation !== null &&
    (!sameCanonicalFinancePostingValue(nextPosition.activeReservation.components, components) ||
      !sameCanonicalFinancePostingValue(nextPosition.activeReservation.totalAmount, amount))
  ) {
    mismatch();
  }
  return Object.freeze({
    source,
    components,
    amount,
    transition: expectedTransition,
    expectedPositionRef,
    nextPosition
  });
}

function assertBindingShape(input: {
  operation: "approved" | "confirmed" | "failed";
  priorTransitionBindingRef: unknown;
  terminalAuthorityRef: { kind: string } | null;
}): void {
  if (input.operation === "approved") {
    if (input.priorTransitionBindingRef !== null || input.terminalAuthorityRef !== null) mismatch();
    return;
  }
  if (
    input.priorTransitionBindingRef === null ||
    input.terminalAuthorityRef?.kind !==
      (input.operation === "confirmed" ? "refund_confirmed" : "refund_failed")
  ) {
    mismatch();
  }
}

function evidenceMismatch(): never {
  throw new FinancePostingIntegrityError("evidence_mismatch");
}
function mismatch(): never {
  throw new FinancePostingIntegrityError("authority_mismatch");
}
