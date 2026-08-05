import {
  allActivePayoutLots,
  assertConservation,
  assertFreshHistoryIdentity,
  assertPayableLotReferenceStateVersion,
  assertPayoutReturnSource,
  assertSelectionBoundToState,
  buildNextPayableLotReferenceState,
  childLot,
  compareAvailableLots,
  compareCodeUnits,
  consumeLot,
  createPayoutNoTransferOutcomeAuthority,
  createPayoutPaidAuthority,
  createPayoutRequestAuthority,
  createPayoutReturnAuthority,
  exactWholeLotOutputRows,
  freezeAllocation,
  freezePayableLotHistoryRecord,
  freezePayableLotReferenceStateTransition,
  freezeSelection,
  hydrateSelection,
  moveSelection,
  safeSourceKey,
  sameSelection,
  scopedLots
} from "./source-lot-integrity";
import { rebuildPayableLotReferenceState } from "./source-lot-reference";
import {
  payoutExecutionExternalGateValues,
  type PayableLotAllocation,
  type PayableLotPayoutExecutionPrerequisite,
  type PayableLotReferenceState,
  type PayableLotReferenceStateTransition,
  type PayableLotSelection,
  type PayoutNoTransferOutcomeAuthority
} from "./source-lot-types";
import { exactDataRecord, fail, identifier, instant, money } from "./source-lot-validation";
export function releasePayoutPendingPayableLots(
  input: unknown
): PayableLotReferenceStateTransition {
  const fields = exactDataRecord(input, [
    "state",
    "expectedVersion",
    "payoutRequestId",
    "authority",
    "operationId",
    "sourceKey",
    "occurredAt",
    "outputLotIds"
  ]);
  const state = rebuildPayableLotReferenceState(fields.state);
  assertPayableLotReferenceStateVersion(state, fields.expectedVersion);
  const payoutRequestId = identifier(fields.payoutRequestId);
  const authority = createPayoutNoTransferOutcomeAuthority(fields.authority);
  if (authority.payoutRequestId !== payoutRequestId) fail("invalid_field");
  const occurredAt = instant(fields.occurredAt);
  if (authority.decidedAt !== occurredAt) fail("invalid_field");
  const operationId = identifier(fields.operationId);
  const sourceKey = safeSourceKey(fields.sourceKey);
  if (
    sourceKey.kind !== "payout" ||
    sourceKey.operation !== "released" ||
    sourceKey.sourceId !== payoutRequestId
  ) {
    fail("invalid_field");
  }
  assertFreshHistoryIdentity(state, operationId, sourceKey);
  assertBridgeNoTransferOutcomeMatches(state, payoutRequestId, authority);
  const lots = allActivePayoutLots(state, payoutRequestId);
  const outputRows = exactWholeLotOutputRows(
    fields.outputLotIds,
    lots.map((lot) => lot.lotId),
    state.lots
  );
  const consumed = lots.map((lot) => consumeLot(lot, operationId, occurredAt));
  const created = lots.map((lot) => {
    const outputId = outputRows.get(lot.lotId);
    if (!outputId) return fail("selection_mismatch");
    return childLot({
      parent: lot,
      lotId: outputId,
      amountMinor: lot.amount.amountMinor,
      bucket: "available",
      operationId,
      createdAt: occurredAt,
      becameAvailableAt: lot.becameAvailableAt,
      payoutRequestId: null,
      refundId: null
    });
  });
  assertConservation(lots, created);
  const record = freezePayableLotHistoryRecord({
    kind: "payout_released",
    operationId,
    sourceKey,
    previousVersion: state.version,
    nextVersion: state.version + 1,
    occurredAt,
    consumedLotIds: consumed.map((lot) => lot.lotId),
    createdLotIds: created.map((lot) => lot.lotId),
    referencedLotIds: [],
    refundOrigins: [],
    chargebackAllocations: [],
    reserveAllocation: null,
    paymentIntegrity: null,
    blocks: null,
    authority
  });
  const nextState = buildNextPayableLotReferenceState(state, consumed, created, record);
  return freezePayableLotReferenceStateTransition(state, nextState, consumed, created, record);
}

