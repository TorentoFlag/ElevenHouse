import { freezeTransition } from "./source-lot-codec-core";
import { hydrateLot } from "./source-lot-codec-rehydrate";
import type { PayableLotTransition } from "./source-lot-types";
import { exactDataArray, exactDataRecord, fail, identifier } from "./source-lot-validation";

const persistenceTransitionKeys = ["operationId", "consumedLots", "createdLots"] as const;

/**
 * Strict O(k) persistence envelope for the lots touched by one wallet operation.
 *
 * Unlike the reference-state transition, this envelope never carries the lifetime wallet state.
 * Persistence uses it to retain exact immutable capture/economics/risk/fulfilment provenance and
 * must compare its lot identities, amounts and lineage with the independently rehydrated operation
 * receipt while holding the wallet and affected-lot locks.
 */
export function rehydratePayableLotPersistenceTransition(input: unknown): PayableLotTransition {
  const fields = exactDataRecord(input, persistenceTransitionKeys);
  const operationId = identifier(fields.operationId);
  const consumedLots = Object.freeze(exactDataArray(fields.consumedLots).map(hydrateLot));
  const createdLots = Object.freeze(exactDataArray(fields.createdLots).map(hydrateLot));
  const touchedIds = [...consumedLots, ...createdLots].map((lot) => lot.lotId);

  if (new Set(touchedIds).size !== touchedIds.length) fail("duplicate_lot_id");
  if (
    consumedLots.some(
      (lot) =>
        lot.status !== "consumed" ||
        lot.consumedByOperationId !== operationId ||
        lot.consumedAt === null
    ) ||
    createdLots.some(
      (lot) =>
        lot.status !== "active" ||
        lot.createdByOperationId !== operationId ||
        lot.consumedByOperationId !== null ||
        lot.consumedAt !== null
    )
  ) {
    fail("lineage_invalid");
  }

  return freezeTransition(operationId, consumedLots, createdLots);
}

export type { PayableLotTransition } from "./source-lot-types";
