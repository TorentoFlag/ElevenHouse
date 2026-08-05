import { createPayableLotOperationReceipt } from "./source-lot-operation-receipt";
import { releaseFixture } from "./source-lot-sale-hold-test-fixtures";
import {
  allocateChargebackPrincipalPayableLots,
  collectChargebackRecoveryPayableLots,
  confirmChargebackRestriction,
  createChargebackConfirmedAuthority,
  createChargebackPrincipalAllocationAuthority,
  createChargebackRecoveryCollectionAuthority,
  releasePendingPayableLotFromState
} from "./source-lots";
import { emptySourceLotState } from "./wallet-reference-source-test-fixtures";
import { chargebackPrincipalConfirmedBasis } from "./source-lot-reference-test-fixtures";

export function chargebackRecoveryCollectedSourceLotFixture() {
  const disputedRelease = releaseFixture("order-wallet-disputed", {
    initialState: emptySourceLotState()
  });
  const disputedReleased = releasePendingPayableLotFromState(disputedRelease.input);
  const futureRelease = releaseFixture("order-wallet-future", {
    initialState: disputedReleased.state
  });
  const futureReleased = releasePendingPayableLotFromState(futureRelease.input);
  const restricted = confirmChargebackRestriction({
    state: futureReleased.state,
    expectedVersion: futureReleased.nextVersion,
    authority: createChargebackConfirmedAuthority({
      kind: "chargeback_confirmed",
      authorityId: "wallet-recovery-confirmed-authority",
      version: 1,
      confirmationId: "wallet-recovery-confirmation",
      restrictionId: "wallet-recovery-restriction",
      confirmationKind: "initial",
      amountBasis: "cumulative",
      priorRestrictionVersion: null,
      chargebackCaseId: "wallet-recovery-case",
      orderId: "order-wallet-disputed",
      astrologerUserId: "astrologer-1",
      providerAccount: {
        seriesId: "arc-series-live",
        providerAccountId: "arc-account-live",
        identityVersion: 1
      },
      providerPaymentId: "provider-payment-order-wallet-disputed",
      priorCumulativeDisputedAmount: { amountMinor: 0, currency: "RUB" },
      nextCumulativeDisputedAmount: { amountMinor: 2_500, currency: "RUB" },
      disputedDelta: { amountMinor: 2_500, currency: "RUB" },
      canonicalEvidenceId: "wallet-recovery-confirmed-evidence",
      confirmedAt: "2026-08-04T00:00:00Z"
    }),
    operationId: "wallet-recovery-confirmed",
    sourceKey: {
      kind: "chargeback",
      sourceId: "wallet-recovery-confirmation",
      operation: "confirmed"
    },
    occurredAt: "2026-08-04T00:00:00Z"
  });
  const allocated = allocateChargebackPrincipalPayableLots({
    state: restricted.state,
    expectedVersion: restricted.nextVersion,
    authority: createChargebackPrincipalAllocationAuthority({
      kind: "chargeback_principal_allocation",
      authorityId: "wallet-recovery-principal-authority",
      version: 1,
      chargebackCaseId: "wallet-recovery-case",
      orderId: "order-wallet-disputed",
      astrologerUserId: "astrologer-1",
      payableAmount: { amountMinor: 2_000, currency: "RUB" },
      accountingAllocationId: "wallet-recovery-principal-allocation",
      accountingAllocationRevisionId: "wallet-recovery-principal-revision-1",
      accountingAllocationVersion: 1,
      allocationStatus: "approved",
      confirmedBasis: chargebackPrincipalConfirmedBasis(restricted.state, "wallet-recovery-case")
    }),
    requestedLots: [{ lotId: "lot-order-wallet-disputed-available", amountMinor: 2_000 }],
    operationId: "wallet-recovery-principal-allocated",
    sourceKey: {
      kind: "chargeback",
      sourceId: "wallet-recovery-principal-revision-1",
      operation: "principal_allocated"
    },
    occurredAt: "2026-08-04T01:00:00Z",
    outputLotIds: [
      {
        sourceLotId: "lot-order-wallet-disputed-available",
        remainderLotId: "lot-order-wallet-disputed-available-remainder"
      }
    ]
  });
  const collected = collectChargebackRecoveryPayableLots({
    state: allocated.state,
    expectedVersion: allocated.nextVersion,
    authority: createChargebackRecoveryCollectionAuthority({
      kind: "chargeback_recovery_collection",
      authorityId: "wallet-recovery-collection-authority",
      version: 1,
      recoveryCollectionId: "wallet-recovery-collection",
      chargebackCaseId: "wallet-recovery-case",
      astrologerUserId: "astrologer-1",
      collectionSource: {
        kind: "future_payable",
        sourceOrderId: "order-wallet-future"
      },
      collectedPayableAmount: { amountMinor: 500, currency: "RUB" },
      accountingAllocationId: "wallet-recovery-collection-allocation",
      accountingAllocationVersion: 1,
      allocationStatus: "approved",
      canonicalEvidenceId: "wallet-recovery-collection-evidence",
      collectedAt: "2026-08-06T00:00:00Z"
    }),
    requestedLots: [{ lotId: "lot-order-wallet-future-available", amountMinor: 500 }],
    operationId: "wallet-recovery-collected",
    sourceKey: {
      kind: "chargeback",
      sourceId: "wallet-recovery-collection",
      operation: "recovery_collected"
    },
    occurredAt: "2026-08-06T00:00:00Z",
    outputLotIds: [
      {
        sourceLotId: "lot-order-wallet-future-available",
        remainderLotId: "lot-order-wallet-future-available-remainder"
      }
    ]
  });
  return Object.freeze({
    state: collected.state,
    receipts: Object.freeze([
      createPayableLotOperationReceipt(disputedRelease.transition),
      createPayableLotOperationReceipt(disputedReleased),
      createPayableLotOperationReceipt(futureRelease.transition),
      createPayableLotOperationReceipt(futureReleased),
      createPayableLotOperationReceipt(restricted),
      createPayableLotOperationReceipt(allocated),
      createPayableLotOperationReceipt(collected)
    ])
  });
}
