import { Temporal } from "@js-temporal/polyfill";
import { sameProviderAccountIdentityBinding } from "./provider-account-binding";
import {
  type ChargebackConfirmedAuthority,
  type ChargebackRestriction,
  type ChargebackRestrictionHistoryRecord,
  type PayableLotHistoryRecord,
  type PayableLotReferenceState,
  type PayableSourceLot
} from "./source-lot-types";
import { fail, sameMoney } from "./source-lot-validation";
import { chargebackPrincipalConfirmedBasisMatches } from "./source-lot-chargeback-confirmed-basis";

import {
  assertInheritedLotIdentity,
  assertNoAuxiliaryLotMetadata,
  lotDescendsFromMap,
  sameIdentifierSet
} from "./source-lot-reference-core";
export function assertChargebackConfirmedHistory(
  record: PayableLotHistoryRecord,
  lotsById: ReadonlyMap<string, PayableSourceLot>
): void {
  const authority = record.authority;
  assertNoAuxiliaryLotMetadata(record);
  if (
    authority?.kind !== "chargeback_confirmed" ||
    record.sourceKey.kind !== "chargeback" ||
    record.sourceKey.operation !== "confirmed" ||
    record.sourceKey.sourceId !== authority.confirmationId ||
    record.occurredAt !== authority.confirmedAt ||
    record.consumedLotIds.length !== 0 ||
    record.createdLotIds.length !== 0 ||
    record.referencedLotIds.length !== 0
  ) {
    fail("lineage_invalid");
  }
  const orderLots = [...lotsById.values()].filter((lot) => lot.sourceId === authority.orderId);
  if (
    orderLots.length === 0 ||
    orderLots.some(
      (lot) =>
        lot.astrologerUserId !== authority.astrologerUserId ||
        lot.captureSource.providerAccountId !== authority.providerAccount.providerAccountId ||
        lot.captureSource.providerPaymentId !== authority.providerPaymentId ||
        lot.economics.gross.currency !== authority.nextCumulativeDisputedAmount.currency ||
        authority.nextCumulativeDisputedAmount.amountMinor > lot.economics.gross.amountMinor
    )
  ) {
    fail("lineage_invalid");
  }
}

function assertChargebackRemovalHistory(
  record: PayableLotHistoryRecord,
  lotsById: ReadonlyMap<string, PayableSourceLot>,
  expectedAmountMinor: number
): void {
  assertNoAuxiliaryLotMetadata(record, { chargebackAllocations: true });
  if (
    record.referencedLotIds.length !== 0 ||
    record.refundOrigins.length !== 0 ||
    record.chargebackAllocations.length !== record.consumedLotIds.length ||
    !sameIdentifierSet(
      record.chargebackAllocations.map((allocation) => allocation.sourceLotId),
      record.consumedLotIds
    )
  ) {
    fail("lineage_invalid");
  }
  let removedMinor = 0n;
  let expectedCreated = 0;
  for (const allocation of record.chargebackAllocations) {
    const parent = lotsById.get(allocation.sourceLotId);
    const children = record.createdLotIds
      .map((lotId) => lotsById.get(lotId))
      .filter((lot): lot is PayableSourceLot => lot?.parentLotId === allocation.sourceLotId);
    if (
      !parent ||
      parent.rootLotId !== allocation.rootLotId ||
      parent.bucket !== allocation.originalBucket ||
      allocation.allocatedAmountMinor > parent.amount.amountMinor
    ) {
      fail("lineage_invalid");
    }
    const remainderMinor = parent.amount.amountMinor - allocation.allocatedAmountMinor;
    if (remainderMinor === 0) {
      if (allocation.remainderLotId !== null || children.length !== 0) {
        fail("conservation_violation");
      }
    } else {
      const child = children[0];
      if (
        allocation.remainderLotId === null ||
        children.length !== 1 ||
        !child ||
        child.lotId !== allocation.remainderLotId ||
        child.bucket !== parent.bucket ||
        child.amount.amountMinor !== remainderMinor ||
        child.becameAvailableAt !== parent.becameAvailableAt ||
        child.payoutRequestId !== null ||
        child.payoutAllocationId !== parent.payoutAllocationId ||
        child.refundId !== null
      ) {
        fail("conservation_violation");
      }
      assertInheritedLotIdentity(parent, child);
      expectedCreated += 1;
    }
    removedMinor += BigInt(allocation.allocatedAmountMinor);
  }
  if (
    expectedCreated !== record.createdLotIds.length ||
    removedMinor !== BigInt(expectedAmountMinor)
  ) {
    fail("conservation_violation");
  }
}