export function consumePaidPayoutPayableLots(input: unknown): PayableLotReferenceStateTransition {
  const fields = exactDataRecord(input, [
    "state",
    "expectedVersion",
    "payoutRequestId",
    "authority",
    "operationId",
    "sourceKey",
    "occurredAt"
  ]);
  const state = rebuildPayableLotReferenceState(fields.state);
  assertPayableLotReferenceStateVersion(state, fields.expectedVersion);
  const payoutRequestId = identifier(fields.payoutRequestId);
  const authority = createPayoutPaidAuthority(fields.authority);
  if (authority.payoutRequestId !== payoutRequestId) fail("invalid_field");
  const occurredAt = instant(fields.occurredAt);
  if (authority.transferredAt !== occurredAt) fail("invalid_field");
  if (
    state.history.some(
      (record) =>
        record.authority?.kind === "payout_paid" &&
        record.authority.bankReference === authority.bankReference
    )
  ) {
    fail("duplicate_operation_source");
  }
  const operationId = identifier(fields.operationId);
  const sourceKey = safeSourceKey(fields.sourceKey);
  if (
    sourceKey.kind !== "payout" ||
    sourceKey.operation !== "paid" ||
    sourceKey.sourceId !== payoutRequestId
  ) {
    fail("invalid_field");
  }
  assertFreshHistoryIdentity(state, operationId, sourceKey);
  if (
    state.history.some(
      (record) =>
        record.authority?.kind === "refund_bridge_payout_failed" &&
        record.authority.payoutRequestId === payoutRequestId
    )
  ) {
    fail("release_blocked");
  }
  const lots = allActivePayoutLots(state, payoutRequestId);
  const consumed = lots.map((lot) => consumeLot(lot, operationId, occurredAt));
  const record = freezePayableLotHistoryRecord({
    kind: "payout_paid",
    operationId,
    sourceKey,
    previousVersion: state.version,
    nextVersion: state.version + 1,
    occurredAt,
    consumedLotIds: consumed.map((lot) => lot.lotId),
    createdLotIds: [],
    referencedLotIds: [],
    refundOrigins: [],
    chargebackAllocations: [],
    reserveAllocation: null,
    paymentIntegrity: null,
    blocks: null,
    authority
  });
  const nextState = buildNextPayableLotReferenceState(state, consumed, [], record);
  return freezePayableLotReferenceStateTransition(state, nextState, consumed, [], record);
}

function assertBridgeNoTransferOutcomeMatches(
  state: PayableLotReferenceState,
  payoutRequestId: string,
  authority: PayoutNoTransferOutcomeAuthority
): void {
  const bridgeRecords = state.history.filter(
    (record) =>
      record.authority?.kind === "refund_bridge_payout_failed" &&
      record.authority.payoutRequestId === payoutRequestId
  );
  if (
    bridgeRecords.some((record) => {
      const bridge = record.authority;
      return (
        bridge?.kind !== "refund_bridge_payout_failed" ||
        !sameNoTransferOutcome(bridge.payoutOutcomeAuthority, authority)
      );
    })
  ) {
    fail("selection_mismatch");
  }
}

function sameNoTransferOutcome(
  left: PayoutNoTransferOutcomeAuthority,
  right: PayoutNoTransferOutcomeAuthority
): boolean {
  return (
    left.kind === right.kind &&
    left.authorityId === right.authorityId &&
    left.version === right.version &&
    left.payoutRequestId === right.payoutRequestId &&
    left.outcome === right.outcome &&
    left.bankInitiation === right.bankInitiation &&
    left.bankDebit === right.bankDebit &&
    left.evidenceId === right.evidenceId &&
    left.decidedAt === right.decidedAt
  );
}

