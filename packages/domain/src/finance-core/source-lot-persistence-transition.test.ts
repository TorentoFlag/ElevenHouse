import { describe, expect, it } from "vitest";

import { buildReceiptTransitionCases } from "./source-lot-operation-receipt-test-fixtures";
import { rehydratePayableLotPersistenceTransition } from "./source-lot-persistence-transition";
import { PayableSourceLotIntegrityError } from "./source-lot-types";

describe("payable-lot persistence transition", () => {
  it("strictly rehydrates only the bounded touched lots needed by online persistence", () => {
    for (const { transition } of buildReceiptTransitionCases()) {
      const bounded = {
        operationId: transition.operationId,
        consumedLots: transition.consumedLots,
        createdLots: transition.createdLots
      };

      expect(rehydratePayableLotPersistenceTransition(structuredClone(bounded))).toEqual(bounded);
    }
  });

  it("rejects extra keys, accessors, duplicate lot ids and operation drift", () => {
    const transition = buildReceiptTransitionCases()[0]?.transition;
    expect(transition).toBeDefined();
    if (!transition) return;

    const bounded = {
      operationId: transition.operationId,
      consumedLots: transition.consumedLots,
      createdLots: transition.createdLots
    };
    const created = structuredClone(transition.createdLots[0]);
    expect(created).toBeDefined();
    if (!created) return;

    expectLotError(
      () => rehydratePayableLotPersistenceTransition({ ...bounded, injected: true }),
      "invalid_shape"
    );
    expectLotError(
      () =>
        rehydratePayableLotPersistenceTransition(
          Object.defineProperty({}, "operationId", {
            enumerable: true,
            get: () => bounded.operationId
          })
        ),
      "invalid_shape"
    );
    expectLotError(
      () =>
        rehydratePayableLotPersistenceTransition({
          ...bounded,
          consumedLots: [
            {
              ...created,
              status: "consumed",
              consumedByOperationId: bounded.operationId,
              consumedAt: created.createdAt
            }
          ],
          createdLots: [created]
        }),
      "duplicate_lot_id"
    );
    expectLotError(
      () =>
        rehydratePayableLotPersistenceTransition({
          ...bounded,
          operationId: "different-operation"
        }),
      "lineage_invalid"
    );
  });
});

function expectLotError(action: () => unknown, reason: string): void {
  try {
    action();
    throw new Error("expected payable-lot integrity error");
  } catch (error) {
    expect(error).toBeInstanceOf(PayableSourceLotIntegrityError);
    expect((error as PayableSourceLotIntegrityError).reason).toBe(reason);
  }
}
