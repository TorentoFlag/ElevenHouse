import {
  type PayableLotBucket,
  type PayableLotHistoryRecord,
  type PayableSourceLot
} from "./source-lot-types";
import { fail, sameMoney } from "./source-lot-validation";

import { assertPayoutReturnSource, sameIdentifierSet } from "./source-lot-reference-core";
export function assertPayoutRequestedHistory(
  record: PayableLotHistoryRecord,
  lotsById: ReadonlyMap<string, PayableSourceLot>
): void {
  if (
    record.sourceKey.kind !== "payout" ||
    record.sourceKey.operation !== "requested" ||
    record.consumedLotIds.length === 0 ||
    record.createdLotIds.length < record.consumedLotIds.length ||
    record.referencedLotIds.length !== 0 ||
    record.refundOrigins.length !== 0 ||
    record.chargebackAllocations.length !== 0 ||
    record.reserveAllocation !== null ||
    record.paymentIntegrity !== null ||
    record.blocks !== null ||
    record.holdReleaseEvidence !== null ||
    record.authority?.kind !== "payout_request" ||
    record.sourceKey.sourceId !== record.authority.payoutRequestId
  ) {
    fail("lineage_invalid");
  }
  const authority = record.authority;
  if (authority?.kind !== "payout_request") fail("lineage_invalid");
  if (authority.allocations.length !== record.consumedLotIds.length) fail("lineage_invalid");
  const allocationBySource = new Map(
    authority.allocations.map((allocation) => [allocation.sourceLotId, allocation] as const)
  );
  let payoutMinor = 0n;
  for (const consumedId of record.consumedLotIds) {
    const parent = lotsById.get(consumedId);
    const authorityAllocation = allocationBySource.get(consumedId);
    const children = record.createdLotIds
      .map((lotId) => lotsById.get(lotId))
      .filter((lot): lot is PayableSourceLot => lot?.parentLotId === consumedId);
    if (
      !parent ||
      !authorityAllocation ||
      parent.bucket !== "available" ||
      children.length < 1 ||
      children.length > 2
    ) {
      fail("lineage_invalid");
    }
    if (
      children.reduce((sum, lot) => sum + BigInt(lot.amount.amountMinor), 0n) !==
      BigInt(parent.amount.amountMinor)
    ) {
      fail("conservation_violation");
    }
    const payoutChild = children.find((child) => child.bucket === "payout_pending");
    if (
      !payoutChild ||
      payoutChild.lotId !== authorityAllocation.payoutPendingLotId ||
      payoutChild.payoutAllocationId !== authorityAllocation.payoutAllocationId ||
      payoutChild.amount.amountMinor !== authorityAllocation.amountMinor
    ) {
      fail("lineage_invalid");
    }
    for (const child of children) {
      if (
        child.bucket === "payout_pending" &&
        child.payoutRequestId === record.authority.payoutRequestId
      ) {
        payoutMinor += BigInt(child.amount.amountMinor);
      } else if (child.bucket !== "available" || child.payoutRequestId !== null) {
        fail("lineage_invalid");
      }
    }
  }
  if (
    payoutMinor !== BigInt(record.authority.amount.amountMinor) ||
    record.authority.astrologerUserId !==
      lotsById.get(record.consumedLotIds[0] as string)?.astrologerUserId
  ) {
    fail("conservation_violation");
  }
}

export function assertPayoutReleasedHistory(
  record: PayableLotHistoryRecord,
  lotsById: ReadonlyMap<string, PayableSourceLot>
): void {
  if (
    record.sourceKey.kind !== "payout" ||
    record.sourceKey.operation !== "released" ||
    record.consumedLotIds.length === 0 ||
    record.createdLotIds.length !== record.consumedLotIds.length ||
    record.referencedLotIds.length !== 0 ||
    record.refundOrigins.length !== 0 ||
    record.chargebackAllocations.length !== 0 ||
    record.reserveAllocation !== null ||
    record.paymentIntegrity !== null ||
    record.blocks !== null ||
    record.holdReleaseEvidence !== null ||
    record.authority?.kind !== "payout_no_transfer_outcome" ||
    record.sourceKey.sourceId !== record.authority.payoutRequestId ||
    record.occurredAt !== record.authority.decidedAt
  ) {
    fail("lineage_invalid");
  }
  assertOneToOneBucketMove(record, lotsById, "payout_pending", "available");
}

