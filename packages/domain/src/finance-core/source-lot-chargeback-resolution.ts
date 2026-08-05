import {
  chargebackAllocatedByLot,
  chargebackRemovalAllocation,
  chargebackRestoredByLot
} from "./source-lot-chargeback-helpers";
import {
  assertFreshHistoryIdentity,
  assertPayableLotReferenceStateIntegrity,
  assertPayableLotReferenceStateVersion,
  buildNextPayableLotReferenceState,
  childLot,
  createChargebackLostAuthority,
  createChargebackWonAuthority,
  exactWholeLotOutputRows,
  freezePayableLotHistoryRecord,
  freezePayableLotReferenceState,
  freezePayableLotReferenceStateTransition,
  safeSourceKey
} from "./source-lot-integrity";
import { exactRequestedLotAmounts } from "./source-lot-operation-helpers";
import { rebuildPayableLotReferenceState } from "./source-lot-reference";
import {
  type ChargebackLotAllocation,
  type ChargebackRestriction,
  type ChargebackRestrictionHistoryRecord,
  type ChargebackRestrictionStateTransition,
  type PayableLotReferenceStateTransition
} from "./source-lot-types";
import { exactDataRecord, fail, identifier, instant } from "./source-lot-validation";
export function restoreChargebackWonReservedPayableLots(
  input: unknown
): PayableLotReferenceStateTransition {
  const fields = exactDataRecord(input, [
    "state",
    "expectedVersion",
    "authority",
    "requestedLots",
    "operationId",
    "sourceKey",
    "occurredAt",
    "outputLotIds"
  ]);
  const state = rebuildPayableLotReferenceState(fields.state);
  assertPayableLotReferenceStateVersion(state, fields.expectedVersion);
  const authority = createChargebackWonAuthority(fields.authority);
  const operationId = identifier(fields.operationId);
  const occurredAt = instant(fields.occurredAt);
  const sourceKey = safeSourceKey(fields.sourceKey);
  if (
    sourceKey.kind !== "chargeback" ||
    sourceKey.operation !== "won" ||
    sourceKey.sourceId !== authority.chargebackCaseId ||
    authority.wonAt !== occurredAt
  ) {
    fail("invalid_field");
  }
  assertFreshHistoryIdentity(state, operationId, sourceKey);
  const restriction = state.chargebackRestrictions.find(
    (candidate) => candidate.chargebackCaseId === authority.chargebackCaseId
  );
  if (!restriction || restriction.status !== "active") fail("release_blocked");
  const requests = exactRequestedLotAmounts(fields.requestedLots, true);
  if (
    requests.reduce((sum, request) => sum + BigInt(request.amountMinor), 0n) !==
    BigInt(authority.restoredPayableAmount.amountMinor)
  ) {
    fail("selection_mismatch");
  }
  const allocatedByLot = chargebackAllocatedByLot(state, authority.chargebackCaseId);
  const restoredByLot = chargebackRestoredByLot(state, authority.chargebackCaseId);
  for (const request of requests) {
    if (
      BigInt(request.amountMinor) + (restoredByLot.get(request.lotId) ?? 0n) >
      (allocatedByLot.get(request.lotId) ?? 0n)
    ) {
      fail("conservation_violation");
    }
  }
  const outputs = exactWholeLotOutputRows(
    fields.outputLotIds,
    requests.map((request) => request.lotId),
    state.lots
  );
  const created = requests.map((request) => {
    const parent = state.lots.find((lot) => lot.lotId === request.lotId);
    if (
      !parent ||
      parent.status !== "consumed" ||
      parent.astrologerUserId !== restriction.astrologerUserId ||
      !allocatedByLot.has(parent.lotId)
    ) {
      return fail("lineage_invalid");
    }
    return childLot({
      parent,
      lotId: outputs.get(parent.lotId) as string,
      amountMinor: request.amountMinor,
      bucket: "reserved",
      operationId,
      createdAt: occurredAt,
      becameAvailableAt: null,
      payoutRequestId: null,
      refundId: null
    });
  });
  const allocations: ChargebackLotAllocation[] = requests.map((request) => {
    const parent = state.lots.find((lot) => lot.lotId === request.lotId);
    const removal = chargebackRemovalAllocation(state, authority.chargebackCaseId, request.lotId);
    if (!parent || !removal) return fail("lineage_invalid");
    return Object.freeze({
      sourceLotId: parent.lotId,
      rootLotId: parent.rootLotId,
      originalBucket: removal.originalBucket,
      allocatedAmountMinor: request.amountMinor,
      remainderLotId: null
    });
  });
  if (
    authority.restoredPayableAmount.currency !== restriction.disputedAmount.currency ||
    authority.suspenseClearedAmount.currency !== restriction.disputedAmount.currency ||
    BigInt(authority.restoredPayableAmount.amountMinor) +
      BigInt(authority.suspenseClearedAmount.amountMinor) >
      BigInt(restriction.disputedAmount.amountMinor)
  ) {
    fail("conservation_violation");
  }
  const nextRestriction: ChargebackRestriction = Object.freeze({
    ...restriction,
    version: restriction.version + 1,
    status: "closed_won",
    canonicalEvidenceId: authority.canonicalEvidenceId,
    closedAt: occurredAt
  });
  const restrictions = state.chargebackRestrictions.map((candidate) =>
    candidate.chargebackCaseId === restriction.chargebackCaseId ? nextRestriction : candidate
  );
  const record = freezePayableLotHistoryRecord({
    kind: "chargeback_won_reserved",
    operationId,
    sourceKey,
    previousVersion: state.version,
    nextVersion: state.version + 1,
    occurredAt,
    consumedLotIds: [],
    createdLotIds: created.map((lot) => lot.lotId),
    referencedLotIds: requests.map((request) => request.lotId),
    refundOrigins: [],
    chargebackAllocations: allocations,
    reserveAllocation: null,
    paymentIntegrity: null,
    blocks: null,
    authority
  });
  const nextState = buildNextPayableLotReferenceState(state, [], created, record, restrictions);
  return freezePayableLotReferenceStateTransition(state, nextState, [], created, record);
}

