import { Temporal } from "@js-temporal/polyfill";
import type { PersistedVerifiedEconomicPaymentCaptureReceipt } from "./economic-payment";
import { createFinanceSourceKey, serializeFinanceSourceKey } from "./finance-source-key";

import {
  assertCaptureMatchesEconomics,
  assertCaptureMatchesLot,
  assertClearCurrentBlocks,
  assertComponentLotId,
  assertConservation,
  assertCurrentPaymentIntegrity,
  assertFreshHistoryIdentity,
  assertFreshOutputIds,
  assertLotCollectionIntegrity,
  assertPayableLotReferenceStateVersion,
  assertUniqueLotIds,
  persistedVerifiedClientCapture,
  buildNextPayableLotReferenceState,
  childLot,
  consumeLot,
  createHoldReleaseEvidence,
  createPayableLotBlockSnapshot,
  createPaymentCaptureIntegrityAuthority,
  createReserveAllocationDecision,
  createReserveReleaseAuthority,
  exactActiveLots,
  exactWholeLotOutputRows,
  freezeCaptureSource,
  freezeLot,
  freezePayableLotHistoryRecord,
  freezePayableLotReferenceStateTransition,
  freezeTransition,
  hydrateLot,
  lotArray,
  nonEmptyIdentifierArray,
  providerCaptureKey,
  safeEconomics,
  safeRiskPolicy,
  safeSourceKey,
  supportedFulfillment
} from "./source-lot-integrity";
import { hasUnresolvedRefundForOrder } from "./source-lot-operation-helpers";
import { rebuildPayableLotReferenceState } from "./source-lot-reference";
import {
  type PayableLotBlockSnapshot,
  type PayableLotCaptureSource,
  type PayableLotReferenceState,
  type PayableLotReferenceStateTransition,
  type PayableLotTransition,
  type PayableSourceLot
} from "./source-lot-types";
import {
  exactDataRecord,
  fail,
  identifier,
  instant,
  nullableIdentifier,
  sameMoney
} from "./source-lot-validation";
const pendingLotInputKeys = [
  "lotId",
  "economics",
  "riskPolicy",
  "fulfillment",
  "capture",
  "capturedAt",
  "existingLots"
] as const;
type PersistedCaptureCommand = Readonly<{
  capture: PersistedVerifiedEconomicPaymentCaptureReceipt;
  [key: string]: unknown;
}>;

export function capturePendingPayableLot(
  input: PersistedCaptureCommand
): PayableLotReferenceStateTransition {
  const fields = exactDataRecord(input, [
    "state",
    "expectedVersion",
    "lotId",
    "economics",
    "riskPolicy",
    "fulfillment",
    "capture",
    "capturedAt"
  ]);
  const state = rebuildPayableLotReferenceState(fields.state);
  assertPayableLotReferenceStateVersion(state, fields.expectedVersion);
  const economics = safeEconomics(fields.economics);
  if (economics.astrologerUserId !== state.astrologerUserId) fail("owner_currency_mismatch");
  const lot = createPendingPayableLot({
    lotId: fields.lotId,
    economics,
    riskPolicy: fields.riskPolicy,
    fulfillment: fields.fulfillment,
    capture: input.capture,
    capturedAt: fields.capturedAt,
    existingLots: state.lots
  });
  const sourceKey = createFinanceSourceKey(lot.captureSource.sourceKey);
  const record = freezePayableLotHistoryRecord({
    kind: "sale_capture",
    operationId: lot.captureSource.canonicalEvidenceId,
    sourceKey,
    previousVersion: state.version,
    nextVersion: state.version + 1,
    occurredAt: lot.capturedAt,
    consumedLotIds: [],
    createdLotIds: [lot.lotId],
    referencedLotIds: [],
    refundOrigins: [],
    chargebackAllocations: [],
    reserveAllocation: null,
    paymentIntegrity: null,
    blocks: null,
    authority: null
  });
  const nextState = buildNextPayableLotReferenceState(state, [], [lot], record);
  return freezePayableLotReferenceStateTransition(state, nextState, [], [lot], record);
}

