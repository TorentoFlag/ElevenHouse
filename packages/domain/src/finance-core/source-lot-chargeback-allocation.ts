import { activeChargebackRestriction } from "./source-lot-chargeback-helpers";
import {
  chargebackPrincipalConfirmedBasisMatches,
  latestChargebackConfirmation
} from "./source-lot-chargeback-confirmed-basis";
import {
  assertFreshHistoryIdentity,
  assertPayableLotReferenceStateVersion,
  buildNextPayableLotReferenceState,
  childLot,
  consumeLot,
  createChargebackPrincipalAllocationAuthority,
  freezePayableLotHistoryRecord,
  freezePayableLotReferenceStateTransition,
  safeSourceKey
} from "./source-lot-integrity";
import {
  exactRequestedLotAmounts,
  partialLotRemainderOutputs
} from "./source-lot-operation-helpers";
import { rebuildPayableLotReferenceState } from "./source-lot-reference";
import {
  type ChargebackLotAllocation,
  type PayableLotReferenceStateTransition,
  type PayableSourceLot
} from "./source-lot-types";
import { exactDataRecord, fail, identifier, instant } from "./source-lot-validation";
export function allocateChargebackPrincipalPayableLots(
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
  const authority = createChargebackPrincipalAllocationAuthority(fields.authority);
  const operationId = identifier(fields.operationId);
  const occurredAt = instant(fields.occurredAt);
  const sourceKey = safeSourceKey(fields.sourceKey);
  if (
    sourceKey.kind !== "chargeback" ||
    sourceKey.operation !== "principal_allocated" ||
    sourceKey.sourceId !== authority.accountingAllocationRevisionId ||
    authority.astrologerUserId !== state.astrologerUserId
  ) {
    fail("invalid_field");
  }
  assertFreshHistoryIdentity(state, operationId, sourceKey);
  const restriction = activeChargebackRestriction(state, authority.chargebackCaseId);
  const latestConfirmation = latestChargebackConfirmation(state, authority.chargebackCaseId);
  const priorPrincipalAllocations = state.history.filter(
    (record) =>
      record.authority?.kind === "chargeback_principal_allocation" &&
      record.authority.chargebackCaseId === authority.chargebackCaseId
  );
  const lastPrincipalAllocation = priorPrincipalAllocations.at(-1)?.authority;
  if (
    restriction.orderId !== authority.orderId ||
    restriction.astrologerUserId !== authority.astrologerUserId ||
    restriction.disputedAmount.currency !== authority.payableAmount.currency ||
    !chargebackPrincipalConfirmedBasisMatches(authority, restriction, latestConfirmation) ||
    (lastPrincipalAllocation?.kind === "chargeback_principal_allocation" &&
      (authority.accountingAllocationId !== lastPrincipalAllocation.accountingAllocationId ||
        authority.accountingAllocationVersion !==
          lastPrincipalAllocation.accountingAllocationVersion + 1)) ||
    (!lastPrincipalAllocation && authority.accountingAllocationVersion !== 1) ||
    state.history.some(
      (record) =>
        record.authority?.kind === "chargeback_principal_allocation" &&
        record.authority.accountingAllocationRevisionId === authority.accountingAllocationRevisionId
    )
  ) {
    fail("selection_mismatch");
  }
  const requests = exactRequestedLotAmounts(fields.requestedLots, true);
  if (
    requests.reduce((sum, request) => sum + BigInt(request.amountMinor), 0n) !==
    BigInt(authority.payableAmount.amountMinor)
  ) {
    fail("selection_mismatch");
  }
  const priorAllocated = state.history
    .filter(
      (record) =>
        (record.authority?.kind === "chargeback_principal_allocation" ||
          record.authority?.kind === "chargeback_recovery_collection") &&
        record.authority.chargebackCaseId === authority.chargebackCaseId
    )
    .reduce(
      (sum, record) =>
        sum +
        record.chargebackAllocations.reduce(
          (recordSum, allocation) => recordSum + BigInt(allocation.allocatedAmountMinor),
          0n
        ),
      0n
    );
  if (
    priorAllocated + BigInt(authority.payableAmount.amountMinor) >
    BigInt(restriction.disputedAmount.amountMinor)
  ) {
    fail("conservation_violation");
  }
  const outputs = partialLotRemainderOutputs(fields.outputLotIds, requests, state.lots);
  const consumed: PayableSourceLot[] = [];
  const created: PayableSourceLot[] = [];
  const allocations: ChargebackLotAllocation[] = [];
  for (const request of requests) {
    const lot = state.lots.find((candidate) => candidate.lotId === request.lotId);
    if (!lot || lot.sourceId !== authority.orderId) fail("selection_mismatch");
    if (lot.status !== "active") fail("lot_already_consumed");
    if (lot.bucket !== "pending" && lot.bucket !== "available" && lot.bucket !== "reserved") {
      fail("lot_bucket_ineligible");
    }
    if (request.amountMinor > lot.amount.amountMinor) fail("insufficient_lot_funds");
    const remainderMinor = lot.amount.amountMinor - request.amountMinor;
    const remainderLotId = outputs.get(lot.lotId) ?? null;
    if (remainderMinor > 0 !== (remainderLotId !== null)) fail("selection_mismatch");
    consumed.push(consumeLot(lot, operationId, occurredAt));
    if (remainderMinor > 0) {
      created.push(
        childLot({
          parent: lot,
          lotId: remainderLotId as string,
          amountMinor: remainderMinor,
          bucket: lot.bucket,
          operationId,
          createdAt: occurredAt,
          becameAvailableAt: lot.becameAvailableAt,
          payoutRequestId: null,
          refundId: null
        })
      );
    }
    allocations.push(
      Object.freeze({
        sourceLotId: lot.lotId,
        rootLotId: lot.rootLotId,
        originalBucket: lot.bucket as "pending" | "available" | "reserved",
        allocatedAmountMinor: request.amountMinor,
        remainderLotId
      })
    );
  }
  const record = freezePayableLotHistoryRecord({
    kind: "chargeback_principal_allocated",
    operationId,
    sourceKey,
    previousVersion: state.version,
    nextVersion: state.version + 1,
    occurredAt,
    consumedLotIds: consumed.map((lot) => lot.lotId),
    createdLotIds: created.map((lot) => lot.lotId),
    referencedLotIds: [],
    refundOrigins: [],
    chargebackAllocations: allocations,
    reserveAllocation: null,
    paymentIntegrity: null,
    blocks: null,
    authority
  });
  const nextState = buildNextPayableLotReferenceState(state, consumed, created, record);
  return freezePayableLotReferenceStateTransition(state, nextState, consumed, created, record);
}