export function assertChargebackPrincipalAllocatedHistory(
  record: PayableLotHistoryRecord,
  lotsById: ReadonlyMap<string, PayableSourceLot>
): void {
  const authority = record.authority;
  if (
    authority?.kind !== "chargeback_principal_allocation" ||
    record.sourceKey.kind !== "chargeback" ||
    record.sourceKey.operation !== "principal_allocated" ||
    record.sourceKey.sourceId !== authority.accountingAllocationRevisionId
  ) {
    fail("lineage_invalid");
  }
  assertChargebackRemovalHistory(record, lotsById, authority.payableAmount.amountMinor);
  for (const allocation of record.chargebackAllocations) {
    const parent = lotsById.get(allocation.sourceLotId);
    if (
      !parent ||
      parent.sourceId !== authority.orderId ||
      parent.astrologerUserId !== authority.astrologerUserId ||
      parent.amount.currency !== authority.payableAmount.currency ||
      (parent.bucket !== "pending" && parent.bucket !== "available" && parent.bucket !== "reserved")
    ) {
      fail("lineage_invalid");
    }
  }
}

export function assertChargebackRecoveryCollectedHistory(
  record: PayableLotHistoryRecord,
  lotsById: ReadonlyMap<string, PayableSourceLot>,
  history: readonly PayableLotHistoryRecord[]
): void {
  const authority = record.authority;
  if (
    authority?.kind !== "chargeback_recovery_collection" ||
    record.sourceKey.kind !== "chargeback" ||
    record.sourceKey.operation !== "recovery_collected" ||
    record.sourceKey.sourceId !== authority.recoveryCollectionId ||
    record.occurredAt !== authority.collectedAt
  ) {
    fail("lineage_invalid");
  }
  assertChargebackRemovalHistory(record, lotsById, authority.collectedPayableAmount.amountMinor);
  for (const allocation of record.chargebackAllocations) {
    const parent = lotsById.get(allocation.sourceLotId);
    if (
      !parent ||
      parent.sourceId !== authority.collectionSource.sourceOrderId ||
      parent.astrologerUserId !== authority.astrologerUserId ||
      parent.amount.currency !== authority.collectedPayableAmount.currency
    ) {
      fail("lineage_invalid");
    }
    if (authority.collectionSource.kind === "future_payable") {
      if (
        parent.bucket !== "pending" &&
        parent.bucket !== "available" &&
        parent.bucket !== "reserved"
      ) {
        fail("lineage_invalid");
      }
      continue;
    }
    if (
      parent.bucket !== "reserved" ||
      parent.payoutAllocationId !== authority.collectionSource.payoutAllocationId
    ) {
      fail("lineage_invalid");
    }
    const payoutReturn = history.find(
      (candidate) =>
        candidate.previousVersion < record.previousVersion &&
        candidate.kind === "payout_returned_reserved" &&
        candidate.createdLotIds.some((lotId) => lotDescendsFromMap(lotsById, parent, lotId))
    );
    if (
      payoutReturn?.authority?.kind !== "payout_return" ||
      payoutReturn.authority.payoutRequestId !== authority.collectionSource.payoutRequestId ||
      payoutReturn.authority.authorityId !== authority.collectionSource.payoutReturnAuthorityId ||
      payoutReturn.authority.version !== authority.collectionSource.payoutReturnAuthorityVersion ||
      payoutReturn.authority.evidenceId !== authority.collectionSource.payoutReturnEvidenceId
    ) {
      fail("lineage_invalid");
    }
  }
}