export function releasePendingPayableLotFromState(
  input: PersistedCaptureCommand
): PayableLotReferenceStateTransition {
  const fields = exactDataRecord(input, [
    "state",
    "expectedVersion",
    "lotId",
    "capture",
    "paymentIntegrity",
    "bookingCompletion",
    "providerSettlement",
    "blocks",
    "allocation",
    "operationId",
    "sourceKey",
    "evaluatedAt",
    "outputLotIds"
  ]);
  const state = rebuildPayableLotReferenceState(fields.state);
  assertPayableLotReferenceStateVersion(state, fields.expectedVersion);
  const lotId = identifier(fields.lotId);
  const lot = state.lots.find((candidate) => candidate.lotId === lotId);
  if (!lot) fail("selection_mismatch");
  if (lot.status !== "active") fail("lot_already_consumed");

  const operationId = identifier(fields.operationId);
  const sourceKey = safeSourceKey(fields.sourceKey);
  if (
    sourceKey.kind !== "reserve" ||
    sourceKey.operation !== "hold_released" ||
    sourceKey.sourceId !== operationId
  ) {
    fail("invalid_field");
  }
  assertFreshHistoryIdentity(state, operationId, sourceKey);
  const evaluatedAt = instant(fields.evaluatedAt);
  const paymentIntegrity = createPaymentCaptureIntegrityAuthority(fields.paymentIntegrity);
  assertCurrentPaymentIntegrity(paymentIntegrity, lot, evaluatedAt);
  const blocks = createPayableLotBlockSnapshot(fields.blocks);
  assertReleaseBlockSnapshotForLot(state, blocks, lot, evaluatedAt);
  if (fields.allocation === null) fail("reserve_allocation_required");
  const allocation = createReserveAllocationDecision(fields.allocation);

  const transition = releasePendingPayableLot({
    lot,
    capture: input.capture,
    bookingCompletion: fields.bookingCompletion,
    providerSettlement: fields.providerSettlement,
    blocks,
    allocation,
    operationId,
    evaluatedAt,
    outputLotIds: fields.outputLotIds
  });
  const record = freezePayableLotHistoryRecord({
    kind: "hold_release",
    operationId,
    sourceKey,
    previousVersion: state.version,
    nextVersion: state.version + 1,
    occurredAt: evaluatedAt,
    consumedLotIds: transition.consumedLots.map((candidate) => candidate.lotId),
    createdLotIds: transition.createdLots.map((candidate) => candidate.lotId),
    referencedLotIds: [],
    refundOrigins: [],
    chargebackAllocations: [],
    reserveAllocation: allocation,
    paymentIntegrity,
    blocks,
    holdReleaseEvidence: createHoldReleaseEvidence({
      kind: "hold_release_evidence",
      lotId: lot.lotId,
      orderId: lot.sourceId,
      evaluatedAt,
      bookingCompletion: fields.bookingCompletion,
      providerSettlement: fields.providerSettlement,
      blocks
    }),
    authority: null
  });
  const nextState = buildNextPayableLotReferenceState(
    state,
    transition.consumedLots,
    transition.createdLots,
    record
  );
  return freezePayableLotReferenceStateTransition(
    state,
    nextState,
    transition.consumedLots,
    transition.createdLots,
    record
  );
}

