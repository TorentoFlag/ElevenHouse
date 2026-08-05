import { Temporal } from "@js-temporal/polyfill";
import { sameFinanceCanonicalValueV1 } from "./finance-canonical-digest";
import {
  type PayableLotHistoryRecord,
  type PayableLotReferenceState,
  type PayableSourceLot,
  type PayoutNoTransferOutcomeAuthority,
  type RefundLotOrigin
} from "./source-lot-types";
import { fail } from "./source-lot-validation";

import {
  assertInheritedLotIdentity,
  assertNoAuxiliaryLotMetadata,
  lotDescendsFromMap,
  sameIdentifierSet
} from "./source-lot-reference-core";
function sameRefundOrigins(
  left: readonly RefundLotOrigin[],
  right: readonly RefundLotOrigin[]
): boolean {
  return sameFinanceCanonicalValueV1(left, right);
}

export function assertRefundApprovedHistory(
  record: PayableLotHistoryRecord,
  lotsById: ReadonlyMap<string, PayableSourceLot>
): void {
  const authority = record.authority;
  assertNoAuxiliaryLotMetadata(record, { refundOrigins: true });
  if (
    authority?.kind !== "refund_approval" ||
    record.sourceKey.kind !== "refund" ||
    record.sourceKey.operation !== "approved" ||
    record.sourceKey.sourceId !== authority.refundId ||
    record.referencedLotIds.length !== 0 ||
    record.chargebackAllocations.length !== 0
  ) {
    fail("lineage_invalid");
  }
  if (authority.payableAmount.amountMinor === 0) {
    if (
      record.consumedLotIds.length !== 0 ||
      record.createdLotIds.length !== 0 ||
      record.refundOrigins.length !== 0 ||
      ![...lotsById.values()].some(
        (lot) =>
          lot.sourceId === authority.orderId &&
          lot.astrologerUserId === authority.astrologerUserId &&
          lot.amount.currency === authority.payableAmount.currency
      )
    ) {
      fail("lineage_invalid");
    }
    return;
  }
  if (
    record.refundOrigins.length !== record.consumedLotIds.length ||
    !sameIdentifierSet(
      record.refundOrigins.map((origin) => origin.sourceLotId),
      record.consumedLotIds
    )
  ) {
    fail("lineage_invalid");
  }
  let approvedMinor = 0n;
  for (const origin of record.refundOrigins) {
    const parent = lotsById.get(origin.sourceLotId);
    const children = record.createdLotIds
      .map((lotId) => lotsById.get(lotId))
      .filter((lot): lot is PayableSourceLot => lot?.parentLotId === origin.sourceLotId);
    const refundPending = children.find((lot) => lot.lotId === origin.refundPendingLotId);
    if (
      !parent ||
      parent.sourceId !== authority.orderId ||
      parent.astrologerUserId !== authority.astrologerUserId ||
      parent.amount.currency !== authority.payableAmount.currency ||
      parent.bucket !== origin.originalBucket ||
      parent.rootLotId !== origin.rootLotId ||
      parent.becameAvailableAt !== origin.becameAvailableAt ||
      origin.amountMinor > parent.amount.amountMinor ||
      !refundPending ||
      refundPending.bucket !== "refund_pending" ||
      refundPending.refundId !== authority.refundId ||
      refundPending.payoutRequestId !== null ||
      refundPending.amount.amountMinor !== origin.amountMinor ||
      refundPending.payoutAllocationId !== parent.payoutAllocationId
    ) {
      fail("lineage_invalid");
    }
    assertInheritedLotIdentity(parent, refundPending);
    const remainderMinor = parent.amount.amountMinor - origin.amountMinor;
    const remainders = children.filter((lot) => lot.lotId !== refundPending.lotId);
    if (
      (remainderMinor === 0 && remainders.length !== 0) ||
      (remainderMinor > 0 &&
        (remainders.length !== 1 ||
          remainders[0]?.bucket !== parent.bucket ||
          remainders[0].amount.amountMinor !== remainderMinor ||
          remainders[0].becameAvailableAt !== parent.becameAvailableAt ||
          remainders[0].refundId !== null ||
          remainders[0].payoutRequestId !== parent.payoutRequestId ||
          remainders[0].payoutAllocationId !== parent.payoutAllocationId))
    ) {
      fail("conservation_violation");
    }
    if (remainders[0]) assertInheritedLotIdentity(parent, remainders[0]);
    approvedMinor += BigInt(origin.amountMinor);
  }
  if (
    approvedMinor !== BigInt(authority.payableAmount.amountMinor) ||
    record.createdLotIds.length !==
      record.refundOrigins.reduce((count, origin) => {
        const parent = lotsById.get(origin.sourceLotId);
        return count + (parent && parent.amount.amountMinor > origin.amountMinor ? 2 : 1);
      }, 0)
  ) {
    fail("conservation_violation");
  }
}

