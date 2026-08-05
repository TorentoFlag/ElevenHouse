import { Temporal } from "@js-temporal/polyfill";
import {
  type PayableLotBlockSnapshot,
  type PayableLotHistoryRecord,
  type PayableSourceLot
} from "./source-lot-types";
import { fail, sameMoney } from "./source-lot-validation";

import {
  assertClearCurrentBlocks,
  assertCurrentPaymentIntegrity,
  lotDescendsFromAny,
  lotDescendsFromMap
} from "./source-lot-reference-core";
export function assertSaleCaptureHistory(
  record: PayableLotHistoryRecord,
  lotsById: ReadonlyMap<string, PayableSourceLot>
): void {
  if (
    record.sourceKey.kind !== "order" ||
    record.sourceKey.operation !== "sale_captured" ||
    record.consumedLotIds.length !== 0 ||
    record.createdLotIds.length !== 1 ||
    record.referencedLotIds.length !== 0 ||
    record.refundOrigins.length !== 0 ||
    record.chargebackAllocations.length !== 0 ||
    record.reserveAllocation !== null ||
    record.paymentIntegrity !== null ||
    record.blocks !== null ||
    record.holdReleaseEvidence !== null ||
    record.authority !== null
  ) {
    fail("lineage_invalid");
  }
  const lot = lotsById.get(record.createdLotIds[0] as string);
  if (
    !lot ||
    lot.parentLotId !== null ||
    lot.rootLotId !== lot.lotId ||
    lot.lineageDepth !== 0 ||
    lot.bucket !== "pending" ||
    lot.sourceId !== record.sourceKey.sourceId ||
    record.operationId !== lot.captureSource.canonicalEvidenceId ||
    !sameMoney(lot.amount, lot.economics.payable)
  ) {
    fail("lineage_invalid");
  }
}

