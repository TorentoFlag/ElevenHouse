import { describe, expect, it } from "vitest";
import { digestValue } from "./source-lot-operation-receipt-core";
import {
  allocateChargebackPrincipalPayableLots,
  confirmChargebackRestriction,
  createChargebackConfirmedAuthority,
  createChargebackPrincipalAllocationAuthority,
  rebuildPayableLotReferenceState,
  type PayableLotReferenceState
} from "./source-lots";
import {
  createPayableLotOperationReceipt,
  rebuildPayableLotOperationReceipt,
  rehydratePayableLotOperationReceipt
} from "./source-lot-operation-receipt";
import {
  chargebackRestrictedState,
  expectLotError,
  mutableClone
} from "./source-lot-reference-test-fixtures";

const receiptEnvelope = Object.freeze({
  maxAuthorityRefs: 8,
  maxEffects: 16,
  maxLineage: 32,
  maxComponentSlots: 16,
  maxDecimalDigits: 8
});

describe("chargeback principal confirmed basis", () => {
  it("allocates and roundtrips only with the latest cumulative confirmation basis", () => {
    const fixture = updatedRestrictionFixture();
    const allocated = allocate(fixture.updated.state, fixture.validBasis);

    expect(allocated.historyRecord.authority).toMatchObject({
      kind: "chargeback_principal_allocation",
      confirmedBasis: {
        restrictionVersion: 2,
        confirmationAuthorityId: "chargeback-basis-confirmed-authority-2",
        confirmationId: "chargeback-basis-confirmation-2",
        cumulativeDisputedAmount: { amountMinor: 6_000, currency: "RUB" }
      }
    });
    expect(rebuildPayableLotReferenceState(structuredClone(allocated.state))).toEqual(
      allocated.state
    );
    const receipt = createPayableLotOperationReceipt(allocated);
    expect(rehydratePayableLotOperationReceipt(structuredClone(receipt), receiptEnvelope)).toEqual(
      receipt
    );
    expect(
      rebuildPayableLotOperationReceipt({
        previousState: fixture.updated.state,
        transition: allocated
      })
    ).toEqual(receipt);

    const forged = mutableClone(allocated.state);
    const record = forged.history.find(
      (candidate) => candidate.kind === "chargeback_principal_allocated"
    );
    if (record?.authority?.kind !== "chargeback_principal_allocation") {
      throw new Error("missing principal allocation fixture");
    }
    record.authority.confirmedBasis.restrictionVersion = 1;
    expectLotError(() => rebuildPayableLotReferenceState(forged), "lineage_invalid");
  });

  it("rejects the complete prior confirmation basis after cumulative B advances", () => {
    const fixture = updatedRestrictionFixture();
    expectLotError(() => allocate(fixture.updated.state, fixture.staleBasis), "selection_mismatch");
  });

  it.each([
    ["restriction id", { restrictionId: "another-restriction" }],
    ["restriction version", { restrictionVersion: 1 }],
    ["confirmation authority", { confirmationAuthorityId: "another-confirmation-authority" }],
    ["confirmation authority version", { confirmationAuthorityVersion: 1 }],
    ["confirmation id", { confirmationId: "another-confirmation" }],
    ["confirmation digest", { confirmationAuthorityDigest: `sha256:${"0".repeat(64)}` }],
    ["canonical evidence", { canonicalEvidenceId: "another-evidence" }],
    [
      "provider series",
      {
        providerAccount: {
          seriesId: "another-series",
          providerAccountId: "arc-account-live",
          identityVersion: 1
        }
      }
    ],
    [
      "provider identity version",
      {
        providerAccount: {
          seriesId: "arc-series-live",
          providerAccountId: "arc-account-live",
          identityVersion: 2
        }
      }
    ],
    ["provider payment", { providerPaymentId: "another-provider-payment" }],
    ["cumulative B", { cumulativeDisputedAmount: { amountMinor: 5_000, currency: "RUB" } }],
    ["confirmed instant", { confirmedAt: "2026-08-04T00:00:00Z" }]
  ] as const)("rejects drift in latest %s", (_label, drift) => {
    const fixture = updatedRestrictionFixture();
    expectLotError(
      () => allocate(fixture.updated.state, { ...fixture.validBasis, ...drift }),
      "selection_mismatch"
    );
  });
});

function updatedRestrictionFixture() {
  const base = chargebackRestrictedState();
  const updateAuthority = createChargebackConfirmedAuthority({
    kind: "chargeback_confirmed",
    authorityId: "chargeback-basis-confirmed-authority-2",
    version: 2,
    confirmationId: "chargeback-basis-confirmation-2",
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
    canonicalEvidenceId: "chargeback-basis-confirmed-evidence-2",
    confirmedAt: "2026-08-05T00:00:00Z"
  });
  const updated = confirmChargebackRestriction({
    state: base.restricted.state,
    expectedVersion: base.restricted.nextVersion,
    authority: updateAuthority,
    operationId: "chargeback-basis-confirmed-operation-2",
    sourceKey: {
      kind: "chargeback",
      sourceId: updateAuthority.confirmationId,
      operation: "confirmed"
    },
    occurredAt: updateAuthority.confirmedAt
  });
  return {
    updated,
    validBasis: basis(updateAuthority, 2),
    staleBasis: basis(base.authority, 1)
  };
}

function basis(
  authority: ReturnType<typeof createChargebackConfirmedAuthority>,
  restrictionVersion: number
) {
  return Object.freeze({
    restrictionId: authority.restrictionId,
    restrictionVersion,
    confirmationAuthorityId: authority.authorityId,
    confirmationAuthorityVersion: authority.version,
    confirmationId: authority.confirmationId,
    confirmationAuthorityDigest: digestValue(authority),
    canonicalEvidenceId: authority.canonicalEvidenceId,
    providerAccount: authority.providerAccount,
    providerPaymentId: authority.providerPaymentId,
    cumulativeDisputedAmount: authority.nextCumulativeDisputedAmount,
    confirmedAt: authority.confirmedAt
  });
}

function allocate(state: PayableLotReferenceState, confirmedBasis: ReturnType<typeof basis>) {
  return allocateChargebackPrincipalPayableLots({
    state,
    expectedVersion: state.version,
    authority: createChargebackPrincipalAllocationAuthority({
      kind: "chargeback_principal_allocation",
      authorityId: "chargeback-basis-principal-authority",
      version: 1,
      chargebackCaseId: "chargeback-1",
      orderId: "order-chargeback",
      astrologerUserId: "astrologer-1",
      payableAmount: { amountMinor: 500, currency: "RUB" },
      accountingAllocationId: "chargeback-basis-allocation",
      accountingAllocationRevisionId: "chargeback-basis-allocation-revision-1",
      accountingAllocationVersion: 1,
      allocationStatus: "approved",
      confirmedBasis
    }),
    requestedLots: [{ lotId: "lot-order-chargeback-available", amountMinor: 500 }],
    operationId: "chargeback-basis-principal-operation",
    sourceKey: {
      kind: "chargeback",
      sourceId: "chargeback-basis-allocation-revision-1",
      operation: "principal_allocated"
    },
    occurredAt: "2026-08-05T01:00:00Z",
    outputLotIds: [
      {
        sourceLotId: "lot-order-chargeback-available",
        remainderLotId: "chargeback-basis-available-remainder"
      }
    ]
  });
}