export function assertChargebackWonReservedHistory(
  record: PayableLotHistoryRecord,
  lotsById: ReadonlyMap<string, PayableSourceLot>
): void {
  const authority = record.authority;
  assertNoAuxiliaryLotMetadata(record, { chargebackAllocations: true });
  if (
    authority?.kind !== "chargeback_won" ||
    record.sourceKey.kind !== "chargeback" ||
    record.sourceKey.operation !== "won" ||
    record.sourceKey.sourceId !== authority.chargebackCaseId ||
    record.occurredAt !== authority.wonAt ||
    record.consumedLotIds.length !== 0 ||
    record.refundOrigins.length !== 0 ||
    record.createdLotIds.length !== record.referencedLotIds.length ||
    record.chargebackAllocations.length !== record.referencedLotIds.length ||
    !sameIdentifierSet(
      record.chargebackAllocations.map((allocation) => allocation.sourceLotId),
      record.referencedLotIds
    )
  ) {
    fail("lineage_invalid");
  }
  let restoredMinor = 0n;
  for (const allocation of record.chargebackAllocations) {
    const parent = lotsById.get(allocation.sourceLotId);
    const children = record.createdLotIds
      .map((lotId) => lotsById.get(lotId))
      .filter((lot): lot is PayableSourceLot => lot?.parentLotId === allocation.sourceLotId);
    const child = children[0];
    if (
      !parent ||
      parent.status !== "consumed" ||
      parent.rootLotId !== allocation.rootLotId ||
      allocation.remainderLotId !== null ||
      children.length !== 1 ||
      !child ||
      child.bucket !== "reserved" ||
      child.amount.amountMinor !== allocation.allocatedAmountMinor ||
      child.becameAvailableAt !== null ||
      child.payoutRequestId !== null ||
      child.refundId !== null
    ) {
      fail("lineage_invalid");
    }
    assertInheritedLotIdentity(parent, child);
    restoredMinor += BigInt(allocation.allocatedAmountMinor);
  }
  if (restoredMinor !== BigInt(authority.restoredPayableAmount.amountMinor)) {
    fail("conservation_violation");
  }
}

type ChargebackReplayRemoval = Readonly<{
  rootLotId: string;
  originalBucket: "pending" | "available" | "reserved";
  removedMinor: bigint;
  restoredMinor: bigint;
}>;

function unresolvedRefundBefore(
  history: readonly PayableLotHistoryRecord[],
  orderId: string,
  version: number
): boolean {
  return history.some((record) => {
    const approvalAuthority = record.authority;
    if (
      record.previousVersion >= version ||
      approvalAuthority?.kind !== "refund_approval" ||
      approvalAuthority.orderId !== orderId
    ) {
      return false;
    }
    return !history.some(
      (terminal) =>
        terminal.previousVersion < version &&
        (terminal.authority?.kind === "refund_confirmed" ||
          terminal.authority?.kind === "refund_failed") &&
        terminal.authority.refundId === approvalAuthority.refundId
    );
  });
}

function sameChargebackRestriction(
  left: ChargebackRestriction,
  right: ChargebackRestriction
): boolean {
  return (
    left.restrictionId === right.restrictionId &&
    left.version === right.version &&
    left.chargebackCaseId === right.chargebackCaseId &&
    left.orderId === right.orderId &&
    left.astrologerUserId === right.astrologerUserId &&
    left.providerAccountId === right.providerAccountId &&
    left.providerPaymentId === right.providerPaymentId &&
    sameMoney(left.disputedAmount, right.disputedAmount) &&
    left.canonicalEvidenceId === right.canonicalEvidenceId &&
    left.status === right.status &&
    left.confirmedAt === right.confirmedAt &&
    left.closedAt === right.closedAt
  );
}