function refundApprovalBefore(
  record: PayableLotHistoryRecord,
  history: readonly PayableLotHistoryRecord[],
  refundId: string
): PayableLotHistoryRecord {
  const approvals = history.filter(
    (candidate) =>
      candidate.previousVersion < record.previousVersion &&
      candidate.authority?.kind === "refund_approval" &&
      candidate.authority.refundId === refundId
  );
  if (approvals.length !== 1) fail("lineage_invalid");
  return approvals[0] as PayableLotHistoryRecord;
}

function assertRefundTerminalAuthority(
  record: PayableLotHistoryRecord,
  approval: PayableLotHistoryRecord,
  lotsById: ReadonlyMap<string, PayableSourceLot>
): void {
  const authority = record.authority;
  if (
    approval.authority?.kind !== "refund_approval" ||
    (authority?.kind !== "refund_confirmed" && authority?.kind !== "refund_failed") ||
    authority.refundId !== approval.authority.refundId ||
    authority.payableAmount.amountMinor !== approval.authority.payableAmount.amountMinor ||
    authority.payableAmount.currency !== approval.authority.payableAmount.currency ||
    authority.accountingAllocationId !== approval.authority.accountingAllocationId ||
    authority.accountingAllocationVersion !== approval.authority.accountingAllocationVersion ||
    !sameRefundOrigins(record.refundOrigins, approval.refundOrigins)
  ) {
    fail("lineage_invalid");
  }
  if (Temporal.Instant.compare(record.occurredAt, approval.occurredAt) < 0) {
    fail("lineage_invalid");
  }
  const approvalAuthority = approval.authority;
  if (approvalAuthority?.kind !== "refund_approval") fail("lineage_invalid");
  const sourceLots =
    approval.refundOrigins.length > 0
      ? approval.refundOrigins.map((origin) => lotsById.get(origin.sourceLotId))
      : [...lotsById.values()].filter((lot) => lot.sourceId === approvalAuthority.orderId);
  if (
    sourceLots.length === 0 ||
    sourceLots.some(
      (lot) =>
        !lot ||
        lot.captureSource.providerAccountId !== authority.providerAccountId ||
        lot.captureSource.providerPaymentId !== authority.providerPaymentId ||
        lot.economics.gross.currency !== authority.providerRefundAmount.currency ||
        authority.providerRefundAmount.amountMinor > lot.economics.gross.amountMinor
    )
  ) {
    fail("lineage_invalid");
  }
}