export function assertPayoutPaidHistory(
  record: PayableLotHistoryRecord,
  lotsById: ReadonlyMap<string, PayableSourceLot>,
  history: readonly PayableLotHistoryRecord[]
): void {
  if (
    record.sourceKey.kind !== "payout" ||
    record.sourceKey.operation !== "paid" ||
    record.consumedLotIds.length === 0 ||
    record.createdLotIds.length !== 0 ||
    record.referencedLotIds.length !== 0 ||
    record.refundOrigins.length !== 0 ||
    record.chargebackAllocations.length !== 0 ||
    record.reserveAllocation !== null ||
    record.paymentIntegrity !== null ||
    record.blocks !== null ||
    record.holdReleaseEvidence !== null ||
    record.authority?.kind !== "payout_paid" ||
    record.sourceKey.sourceId !== record.authority.payoutRequestId ||
    record.occurredAt !== record.authority.transferredAt
  ) {
    fail("lineage_invalid");
  }
  const authority = record.authority;
  if (authority?.kind !== "payout_paid") fail("lineage_invalid");
  for (const lotId of record.consumedLotIds) {
    const lot = lotsById.get(lotId);
    if (
      !lot ||
      lot.bucket !== "payout_pending" ||
      lot.payoutRequestId !== authority.payoutRequestId
    ) {
      fail("lineage_invalid");
    }
  }
  if (
    history.some(
      (candidate) =>
        candidate !== record &&
        candidate.authority?.kind === "payout_paid" &&
        candidate.authority.bankReference === authority.bankReference
    )
  ) {
    fail("duplicate_operation_source");
  }
}

export function assertPayoutReturnedHistory(
  record: PayableLotHistoryRecord,
  lotsById: ReadonlyMap<string, PayableSourceLot>,
  history: readonly PayableLotHistoryRecord[]
): void {
  if (
    record.consumedLotIds.length !== 0 ||
    record.referencedLotIds.length === 0 ||
    record.createdLotIds.length !== record.referencedLotIds.length ||
    record.refundOrigins.length !== 0 ||
    record.chargebackAllocations.length !== 0 ||
    record.reserveAllocation !== null ||
    record.paymentIntegrity !== null ||
    record.blocks !== null ||
    record.holdReleaseEvidence !== null ||
    record.authority?.kind !== "payout_return" ||
    record.occurredAt !== record.authority.returnedAt
  ) {
    fail("lineage_invalid");
  }
  const authority = record.authority;
  if (authority?.kind !== "payout_return") fail("lineage_invalid");
  assertPayoutReturnSource(authority, record.sourceKey);
  const paid = history.find(
    (candidate) =>
      candidate.kind === "payout_paid" &&
      candidate.authority?.kind === "payout_paid" &&
      candidate.authority.payoutRequestId === authority.payoutRequestId
  );
  if (!paid || paid.authority?.kind !== "payout_paid") fail("lineage_invalid");
  if (
    paid.authority.bankReference !== authority.bankReference ||
    !sameIdentifierSet(record.referencedLotIds, paid.consumedLotIds)
  ) {
    fail("lineage_invalid");
  }
  for (const referencedId of record.referencedLotIds) {
    const parent = lotsById.get(referencedId);
    const child = record.createdLotIds
      .map((lotId) => lotsById.get(lotId))
      .find((lot) => lot?.parentLotId === referencedId);
    if (
      !parent ||
      !child ||
      child.bucket !== "reserved" ||
      !sameMoney(child.amount, parent.amount)
    ) {
      fail("conservation_violation");
    }
  }
}

export function assertOneToOneBucketMove(
  record: PayableLotHistoryRecord,
  lotsById: ReadonlyMap<string, PayableSourceLot>,
  sourceBucket: PayableLotBucket,
  targetBucket: PayableLotBucket
): void {
  for (const consumedId of record.consumedLotIds) {
    const parent = lotsById.get(consumedId);
    const child = record.createdLotIds
      .map((lotId) => lotsById.get(lotId))
      .find((lot) => lot?.parentLotId === consumedId);
    if (
      !parent ||
      parent.bucket !== sourceBucket ||
      !child ||
      child.bucket !== targetBucket ||
      !sameMoney(child.amount, parent.amount)
    ) {
      fail("conservation_violation");
    }
  }
}