export function assertChargebackLifecycleIntegrity(
  state: PayableLotReferenceState,
  lotsById: ReadonlyMap<string, PayableSourceLot>
): void {
  void lotsById;
  const projected = new Map<string, ChargebackRestriction>();
  const latestConfirmations = new Map<string, ChargebackConfirmedAuthority>();
  const restrictionIds = new Set<string>();
  const providerPayments = new Set<string>();
  const authorityIds = new Set<string>();
  const evidenceIds = new Set<string>();
  const principalChains = new Map<string, { allocationId: string; version: number }>();
  const principalRevisions = new Set<string>();
  const oneShotAllocations = new Set<string>();
  const recoveryCollections = new Set<string>();
  const removals = new Map<string, ChargebackReplayRemoval>();
  const removedByCase = new Map<string, bigint>();
  const blockedLosses = new Map<string, ChargebackRestrictionHistoryRecord>();
  const events = [
    ...state.history.map((record) => ({ kind: "lot" as const, record })),
    ...state.restrictionHistory.map((record) => ({ kind: "restriction" as const, record }))
  ].sort((left, right) => left.record.previousVersion - right.record.previousVersion);

  for (const event of events) {
    const authority = event.record.authority;
    if (authority === null) continue;
    if (
      authority.kind.startsWith("chargeback_") &&
      (authorityIds.has(authority.authorityId) ||
        ("canonicalEvidenceId" in authority && evidenceIds.has(authority.canonicalEvidenceId)))
    ) {
      fail("duplicate_operation_source");
    }
    if (authority.kind.startsWith("chargeback_")) {
      authorityIds.add(authority.authorityId);
      if ("canonicalEvidenceId" in authority) evidenceIds.add(authority.canonicalEvidenceId);
    }

    if (event.kind === "lot" && authority.kind === "chargeback_confirmed") {
      const current = projected.get(authority.chargebackCaseId);
      const providerKey = JSON.stringify([
        authority.providerAccount.seriesId,
        authority.providerAccount.providerAccountId,
        authority.providerAccount.identityVersion,
        authority.providerPaymentId
      ]);
      if (authority.confirmationKind === "initial") {
        if (
          current ||
          restrictionIds.has(authority.restrictionId) ||
          providerPayments.has(providerKey) ||
          authority.priorRestrictionVersion !== null ||
          authority.priorCumulativeDisputedAmount.amountMinor !== 0
        ) {
          fail("lineage_invalid");
        }
        restrictionIds.add(authority.restrictionId);
        providerPayments.add(providerKey);
        projected.set(
          authority.chargebackCaseId,
          Object.freeze({
            restrictionId: authority.restrictionId,
            version: 1,
            chargebackCaseId: authority.chargebackCaseId,
            orderId: authority.orderId,
            astrologerUserId: authority.astrologerUserId,
            providerAccountId: authority.providerAccount.providerAccountId,
            providerPaymentId: authority.providerPaymentId,
            disputedAmount: authority.nextCumulativeDisputedAmount,
            canonicalEvidenceId: authority.canonicalEvidenceId,
            status: "active" as const,
            confirmedAt: authority.confirmedAt,
            closedAt: null
          })
        );
      } else {
        const priorConfirmation = latestConfirmations.get(authority.chargebackCaseId);
        if (
          !current ||
          !priorConfirmation ||
          !sameProviderAccountIdentityBinding(
            priorConfirmation.providerAccount,
            authority.providerAccount
          ) ||
          current.status !== "active" ||
          current.restrictionId !== authority.restrictionId ||
          current.orderId !== authority.orderId ||
          current.astrologerUserId !== authority.astrologerUserId ||
          current.providerAccountId !== authority.providerAccount.providerAccountId ||
          current.providerPaymentId !== authority.providerPaymentId ||
          current.version !== authority.priorRestrictionVersion ||
          !sameMoney(current.disputedAmount, authority.priorCumulativeDisputedAmount) ||
          Temporal.Instant.compare(authority.confirmedAt, current.confirmedAt) < 0
        ) {
          fail("lineage_invalid");
        }
        projected.set(
          authority.chargebackCaseId,
          Object.freeze({
            ...current,
            version: current.version + 1,
            disputedAmount: authority.nextCumulativeDisputedAmount,
            canonicalEvidenceId: authority.canonicalEvidenceId
          })
        );
      }
      latestConfirmations.set(authority.chargebackCaseId, authority);
      continue;
    }

    if (event.kind === "lot" && authority.kind === "chargeback_principal_allocation") {
      const current = projected.get(authority.chargebackCaseId);
      const chain = principalChains.get(authority.chargebackCaseId);
      if (
        !current ||
        (current.status !== "active" && current.status !== "allocation_blocked") ||
        current.orderId !== authority.orderId ||
        current.astrologerUserId !== authority.astrologerUserId ||
        current.disputedAmount.currency !== authority.payableAmount.currency ||
        !chargebackPrincipalConfirmedBasisMatches(
          authority,
          current,
          latestConfirmations.get(authority.chargebackCaseId) ?? null
        ) ||
        (!chain && authority.accountingAllocationVersion !== 1) ||
        (chain &&
          (chain.allocationId !== authority.accountingAllocationId ||
            authority.accountingAllocationVersion !== chain.version + 1)) ||
        principalRevisions.has(authority.accountingAllocationRevisionId)
      ) {
        fail("lineage_invalid");
      }
      principalChains.set(authority.chargebackCaseId, {
        allocationId: authority.accountingAllocationId,
        version: authority.accountingAllocationVersion
      });
      principalRevisions.add(authority.accountingAllocationRevisionId);
      const nextRemoved =
        (removedByCase.get(authority.chargebackCaseId) ?? 0n) +
        BigInt(authority.payableAmount.amountMinor);
      if (nextRemoved > BigInt(current.disputedAmount.amountMinor)) {
        fail("conservation_violation");
      }
      removedByCase.set(authority.chargebackCaseId, nextRemoved);
      for (const allocation of event.record.chargebackAllocations) {
        const key = JSON.stringify([authority.chargebackCaseId, allocation.sourceLotId]);
        if (removals.has(key)) fail("lineage_invalid");
        removals.set(key, {
          rootLotId: allocation.rootLotId,
          originalBucket: allocation.originalBucket,
          removedMinor: BigInt(allocation.allocatedAmountMinor),
          restoredMinor: 0n
        });
      }
      continue;
    }

    if (event.kind === "lot" && authority.kind === "chargeback_recovery_collection") {
      const current = projected.get(authority.chargebackCaseId);
      if (
        !current ||
        current.status === "closed_won" ||
        current.astrologerUserId !== authority.astrologerUserId ||
        current.disputedAmount.currency !== authority.collectedPayableAmount.currency ||
        recoveryCollections.has(authority.recoveryCollectionId) ||
        oneShotAllocations.has(authority.accountingAllocationId)
      ) {
        fail("lineage_invalid");
      }
      if (authority.collectionSource.kind === "future_payable") {
        if (
          authority.collectionSource.sourceOrderId === current.orderId ||
          unresolvedRefundBefore(
            state.history,
            authority.collectionSource.sourceOrderId,
            event.record.previousVersion
          ) ||
          [...projected.values()].some(
            (restriction) =>
              restriction.chargebackCaseId !== current.chargebackCaseId &&
              restriction.orderId === authority.collectionSource.sourceOrderId &&
              (restriction.status === "active" || restriction.status === "allocation_blocked")
          )
        ) {
          fail("lineage_invalid");
        }
      } else if (authority.collectionSource.sourceOrderId !== current.orderId) {
        fail("lineage_invalid");
      }
      recoveryCollections.add(authority.recoveryCollectionId);
      oneShotAllocations.add(authority.accountingAllocationId);
      const nextRemoved =
        (removedByCase.get(authority.chargebackCaseId) ?? 0n) +
        BigInt(authority.collectedPayableAmount.amountMinor);
      if (nextRemoved > BigInt(current.disputedAmount.amountMinor)) {
        fail("conservation_violation");
      }
      removedByCase.set(authority.chargebackCaseId, nextRemoved);
      for (const allocation of event.record.chargebackAllocations) {
        const key = JSON.stringify([authority.chargebackCaseId, allocation.sourceLotId]);
        if (removals.has(key)) fail("lineage_invalid");
        removals.set(key, {
          rootLotId: allocation.rootLotId,
          originalBucket: allocation.originalBucket,
          removedMinor: BigInt(allocation.allocatedAmountMinor),
          restoredMinor: 0n
        });
      }
      continue;
    }

    if (event.kind === "lot" && authority.kind === "chargeback_won") {
      const current = projected.get(authority.chargebackCaseId);
      if (
        !current ||
        current.status !== "active" ||
        oneShotAllocations.has(authority.accountingAllocationId) ||
        authority.restoredPayableAmount.currency !== current.disputedAmount.currency ||
        authority.suspenseClearedAmount.currency !== current.disputedAmount.currency ||
        BigInt(authority.restoredPayableAmount.amountMinor) +
          BigInt(authority.suspenseClearedAmount.amountMinor) >
          BigInt(current.disputedAmount.amountMinor)
      ) {
        fail("lineage_invalid");
      }
      oneShotAllocations.add(authority.accountingAllocationId);
      for (const allocation of event.record.chargebackAllocations) {
        const key = JSON.stringify([authority.chargebackCaseId, allocation.sourceLotId]);
        const removal = removals.get(key);
        if (
          !removal ||
          removal.rootLotId !== allocation.rootLotId ||
          removal.originalBucket !== allocation.originalBucket ||
          removal.restoredMinor + BigInt(allocation.allocatedAmountMinor) > removal.removedMinor
        ) {
          fail("conservation_violation");
        }
        removals.set(key, {
          ...removal,
          restoredMinor: removal.restoredMinor + BigInt(allocation.allocatedAmountMinor)
        });
      }
      projected.set(
        authority.chargebackCaseId,
        Object.freeze({
          ...current,
          version: current.version + 1,
          canonicalEvidenceId: authority.canonicalEvidenceId,
          status: "closed_won" as const,
          closedAt: authority.wonAt
        })
      );
      continue;
    }

    if (event.kind === "restriction") {
      const current = [...projected.values()].find(
        (restriction) => restriction.restrictionId === event.record.operationKey.restrictionId
      );
      if (
        authority.kind !== "chargeback_lost" ||
        !current ||
        current.chargebackCaseId !== authority.chargebackCaseId ||
        authority.unallocatedSuspense.currency !== current.disputedAmount.currency ||
        authority.unallocatedSuspense.amountMinor > current.disputedAmount.amountMinor ||
        oneShotAllocations.has(authority.accountingAllocationId)
      ) {
        fail("lineage_invalid");
      }
      oneShotAllocations.add(authority.accountingAllocationId);
      const suspenseIsZero = authority.unallocatedSuspense.amountMinor === 0;
      let status: ChargebackRestriction["status"];
      let closedAt: string | null;
      if (event.record.operationKey.operation === "lost_final") {
        const expectedKind = suspenseIsZero ? "chargeback_lost_closed" : "chargeback_lost_blocked";
        if (current.status !== "active" || event.record.kind !== expectedKind) {
          fail("lineage_invalid");
        }
        status = suspenseIsZero ? "closed_lost" : "allocation_blocked";
        closedAt = suspenseIsZero ? authority.lostAt : null;
        if (!suspenseIsZero) blockedLosses.set(current.restrictionId, event.record);
      } else {
        const priorBlocked = blockedLosses.get(current.restrictionId);
        if (
          current.status !== "allocation_blocked" ||
          !suspenseIsZero ||
          event.record.kind !== "chargeback_lost_allocation_closed" ||
          !priorBlocked ||
          authority.version <= priorBlocked.authority.version ||
          authority.accountingAllocationVersion <=
            priorBlocked.authority.accountingAllocationVersion
        ) {
          fail("lineage_invalid");
        }
        status = "closed_lost";
        closedAt = authority.lostAt;
      }
      projected.set(
        current.chargebackCaseId,
        Object.freeze({
          ...current,
          version: current.version + 1,
          canonicalEvidenceId: authority.canonicalEvidenceId,
          status,
          closedAt
        })
      );
    }
  }

  if (
    projected.size !== state.chargebackRestrictions.length ||
    state.chargebackRestrictions.some((actual) => {
      const expected = projected.get(actual.chargebackCaseId);
      return !expected || !sameChargebackRestriction(actual, expected);
    })
  ) {
    fail("lineage_invalid");
  }
}
