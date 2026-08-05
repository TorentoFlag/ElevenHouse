import {
  type ChargebackLotAllocation,
  type ChargebackRestriction,
  type PayableLotReferenceState
} from "./source-lot-types";
import { fail } from "./source-lot-validation";
export function activeChargebackRestriction(
  state: PayableLotReferenceState,
  chargebackCaseId: string
): ChargebackRestriction {
  const restriction = state.chargebackRestrictions.find(
    (candidate) => candidate.chargebackCaseId === chargebackCaseId
  );
  if (
    !restriction ||
    (restriction.status !== "active" && restriction.status !== "allocation_blocked")
  ) {
    fail("release_blocked");
  }
  return restriction;
}

export function chargebackRestrictionForRecovery(
  state: PayableLotReferenceState,
  chargebackCaseId: string
): ChargebackRestriction {
  const restriction = state.chargebackRestrictions.find(
    (candidate) => candidate.chargebackCaseId === chargebackCaseId
  );
  if (!restriction || restriction.status === "closed_won") fail("release_blocked");
  return restriction;
}

export function chargebackAllocatedByLot(
  state: PayableLotReferenceState,
  chargebackCaseId: string
): ReadonlyMap<string, bigint> {
  const result = new Map<string, bigint>();
  for (const record of state.history) {
    if (
      (record.authority?.kind !== "chargeback_principal_allocation" &&
        record.authority?.kind !== "chargeback_recovery_collection") ||
      record.authority.chargebackCaseId !== chargebackCaseId
    ) {
      continue;
    }
    for (const allocation of record.chargebackAllocations) {
      result.set(
        allocation.sourceLotId,
        (result.get(allocation.sourceLotId) ?? 0n) + BigInt(allocation.allocatedAmountMinor)
      );
    }
  }
  return result;
}

export function chargebackRemovalAllocation(
  state: PayableLotReferenceState,
  chargebackCaseId: string,
  sourceLotId: string
): ChargebackLotAllocation | undefined {
  for (const record of state.history) {
    if (
      (record.authority?.kind !== "chargeback_principal_allocation" &&
        record.authority?.kind !== "chargeback_recovery_collection") ||
      record.authority.chargebackCaseId !== chargebackCaseId
    ) {
      continue;
    }
    const allocation = record.chargebackAllocations.find(
      (candidate) => candidate.sourceLotId === sourceLotId
    );
    if (allocation) return allocation;
  }
  return undefined;
}

export function chargebackRestoredByLot(
  state: PayableLotReferenceState,
  chargebackCaseId: string
): ReadonlyMap<string, bigint> {
  const result = new Map<string, bigint>();
  for (const record of state.history) {
    if (
      record.authority?.kind !== "chargeback_won" ||
      record.authority.chargebackCaseId !== chargebackCaseId
    ) {
      continue;
    }
    for (const allocation of record.chargebackAllocations) {
      result.set(
        allocation.sourceLotId,
        (result.get(allocation.sourceLotId) ?? 0n) + BigInt(allocation.allocatedAmountMinor)
      );
    }
  }
  return result;
}