export function assertHoldReleaseHistory(
  record: PayableLotHistoryRecord,
  lotsById: ReadonlyMap<string, PayableSourceLot>
): void {
  if (
    record.sourceKey.kind !== "reserve" ||
    record.sourceKey.operation !== "hold_released" ||
    record.sourceKey.sourceId !== record.operationId ||
    record.consumedLotIds.length !== 1 ||
    record.createdLotIds.length < 1 ||
    record.createdLotIds.length > 2 ||
    record.referencedLotIds.length !== 0 ||
    record.refundOrigins.length !== 0 ||
    record.chargebackAllocations.length !== 0 ||
    record.reserveAllocation === null ||
    record.paymentIntegrity === null ||
    record.blocks === null ||
    record.holdReleaseEvidence === null ||
    record.authority !== null
  ) {
    fail("reserve_allocation_required");
  }
  const parent = lotsById.get(record.consumedLotIds[0] as string);
  if (!parent || parent.bucket !== "pending") fail("lineage_invalid");
  assertCurrentPaymentIntegrity(record.paymentIntegrity, parent, record.occurredAt);
  assertClearCurrentBlocks(record.blocks, record.occurredAt);
  const evidence = record.holdReleaseEvidence;
  const booking = evidence.bookingCompletion;
  if (
    evidence.lotId !== parent.lotId ||
    evidence.orderId !== parent.sourceId ||
    evidence.evaluatedAt !== record.occurredAt ||
    !sameBlockSnapshot(evidence.blocks, record.blocks) ||
    record.blocks.orderId !== parent.sourceId ||
    record.blocks.astrologerUserId !== parent.astrologerUserId ||
    record.blocks.providerAccountId !== parent.captureSource.providerAccountId ||
    record.blocks.paymentIntentId !== parent.captureSource.intentId ||
    record.blocks.currency !== parent.amount.currency ||
    booking.orderId !== parent.sourceId ||
    booking.owner !== parent.fulfillment.terminalEvidence.owner ||
    booking.status !== parent.fulfillment.terminalEvidence.status ||
    booking.contractVersion !== parent.fulfillment.terminalEvidence.contractVersion
  ) {
    fail("fulfillment_evidence_required");
  }
  const holdEndsAt = Temporal.Instant.from(booking.completedAt)
    .add({ hours: parent.riskPolicy.holdDurationHours })
    .toString();
  if (Temporal.Instant.compare(record.occurredAt, holdEndsAt) < 0) fail("hold_not_elapsed");
  const settlement = evidence.providerSettlement;
  if (settlement === null) {
    if (parent.riskPolicy.providerSettlementRequired) fail("settlement_evidence_required");
  } else if (
    settlement.providerAccountId !== parent.captureSource.providerAccountId ||
    settlement.paymentIntentId !== parent.captureSource.intentId ||
    settlement.providerPaymentId !== parent.captureSource.providerPaymentId ||
    Temporal.Instant.compare(settlement.matchedAt, parent.capturedAt) < 0 ||
    Temporal.Instant.compare(settlement.matchedAt, record.occurredAt) > 0
  ) {
    fail("settlement_evidence_required");
  }
  const allocation = record.reserveAllocation;
  if (
    allocation.orderId !== parent.sourceId ||
    allocation.astrologerUserId !== parent.astrologerUserId ||
    allocation.riskPolicyId !== parent.riskPolicy.id ||
    allocation.riskPolicyVersion !== parent.riskPolicy.policyVersion ||
    allocation.reserveBps !== parent.riskPolicy.reserveBps ||
    !sameMoney(allocation.payable, parent.amount)
  ) {
    fail("reserve_allocation_invalid");
  }
  let availableMinor = 0n;
  let reservedMinor = 0n;
  const expectedChildCount =
    Number(allocation.available.amountMinor > 0) + Number(allocation.reserved.amountMinor > 0);
  if (record.createdLotIds.length !== expectedChildCount) fail("conservation_violation");
  const seenBuckets = new Set<string>();
  for (const lotId of record.createdLotIds) {
    const child = lotsById.get(lotId);
    if (
      !child ||
      child.parentLotId !== parent.lotId ||
      child.rootLotId !== parent.rootLotId ||
      child.lineageDepth !== parent.lineageDepth + 1
    ) {
      fail("lineage_invalid");
    }
    if (seenBuckets.has(child.bucket)) fail("conservation_violation");
    seenBuckets.add(child.bucket);
    if (child.bucket === "available") availableMinor += BigInt(child.amount.amountMinor);
    else if (child.bucket === "reserved") reservedMinor += BigInt(child.amount.amountMinor);
    else fail("lineage_invalid");
  }
  if (
    availableMinor !== BigInt(allocation.available.amountMinor) ||
    reservedMinor !== BigInt(allocation.reserved.amountMinor) ||
    availableMinor + reservedMinor !== BigInt(parent.amount.amountMinor)
  ) {
    fail("conservation_violation");
  }
}

function sameBlockSnapshot(left: PayableLotBlockSnapshot, right: PayableLotBlockSnapshot): boolean {
  return (
    left.kind === right.kind &&
    left.snapshotId === right.snapshotId &&
    left.version === right.version &&
    left.orderId === right.orderId &&
    left.astrologerUserId === right.astrologerUserId &&
    left.providerAccountId === right.providerAccountId &&
    left.paymentIntentId === right.paymentIntentId &&
    left.currency === right.currency &&
    left.evaluatedAt === right.evaluatedAt &&
    left.refund === right.refund &&
    left.chargeback === right.chargeback &&
    left.reconciliation === right.reconciliation &&
    left.manualRisk === right.manualRisk
  );
}