export function assertRefundConfirmedHistory(
  record: PayableLotHistoryRecord,
  lotsById: ReadonlyMap<string, PayableSourceLot>,
  history: readonly PayableLotHistoryRecord[]
): void {
  const authority = record.authority;
  assertNoAuxiliaryLotMetadata(record, { refundOrigins: true });
  if (
    authority?.kind !== "refund_confirmed" ||
    record.sourceKey.kind !== "refund" ||
    record.sourceKey.operation !== "confirmed" ||
    record.sourceKey.sourceId !== authority.refundId ||
    record.occurredAt !== authority.confirmedAt ||
    record.createdLotIds.length !== 0 ||
    record.referencedLotIds.length !== 0
  ) {
    fail("lineage_invalid");
  }
  const approval = refundApprovalBefore(record, history, authority.refundId);
  assertRefundTerminalAuthority(record, approval, lotsById);
  if (
    !sameIdentifierSet(
      record.consumedLotIds,
      approval.refundOrigins.map((origin) => origin.refundPendingLotId)
    )
  ) {
    fail("lineage_invalid");
  }
  for (const origin of approval.refundOrigins) {
    const lot = lotsById.get(origin.refundPendingLotId);
    if (
      !lot ||
      lot.bucket !== "refund_pending" ||
      lot.refundId !== authority.refundId ||
      lot.amount.amountMinor !== origin.amountMinor
    ) {
      fail("lineage_invalid");
    }
  }
}

export function assertRefundFailedHistory(
  record: PayableLotHistoryRecord,
  lotsById: ReadonlyMap<string, PayableSourceLot>,
  history: readonly PayableLotHistoryRecord[]
): void {
  const authority = record.authority;
  assertNoAuxiliaryLotMetadata(record, { refundOrigins: true });
  if (
    authority?.kind !== "refund_failed" ||
    record.sourceKey.kind !== "refund" ||
    record.sourceKey.operation !== "failed" ||
    record.sourceKey.sourceId !== authority.refundId ||
    record.occurredAt !== authority.failedAt ||
    record.referencedLotIds.length !== 0
  ) {
    fail("lineage_invalid");
  }
  const approval = refundApprovalBefore(record, history, authority.refundId);
  assertRefundTerminalAuthority(record, approval, lotsById);
  if (
    !sameIdentifierSet(
      record.consumedLotIds,
      approval.refundOrigins.map((origin) => origin.refundPendingLotId)
    ) ||
    record.createdLotIds.length !== record.consumedLotIds.length
  ) {
    fail("lineage_invalid");
  }
  for (const origin of approval.refundOrigins) {
    const parent = lotsById.get(origin.refundPendingLotId);
    const children = record.createdLotIds
      .map((lotId) => lotsById.get(lotId))
      .filter((lot): lot is PayableSourceLot => lot?.parentLotId === origin.refundPendingLotId);
    const child = children[0];
    if (
      !parent ||
      parent.bucket !== "refund_pending" ||
      parent.refundId !== authority.refundId ||
      parent.amount.amountMinor !== origin.amountMinor ||
      children.length !== 1 ||
      !child ||
      child.bucket !== origin.originalBucket ||
      child.amount.amountMinor !== origin.amountMinor ||
      child.becameAvailableAt !== origin.becameAvailableAt ||
      child.refundId !== null ||
      child.payoutRequestId !== null ||
      child.payoutAllocationId !== parent.payoutAllocationId
    ) {
      fail("lineage_invalid");
    }
    assertInheritedLotIdentity(parent, child);
  }
}

