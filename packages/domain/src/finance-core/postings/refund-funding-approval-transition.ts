import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import type { Money } from "../../money";
import {
  compareFinancePostingInstants,
  FinancePostingIntegrityError,
  readExactDataArray,
  readExactDataRecord,
  readFinancePostingInstant,
  sameCanonicalFinancePostingValue
} from "./posting-codec";
import {
  normalizeFinancePostingDecoderEnvelope,
  type FinancePostingDecoderEnvelope
} from "./posting-decoder-envelope";
import {
  expectedRefundFundingSources,
  refundFundingAllocationRef,
  type ExpectedRefundFundingSource
} from "./refund-funding-allocation-map";
import {
  assertRefundFundingPositionScope,
  buildRefundFundingNextPosition,
  readUnverifiedRefundFundingPosition,
  refundFundingPositionRef
} from "./refund-funding-position-codec";
import { readRefundFundingReservationAuthorityBinding } from "./refund-funding-source-codec";
import type {
  RefundFundingPositionTransition,
  RefundFundingReservationAuthorityBinding,
  UnverifiedRefundFundingPosition,
  UnverifiedRefundFundingTransitionBinding
} from "./refund-funding-position-types";
import { readRefundPostingAllocationAuthority } from "./refund-posting-allocation-codec";

export function buildRefundFundingApprovalTransition(
  input: unknown,
  envelopeInput: FinancePostingDecoderEnvelope
): UnverifiedRefundFundingTransitionBinding {
  const envelope = normalizeFinancePostingDecoderEnvelope(envelopeInput);
  const fields = readExactDataRecord(input, [
    "allocation",
    "resolvedPositions",
    "reservationAuthorities",
    "occurredAt"
  ]);
  const allocation = readRefundPostingAllocationAuthority(fields.allocation, envelope);
  const occurredAt = readFinancePostingInstant(fields.occurredAt);
  if (compareFinancePostingInstants(occurredAt, allocation.approvedAt) < 0) chronology();
  const expected = expectedRefundFundingSources(allocation);
  if (expected.length > envelope.maxAllocations) envelopeExceeded();
  const positions = readExactDataArray(
    fields.resolvedPositions,
    expected.length,
    envelope.maxAllocations
  ).map((row) => readUnverifiedRefundFundingPosition(row, envelope));
  const expectedComponentCount = expected.reduce(
    (total, source) => total + source.components.length,
    0
  );
  const reservations = readExactDataArray(
    fields.reservationAuthorities,
    expectedComponentCount,
    envelope.maxAllocations
  ).map(readRefundFundingReservationAuthorityBinding);
  if (positions.length !== expected.length || reservations.length !== expectedComponentCount)
    mismatch();

  const positionById = uniqueMap(positions, (row) => row.positionId);
  const reservationByComponent = uniqueMap(reservations, (row) => row.componentId);
  const transitions = Object.freeze(
    expected
      .map((source) =>
        buildApprovalTransition(
          allocation,
          source,
          positionById.get(positionId(source)),
          source.components.map((component) => reservationByComponent.get(component.componentId)),
          occurredAt
        )
      )
      .sort((left, right) =>
        left.expectedPositionRef.positionId.localeCompare(right.expectedPositionRef.positionId)
      )
  );
  if (
    transitions.length !== positionById.size ||
    expectedComponentCount !== reservationByComponent.size
  ) {
    mismatch();
  }
  const allocationAuthorityRef = refundFundingAllocationRef(allocation);
  const bindingIdentity = {
    allocationAuthorityRef,
    operation: "approved" as const,
    expectedPositionRefs: transitions.map((row) => row.expectedPositionRef)
  };
  const core = Object.freeze({
    kind: "unverified_refund_funding_transition_binding" as const,
    schemaVersion: 1 as const,
    authorizationStatus: "unverified" as const,
    atomicityStatus: "unverified" as const,
    digestPurpose: "drift_detection_only" as const,
    bindingId: `refund-funding-binding:${hashFinanceCommandPayload(bindingIdentity)}`,
    operation: "approved" as const,
    positionMutationMode: "patch_existing_only" as const,
    allocationAuthorityRef,
    priorTransitionBindingRef: null,
    terminalAuthorityRef: null,
    transitions,
    occurredAt
  });
  return Object.freeze({ ...core, bindingDigest: hashFinanceCommandPayload(core) });
}

