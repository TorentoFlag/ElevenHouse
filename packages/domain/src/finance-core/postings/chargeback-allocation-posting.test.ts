import { describe, expect, it } from "vitest";
import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import {
  buildChargebackPrincipalAllocationPosting,
  FinancePostingIntegrityError
} from "./chargeback-allocation-posting";
import {
  chargebackAllocationPostingFixture,
  rehashChargebackAllocation
} from "./chargeback-allocation-posting-test-fixtures";
import { chargebackAllocationRevisionTwoPostingFixture } from "./chargeback-allocation-revision-test-fixture";
import { receiptDecoderEnvelope } from "./chargeback-confirmed-posting-test-fixtures";
import { rehashChargebackPrincipalPosition } from "./chargeback-principal-position-test-fixtures";
import { postingDecoderEnvelope } from "./posting-test-primitives";

function build(overrides: Record<string, unknown> = {}) {
  return buildChargebackPrincipalAllocationPosting(
    { ...chargebackAllocationPostingFixture(), ...overrides } as never,
    postingDecoderEnvelope,
    receiptDecoderEnvelope
  );
}

function expectPostingError(action: () => unknown, reason: string): void {
  try {
    action();
    throw new Error("expected posting integrity error");
  } catch (error) {
    expect(error).toBeInstanceOf(FinancePostingIntegrityError);
    expect((error as FinancePostingIntegrityError).reason).toBe(reason);
  }
}

function bindPrincipalPosition(
  fixture: ReturnType<typeof chargebackAllocationPostingFixture>,
  principalPositionTransitionBinding: ReturnType<typeof rehashChargebackPrincipalPosition>,
  allocationOverrides: Record<string, unknown>
) {
  const allocationAuthority = rehashChargebackAllocation({
    ...fixture.allocationAuthority,
    ...allocationOverrides,
    positionTransitionRef: {
      kind: principalPositionTransitionBinding.kind,
      bindingId: principalPositionTransitionBinding.bindingId,
      nextPositionVersion: principalPositionTransitionBinding.nextPositionVersion,
      bindingDigest: principalPositionTransitionBinding.bindingDigest
    }
  });
  return { allocationAuthority, principalPositionTransitionBinding };
}

