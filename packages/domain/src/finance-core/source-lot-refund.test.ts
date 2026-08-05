import { describe, expect, it } from "vitest";
import {
  approveRefundWithoutPayableLots,
  confirmRefundPayableLots,
  consumePaidPayoutPayableLots,
  consumeRefundBridgeFailedPayoutLots,
  createPayoutNoTransferOutcomeAuthority,
  createPayoutPaidAuthority,
  createRefundApprovalAuthority,
  createRefundBridgePayoutFailedAuthority,
  createRefundBridgePayoutPaidAuthority,
  createRefundConfirmedAuthority,
  createRefundFailedAuthority,
  decideRefundBridgePayoutPaidNoLotTransition,
  failRefundPayableLots,
  moveRefundSelectionToPending,
  projectPayableLotBuckets,
  rebuildPayableLotReferenceState,
  releasePayoutPendingPayableLots,
  type PayableLotReferenceState
} from "./source-lots";

import {
  confirmedRefundAuthority,
  expectLotError,
  failedRefundAuthority,
  payoutPendingState,
  refundPendingState,
  releaseAt,
  releasedState,
  sameOrderMultiAllocationPayoutPendingState
} from "./source-lot-reference-test-fixtures";
describe("state-bound refund payable lots", () => {
  it("binds exact named order-lot allocation and records each original bucket", () => {
    const base = refundPendingState();
    expect(base.selection).toMatchObject({
      kind: "refund",
      stateVersion: 3,
      stateDigest: base.released.state.stateDigest,
      allocations: [
        { lotId: "lot-order-refund-available", bucket: "available", amountMinor: 1_500 },
        { lotId: "lot-order-refund-reserved", bucket: "reserved", amountMinor: 500 }
      ]
    });
    expect(base.moved.historyRecord).toMatchObject({
      kind: "refund_approved",
      sourceKey: { kind: "refund", sourceId: "refund-1", operation: "approved" },
      refundOrigins: [
        {
          sourceLotId: "lot-order-refund-available",
          originalBucket: "available",
          amountMinor: 1_500,
          becameAvailableAt: releaseAt
        },
        {
          sourceLotId: "lot-order-refund-reserved",
          originalBucket: "reserved",
          amountMinor: 500,
          becameAvailableAt: null
        }
      ]
    });
  });

  it("rejects a forged or stale refund selection", () => {
    const base = refundPendingState();
    expectLotError(
      () =>
        moveRefundSelectionToPending({
          state: base.moved.state,
          expectedVersion: base.moved.nextVersion,
          selection: base.selection,
          authority: base.authority,
          refundId: "refund-1",
          operationId: "refund-approved-replay",
          sourceKey: { kind: "refund", sourceId: "refund-1", operation: "approved" },
          occurredAt: "2026-08-04T00:01:00Z",
          outputLotIds: []
        }),
      "selection_mismatch"
    );
  });

  it("consumes refund-pending lots only after canonical provider success", () => {
    const base = refundPendingState();
    const authority = createRefundConfirmedAuthority({
      kind: "refund_confirmed",
      authorityId: "refund-confirmed-authority-1",
      version: 1,
      refundId: "refund-1",
      providerAccountId: "arc-account-live",
      providerPaymentId: "provider-payment-order-refund",
      providerRefundId: "provider-refund-1",
      providerAmountBasis: "incremental",
      providerRefundAmount: { amountMinor: 2_500, currency: "RUB" },
      priorProviderTotalRefunded: { amountMinor: 0, currency: "RUB" },
      nextProviderTotalRefunded: { amountMinor: 2_500, currency: "RUB" },
      payableAmount: { amountMinor: 2_000, currency: "RUB" },
      accountingAllocationId: "refund-accounting-allocation-1",
      accountingAllocationVersion: 1,
      canonicalEvidenceId: "provider-refund-confirmed-1",
      confirmedAt: "2026-08-05T00:00:00Z"
    });
    const confirmed = confirmRefundPayableLots({
      state: base.moved.state,
      expectedVersion: base.moved.nextVersion,
      refundId: "refund-1",
      authority,
      operationId: "refund-confirmed-1",
      sourceKey: { kind: "refund", sourceId: "refund-1", operation: "confirmed" },
      occurredAt: "2026-08-05T00:00:00Z"
    });
    expect(confirmed.createdLots).toEqual([]);
    expect(confirmed.consumedLots).toHaveLength(2);
    expect(
      projectPayableLotBuckets({
        state: confirmed.state,
        astrologerUserId: "astrologer-1",
        currency: "RUB"
      })
    ).toEqual({
      pendingMinor: "0",
      availableMinor: "7140",
      reservedMinor: "460",
      payoutPendingMinor: "0",
      refundPendingMinor: "0"
    });
  });

  it("restores definitive provider failure to the exact recorded source buckets", () => {
    const base = refundPendingState();
    const authority = createRefundFailedAuthority({
      kind: "refund_failed",
      authorityId: "refund-failed-authority-1",
      version: 1,
      refundId: "refund-1",
      providerAccountId: "arc-account-live",
      providerPaymentId: "provider-payment-order-refund",
      providerRefundId: "provider-refund-1",
      providerRefundAmount: { amountMinor: 2_500, currency: "RUB" },
      payableAmount: { amountMinor: 2_000, currency: "RUB" },
      accountingAllocationId: "refund-accounting-allocation-1",
      accountingAllocationVersion: 1,
      failureCode: "provider_declined",
      canonicalEvidenceId: "provider-refund-failed-1",
      failedAt: "2026-08-05T00:00:00Z"
    });
    const failed = failRefundPayableLots({
      state: base.moved.state,
      expectedVersion: base.moved.nextVersion,
      refundId: "refund-1",
      authority,
      operationId: "refund-failed-1",
      sourceKey: { kind: "refund", sourceId: "refund-1", operation: "failed" },
      occurredAt: "2026-08-05T00:00:00Z",
      outputLotIds: [
        { sourceLotId: "refund-1-from-available", targetLotId: "refund-failed-available" },
        { sourceLotId: "refund-1-from-reserved", targetLotId: "refund-failed-reserved" }
      ]
    });
    expect(failed.createdLots).toEqual([
      expect.objectContaining({
        lotId: "refund-failed-available",
        bucket: "available",
        amount: { amountMinor: 1_500, currency: "RUB" },
        becameAvailableAt: releaseAt
      }),
      expect.objectContaining({
        lotId: "refund-failed-reserved",
        bucket: "reserved",
        amount: { amountMinor: 500, currency: "RUB" },
        becameAvailableAt: null
      })
    ]);
  });

  it.each([
    ["provider account", { providerAccountId: "arc-account-other" }],
    ["provider payment", { providerPaymentId: "provider-payment-other" }],
    ["internal refund", { refundId: "refund-other" }],
    ["accounting allocation", { accountingAllocationId: "refund-allocation-other" }],
    ["accounting allocation version", { accountingAllocationVersion: 2 }],
    ["payable component", { payableAmount: { amountMinor: 1_999, currency: "RUB" } }]
  ])("rejects confirmed refund %s mismatch", (_label, overrides) => {
    const base = refundPendingState();
    const authority = confirmedRefundAuthority(overrides);
    expectLotError(
      () =>
        confirmRefundPayableLots({
          state: base.moved.state,
          expectedVersion: base.moved.nextVersion,
          refundId: "refund-1",
          authority,
          operationId: "refund-confirmed-mismatch",
          sourceKey: { kind: "refund", sourceId: "refund-1", operation: "confirmed" },
          occurredAt: "2026-08-05T00:00:00Z"
        }),
      "refundId" in overrides ? "invalid_field" : "capture_correlation_mismatch"
    );
  });

  it("rejects unknown, stale, duplicate and conflicting refund terminal outcomes", () => {
    expectLotError(
      () =>
        createRefundFailedAuthority({
          ...failedRefundAuthority(),
          kind: "refund_unknown"
        }),
      "invalid_field"
    );

    const base = refundPendingState();
    const authority = confirmedRefundAuthority();
    const command = {
      state: base.moved.state,
      expectedVersion: base.moved.nextVersion,
      refundId: "refund-1",
      authority,
      operationId: "refund-confirmed-terminal",
      sourceKey: { kind: "refund" as const, sourceId: "refund-1", operation: "confirmed" as const },
      occurredAt: "2026-08-05T00:00:00Z"
    };
    expectLotError(
      () => confirmRefundPayableLots({ ...command, expectedVersion: base.moved.previousVersion }),
      "version_conflict"
    );
    const confirmed = confirmRefundPayableLots(command);
    expectLotError(
      () =>
        confirmRefundPayableLots({
          ...command,
          state: confirmed.state,
          expectedVersion: confirmed.nextVersion
        }),
      "duplicate_operation_source"
    );
    expectLotError(
      () =>
        failRefundPayableLots({
          state: confirmed.state,
          expectedVersion: confirmed.nextVersion,
          refundId: "refund-1",
          authority: failedRefundAuthority(),
          operationId: "refund-failed-after-confirmed",
          sourceKey: { kind: "refund", sourceId: "refund-1", operation: "failed" },
          occurredAt: "2026-08-05T00:00:00Z",
          outputLotIds: []
        }),
      "duplicate_operation_source"
    );
  });

  it("records a zero-payable refund without inventing a source lot", () => {
    const released = releasedState("order-refund-zero");
    const approval = createRefundApprovalAuthority({
      kind: "refund_approval",
      authorityId: "refund-zero-approval-authority",
      version: 1,
      refundId: "refund-zero",
      orderId: "order-refund-zero",
      astrologerUserId: "astrologer-1",
      payableAmount: { amountMinor: 0, currency: "RUB" },
      accountingAllocationId: "refund-zero-accounting-allocation",
      accountingAllocationVersion: 1,
      fundingStatus: "fully_funded"
    });
    const approved = approveRefundWithoutPayableLots({
      state: released.state,
      expectedVersion: released.nextVersion,
      authority: approval,
      operationId: "refund-zero-approved",
      sourceKey: { kind: "refund", sourceId: "refund-zero", operation: "approved" },
      occurredAt: "2026-08-04T00:00:00Z"
    });
    expect(approved.consumedLots).toEqual([]);
    expect(approved.createdLots).toEqual([]);

    const confirmed = confirmRefundPayableLots({
      state: approved.state,
      expectedVersion: approved.nextVersion,
      refundId: "refund-zero",
      authority: createRefundConfirmedAuthority({
        kind: "refund_confirmed",
        authorityId: "refund-zero-confirmed-authority",
        version: 1,
        refundId: "refund-zero",
        providerAccountId: "arc-account-live",
        providerPaymentId: "provider-payment-order-refund-zero",
        providerRefundId: "provider-refund-zero",
        providerAmountBasis: "incremental",
        providerRefundAmount: { amountMinor: 2_500, currency: "RUB" },
        priorProviderTotalRefunded: { amountMinor: 0, currency: "RUB" },
        nextProviderTotalRefunded: { amountMinor: 2_500, currency: "RUB" },
        payableAmount: { amountMinor: 0, currency: "RUB" },
        accountingAllocationId: "refund-zero-accounting-allocation",
        accountingAllocationVersion: 1,
        canonicalEvidenceId: "refund-zero-confirmed-evidence",
        confirmedAt: "2026-08-05T00:00:00Z"
      }),
      operationId: "refund-zero-confirmed",
      sourceKey: { kind: "refund", sourceId: "refund-zero", operation: "confirmed" },
      occurredAt: "2026-08-05T00:00:00Z"
    });
    expect(confirmed.consumedLots).toEqual([]);
    expect(confirmed.createdLots).toEqual([]);
    expect(rebuildPayableLotReferenceState(confirmed.state)).toEqual(confirmed.state);
    expectLotError(
      () =>
        failRefundPayableLots({
          state: confirmed.state,
          expectedVersion: confirmed.nextVersion,
          refundId: "refund-zero",
          authority: createRefundFailedAuthority({
            kind: "refund_failed",
            authorityId: "refund-zero-conflicting-failed-authority",
            version: 1,
            refundId: "refund-zero",
            providerAccountId: "arc-account-live",
            providerPaymentId: "provider-payment-order-refund-zero",
            providerRefundId: "provider-refund-zero",
            providerRefundAmount: { amountMinor: 2_500, currency: "RUB" },
            payableAmount: { amountMinor: 0, currency: "RUB" },
            accountingAllocationId: "refund-zero-accounting-allocation",
            accountingAllocationVersion: 1,
            failureCode: "provider_declined",
            canonicalEvidenceId: "refund-zero-conflicting-failed-evidence",
            failedAt: "2026-08-06T00:00:00Z"
          }),
          operationId: "refund-zero-conflicting-failed",
          sourceKey: { kind: "refund", sourceId: "refund-zero", operation: "failed" },
          occurredAt: "2026-08-06T00:00:00Z",
          outputLotIds: []
        }),
      "duplicate_operation_source"
    );
  });

  it("caps cumulative confirmed provider refunds at the original captured gross", () => {
    const released = releasedState("order-refund-cumulative");
    const approveZero = (state: PayableLotReferenceState, refundId: string) =>
      approveRefundWithoutPayableLots({
        state,
        expectedVersion: state.version,
        authority: createRefundApprovalAuthority({
          kind: "refund_approval",
          authorityId: `${refundId}-approval-authority`,
          version: 1,
          refundId,
          orderId: "order-refund-cumulative",
          astrologerUserId: "astrologer-1",
          payableAmount: { amountMinor: 0, currency: "RUB" },
          accountingAllocationId: `${refundId}-allocation`,
          accountingAllocationVersion: 1,
          fundingStatus: "fully_funded"
        }),
        operationId: `${refundId}-approved`,
        sourceKey: { kind: "refund", sourceId: refundId, operation: "approved" },
        occurredAt: "2026-08-04T00:00:00Z"
      });
    const confirmZero = (
      state: PayableLotReferenceState,
      refundId: string,
      amountMinor: number,
      priorAmountMinor: number
    ) =>
      confirmRefundPayableLots({
        state,
        expectedVersion: state.version,
        refundId,
        authority: createRefundConfirmedAuthority({
          kind: "refund_confirmed",
          authorityId: `${refundId}-confirmed-authority`,
          version: 1,
          refundId,
          providerAccountId: "arc-account-live",
          providerPaymentId: "provider-payment-order-refund-cumulative",
          providerRefundId: `${refundId}-provider-refund`,
          providerAmountBasis: "incremental",
          providerRefundAmount: { amountMinor, currency: "RUB" },
          priorProviderTotalRefunded: { amountMinor: priorAmountMinor, currency: "RUB" },
          nextProviderTotalRefunded: {
            amountMinor: priorAmountMinor + amountMinor,
            currency: "RUB"
          },
          payableAmount: { amountMinor: 0, currency: "RUB" },
          accountingAllocationId: `${refundId}-allocation`,
          accountingAllocationVersion: 1,
          canonicalEvidenceId: `${refundId}-confirmed-evidence`,
          confirmedAt: "2026-08-05T00:00:00Z"
        }),
        operationId: `${refundId}-confirmed`,
        sourceKey: { kind: "refund", sourceId: refundId, operation: "confirmed" },
        occurredAt: "2026-08-05T00:00:00Z"
      });
    const firstApproval = approveZero(released.state, "refund-cumulative-1");
    const firstConfirmation = confirmZero(firstApproval.state, "refund-cumulative-1", 6_000, 0);
    const secondApproval = approveZero(firstConfirmation.state, "refund-cumulative-2");

    expectLotError(
      () => confirmZero(secondApproval.state, "refund-cumulative-2", 4_000, 0),
      "capture_correlation_mismatch"
    );
    expectLotError(
      () => confirmZero(secondApproval.state, "refund-cumulative-2", 5_000, 6_000),
      "capture_correlation_mismatch"
    );
  });

  it("rejects zero-payable confirmation after a definitive failure", () => {
    const released = releasedState("order-refund-zero-failed-first");
    const approval = approveRefundWithoutPayableLots({
      state: released.state,
      expectedVersion: released.nextVersion,
      authority: createRefundApprovalAuthority({
        kind: "refund_approval",
        authorityId: "refund-zero-failed-first-approval-authority",
        version: 1,
        refundId: "refund-zero-failed-first",
        orderId: "order-refund-zero-failed-first",
        astrologerUserId: "astrologer-1",
        payableAmount: { amountMinor: 0, currency: "RUB" },
        accountingAllocationId: "refund-zero-failed-first-allocation",
        accountingAllocationVersion: 1,
        fundingStatus: "fully_funded"
      }),
      operationId: "refund-zero-failed-first-approved",
      sourceKey: {
        kind: "refund",
        sourceId: "refund-zero-failed-first",
        operation: "approved"
      },
      occurredAt: "2026-08-04T00:00:00Z"
    });
    const failed = failRefundPayableLots({
      state: approval.state,
      expectedVersion: approval.nextVersion,
      refundId: "refund-zero-failed-first",
      authority: createRefundFailedAuthority({
        kind: "refund_failed",
        authorityId: "refund-zero-failed-first-authority",
        version: 1,
        refundId: "refund-zero-failed-first",
        providerAccountId: "arc-account-live",
        providerPaymentId: "provider-payment-order-refund-zero-failed-first",
        providerRefundId: "provider-refund-zero-failed-first",
        providerRefundAmount: { amountMinor: 2_500, currency: "RUB" },
        payableAmount: { amountMinor: 0, currency: "RUB" },
        accountingAllocationId: "refund-zero-failed-first-allocation",
        accountingAllocationVersion: 1,
        failureCode: "provider_declined",
        canonicalEvidenceId: "refund-zero-failed-first-evidence",
        failedAt: "2026-08-05T00:00:00Z"
      }),
      operationId: "refund-zero-failed-first",
      sourceKey: {
        kind: "refund",
        sourceId: "refund-zero-failed-first",
        operation: "failed"
      },
      occurredAt: "2026-08-05T00:00:00Z",
      outputLotIds: []
    });
    expectLotError(
      () =>
        confirmRefundPayableLots({
          state: failed.state,
          expectedVersion: failed.nextVersion,
          refundId: "refund-zero-failed-first",
          authority: createRefundConfirmedAuthority({
            kind: "refund_confirmed",
            authorityId: "refund-zero-failed-first-conflict-authority",
            version: 1,
            refundId: "refund-zero-failed-first",
            providerAccountId: "arc-account-live",
            providerPaymentId: "provider-payment-order-refund-zero-failed-first",
            providerRefundId: "provider-refund-zero-failed-first",
            providerAmountBasis: "incremental",
            providerRefundAmount: { amountMinor: 2_500, currency: "RUB" },
            priorProviderTotalRefunded: { amountMinor: 0, currency: "RUB" },
            nextProviderTotalRefunded: { amountMinor: 2_500, currency: "RUB" },
            payableAmount: { amountMinor: 0, currency: "RUB" },
            accountingAllocationId: "refund-zero-failed-first-allocation",
            accountingAllocationVersion: 1,
            canonicalEvidenceId: "refund-zero-failed-first-conflict-evidence",
            confirmedAt: "2026-08-06T00:00:00Z"
          }),
          operationId: "refund-zero-failed-first-conflict",
          sourceKey: {
            kind: "refund",
            sourceId: "refund-zero-failed-first",
            operation: "confirmed"
          },
          occurredAt: "2026-08-06T00:00:00Z"
        }),
      "duplicate_operation_source"
    );
  });
});