export function assertRefundBridgePayoutFailedHistory(
  record: PayableLotHistoryRecord,
  lotsById: ReadonlyMap<string, PayableSourceLot>,
  history: readonly PayableLotHistoryRecord[]
): void {
  const authority = record.authority;
  assertNoAuxiliaryLotMetadata(record);
  if (
    authority?.kind !== "refund_bridge_payout_failed" ||
    record.sourceKey.kind !== "refund" ||
    record.sourceKey.operation !== "bridge_payout_failed" ||
    record.sourceKey.sourceId !== authority.bridgeAllocationId ||
    record.occurredAt !== authority.payoutOutcomeAuthority.decidedAt ||
    record.consumedLotIds.length === 0 ||
    record.referencedLotIds.length !== 0
  ) {
    fail("lineage_invalid");
  }
  const confirmation = history.find(
    (candidate) =>
      candidate.previousVersion < record.previousVersion &&
      candidate.authority?.kind === "refund_confirmed" &&
      candidate.authority.refundId === authority.refundId
  );
  const approval = history.find(
    (candidate) =>
      candidate.previousVersion < record.previousVersion &&
      candidate.authority?.kind === "refund_approval" &&
      candidate.authority.refundId === authority.refundId
  );
  const payoutRequest = history.find(
    (candidate) =>
      candidate.previousVersion < record.previousVersion &&
      candidate.authority?.kind === "payout_request" &&
      candidate.authority.payoutRequestId === authority.payoutRequestId
  );
  const payoutAllocation =
    payoutRequest?.authority?.kind === "payout_request"
      ? payoutRequest.authority.allocations.find(
          (allocation) => allocation.payoutAllocationId === authority.payoutAllocationId
        )
      : undefined;
  if (
    confirmation?.authority?.kind !== "refund_confirmed" ||
    approval?.authority?.kind !== "refund_approval" ||
    approval.authority.orderId !== authority.refundedOrderId ||
    confirmation.authority.authorityId !== authority.confirmedRefundAuthorityId ||
    confirmation.authority.version !== authority.confirmedRefundAuthorityVersion ||
    confirmation.authority.canonicalEvidenceId !== authority.confirmedRefundEvidenceId ||
    confirmation.authority.accountingAllocationId !== authority.accountingAllocationId ||
    confirmation.authority.accountingAllocationVersion !== authority.accountingAllocationVersion ||
    !payoutAllocation ||
    lotsById.get(payoutAllocation.payoutPendingLotId)?.sourceId !== authority.refundedOrderId ||
    Temporal.Instant.compare(record.occurredAt, confirmation.occurredAt) < 0
  ) {
    fail("lineage_invalid");
  }
  let bridgedMinor = 0n;
  let createdCount = 0;
  for (const consumedId of record.consumedLotIds) {
    const parent = lotsById.get(consumedId);
    const children = record.createdLotIds
      .map((lotId) => lotsById.get(lotId))
      .filter((lot): lot is PayableSourceLot => lot?.parentLotId === consumedId);
    if (
      !parent ||
      parent.bucket !== "payout_pending" ||
      parent.payoutRequestId !== authority.payoutRequestId ||
      parent.payoutAllocationId !== authority.payoutAllocationId ||
      parent.sourceId !== authority.refundedOrderId ||
      !lotDescendsFromMap(lotsById, parent, payoutAllocation.payoutPendingLotId) ||
      children.length > 1
    ) {
      fail("lineage_invalid");
    }
    const remainder = children[0];
    if (remainder) {
      assertInheritedLotIdentity(parent, remainder);
      if (
        remainder.bucket !== "payout_pending" ||
        remainder.payoutRequestId !== authority.payoutRequestId ||
        remainder.payoutAllocationId !== authority.payoutAllocationId ||
        remainder.refundId !== null ||
        remainder.amount.amountMinor >= parent.amount.amountMinor
      ) {
        fail("lineage_invalid");
      }
      createdCount += 1;
    }
    bridgedMinor += BigInt(parent.amount.amountMinor - (remainder?.amount.amountMinor ?? 0));
  }
  if (
    createdCount !== record.createdLotIds.length ||
    bridgedMinor !== BigInt(authority.amount.amountMinor) ||
    authority.amount.currency !== lotsById.get(record.consumedLotIds[0] as string)?.amount.currency
  ) {
    fail("conservation_violation");
  }
}

