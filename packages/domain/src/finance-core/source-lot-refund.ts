import {
  assertConservation,
  assertFreshHistoryIdentity,
  assertPayableLotReferenceStateVersion,
  assertSelectionBoundToState,
  buildNextPayableLotReferenceState,
  childLot,
  consumeLot,
  createRefundApprovalAuthority,
  createRefundBridgePayoutFailedAuthority,
  createRefundBridgePayoutPaidAuthority,
  createRefundConfirmedAuthority,
  createRefundFailedAuthority,
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
import {
  exactRequestedLotAmounts,
  partialLotRemainderOutputs
} from "./source-lot-operation-helpers";
import { rebuildPayableLotReferenceState } from "./source-lot-reference";
import {
  type PayableLotHistoryRecord,
  type PayableLotReferenceState,
  type PayableLotReferenceStateTransition,
  type PayableLotSelection,
  type PayableSourceLot,
  type RefundBridgePayoutFailedAuthority,
  type RefundBridgePayoutPaidAuthority,
  type RefundBridgePayoutPaidNoLotDecision,
  type RefundConfirmedAuthority,
  type RefundFailedAuthority
} from "./source-lot-types";
import {
  exactDataArray,
  exactDataRecord,
  fail,
  identifier,
  instant,
  integer,
  money
} from "./source-lot-validation";
export function selectRefundPayableLots(input: unknown): PayableLotSelection {
  const fields = exactDataRecord(input, [
    "state",
    "expectedVersion",
    "astrologerUserId",
    "orderId",
    "amount",
    "requestedLots"
  ]);
  const state = rebuildPayableLotReferenceState(fields.state);
  assertPayableLotReferenceStateVersion(state, fields.expectedVersion);
  const astrologerUserId = identifier(fields.astrologerUserId);
  if (astrologerUserId !== state.astrologerUserId) fail("owner_currency_mismatch");
  const orderId = identifier(fields.orderId);
  const amount = money(fields.amount, true, "invalid_field");
  if (
    state.chargebackRestrictions.some(
      (restriction) =>
        restriction.orderId === orderId &&
        (restriction.status === "active" || restriction.status === "allocation_blocked")
    )
  ) {
    fail("release_blocked");
  }
  const lots = scopedLots(state.lots, astrologerUserId, amount.currency);
  const byId = new Map(lots.map((lot) => [lot.lotId, lot] as const));
  const requests = exactDataArray(fields.requestedLots).map((value) => {
    const request = exactDataRecord(value, ["lotId", "amountMinor"]);
    return Object.freeze({
      lotId: identifier(request.lotId),
      amountMinor: integer(request.amountMinor, 1, Number.MAX_SAFE_INTEGER, "invalid_field")
    });
  });
  if (
    requests.length === 0 ||
    new Set(requests.map((item) => item.lotId)).size !== requests.length
  ) {
    fail("selection_mismatch");
  }
  if (
    requests.reduce((sum, item) => sum + BigInt(item.amountMinor), 0n) !==
    BigInt(amount.amountMinor)
  ) {
    fail("selection_mismatch");
  }
  const allocations = requests.map((request) => {
    const lot = byId.get(request.lotId);
    if (!lot || lot.sourceId !== orderId) fail("selection_mismatch");
    if (lot.status !== "active") fail("lot_already_consumed");
    if (lot.bucket !== "pending" && lot.bucket !== "available" && lot.bucket !== "reserved") {
      fail("lot_bucket_ineligible");
    }
    if (request.amountMinor > lot.amount.amountMinor) fail("insufficient_lot_funds");
    return freezeAllocation(lot, request.amountMinor);
  });

  return freezeSelection({
    kind: "refund",
    stateVersion: state.version,
    stateDigest: state.stateDigest,
    astrologerUserId,
    currency: "RUB",
    orderId,
    totalAmountMinor: amount.amountMinor,
    allocations
  });
}

export function moveRefundSelectionToPending(input: unknown): PayableLotReferenceStateTransition {
  const fields = exactDataRecord(input, [
    "state",
    "expectedVersion",
    "selection",
    "authority",
    "refundId",
    "operationId",
    "sourceKey",
    "occurredAt",
    "outputLotIds"
  ]);
  const state = rebuildPayableLotReferenceState(fields.state);
  assertPayableLotReferenceStateVersion(state, fields.expectedVersion);
  const selection = hydrateSelection(fields.selection);
  assertSelectionBoundToState(selection, state);
  if (selection.kind !== "refund" || selection.orderId === null) fail("selection_mismatch");
  const canonicalSelection = selectRefundPayableLots({
    state,
    expectedVersion: state.version,
    astrologerUserId: selection.astrologerUserId,
    orderId: selection.orderId,
    amount: { amountMinor: selection.totalAmountMinor, currency: selection.currency },
    requestedLots: selection.allocations.map((allocation) => ({
      lotId: allocation.lotId,
      amountMinor: allocation.amountMinor
    }))
  });
  if (!sameSelection(selection, canonicalSelection)) fail("selection_mismatch");
  const authority = createRefundApprovalAuthority(fields.authority);
  const refundId = identifier(fields.refundId);
  if (
    authority.refundId !== refundId ||
    authority.orderId !== selection.orderId ||
    authority.astrologerUserId !== selection.astrologerUserId ||
    authority.payableAmount.amountMinor !== selection.totalAmountMinor ||
    authority.payableAmount.currency !== selection.currency
  ) {
    fail("selection_mismatch");
  }
  const operationId = identifier(fields.operationId);
  const sourceKey = safeSourceKey(fields.sourceKey);
  if (
    sourceKey.kind !== "refund" ||
    sourceKey.operation !== "approved" ||
    sourceKey.sourceId !== refundId
  ) {
    fail("invalid_field");
  }
  assertFreshHistoryIdentity(state, operationId, sourceKey);
  const moved = moveSelection({
    lots: state.lots,
    selection,
    expectedKind: "refund",
    targetBucket: "refund_pending",
    operationId,
    occurredAt: fields.occurredAt,
    outputLotIds: fields.outputLotIds,
    payoutRequestId: null,
    refundId,
    payoutAllocations: null
  });
  const refundOrigins = selection.allocations.map((allocation) => {
    const refundPending = moved.createdLots.find(
      (lot) => lot.parentLotId === allocation.lotId && lot.bucket === "refund_pending"
    );
    if (!refundPending) return fail("lineage_invalid");
    return Object.freeze({
      refundPendingLotId: refundPending.lotId,
      sourceLotId: allocation.lotId,
      rootLotId: allocation.rootLotId,
      originalBucket: allocation.bucket as "pending" | "available" | "reserved",
      amountMinor: allocation.amountMinor,
      becameAvailableAt: allocation.becameAvailableAt
    });
  });
  const record = freezePayableLotHistoryRecord({
    kind: "refund_approved",
    operationId,
    sourceKey,
    previousVersion: state.version,
    nextVersion: state.version + 1,
    occurredAt: instant(fields.occurredAt),
    consumedLotIds: moved.consumedLots.map((lot) => lot.lotId),
    createdLotIds: moved.createdLots.map((lot) => lot.lotId),
    referencedLotIds: [],
    refundOrigins,
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

export function approveRefundWithoutPayableLots(
  input: unknown
): PayableLotReferenceStateTransition {
  const fields = exactDataRecord(input, [
    "state",
    "expectedVersion",
    "authority",
    "operationId",
    "sourceKey",
    "occurredAt"
  ]);
  const state = rebuildPayableLotReferenceState(fields.state);
  assertPayableLotReferenceStateVersion(state, fields.expectedVersion);
  const authority = createRefundApprovalAuthority(fields.authority);
  if (
    authority.payableAmount.amountMinor !== 0 ||
    authority.payableAmount.currency !== state.currency ||
    authority.astrologerUserId !== state.astrologerUserId
  ) {
    fail("selection_mismatch");
  }
  const orderLots = state.lots.filter((lot) => lot.sourceId === authority.orderId);
  if (orderLots.length === 0) fail("capture_correlation_mismatch");
  if (
    state.chargebackRestrictions.some(
      (restriction) =>
        restriction.orderId === authority.orderId &&
        (restriction.status === "active" || restriction.status === "allocation_blocked")
    )
  ) {
    fail("release_blocked");
  }
  const operationId = identifier(fields.operationId);
  const sourceKey = safeSourceKey(fields.sourceKey);
  if (
    sourceKey.kind !== "refund" ||
    sourceKey.operation !== "approved" ||
    sourceKey.sourceId !== authority.refundId
  ) {
    fail("invalid_field");
  }
  assertFreshHistoryIdentity(state, operationId, sourceKey);
  const occurredAt = instant(fields.occurredAt);
  const record = freezePayableLotHistoryRecord({
    kind: "refund_approved",
    operationId,
    sourceKey,
    previousVersion: state.version,
    nextVersion: state.version + 1,
    occurredAt,
    consumedLotIds: [],
    createdLotIds: [],
    referencedLotIds: [],
    refundOrigins: [],
    chargebackAllocations: [],
    reserveAllocation: null,
    paymentIntegrity: null,
    blocks: null,
    authority
  });
  const nextState = buildNextPayableLotReferenceState(state, [], [], record);
  return freezePayableLotReferenceStateTransition(state, nextState, [], [], record);
}

export function confirmRefundPayableLots(input: unknown): PayableLotReferenceStateTransition {
  const fields = exactDataRecord(input, [
    "state",
    "expectedVersion",
    "refundId",
    "authority",
    "operationId",
    "sourceKey",
    "occurredAt"
  ]);
  const state = rebuildPayableLotReferenceState(fields.state);
  assertPayableLotReferenceStateVersion(state, fields.expectedVersion);
  const refundId = identifier(fields.refundId);
  const authority = createRefundConfirmedAuthority(fields.authority);
  const operationId = identifier(fields.operationId);
  const sourceKey = safeSourceKey(fields.sourceKey);
  if (
    authority.refundId !== refundId ||
    sourceKey.kind !== "refund" ||
    sourceKey.operation !== "confirmed" ||
    sourceKey.sourceId !== refundId ||
    authority.confirmedAt !== instant(fields.occurredAt)
  ) {
    fail("invalid_field");
  }
  assertFreshHistoryIdentity(state, operationId, sourceKey);
  const approval = refundApprovalRecord(state, refundId);
  assertRefundTerminalIsFresh(state, refundId);
  assertRefundProviderEvidenceIsFresh(state, authority);
  assertRefundProviderAuthorityMatchesApproval(authority, approval, state);
  const lots = activeRefundPendingLots(state, refundId, authority.payableAmount.amountMinor === 0);
  assertRefundPendingAmount(lots, authority.payableAmount.amountMinor);
  const consumed = lots.map((lot) => consumeLot(lot, operationId, authority.confirmedAt));
  const record = freezePayableLotHistoryRecord({
    kind: "refund_confirmed",
    operationId,
    sourceKey,
    previousVersion: state.version,
    nextVersion: state.version + 1,
    occurredAt: authority.confirmedAt,
    consumedLotIds: consumed.map((lot) => lot.lotId),
    createdLotIds: [],
    referencedLotIds: [],
    refundOrigins: approval.refundOrigins,
    chargebackAllocations: [],
    reserveAllocation: null,
    paymentIntegrity: null,
    blocks: null,
    authority
  });
  const nextState = buildNextPayableLotReferenceState(state, consumed, [], record);
  return freezePayableLotReferenceStateTransition(state, nextState, consumed, [], record);
}

export function failRefundPayableLots(input: unknown): PayableLotReferenceStateTransition {
  const fields = exactDataRecord(input, [
    "state",
    "expectedVersion",
    "refundId",
    "authority",
    "operationId",
    "sourceKey",
    "occurredAt",
    "outputLotIds"
  ]);
  const state = rebuildPayableLotReferenceState(fields.state);
  assertPayableLotReferenceStateVersion(state, fields.expectedVersion);
  const refundId = identifier(fields.refundId);
  const authority = createRefundFailedAuthority(fields.authority);
  const operationId = identifier(fields.operationId);
  const sourceKey = safeSourceKey(fields.sourceKey);
  if (
    authority.refundId !== refundId ||
    sourceKey.kind !== "refund" ||
    sourceKey.operation !== "failed" ||
    sourceKey.sourceId !== refundId ||
    authority.failedAt !== instant(fields.occurredAt)
  ) {
    fail("invalid_field");
  }
  assertFreshHistoryIdentity(state, operationId, sourceKey);
  const approval = refundApprovalRecord(state, refundId);
  assertRefundTerminalIsFresh(state, refundId);
  assertRefundProviderEvidenceIsFresh(state, authority);
  assertRefundProviderAuthorityMatchesApproval(authority, approval, state);
  const lots = activeRefundPendingLots(state, refundId, authority.payableAmount.amountMinor === 0);
  assertRefundPendingAmount(lots, authority.payableAmount.amountMinor);
  const outputs = exactWholeLotOutputRows(
    fields.outputLotIds,
    lots.map((lot) => lot.lotId),
    state.lots
  );
  const consumed = lots.map((lot) => consumeLot(lot, operationId, authority.failedAt));
  const created = lots.map((lot) => {
    const origin = approval.refundOrigins.find(
      (candidate) => candidate.refundPendingLotId === lot.lotId
    );
    if (!origin || origin.amountMinor !== lot.amount.amountMinor) fail("lineage_invalid");
    return childLot({
      parent: lot,
      lotId: outputs.get(lot.lotId) as string,
      amountMinor: lot.amount.amountMinor,
      bucket: origin.originalBucket,
      operationId,
      createdAt: authority.failedAt,
      becameAvailableAt: origin.becameAvailableAt,
      payoutRequestId: null,
      refundId: null
    });
  });
  assertConservation(consumed, created);
  const record = freezePayableLotHistoryRecord({
    kind: "refund_failed",
    operationId,
    sourceKey,
    previousVersion: state.version,
    nextVersion: state.version + 1,
    occurredAt: authority.failedAt,
    consumedLotIds: consumed.map((lot) => lot.lotId),
    createdLotIds: created.map((lot) => lot.lotId),
    referencedLotIds: [],
    refundOrigins: approval.refundOrigins,
    chargebackAllocations: [],
    reserveAllocation: null,
    paymentIntegrity: null,
    blocks: null,
    authority
  });
  const nextState = buildNextPayableLotReferenceState(state, consumed, created, record);
  return freezePayableLotReferenceStateTransition(state, nextState, consumed, created, record);
}

function refundApprovalRecord(
  state: PayableLotReferenceState,
  refundId: string
): PayableLotHistoryRecord {
  const records = state.history.filter(
    (record) =>
      record.authority?.kind === "refund_approval" && record.authority.refundId === refundId
  );
  if (records.length !== 1) fail("selection_mismatch");
  return records[0] as PayableLotHistoryRecord;
}

function assertRefundTerminalIsFresh(state: PayableLotReferenceState, refundId: string): void {
  if (
    state.history.some(
      (record) =>
        (record.authority?.kind === "refund_confirmed" ||
          record.authority?.kind === "refund_failed") &&
        record.authority.refundId === refundId
    )
  ) {
    fail("duplicate_operation_source");
  }
}

function assertRefundProviderEvidenceIsFresh(
  state: PayableLotReferenceState,
  authority: RefundConfirmedAuthority | RefundFailedAuthority
): void {
  if (
    state.history.some((record) => {
      const existing = record.authority;
      return (
        (existing?.kind === "refund_confirmed" || existing?.kind === "refund_failed") &&
        (existing.canonicalEvidenceId === authority.canonicalEvidenceId ||
          (existing.providerAccountId === authority.providerAccountId &&
            existing.providerPaymentId === authority.providerPaymentId &&
            existing.providerRefundId === authority.providerRefundId))
      );
    })
  ) {
    fail("duplicate_operation_source");
  }
}

function activeRefundPendingLots(
  state: PayableLotReferenceState,
  refundId: string,
  allowEmpty = false
): readonly PayableSourceLot[] {
  const lots = state.lots
    .filter(
      (lot) =>
        lot.status === "active" && lot.bucket === "refund_pending" && lot.refundId === refundId
    )
    .sort((left, right) => left.lotId.localeCompare(right.lotId));
  if (!allowEmpty && lots.length === 0) fail("selection_mismatch");
  return Object.freeze(lots);
}

function assertRefundPendingAmount(lots: readonly PayableSourceLot[], amountMinor: number): void {
  if (lots.reduce((sum, lot) => sum + BigInt(lot.amount.amountMinor), 0n) !== BigInt(amountMinor)) {
    fail("selection_mismatch");
  }
}

function assertRefundProviderAuthorityMatchesApproval(
  authority: RefundConfirmedAuthority | RefundFailedAuthority,
  approval: PayableLotHistoryRecord,
  state: PayableLotReferenceState
): void {
  if (approval.authority?.kind !== "refund_approval") fail("lineage_invalid");
  const approvalAuthority = approval.authority;
  const sourceLots =
    approval.refundOrigins.length > 0
      ? approval.refundOrigins.map((origin) =>
          state.lots.find((lot) => lot.lotId === origin.sourceLotId)
        )
      : state.lots.filter((lot) => lot.sourceId === approvalAuthority.orderId);
  const priorProviderConfirmations = state.history.filter(
    (record) =>
      record.authority?.kind === "refund_confirmed" &&
      record.authority.providerAccountId === authority.providerAccountId &&
      record.authority.providerPaymentId === authority.providerPaymentId
  );
  const lastProviderConfirmation = priorProviderConfirmations.at(-1)?.authority;
  const capturedGross = sourceLots[0]?.economics.gross;
  const providerCumulativeMismatch =
    authority.kind === "refund_confirmed" &&
    (() => {
      const expectedPriorProviderTotal =
        lastProviderConfirmation?.kind === "refund_confirmed"
          ? lastProviderConfirmation.nextProviderTotalRefunded
          : { amountMinor: 0, currency: authority.providerRefundAmount.currency };
      return (
        authority.priorProviderTotalRefunded.amountMinor !==
          expectedPriorProviderTotal.amountMinor ||
        authority.priorProviderTotalRefunded.currency !== expectedPriorProviderTotal.currency ||
        !capturedGross ||
        authority.nextProviderTotalRefunded.currency !== capturedGross.currency ||
        authority.nextProviderTotalRefunded.amountMinor > capturedGross.amountMinor
      );
    })();
  if (
    sourceLots.length === 0 ||
    sourceLots.some((lot) => !lot) ||
    authority.refundId !== approvalAuthority.refundId ||
    authority.payableAmount.amountMinor !== approvalAuthority.payableAmount.amountMinor ||
    authority.payableAmount.currency !== approvalAuthority.payableAmount.currency ||
    authority.accountingAllocationId !== approvalAuthority.accountingAllocationId ||
    authority.accountingAllocationVersion !== approvalAuthority.accountingAllocationVersion ||
    providerCumulativeMismatch ||
    sourceLots.some(
      (lot) =>
        lot?.captureSource.providerAccountId !== authority.providerAccountId ||
        lot.captureSource.providerPaymentId !== authority.providerPaymentId ||
        authority.providerRefundAmount.currency !== lot.economics.gross.currency ||
        authority.providerRefundAmount.amountMinor > lot.economics.gross.amountMinor
    )
  ) {
    fail("capture_correlation_mismatch");
  }
}

export function consumeRefundBridgeFailedPayoutLots(
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
  const authority = createRefundBridgePayoutFailedAuthority(fields.authority);
  const operationId = identifier(fields.operationId);
  const occurredAt = instant(fields.occurredAt);
  const sourceKey = safeSourceKey(fields.sourceKey);
  if (
    sourceKey.kind !== "refund" ||
    sourceKey.operation !== "bridge_payout_failed" ||
    sourceKey.sourceId !== authority.bridgeAllocationId ||
    authority.payoutOutcomeAuthority.decidedAt !== occurredAt
  ) {
    fail("invalid_field");
  }
  assertFreshHistoryIdentity(state, operationId, sourceKey);
  assertRefundBridgeConfirmation(state, authority);
  const requests = exactRequestedLotAmounts(fields.requestedLots);
  if (
    requests.reduce((sum, request) => sum + BigInt(request.amountMinor), 0n) !==
    BigInt(authority.amount.amountMinor)
  ) {
    fail("selection_mismatch");
  }
  const outputs = partialLotRemainderOutputs(fields.outputLotIds, requests, state.lots);
  const consumed: PayableSourceLot[] = [];
  const created: PayableSourceLot[] = [];
  for (const request of requests) {
    const lot = state.lots.find((candidate) => candidate.lotId === request.lotId);
    if (
      !lot ||
      lot.status !== "active" ||
      lot.bucket !== "payout_pending" ||
      lot.payoutRequestId !== authority.payoutRequestId ||
      lot.payoutAllocationId !== authority.payoutAllocationId ||
      lot.sourceId !== authority.refundedOrderId ||
      lot.amount.currency !== authority.amount.currency
    ) {
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
          bucket: "payout_pending",
          operationId,
          createdAt: occurredAt,
          becameAvailableAt: lot.becameAvailableAt,
          payoutRequestId: authority.payoutRequestId,
          refundId: null
        })
      );
    }
  }
  const payoutRequest = state.history.find(
    (record) =>
      record.authority?.kind === "payout_request" &&
      record.authority.payoutRequestId === authority.payoutRequestId
  );
  if (!payoutRequest) fail("lineage_invalid");
  const record = freezePayableLotHistoryRecord({
    kind: "refund_bridge_payout_failed",
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

export function decideRefundBridgePayoutPaidNoLotTransition(
  input: unknown
): RefundBridgePayoutPaidNoLotDecision {
  const fields = exactDataRecord(input, ["state", "expectedVersion", "authority", "sourceKey"]);
  const state = rebuildPayableLotReferenceState(fields.state);
  assertPayableLotReferenceStateVersion(state, fields.expectedVersion);
  const authority = createRefundBridgePayoutPaidAuthority(fields.authority);
  const sourceKey = safeSourceKey(fields.sourceKey);
  if (
    sourceKey.kind !== "refund" ||
    sourceKey.operation !== "bridge_payout_paid" ||
    sourceKey.sourceId !== authority.bridgeAllocationId
  ) {
    fail("invalid_field");
  }
  assertRefundBridgeConfirmation(state, authority);
  const paidRecord = state.history.find(
    (record) =>
      record.authority?.kind === "payout_paid" &&
      record.authority.payoutRequestId === authority.payoutRequestId
  );
  if (
    !paidRecord ||
    paidRecord.authority?.kind !== "payout_paid" ||
    paidRecord.authority.authorityId !== authority.payoutPaidAuthorityId ||
    paidRecord.authority.version !== authority.payoutPaidAuthorityVersion ||
    paidRecord.authority.bankReference !== authority.bankReference ||
    paidRecord.consumedLotIds
      .map((lotId) => state.lots.find((lot) => lot.lotId === lotId))
      .filter(
        (lot) =>
          lot?.sourceId === authority.refundedOrderId &&
          lot.payoutAllocationId === authority.payoutAllocationId
      )
      .reduce((sum, lot) => sum + BigInt(lot?.amount.amountMinor ?? 0), 0n) <
      BigInt(authority.amount.amountMinor)
  ) {
    fail("selection_mismatch");
  }
  return Object.freeze({
    kind: "no_lot_transition",
    stateVersion: state.version,
    stateDigest: state.stateDigest,
    sourceKey,
    authority
  });
}

function assertRefundBridgeConfirmation(
  state: PayableLotReferenceState,
  authority: RefundBridgePayoutFailedAuthority | RefundBridgePayoutPaidAuthority
): void {
  const confirmation = state.history.find(
    (record) =>
      record.authority?.kind === "refund_confirmed" &&
      record.authority.refundId === authority.refundId
  );
  const approval = state.history.find(
    (record) =>
      record.authority?.kind === "refund_approval" &&
      record.authority.refundId === authority.refundId
  );
  if (
    !confirmation ||
    confirmation.authority?.kind !== "refund_confirmed" ||
    !approval ||
    approval.authority?.kind !== "refund_approval" ||
    approval.authority.orderId !== authority.refundedOrderId ||
    confirmation.authority.authorityId !== authority.confirmedRefundAuthorityId ||
    confirmation.authority.version !== authority.confirmedRefundAuthorityVersion ||
    confirmation.authority.canonicalEvidenceId !== authority.confirmedRefundEvidenceId ||
    confirmation.authority.accountingAllocationId !== authority.accountingAllocationId ||
    confirmation.authority.accountingAllocationVersion !== authority.accountingAllocationVersion ||
    state.history.some(
      (record) =>
        record.authority?.kind === "refund_bridge_payout_failed" &&
        record.authority.bridgeAllocationId === authority.bridgeAllocationId
    )
  ) {
    fail("selection_mismatch");
  }
}