export function releaseReservedPayableLots(input: unknown): PayableLotReferenceStateTransition {
  const fields = exactDataRecord(input, [
    "state",
    "expectedVersion",
    "lotIds",
    "paymentIntegrity",
    "blocks",
    "authority",
    "operationId",
    "sourceKey",
    "evaluatedAt",
    "outputLotIds"
  ]);
  const state = rebuildPayableLotReferenceState(fields.state);
  assertPayableLotReferenceStateVersion(state, fields.expectedVersion);
  const authority = createReserveReleaseAuthority(fields.authority);
  const operationId = identifier(fields.operationId);
  const sourceKey = safeSourceKey(fields.sourceKey);
  if (
    sourceKey.kind !== "reserve" ||
    sourceKey.operation !== "released" ||
    sourceKey.sourceId !== operationId
  ) {
    fail("invalid_field");
  }
  assertFreshHistoryIdentity(state, operationId, sourceKey);
  const holdRecord = state.history.find(
    (record) => record.operationId === authority.holdReleaseOperationId
  );
  if (
    !holdRecord ||
    holdRecord.kind !== "hold_release" ||
    holdRecord.reserveAllocation?.decisionId !== authority.reserveDecisionId ||
    holdRecord.reserveAllocation.version !== authority.reserveDecisionVersion
  ) {
    fail("reserve_allocation_invalid");
  }
  if (
    state.history.some(
      (record) =>
        record.authority?.kind === "reserve_release" &&
        (record.authority.authorityId === authority.authorityId ||
          record.authority.holdReleaseOperationId === authority.holdReleaseOperationId)
    )
  ) {
    fail("duplicate_operation_source");
  }
  const lotIds = nonEmptyIdentifierArray(fields.lotIds);
  const reservedRoots = holdRecord.createdLotIds
    .map((lotId) => state.lots.find((lot) => lot.lotId === lotId))
    .filter((lot): lot is PayableSourceLot => lot?.bucket === "reserved");
  if (reservedRoots.length === 0) fail("reserve_allocation_invalid");
  const activeDescendants = state.lots.filter(
    (lot) =>
      lot.status === "active" &&
      reservedRoots.some((root) => isLotDescendantOf(state, lot, root.lotId))
  );
  if (
    activeDescendants.length === 0 ||
    activeDescendants.some((lot) => lot.bucket !== "reserved") ||
    activeDescendants.some((lot) => hasForbiddenReserveReleaseOrigin(state, lot)) ||
    new Set(lotIds).size !== activeDescendants.length ||
    activeDescendants.some((lot) => !lotIds.includes(lot.lotId))
  ) {
    fail("reserve_allocation_invalid");
  }
  const lots = exactActiveLots(state, lotIds, "reserved", null);
  const evaluatedAt = instant(fields.evaluatedAt);
  const paymentIntegrity = createPaymentCaptureIntegrityAuthority(fields.paymentIntegrity);
  for (const lot of lots) assertCurrentPaymentIntegrity(paymentIntegrity, lot, evaluatedAt);
  const blocks = createPayableLotBlockSnapshot(fields.blocks);
  for (const lot of lots) assertReleaseBlockSnapshotForLot(state, blocks, lot, evaluatedAt);
  const releaseAt = Temporal.Instant.from(holdRecord.occurredAt)
    .add({ hours: (lots[0]?.riskPolicy.reserveReleaseDelayDays ?? 0) * 24 })
    .toString();
  if (Temporal.Instant.compare(evaluatedAt, releaseAt) < 0) fail("hold_not_elapsed");

  const outputRows = exactWholeLotOutputRows(fields.outputLotIds, lotIds, state.lots);
  const consumed = lots.map((lot) => consumeLot(lot, operationId, evaluatedAt));
  const created = lots.map((lot) => {
    const output = outputRows.get(lot.lotId);
    if (!output) return fail("selection_mismatch");
    return childLot({
      parent: lot,
      lotId: output,
      amountMinor: lot.amount.amountMinor,
      bucket: "available",
      operationId,
      createdAt: evaluatedAt,
      becameAvailableAt: evaluatedAt,
      payoutRequestId: null,
      refundId: null
    });
  });
  assertConservation(lots, created);
  const record = freezePayableLotHistoryRecord({
    kind: "reserve_release",
    operationId,
    sourceKey,
    previousVersion: state.version,
    nextVersion: state.version + 1,
    occurredAt: evaluatedAt,
    consumedLotIds: lotIds,
    createdLotIds: created.map((lot) => lot.lotId),
    referencedLotIds: [],
    refundOrigins: [],
    chargebackAllocations: [],
    reserveAllocation: null,
    paymentIntegrity,
    blocks,
    authority
  });
  const nextState = buildNextPayableLotReferenceState(state, consumed, created, record);
  return freezePayableLotReferenceStateTransition(state, nextState, consumed, created, record);
}

function assertReleaseBlockSnapshotForLot(
  state: PayableLotReferenceState,
  blocks: PayableLotBlockSnapshot,
  lot: PayableSourceLot,
  evaluatedAt: string
): void {
  if (
    blocks.orderId !== lot.sourceId ||
    blocks.astrologerUserId !== lot.astrologerUserId ||
    blocks.providerAccountId !== lot.captureSource.providerAccountId ||
    blocks.paymentIntentId !== lot.captureSource.intentId ||
    blocks.currency !== lot.amount.currency
  ) {
    fail("release_blocked");
  }
  assertClearCurrentBlocks(blocks, evaluatedAt);
  if (
    hasUnresolvedRefundForOrder(state, lot.sourceId) ||
    state.chargebackRestrictions.some(
      (restriction) =>
        restriction.orderId === lot.sourceId &&
        (restriction.status === "active" || restriction.status === "allocation_blocked")
    )
  ) {
    fail("release_blocked");
  }
}

function isLotDescendantOf(
  state: PayableLotReferenceState,
  lot: PayableSourceLot,
  ancestorLotId: string
): boolean {
  const seen = new Set<string>();
  let cursor: PayableSourceLot | undefined = lot;
  while (cursor) {
    if (cursor.lotId === ancestorLotId) return true;
    if (seen.has(cursor.lotId)) fail("lineage_invalid");
    seen.add(cursor.lotId);
    const parentLotId: string | null = cursor.parentLotId;
    cursor =
      parentLotId === null
        ? undefined
        : state.lots.find((candidate) => candidate.lotId === parentLotId);
  }
  return false;
}