export function assertReserveReleaseHistory(
  record: PayableLotHistoryRecord,
  lotsById: ReadonlyMap<string, PayableSourceLot>,
  history: readonly PayableLotHistoryRecord[]
): void {
  if (
    record.sourceKey.kind !== "reserve" ||
    record.sourceKey.operation !== "released" ||
    record.sourceKey.sourceId !== record.operationId ||
    record.consumedLotIds.length === 0 ||
    record.createdLotIds.length !== record.consumedLotIds.length ||
    record.referencedLotIds.length !== 0 ||
    record.refundOrigins.length !== 0 ||
    record.chargebackAllocations.length !== 0 ||
    record.reserveAllocation !== null ||
    record.paymentIntegrity === null ||
    record.blocks === null ||
    record.holdReleaseEvidence !== null ||
    record.authority?.kind !== "reserve_release"
  ) {
    fail("lineage_invalid");
  }
  const authority = record.authority;
  if (authority?.kind !== "reserve_release") fail("lineage_invalid");
  assertClearCurrentBlocks(record.blocks, record.occurredAt);
  const hold = history.find(
    (candidate) => candidate.operationId === authority.holdReleaseOperationId
  );
  if (
    !hold ||
    hold.kind !== "hold_release" ||
    hold.reserveAllocation?.decisionId !== authority.reserveDecisionId ||
    hold.reserveAllocation.version !== authority.reserveDecisionVersion
  ) {
    fail("reserve_allocation_invalid");
  }
  const recordIndex = history.indexOf(record);
  if (recordIndex < 0) fail("lineage_invalid");
  const priorHistory = history.slice(0, recordIndex);
  if (
    priorHistory.some(
      (candidate) =>
        candidate.authority?.kind === "reserve_release" &&
        (candidate.authority.authorityId === authority.authorityId ||
          candidate.authority.holdReleaseOperationId === authority.holdReleaseOperationId)
    )
  ) {
    fail("duplicate_operation_source");
  }
  const reservedRoots = hold.createdLotIds
    .map((lotId) => lotsById.get(lotId))
    .filter((lot): lot is PayableSourceLot => lot?.bucket === "reserved");
  const consumedBefore = new Set(priorHistory.flatMap((candidate) => candidate.consumedLotIds));
  const createdBefore = new Set(priorHistory.flatMap((candidate) => candidate.createdLotIds));
  const expectedSurvivors = [...lotsById.values()].filter(
    (lot) =>
      createdBefore.has(lot.lotId) &&
      !consumedBefore.has(lot.lotId) &&
      lot.bucket === "reserved" &&
      reservedRoots.some((root) => lotDescendsFromMap(lotsById, lot, root.lotId))
  );
  if (
    expectedSurvivors.length !== record.consumedLotIds.length ||
    expectedSurvivors.some((lot) => !record.consumedLotIds.includes(lot.lotId)) ||
    expectedSurvivors.some((lot) =>
      priorHistory.some(
        (candidate) =>
          (candidate.kind === "payout_returned_reserved" ||
            candidate.kind === "chargeback_won_reserved") &&
          lotDescendsFromAny(lotsById, lot, candidate.createdLotIds)
      )
    )
  ) {
    fail("reserve_allocation_invalid");
  }
  for (const consumedId of record.consumedLotIds) {
    const parent = lotsById.get(consumedId);
    const children = record.createdLotIds
      .map((lotId) => lotsById.get(lotId))
      .filter((lot): lot is PayableSourceLot => lot?.parentLotId === consumedId);
    if (
      !parent ||
      parent.bucket !== "reserved" ||
      !reservedRoots.some((root) => lotDescendsFromMap(lotsById, parent, root.lotId)) ||
      children.length !== 1 ||
      children[0]?.bucket !== "available" ||
      !sameMoney(children[0].amount, parent.amount)
    ) {
      fail("conservation_violation");
    }
    if (
      record.blocks.orderId !== parent.sourceId ||
      record.blocks.astrologerUserId !== parent.astrologerUserId ||
      record.blocks.providerAccountId !== parent.captureSource.providerAccountId ||
      record.blocks.paymentIntentId !== parent.captureSource.intentId ||
      record.blocks.currency !== parent.amount.currency
    ) {
      fail("release_blocked");
    }
    assertCurrentPaymentIntegrity(record.paymentIntegrity, parent, record.occurredAt);
    const earliest = Temporal.Instant.from(hold.occurredAt)
      .add({ hours: parent.riskPolicy.reserveReleaseDelayDays * 24 })
      .toString();
    if (Temporal.Instant.compare(record.occurredAt, earliest) < 0) fail("hold_not_elapsed");
  }
}
