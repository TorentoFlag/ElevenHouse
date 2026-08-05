import { describe, expect, it } from "vitest";
import {
  blockSnapshot,
  expectLotError,
  paymentIntegrity,
  releaseFixture,
  releaseState
} from "./source-lot-sale-hold-test-fixtures";
import { releasePendingPayableLotFromState, selectPayoutPayableLots } from "./source-lots";
describe("payout source-lot selection", () => {
  it("selects available lots deterministically across roots and splits only the final lot", () => {
    const first = releaseState("order-ordering-first");
    const second = releasePendingPayableLotFromState(
      releaseFixture("order-ordering-second", {
        initialState: first.state,
        commandOverrides: {
          evaluatedAt: "2026-08-04T10:00:00Z",
          paymentIntegrity: paymentIntegrity(
            "order-ordering-second",
            "capture_clear",
            "2026-08-04T10:00:00Z"
          ),
          blocks: blockSnapshot("order-ordering-second", {}, "2026-08-04T10:00:00Z"),
          bookingCompletion: {
            bookingId: "booking-ordering-second",
            orderId: "order-ordering-second",
            owner: "booking",
            status: "completed",
            contractVersion: 1,
            completedAt: "2026-08-02T10:00:00Z",
            evidenceId: "booking-ordering-second-completed"
          },
          providerSettlement: {
            kind: "provider_settlement_matched",
            providerAccountId: "arc-account-live",
            paymentIntentId: "intent-order-ordering-second",
            providerPaymentId: "provider-payment-order-ordering-second",
            evidenceId: "settlement-ordering-second",
            matchedAt: "2026-08-03T00:00:00Z"
          }
        }
      }).input
    );
    const selection = selectPayoutPayableLots({
      state: second.state,
      expectedVersion: second.nextVersion,
      astrologerUserId: "astrologer-1",
      amount: { amountMinor: 10_000, currency: "RUB" }
    });
    expect(selection.allocations).toEqual([
      expect.objectContaining({ lotId: "lot-order-ordering-first-available", amountMinor: 8_640 }),
      expect.objectContaining({ lotId: "lot-order-ordering-second-available", amountMinor: 1_360 })
    ]);
  });

  it("fails payout selection on insufficient funds and owner mismatch", () => {
    const released = releaseState("order-selection-errors");
    expectLotError(
      () =>
        selectPayoutPayableLots({
          state: released.state,
          expectedVersion: released.nextVersion,
          astrologerUserId: "astrologer-1",
          amount: { amountMinor: 9_000, currency: "RUB" }
        }),
      "insufficient_lot_funds"
    );
    expectLotError(
      () =>
        selectPayoutPayableLots({
          state: released.state,
          expectedVersion: released.nextVersion,
          astrologerUserId: "astrologer-2",
          amount: { amountMinor: 1, currency: "RUB" }
        }),
      "owner_currency_mismatch"
    );
  });
});