function hasForbiddenReserveReleaseOrigin(
  state: PayableLotReferenceState,
  lot: PayableSourceLot
): boolean {
  const forbiddenOperations = new Set(
    state.history
      .filter(
        (record) =>
          record.kind === "payout_returned_reserved" || record.kind === "chargeback_won_reserved"
      )
      .map((record) => record.operationId)
  );
  const seen = new Set<string>();
  let cursor: PayableSourceLot | undefined = lot;
  while (cursor) {
    if (forbiddenOperations.has(cursor.createdByOperationId)) return true;
    if (seen.has(cursor.lotId)) fail("lineage_invalid");
    seen.add(cursor.lotId);
    const parentLotId: string | null = cursor.parentLotId;
    cursor =
      parentLotId === null
        ? undefined
        : state.lots.find((candidate) => candidate.lotId === parentLotId);
  }
  return false;
}

function createPendingPayableLot(input: PersistedCaptureCommand): PayableSourceLot {
  const fields = exactDataRecord(input, pendingLotInputKeys);
  const lotId = identifier(fields.lotId);
  const economics = safeEconomics(fields.economics);
  const riskPolicy = safeRiskPolicy(fields.riskPolicy);
  const fulfillment = supportedFulfillment(fields.fulfillment);
  const capture = persistedVerifiedClientCapture(input.capture);
  const capturedAt = instant(fields.capturedAt);
  const existingLots = lotArray(fields.existingLots);
  assertUniqueLotIds(existingLots);
  assertLotCollectionIntegrity(existingLots);

  if (Temporal.Instant.compare(riskPolicy.effectiveAt, capturedAt) > 0) {
    fail("invalid_field");
  }
  assertCaptureMatchesEconomics(capture.effect, economics);
  if (existingLots.some((lot) => lot.lotId === lotId)) fail("duplicate_lot_id");

  const sourceKey = createFinanceSourceKey({
    kind: "order",
    sourceId: economics.orderId,
    operation: "sale_captured"
  }) as PayableLotCaptureSource["sourceKey"];
  const captureSource = freezeCaptureSource({
    intentId: capture.effect.intentId,
    providerAccountId: capture.effect.providerAccount.providerAccountId,
    providerPaymentId: capture.effect.providerPaymentId,
    canonicalEvidenceId: capture.effect.canonicalEvidenceId,
    paymentIntent: capture.intent,
    sourceKey
  });
  const serializedSource = serializeFinanceSourceKey(captureSource.sourceKey);
  if (
    existingLots.some(
      (lot) =>
        serializeFinanceSourceKey(lot.captureSource.sourceKey) === serializedSource ||
        providerCaptureKey(lot.captureSource) === providerCaptureKey(captureSource) ||
        lot.captureSource.canonicalEvidenceId === captureSource.canonicalEvidenceId
    )
  ) {
    fail("duplicate_capture_source");
  }

  return freezeLot({
    lotId,
    rootLotId: lotId,
    parentLotId: null,
    lineageDepth: 0,
    sourceId: economics.orderId,
    astrologerUserId: economics.astrologerUserId,
    amount: economics.payable,
    bucket: "pending",
    status: "active",
    capturedAt,
    createdAt: capturedAt,
    becameAvailableAt: null,
    createdByOperationId: capture.effect.canonicalEvidenceId,
    consumedByOperationId: null,
    consumedAt: null,
    payoutRequestId: null,
    payoutAllocationId: null,
    refundId: null,
    economics,
    riskPolicy,
    fulfillment,
    captureSource
  });
}

