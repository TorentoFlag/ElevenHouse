import { describe, expect, it } from "vitest";
import {
  allocateChargebackPrincipalPayableLots,
  collectChargebackRecoveryPayableLots,
  confirmChargebackRestriction,
  consumePaidPayoutPayableLots,
  createChargebackConfirmedAuthority,
  createChargebackLostAuthority,
  createChargebackPrincipalAllocationAuthority,
  createChargebackRecoveryCollectionAuthority,
  createChargebackWonAuthority,
  createPayoutPaidAuthority,
  createPayoutReturnAuthority,
  createReturnedPayoutReservedPayableLots,
  recordChargebackLostRestrictionOutcome,
  restoreChargebackWonReservedPayableLots,
  selectPayoutPayableLots,
  type PayableLotReferenceState
} from "./source-lots";

import {
  chargebackPrincipalConfirmedBasis,
  chargebackRestrictedState,
  expectLotError,
  payoutPendingState,
  refundPendingState,
  releasedState
} from "./source-lot-reference-test-fixtures";
const providerAccount = () => ({
  seriesId: "arc-series-live",
  providerAccountId: "arc-account-live",
  identityVersion: 1
});

describe("non-ledger chargeback restriction and payable allocation", () => {
  it("records confirmation as a versioned restriction without moving any payable lot", () => {
    const base = chargebackRestrictedState();
    expect(base.restricted.consumedLots).toEqual([]);
    expect(base.restricted.createdLots).toEqual([]);
    expect(base.restricted.state.chargebackRestrictions).toEqual([
      expect.objectContaining({
        chargebackCaseId: "chargeback-1",
        orderId: "order-chargeback",
        status: "active",
        disputedAmount: { amountMinor: 5_000, currency: "RUB" }
      })
    ]);
    expectLotError(
      () =>
        selectPayoutPayableLots({
          state: base.restricted.state,
          expectedVersion: base.restricted.nextVersion,
          astrologerUserId: "astrologer-1",
          amount: { amountMinor: 1, currency: "RUB" }
        }),
      "insufficient_lot_funds"
    );
  });

  it("applies explicit cumulative chargeback deltas and rejects stale or non-cumulative updates", () => {
    const base = chargebackRestrictedState();
    const updateAuthority = createChargebackConfirmedAuthority({
      kind: "chargeback_confirmed",
      authorityId: "chargeback-confirmed-authority-2",
      version: 2,
      confirmationId: "chargeback-confirmation-2",
      restrictionId: "chargeback-restriction-1",
      confirmationKind: "cumulative_update",
      amountBasis: "cumulative",
      priorRestrictionVersion: 1,
      chargebackCaseId: "chargeback-1",
      orderId: "order-chargeback",
      astrologerUserId: "astrologer-1",
      providerAccount: providerAccount(),
      providerPaymentId: "provider-payment-order-chargeback",
      priorCumulativeDisputedAmount: { amountMinor: 5_000, currency: "RUB" },
      nextCumulativeDisputedAmount: { amountMinor: 6_000, currency: "RUB" },
      disputedDelta: { amountMinor: 1_000, currency: "RUB" },
      canonicalEvidenceId: "chargeback-confirmed-evidence-2",
      confirmedAt: "2026-08-05T00:00:00Z"
    });
    const updated = confirmChargebackRestriction({
      state: base.restricted.state,
      expectedVersion: base.restricted.nextVersion,
      authority: updateAuthority,
      operationId: "chargeback-confirmed-2",
      sourceKey: {
        kind: "chargeback",
        sourceId: "chargeback-confirmation-2",
        operation: "confirmed"
      },
      occurredAt: "2026-08-05T00:00:00Z"
    });
    expect(updated.state.chargebackRestrictions[0]).toMatchObject({
      version: 2,
      disputedAmount: { amountMinor: 6_000, currency: "RUB" },
      status: "active"
    });
    expectLotError(
      () =>
        confirmChargebackRestriction({
          state: updated.state,
          expectedVersion: updated.nextVersion,
          authority: createChargebackConfirmedAuthority({
            ...updateAuthority,
            authorityId: "chargeback-confirmed-authority-stale",
            version: 3,
            confirmationId: "chargeback-confirmation-stale",
            priorCumulativeDisputedAmount: { amountMinor: 6_000, currency: "RUB" },
            nextCumulativeDisputedAmount: { amountMinor: 7_000, currency: "RUB" },
            canonicalEvidenceId: "chargeback-confirmed-evidence-stale",
            confirmedAt: "2026-08-06T00:00:00Z"
          }),
          operationId: "chargeback-confirmed-stale",
          sourceKey: {
            kind: "chargeback",
            sourceId: "chargeback-confirmation-stale",
            operation: "confirmed"
          },
          occurredAt: "2026-08-06T00:00:00Z"
        }),
      "version_conflict"
    );
    expectLotError(
      () =>
        createChargebackConfirmedAuthority({
          ...updateAuthority,
          confirmationId: "chargeback-confirmation-noncumulative",
          amountBasis: "delta"
        }),
      "invalid_field"
    );
  });

  it.each([
    ["series", { seriesId: "arc-series-other" }],
    ["identity version", { identityVersion: 2 }]
  ] as const)("rejects same-ID provider %s drift in cumulative confirmation", (_label, drift) => {
    const base = chargebackRestrictedState();
    const authority = createChargebackConfirmedAuthority({
      kind: "chargeback_confirmed",
      authorityId: `chargeback-confirmed-authority-${_label}`,
      version: 2,
      confirmationId: `chargeback-confirmation-${_label}`,
      restrictionId: "chargeback-restriction-1",
      confirmationKind: "cumulative_update",
      amountBasis: "cumulative",
      priorRestrictionVersion: 1,
      chargebackCaseId: "chargeback-1",
      orderId: "order-chargeback",
      astrologerUserId: "astrologer-1",
      providerAccount: { ...providerAccount(), ...drift },
      providerPaymentId: "provider-payment-order-chargeback",
      priorCumulativeDisputedAmount: { amountMinor: 5_000, currency: "RUB" },
      nextCumulativeDisputedAmount: { amountMinor: 6_000, currency: "RUB" },
      disputedDelta: { amountMinor: 1_000, currency: "RUB" },
      canonicalEvidenceId: `chargeback-confirmed-evidence-${_label}`,
      confirmedAt: "2026-08-05T00:00:00Z"
    });

    expectLotError(
      () =>
        confirmChargebackRestriction({
          state: base.restricted.state,
          expectedVersion: base.restricted.nextVersion,
          authority,
          operationId: `chargeback-confirmed-${_label}`,
          sourceKey: {
            kind: "chargeback",
            sourceId: authority.confirmationId,
            operation: "confirmed"
          },
          occurredAt: authority.confirmedAt
        }),
      "capture_correlation_mismatch"
    );
  });

  it("consumes only explicitly approved active sale lots and rejects refund-pending conflicts", () => {
    const base = chargebackRestrictedState();
    const authority = createChargebackPrincipalAllocationAuthority({
      kind: "chargeback_principal_allocation",
      authorityId: "chargeback-principal-authority-1",
      version: 1,
      chargebackCaseId: "chargeback-1",
      orderId: "order-chargeback",
      astrologerUserId: "astrologer-1",
      payableAmount: { amountMinor: 2_000, currency: "RUB" },
      accountingAllocationId: "chargeback-accounting-allocation-1",
      accountingAllocationRevisionId: "chargeback-accounting-allocation-1-revision-1",
      accountingAllocationVersion: 1,
      allocationStatus: "approved",
      confirmedBasis: chargebackPrincipalConfirmedBasis(base.restricted.state, "chargeback-1")
    });
    const allocated = allocateChargebackPrincipalPayableLots({
      state: base.restricted.state,
      expectedVersion: base.restricted.nextVersion,
      authority,
      requestedLots: [{ lotId: "lot-order-chargeback-available", amountMinor: 2_000 }],
      operationId: "chargeback-principal-allocated-1",
      sourceKey: {
        kind: "chargeback",
        sourceId: "chargeback-accounting-allocation-1-revision-1",
        operation: "principal_allocated"
      },
      occurredAt: "2026-08-04T01:00:00Z",
      outputLotIds: [
        {
          sourceLotId: "lot-order-chargeback-available",
          remainderLotId: "lot-order-chargeback-available-after-allocation"
        }
      ]
    });
    expect(allocated.createdLots).toEqual([
      expect.objectContaining({
        lotId: "lot-order-chargeback-available-after-allocation",
        bucket: "available",
        amount: { amountMinor: 6_640, currency: "RUB" }
      })
    ]);
    expect(allocated.consumedLots).toEqual([
      expect.objectContaining({
        lotId: "lot-order-chargeback-available",
        status: "consumed",
        consumedByOperationId: "chargeback-principal-allocated-1"
      })
    ]);

    const refund = refundPendingState();
    const conflictRestriction = confirmChargebackRestriction({
      state: refund.moved.state,
      expectedVersion: refund.moved.nextVersion,
      authority: createChargebackConfirmedAuthority({
        kind: "chargeback_confirmed",
        authorityId: "chargeback-refund-conflict-confirmed",
        version: 1,
        confirmationId: "chargeback-refund-conflict-confirmation",
        restrictionId: "chargeback-refund-conflict-restriction",
        confirmationKind: "initial",
        amountBasis: "cumulative",
        priorRestrictionVersion: null,
        chargebackCaseId: "chargeback-refund-conflict",
        orderId: "order-refund",
        astrologerUserId: "astrologer-1",
        providerAccount: providerAccount(),
        providerPaymentId: "provider-payment-order-refund",
        priorCumulativeDisputedAmount: { amountMinor: 0, currency: "RUB" },
        nextCumulativeDisputedAmount: { amountMinor: 500, currency: "RUB" },
        disputedDelta: { amountMinor: 500, currency: "RUB" },
        canonicalEvidenceId: "chargeback-refund-conflict-evidence",
        confirmedAt: "2026-08-04T00:30:00Z"
      }),
      operationId: "chargeback-refund-conflict-confirmed",
      sourceKey: {
        kind: "chargeback",
        sourceId: "chargeback-refund-conflict-confirmation",
        operation: "confirmed"
      },
      occurredAt: "2026-08-04T00:30:00Z"
    });
    expectLotError(
      () =>
        allocateChargebackPrincipalPayableLots({
          state: conflictRestriction.state,
          expectedVersion: conflictRestriction.nextVersion,
          authority: createChargebackPrincipalAllocationAuthority({
            ...authority,
            chargebackCaseId: "chargeback-refund-conflict",
            orderId: "order-refund",
            payableAmount: { amountMinor: 1, currency: "RUB" },
            accountingAllocationId: "chargeback-refund-conflict-allocation",
            accountingAllocationRevisionId: "chargeback-refund-conflict-allocation-revision-1",
            confirmedBasis: chargebackPrincipalConfirmedBasis(
              conflictRestriction.state,
              "chargeback-refund-conflict"
            )
          }),
          requestedLots: [{ lotId: "refund-1-from-available", amountMinor: 1 }],
          operationId: "chargeback-refund-conflict",
          sourceKey: {
            kind: "chargeback",
            sourceId: "chargeback-refund-conflict-allocation-revision-1",
            operation: "principal_allocated"
          },
          occurredAt: "2026-08-04T01:00:00Z",
          outputLotIds: [{ sourceLotId: "refund-1-from-available", remainderLotId: null }]
        }),
      "lot_bucket_ineligible"
    );
  });

  it("accepts multiple immutable principal-allocation deltas and rejects allocation replay", () => {
    const base = chargebackRestrictedState();
    const allocate = (
      state: PayableLotReferenceState,
      lotId: string,
      allocationRevisionId: string,
      allocationVersion: number,
      operationId: string,
      remainderLotId: string
    ) =>
      allocateChargebackPrincipalPayableLots({
        state,
        expectedVersion: state.version,
        authority: createChargebackPrincipalAllocationAuthority({
          kind: "chargeback_principal_allocation",
          authorityId: `${allocationRevisionId}-authority`,
          version: 1,
          chargebackCaseId: "chargeback-1",
          orderId: "order-chargeback",
          astrologerUserId: "astrologer-1",
          payableAmount: { amountMinor: 500, currency: "RUB" },
          accountingAllocationId: "chargeback-stable-allocation",
          accountingAllocationRevisionId: allocationRevisionId,
          accountingAllocationVersion: allocationVersion,
          allocationStatus: "approved",
          confirmedBasis: chargebackPrincipalConfirmedBasis(state, "chargeback-1")
        }),
        requestedLots: [{ lotId, amountMinor: 500 }],
        operationId,
        sourceKey: {
          kind: "chargeback",
          sourceId: allocationRevisionId,
          operation: "principal_allocated"
        },
        occurredAt: "2026-08-04T01:00:00Z",
        outputLotIds: [{ sourceLotId: lotId, remainderLotId }]
      });
    const first = allocate(
      base.restricted.state,
      "lot-order-chargeback-available",
      "chargeback-allocation-delta-1",
      1,
      "chargeback-allocation-delta-op-1",
      "chargeback-allocation-delta-remainder-1"
    );
    const second = allocate(
      first.state,
      "chargeback-allocation-delta-remainder-1",
      "chargeback-allocation-delta-2",
      2,
      "chargeback-allocation-delta-op-2",
      "chargeback-allocation-delta-remainder-2"
    );
    expect(
      second.state.history.filter((record) => record.kind === "chargeback_principal_allocated")
    ).toHaveLength(2);
    expectLotError(
      () =>
        allocate(
          second.state,
          "chargeback-allocation-delta-remainder-2",
          "chargeback-allocation-delta-1",
          3,
          "chargeback-allocation-delta-op-replay",
          "chargeback-allocation-delta-remainder-replay"
        ),
      "duplicate_operation_source"
    );
  });

  it("records a zero-payable principal allocation without a fake lot", () => {
    const base = chargebackRestrictedState();
    const allocated = allocateChargebackPrincipalPayableLots({
      state: base.restricted.state,
      expectedVersion: base.restricted.nextVersion,
      authority: createChargebackPrincipalAllocationAuthority({
        kind: "chargeback_principal_allocation",
        authorityId: "chargeback-zero-principal-authority",
        version: 1,
        chargebackCaseId: "chargeback-1",
        orderId: "order-chargeback",
        astrologerUserId: "astrologer-1",
        payableAmount: { amountMinor: 0, currency: "RUB" },
        accountingAllocationId: "chargeback-zero-principal-allocation",
        accountingAllocationRevisionId: "chargeback-zero-principal-allocation-revision-1",
        accountingAllocationVersion: 1,
        allocationStatus: "approved",
        confirmedBasis: chargebackPrincipalConfirmedBasis(base.restricted.state, "chargeback-1")
      }),
      requestedLots: [],
      operationId: "chargeback-zero-principal",
      sourceKey: {
        kind: "chargeback",
        sourceId: "chargeback-zero-principal-allocation-revision-1",
        operation: "principal_allocated"
      },
      occurredAt: "2026-08-04T01:00:00Z",
      outputLotIds: []
    });
    expect(allocated.consumedLots).toEqual([]);
    expect(allocated.createdLots).toEqual([]);
  });

  it("collects same-sale recovery only from the exact returned payout allocation", () => {
    const payout = payoutPendingState();
    const paid = consumePaidPayoutPayableLots({
      state: payout.state,
      expectedVersion: payout.nextVersion,
      payoutRequestId: "payout-bridge",
      authority: createPayoutPaidAuthority({
        kind: "payout_paid",
        authorityId: "payout-returned-recovery-paid-authority",
        version: 1,
        payoutRequestId: "payout-bridge",
        bankReference: "bank-returned-recovery",
        transferredAt: "2026-08-05T00:00:00Z",
        evidenceRef: "private://payout-returned-recovery-paid",
        evidenceHash: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
      }),
      operationId: "payout-returned-recovery-paid",
      sourceKey: { kind: "payout", sourceId: "payout-bridge", operation: "paid" },
      occurredAt: "2026-08-05T00:00:00Z"
    });
    const returnedAuthority = createPayoutReturnAuthority({
      kind: "payout_return",
      authorityId: "payout-returned-recovery-authority",
      version: 1,
      payoutRequestId: "payout-bridge",
      outcome: "returned_after_matched_debit",
      bankReference: "bank-returned-recovery",
      bankStatementEntryId: "bank-returned-recovery-credit",
      bankCreditEvidencePath: "direct_match",
      suspenseReclassificationId: null,
      returnedAt: "2026-08-06T00:00:00Z",
      evidenceId: "payout-returned-recovery-evidence"
    });
    const returned = createReturnedPayoutReservedPayableLots({
      state: paid.state,
      expectedVersion: paid.nextVersion,
      payoutRequestId: "payout-bridge",
      authority: returnedAuthority,
      operationId: "payout-returned-recovery-returned",
      sourceKey: {
        kind: "bank",
        sourceId: "bank-returned-recovery-credit",
        operation: "payout_return_credit_matched"
      },
      occurredAt: "2026-08-06T00:00:00Z",
      outputLotIds: [
        {
          sourceLotId: "payout-bridge-pending",
          targetLotId: "payout-returned-recovery-reserved"
        }
      ]
    });
    const restricted = confirmChargebackRestriction({
      state: returned.state,
      expectedVersion: returned.nextVersion,
      authority: createChargebackConfirmedAuthority({
        kind: "chargeback_confirmed",
        authorityId: "chargeback-returned-recovery-confirmed-authority",
        version: 1,
        confirmationId: "chargeback-returned-recovery-confirmation",
        restrictionId: "chargeback-returned-recovery-restriction",
        confirmationKind: "initial",
        amountBasis: "cumulative",
        priorRestrictionVersion: null,
        chargebackCaseId: "chargeback-returned-recovery",
        orderId: "order-bridge",
        astrologerUserId: "astrologer-1",
        providerAccount: providerAccount(),
        providerPaymentId: "provider-payment-order-bridge",
        priorCumulativeDisputedAmount: { amountMinor: 0, currency: "RUB" },
        nextCumulativeDisputedAmount: { amountMinor: 500, currency: "RUB" },
        disputedDelta: { amountMinor: 500, currency: "RUB" },
        canonicalEvidenceId: "chargeback-returned-recovery-confirmed-evidence",
        confirmedAt: "2026-08-07T00:00:00Z"
      }),
      operationId: "chargeback-returned-recovery-confirmed",
      sourceKey: {
        kind: "chargeback",
        sourceId: "chargeback-returned-recovery-confirmation",
        operation: "confirmed"
      },
      occurredAt: "2026-08-07T00:00:00Z"
    });
    const collectionAuthority = createChargebackRecoveryCollectionAuthority({
      kind: "chargeback_recovery_collection",
      authorityId: "chargeback-returned-recovery-collection-authority",
      version: 1,
      recoveryCollectionId: "chargeback-returned-recovery-collection",
      chargebackCaseId: "chargeback-returned-recovery",
      astrologerUserId: "astrologer-1",
      collectionSource: {
        kind: "returned_payout",
        sourceOrderId: "order-bridge",
        payoutRequestId: "payout-bridge",
        payoutAllocationId: "payout-bridge-allocation",
        payoutReturnAuthorityId: returnedAuthority.authorityId,
        payoutReturnAuthorityVersion: returnedAuthority.version,
        payoutReturnEvidenceId: returnedAuthority.evidenceId
      },
      collectedPayableAmount: { amountMinor: 400, currency: "RUB" },
      accountingAllocationId: "chargeback-returned-recovery-accounting-allocation",
      accountingAllocationVersion: 1,
      allocationStatus: "approved",
      canonicalEvidenceId: "chargeback-returned-recovery-collection-evidence",
      collectedAt: "2026-08-08T00:00:00Z"
    });
    const collected = collectChargebackRecoveryPayableLots({
      state: restricted.state,
      expectedVersion: restricted.nextVersion,
      authority: collectionAuthority,
      requestedLots: [{ lotId: "payout-returned-recovery-reserved", amountMinor: 400 }],
      operationId: "chargeback-returned-recovery-collected",
      sourceKey: {
        kind: "chargeback",
        sourceId: "chargeback-returned-recovery-collection",
        operation: "recovery_collected"
      },
      occurredAt: "2026-08-08T00:00:00Z",
      outputLotIds: [
        {
          sourceLotId: "payout-returned-recovery-reserved",
          remainderLotId: "payout-returned-recovery-reserved-remainder"
        }
      ]
    });
    expect(collected.historyRecord.chargebackAllocations).toEqual([
      expect.objectContaining({
        sourceLotId: "payout-returned-recovery-reserved",
        allocatedAmountMinor: 400
      })
    ]);
    expectLotError(
      () =>
        collectChargebackRecoveryPayableLots({
          state: restricted.state,
          expectedVersion: restricted.nextVersion,
          authority: createChargebackRecoveryCollectionAuthority({
            ...collectionAuthority,
            authorityId: "chargeback-returned-recovery-wrong-allocation-authority",
            recoveryCollectionId: "chargeback-returned-recovery-wrong-allocation",
            collectionSource: {
              ...collectionAuthority.collectionSource,
              payoutAllocationId: "payout-allocation-other"
            },
            canonicalEvidenceId: "chargeback-returned-recovery-wrong-allocation-evidence"
          }),
          requestedLots: [{ lotId: "payout-returned-recovery-reserved", amountMinor: 400 }],
          operationId: "chargeback-returned-recovery-wrong-allocation",
          sourceKey: {
            kind: "chargeback",
            sourceId: "chargeback-returned-recovery-wrong-allocation",
            operation: "recovery_collected"
          },
          occurredAt: "2026-08-08T00:00:00Z",
          outputLotIds: [
            {
              sourceLotId: "payout-returned-recovery-reserved",
              remainderLotId: "payout-returned-recovery-wrong-allocation-remainder"
            }
          ]
        }),
      "selection_mismatch"
    );
  });

  it("blocks future-payable recovery from an order with another active dispute", () => {
    const target = chargebackRestrictedState();
    const future = releasedState("order-recovery-frozen", target.restricted.state, {
      capturedAt: "2026-08-05T09:00:00Z",
      bookingCompletedAt: "2026-08-05T10:00:00Z",
      settlementMatchedAt: "2026-08-06T00:00:00Z",
      integrityEvaluatedAt: "2026-08-07T10:00:00Z",
      releasedAt: "2026-08-07T10:00:00Z"
    });
    const frozen = confirmChargebackRestriction({
      state: future.state,
      expectedVersion: future.nextVersion,
      authority: createChargebackConfirmedAuthority({
        kind: "chargeback_confirmed",
        authorityId: "chargeback-recovery-source-frozen-authority",
        version: 1,
        confirmationId: "chargeback-recovery-source-frozen-confirmation",
        restrictionId: "chargeback-recovery-source-frozen-restriction",
        confirmationKind: "initial",
        amountBasis: "cumulative",
        priorRestrictionVersion: null,
        chargebackCaseId: "chargeback-recovery-source-frozen",
        orderId: "order-recovery-frozen",
        astrologerUserId: "astrologer-1",
        providerAccount: providerAccount(),
        providerPaymentId: "provider-payment-order-recovery-frozen",
        priorCumulativeDisputedAmount: { amountMinor: 0, currency: "RUB" },
        nextCumulativeDisputedAmount: { amountMinor: 500, currency: "RUB" },
        disputedDelta: { amountMinor: 500, currency: "RUB" },
        canonicalEvidenceId: "chargeback-recovery-source-frozen-evidence",
        confirmedAt: "2026-08-08T00:00:00Z"
      }),
      operationId: "chargeback-recovery-source-frozen-confirmed",
      sourceKey: {
        kind: "chargeback",
        sourceId: "chargeback-recovery-source-frozen-confirmation",
        operation: "confirmed"
      },
      occurredAt: "2026-08-08T00:00:00Z"
    });
    expectLotError(
      () =>
        collectChargebackRecoveryPayableLots({
          state: frozen.state,
          expectedVersion: frozen.nextVersion,
          authority: createChargebackRecoveryCollectionAuthority({
            kind: "chargeback_recovery_collection",
            authorityId: "chargeback-recovery-frozen-collection-authority",
            version: 1,
            recoveryCollectionId: "chargeback-recovery-frozen-collection",
            chargebackCaseId: "chargeback-1",
            astrologerUserId: "astrologer-1",
            collectionSource: {
              kind: "future_payable",
              sourceOrderId: "order-recovery-frozen"
            },
            collectedPayableAmount: { amountMinor: 100, currency: "RUB" },
            accountingAllocationId: "chargeback-recovery-frozen-accounting-allocation",
            accountingAllocationVersion: 1,
            allocationStatus: "approved",
            canonicalEvidenceId: "chargeback-recovery-frozen-collection-evidence",
            collectedAt: "2026-08-09T00:00:00Z"
          }),
          requestedLots: [{ lotId: "lot-order-recovery-frozen-available", amountMinor: 100 }],
          operationId: "chargeback-recovery-frozen-collected",
          sourceKey: {
            kind: "chargeback",
            sourceId: "chargeback-recovery-frozen-collection",
            operation: "recovery_collected"
          },
          occurredAt: "2026-08-09T00:00:00Z",
          outputLotIds: [
            {
              sourceLotId: "lot-order-recovery-frozen-available",
              remainderLotId: "chargeback-recovery-frozen-remainder"
            }
          ]
        }),
      "release_blocked"
    );
  });

  it("collects multiple recovery deltas from new payable lots and restores won H within them", () => {
    const original = releasedState("order-chargeback");
    const withRecoveryOrder = releasedState("order-recovery", original.state);
    const restricted = confirmChargebackRestriction({
      state: withRecoveryOrder.state,
      expectedVersion: withRecoveryOrder.nextVersion,
      authority: createChargebackConfirmedAuthority({
        kind: "chargeback_confirmed",
        authorityId: "chargeback-recovery-confirmed-authority",
        version: 1,
        confirmationId: "chargeback-recovery-confirmation",
        restrictionId: "chargeback-recovery-restriction",
        confirmationKind: "initial",
        amountBasis: "cumulative",
        priorRestrictionVersion: null,
        chargebackCaseId: "chargeback-recovery",
        orderId: "order-chargeback",
        astrologerUserId: "astrologer-1",
        providerAccount: providerAccount(),
        providerPaymentId: "provider-payment-order-chargeback",
        priorCumulativeDisputedAmount: { amountMinor: 0, currency: "RUB" },
        nextCumulativeDisputedAmount: { amountMinor: 5_000, currency: "RUB" },
        disputedDelta: { amountMinor: 5_000, currency: "RUB" },
        canonicalEvidenceId: "chargeback-recovery-confirmed-evidence",
        confirmedAt: "2026-08-04T00:00:00Z"
      }),
      operationId: "chargeback-recovery-confirmed",
      sourceKey: {
        kind: "chargeback",
        sourceId: "chargeback-recovery-confirmation",
        operation: "confirmed"
      },
      occurredAt: "2026-08-04T00:00:00Z"
    });
    const collect = (
      state: PayableLotReferenceState,
      lotId: string,
      amountMinor: number,
      collectionId: string,
      remainderLotId: string
    ) =>
      collectChargebackRecoveryPayableLots({
        state,
        expectedVersion: state.version,
        authority: createChargebackRecoveryCollectionAuthority({
          kind: "chargeback_recovery_collection",
          authorityId: `${collectionId}-authority`,
          version: 1,
          recoveryCollectionId: collectionId,
          chargebackCaseId: "chargeback-recovery",
          astrologerUserId: "astrologer-1",
          collectionSource: { kind: "future_payable", sourceOrderId: "order-recovery" },
          collectedPayableAmount: { amountMinor, currency: "RUB" },
          accountingAllocationId: `${collectionId}-accounting-allocation`,
          accountingAllocationVersion: 1,
          allocationStatus: "approved",
          canonicalEvidenceId: `${collectionId}-evidence`,
          collectedAt: "2026-08-06T00:00:00Z"
        }),
        requestedLots: [{ lotId, amountMinor }],
        operationId: `${collectionId}-operation`,
        sourceKey: { kind: "chargeback", sourceId: collectionId, operation: "recovery_collected" },
        occurredAt: "2026-08-06T00:00:00Z",
        outputLotIds: [{ sourceLotId: lotId, remainderLotId }]
      });
    const first = collect(
      restricted.state,
      "lot-order-recovery-available",
      500,
      "recovery-collection-1",
      "recovery-collection-remainder-1"
    );
    const second = collect(
      first.state,
      "recovery-collection-remainder-1",
      300,
      "recovery-collection-2",
      "recovery-collection-remainder-2"
    );
    expect(second.historyRecord).toMatchObject({
      kind: "chargeback_recovery_collected",
      chargebackAllocations: [
        {
          sourceLotId: "recovery-collection-remainder-1",
          originalBucket: "available",
          allocatedAmountMinor: 300
        }
      ]
    });
    expectLotError(
      () =>
        collect(
          second.state,
          "recovery-collection-remainder-2",
          100,
          "recovery-collection-1",
          "recovery-collection-replay-remainder"
        ),
      "duplicate_operation_source"
    );

    const won = restoreChargebackWonReservedPayableLots({
      state: second.state,
      expectedVersion: second.nextVersion,
      authority: createChargebackWonAuthority({
        kind: "chargeback_won",
        authorityId: "chargeback-recovery-won-authority",
        version: 1,
        chargebackCaseId: "chargeback-recovery",
        restoredPayableAmount: { amountMinor: 600, currency: "RUB" },
        suspenseClearedAmount: { amountMinor: 4_400, currency: "RUB" },
        accountingAllocationId: "chargeback-recovery-win-allocation",
        accountingAllocationVersion: 1,
        allocationStatus: "approved",
        canonicalEvidenceId: "chargeback-recovery-won-evidence",
        wonAt: "2026-08-10T00:00:00Z"
      }),
      requestedLots: [
        { lotId: "lot-order-recovery-available", amountMinor: 400 },
        { lotId: "recovery-collection-remainder-1", amountMinor: 200 }
      ],
      operationId: "chargeback-recovery-won",
      sourceKey: { kind: "chargeback", sourceId: "chargeback-recovery", operation: "won" },
      occurredAt: "2026-08-10T00:00:00Z",
      outputLotIds: [
        { sourceLotId: "lot-order-recovery-available", targetLotId: "recovery-won-reserved-1" },
        {
          sourceLotId: "recovery-collection-remainder-1",
          targetLotId: "recovery-won-reserved-2"
        }
      ]
    });
    expect(won.createdLots.map((lot) => lot.amount.amountMinor)).toEqual([400, 200]);
  });

  it("collects an approved recovery from future earnings after closed_lost", () => {
    const base = chargebackRestrictedState();
    const lost = recordChargebackLostRestrictionOutcome({
      state: base.restricted.state,
      expectedVersion: base.restricted.nextVersion,
      authority: createChargebackLostAuthority({
        kind: "chargeback_lost",
        authorityId: "chargeback-lost-before-recovery-authority",
        version: 1,
        chargebackCaseId: "chargeback-1",
        unallocatedSuspense: { amountMinor: 0, currency: "RUB" },
        accountingAllocationId: "chargeback-lost-before-recovery-allocation",
        accountingAllocationVersion: 1,
        allocationStatus: "approved",
        canonicalEvidenceId: "chargeback-lost-before-recovery-evidence",
        lostAt: "2026-08-10T00:00:00Z"
      }),
      operationId: "chargeback-lost-before-recovery",
      operationKey: {
        kind: "chargeback_restriction",
        restrictionId: "chargeback-restriction-1",
        operation: "lost_final"
      },
      occurredAt: "2026-08-10T00:00:00Z"
    });
    const futureEarnings = releasedState("order-recovery-after-loss", lost.state, {
      capturedAt: "2026-08-11T09:00:00Z",
      bookingCompletedAt: "2026-08-11T10:00:00Z",
      settlementMatchedAt: "2026-08-12T00:00:00Z",
      integrityEvaluatedAt: "2026-08-13T10:00:00Z",
      releasedAt: "2026-08-13T10:00:00Z"
    });
    const collected = collectChargebackRecoveryPayableLots({
      state: futureEarnings.state,
      expectedVersion: futureEarnings.nextVersion,
      authority: createChargebackRecoveryCollectionAuthority({
        kind: "chargeback_recovery_collection",
        authorityId: "post-loss-recovery-authority",
        version: 1,
        recoveryCollectionId: "post-loss-recovery-collection",
        chargebackCaseId: "chargeback-1",
        astrologerUserId: "astrologer-1",
        collectionSource: {
          kind: "future_payable",
          sourceOrderId: "order-recovery-after-loss"
        },
        collectedPayableAmount: { amountMinor: 500, currency: "RUB" },
        accountingAllocationId: "post-loss-recovery-accounting-allocation",
        accountingAllocationVersion: 1,
        allocationStatus: "approved",
        canonicalEvidenceId: "post-loss-recovery-evidence",
        collectedAt: "2026-08-14T00:00:00Z"
      }),
      requestedLots: [{ lotId: "lot-order-recovery-after-loss-available", amountMinor: 500 }],
      operationId: "post-loss-recovery-collected",
      sourceKey: {
        kind: "chargeback",
        sourceId: "post-loss-recovery-collection",
        operation: "recovery_collected"
      },
      occurredAt: "2026-08-14T00:00:00Z",
      outputLotIds: [
        {
          sourceLotId: "lot-order-recovery-after-loss-available",
          remainderLotId: "post-loss-recovery-remainder"
        }
      ]
    });
    expect(collected.historyRecord.kind).toBe("chargeback_recovery_collected");
  });

  it("rejects a stale recovery collection after closed_won", () => {
    const base = chargebackRestrictedState();
    const won = restoreChargebackWonReservedPayableLots({
      state: base.restricted.state,
      expectedVersion: base.restricted.nextVersion,
      authority: createChargebackWonAuthority({
        kind: "chargeback_won",
        authorityId: "chargeback-won-before-stale-recovery-authority",
        version: 1,
        chargebackCaseId: "chargeback-1",
        restoredPayableAmount: { amountMinor: 0, currency: "RUB" },
        suspenseClearedAmount: { amountMinor: 5_000, currency: "RUB" },
        accountingAllocationId: "chargeback-won-before-stale-recovery-allocation",
        accountingAllocationVersion: 1,
        allocationStatus: "approved",
        canonicalEvidenceId: "chargeback-won-before-stale-recovery-evidence",
        wonAt: "2026-08-10T00:00:00Z"
      }),
      requestedLots: [],
      operationId: "chargeback-won-before-stale-recovery",
      sourceKey: { kind: "chargeback", sourceId: "chargeback-1", operation: "won" },
      occurredAt: "2026-08-10T00:00:00Z",
      outputLotIds: []
    });
    const futureEarnings = releasedState("order-recovery-after-win", won.state, {
      capturedAt: "2026-08-11T09:00:00Z",
      bookingCompletedAt: "2026-08-11T10:00:00Z",
      settlementMatchedAt: "2026-08-12T00:00:00Z",
      integrityEvaluatedAt: "2026-08-13T10:00:00Z",
      releasedAt: "2026-08-13T10:00:00Z"
    });
    expectLotError(
      () =>
        collectChargebackRecoveryPayableLots({
          state: futureEarnings.state,
          expectedVersion: futureEarnings.nextVersion,
          authority: createChargebackRecoveryCollectionAuthority({
            kind: "chargeback_recovery_collection",
            authorityId: "stale-post-win-recovery-authority",
            version: 1,
            recoveryCollectionId: "stale-post-win-recovery",
            chargebackCaseId: "chargeback-1",
            astrologerUserId: "astrologer-1",
            collectionSource: {
              kind: "future_payable",
              sourceOrderId: "order-recovery-after-win"
            },
            collectedPayableAmount: { amountMinor: 500, currency: "RUB" },
            accountingAllocationId: "stale-post-win-recovery-allocation",
            accountingAllocationVersion: 1,
            allocationStatus: "approved",
            canonicalEvidenceId: "stale-post-win-recovery-evidence",
            collectedAt: "2026-08-14T00:00:00Z"
          }),
          requestedLots: [{ lotId: "lot-order-recovery-after-win-available", amountMinor: 500 }],
          operationId: "stale-post-win-recovery-collected",
          sourceKey: {
            kind: "chargeback",
            sourceId: "stale-post-win-recovery",
            operation: "recovery_collected"
          },
          occurredAt: "2026-08-14T00:00:00Z",
          outputLotIds: [
            {
              sourceLotId: "lot-order-recovery-after-win-available",
              remainderLotId: "stale-post-win-recovery-remainder"
            }
          ]
        }),
      "release_blocked"
    );
  });

  it("restores a won astrologer allocation only as bounded new reserved descendants", () => {
    const base = chargebackRestrictedState();
    const allocationAuthority = createChargebackPrincipalAllocationAuthority({
      kind: "chargeback_principal_allocation",
      authorityId: "chargeback-principal-authority-win",
      version: 1,
      chargebackCaseId: "chargeback-1",
      orderId: "order-chargeback",
      astrologerUserId: "astrologer-1",
      payableAmount: { amountMinor: 2_000, currency: "RUB" },
      accountingAllocationId: "chargeback-accounting-allocation-win",
      accountingAllocationRevisionId: "chargeback-accounting-allocation-win-revision-1",
      accountingAllocationVersion: 1,
      allocationStatus: "approved",
      confirmedBasis: chargebackPrincipalConfirmedBasis(base.restricted.state, "chargeback-1")
    });
    const allocated = allocateChargebackPrincipalPayableLots({
      state: base.restricted.state,
      expectedVersion: base.restricted.nextVersion,
      authority: allocationAuthority,
      requestedLots: [{ lotId: "lot-order-chargeback-available", amountMinor: 2_000 }],
      operationId: "chargeback-principal-for-win",
      sourceKey: {
        kind: "chargeback",
        sourceId: "chargeback-accounting-allocation-win-revision-1",
        operation: "principal_allocated"
      },
      occurredAt: "2026-08-04T01:00:00Z",
      outputLotIds: [
        {
          sourceLotId: "lot-order-chargeback-available",
          remainderLotId: "lot-order-chargeback-available-after-win-allocation"
        }
      ]
    });
    const wonAuthority = createChargebackWonAuthority({
      kind: "chargeback_won",
      authorityId: "chargeback-won-authority-1",
      version: 1,
      chargebackCaseId: "chargeback-1",
      restoredPayableAmount: { amountMinor: 1_500, currency: "RUB" },
      suspenseClearedAmount: { amountMinor: 500, currency: "RUB" },
      accountingAllocationId: "chargeback-win-accounting-allocation-1",
      accountingAllocationVersion: 1,
      allocationStatus: "approved",
      canonicalEvidenceId: "chargeback-won-evidence-1",
      wonAt: "2026-08-10T00:00:00Z"
    });
    const won = restoreChargebackWonReservedPayableLots({
      state: allocated.state,
      expectedVersion: allocated.nextVersion,
      authority: wonAuthority,
      requestedLots: [{ lotId: "lot-order-chargeback-available", amountMinor: 1_500 }],
      operationId: "chargeback-won-1",
      sourceKey: { kind: "chargeback", sourceId: "chargeback-1", operation: "won" },
      occurredAt: "2026-08-10T00:00:00Z",
      outputLotIds: [
        { sourceLotId: "lot-order-chargeback-available", targetLotId: "chargeback-won-reserved" }
      ]
    });
    expect(won.createdLots).toEqual([
      expect.objectContaining({
        lotId: "chargeback-won-reserved",
        parentLotId: "lot-order-chargeback-available",
        bucket: "reserved",
        amount: { amountMinor: 1_500, currency: "RUB" }
      })
    ]);
    expect(won.state.chargebackRestrictions[0]).toMatchObject({ status: "closed_won" });
    expectLotError(
      () =>
        restoreChargebackWonReservedPayableLots({
          state: won.state,
          expectedVersion: won.nextVersion,
          authority: wonAuthority,
          requestedLots: [{ lotId: "lot-order-chargeback-available", amountMinor: 1_500 }],
          operationId: "chargeback-won-replay",
          sourceKey: { kind: "chargeback", sourceId: "chargeback-1", operation: "won" },
          occurredAt: "2026-08-10T00:00:00Z",
          outputLotIds: [
            { sourceLotId: "lot-order-chargeback-available", targetLotId: "chargeback-won-again" }
          ]
        }),
      "duplicate_operation_source"
    );
  });

  it("closes an authoritative win that clears suspense without restoring a payable lot", () => {
    const base = chargebackRestrictedState();
    const won = restoreChargebackWonReservedPayableLots({
      state: base.restricted.state,
      expectedVersion: base.restricted.nextVersion,
      authority: createChargebackWonAuthority({
        kind: "chargeback_won",
        authorityId: "chargeback-won-zero-payable-authority",
        version: 1,
        chargebackCaseId: "chargeback-1",
        restoredPayableAmount: { amountMinor: 0, currency: "RUB" },
        suspenseClearedAmount: { amountMinor: 5_000, currency: "RUB" },
        accountingAllocationId: "chargeback-win-zero-payable-allocation",
        accountingAllocationVersion: 1,
        allocationStatus: "approved",
        canonicalEvidenceId: "chargeback-won-zero-payable-evidence",
        wonAt: "2026-08-10T00:00:00Z"
      }),
      requestedLots: [],
      operationId: "chargeback-won-zero-payable",
      sourceKey: { kind: "chargeback", sourceId: "chargeback-1", operation: "won" },
      occurredAt: "2026-08-10T00:00:00Z",
      outputLotIds: []
    });
    expect(won.createdLots).toEqual([]);
    expect(won.state.chargebackRestrictions[0]).toMatchObject({
      status: "closed_won",
      closedAt: "2026-08-10T00:00:00Z"
    });
  });

  it("closes a lost restriction with zero suspense without a monetary lot edge", () => {
    const base = chargebackRestrictedState();
    const historyLength = base.restricted.state.history.length;
    const lost = recordChargebackLostRestrictionOutcome({
      state: base.restricted.state,
      expectedVersion: base.restricted.nextVersion,
      authority: createChargebackLostAuthority({
        kind: "chargeback_lost",
        authorityId: "chargeback-lost-zero-authority",
        version: 1,
        chargebackCaseId: "chargeback-1",
        unallocatedSuspense: { amountMinor: 0, currency: "RUB" },
        accountingAllocationId: "chargeback-lost-zero-allocation",
        accountingAllocationVersion: 1,
        allocationStatus: "approved",
        canonicalEvidenceId: "chargeback-lost-zero-evidence",
        lostAt: "2026-08-10T00:00:00Z"
      }),
      operationId: "chargeback-lost-zero",
      operationKey: {
        kind: "chargeback_restriction",
        restrictionId: "chargeback-restriction-1",
        operation: "lost_final"
      },
      occurredAt: "2026-08-10T00:00:00Z"
    });
    expect(lost).toMatchObject({ kind: "chargeback_lost_closed" });
    expect(lost.state.history).toHaveLength(historyLength);
    expect(lost.state.restrictionHistory).toHaveLength(1);
    expect(lost.state.chargebackRestrictions[0]).toMatchObject({ status: "closed_lost" });
    expect(
      selectPayoutPayableLots({
        state: lost.state,
        expectedVersion: lost.nextVersion,
        astrologerUserId: "astrologer-1",
        amount: { amountMinor: 1, currency: "RUB" }
      }).allocations
    ).toHaveLength(1);
  });

  it("keeps nonzero-suspense loss blocked until later allocation and a distinct zero-suspense close", () => {
    const base = chargebackRestrictedState();
    const blocked = recordChargebackLostRestrictionOutcome({
      state: base.restricted.state,
      expectedVersion: base.restricted.nextVersion,
      authority: createChargebackLostAuthority({
        kind: "chargeback_lost",
        authorityId: "chargeback-lost-blocked-authority",
        version: 1,
        chargebackCaseId: "chargeback-1",
        unallocatedSuspense: { amountMinor: 500, currency: "RUB" },
        accountingAllocationId: "chargeback-lost-blocked-allocation",
        accountingAllocationVersion: 1,
        allocationStatus: "approved",
        canonicalEvidenceId: "chargeback-lost-blocked-evidence",
        lostAt: "2026-08-10T00:00:00Z"
      }),
      operationId: "chargeback-lost-blocked",
      operationKey: {
        kind: "chargeback_restriction",
        restrictionId: "chargeback-restriction-1",
        operation: "lost_final"
      },
      occurredAt: "2026-08-10T00:00:00Z"
    });
    expect(blocked.state.chargebackRestrictions[0]).toMatchObject({
      status: "allocation_blocked",
      closedAt: null
    });
    expectLotError(
      () =>
        selectPayoutPayableLots({
          state: blocked.state,
          expectedVersion: blocked.nextVersion,
          astrologerUserId: "astrologer-1",
          amount: { amountMinor: 1, currency: "RUB" }
        }),
      "insufficient_lot_funds"
    );
    const allocated = allocateChargebackPrincipalPayableLots({
      state: blocked.state,
      expectedVersion: blocked.nextVersion,
      authority: createChargebackPrincipalAllocationAuthority({
        kind: "chargeback_principal_allocation",
        authorityId: "chargeback-lost-later-allocation-authority",
        version: 1,
        chargebackCaseId: "chargeback-1",
        orderId: "order-chargeback",
        astrologerUserId: "astrologer-1",
        payableAmount: { amountMinor: 500, currency: "RUB" },
        accountingAllocationId: "chargeback-lost-later-allocation",
        accountingAllocationRevisionId: "chargeback-lost-later-allocation-revision-1",
        accountingAllocationVersion: 1,
        allocationStatus: "approved",
        confirmedBasis: chargebackPrincipalConfirmedBasis(blocked.state, "chargeback-1")
      }),
      requestedLots: [{ lotId: "lot-order-chargeback-available", amountMinor: 500 }],
      operationId: "chargeback-lost-later-allocation",
      sourceKey: {
        kind: "chargeback",
        sourceId: "chargeback-lost-later-allocation-revision-1",
        operation: "principal_allocated"
      },
      occurredAt: "2026-08-11T00:00:00Z",
      outputLotIds: [
        {
          sourceLotId: "lot-order-chargeback-available",
          remainderLotId: "chargeback-lost-later-available-remainder"
        }
      ]
    });
    const closed = recordChargebackLostRestrictionOutcome({
      state: allocated.state,
      expectedVersion: allocated.nextVersion,
      authority: createChargebackLostAuthority({
        kind: "chargeback_lost",
        authorityId: "chargeback-lost-allocation-closed-authority",
        version: 2,
        chargebackCaseId: "chargeback-1",
        unallocatedSuspense: { amountMinor: 0, currency: "RUB" },
        accountingAllocationId: "chargeback-lost-closed-allocation",
        accountingAllocationVersion: 2,
        allocationStatus: "approved",
        canonicalEvidenceId: "chargeback-lost-allocation-closed-evidence",
        lostAt: "2026-08-12T00:00:00Z"
      }),
      operationId: "chargeback-lost-allocation-closed",
      operationKey: {
        kind: "chargeback_restriction",
        restrictionId: "chargeback-restriction-1",
        operation: "lost_allocation_closed"
      },
      occurredAt: "2026-08-12T00:00:00Z"
    });
    expect(closed).toMatchObject({ kind: "chargeback_lost_allocation_closed" });
    expect(closed.state.chargebackRestrictions[0]).toMatchObject({ status: "closed_lost" });
    expectLotError(
      () =>
        recordChargebackLostRestrictionOutcome({
          state: closed.state,
          expectedVersion: closed.nextVersion,
          authority: createChargebackLostAuthority({
            kind: "chargeback_lost",
            authorityId: "chargeback-lost-allocation-close-replay-authority",
            version: 3,
            chargebackCaseId: "chargeback-1",
            unallocatedSuspense: { amountMinor: 0, currency: "RUB" },
            accountingAllocationId: "chargeback-lost-close-replay-allocation",
            accountingAllocationVersion: 3,
            allocationStatus: "approved",
            canonicalEvidenceId: "chargeback-lost-allocation-close-replay-evidence",
            lostAt: "2026-08-13T00:00:00Z"
          }),
          operationId: "chargeback-lost-allocation-close-replay",
          operationKey: {
            kind: "chargeback_restriction",
            restrictionId: "chargeback-restriction-1",
            operation: "lost_allocation_closed"
          },
          occurredAt: "2026-08-13T00:00:00Z"
        }),
      "duplicate_operation_source"
    );
  });
});
