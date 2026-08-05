import { serializeFinanceSourceKey } from "./finance-source-key";
import { assertLotCollectionIntegrity, assertUniqueLotIds } from "./source-lot-collection";
import {
  type ChargebackRestriction,
  type PayableLotHistoryRecord,
  type PayableLotReferenceState,
  type PayableLotReferenceStateTransition,
  type PayableSourceLot
} from "./source-lot-types";
import { fail } from "./source-lot-validation";

import {
  assertChargebackConfirmedHistory,
  assertChargebackLifecycleIntegrity,
  assertChargebackPrincipalAllocatedHistory,
  assertChargebackRecoveryCollectedHistory,
  assertChargebackWonReservedHistory
} from "./source-lot-reference-chargeback";
import {
  assertInheritedLotIdentity,
  freezePayableLotReferenceState
} from "./source-lot-reference-core";
import {
  assertPayoutPaidHistory,
  assertPayoutReleasedHistory,
  assertPayoutRequestedHistory,
  assertPayoutReturnedHistory
} from "./source-lot-reference-payout";
import {
  assertRefundApprovedHistory,
  assertRefundBridgePayoutFailedHistory,
  assertRefundConfirmedHistory,
  assertRefundFailedHistory,
  assertRefundLifecycleIntegrity
} from "./source-lot-reference-refund";
import {
  assertHoldReleaseHistory,
  assertReserveReleaseHistory,
  assertSaleCaptureHistory
} from "./source-lot-reference-sale-hold";
export function buildNextPayableLotReferenceState(
  state: PayableLotReferenceState,
  consumedLots: readonly PayableSourceLot[],
  createdLots: readonly PayableSourceLot[],
  record: PayableLotHistoryRecord,
  chargebackRestrictions: readonly ChargebackRestriction[] = state.chargebackRestrictions
): PayableLotReferenceState {
  const consumedById = new Map(consumedLots.map((lot) => [lot.lotId, lot] as const));
  const lots = state.lots.map((lot) => consumedById.get(lot.lotId) ?? lot);
  lots.push(...createdLots);
  const next = freezePayableLotReferenceState({
    version: record.nextVersion,
    astrologerUserId: state.astrologerUserId,
    currency: state.currency,
    lots,
    history: [...state.history, record],
    chargebackRestrictions,
    restrictionHistory: state.restrictionHistory
  });
  assertPayableLotReferenceStateIntegrity(next);
  return next;
}

export function freezePayableLotReferenceStateTransition(
  previousState: PayableLotReferenceState,
  state: PayableLotReferenceState,
  consumedLots: readonly PayableSourceLot[],
  createdLots: readonly PayableSourceLot[],
  historyRecord: PayableLotHistoryRecord
): PayableLotReferenceStateTransition {
  return Object.freeze({
    kind: historyRecord.kind,
    operationId: historyRecord.operationId,
    sourceKey: historyRecord.sourceKey,
    previousVersion: previousState.version,
    nextVersion: state.version,
    previousStateDigest: previousState.stateDigest,
    nextStateDigest: state.stateDigest,
    consumedLots: Object.freeze([...consumedLots]),
    createdLots: Object.freeze([...createdLots]),
    historyRecord,
    state
  });
}