function buildApprovalTransition(
  allocation: ReturnType<typeof readRefundPostingAllocationAuthority>,
  expected: ExpectedRefundFundingSource,
  position: UnverifiedRefundFundingPosition | undefined,
  reservations: readonly (RefundFundingReservationAuthorityBinding | undefined)[],
  occurredAt: string
): RefundFundingPositionTransition {
  if (!position || reservations.some((reservation) => !reservation)) mismatch();
  assertRefundFundingPositionScope(position, allocation);
  if (compareFinancePostingInstants(occurredAt, position.updatedAt) < 0) chronology();
  if (
    !sameCanonicalFinancePostingValue(position.source, expected.source) ||
    position.activeReservation !== null ||
    position.reservedAmount.amountMinor !== 0 ||
    position.freeAmount.amountMinor < expected.amount.amountMinor ||
    (expected.exactCapacity !== null &&
      !sameCanonicalFinancePostingValue(position.capacity, expected.exactCapacity)) ||
    (expected.expectedConsumed !== null &&
      !sameCanonicalFinancePostingValue(position.consumedAmount, expected.expectedConsumed))
  ) {
    mismatch();
  }
  const components = Object.freeze(
    expected.components.map((component, index) => {
      const reservation = reservations[index];
      if (
        !reservation ||
        reservation.componentId !== component.componentId ||
        reservation.sourcePositionId !== position.positionId ||
        !validReservationReference(component.requiredReservationRef, reservation)
      ) {
        return mismatch();
      }
      return Object.freeze({
        componentId: component.componentId,
        reservationAuthorityRef: reservation.reference,
        amount: component.amount
      });
    })
  );
  const allocationAuthorityRef = refundFundingAllocationRef(allocation);
  const activeReservation = Object.freeze({
    allocationAuthorityRef,
    components,
    totalAmount: expected.amount,
    reservedAt: occurredAt
  });
  const nextPosition = buildRefundFundingNextPosition(
    position,
    {
      free: money(position.freeAmount.amountMinor - expected.amount.amountMinor),
      reserved: expected.amount,
      consumed: position.consumedAmount
    },
    activeReservation,
    occurredAt
  );
  return Object.freeze({
    source: expected.source,
    components,
    amount: expected.amount,
    transition: "free_to_reserved" as const,
    expectedPositionRef: refundFundingPositionRef(position),
    nextPosition
  });
}

function validReservationReference(
  expected: ExpectedRefundFundingSource["components"][number]["requiredReservationRef"],
  input: RefundFundingReservationAuthorityBinding
): boolean {
  if (expected === null) {
    return input.reference.kind === "payable_lot_operation_receipt";
  }
  return sameCanonicalFinancePostingValue(input.reference, expected);
}

function positionId(expected: ExpectedRefundFundingSource): string {
  return `refund-funding-position:${hashFinanceCommandPayload(expected.source)}`;
}

function uniqueMap<T>(rows: readonly T[], key: (row: T) => string): Map<string, T> {
  const result = new Map<string, T>();
  for (const row of rows) {
    const value = key(row);
    if (result.has(value)) mismatch();
    result.set(value, row);
  }
  return result;
}

function money(amountMinor: number): Money {
  return Object.freeze({ amountMinor, currency: "RUB" });
}
function envelopeExceeded(): never {
  throw new FinancePostingIntegrityError("decoder_envelope_exceeded");
}
function chronology(): never {
  throw new FinancePostingIntegrityError("invalid_chronology");
}
function mismatch(): never {
  throw new FinancePostingIntegrityError("authority_mismatch");
}