export function recordChargebackLostRestrictionOutcome(
  input: unknown
): ChargebackRestrictionStateTransition {
  const fields = exactDataRecord(input, [
    "state",
    "expectedVersion",
    "authority",
    "operationId",
    "operationKey",
    "occurredAt"
  ]);
  const state = rebuildPayableLotReferenceState(fields.state);
  assertPayableLotReferenceStateVersion(state, fields.expectedVersion);
  const authority = createChargebackLostAuthority(fields.authority);
  const operationId = identifier(fields.operationId);
  const occurredAt = instant(fields.occurredAt);
  const operationKeyFields = exactDataRecord(fields.operationKey, [
    "kind",
    "restrictionId",
    "operation"
  ]);
  if (
    operationKeyFields.kind !== "chargeback_restriction" ||
    (operationKeyFields.operation !== "lost_final" &&
      operationKeyFields.operation !== "lost_allocation_closed") ||
    authority.lostAt !== occurredAt
  ) {
    fail("invalid_field");
  }
  if (
    state.history.some((record) => record.operationId === operationId) ||
    state.restrictionHistory.some((record) => record.operationId === operationId)
  ) {
    fail("duplicate_operation_source");
  }
  const operationKey = Object.freeze({
    kind: "chargeback_restriction" as const,
    restrictionId: identifier(operationKeyFields.restrictionId),
    operation: operationKeyFields.operation
  });
  if (
    state.restrictionHistory.some(
      (record) =>
        record.operationKey.restrictionId === operationKey.restrictionId &&
        record.operationKey.operation === operationKey.operation
    )
  ) {
    fail("duplicate_operation_source");
  }
  if (
    state.restrictionHistory.some(
      (record) => record.authority.accountingAllocationId === authority.accountingAllocationId
    )
  ) {
    fail("duplicate_operation_source");
  }
  const restriction = state.chargebackRestrictions.find(
    (candidate) => candidate.chargebackCaseId === authority.chargebackCaseId
  );
  if (!restriction) fail("release_blocked");
  if (operationKey.restrictionId !== restriction.restrictionId) fail("invalid_field");
  const suspenseIsZero = authority.unallocatedSuspense.amountMinor === 0;
  let kind: ChargebackRestrictionHistoryRecord["kind"];
  let status: ChargebackRestriction["status"];
  if (operationKey.operation === "lost_final") {
    if (restriction.status !== "active") fail("release_blocked");
    kind = suspenseIsZero ? "chargeback_lost_closed" : "chargeback_lost_blocked";
    status = suspenseIsZero ? "closed_lost" : "allocation_blocked";
  } else {
    if (restriction.status !== "allocation_blocked" || !suspenseIsZero) {
      fail("release_blocked");
    }
    const priorBlocked = state.restrictionHistory.find(
      (record) =>
        record.kind === "chargeback_lost_blocked" &&
        record.operationKey.restrictionId === restriction.restrictionId
    );
    if (!priorBlocked) fail("lineage_invalid");
    if (
      authority.version <= priorBlocked.authority.version ||
      authority.accountingAllocationVersion <= priorBlocked.authority.accountingAllocationVersion
    ) {
      fail("version_conflict");
    }
    kind = "chargeback_lost_allocation_closed";
    status = "closed_lost";
  }
  const nextRestriction: ChargebackRestriction = Object.freeze({
    ...restriction,
    version: restriction.version + 1,
    canonicalEvidenceId: authority.canonicalEvidenceId,
    status,
    closedAt: status === "closed_lost" ? occurredAt : null
  });
  const record: ChargebackRestrictionHistoryRecord = Object.freeze({
    kind,
    operationId,
    operationKey,
    previousVersion: state.version,
    nextVersion: state.version + 1,
    occurredAt,
    authority
  });
  const nextState = freezePayableLotReferenceState({
    version: state.version + 1,
    astrologerUserId: state.astrologerUserId,
    currency: state.currency,
    lots: state.lots,
    history: state.history,
    chargebackRestrictions: state.chargebackRestrictions.map((candidate) =>
      candidate.chargebackCaseId === restriction.chargebackCaseId ? nextRestriction : candidate
    ),
    restrictionHistory: [...state.restrictionHistory, record]
  });
  assertPayableLotReferenceStateIntegrity(nextState);
  return Object.freeze({
    kind,
    operationId,
    operationKey,
    previousVersion: state.version,
    nextVersion: nextState.version,
    previousStateDigest: state.stateDigest,
    nextStateDigest: nextState.stateDigest,
    record,
    state: nextState
  });
}