export function assertPayableLotReferenceStateIntegrity(state: PayableLotReferenceState): void {
  if (state.version !== state.history.length + state.restrictionHistory.length + 1) {
    fail("lineage_invalid");
  }
  if (
    state.history.some(
      (record, index) =>
        index > 0 &&
        (state.history[index - 1]?.previousVersion ?? Number.MAX_SAFE_INTEGER) >=
          record.previousVersion
    ) ||
    state.restrictionHistory.some(
      (record, index) =>
        index > 0 &&
        (state.restrictionHistory[index - 1]?.previousVersion ?? Number.MAX_SAFE_INTEGER) >=
          record.previousVersion
    )
  ) {
    fail("lineage_invalid");
  }
  const versionEdges = [
    ...state.history.map((record) => ({
      previousVersion: record.previousVersion,
      nextVersion: record.nextVersion
    })),
    ...state.restrictionHistory.map((record) => ({
      previousVersion: record.previousVersion,
      nextVersion: record.nextVersion
    }))
  ].sort((left, right) => left.previousVersion - right.previousVersion);
  for (const [index, edge] of versionEdges.entries()) {
    if (edge.previousVersion !== index + 1 || edge.nextVersion !== index + 2) {
      fail("lineage_invalid");
    }
  }
  assertUniqueLotIds(state.lots);
  assertLotCollectionIntegrity(state.lots);
  if (
    state.lots.some(
      (lot) =>
        lot.astrologerUserId !== state.astrologerUserId || lot.amount.currency !== state.currency
    )
  ) {
    fail("owner_currency_mismatch");
  }

  const lotsById = new Map(state.lots.map((lot) => [lot.lotId, lot] as const));
  for (const lot of state.lots) {
    if (lot.parentLotId === null) continue;
    const parent = lotsById.get(lot.parentLotId);
    if (!parent) fail("lineage_invalid");
    assertInheritedLotIdentity(parent, lot);
  }
  const createdByLot = new Map<string, PayableLotHistoryRecord>();
  const consumedByLot = new Map<string, PayableLotHistoryRecord>();
  const operationIds = new Set<string>();
  const sourceKeys = new Set<string>();

  for (const record of state.history) {
    const serializedSource = serializeFinanceSourceKey(record.sourceKey);
    if (operationIds.has(record.operationId) || sourceKeys.has(serializedSource)) {
      fail("duplicate_operation_source");
    }
    operationIds.add(record.operationId);
    sourceKeys.add(serializedSource);

    for (const lotId of record.consumedLotIds) {
      const lot = lotsById.get(lotId);
      if (!lot || !createdByLot.has(lotId) || consumedByLot.has(lotId)) fail("lineage_invalid");
      if (
        lot.consumedByOperationId !== record.operationId ||
        lot.consumedAt !== record.occurredAt
      ) {
        fail("lineage_invalid");
      }
      consumedByLot.set(lotId, record);
    }
    for (const lotId of record.createdLotIds) {
      const lot = lotsById.get(lotId);
      if (!lot || createdByLot.has(lotId)) fail("lineage_invalid");
      if (lot.createdByOperationId !== record.operationId || lot.createdAt !== record.occurredAt) {
        fail("lineage_invalid");
      }
      if (lot.parentLotId !== null && !createdByLot.has(lot.parentLotId)) fail("lineage_invalid");
      createdByLot.set(lotId, record);
    }
    for (const lotId of record.referencedLotIds) {
      if (!lotsById.has(lotId) || !createdByLot.has(lotId)) fail("lineage_invalid");
    }

    switch (record.kind) {
      case "sale_capture":
        assertSaleCaptureHistory(record, lotsById);
        break;
      case "hold_release":
        assertHoldReleaseHistory(record, lotsById);
        break;
      case "reserve_release":
        assertReserveReleaseHistory(record, lotsById, state.history);
        break;
      case "payout_requested":
        assertPayoutRequestedHistory(record, lotsById);
        break;
      case "payout_released":
        assertPayoutReleasedHistory(record, lotsById);
        break;
      case "payout_paid":
        assertPayoutPaidHistory(record, lotsById, state.history);
        break;
      case "payout_returned_reserved":
        assertPayoutReturnedHistory(record, lotsById, state.history);
        break;
      case "refund_approved":
        assertRefundApprovedHistory(record, lotsById);
        break;
      case "refund_confirmed":
        assertRefundConfirmedHistory(record, lotsById, state.history);
        break;
      case "refund_failed":
        assertRefundFailedHistory(record, lotsById, state.history);
        break;
      case "refund_bridge_payout_failed":
        assertRefundBridgePayoutFailedHistory(record, lotsById, state.history);
        break;
      case "chargeback_confirmed":
        assertChargebackConfirmedHistory(record, lotsById);
        break;
      case "chargeback_principal_allocated":
        assertChargebackPrincipalAllocatedHistory(record, lotsById);
        break;
      case "chargeback_recovery_collected":
        assertChargebackRecoveryCollectedHistory(record, lotsById, state.history);
        break;
      case "chargeback_won_reserved":
        assertChargebackWonReservedHistory(record, lotsById);
        break;
    }
  }

  assertRefundLifecycleIntegrity(state, lotsById);
  assertChargebackLifecycleIntegrity(state, lotsById);

  const restrictionOperationKeys = new Set<string>();
  for (const record of state.restrictionHistory) {
    if (operationIds.has(record.operationId)) fail("duplicate_operation_source");
    operationIds.add(record.operationId);
    const serialized = JSON.stringify([
      record.operationKey.kind,
      record.operationKey.restrictionId,
      record.operationKey.operation
    ]);
    if (restrictionOperationKeys.has(serialized)) fail("duplicate_operation_source");
    restrictionOperationKeys.add(serialized);
    if (
      (record.operationKey.operation === "lost_final" &&
        record.kind !== "chargeback_lost_closed" &&
        record.kind !== "chargeback_lost_blocked") ||
      (record.operationKey.operation === "lost_allocation_closed" &&
        record.kind !== "chargeback_lost_allocation_closed")
    ) {
      fail("lineage_invalid");
    }
  }

  if (createdByLot.size !== state.lots.length) fail("lineage_invalid");
  for (const lot of state.lots) {
    if ((lot.status === "consumed") !== consumedByLot.has(lot.lotId)) fail("lineage_invalid");
  }
}

/** @deprecated Reference/rebuild oracle; forbidden for online mutation. */
export const buildNextPayableLotState = buildNextPayableLotReferenceState;
/** @deprecated Reference/rebuild oracle; forbidden for online mutation. */
export const freezePayableLotStateTransition = freezePayableLotReferenceStateTransition;
/** @deprecated Reference/rebuild oracle; forbidden for online mutation. */
export const assertPayableLotStateIntegrity = assertPayableLotReferenceStateIntegrity;
