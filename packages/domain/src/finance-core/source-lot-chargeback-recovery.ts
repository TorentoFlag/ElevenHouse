import { chargebackRestrictionForRecovery } from "./source-lot-chargeback-helpers";
import {
  assertFreshHistoryIdentity,
  assertPayableLotReferenceStateVersion,
  buildNextPayableLotReferenceState,
  childLot,
  consumeLot,
  createChargebackRecoveryCollectionAuthority,
  freezePayableLotHistoryRecord,
  freezePayableLotReferenceStateTransition,
  safeSourceKey
} from "./source-lot-integrity";
import {
  exactRequestedLotAmounts,
  hasUnresolvedRefundForOrder,
  partialLotRemainderOutputs
} from "./source-lot-operation-helpers";
import { rebuildPayableLotReferenceState } from "./source-lot-reference";
import {
  type ChargebackLotAllocation,
  type ChargebackRecoveryCollectionAuthority,
  type ChargebackRestriction,
  type PayableLotReferenceState,
  type PayableLotReferenceStateTransition,
  type PayableSourceLot
} from "./source-lot-types";
import { exactDataRecord, fail, identifier, instant } from "./source-lot-validation";
export function collectChargebackRecoveryPayableLots(
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
  const authority = createChargebackRecoveryCollectionAuthority(fields.authority);
  const operationId = identifier(fields.operationId);
  const occurredAt = instant(fields.occurredAt);
  const sourceKey = safeSourceKey(fields.sourceKey);
  if (
    sourceKey.kind !== "chargeback" ||
    sourceKey.operation !== "recovery_collected" ||
    sourceKey.sourceId !== authority.recoveryCollectionId ||
    authority.astrologerUserId !== state.astrologerUserId ||
    authority.collectedAt !== occurredAt
  ) {
    fail("invalid_field");
  }
  assertFreshHistoryIdentity(state, operationId, sourceKey);
  const restriction = chargebackRestrictionForRecovery(state, authority.chargebackCaseId);
  if (
    restriction.astrologerUserId !== authority.astrologerUserId ||
    restriction.disputedAmount.currency !== authority.collectedPayableAmount.currency
  ) {
    fail("selection_mismatch");
  }
  const requests = exactRequestedLotAmounts(fields.requestedLots);
  if (
    requests.reduce((sum, request) => sum + BigInt(request.amountMinor), 0n) !==
    BigInt(authority.collectedPayableAmount.amountMinor)
  ) {
    fail("selection_mismatch");
  }
  const priorRemoved = state.history
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
    priorRemoved + BigInt(authority.collectedPayableAmount.amountMinor) >
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
    if (!lot) fail("selection_mismatch");
    assertRecoveryCollectionLotEligible(state, restriction, authority, lot);
    if (lot.status !== "active") fail("lot_already_consumed");
    if (lot.bucket !== "pending" && lot.bucket !== "available" && lot.bucket !== "reserved") {
      fail("lot_bucket_ineligible");
    }
    const originalBucket = lot.bucket;
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
        originalBucket,
        allocatedAmountMinor: request.amountMinor,
        remainderLotId
      })
    );
  }
  const record = freezePayableLotHistoryRecord({
    kind: "chargeback_recovery_collected",
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

function assertRecoveryCollectionLotEligible(
  state: PayableLotReferenceState,
  restriction: ChargebackRestriction,
  authority: ChargebackRecoveryCollectionAuthority,
  lot: PayableSourceLot
): void {
  const source = authority.collectionSource;
  if (lot.sourceId !== source.sourceOrderId) fail("selection_mismatch");
  const hasConflictingRestriction = state.chargebackRestrictions.some(
    (candidate) =>
      candidate.orderId === lot.sourceId &&
      candidate.chargebackCaseId !== restriction.chargebackCaseId &&
      (candidate.status === "active" || candidate.status === "allocation_blocked")
  );
  if (hasConflictingRestriction) fail("release_blocked");
  if (source.kind === "future_payable") {
    if (source.sourceOrderId === restriction.orderId) fail("selection_mismatch");
    if (hasUnresolvedRefundForOrder(state, source.sourceOrderId)) fail("release_blocked");
    return;
  }
  if (
    source.sourceOrderId !== restriction.orderId ||
    lot.bucket !== "reserved" ||
    lot.payoutAllocationId !== source.payoutAllocationId
  ) {
    fail("selection_mismatch");
  }
  const lineageIds = new Set<string>();
  let cursor: PayableSourceLot | undefined = lot;
  while (cursor) {
    if (lineageIds.has(cursor.lotId)) fail("lineage_invalid");
    lineageIds.add(cursor.lotId);
    const parentLotId: string | null = cursor.parentLotId;
    cursor =
      parentLotId === null
        ? undefined
        : state.lots.find((candidate) => candidate.lotId === parentLotId);
  }
  const returnedRecord = state.history.find(
    (record) =>
      record.kind === "payout_returned_reserved" &&
      record.createdLotIds.some((lotId) => lineageIds.has(lotId))
  );
  if (
    !returnedRecord ||
    returnedRecord.authority?.kind !== "payout_return" ||
    returnedRecord.authority.payoutRequestId !== source.payoutRequestId ||
    returnedRecord.authority.authorityId !== source.payoutReturnAuthorityId ||
    returnedRecord.authority.version !== source.payoutReturnAuthorityVersion ||
    returnedRecord.authority.evidenceId !== source.payoutReturnEvidenceId
  ) {
    fail("selection_mismatch");
  }
}