describe("refund bridge payout evidence", () => {
  it("binds a bridge to one exact allocation when one sale has multiple payout rows", () => {
    const base = sameOrderMultiAllocationPayoutPendingState();
    expect(base.authority.allocations).toHaveLength(2);
    const [firstAllocation, secondAllocation] = base.authority.allocations;
    if (!firstAllocation || !secondAllocation) throw new Error("missing payout allocation fixture");
    const authority = createRefundBridgePayoutFailedAuthority({
      kind: "refund_bridge_payout_failed",
      authorityId: "refund-bridge-wrong-same-order-allocation-authority",
      version: 1,
      refundId: "refund-bridge-1",
      refundedOrderId: base.orderId,
      payoutRequestId: "payout-bridge-multi",
      payoutAllocationId: firstAllocation.payoutAllocationId,
      amount: { amountMinor: 100, currency: "RUB" },
      bridgeAllocationId: "bridge-wrong-same-order-allocation",
      bridgeAllocationVersion: 1,
      bridgeStatus: "allocated",
      accountingAllocationId: "refund-accounting-allocation-bridge",
      accountingAllocationVersion: 1,
      confirmedRefundAuthorityId: "refund-bridge-confirmed-authority",
      confirmedRefundAuthorityVersion: 1,
      confirmedRefundEvidenceId: "refund-bridge-confirmed-evidence",
      payoutOutcomeAuthority: noTransferAuthority(
        "payout-no-transfer-wrong-same-order-allocation",
        "payout-no-transfer-wrong-same-order-allocation-evidence",
        { payoutRequestId: "payout-bridge-multi" }
      )
    });
    expectLotError(
      () =>
        consumeRefundBridgeFailedPayoutLots({
          state: base.confirmed.state,
          expectedVersion: base.confirmed.nextVersion,
          authority,
          requestedLots: [{ lotId: secondAllocation.payoutPendingLotId, amountMinor: 100 }],
          operationId: "refund-bridge-wrong-same-order-allocation",
          sourceKey: {
            kind: "refund",
            sourceId: "bridge-wrong-same-order-allocation",
            operation: "bridge_payout_failed"
          },
          occurredAt: "2026-08-04T01:00:00Z",
          outputLotIds: [
            {
              sourceLotId: secondAllocation.payoutPendingLotId,
              remainderLotId: "refund-bridge-wrong-same-order-allocation-remainder"
            }
          ]
        }),
      "lot_bucket_ineligible"
    );
  });

  it("rejects a payout lot from a different sale than the confirmed refund", () => {
    const base = payoutPendingState({
      payoutOrderId: "order-a-payout",
      refundedOrderId: "order-z-refund"
    });
    const authority = createRefundBridgePayoutFailedAuthority({
      kind: "refund_bridge_payout_failed",
      authorityId: "refund-bridge-cross-sale-authority",
      version: 1,
      refundId: "refund-bridge-1",
      refundedOrderId: "order-z-refund",
      payoutRequestId: "payout-bridge",
      payoutAllocationId: "payout-bridge-allocation",
      amount: { amountMinor: 400, currency: "RUB" },
      bridgeAllocationId: "bridge-allocation-cross-sale",
      bridgeAllocationVersion: 1,
      bridgeStatus: "allocated",
      accountingAllocationId: "refund-accounting-allocation-bridge",
      accountingAllocationVersion: 1,
      confirmedRefundAuthorityId: "refund-bridge-confirmed-authority",
      confirmedRefundAuthorityVersion: 1,
      confirmedRefundEvidenceId: "refund-bridge-confirmed-evidence",
      payoutOutcomeAuthority: noTransferAuthority(
        "payout-no-transfer-cross-sale",
        "payout-no-transfer-cross-sale-evidence"
      )
    });
    expectLotError(
      () =>
        consumeRefundBridgeFailedPayoutLots({
          state: base.state,
          expectedVersion: base.nextVersion,
          authority,
          requestedLots: [{ lotId: "payout-bridge-pending", amountMinor: 400 }],
          operationId: "refund-bridge-cross-sale",
          sourceKey: {
            kind: "refund",
            sourceId: "bridge-allocation-cross-sale",
            operation: "bridge_payout_failed"
          },
          occurredAt: "2026-08-04T01:00:00Z",
          outputLotIds: [
            {
              sourceLotId: "payout-bridge-pending",
              remainderLotId: "payout-bridge-cross-sale-remainder"
            }
          ]
        }),
      "lot_bucket_ineligible"
    );
  });

  it("consumes only the exact bridged payout-pending amount on definitive no-transfer evidence", () => {
    const base = payoutPendingState();
    const authority = createRefundBridgePayoutFailedAuthority({
      kind: "refund_bridge_payout_failed",
      authorityId: "refund-bridge-failed-authority",
      version: 1,
      refundId: "refund-bridge-1",
      refundedOrderId: "order-bridge",
      payoutRequestId: "payout-bridge",
      payoutAllocationId: "payout-bridge-allocation",
      amount: { amountMinor: 400, currency: "RUB" },
      bridgeAllocationId: "bridge-allocation-1",
      bridgeAllocationVersion: 1,
      bridgeStatus: "allocated",
      accountingAllocationId: "refund-accounting-allocation-bridge",
      accountingAllocationVersion: 1,
      confirmedRefundAuthorityId: "refund-bridge-confirmed-authority",
      confirmedRefundAuthorityVersion: 1,
      confirmedRefundEvidenceId: "refund-bridge-confirmed-evidence",
      payoutOutcomeAuthority: createPayoutNoTransferOutcomeAuthority({
        kind: "payout_no_transfer_outcome",
        authorityId: "payout-no-transfer-authority-bridge",
        version: 1,
        payoutRequestId: "payout-bridge",
        outcome: "failed_pre_transfer",
        bankInitiation: "not_started",
        bankDebit: "not_possible",
        evidenceId: "payout-no-transfer-evidence-bridge",
        decidedAt: "2026-08-04T01:00:00Z"
      })
    });
    const consumed = consumeRefundBridgeFailedPayoutLots({
      state: base.state,
      expectedVersion: base.nextVersion,
      authority,
      requestedLots: [{ lotId: "payout-bridge-pending", amountMinor: 400 }],
      operationId: "refund-bridge-payout-failed",
      sourceKey: {
        kind: "refund",
        sourceId: "bridge-allocation-1",
        operation: "bridge_payout_failed"
      },
      occurredAt: "2026-08-04T01:00:00Z",
      outputLotIds: [
        {
          sourceLotId: "payout-bridge-pending",
          remainderLotId: "payout-bridge-pending-unaffected"
        }
      ]
    });
    expect(consumed.createdLots).toEqual([
      expect.objectContaining({
        lotId: "payout-bridge-pending-unaffected",
        bucket: "payout_pending",
        payoutRequestId: "payout-bridge",
        amount: { amountMinor: 600, currency: "RUB" }
      })
    ]);
    expect(consumed.historyRecord).toMatchObject({
      kind: "refund_bridge_payout_failed",
      sourceKey: {
        kind: "refund",
        sourceId: "bridge-allocation-1",
        operation: "bridge_payout_failed"
      }
    });
    expect(rebuildPayableLotReferenceState(consumed.state)).toEqual(consumed.state);
  });

  it("supports multiple exact bridge reservations before releasing only the unreserved remainder", () => {
    const base = payoutPendingState();
    const bridgeAuthority = (bridgeAllocationId: string, amountMinor: number) =>
      createRefundBridgePayoutFailedAuthority({
        kind: "refund_bridge_payout_failed",
        authorityId: `${bridgeAllocationId}-authority`,
        version: 1,
        refundId: "refund-bridge-1",
        refundedOrderId: "order-bridge",
        payoutRequestId: "payout-bridge",
        payoutAllocationId: "payout-bridge-allocation",
        amount: { amountMinor, currency: "RUB" },
        bridgeAllocationId,
        bridgeAllocationVersion: 1,
        bridgeStatus: "allocated",
        accountingAllocationId: "refund-accounting-allocation-bridge",
        accountingAllocationVersion: 1,
        confirmedRefundAuthorityId: "refund-bridge-confirmed-authority",
        confirmedRefundAuthorityVersion: 1,
        confirmedRefundEvidenceId: "refund-bridge-confirmed-evidence",
        payoutOutcomeAuthority: noTransferAuthority(
          "payout-no-transfer-authority-bridge-shared",
          "payout-no-transfer-evidence-bridge-shared",
          { bankInitiation: "started" }
        )
      });
    const consume = (
      state: PayableLotReferenceState,
      lotId: string,
      amountMinor: number,
      bridgeAllocationId: string,
      remainderLotId: string
    ) =>
      consumeRefundBridgeFailedPayoutLots({
        state,
        expectedVersion: state.version,
        authority: bridgeAuthority(bridgeAllocationId, amountMinor),
        requestedLots: [{ lotId, amountMinor }],
        operationId: `${bridgeAllocationId}-failed`,
        sourceKey: {
          kind: "refund",
          sourceId: bridgeAllocationId,
          operation: "bridge_payout_failed"
        },
        occurredAt: "2026-08-04T01:00:00Z",
        outputLotIds: [{ sourceLotId: lotId, remainderLotId }]
      });
    const first = consume(
      base.state,
      "payout-bridge-pending",
      300,
      "bridge-allocation-multi-1",
      "bridge-allocation-multi-remainder-1"
    );
    expect(first.createdLots).toEqual([
      expect.objectContaining({
        lotId: "bridge-allocation-multi-remainder-1",
        bucket: "payout_pending",
        payoutRequestId: "payout-bridge",
        amount: { amountMinor: 700, currency: "RUB" }
      })
    ]);
    const second = consume(
      first.state,
      "bridge-allocation-multi-remainder-1",
      200,
      "bridge-allocation-multi-2",
      "bridge-allocation-multi-remainder-2"
    );
    expectLotError(
      () =>
        consumePaidPayoutPayableLots({
          state: second.state,
          expectedVersion: second.nextVersion,
          payoutRequestId: "payout-bridge",
          authority: createPayoutPaidAuthority({
            kind: "payout_paid",
            authorityId: "payout-paid-after-definitive-failure",
            version: 1,
            payoutRequestId: "payout-bridge",
            bankReference: "bank-ref-after-definitive-failure",
            transferredAt: "2026-08-04T02:00:00Z",
            evidenceRef: "private://contradictory-paid-proof",
            evidenceHash: "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
          }),
          operationId: "payout-paid-after-definitive-failure",
          sourceKey: { kind: "payout", sourceId: "payout-bridge", operation: "paid" },
          occurredAt: "2026-08-04T02:00:00Z"
        }),
      "release_blocked"
    );
    expectLotError(
      () =>
        releasePayoutPendingPayableLots({
          state: second.state,
          expectedVersion: second.nextVersion,
          payoutRequestId: "payout-bridge",
          authority: createPayoutNoTransferOutcomeAuthority({
            kind: "payout_no_transfer_outcome",
            authorityId: "conflicting-no-transfer-authority",
            version: 1,
            payoutRequestId: "payout-bridge",
            outcome: "failed_pre_transfer",
            bankInitiation: "not_started",
            bankDebit: "not_possible",
            evidenceId: "conflicting-no-transfer-evidence",
            decidedAt: "2026-08-04T01:00:00Z"
          }),
          operationId: "payout-release-conflicting-bridge-outcome",
          sourceKey: { kind: "payout", sourceId: "payout-bridge", operation: "released" },
          occurredAt: "2026-08-04T01:00:00Z",
          outputLotIds: [
            {
              sourceLotId: "bridge-allocation-multi-remainder-2",
              targetLotId: "bridge-conflicting-release-target"
            }
          ]
        }),
      "selection_mismatch"
    );
    const released = releasePayoutPendingPayableLots({
      state: second.state,
      expectedVersion: second.nextVersion,
      payoutRequestId: "payout-bridge",
      authority: noTransferAuthority(
        "payout-no-transfer-authority-bridge-shared",
        "payout-no-transfer-evidence-bridge-shared",
        { bankInitiation: "started" }
      ),
      operationId: "payout-release-shared-bridge-outcome",
      sourceKey: { kind: "payout", sourceId: "payout-bridge", operation: "released" },
      occurredAt: "2026-08-04T01:00:00Z",
      outputLotIds: [
        {
          sourceLotId: "bridge-allocation-multi-remainder-2",
          targetLotId: "bridge-shared-release-target"
        }
      ]
    });
    expect(released.createdLots).toEqual([
      expect.objectContaining({
        bucket: "available",
        payoutRequestId: null,
        amount: { amountMinor: 500, currency: "RUB" }
      })
    ]);
    expect(rebuildPayableLotReferenceState(released.state)).toEqual(released.state);
  });

  it("returns a typed no-lot decision after a payout is proven paid", () => {
    const base = payoutPendingState();
    const paidAuthority = createPayoutPaidAuthority({
      kind: "payout_paid",
      authorityId: "payout-bridge-paid-authority",
      version: 1,
      payoutRequestId: "payout-bridge",
      bankReference: "bank-reference-bridge",
      transferredAt: "2026-08-04T02:00:00Z",
      evidenceRef: "private://payout-bridge-proof",
      evidenceHash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    });
    const paid = consumePaidPayoutPayableLots({
      state: base.state,
      expectedVersion: base.nextVersion,
      payoutRequestId: "payout-bridge",
      authority: paidAuthority,
      operationId: "payout-bridge-paid",
      sourceKey: { kind: "payout", sourceId: "payout-bridge", operation: "paid" },
      occurredAt: "2026-08-04T02:00:00Z"
    });
    const decision = decideRefundBridgePayoutPaidNoLotTransition({
      state: paid.state,
      expectedVersion: paid.nextVersion,
      authority: createRefundBridgePayoutPaidAuthority({
        kind: "refund_bridge_payout_paid",
        authorityId: "refund-bridge-paid-decision-authority",
        version: 1,
        refundId: "refund-bridge-1",
        refundedOrderId: "order-bridge",
        payoutRequestId: "payout-bridge",
        payoutAllocationId: "payout-bridge-allocation",
        amount: { amountMinor: 400, currency: "RUB" },
        bridgeAllocationId: "bridge-allocation-1",
        bridgeAllocationVersion: 1,
        bridgeStatus: "allocated",
        accountingAllocationId: "refund-accounting-allocation-bridge",
        accountingAllocationVersion: 1,
        confirmedRefundAuthorityId: "refund-bridge-confirmed-authority",
        confirmedRefundAuthorityVersion: 1,
        confirmedRefundEvidenceId: "refund-bridge-confirmed-evidence",
        payoutPaidAuthorityId: "payout-bridge-paid-authority",
        payoutPaidAuthorityVersion: 1,
        bankReference: "bank-reference-bridge",
        canonicalEvidenceId: "refund-bridge-paid-decision-evidence",
        decidedAt: "2026-08-04T03:00:00Z"
      }),
      sourceKey: {
        kind: "refund",
        sourceId: "bridge-allocation-1",
        operation: "bridge_payout_paid"
      }
    });
    expect(decision).toMatchObject({
      kind: "no_lot_transition",
      stateVersion: paid.nextVersion,
      stateDigest: paid.state.stateDigest
    });
  });

  it("does not model an unknown payout outcome as a terminal bridge mutation", () => {
    expectLotError(
      () =>
        createRefundBridgePayoutFailedAuthority({
          kind: "refund_bridge_payout_failed",
          authorityId: "refund-bridge-unknown",
          version: 1,
          refundId: "refund-bridge-1",
          refundedOrderId: "order-bridge",
          payoutRequestId: "payout-bridge",
          payoutAllocationId: "payout-bridge-allocation",
          amount: { amountMinor: 400, currency: "RUB" },
          bridgeAllocationId: "bridge-allocation-1",
          bridgeAllocationVersion: 1,
          bridgeStatus: "allocated",
          accountingAllocationId: "refund-accounting-allocation-bridge",
          accountingAllocationVersion: 1,
          confirmedRefundAuthorityId: "refund-bridge-confirmed-authority",
          confirmedRefundAuthorityVersion: 1,
          confirmedRefundEvidenceId: "refund-bridge-confirmed-evidence",
          payoutOutcomeAuthority: {
            kind: "payout_no_transfer_outcome",
            authorityId: "payout-unknown",
            version: 1,
            payoutRequestId: "payout-bridge",
            outcome: "unknown",
            bankInitiation: "not_started",
            bankDebit: "not_possible",
            evidenceId: "payout-unknown-evidence",
            decidedAt: "2026-08-04T01:00:00Z"
          }
        }),
      "invalid_field"
    );
  });
});

function noTransferAuthority(
  authorityId: string,
  evidenceId: string,
  overrides: Readonly<{
    bankInitiation?: "not_started" | "started";
    payoutRequestId?: string;
  }> = {}
) {
  return createPayoutNoTransferOutcomeAuthority({
    kind: "payout_no_transfer_outcome",
    authorityId,
    version: 1,
    payoutRequestId: overrides.payoutRequestId ?? "payout-bridge",
    outcome: "failed_pre_transfer",
    bankInitiation: overrides.bankInitiation ?? "not_started",
    bankDebit: "not_possible",
    evidenceId,
    decidedAt: "2026-08-04T01:00:00Z"
  });
}
