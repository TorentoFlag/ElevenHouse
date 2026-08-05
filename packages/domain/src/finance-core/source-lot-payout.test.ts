import { describe, expect, it } from "vitest";
import { type PaidProductFulfillmentDecision } from "../products/paid-product-fulfillment-registry";
import { createOrderEconomicsSnapshot } from "./order-economics";
import { createRiskPolicySnapshot } from "./risk-policy";
import {
  PayableSourceLotIntegrityError,
  approveRefundWithoutPayableLots,
  capturePendingPayableLot,
  consumePaidPayoutPayableLots,
  createEmptyPayableLotReferenceState,
  createPayableLotBlockSnapshot,
  createPaymentCaptureIntegrityAuthority,
  createPayoutNoTransferOutcomeAuthority,
  createPayoutPaidAuthority,
  createPayoutRequestAuthority,
  createPayoutReturnAuthority,
  createRefundApprovalAuthority,
  createRefundFailedAuthority,
  createReserveAllocationDecision,
  createReserveReleaseAuthority,
  createReturnedPayoutReservedPayableLots,
  failRefundPayableLots,
  movePayoutSelectionToPending,
  moveRefundSelectionToPending,
  projectPayableLotBuckets,
  rebuildPayableLotReferenceState,
  releasePayoutPendingPayableLots,
  releasePendingPayableLotFromState,
  releaseReservedPayableLots,
  selectPayoutPayableLots,
  selectRefundPayableLots
} from "./source-lots";
import { verifiedCaptureReceipt } from "./source-lot-sale-hold-test-fixtures";

const captureAt = "2026-08-01T09:00:00Z";
const completionAt = "2026-08-01T10:00:00Z";
const releaseAt = "2026-08-03T10:00:00Z";

type Mutable<T> = T extends readonly (infer Item)[]
  ? Mutable<Item>[]
  : T extends object
    ? { -readonly [Key in keyof T]: Mutable<T[Key]> }
    : T;

function mutableClone<T>(value: T): Mutable<T> {
  return structuredClone(value) as Mutable<T>;
}

const approvedFulfillment = Object.freeze({
  supported: true,
  registryKey: "single.once.live.solo",
  registryRevision: 1,
  holdAnchor: "booking_completed",
  terminalEvidence: Object.freeze({
    owner: "booking",
    status: "completed",
    contractVersion: 1
  }),
  cancellationAllocator: Object.freeze({
    owner: "booking",
    port: "BookingCancellationRefundDecisionPort",
    policyVersion: 1
  })
} satisfies Extract<PaidProductFulfillmentDecision, { supported: true }>);

function economics(orderId = "order-1", astrologerUserId = "astrologer-1") {
  return createOrderEconomicsSnapshot({
    orderId,
    astrologerUserId,
    planId: "start",
    planVersionId: "start-v3",
    gross: { amountMinor: 10_000, currency: "RUB" },
    commission: { amountMinor: 400, currency: "RUB" },
    payable: { amountMinor: 9_600, currency: "RUB" },
    commissionBps: 400,
    allocationRevision: "bps_half_up_v1"
  });
}

function risk(overrides: Record<string, unknown> = {}) {
  return createRiskPolicySnapshot({
    id: "risk-standard",
    policyVersion: 3,
    effectiveRiskTier: "standard",
    holdAnchor: "booking_completed",
    holdDurationHours: 48,
    reserveBps: 1_000,
    reserveReleaseDelayDays: 30,
    providerSettlementRequired: true,
    payoutMinimum: { amountMinor: 100, currency: "RUB" },
    exceptionAuthority: null,
    effectiveAt: "2026-07-01T00:00:00Z",
    ...overrides
  });
}

function reserveDecision(orderId = "order-1") {
  return createReserveAllocationDecision({
    decisionId: `reserve-decision-${orderId}`,
    version: 1,
    authority: {
      kind: "reserve_allocation",
      id: "finance-risk-allocation-authority",
      version: 1
    },
    orderId,
    astrologerUserId: "astrologer-1",
    riskPolicyId: "risk-standard",
    riskPolicyVersion: 3,
    reserveBps: 1_000,
    payable: { amountMinor: 9_600, currency: "RUB" },
    available: { amountMinor: 8_640, currency: "RUB" },
    reserved: { amountMinor: 960, currency: "RUB" }
  });
}