export function assertRefundLifecycleIntegrity(
  state: PayableLotReferenceState,
  lotsById: ReadonlyMap<string, PayableSourceLot>
): void {
  const approvals = new Set<string>();
  const approvalAllocations = new Set<string>();
  const terminals = new Set<string>();
  const providerEvidence = new Set<string>();
  const providerRefunds = new Set<string>();
  const bridgeAllocations = new Set<string>();
  const providerCumulative = new Map<string, { amountMinor: number; confirmedAt: string }>();
  const ordered = [...state.history].sort(
    (left, right) => left.previousVersion - right.previousVersion
  );
  for (const record of ordered) {
    const authority = record.authority;
    if (authority?.kind === "refund_approval") {
      if (
        approvals.has(authority.refundId) ||
        approvalAllocations.has(authority.accountingAllocationId)
      ) {
        fail("duplicate_operation_source");
      }
      approvals.add(authority.refundId);
      approvalAllocations.add(authority.accountingAllocationId);
      continue;
    }
    if (authority?.kind === "refund_confirmed" || authority?.kind === "refund_failed") {
      const providerKey = JSON.stringify([
        authority.providerAccountId,
        authority.providerPaymentId,
        authority.providerRefundId
      ]);
      if (
        !approvals.has(authority.refundId) ||
        terminals.has(authority.refundId) ||
        providerEvidence.has(authority.canonicalEvidenceId) ||
        providerRefunds.has(providerKey)
      ) {
        fail("duplicate_operation_source");
      }
      terminals.add(authority.refundId);
      providerEvidence.add(authority.canonicalEvidenceId);
      providerRefunds.add(providerKey);
      if (authority.kind === "refund_confirmed") {
        const paymentKey = JSON.stringify([
          authority.providerAccountId,
          authority.providerPaymentId
        ]);
        const previous = providerCumulative.get(paymentKey);
        if (
          authority.priorProviderTotalRefunded.amountMinor !== (previous?.amountMinor ?? 0) ||
          (previous && Temporal.Instant.compare(authority.confirmedAt, previous.confirmedAt) < 0)
        ) {
          fail("lineage_invalid");
        }
        const approval = state.history.find(
          (candidate) =>
            candidate.authority?.kind === "refund_approval" &&
            candidate.authority.refundId === authority.refundId
        );
        const approvalAuthority = approval?.authority;
        const source =
          approvalAuthority?.kind === "refund_approval"
            ? [...lotsById.values()].find((lot) => lot.sourceId === approvalAuthority.orderId)
            : undefined;
        if (
          !source ||
          authority.nextProviderTotalRefunded.amountMinor > source.economics.gross.amountMinor
        ) {
          fail("lineage_invalid");
        }
        providerCumulative.set(paymentKey, {
          amountMinor: authority.nextProviderTotalRefunded.amountMinor,
          confirmedAt: authority.confirmedAt
        });
      }
      continue;
    }
    if (authority?.kind === "refund_bridge_payout_failed") {
      if (bridgeAllocations.has(authority.bridgeAllocationId)) {
        fail("duplicate_operation_source");
      }
      bridgeAllocations.add(authority.bridgeAllocationId);
      const outcome = authority.payoutOutcomeAuthority;
      const paid = state.history.some(
        (candidate) =>
          candidate.authority?.kind === "payout_paid" &&
          candidate.authority.payoutRequestId === authority.payoutRequestId
      );
      const releases = state.history.filter(
        (candidate) =>
          candidate.authority?.kind === "payout_no_transfer_outcome" &&
          candidate.authority.payoutRequestId === authority.payoutRequestId
      );
      if (
        paid ||
        outcome.payoutRequestId !== authority.payoutRequestId ||
        outcome.decidedAt !== record.occurredAt ||
        releases.length > 1 ||
        releases.some(
          (release) =>
            release.authority?.kind !== "payout_no_transfer_outcome" ||
            !sameNoTransferOutcome(release.authority, outcome)
        ) ||
        state.history.some((candidate) => {
          const other = candidate.authority;
          return (
            other?.kind === "refund_bridge_payout_failed" &&
            other !== authority &&
            other.payoutRequestId === authority.payoutRequestId &&
            !sameNoTransferOutcome(other.payoutOutcomeAuthority, outcome)
          );
        })
      ) {
        fail("lineage_invalid");
      }
    }
  }
}

function sameNoTransferOutcome(
  left: PayoutNoTransferOutcomeAuthority,
  right: PayoutNoTransferOutcomeAuthority
): boolean {
  return (
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
