import { describe, expect, it } from "vitest";
import { resolvePaidProductFulfillment } from "../products/paid-product-fulfillment-registry";
import { planUnverifiedCapture } from "./economic-payment";
import {
  approvedFulfillment,
  blockSnapshot,
  canonicalCapture,
  captureAt,
  capturedState,
  completionAt,
  economics,
  expectLotError,
  paymentIntegrity,
  releaseAt,
  releaseFixture,
  releaseState,
  reserveDecision,
  risk,
  verifiedCaptureReceipt
} from "./source-lot-sale-hold-test-fixtures";
import {
  approveRefundWithoutPayableLots,
  capturePendingPayableLot,
  createEmptyPayableLotReferenceState,
  createRefundApprovalAuthority,
  createReserveAllocationDecision,
  payableLotBucketValues,
  releasePendingPayableLotFromState
} from "./source-lots";
describe("payable source lot reference boundary", () => {
  it("exposes exactly the five approved mutually exclusive liability buckets", () => {
    expect(payableLotBucketValues).toEqual([
      "pending",
      "available",
      "reserved",
      "payout_pending",
      "refund_pending"
    ]);
  });

  it("requires a versioned reserve-allocation authority and exact conservation", () => {
    expect(reserveDecision()).toMatchObject({
      version: 1,
      authority: { kind: "reserve_allocation", version: 1 },
      payable: { amountMinor: 9_600, currency: "RUB" },
      available: { amountMinor: 8_640, currency: "RUB" },
      reserved: { amountMinor: 960, currency: "RUB" }
    });
    expectLotError(
      () =>
        createReserveAllocationDecision({
          ...reserveDecision(),
          available: { amountMinor: 8_641, currency: "RUB" }
        }),
      "reserve_allocation_invalid"
    );
    expectLotError(() => {
      const unversioned: Record<string, unknown> = { ...reserveDecision() };
      Reflect.deleteProperty(unversioned, "authority");
      return createReserveAllocationDecision(unversioned);
    }, "invalid_shape");
  });
});
describe("sale capture and hold release reference flow", () => {
  it("captures one immutable pending payable lot from canonical payment and fulfillment evidence", async () => {
    const fulfillment = await resolvePaidProductFulfillment({
      product: {
        type: "single",
        paymentModel: "once",
        executionMode: "live",
        participantMode: "solo"
      },
      reader: {
        async getDependencyStatus() {
          return "registered";
        }
      }
    });
    const orderId = "order-capture-shape";
    const capture = verifiedCaptureReceipt(orderId, `intent-${orderId}`);
    const transition = capturePendingPayableLot({
      state: createEmptyPayableLotReferenceState({
        astrologerUserId: "astrologer-1",
        currency: "RUB"
      }),
      expectedVersion: 1,
      lotId: `lot-${orderId}`,
      economics: economics(orderId),
      riskPolicy: risk(),
      fulfillment,
      capture,
      capturedAt: captureAt
    });
    const lot = transition.createdLots[0];
    expect(lot).toMatchObject({
      lotId: `lot-${orderId}`,
      rootLotId: `lot-${orderId}`,
      parentLotId: null,
      lineageDepth: 0,
      sourceId: orderId,
      amount: { amountMinor: 9_600, currency: "RUB" },
      bucket: "pending",
      status: "active",
      capturedAt: captureAt,
      becameAvailableAt: null,
      captureSource: {
        intentId: `intent-${orderId}`,
        providerPaymentId: `provider-payment-${orderId}`,
        canonicalEvidenceId: `capture-evidence-${orderId}`,
        sourceKey: { kind: "order", sourceId: orderId, operation: "sale_captured" }
      }
    });
    expect(Object.isFrozen(lot)).toBe(true);
    expect(Object.isFrozen(lot?.amount)).toBe(true);
    expect(Object.isFrozen(transition.state)).toBe(true);
  });

  it("rejects a duplicate canonical capture source inside one aggregate", () => {
    const first = capturedState("order-duplicate-capture");
    expectLotError(
      () =>
        capturePendingPayableLot({
          state: first.transition.state,
          expectedVersion: first.transition.nextVersion,
          lotId: "lot-duplicate-capture-second",
          economics: economics("order-duplicate-capture"),
          riskPolicy: risk(),
          fulfillment: approvedFulfillment,
          capture: first.capture,
          capturedAt: captureAt
        }),
      "duplicate_capture_source"
    );
  });

  it("rejects a duplicate lot id even when the second order has a different payment", () => {
    const first = capturedState("order-lot-id-first");
    const secondCapture = canonicalCapture("order-lot-id-second");
    expectLotError(
      () =>
        capturePendingPayableLot({
          state: first.transition.state,
          expectedVersion: first.transition.nextVersion,
          lotId: "lot-order-lot-id-first",
          economics: economics("order-lot-id-second"),
          riskPolicy: risk(),
          fulfillment: approvedFulfillment,
          capture: secondCapture,
          capturedAt: captureAt
        }),
      "duplicate_lot_id"
    );
  });

  it("rejects economics and payment correlation mismatch before recording a lot", () => {
    const initial = createEmptyPayableLotReferenceState({
      astrologerUserId: "astrologer-1",
      currency: "RUB"
    });
    expectLotError(
      () =>
        capturePendingPayableLot({
          state: initial,
          expectedVersion: initial.version,
          lotId: "lot-wrong-correlation",
          economics: economics("order-correlation-a"),
          riskPolicy: risk(),
          fulfillment: approvedFulfillment,
          capture: canonicalCapture("order-correlation-b"),
          capturedAt: captureAt
        }),
      "capture_correlation_mismatch"
    );
  });

  it("consumes the pending root and creates exactly conserved available and reserved children", () => {
    const transition = releaseState("order-release-shape");
    expect(transition.consumedLots).toEqual([
      expect.objectContaining({
        lotId: "lot-order-release-shape",
        status: "consumed",
        consumedByOperationId: "hold-release-order-release-shape",
        consumedAt: releaseAt
      })
    ]);
    expect(transition.createdLots).toEqual([
      expect.objectContaining({
        lotId: "lot-order-release-shape-available",
        amount: { amountMinor: 8_640, currency: "RUB" },
        bucket: "available",
        becameAvailableAt: releaseAt
      }),
      expect.objectContaining({
        lotId: "lot-order-release-shape-reserved",
        amount: { amountMinor: 960, currency: "RUB" },
        bucket: "reserved",
        becameAvailableAt: null
      })
    ]);
    expect(transition.createdLots.reduce((sum, lot) => sum + lot.amount.amountMinor, 0)).toBe(
      9_600
    );
  });

  it.each([
    ["missing reserve authority", { allocation: null }, "reserve_allocation_required"],
    ["missing booking completion", { bookingCompletion: null }, "fulfillment_evidence_required"],
    [
      "hold has not elapsed",
      {
        evaluatedAt: "2026-08-03T09:59:59Z",
        paymentIntegrity: paymentIntegrity(
          "order-release-gate",
          "capture_clear",
          "2026-08-03T09:59:59Z"
        ),
        blocks: blockSnapshot("order-release-gate", {}, "2026-08-03T09:59:59Z")
      },
      "hold_not_elapsed"
    ],
    ["missing required settlement", { providerSettlement: null }, "settlement_evidence_required"],
    [
      "settlement predates capture",
      {
        providerSettlement: {
          kind: "provider_settlement_matched",
          providerAccountId: "arc-account-live",
          paymentIntentId: "intent-order-release-gate",
          providerPaymentId: "provider-payment-order-release-gate",
          evidenceId: "settlement-before-capture",
          matchedAt: "2026-08-01T08:59:59Z"
        }
      },
      "settlement_evidence_required"
    ],
    [
      "refund block",
      { blocks: blockSnapshot("order-release-gate", { refund: true }) },
      "release_blocked"
    ],
    [
      "chargeback block",
      { blocks: blockSnapshot("order-release-gate", { chargeback: true }) },
      "release_blocked"
    ],
    [
      "reconciliation block",
      { blocks: blockSnapshot("order-release-gate", { reconciliation: true }) },
      "release_blocked"
    ],
    [
      "manual-risk block",
      { blocks: blockSnapshot("order-release-gate", { manualRisk: true }) },
      "release_blocked"
    ]
  ])("fails hold release closed for %s", (_name, commandOverrides, reason) => {
    const fixture = releaseFixture("order-release-gate", { commandOverrides });
    expectLotError(() => releasePendingPayableLotFromState(fixture.input), reason);
  });

  it("rejects a clear block snapshot scoped to another sale", () => {
    const fixture = releaseFixture("order-release-scope", {
      commandOverrides: { blocks: blockSnapshot("order-other-scope") }
    });
    expectLotError(() => releasePendingPayableLotFromState(fixture.input), "release_blocked");
  });

  it("rejects a forged-clear snapshot while the sale has an unresolved refund", () => {
    const fixture = releaseFixture("order-release-unresolved-refund");
    const approved = approveRefundWithoutPayableLots({
      state: fixture.transition.state,
      expectedVersion: fixture.transition.nextVersion,
      authority: createRefundApprovalAuthority({
        kind: "refund_approval",
        authorityId: "hold-release-unresolved-refund-authority",
        version: 1,
        refundId: "hold-release-unresolved-refund",
        orderId: "order-release-unresolved-refund",
        astrologerUserId: "astrologer-1",
        payableAmount: { amountMinor: 0, currency: "RUB" },
        accountingAllocationId: "hold-release-unresolved-refund-allocation",
        accountingAllocationVersion: 1,
        fundingStatus: "fully_funded"
      }),
      operationId: "hold-release-unresolved-refund-approved",
      sourceKey: {
        kind: "refund",
        sourceId: "hold-release-unresolved-refund",
        operation: "approved"
      },
      occurredAt: "2026-08-02T12:00:00Z"
    });
    expectLotError(
      () =>
        releasePendingPayableLotFromState({
          ...fixture.input,
          state: approved.state,
          expectedVersion: approved.nextVersion
        }),
      "release_blocked"
    );
  });

  it("rejects an unverified over-capture observation even when nominal fields match", () => {
    const fixture = releaseFixture("order-over-capture-result");
    const first = fixture.capture;
    if (first.intent.captureSessionId === null) throw new Error("expected capture session");
    const overCapture = planUnverifiedCapture(first.intent, {
      expectedVersion: first.intent.version,
      providerFact: {
        kind: "unverified_provider_payment_fact",
        authorityStatus: "unverified",
        observedState: "captured",
        economicIntentId: first.intent.intentId,
        economicSessionId: first.intent.captureSessionId,
        providerAccount: first.intent.providerAccount,
        providerPaymentId: "provider-payment-over-capture-second",
        evidenceRef: "capture-evidence-over-capture-second",
        amount: first.intent.amount
      }
    });
    expect(overCapture.kind).toBe("unverified_over_capture_observation");
    expectLotError(
      () =>
        releasePendingPayableLotFromState({
          ...fixture.input,
          capture: overCapture as never
        }),
      "authoritative_capture_required"
    );
  });

  it("skips only the settlement gate when the captured risk snapshot disables it", () => {
    const fixture = releaseFixture("order-no-settlement", {
      riskOverrides: { providerSettlementRequired: false },
      commandOverrides: { providerSettlement: null }
    });
    expect(releasePendingPayableLotFromState(fixture.input).createdLots).toHaveLength(2);
  });

  it("records capture and hold release in one versioned full-history aggregate with typed journal sources", () => {
    const { transition: captureTransition } = capturedState();
    expect(captureTransition).toMatchObject({
      previousVersion: 1,
      nextVersion: 2,
      sourceKey: { kind: "order", sourceId: "order-state-1", operation: "sale_captured" }
    });
    expect(captureTransition.state.history).toHaveLength(1);
    expect(captureTransition.state.stateDigest.length).toBeGreaterThan(0);

    const releaseTransition = releaseState();
    expect(releaseTransition).toMatchObject({
      previousVersion: 2,
      nextVersion: 3,
      sourceKey: {
        kind: "reserve",
        sourceId: "hold-release-order-state-1",
        operation: "hold_released"
      }
    });
    expect(releaseTransition.state.history[1]).toMatchObject({
      kind: "hold_release",
      consumedLotIds: ["lot-order-state-1"],
      createdLotIds: ["lot-order-state-1-available", "lot-order-state-1-reserved"],
      reserveAllocation: {
        decisionId: "reserve-decision-order-state-1",
        version: 1,
        available: { amountMinor: 8_640 },
        reserved: { amountMinor: 960 }
      },
      paymentIntegrity: { status: "capture_clear", version: 4 },
      blocks: {
        orderId: "order-state-1",
        paymentIntentId: "intent-order-state-1",
        evaluatedAt: releaseAt
      },
      holdReleaseEvidence: {
        kind: "hold_release_evidence",
        lotId: "lot-order-state-1",
        orderId: "order-state-1",
        evaluatedAt: releaseAt,
        bookingCompletion: {
          bookingId: "booking-order-state-1",
          evidenceId: "booking-completion-order-state-1"
        },
        providerSettlement: {
          evidenceId: "settlement-order-state-1"
        }
      }
    });
    expect(Object.isFrozen(releaseTransition.state.history[1]?.holdReleaseEvidence)).toBe(true);
    expect(Object.isFrozen(releaseTransition.state.history)).toBe(true);
  });

  it("requires exact expectedVersion and rejects stale aggregate reuse", () => {
    const { capture, transition } = capturedState();
    expectLotError(
      () =>
        releasePendingPayableLotFromState({
          state: transition.state,
          expectedVersion: 1,
          lotId: "lot-order-state-1",
          capture,
          paymentIntegrity: paymentIntegrity("order-state-1"),
          bookingCompletion: null,
          providerSettlement: null,
          blocks: blockSnapshot("order-state-1"),
          allocation: reserveDecision("order-state-1"),
          operationId: "hold-release-stale",
          sourceKey: {
            kind: "reserve",
            sourceId: "hold-release-stale",
            operation: "hold_released"
          },
          evaluatedAt: releaseAt,
          outputLotIds: { available: "stale-available", reserved: "stale-reserved" }
        }),
      "version_conflict"
    );
  });

  it("fails release closed when current versioned payment integrity reports over-capture", () => {
    const { capture, transition } = capturedState();
    expectLotError(
      () =>
        releasePendingPayableLotFromState({
          state: transition.state,
          expectedVersion: transition.nextVersion,
          lotId: "lot-order-state-1",
          capture,
          paymentIntegrity: paymentIntegrity("order-state-1", "over_capture_blocked"),
          bookingCompletion: {
            bookingId: "booking-state",
            orderId: "order-state-1",
            owner: "booking",
            status: "completed",
            contractVersion: 1,
            completedAt: completionAt,
            evidenceId: "booking-state-completed"
          },
          providerSettlement: null,
          blocks: blockSnapshot("order-state-1"),
          allocation: reserveDecision("order-state-1"),
          operationId: "hold-release-blocked",
          sourceKey: {
            kind: "reserve",
            sourceId: "hold-release-blocked",
            operation: "hold_released"
          },
          evaluatedAt: releaseAt,
          outputLotIds: { available: "blocked-available", reserved: "blocked-reserved" }
        }),
      "authoritative_capture_required"
    );
  });
});
