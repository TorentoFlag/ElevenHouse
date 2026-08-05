import { describe, expect, it } from "vitest";
import {
  allocateChargebackPrincipalPayableLots,
  collectChargebackRecoveryPayableLots,
  confirmChargebackRestriction,
  confirmRefundPayableLots,
  consumeRefundBridgeFailedPayoutLots,
  createChargebackConfirmedAuthority,
  createChargebackLostAuthority,
  createChargebackPrincipalAllocationAuthority,
  createChargebackRecoveryCollectionAuthority,
  createChargebackWonAuthority,
  createPayoutNoTransferOutcomeAuthority,
  createRefundBridgePayoutFailedAuthority,
  rebuildPayableLotReferenceState,
  recordChargebackLostRestrictionOutcome,
  restoreChargebackWonReservedPayableLots
} from "./source-lots";

import {
  chargebackPrincipalConfirmedBasis,
  chargebackRestrictedState,
  confirmedRefundAuthority,
  expectLotError,
  mutableClone,
  payoutPendingState,
  refundPendingState,
  releasedState
} from "./source-lot-reference-test-fixtures";
describe("source-lot reference state semantic rebuild", () => {
  it("rejects a refund terminal authority detached from its approval", () => {
    const base = refundPendingState();
    const confirmed = confirmRefundPayableLots({
      state: base.moved.state,
      expectedVersion: base.moved.nextVersion,
      refundId: "refund-1",
      authority: confirmedRefundAuthority(),
      operationId: "refund-semantic-confirmed",
      sourceKey: { kind: "refund", sourceId: "refund-1", operation: "confirmed" },
      occurredAt: "2026-08-05T00:00:00Z"
    });
    const forged = mutableClone(confirmed.state);
    const terminal = forged.history.find((record) => record.kind === "refund_confirmed");
    if (terminal?.authority?.kind !== "refund_confirmed") {
      throw new Error("expected refund confirmation");
    }
    terminal.authority.accountingAllocationId = "forged-refund-allocation";

    expectLotError(() => rebuildPayableLotReferenceState(forged), "lineage_invalid");
  });

  it("rejects a refund bridge detached from its exact payout allocation", () => {
    const base = payoutPendingState();
    const bridged = consumeRefundBridgeFailedPayoutLots({
      state: base.state,
      expectedVersion: base.nextVersion,
      authority: createRefundBridgePayoutFailedAuthority({
        kind: "refund_bridge_payout_failed",
        authorityId: "refund-semantic-bridge-authority",
        version: 1,
        refundId: "refund-bridge-1",
        refundedOrderId: "order-bridge",
        payoutRequestId: "payout-bridge",
        payoutAllocationId: "payout-bridge-allocation",
        amount: { amountMinor: 400, currency: "RUB" },
        bridgeAllocationId: "refund-semantic-bridge-allocation",
        bridgeAllocationVersion: 1,
        bridgeStatus: "allocated",
        accountingAllocationId: "refund-accounting-allocation-bridge",
        accountingAllocationVersion: 1,
        confirmedRefundAuthorityId: "refund-bridge-confirmed-authority",
        confirmedRefundAuthorityVersion: 1,
        confirmedRefundEvidenceId: "refund-bridge-confirmed-evidence",
        payoutOutcomeAuthority: noTransferAuthority(
          "refund-semantic-no-transfer-authority",
          "refund-semantic-no-transfer-evidence"
        )
      }),
      requestedLots: [{ lotId: "payout-bridge-pending", amountMinor: 400 }],
      operationId: "refund-semantic-bridge",
      sourceKey: {
        kind: "refund",
        sourceId: "refund-semantic-bridge-allocation",
        operation: "bridge_payout_failed"
      },
      occurredAt: "2026-08-04T01:00:00Z",
      outputLotIds: [
        {
          sourceLotId: "payout-bridge-pending",
          remainderLotId: "refund-semantic-bridge-remainder"
        }
      ]
    });
    const forged = mutableClone(bridged.state);
    const bridge = forged.history.find((record) => record.kind === "refund_bridge_payout_failed");
    if (bridge?.authority?.kind !== "refund_bridge_payout_failed") {
      throw new Error("expected refund bridge");
    }
    bridge.authority.payoutAllocationId = "forged-payout-allocation";

    expectLotError(() => rebuildPayableLotReferenceState(forged), "lineage_invalid");
  });

  it("rejects a refund bridge whose nested payout outcome no longer matches its payout", () => {
    const base = payoutPendingState();
    const bridged = consumeRefundBridgeFailedPayoutLots({
      state: base.state,
      expectedVersion: base.nextVersion,
      authority: createRefundBridgePayoutFailedAuthority({
        kind: "refund_bridge_payout_failed",
        authorityId: "refund-missing-release-bridge-authority",
        version: 1,
        refundId: "refund-bridge-1",
        refundedOrderId: "order-bridge",
        payoutRequestId: "payout-bridge",
        payoutAllocationId: "payout-bridge-allocation",
        amount: { amountMinor: 400, currency: "RUB" },
        bridgeAllocationId: "refund-missing-release-bridge-allocation",
        bridgeAllocationVersion: 1,
        bridgeStatus: "allocated",
        accountingAllocationId: "refund-accounting-allocation-bridge",
        accountingAllocationVersion: 1,
        confirmedRefundAuthorityId: "refund-bridge-confirmed-authority",
        confirmedRefundAuthorityVersion: 1,
        confirmedRefundEvidenceId: "refund-bridge-confirmed-evidence",
        payoutOutcomeAuthority: noTransferAuthority(
          "nested-payout-no-transfer-authority",
          "nested-payout-no-transfer-evidence"
        )
      }),
      requestedLots: [{ lotId: "payout-bridge-pending", amountMinor: 400 }],
      operationId: "refund-missing-release-bridge",
      sourceKey: {
        kind: "refund",
        sourceId: "refund-missing-release-bridge-allocation",
        operation: "bridge_payout_failed"
      },
      occurredAt: "2026-08-04T01:00:00Z",
      outputLotIds: [
        {
          sourceLotId: "payout-bridge-pending",
          remainderLotId: "refund-missing-release-remainder"
        }
      ]
    });

    const forged = mutableClone(bridged.state);
    const bridge = forged.history.find((record) => record.kind === "refund_bridge_payout_failed");
    if (bridge?.authority?.kind !== "refund_bridge_payout_failed") {
      throw new Error("expected refund bridge");
    }
    bridge.authority.payoutOutcomeAuthority.payoutRequestId = "other-payout";

    expectLotError(() => rebuildPayableLotReferenceState(forged), "invalid_field");
  });

  it("replays cumulative chargeback restriction state instead of trusting its terminal projection", () => {
    const base = chargebackRestrictedState();
    const forged = mutableClone(base.restricted.state);
    const restriction = forged.chargebackRestrictions[0];
    if (!restriction) throw new Error("expected chargeback restriction");
    restriction.disputedAmount.amountMinor = 4_999;

    expectLotError(() => rebuildPayableLotReferenceState(forged), "lineage_invalid");
  });

  it("rehydrates the stable chargeback allocation and immutable revision chain", () => {
    const base = chargebackRestrictedState();
    const allocated = allocateChargebackPrincipalPayableLots({
      state: base.restricted.state,
      expectedVersion: base.restricted.nextVersion,
      authority: createChargebackPrincipalAllocationAuthority({
        kind: "chargeback_principal_allocation",
        authorityId: "chargeback-semantic-principal-authority",
        version: 1,
        chargebackCaseId: "chargeback-1",
        orderId: "order-chargeback",
        astrologerUserId: "astrologer-1",
        payableAmount: { amountMinor: 500, currency: "RUB" },
        accountingAllocationId: "chargeback-semantic-stable-allocation",
        accountingAllocationRevisionId: "chargeback-semantic-allocation-revision-1",
        accountingAllocationVersion: 1,
        allocationStatus: "approved",
        confirmedBasis: chargebackPrincipalConfirmedBasis(base.restricted.state, "chargeback-1")
      }),
      requestedLots: [{ lotId: "lot-order-chargeback-available", amountMinor: 500 }],
      operationId: "chargeback-semantic-principal",
      sourceKey: {
        kind: "chargeback",
        sourceId: "chargeback-semantic-allocation-revision-1",
        operation: "principal_allocated"
      },
      occurredAt: "2026-08-04T01:00:00Z",
      outputLotIds: [
        {
          sourceLotId: "lot-order-chargeback-available",
          remainderLotId: "chargeback-semantic-principal-remainder"
        }
      ]
    });
    const forged = mutableClone(allocated.state);
    const principal = forged.history.find(
      (record) => record.kind === "chargeback_principal_allocated"
    );
    if (principal?.authority?.kind !== "chargeback_principal_allocation") {
      throw new Error("expected chargeback principal allocation");
    }
    principal.authority.accountingAllocationVersion = 2;

    expectLotError(() => rebuildPayableLotReferenceState(forged), "lineage_invalid");
  });

  it("rejects a forged cumulative chargeback predecessor", () => {
    const base = chargebackRestrictedState();
    const updated = confirmChargebackRestriction({
      state: base.restricted.state,
      expectedVersion: base.restricted.nextVersion,
      authority: createChargebackConfirmedAuthority({
        kind: "chargeback_confirmed",
        authorityId: "chargeback-semantic-update-authority",
        version: 2,
        confirmationId: "chargeback-semantic-update",
        restrictionId: "chargeback-restriction-1",
        confirmationKind: "cumulative_update",
        amountBasis: "cumulative",
        priorRestrictionVersion: 1,
        chargebackCaseId: "chargeback-1",
        orderId: "order-chargeback",
        astrologerUserId: "astrologer-1",
        providerAccount: {
          seriesId: "arc-series-live",
          providerAccountId: "arc-account-live",
          identityVersion: 1
        },
        providerPaymentId: "provider-payment-order-chargeback",
        priorCumulativeDisputedAmount: { amountMinor: 5_000, currency: "RUB" },
        nextCumulativeDisputedAmount: { amountMinor: 6_000, currency: "RUB" },
        disputedDelta: { amountMinor: 1_000, currency: "RUB" },
        canonicalEvidenceId: "chargeback-semantic-update-evidence",
        confirmedAt: "2026-08-05T00:00:00Z"
      }),
      operationId: "chargeback-semantic-updated",
      sourceKey: {
        kind: "chargeback",
        sourceId: "chargeback-semantic-update",
        operation: "confirmed"
      },
      occurredAt: "2026-08-05T00:00:00Z"
    });
    const forged = mutableClone(updated.state);
    const update = forged.history.find(
      (record) =>
        record.authority?.kind === "chargeback_confirmed" &&
        record.authority.confirmationKind === "cumulative_update"
    );
    if (update?.authority?.kind !== "chargeback_confirmed") {
      throw new Error("expected cumulative chargeback confirmation");
    }
    update.authority.priorCumulativeDisputedAmount.amountMinor = 4_000;
    update.authority.disputedDelta.amountMinor = 2_000;

    expectLotError(() => rebuildPayableLotReferenceState(forged), "lineage_invalid");
  });

  it("rejects recovery collection detached from its declared source order", () => {
    const base = chargebackRestrictedState();
    const future = releasedState("order-semantic-recovery", base.restricted.state, {
      capturedAt: "2026-08-05T09:00:00Z",
      bookingCompletedAt: "2026-08-05T10:00:00Z",
      settlementMatchedAt: "2026-08-06T00:00:00Z",
      integrityEvaluatedAt: "2026-08-07T10:00:00Z",
      releasedAt: "2026-08-07T10:00:00Z"
    });
    const collected = collectChargebackRecoveryPayableLots({
      state: future.state,
      expectedVersion: future.nextVersion,
      authority: createChargebackRecoveryCollectionAuthority({
        kind: "chargeback_recovery_collection",
        authorityId: "chargeback-semantic-recovery-authority",
        version: 1,
        recoveryCollectionId: "chargeback-semantic-recovery",
        chargebackCaseId: "chargeback-1",
        astrologerUserId: "astrologer-1",
        collectionSource: {
          kind: "future_payable",
          sourceOrderId: "order-semantic-recovery"
        },
        collectedPayableAmount: { amountMinor: 500, currency: "RUB" },
        accountingAllocationId: "chargeback-semantic-recovery-allocation",
        accountingAllocationVersion: 1,
        allocationStatus: "approved",
        canonicalEvidenceId: "chargeback-semantic-recovery-evidence",
        collectedAt: "2026-08-08T00:00:00Z"
      }),
      requestedLots: [{ lotId: "lot-order-semantic-recovery-available", amountMinor: 500 }],
      operationId: "chargeback-semantic-recovery-collected",
      sourceKey: {
        kind: "chargeback",
        sourceId: "chargeback-semantic-recovery",
        operation: "recovery_collected"
      },
      occurredAt: "2026-08-08T00:00:00Z",
      outputLotIds: [
        {
          sourceLotId: "lot-order-semantic-recovery-available",
          remainderLotId: "chargeback-semantic-recovery-remainder"
        }
      ]
    });
    const forged = mutableClone(collected.state);
    const recovery = forged.history.find(
      (record) => record.kind === "chargeback_recovery_collected"
    );
    if (
      recovery?.authority?.kind !== "chargeback_recovery_collection" ||
      recovery.authority.collectionSource.kind !== "future_payable"
    ) {
      throw new Error("expected future-payable recovery");
    }
    recovery.authority.collectionSource.sourceOrderId = "order-chargeback";

    expectLotError(() => rebuildPayableLotReferenceState(forged), "lineage_invalid");
  });

  it("rejects a won outcome whose restored authority has no matching lot edges", () => {
    const base = chargebackRestrictedState();
    const won = restoreChargebackWonReservedPayableLots({
      state: base.restricted.state,
      expectedVersion: base.restricted.nextVersion,
      authority: createChargebackWonAuthority({
        kind: "chargeback_won",
        authorityId: "chargeback-semantic-won-authority",
        version: 1,
        chargebackCaseId: "chargeback-1",
        restoredPayableAmount: { amountMinor: 0, currency: "RUB" },
        suspenseClearedAmount: { amountMinor: 5_000, currency: "RUB" },
        accountingAllocationId: "chargeback-semantic-won-allocation",
        accountingAllocationVersion: 1,
        allocationStatus: "approved",
        canonicalEvidenceId: "chargeback-semantic-won-evidence",
        wonAt: "2026-08-10T00:00:00Z"
      }),
      requestedLots: [],
      operationId: "chargeback-semantic-won",
      sourceKey: { kind: "chargeback", sourceId: "chargeback-1", operation: "won" },
      occurredAt: "2026-08-10T00:00:00Z",
      outputLotIds: []
    });
    const forged = mutableClone(won.state);
    const wonRecord = forged.history.find((record) => record.kind === "chargeback_won_reserved");
    if (wonRecord?.authority?.kind !== "chargeback_won") {
      throw new Error("expected chargeback won record");
    }
    wonRecord.authority.restoredPayableAmount.amountMinor = 1;

    expectLotError(() => rebuildPayableLotReferenceState(forged), "conservation_violation");
  });

  it("rejects a lost restriction event addressed to a different restriction identity", () => {
    const base = chargebackRestrictedState();
    const lost = recordChargebackLostRestrictionOutcome({
      state: base.restricted.state,
      expectedVersion: base.restricted.nextVersion,
      authority: createChargebackLostAuthority({
        kind: "chargeback_lost",
        authorityId: "chargeback-semantic-lost-authority",
        version: 1,
        chargebackCaseId: "chargeback-1",
        unallocatedSuspense: { amountMinor: 0, currency: "RUB" },
        accountingAllocationId: "chargeback-semantic-lost-allocation",
        accountingAllocationVersion: 1,
        allocationStatus: "approved",
        canonicalEvidenceId: "chargeback-semantic-lost-evidence",
        lostAt: "2026-08-10T00:00:00Z"
      }),
      operationId: "chargeback-semantic-lost",
      operationKey: {
        kind: "chargeback_restriction",
        restrictionId: "chargeback-restriction-1",
        operation: "lost_final"
      },
      occurredAt: "2026-08-10T00:00:00Z"
    });
    const forged = mutableClone(lost.state);
    const lostRecord = forged.restrictionHistory[0];
    if (!lostRecord) throw new Error("expected lost restriction record");
    lostRecord.operationKey.restrictionId = "forged-chargeback-restriction";

    expectLotError(() => rebuildPayableLotReferenceState(forged), "lineage_invalid");
  });

  it("deep-freezes nested collection authority and rejects Proxy-backed source data", () => {
    const authority = createChargebackRecoveryCollectionAuthority({
      kind: "chargeback_recovery_collection",
      authorityId: "chargeback-freeze-recovery-authority",
      version: 1,
      recoveryCollectionId: "chargeback-freeze-recovery",
      chargebackCaseId: "chargeback-1",
      astrologerUserId: "astrologer-1",
      collectionSource: { kind: "future_payable", sourceOrderId: "order-future" },
      collectedPayableAmount: { amountMinor: 500, currency: "RUB" },
      accountingAllocationId: "chargeback-freeze-recovery-allocation",
      accountingAllocationVersion: 1,
      allocationStatus: "approved",
      canonicalEvidenceId: "chargeback-freeze-recovery-evidence",
      collectedAt: "2026-08-05T00:00:00Z"
    });
    expect(Object.isFrozen(authority)).toBe(true);
    expect(Object.isFrozen(authority.collectionSource)).toBe(true);
    expect(Object.isFrozen(authority.collectedPayableAmount)).toBe(true);

    expectLotError(
      () =>
        createChargebackRecoveryCollectionAuthority({
          ...authority,
          collectionSource: new Proxy(
            { kind: "future_payable", sourceOrderId: "order-future" },
            {
              ownKeys() {
                throw new Error("proxy trap");
              }
            }
          )
        }),
      "invalid_shape"
    );
  });
});

function noTransferAuthority(authorityId: string, evidenceId: string) {
  return createPayoutNoTransferOutcomeAuthority({
    kind: "payout_no_transfer_outcome",
    authorityId,
    version: 1,
    payoutRequestId: "payout-bridge",
    outcome: "failed_pre_transfer",
    bankInitiation: "not_started",
    bankDebit: "not_possible",
    evidenceId,
    decidedAt: "2026-08-04T01:00:00Z"
  });
}
