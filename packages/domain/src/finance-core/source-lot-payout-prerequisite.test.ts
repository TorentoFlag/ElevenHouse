import { describe, expect, it } from "vitest";
import {
  approveRefundWithoutPayableLots,
  confirmChargebackRestriction,
  createChargebackConfirmedAuthority,
  createRefundApprovalAuthority,
  inspectPayoutExecutionSourceLotPrerequisite
} from "./source-lots";

import {
  payoutPendingState,
  refundPendingState,
  releasedState
} from "./source-lot-reference-test-fixtures";
describe("payout execution source-lot prerequisite", () => {
  it("reports source-lot clear while retaining every named external gate", () => {
    const base = payoutPendingState();
    const report = inspectPayoutExecutionSourceLotPrerequisite({
      state: base.state,
      expectedVersion: base.nextVersion
    });
    expect(report).toEqual({
      kind: "source_lot_payout_execution_prerequisite",
      status: "source_lot_clear",
      stateVersion: base.nextVersion,
      stateDigest: base.state.stateDigest,
      astrologerUserId: "astrologer-1",
      currency: "RUB",
      blockingChargebackCaseIds: [],
      blockingRefundIds: [],
      remainingExternalGates: [
        "wallet_recovery_receivable",
        "bank_liquidity",
        "payout_method",
        "kyc",
        "risk"
      ]
    });
    expect(Object.isFrozen(report.remainingExternalGates)).toBe(true);
  });

  it("blocks wallet-wide for a zero-payable refund and a dispute on another order", () => {
    const refundOrder = releasedState("order-gate-refund");
    const refundApproved = approveRefundWithoutPayableLots({
      state: refundOrder.state,
      expectedVersion: refundOrder.nextVersion,
      authority: createRefundApprovalAuthority({
        kind: "refund_approval",
        authorityId: "refund-gate-zero-authority",
        version: 1,
        refundId: "refund-gate-zero",
        orderId: "order-gate-refund",
        astrologerUserId: "astrologer-1",
        payableAmount: { amountMinor: 0, currency: "RUB" },
        accountingAllocationId: "refund-gate-zero-allocation",
        accountingAllocationVersion: 1,
        fundingStatus: "fully_funded"
      }),
      operationId: "refund-gate-zero-approved",
      sourceKey: { kind: "refund", sourceId: "refund-gate-zero", operation: "approved" },
      occurredAt: "2026-08-04T00:00:00Z"
    });
    const chargebackOrder = releasedState("order-gate-chargeback", refundApproved.state, {
      capturedAt: "2026-08-05T09:00:00Z",
      bookingCompletedAt: "2026-08-05T10:00:00Z",
      settlementMatchedAt: "2026-08-06T00:00:00Z",
      integrityEvaluatedAt: "2026-08-07T10:00:00Z",
      releasedAt: "2026-08-07T10:00:00Z"
    });
    const restricted = confirmChargebackRestriction({
      state: chargebackOrder.state,
      expectedVersion: chargebackOrder.nextVersion,
      authority: createChargebackConfirmedAuthority({
        kind: "chargeback_confirmed",
        authorityId: "chargeback-gate-authority",
        version: 1,
        confirmationId: "chargeback-gate-confirmation",
        restrictionId: "chargeback-gate-restriction",
        confirmationKind: "initial",
        amountBasis: "cumulative",
        priorRestrictionVersion: null,
        chargebackCaseId: "chargeback-gate",
        orderId: "order-gate-chargeback",
        astrologerUserId: "astrologer-1",
        providerAccount: {
          seriesId: "arc-series-live",
          providerAccountId: "arc-account-live",
          identityVersion: 1
        },
        providerPaymentId: "provider-payment-order-gate-chargeback",
        priorCumulativeDisputedAmount: { amountMinor: 0, currency: "RUB" },
        nextCumulativeDisputedAmount: { amountMinor: 500, currency: "RUB" },
        disputedDelta: { amountMinor: 500, currency: "RUB" },
        canonicalEvidenceId: "chargeback-gate-evidence",
        confirmedAt: "2026-08-08T00:00:00Z"
      }),
      operationId: "chargeback-gate-confirmed",
      sourceKey: {
        kind: "chargeback",
        sourceId: "chargeback-gate-confirmation",
        operation: "confirmed"
      },
      occurredAt: "2026-08-08T00:00:00Z"
    });
    expect(
      inspectPayoutExecutionSourceLotPrerequisite({
        state: restricted.state,
        expectedVersion: restricted.nextVersion
      })
    ).toMatchObject({
      status: "blocked",
      blockingChargebackCaseIds: ["chargeback-gate"],
      blockingRefundIds: ["refund-gate-zero"]
    });
  });

  it("blocks an active nonzero refund-pending allocation", () => {
    const base = refundPendingState();
    expect(
      inspectPayoutExecutionSourceLotPrerequisite({
        state: base.moved.state,
        expectedVersion: base.moved.nextVersion
      })
    ).toMatchObject({ status: "blocked", blockingRefundIds: ["refund-1"] });
  });
});