describe("chargeback principal allocation posting", () => {
  it("binds the allocation to the exact current restriction and position snapshot", () => {
    const fixture = chargebackAllocationPostingFixture();
    expect(fixture.principalPositionTransitionBinding.confirmedBasis).toEqual(
      fixture.allocationAuthority.sourceAuthority.confirmedBasis
    );
    expect(fixture.principalPositionTransitionBinding).toMatchObject({
      chargebackCaseId: fixture.allocationAuthority.chargebackCaseId,
      orderId: fixture.allocationAuthority.orderId,
      astrologerUserId: fixture.allocationAuthority.astrologerUserId,
      providerAccountId: fixture.allocationAuthority.arcProviderAccountId,
      accountingAllocationId: fixture.allocationAuthority.sourceAuthority.accountingAllocationId,
      accountingAllocationRevisionId:
        fixture.allocationAuthority.sourceAuthority.accountingAllocationRevisionId,
      accountingAllocationVersion:
        fixture.allocationAuthority.sourceAuthority.accountingAllocationVersion,
      observedAt: fixture.allocationAuthority.approvedAt
    });
    expect(fixture.allocationAuthority.positionTransitionRef).toMatchObject({
      bindingId: fixture.principalPositionTransitionBinding.bindingId,
      nextPositionVersion: fixture.principalPositionTransitionBinding.nextPositionVersion,
      bindingDigest: fixture.principalPositionTransitionBinding.bindingDigest
    });
  });

  it("rejects a stale or foreign principal position snapshot", () => {
    const fixture = chargebackAllocationPostingFixture();
    const principalPositionTransitionBinding = rehashChargebackPrincipalPosition({
      ...fixture.principalPositionTransitionBinding,
      bindingId: "foreign-chargeback-position-transition"
    });
    expectPostingError(() => build({ principalPositionTransitionBinding }), "authority_mismatch");
  });

  it("posts exact H + O + E delta against chargeback suspense", () => {
    const fixture = chargebackAllocationPostingFixture();
    const result = build();
    expect(
      result.transaction.entries.map((entry) => [
        entry.account.code,
        entry.side,
        entry.amount.amountMinor
      ])
    ).toEqual([
      ["astrologer_available", "debit", 2_000],
      ["astrologer_recovery_receivable", "debit", 500],
      ["platform_commission_revenue", "debit", 500],
      ["chargeback_principal_suspense", "credit", 3_000]
    ]);
    expect(result.linkProof.sourceEvidenceRef).toEqual({
      kind: "payable_lot_operation_receipt",
      evidenceId: fixture.allocationOperationReceipt.receiptId,
      canonicalDigest: fixture.allocationOperationReceipt.canonicalDigest
    });
    expect(result.linkProof.edges.filter((edge) => edge.semanticEdgeId !== null)).toHaveLength(1);
    expect(result.transaction.entries[1]?.links).toMatchObject({
      originalSaleId: "order-chargeback",
      payableLotId: "paid-payable-lot-1",
      payoutAllocationId: "payout-allocation-1"
    });
  });

  it("posts only the current delta for allocation revision two", () => {
    const fixture = chargebackAllocationRevisionTwoPostingFixture();
    const result = buildChargebackPrincipalAllocationPosting(
      fixture,
      postingDecoderEnvelope,
      receiptDecoderEnvelope
    );
    expect(
      result.transaction.entries.map((entry) => [
        entry.account.code,
        entry.side,
        entry.amount.amountMinor
      ])
    ).toEqual([
      ["astrologer_reserved", "debit", 100],
      ["chargeback_principal_suspense", "credit", 100]
    ]);
    expect(fixture.allocationAuthority).toMatchObject({
      version: 2,
      principalAllocationDelta: { amountMinor: 100 },
      nextAllocatedPrincipal: { amountMinor: 3_100 },
      unallocatedSuspense: { amountMinor: 1_900 }
    });
  });

  it("cannot splice the allocation and position chains from different prior forks", () => {
    const fixture = chargebackAllocationRevisionTwoPostingFixture();
    const prior = fixture.resolvedPriorPrincipalPositionTransitionBinding;
    if (!prior) throw new Error("missing prior principal position");
    const forkedPrior = rehashChargebackPrincipalPosition({
      ...prior,
      bindingId: "forked-prior-position"
    });
    const current = rehashChargebackPrincipalPosition({
      ...fixture.principalPositionTransitionBinding,
      previousBindingRef: {
        bindingId: forkedPrior.bindingId,
        nextPositionVersion: forkedPrior.nextPositionVersion,
        bindingDigest: forkedPrior.bindingDigest
      }
    });
    const allocationAuthority = rehashChargebackAllocation({
      ...fixture.allocationAuthority,
      positionTransitionRef: {
        kind: current.kind,
        bindingId: current.bindingId,
        nextPositionVersion: current.nextPositionVersion,
        bindingDigest: current.bindingDigest
      }
    });
    expectPostingError(
      () =>
        buildChargebackPrincipalAllocationPosting(
          {
            ...fixture,
            allocationAuthority,
            principalPositionTransitionBinding: current,
            resolvedPriorPrincipalPositionTransitionBinding: forkedPrior
          },
          postingDecoderEnvelope,
          receiptDecoderEnvelope
        ),
      "authority_mismatch"
    );
  });

  it("rejects a foreign or drifted allocation operation receipt", () => {
    const fixture = chargebackAllocationPostingFixture();
    const allocationOperationReceipt = structuredClone(
      fixture.allocationOperationReceipt
    ) as unknown as { sourceKey: { sourceId: string } };
    allocationOperationReceipt.sourceKey.sourceId = "foreign-allocation";
    expectPostingError(
      () => build({ allocationOperationReceipt }),
      "proof_operation_receipt_mismatch"
    );
  });

  it("independently verifies the original platform journal entry", () => {
    const fixture = chargebackAllocationPostingFixture();
    const originalPlatformJournals = structuredClone(
      fixture.originalPlatformJournals
    ) as unknown as { entries: { links: { componentId: string | null } }[] }[];
    const entry = originalPlatformJournals[0]?.entries[1];
    if (!entry) throw new Error("missing original platform entry");
    entry.links.componentId = "another-component";
    const platformAllocation = fixture.allocationAuthority.platformAllocations[0];
    if (!platformAllocation?.originalJournalEntry) {
      throw new Error("missing platform reversal allocation");
    }
    const updatedPlatformAllocation = {
      ...platformAllocation,
      originalJournalEntry: {
        ...platformAllocation.originalJournalEntry,
        canonicalDigest: hashFinanceCommandPayload(entry)
      }
    };
    const platformPosition = fixture.principalPositionTransitionBinding.platformPositions[0];
    if (!platformPosition || platformPosition.kind !== "platform_commission_reversal") {
      throw new Error("missing platform commission position");
    }
    const principalPositionTransitionBinding = rehashChargebackPrincipalPosition({
      ...fixture.principalPositionTransitionBinding,
      platformPositions: [
        {
          ...platformPosition,
          originalJournalEntry: updatedPlatformAllocation.originalJournalEntry
        }
      ]
    });
    const rebound = bindPrincipalPosition(fixture, principalPositionTransitionBinding, {
      platformAllocations: [updatedPlatformAllocation]
    });
    expectPostingError(
      () => build({ ...rebound, originalPlatformJournals }),
      "proof_transaction_mismatch"
    );
  });

  it("cannot expand cumulative commission capacity beyond the original journal entry", () => {
    const fixture = chargebackAllocationPostingFixture();
    const platformPosition = fixture.principalPositionTransitionBinding.platformPositions[0];
    if (!platformPosition || platformPosition.kind !== "platform_commission_reversal") {
      throw new Error("missing platform commission position");
    }
    const principalPositionTransitionBinding = rehashChargebackPrincipalPosition({
      ...fixture.principalPositionTransitionBinding,
      platformPositions: [
        {
          ...platformPosition,
          originalCommissionAmount: { amountMinor: 2_000, currency: "RUB" },
          revenueRemainingBefore: { amountMinor: 2_000, currency: "RUB" },
          revenueRemainingAfter: { amountMinor: 1_500, currency: "RUB" }
        }
      ]
    });
    const rebound = bindPrincipalPosition(fixture, principalPositionTransitionBinding, {});
    expectPostingError(() => build(rebound), "proof_transaction_mismatch");
  });

  it("binds an original platform reversal to the exact order revenue source", () => {
    const fixture = chargebackAllocationPostingFixture();
    const originalPlatformJournals = structuredClone(
      fixture.originalPlatformJournals
    ) as unknown as { sourceKey: { kind: string; sourceId: string; operation: string } }[];
    const transaction = originalPlatformJournals[0];
    if (!transaction) throw new Error("missing original platform transaction");
    transaction.sourceKey = {
      kind: "order",
      sourceId: "foreign-order",
      operation: "commission_earned"
    };
    expectPostingError(() => build({ originalPlatformJournals }), "proof_transaction_mismatch");
  });

  it("rejects an original platform journal recorded after the allocation approval", () => {
    const fixture = chargebackAllocationPostingFixture();
    const originalPlatformJournals = structuredClone(
      fixture.originalPlatformJournals
    ) as unknown as { occurredAt: string; postedAt: string }[];
    const transaction = originalPlatformJournals[0];
    if (!transaction) throw new Error("missing original platform transaction");
    transaction.occurredAt = "2026-08-04T01:00:01Z";
    transaction.postedAt = "2026-08-04T01:00:02Z";
    expectPostingError(() => build({ originalPlatformJournals }), "proof_transaction_mismatch");
  });

  it("posts approved platform loss without inventing an original journal", () => {
    const fixture = chargebackAllocationPostingFixture();
    const prior = fixture.allocationAuthority.platformAllocations[0];
    if (!prior) throw new Error("missing platform allocation");
    const positionId = prior.allocationId;
    const existingDecision =
      fixture.principalPositionTransitionBinding.recoveryPositions[0]?.treatmentDecision;
    if (!existingDecision) throw new Error("missing treatment decision template");
    const treatmentCore = {
      ...existingDecision,
      decisionId: "chargeback-platform-loss-treatment-1",
      version: prior.treatmentAuthorityRef.version,
      positionId,
      treatment: "platform_loss" as const,
      approvedAmount: prior.amount
    };
    Reflect.deleteProperty(treatmentCore, "canonicalDigest");
    const treatmentDecision = Object.freeze({
      ...treatmentCore,
      canonicalDigest: hashFinanceCommandPayload(treatmentCore)
    });
    const loss = {
      ...prior,
      accountCode: "platform_chargeback_loss",
      originalJournalEntry: null,
      treatmentAuthorityRef: {
        kind: "chargeback_platform_loss_treatment",
        authorityId: treatmentDecision.decisionId,
        version: treatmentDecision.version,
        canonicalDigest: treatmentDecision.canonicalDigest
      }
    };
    const platformLossPosition = Object.freeze({
      kind: "platform_loss" as const,
      positionId,
      originalSaleId: prior.originalSaleId,
      componentId: prior.componentId,
      sourceCapacity: prior.amount,
      consumedBefore: { amountMinor: 0, currency: "RUB" as const },
      currentDelta: prior.amount,
      consumedAfter: prior.amount,
      remainingAfter: { amountMinor: 0, currency: "RUB" as const },
      treatmentDecision
    });
    const principalPositionTransitionBinding = rehashChargebackPrincipalPosition({
      ...fixture.principalPositionTransitionBinding,
      platformPositions: [platformLossPosition]
    });
    const rebound = bindPrincipalPosition(fixture, principalPositionTransitionBinding, {
      platformAllocations: [loss]
    });
    const result = build({ ...rebound, originalPlatformJournals: [] });
    expect(result.transaction.entries[2]).toMatchObject({
      account: { code: "platform_chargeback_loss", currency: "RUB" },
      side: "debit",
      amount: { amountMinor: 500, currency: "RUB" }
    });
  });

  it("requires the exact independently resolved previous allocation revision", () => {
    const fixture = chargebackAllocationPostingFixture();
    expectPostingError(
      () => build({ resolvedPriorAllocationAuthority: fixture.allocationAuthority }),
      "authority_mismatch"
    );
  });

  it("requires the journal economic time to equal the allocation receipt time", () => {
    const fixture = chargebackAllocationPostingFixture();
    expectPostingError(
      () =>
        build({
          context: {
            ...fixture.context,
            occurredAt: "2026-08-04T01:00:01Z",
            postedAt: "2026-08-04T01:00:02Z"
          }
        }),
      "proof_operation_receipt_mismatch"
    );
  });

  it.each(["component-astrologer-recovery", "component-chargeback-principal"])(
    "rejects a payable receipt component that collides with %s",
    (componentId) => {
      const fixture = chargebackAllocationPostingFixture();
      const binding = fixture.allocationComponentBindings[0];
      if (!binding) throw new Error("missing allocation component binding");
      const bindingCore: Record<string, unknown> = { ...binding, componentId };
      Reflect.deleteProperty(bindingCore, "bindingDigest");
      const allocationComponentBindings = [
        Object.freeze({
          ...bindingCore,
          bindingDigest: hashFinanceCommandPayload(bindingCore)
        })
      ];
      expectPostingError(() => build({ allocationComponentBindings }), "authority_mismatch");
    }
  );

  it("normalizes the out-of-band posting envelope before hostile input", () => {
    let trapCalls = 0;
    const input = new Proxy(chargebackAllocationPostingFixture(), {
      get(target, property, receiver) {
        trapCalls += 1;
        return Reflect.get(target, property, receiver);
      }
    });
    expectPostingError(
      () =>
        buildChargebackPrincipalAllocationPosting(
          input as never,
          { ...postingDecoderEnvelope, maxAllocations: 0 },
          receiptDecoderEnvelope
        ),
      "decoder_envelope_required"
    );
    expect(trapCalls).toBe(0);
  });
});