function expectLotError(action: () => unknown, reason: string): void {
  try {
    action();
    throw new Error("expected payable source lot error");
  } catch (error) {
    expect(error).toBeInstanceOf(PayableSourceLotIntegrityError);
    expect((error as PayableSourceLotIntegrityError).reason).toBe(reason);
  }
}

describe("payout source-lot lifecycle and reserve release", () => {
  function holdState(orderId = "order-b1") {
    const capture = verifiedCaptureReceipt(orderId, `intent-${orderId}`);
    const captured = capturePendingPayableLot({
      state: createEmptyPayableLotReferenceState({
        astrologerUserId: "astrologer-1",
        currency: "RUB"
      }),
      expectedVersion: 1,
      lotId: `lot-${orderId}`,
      economics: economics(orderId),
      riskPolicy: risk(),
      fulfillment: approvedFulfillment,
      capture,
      capturedAt: captureAt
    });
    const paymentIntegrity = createPaymentCaptureIntegrityAuthority({
      kind: "current_payment_capture_integrity",
      authorityId: `integrity-${orderId}`,
      version: 1,
      status: "capture_clear",
      intentId: `intent-${orderId}`,
      intentVersion: 3,
      providerAccountId: "arc-account-live",
      providerPaymentId: `provider-payment-${orderId}`,
      canonicalEvidenceId: `capture-evidence-${orderId}`,
      overCaptureIncidentId: null,
      evaluatedAt: releaseAt
    });
    const held = releasePendingPayableLotFromState({
      state: captured.state,
      expectedVersion: captured.nextVersion,
      lotId: `lot-${orderId}`,
      capture,
      paymentIntegrity,
      bookingCompletion: {
        bookingId: `booking-${orderId}`,
        orderId,
        owner: "booking",
        status: "completed",
        contractVersion: 1,
        completedAt: completionAt,
        evidenceId: `booking-completion-${orderId}`
      },
      providerSettlement: {
        kind: "provider_settlement_matched",
        providerAccountId: "arc-account-live",
        paymentIntentId: `intent-${orderId}`,
        providerPaymentId: `provider-payment-${orderId}`,
        evidenceId: `settlement-${orderId}`,
        matchedAt: "2026-08-02T00:00:00Z"
      },
      blocks: clearBlocks(releaseAt, orderId),
      allocation: reserveDecision(orderId),
      operationId: `hold-release-${orderId}`,
      sourceKey: {
        kind: "reserve",
        sourceId: `hold-release-${orderId}`,
        operation: "hold_released"
      },
      evaluatedAt: releaseAt,
      outputLotIds: {
        available: `lot-${orderId}-available`,
        reserved: `lot-${orderId}-reserved`
      }
    });
    return { capture, paymentIntegrity, held };
  }

  function clearBlocks(at: string, orderId = "order-b1") {
    return createPayableLotBlockSnapshot({
      kind: "payable_release_blocks",
      snapshotId: `blocks-${at}`,
      version: 1,
      orderId,
      astrologerUserId: "astrologer-1",
      providerAccountId: "arc-account-live",
      paymentIntentId: `intent-${orderId}`,
      currency: "RUB",
      evaluatedAt: at,
      refund: false,
      chargeback: false,
      reconciliation: false,
      manualRisk: false
    });
  }

  function reserveReleasedState() {
    const base = holdState();
    const releasedAt = "2026-09-02T10:00:00Z";
    const transition = releaseReservedPayableLots({
      state: base.held.state,
      expectedVersion: base.held.nextVersion,
      lotIds: ["lot-order-b1-reserved"],
      paymentIntegrity: createPaymentCaptureIntegrityAuthority({
        ...base.paymentIntegrity,
        authorityId: "integrity-reserve-release",
        version: 2,
        evaluatedAt: releasedAt
      }),
      blocks: clearBlocks(releasedAt),
      authority: createReserveReleaseAuthority({
        kind: "reserve_release",
        authorityId: "reserve-release-authority",
        version: 1,
        holdReleaseOperationId: "hold-release-order-b1",
        reserveDecisionId: "reserve-decision-order-b1",
        reserveDecisionVersion: 1
      }),
      operationId: "reserve-release-order-b1",
      sourceKey: {
        kind: "reserve",
        sourceId: "reserve-release-order-b1",
        operation: "released"
      },
      evaluatedAt: releasedAt,
      outputLotIds: [
        { sourceLotId: "lot-order-b1-reserved", targetLotId: "lot-order-b1-reserve-available" }
      ]
    });
    return { ...base, transition };
  }

  function payoutPendingState() {
    const base = reserveReleasedState();
    const selection = selectPayoutPayableLots({
      state: base.transition.state,
      expectedVersion: base.transition.nextVersion,
      astrologerUserId: "astrologer-1",
      amount: { amountMinor: 9_000, currency: "RUB" }
    });
    const authority = createPayoutRequestAuthority({
      kind: "payout_request",
      authorityId: "payout-request-authority-1",
      version: 1,
      payoutRequestId: "payout-1",
      astrologerUserId: "astrologer-1",
      amount: { amountMinor: 9_000, currency: "RUB" },
      allocations: [
        {
          payoutAllocationId: "payout-1-allocation-available",
          sourceLotId: "lot-order-b1-available",
          payoutPendingLotId: "payout-1-from-available",
          amountMinor: 8_640
        },
        {
          payoutAllocationId: "payout-1-allocation-reserve",
          sourceLotId: "lot-order-b1-reserve-available",
          payoutPendingLotId: "payout-1-from-reserve",
          amountMinor: 360
        }
      ]
    });
    const moved = movePayoutSelectionToPending({
      state: base.transition.state,
      expectedVersion: base.transition.nextVersion,
      selection,
      authority,
      payoutRequestId: "payout-1",
      operationId: "payout-requested-1",
      sourceKey: { kind: "payout", sourceId: "payout-1", operation: "requested" },
      occurredAt: "2026-09-03T00:00:00Z",
      outputLotIds: [
        {
          sourceLotId: "lot-order-b1-available",
          targetLotId: "payout-1-from-available",
          remainderLotId: null
        },
        {
          sourceLotId: "lot-order-b1-reserve-available",
          targetLotId: "payout-1-from-reserve",
          remainderLotId: "lot-order-b1-reserve-remainder"
        }
      ]
    });
    return { ...base, selection, authority, moved };
  }

  it("releases reserved lots only after the snapshotted delay with clear current gates", () => {
    const { transition } = reserveReleasedState();
    expect(transition).toMatchObject({
      previousVersion: 3,
      nextVersion: 4,
      sourceKey: {
        kind: "reserve",
        sourceId: "reserve-release-order-b1",
        operation: "released"
      }
    });
    expect(transition.createdLots).toEqual([
      expect.objectContaining({
        lotId: "lot-order-b1-reserve-available",
        bucket: "available",
        amount: { amountMinor: 960, currency: "RUB" },
        becameAvailableAt: "2026-09-02T10:00:00Z"
      })
    ]);

    const base = holdState();
    expectLotError(
      () =>
        releaseReservedPayableLots({
          state: base.held.state,
          expectedVersion: base.held.nextVersion,
          lotIds: ["lot-order-b1-reserved"],
          paymentIntegrity: createPaymentCaptureIntegrityAuthority({
            ...base.paymentIntegrity,
            authorityId: "integrity-reserve-release-too-early",
            version: 2,
            evaluatedAt: "2026-08-04T00:00:00Z"
          }),
          blocks: clearBlocks("2026-08-04T00:00:00Z"),
          authority: createReserveReleaseAuthority({
            kind: "reserve_release",
            authorityId: "too-early",
            version: 1,
            holdReleaseOperationId: "hold-release-order-b1",
            reserveDecisionId: "reserve-decision-order-b1",
            reserveDecisionVersion: 1
          }),
          operationId: "reserve-release-too-early",
          sourceKey: {
            kind: "reserve",
            sourceId: "reserve-release-too-early",
            operation: "released"
          },
          evaluatedAt: "2026-08-04T00:00:00Z",
          outputLotIds: [{ sourceLotId: "lot-order-b1-reserved", targetLotId: "too-early-output" }]
        }),
      "hold_not_elapsed"
    );
  });

  it("releases the exact complete surviving reserved descendants once", () => {
    const base = holdState();
    const selection = selectRefundPayableLots({
      state: base.held.state,
      expectedVersion: base.held.nextVersion,
      astrologerUserId: "astrologer-1",
      orderId: "order-b1",
      amount: { amountMinor: 400, currency: "RUB" },
      requestedLots: [{ lotId: "lot-order-b1-reserved", amountMinor: 400 }]
    });
    const approvalAuthority = createRefundApprovalAuthority({
      kind: "refund_approval",
      authorityId: "reserve-descendant-refund-approval-authority",
      version: 1,
      refundId: "reserve-descendant-refund",
      orderId: "order-b1",
      astrologerUserId: "astrologer-1",
      payableAmount: { amountMinor: 400, currency: "RUB" },
      accountingAllocationId: "reserve-descendant-refund-allocation",
      accountingAllocationVersion: 1,
      fundingStatus: "fully_funded"
    });
    const pending = moveRefundSelectionToPending({
      state: base.held.state,
      expectedVersion: base.held.nextVersion,
      selection,
      authority: approvalAuthority,
      refundId: "reserve-descendant-refund",
      operationId: "reserve-descendant-refund-approved",
      sourceKey: {
        kind: "refund",
        sourceId: "reserve-descendant-refund",
        operation: "approved"
      },
      occurredAt: "2026-08-04T00:00:00Z",
      outputLotIds: [
        {
          sourceLotId: "lot-order-b1-reserved",
          targetLotId: "reserve-descendant-refund-pending",
          remainderLotId: "reserve-descendant-refund-remainder"
        }
      ]
    });
    const restored = failRefundPayableLots({
      state: pending.state,
      expectedVersion: pending.nextVersion,
      refundId: "reserve-descendant-refund",
      authority: createRefundFailedAuthority({
        kind: "refund_failed",
        authorityId: "reserve-descendant-refund-failed-authority",
        version: 1,
        refundId: "reserve-descendant-refund",
        providerAccountId: "arc-account-live",
        providerPaymentId: "provider-payment-order-b1",
        providerRefundId: "provider-refund-reserve-descendant",
        providerRefundAmount: { amountMinor: 400, currency: "RUB" },
        payableAmount: { amountMinor: 400, currency: "RUB" },
        accountingAllocationId: "reserve-descendant-refund-allocation",
        accountingAllocationVersion: 1,
        failureCode: "provider_declined",
        canonicalEvidenceId: "reserve-descendant-refund-failed-evidence",
        failedAt: "2026-08-05T00:00:00Z"
      }),
      operationId: "reserve-descendant-refund-failed",
      sourceKey: {
        kind: "refund",
        sourceId: "reserve-descendant-refund",
        operation: "failed"
      },
      occurredAt: "2026-08-05T00:00:00Z",
      outputLotIds: [
        {
          sourceLotId: "reserve-descendant-refund-pending",
          targetLotId: "reserve-descendant-refund-restored"
        }
      ]
    });
    const releasedAt = "2026-09-02T10:00:00Z";
    const paymentIntegrity = createPaymentCaptureIntegrityAuthority({
      ...base.paymentIntegrity,
      authorityId: "integrity-reserve-descendant-release",
      version: 2,
      evaluatedAt: releasedAt
    });
    const authority = createReserveReleaseAuthority({
      kind: "reserve_release",
      authorityId: "reserve-descendant-release-authority",
      version: 1,
      holdReleaseOperationId: "hold-release-order-b1",
      reserveDecisionId: "reserve-decision-order-b1",
      reserveDecisionVersion: 1
    });
    const command = {
      state: restored.state,
      expectedVersion: restored.nextVersion,
      lotIds: ["reserve-descendant-refund-remainder", "reserve-descendant-refund-restored"],
      paymentIntegrity,
      blocks: clearBlocks(releasedAt),
      authority,
      operationId: "reserve-descendant-release",
      sourceKey: {
        kind: "reserve" as const,
        sourceId: "reserve-descendant-release",
        operation: "released" as const
      },
      evaluatedAt: releasedAt,
      outputLotIds: [
        {
          sourceLotId: "reserve-descendant-refund-remainder",
          targetLotId: "reserve-descendant-refund-remainder-available"
        },
        {
          sourceLotId: "reserve-descendant-refund-restored",
          targetLotId: "reserve-descendant-refund-restored-available"
        }
      ]
    };
    expectLotError(
      () =>
        releaseReservedPayableLots({
          ...command,
          lotIds: ["reserve-descendant-refund-remainder"],
          outputLotIds: [command.outputLotIds[0]]
        }),
      "reserve_allocation_invalid"
    );
    const released = releaseReservedPayableLots(command);
    expect(released.createdLots.map((lot) => lot.amount.amountMinor).sort((a, b) => a - b)).toEqual(
      [400, 560]
    );
    expectLotError(
      () =>
        releaseReservedPayableLots({
          ...command,
          state: released.state,
          expectedVersion: released.nextVersion,
          operationId: "reserve-descendant-release-replay",
          sourceKey: {
            kind: "reserve",
            sourceId: "reserve-descendant-release-replay",
            operation: "released"
          }
        }),
      "duplicate_operation_source"
    );
  });

  it("blocks reserve release when an unresolved zero-payable refund exists", () => {
    const base = holdState();
    const approved = approveRefundWithoutPayableLots({
      state: base.held.state,
      expectedVersion: base.held.nextVersion,
      authority: createRefundApprovalAuthority({
        kind: "refund_approval",
        authorityId: "reserve-release-unresolved-refund-authority",
        version: 1,
        refundId: "reserve-release-unresolved-refund",
        orderId: "order-b1",
        astrologerUserId: "astrologer-1",
        payableAmount: { amountMinor: 0, currency: "RUB" },
        accountingAllocationId: "reserve-release-unresolved-refund-allocation",
        accountingAllocationVersion: 1,
        fundingStatus: "fully_funded"
      }),
      operationId: "reserve-release-unresolved-refund-approved",
      sourceKey: {
        kind: "refund",
        sourceId: "reserve-release-unresolved-refund",
        operation: "approved"
      },
      occurredAt: "2026-08-04T00:00:00Z"
    });
    const releasedAt = "2026-09-02T10:00:00Z";
    expectLotError(
      () =>
        releaseReservedPayableLots({
          state: approved.state,
          expectedVersion: approved.nextVersion,
          lotIds: ["lot-order-b1-reserved"],
          paymentIntegrity: createPaymentCaptureIntegrityAuthority({
            ...base.paymentIntegrity,
            authorityId: "integrity-reserve-release-unresolved-refund",
            version: 2,
            evaluatedAt: releasedAt
          }),
          blocks: clearBlocks(releasedAt),
          authority: createReserveReleaseAuthority({
            kind: "reserve_release",
            authorityId: "reserve-release-unresolved-refund-authority",
            version: 1,
            holdReleaseOperationId: "hold-release-order-b1",
            reserveDecisionId: "reserve-decision-order-b1",
            reserveDecisionVersion: 1
          }),
          operationId: "reserve-release-unresolved-refund",
          sourceKey: {
            kind: "reserve",
            sourceId: "reserve-release-unresolved-refund",
            operation: "released"
          },
          evaluatedAt: releasedAt,
          outputLotIds: [
            {
              sourceLotId: "lot-order-b1-reserved",
              targetLotId: "reserve-release-unresolved-refund-available"
            }
          ]
        }),
      "release_blocked"
    );
  });

  it("binds payout selection to state and rechecks canonical oldest-first allocation on move", () => {
    const base = reserveReleasedState();
    const selection = selectPayoutPayableLots({
      state: base.transition.state,
      expectedVersion: base.transition.nextVersion,
      astrologerUserId: "astrologer-1",
      amount: { amountMinor: 9_000, currency: "RUB" }
    });
    expect(selection).toMatchObject({
      stateVersion: 4,
      stateDigest: base.transition.state.stateDigest,
      allocations: [
        { lotId: "lot-order-b1-available", amountMinor: 8_640 },
        { lotId: "lot-order-b1-reserve-available", amountMinor: 360 }
      ]
    });

    const forged = {
      ...selection,
      allocations: [...selection.allocations].reverse()
    };
    expectLotError(
      () =>
        movePayoutSelectionToPending({
          state: base.transition.state,
          expectedVersion: base.transition.nextVersion,
          selection: forged,
          authority: createPayoutRequestAuthority({
            kind: "payout_request",
            authorityId: "forged-selection-authority",
            version: 1,
            payoutRequestId: "payout-forged",
            astrologerUserId: "astrologer-1",
            amount: { amountMinor: 9_000, currency: "RUB" },
            allocations: [
              {
                payoutAllocationId: "payout-forged-allocation-available",
                sourceLotId: "lot-order-b1-available",
                payoutPendingLotId: "payout-forged-from-available",
                amountMinor: 8_640
              },
              {
                payoutAllocationId: "payout-forged-allocation-reserve",
                sourceLotId: "lot-order-b1-reserve-available",
                payoutPendingLotId: "payout-forged-from-reserve",
                amountMinor: 360
              }
            ]
          }),
          payoutRequestId: "payout-forged",
          operationId: "payout-forged",
          sourceKey: { kind: "payout", sourceId: "payout-forged", operation: "requested" },
          occurredAt: "2026-09-03T00:00:00Z",
          outputLotIds: []
        }),
      "selection_mismatch"
    );
  });

  it("rejects stale selection replay after its source lots were consumed", () => {
    const base = payoutPendingState();
    expectLotError(
      () =>
        movePayoutSelectionToPending({
          state: base.moved.state,
          expectedVersion: base.moved.nextVersion,
          selection: base.selection,
          authority: createPayoutRequestAuthority({
            kind: "payout_request",
            authorityId: "payout-replay-authority",
            version: 1,
            payoutRequestId: "payout-replay",
            astrologerUserId: "astrologer-1",
            amount: { amountMinor: 9_000, currency: "RUB" },
            allocations: [
              {
                payoutAllocationId: "payout-replay-allocation-available",
                sourceLotId: "lot-order-b1-available",
                payoutPendingLotId: "payout-replay-from-available",
                amountMinor: 8_640
              },
              {
                payoutAllocationId: "payout-replay-allocation-reserve",
                sourceLotId: "lot-order-b1-reserve-available",
                payoutPendingLotId: "payout-replay-from-reserve",
                amountMinor: 360
              }
            ]
          }),
          payoutRequestId: "payout-replay",
          operationId: "payout-replay",
          sourceKey: { kind: "payout", sourceId: "payout-replay", operation: "requested" },
          occurredAt: "2026-09-03T00:01:00Z",
          outputLotIds: []
        }),
      "selection_mismatch"
    );
  });

  it("preserves capture and original availability provenance across later descendant creation", () => {
    const base = payoutPendingState();
    const descendant = base.moved.state.lots.find((lot) => lot.lotId === "payout-1-from-available");
    expect(descendant).toMatchObject({
      capturedAt: captureAt,
      createdAt: "2026-09-03T00:00:00Z",
      becameAvailableAt: releaseAt
    });
    expect(rebuildPayableLotReferenceState(base.moved.state).stateDigest).toBe(
      base.moved.state.stateDigest
    );
  });

  it("rehydrates the exact immutable payout-allocation mapping", () => {
    const base = payoutPendingState();
    const forged = mutableClone(base.moved.state);
    const requested = forged.history.find((record) => record.kind === "payout_requested");
    if (requested?.authority?.kind !== "payout_request" || !requested.authority.allocations[0]) {
      throw new Error("expected payout request allocation");
    }
    requested.authority.allocations[0].payoutAllocationId = "forged-payout-allocation";

    expectLotError(() => rebuildPayableLotReferenceState(forged), "lineage_invalid");
  });

  it.each(["not_started", "started"] as const)(
    "returns a payout with bank work %s to exact available lineage only on definitive no-transfer evidence",
    (bankInitiation) => {
      const base = payoutPendingState();
      const outcome = createPayoutNoTransferOutcomeAuthority({
        kind: "payout_no_transfer_outcome",
        authorityId: "payout-no-transfer-1",
        version: 1,
        payoutRequestId: "payout-1",
        outcome: "failed_pre_transfer",
        bankInitiation,
        bankDebit: "not_possible",
        evidenceId: "bank-no-initiation-proof-1",
        decidedAt: "2026-09-03T01:00:00Z"
      });
      const released = releasePayoutPendingPayableLots({
        state: base.moved.state,
        expectedVersion: base.moved.nextVersion,
        payoutRequestId: "payout-1",
        authority: outcome,
        operationId: "payout-released-1",
        sourceKey: { kind: "payout", sourceId: "payout-1", operation: "released" },
        occurredAt: "2026-09-03T01:00:00Z",
        outputLotIds: [
          { sourceLotId: "payout-1-from-available", targetLotId: "returned-available-1" },
          { sourceLotId: "payout-1-from-reserve", targetLotId: "returned-available-2" }
        ]
      });
      expect(released.createdLots.every((lot) => lot.bucket === "available")).toBe(true);
      expect(released.createdLots.reduce((sum, lot) => sum + lot.amount.amountMinor, 0)).toBe(
        9_000
      );
      expect(rebuildPayableLotReferenceState(released.state)).toEqual(released.state);
    }
  );

  it.each(["rejected", "cancelled"] as const)(
    "does not represent %s after bank work has started",
    (outcome) => {
      expectLotError(
        () =>
          createPayoutNoTransferOutcomeAuthority({
            kind: "payout_no_transfer_outcome",
            authorityId: `payout-started-${outcome}`,
            version: 1,
            payoutRequestId: "payout-1",
            outcome,
            bankInitiation: "started",
            bankDebit: "not_possible",
            evidenceId: `bank-started-${outcome}-proof`,
            decidedAt: "2026-09-03T01:00:00Z"
          }),
        "invalid_field"
      );
    }
  );

  it("consumes a paid payout once and creates a new reserved lineage on proven return", () => {
    const base = payoutPendingState();
    const paidAuthority = createPayoutPaidAuthority({
      kind: "payout_paid",
      authorityId: "payout-paid-authority-1",
      version: 1,
      payoutRequestId: "payout-1",
      bankReference: "bank-ref-1",
      transferredAt: "2026-09-03T02:00:00Z",
      evidenceRef: "private://payout-proof-1",
      evidenceHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    });
    const paid = consumePaidPayoutPayableLots({
      state: base.moved.state,
      expectedVersion: base.moved.nextVersion,
      payoutRequestId: "payout-1",
      authority: paidAuthority,
      operationId: "payout-paid-1",
      sourceKey: { kind: "payout", sourceId: "payout-1", operation: "paid" },
      occurredAt: "2026-09-03T02:00:00Z"
    });
    expect(paid.createdLots).toEqual([]);
    expect(paid.consumedLots).toHaveLength(2);

    const returnAuthority = createPayoutReturnAuthority({
      kind: "payout_return",
      authorityId: "payout-return-authority-1",
      version: 1,
      payoutRequestId: "payout-1",
      outcome: "returned_without_debit",
      bankReference: "bank-ref-1",
      bankStatementEntryId: null,
      bankCreditEvidencePath: null,
      suspenseReclassificationId: null,
      returnedAt: "2026-09-04T00:00:00Z",
      evidenceId: "bank-return-proof-1"
    });
    const returned = createReturnedPayoutReservedPayableLots({
      state: paid.state,
      expectedVersion: paid.nextVersion,
      payoutRequestId: "payout-1",
      authority: returnAuthority,
      operationId: "payout-returned-1",
      sourceKey: {
        kind: "payout",
        sourceId: "payout-1",
        operation: "returned_without_debit"
      },
      occurredAt: "2026-09-04T00:00:00Z",
      outputLotIds: [
        { sourceLotId: "payout-1-from-available", targetLotId: "returned-reserved-1" },
        { sourceLotId: "payout-1-from-reserve", targetLotId: "returned-reserved-2" }
      ]
    });
    expect(returned.createdLots.every((lot) => lot.bucket === "reserved")).toBe(true);
    expect(returned.createdLots.every((lot) => lot.status === "active")).toBe(true);
    expect(returned.state.lots.find((lot) => lot.lotId === "payout-1-from-available")?.status).toBe(
      "consumed"
    );
  });

  it.each([
    [
      "direct statement match",
      "direct_match",
      null,
      { kind: "bank", sourceId: "return-credit-entry-1", operation: "payout_return_credit_matched" }
    ],
    [
      "unknown-credit reclassification",
      "unknown_credit_reclassification",
      "return-credit-reclassification-1",
      {
        kind: "bank",
        sourceId: "return-credit-entry-1",
        operation: "suspense_reclassified"
      }
    ]
  ] as const)(
    "creates reserved return lots after matched debit via %s",
    (_label, bankCreditEvidencePath, suspenseReclassificationId, sourceKey) => {
      const base = payoutPendingState();
      const paid = consumePaidPayoutPayableLots({
        state: base.moved.state,
        expectedVersion: base.moved.nextVersion,
        payoutRequestId: "payout-1",
        authority: createPayoutPaidAuthority({
          kind: "payout_paid",
          authorityId: "payout-paid-return-path-authority",
          version: 1,
          payoutRequestId: "payout-1",
          bankReference: "bank-ref-return-path",
          transferredAt: "2026-09-03T02:00:00Z",
          evidenceRef: "private://payout-return-path-proof",
          evidenceHash: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
        }),
        operationId: "payout-paid-return-path",
        sourceKey: { kind: "payout", sourceId: "payout-1", operation: "paid" },
        occurredAt: "2026-09-03T02:00:00Z"
      });
      const returned = createReturnedPayoutReservedPayableLots({
        state: paid.state,
        expectedVersion: paid.nextVersion,
        payoutRequestId: "payout-1",
        authority: createPayoutReturnAuthority({
          kind: "payout_return",
          authorityId: `payout-return-${bankCreditEvidencePath}`,
          version: 1,
          payoutRequestId: "payout-1",
          outcome: "returned_after_matched_debit",
          bankReference: "bank-ref-return-path",
          bankStatementEntryId: "return-credit-entry-1",
          bankCreditEvidencePath,
          suspenseReclassificationId,
          returnedAt: "2026-09-04T00:00:00Z",
          evidenceId: `return-${bankCreditEvidencePath}-evidence`
        }),
        operationId: `payout-returned-${bankCreditEvidencePath}`,
        sourceKey,
        occurredAt: "2026-09-04T00:00:00Z",
        outputLotIds: [
          {
            sourceLotId: "payout-1-from-available",
            targetLotId: `returned-${bankCreditEvidencePath}-available`
          },
          {
            sourceLotId: "payout-1-from-reserve",
            targetLotId: `returned-${bankCreditEvidencePath}-reserve`
          }
        ]
      });
      expect(returned.createdLots).toHaveLength(2);
      expect(returned.createdLots.every((lot) => lot.bucket === "reserved")).toBe(true);
      expect(rebuildPayableLotReferenceState(returned.state)).toEqual(returned.state);
    }
  );

  it("projects buckets only from a validated canonical state", () => {
    const base = reserveReleasedState();
    expect(
      projectPayableLotBuckets({
        state: base.transition.state,
        astrologerUserId: "astrologer-1",
        currency: "RUB"
      })
    ).toEqual({
      pendingMinor: "0",
      availableMinor: "9600",
      reservedMinor: "0",
      payoutPendingMinor: "0",
      refundPendingMinor: "0"
    });
    expectLotError(
      () =>
        projectPayableLotBuckets({
          lots: base.transition.state.lots,
          astrologerUserId: "astrologer-1",
          currency: "RUB"
        }),
      "invalid_shape"
    );
  });
});
