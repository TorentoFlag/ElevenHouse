import { describe, expect, it } from "vitest";
import {
  approvedFulfillment,
  captureAt,
  capturedState,
  economics,
  expectLotError,
  mutableClone,
  releaseAt,
  releaseState,
  risk,
  verifiedCaptureReceipt
} from "./source-lot-sale-hold-test-fixtures";
import {
  capturePendingPayableLot,
  createEmptyPayableLotReferenceState,
  rebuildPayableLotReferenceState
} from "./source-lots";
describe("source-lot reference input and lineage rebuild", () => {
  it("rejects duplicate hydrated lot ids before any balance selection", () => {
    const released = releaseState("order-duplicate-hydrated-lot");
    const lot = released.state.lots[0];
    if (!lot) throw new Error("expected lot");
    expectLotError(
      () =>
        rebuildPayableLotReferenceState({ ...released.state, lots: [...released.state.lots, lot] }),
      "duplicate_lot_id"
    );
  });

  it("rehydrates canonical capture authority instead of trusting forged nominal fields", () => {
    const captured = capturedState("order-forged-provider").transition;
    const forged = {
      ...captured.state,
      lots: captured.state.lots.map((lot) => ({
        ...lot,
        captureSource: { ...lot.captureSource, providerPaymentId: "forged-provider-payment" }
      }))
    };
    expectLotError(() => rebuildPayableLotReferenceState(forged), "capture_correlation_mismatch");
  });

  it("rejects overlapping active lineage during hydration", () => {
    const released = releaseState("order-overlapping-lineage");
    const forged = {
      ...released.state,
      lots: released.state.lots.map((lot) =>
        lot.rootLotId === lot.lotId
          ? { ...lot, status: "active", consumedByOperationId: null, consumedAt: null }
          : lot
      )
    };
    expectLotError(() => rebuildPayableLotReferenceState(forged), "lineage_invalid");
  });

  it("rejects accessor-bearing input without executing the getter", () => {
    let getterCalls = 0;
    const input: Record<string, unknown> = { astrologerUserId: "astrologer-1", currency: "RUB" };
    Object.defineProperty(input, "currency", {
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error("must not execute");
      }
    });
    expectLotError(() => createEmptyPayableLotReferenceState(input), "invalid_shape");
    expect(getterCalls).toBe(0);
  });

  it("rejects Proxy input traps as typed invalid shape", () => {
    expectLotError(
      () =>
        createEmptyPayableLotReferenceState(
          new Proxy(
            { astrologerUserId: "astrologer-1", currency: "RUB" },
            {
              ownKeys() {
                throw new Error("proxy trap");
              }
            }
          )
        ),
      "invalid_shape"
    );
  });

  it("rejects inherited prototype pollution at public constructors", () => {
    const polluted = Object.create({ injected: true }) as Record<string, unknown>;
    Object.assign(polluted, { astrologerUserId: "astrologer-1", currency: "RUB" });
    expectLotError(() => createEmptyPayableLotReferenceState(polluted), "invalid_shape");
  });

  it("rejects sparse hydrated lot arrays before digest comparison", () => {
    const released = releaseState("order-sparse-state");
    const sparse = new Array(released.state.lots.length + 1);
    for (const [index, lot] of released.state.lots.entries()) sparse[index + 1] = lot;
    expectLotError(
      () => rebuildPayableLotReferenceState({ ...released.state, lots: sparse }),
      "invalid_shape"
    );
  });

  it("includes nested hold-release evidence in the canonical state digest", () => {
    const released = releaseState("order-hold-evidence-digest");
    const forged = mutableClone(released.state);
    const hold = forged.history.find((record) => record.kind === "hold_release");
    if (!hold?.holdReleaseEvidence) throw new Error("expected hold release evidence");
    hold.holdReleaseEvidence.bookingCompletion.evidenceId = "forged-booking-evidence";

    expectLotError(() => rebuildPayableLotReferenceState(forged), "state_digest_mismatch");
  });

  it("rejects forged hydrated children whose amounts or reserve authority do not match history", () => {
    const released = releaseState();
    const forged = {
      ...released.state,
      lots: released.state.lots.map((lot) =>
        lot.lotId === "lot-order-state-1-available"
          ? { ...lot, amount: { amountMinor: 9_600, currency: "RUB" } }
          : lot
      )
    };
    expectLotError(() => rebuildPayableLotReferenceState(forged), "conservation_violation");

    const missingAuthority = {
      ...released.state,
      history: released.state.history.map((record) =>
        record.kind === "hold_release" ? { ...record, reserveAllocation: null } : record
      )
    };
    expectLotError(
      () => rebuildPayableLotReferenceState(missingAuthority),
      "reserve_allocation_required"
    );

    const duplicateBucket = {
      ...released.state,
      lots: released.state.lots.map((lot) =>
        lot.lotId === "lot-order-state-1-reserved"
          ? { ...lot, bucket: "available", becameAvailableAt: releaseAt }
          : lot
      )
    };
    expectLotError(
      () => rebuildPayableLotReferenceState(duplicateBucket),
      "conservation_violation"
    );
  });

  it("rejects one payment intent identity attached to two order roots", () => {
    const first = capturedState("order-state-1", "intent-shared").transition;
    const orderId = "order-state-2";
    const capture = verifiedCaptureReceipt(orderId, "intent-shared", "shared-second");

    expectLotError(
      () =>
        capturePendingPayableLot({
          state: first.state,
          expectedVersion: first.nextVersion,
          lotId: "lot-order-state-2",
          economics: economics(orderId),
          riskPolicy: risk(),
          fulfillment: approvedFulfillment,
          capture,
          capturedAt: captureAt
        }),
      "duplicate_capture_source"
    );
  });
});