function releasePendingPayableLot(input: PersistedCaptureCommand): PayableLotTransition {
  const fields = exactDataRecord(input, [
    "lot",
    "capture",
    "bookingCompletion",
    "providerSettlement",
    "blocks",
    "allocation",
    "operationId",
    "evaluatedAt",
    "outputLotIds"
  ]);
  const lot = hydrateLot(fields.lot);
  if (lot.status !== "active") fail("lot_already_consumed");
  if (lot.bucket !== "pending") fail("lot_bucket_ineligible");
  const operationId = identifier(fields.operationId);
  const evaluatedAt = instant(fields.evaluatedAt);
  const capture = persistedVerifiedClientCapture(input.capture);
  assertCaptureMatchesLot(capture.effect, lot);

  if (fields.bookingCompletion === null) fail("fulfillment_evidence_required");
  const booking = exactDataRecord(fields.bookingCompletion, [
    "bookingId",
    "orderId",
    "owner",
    "status",
    "contractVersion",
    "completedAt",
    "evidenceId"
  ]);
  identifier(booking.bookingId);
  identifier(booking.evidenceId);
  if (
    booking.orderId !== lot.sourceId ||
    booking.owner !== lot.fulfillment.terminalEvidence.owner ||
    booking.status !== lot.fulfillment.terminalEvidence.status ||
    booking.contractVersion !== lot.fulfillment.terminalEvidence.contractVersion ||
    lot.fulfillment.registryKey !== "single.once.live.solo" ||
    lot.fulfillment.registryRevision !== 1 ||
    lot.fulfillment.holdAnchor !== "booking_completed" ||
    lot.riskPolicy.holdAnchor !== "booking_completed"
  ) {
    fail("fulfillment_evidence_required");
  }
  const completedAt = instant(booking.completedAt);
  const holdEndsAt = Temporal.Instant.from(completedAt)
    .add({ hours: lot.riskPolicy.holdDurationHours })
    .toString();
  if (Temporal.Instant.compare(evaluatedAt, holdEndsAt) < 0) fail("hold_not_elapsed");

  const blocks = createPayableLotBlockSnapshot(fields.blocks);
  if (
    blocks.orderId !== lot.sourceId ||
    blocks.astrologerUserId !== lot.astrologerUserId ||
    blocks.providerAccountId !== lot.captureSource.providerAccountId ||
    blocks.paymentIntentId !== lot.captureSource.intentId ||
    blocks.currency !== lot.amount.currency
  ) {
    fail("release_blocked");
  }
  assertClearCurrentBlocks(blocks, evaluatedAt);

  if (fields.providerSettlement === null) {
    if (lot.riskPolicy.providerSettlementRequired) fail("settlement_evidence_required");
  } else {
    const settlement = exactDataRecord(fields.providerSettlement, [
      "kind",
      "providerAccountId",
      "paymentIntentId",
      "providerPaymentId",
      "evidenceId",
      "matchedAt"
    ]);
    if (
      settlement.kind !== "provider_settlement_matched" ||
      settlement.providerAccountId !== lot.captureSource.providerAccountId ||
      settlement.paymentIntentId !== lot.captureSource.intentId ||
      settlement.providerPaymentId !== lot.captureSource.providerPaymentId
    ) {
      fail("settlement_evidence_required");
    }
    identifier(settlement.evidenceId);
    const matchedAt = instant(settlement.matchedAt);
    if (
      Temporal.Instant.compare(matchedAt, lot.capturedAt) < 0 ||
      Temporal.Instant.compare(matchedAt, evaluatedAt) > 0
    ) {
      fail("settlement_evidence_required");
    }
  }

  if (fields.allocation === null) fail("reserve_allocation_required");
  const allocation = createReserveAllocationDecision(fields.allocation);
  if (
    allocation.orderId !== lot.sourceId ||
    allocation.astrologerUserId !== lot.astrologerUserId ||
    allocation.riskPolicyId !== lot.riskPolicy.id ||
    allocation.riskPolicyVersion !== lot.riskPolicy.policyVersion ||
    allocation.reserveBps !== lot.riskPolicy.reserveBps ||
    !sameMoney(allocation.payable, lot.amount)
  ) {
    fail("reserve_allocation_invalid");
  }

  const outputIds = exactDataRecord(fields.outputLotIds, ["available", "reserved"]);
  const availableId = nullableIdentifier(outputIds.available);
  const reservedId = nullableIdentifier(outputIds.reserved);
  assertComponentLotId(allocation.available.amountMinor, availableId);
  assertComponentLotId(allocation.reserved.amountMinor, reservedId);
  assertFreshOutputIds([availableId, reservedId], [lot.lotId]);

  const consumed = consumeLot(lot, operationId, evaluatedAt);
  const created: PayableSourceLot[] = [];
  if (allocation.available.amountMinor > 0 && availableId) {
    created.push(
      childLot({
        parent: lot,
        lotId: availableId,
        amountMinor: allocation.available.amountMinor,
        bucket: "available",
        operationId,
        createdAt: evaluatedAt,
        becameAvailableAt: evaluatedAt,
        payoutRequestId: null,
        refundId: null
      })
    );
  }
  if (allocation.reserved.amountMinor > 0 && reservedId) {
    created.push(
      childLot({
        parent: lot,
        lotId: reservedId,
        amountMinor: allocation.reserved.amountMinor,
        bucket: "reserved",
        operationId,
        createdAt: evaluatedAt,
        becameAvailableAt: null,
        payoutRequestId: null,
        refundId: null
      })
    );
  }
  assertConservation([lot], created);
  return freezeTransition(operationId, [consumed], created);
}