export function createReturnedPayoutReservedPayableLots(
  input: unknown
): PayableLotReferenceStateTransition {
  const fields = exactDataRecord(input, [
    "state",
    "expectedVersion",
    "payoutRequestId",
    "authority",
    "operationId",
    "sourceKey",
    "occurredAt",
    "outputLotIds"
  ]);
  const state = rebuildPayableLotReferenceState(fields.state);
  assertPayableLotReferenceStateVersion(state, fields.expectedVersion);
  const payoutRequestId = identifier(fields.payoutRequestId);
  const authority = createPayoutReturnAuthority(fields.authority);
  if (authority.payoutRequestId !== payoutRequestId) fail("invalid_field");
  const occurredAt = instant(fields.occurredAt);
  if (authority.returnedAt !== occurredAt) fail("invalid_field");
  const paidRecord = state.history.find(
    (record) =>
      record.kind === "payout_paid" &&
      record.authority?.kind === "payout_paid" &&
      record.authority.payoutRequestId === payoutRequestId
  );
  if (!paidRecord || paidRecord.authority?.kind !== "payout_paid") fail("invalid_field");
  if (paidRecord.authority.bankReference !== authority.bankReference) fail("invalid_field");
  if (
    state.history.some(
      (record) =>
        record.kind === "payout_returned_reserved" &&
        record.referencedLotIds.some((lotId) => paidRecord.consumedLotIds.includes(lotId))
    )
  ) {
    fail("lot_already_consumed");
  }
  const operationId = identifier(fields.operationId);
  const sourceKey = safeSourceKey(fields.sourceKey);
  assertPayoutReturnSource(authority, sourceKey);
  assertFreshHistoryIdentity(state, operationId, sourceKey);
  const paidLots = paidRecord.consumedLotIds.map((lotId) => {
    const lot = state.lots.find((candidate) => candidate.lotId === lotId);
    if (!lot || lot.status !== "consumed" || lot.payoutRequestId !== payoutRequestId) {
      return fail("lineage_invalid");
    }
    return lot;
  });
  const outputRows = exactWholeLotOutputRows(
    fields.outputLotIds,
    paidRecord.consumedLotIds,
    state.lots
  );
  const created = paidLots.map((lot) => {
    const outputId = outputRows.get(lot.lotId);
    if (!outputId) return fail("selection_mismatch");
    return childLot({
      parent: lot,
      lotId: outputId,
      amountMinor: lot.amount.amountMinor,
      bucket: "reserved",
      operationId,
      createdAt: occurredAt,
      becameAvailableAt: null,
      payoutRequestId: null,
      refundId: null
    });
  });
  const record = freezePayableLotHistoryRecord({
    kind: "payout_returned_reserved",
    operationId,
    sourceKey,
    previousVersion: state.version,
    nextVersion: state.version + 1,
    occurredAt,
    consumedLotIds: [],
    createdLotIds: created.map((lot) => lot.lotId),
    referencedLotIds: paidRecord.consumedLotIds,
    refundOrigins: [],
    chargebackAllocations: [],
    reserveAllocation: null,
    paymentIntegrity: null,
    blocks: null,
    authority
  });
  const nextState = buildNextPayableLotReferenceState(state, [], created, record);
  return freezePayableLotReferenceStateTransition(state, nextState, [], created, record);
}

export function selectPayoutPayableLots(input: unknown): PayableLotSelection {
  const fields = exactDataRecord(input, ["state", "expectedVersion", "astrologerUserId", "amount"]);
  const state = rebuildPayableLotReferenceState(fields.state);
  assertPayableLotReferenceStateVersion(state, fields.expectedVersion);
  const astrologerUserId = identifier(fields.astrologerUserId);
  if (astrologerUserId !== state.astrologerUserId) fail("owner_currency_mismatch");
  const amount = money(fields.amount, true, "invalid_field");
  const lots = scopedLots(state.lots, astrologerUserId, amount.currency);
  const blockedOrders = new Set(
    state.chargebackRestrictions
      .filter(
        (restriction) =>
          restriction.status === "active" || restriction.status === "allocation_blocked"
      )
      .map((restriction) => restriction.orderId)
  );
  const candidates = lots
    .filter(
      (lot) =>
        lot.status === "active" && lot.bucket === "available" && !blockedOrders.has(lot.sourceId)
    )
    .sort(compareAvailableLots);
  let remaining = amount.amountMinor;
  const allocations: PayableLotAllocation[] = [];
  for (const lot of candidates) {
    if (remaining === 0) break;
    const amountMinor = Math.min(remaining, lot.amount.amountMinor);
    allocations.push(freezeAllocation(lot, amountMinor));
    remaining -= amountMinor;
  }
  if (remaining !== 0) fail("insufficient_lot_funds");

  return freezeSelection({
    kind: "payout",
    stateVersion: state.version,
    stateDigest: state.stateDigest,
    astrologerUserId,
    currency: "RUB",
    orderId: null,
    totalAmountMinor: amount.amountMinor,
    allocations
  });
}

export function inspectPayoutExecutionSourceLotPrerequisite(
  input: unknown
): PayableLotPayoutExecutionPrerequisite {
  const fields = exactDataRecord(input, ["state", "expectedVersion"]);
  const state = rebuildPayableLotReferenceState(fields.state);
  assertPayableLotReferenceStateVersion(state, fields.expectedVersion);
  const blockingChargebackCaseIds = [
    ...new Set(
      state.chargebackRestrictions
        .filter(
          (restriction) =>
            restriction.status === "active" || restriction.status === "allocation_blocked"
        )
        .map((restriction) => restriction.chargebackCaseId)
    )
  ].sort(compareCodeUnits);
  const unresolvedRefundIds = state.history
    .filter((record) => record.authority?.kind === "refund_approval")
    .filter((record) => {
      if (record.authority?.kind !== "refund_approval") return false;
      const refundId = record.authority.refundId;
      return !state.history.some(
        (candidate) =>
          (candidate.authority?.kind === "refund_confirmed" ||
            candidate.authority?.kind === "refund_failed") &&
          candidate.authority.refundId === refundId
      );
    })
    .map((record) =>
      record.authority?.kind === "refund_approval" ? record.authority.refundId : ""
    );
  const activeRefundPendingIds = state.lots
    .filter((lot) => lot.status === "active" && lot.bucket === "refund_pending")
    .map((lot) => lot.refundId)
    .filter((refundId): refundId is string => refundId !== null);
  const blockingRefundIds = [...new Set([...unresolvedRefundIds, ...activeRefundPendingIds])]
    .filter((refundId) => refundId.length > 0)
    .sort(compareCodeUnits);
  return Object.freeze({
    kind: "source_lot_payout_execution_prerequisite",
    status:
      blockingChargebackCaseIds.length > 0 || blockingRefundIds.length > 0
        ? "blocked"
        : "source_lot_clear",
    stateVersion: state.version,
    stateDigest: state.stateDigest,
    astrologerUserId: state.astrologerUserId,
    currency: state.currency,
    blockingChargebackCaseIds: Object.freeze(blockingChargebackCaseIds),
    blockingRefundIds: Object.freeze(blockingRefundIds),
    remainingExternalGates: Object.freeze([...payoutExecutionExternalGateValues])
  });
}

export function movePayoutSelectionToPending(input: unknown): PayableLotReferenceStateTransition {
  const fields = exactDataRecord(input, [
    "state",
    "expectedVersion",
    "selection",
    "authority",
    "payoutRequestId",
    "operationId",
    "sourceKey",
    "occurredAt",
    "outputLotIds"
  ]);
  const state = rebuildPayableLotReferenceState(fields.state);
  assertPayableLotReferenceStateVersion(state, fields.expectedVersion);
  const selection = hydrateSelection(fields.selection);
  assertSelectionBoundToState(selection, state);
  if (selection.kind !== "payout") fail("selection_mismatch");
  const canonicalSelection = selectPayoutPayableLots({
    state,
    expectedVersion: state.version,
    astrologerUserId: selection.astrologerUserId,
    amount: { amountMinor: selection.totalAmountMinor, currency: selection.currency }
  });
  if (!sameSelection(selection, canonicalSelection)) fail("selection_mismatch");
  const authority = createPayoutRequestAuthority(fields.authority);
  const payoutRequestId = identifier(fields.payoutRequestId);
  if (
    authority.payoutRequestId !== payoutRequestId ||
    authority.astrologerUserId !== selection.astrologerUserId ||
    authority.amount.amountMinor !== selection.totalAmountMinor ||
    authority.amount.currency !== selection.currency
  ) {
    fail("selection_mismatch");
  }
  const operationId = identifier(fields.operationId);
  const sourceKey = safeSourceKey(fields.sourceKey);
  if (
    sourceKey.kind !== "payout" ||
    sourceKey.operation !== "requested" ||
    sourceKey.sourceId !== payoutRequestId
  ) {
    fail("invalid_field");
  }
  assertFreshHistoryIdentity(state, operationId, sourceKey);
  const moved = moveSelection({
    lots: state.lots,
    selection,
    expectedKind: "payout",
    targetBucket: "payout_pending",
    operationId,
    occurredAt: fields.occurredAt,
    outputLotIds: fields.outputLotIds,
    payoutRequestId,
    refundId: null,
    payoutAllocations: authority.allocations
  });
  const record = freezePayableLotHistoryRecord({
    kind: "payout_requested",
    operationId,
    sourceKey,
    previousVersion: state.version,
    nextVersion: state.version + 1,
    occurredAt: instant(fields.occurredAt),
    consumedLotIds: moved.consumedLots.map((lot) => lot.lotId),
    createdLotIds: moved.createdLots.map((lot) => lot.lotId),
    referencedLotIds: [],
    refundOrigins: [],
    chargebackAllocations: [],
    reserveAllocation: null,
    paymentIntegrity: null,
    blocks: null,
    authority
  });
  const nextState = buildNextPayableLotReferenceState(
    state,
    moved.consumedLots,
    moved.createdLots,
    record
  );
  return freezePayableLotReferenceStateTransition(
    state,
    nextState,
    moved.consumedLots,
    moved.createdLots,
    record
  );
}
