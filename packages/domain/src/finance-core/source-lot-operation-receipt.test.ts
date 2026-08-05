import { describe, expect, it } from "vitest";
import {
  PayableSourceLotIntegrityError,
  allocateChargebackPrincipalPayableLots,
  approveRefundWithoutPayableLots,
  confirmRefundPayableLots,
  createChargebackPrincipalAllocationAuthority,
  createChargebackWonAuthority,
  createEmptyPayableLotReferenceState,
  createRefundApprovalAuthority,
  createRefundConfirmedAuthority,
  restoreChargebackWonReservedPayableLots
} from "./source-lots";
import { capturedState } from "./source-lot-sale-hold-test-fixtures";
import { buildReceiptTransitionCases } from "./source-lot-operation-receipt-test-fixtures";
import {
  chargebackPrincipalConfirmedBasis,
  chargebackRestrictedState,
  releasedState
} from "./source-lot-reference-test-fixtures";
import {
  createPayableLotOperationReceipt,
  normalizePayableLotReceiptDecoderEnvelope,
  rehydratePayableLotOperationReceipt,
  rebuildPayableLotOperationReceipt
} from "./source-lot-operation-receipt";

const receiptDecoderEnvelope = Object.freeze({
  maxAuthorityRefs: 8,
  maxEffects: 16,
  maxLineage: 32,
  maxComponentSlots: 16,
  maxDecimalDigits: 8
});

describe("payable-lot operation receipt", () => {
  it("derives a sale-capture credit without accepting caller-supplied accounting edges", () => {
    const previousState = createEmptyPayableLotReferenceState({
      astrologerUserId: "astrologer-1",
      currency: "RUB"
    });
    const { transition } = capturedState(
      "order-receipt-sale",
      "intent-order-receipt-sale",
      previousState
    );

    const receipt = createPayableLotOperationReceipt(transition);

    expect(receipt).toMatchObject({
      kind: "payable_lot_operation_receipt",
      schemaVersion: 1,
      receiptId: transition.operationId,
      operationId: transition.operationId,
      operationKind: "sale_capture",
      integrityStatus: "unverified",
      previousLotState: {
        version: "1",
        digest: previousState.stateDigest
      },
      nextLotState: {
        version: "2",
        digest: transition.nextStateDigest
      },
      effects: [
        {
          bucket: "pending",
          side: "credit",
          amount: { amountMinor: 9_600, currency: "RUB" },
          knownLinks: {
            originalSaleId: "order-receipt-sale",
            rootLotId: "lot-order-receipt-sale",
            payableLotId: "lot-order-receipt-sale",
            payoutAllocationId: null
          }
        }
      ]
    });
    expect(receipt.authorityRefs).toEqual([
      expect.objectContaining({
        kind: "canonical_capture",
        evidenceId: "capture-evidence-order-receipt-sale",
        intentVersion: "3"
      })
    ]);
    expect(receipt.effects.every((effect) => !("componentId" in effect))).toBe(true);
    expect(receipt.requiredExternalLinkSlots.every((slot) => !("componentId" in slot))).toBe(true);
    expect(Object.isFrozen(receipt)).toBe(true);
    expect(Object.isFrozen(receipt.effects[0])).toBe(true);

    expect(rebuildPayableLotOperationReceipt({ previousState, transition })).toEqual(receipt);
  });

  const transitionCases = buildReceiptTransitionCases();

  it.each(transitionCases)(
    "projects exact payable effects and rebuild parity for $kind",
    ({ previousState, transition, expectedEffects }) => {
      const bounded = createPayableLotOperationReceipt(transition);
      const rebuilt = rebuildPayableLotOperationReceipt({ previousState, transition });

      expect(bounded.operationKind).toBe(transition.kind);
      expect(bounded.effects).toEqual(
        expectedEffects.map((expected) =>
          expect.objectContaining({
            side: expected.side,
            bucket: expected.bucket,
            amount: { amountMinor: expected.amountMinor, currency: "RUB" }
          })
        )
      );
      expect(rebuilt).toEqual(bounded);
      expect(bounded.effects).toHaveLength(bounded.requiredExternalLinkSlots.length);
      expect(
        bounded.effects.every(
          (effect, index) =>
            effect.effectId === `${bounded.operationId}:effect:${index + 1}` &&
            effect.lotAllocationId === `${bounded.operationId}:lot-allocation:${index + 1}` &&
            effect.componentSlotId === bounded.requiredExternalLinkSlots[index]?.slotId &&
            effect.effectId === bounded.requiredExternalLinkSlots[index]?.effectId
        )
      ).toBe(true);
      expect(new Set(bounded.effects.map((effect) => effect.lotAllocationId)).size).toBe(
        bounded.effects.length
      );
      expect(
        rehydratePayableLotOperationReceipt(structuredClone(bounded), receiptDecoderEnvelope)
      ).toEqual(bounded);
      expect(Object.isFrozen(bounded.lineage)).toBe(true);
      expect(Object.isFrozen(bounded.authorityRefs)).toBe(true);
    }
  );

  it("does not emit an economic edge for a same-bucket structural remainder", () => {
    const payoutRequested = transitionCases.find(({ kind }) => kind === "payout_requested");
    if (!payoutRequested) throw new Error("missing payout-requested fixture");

    const receipt = createPayableLotOperationReceipt(payoutRequested.transition);
    const remainder = receipt.lineage.find(
      (entry) =>
        entry.relation === "created" && entry.lotId === "receipt-payout-available-remainder"
    );

    expect(remainder).toMatchObject({ economicEffectId: null, bucket: "available" });
    expect(
      receipt.effects.some(
        (effect) => effect.knownLinks.payableLotId === "receipt-payout-available-remainder"
      )
    ).toBe(false);
    expect(
      receipt.effects
        .filter((effect) =>
          ["lot-order-receipt-payout-available", "receipt-payout-from-available"].includes(
            effect.knownLinks.payableLotId
          )
        )
        .map((effect) => effect.knownLinks.payoutAllocationId)
    ).toEqual(["receipt-payout-allocation-available", "receipt-payout-allocation-available"]);
    expect(
      receipt.effects
        .filter((effect) =>
          ["receipt-reserve-available", "receipt-payout-from-reserve"].includes(
            effect.knownLinks.payableLotId
          )
        )
        .map((effect) => effect.knownLinks.payoutAllocationId)
    ).toEqual(["receipt-payout-allocation-reserve", "receipt-payout-allocation-reserve"]);
  });

  it("keeps chargeback principal, recovery collection, and won effects distinct", () => {
    const receipts = new Map(
      transitionCases
        .filter(({ kind }) => kind.startsWith("chargeback_"))
        .map(({ kind, transition }) => [kind, createPayableLotOperationReceipt(transition)])
    );

    expect(receipts.get("chargeback_confirmed")?.effects).toEqual([]);
    expect(receipts.get("chargeback_principal_allocated")?.effects).toEqual([
      expect.objectContaining({ side: "debit", bucket: "available" })
    ]);
    expect(receipts.get("chargeback_recovery_collected")?.effects).toEqual([
      expect.objectContaining({ side: "debit", bucket: "available" }),
      expect.objectContaining({ side: "credit", bucket: "recovery_receivable" })
    ]);
    expect(receipts.get("chargeback_won_reserved")?.effects).toEqual([
      expect.objectContaining({ side: "credit", bucket: "reserved" })
    ]);
  });

  it("rejects caller-authored receipt edges, authority refs, and component ids", () => {
    const sample = transitionCases[0];
    if (!sample) throw new Error("missing receipt fixture");

    for (const extra of [
      { effects: [] },
      { authorityRefs: [] },
      { componentId: "caller-component" },
      { receiptId: "caller-receipt" }
    ]) {
      expectLotError(
        () => createPayableLotOperationReceipt({ ...sample.transition, ...extra }),
        "invalid_shape"
      );
    }
  });

  it("rejects detached previous state, skipped versions, digest drift, and history drift", () => {
    const sample = transitionCases[0];
    if (!sample) throw new Error("missing receipt fixture");
    const detached = createEmptyPayableLotReferenceState({
      astrologerUserId: "another-astrologer",
      currency: "RUB"
    });
    expectLotError(
      () =>
        rebuildPayableLotOperationReceipt({
          previousState: detached,
          transition: sample.transition
        }),
      "state_digest_mismatch"
    );

    const skipped = mutableClone(sample.transition);
    skipped.nextVersion += 1;
    expectLotError(() => createPayableLotOperationReceipt(skipped), "lineage_invalid");

    const digestDrift = mutableClone(sample.transition);
    digestDrift.nextStateDigest =
      "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    expectLotError(() => createPayableLotOperationReceipt(digestDrift), "lineage_invalid");

    const historyDrift = mutableClone(sample.transition);
    historyDrift.historyRecord.operationId = "detached-operation";
    expectLotError(() => createPayableLotOperationReceipt(historyDrift), "lineage_invalid");
  });

  it("rejects proxy, accessor, and sparse transition evidence", () => {
    const sample = transitionCases[0];
    if (!sample) throw new Error("missing receipt fixture");
    const throwingProxy = new Proxy(sample.transition, {
      ownKeys() {
        throw new Error("hostile proxy");
      }
    });
    expectLotError(() => createPayableLotOperationReceipt(throwingProxy), "invalid_shape");

    const accessor = structuredClone(sample.transition) as Record<string, unknown>;
    Object.defineProperty(accessor, "operationId", {
      enumerable: true,
      get: () => sample.transition.operationId
    });
    expectLotError(() => createPayableLotOperationReceipt(accessor), "invalid_shape");

    const sparse = mutableClone(sample.transition);
    sparse.consumedLots = new Array(1);
    expectLotError(() => createPayableLotOperationReceipt(sparse), "invalid_shape");
  });

  it("keeps the bounded path O(k) and leaves full lifetime-state verification to rebuild", () => {
    const sample = transitionCases.find(({ kind }) => kind === "payout_requested");
    if (!sample) throw new Error("missing payout fixture");
    const expected = createPayableLotOperationReceipt(sample.transition);
    const boundedOnly = mutableClone(sample.transition);
    boundedOnly.state.lots = new Proxy(boundedOnly.state.lots, {
      ownKeys() {
        throw new Error("full lot history was enumerated");
      }
    });

    expect(createPayableLotOperationReceipt(boundedOnly)).toEqual(expected);
    expectLotError(
      () =>
        rebuildPayableLotOperationReceipt({
          previousState: sample.previousState,
          transition: boundedOnly
        }),
      "invalid_shape"
    );
  });

  it("labels every digest as drift-only and never upgrades the receipt to authority", () => {
    const sample = transitionCases[0];
    if (!sample) throw new Error("missing receipt fixture");
    const receipt = createPayableLotOperationReceipt(sample.transition);

    expect(receipt.integrityStatus).toBe("unverified");
    expect(receipt.digestPurpose).toBe("drift_detection_only");
    expect(receipt.historyRecord.digestPurpose).toBe("drift_detection_only");
    expect(receipt.authorityRefs.every((ref) => ref.digestPurpose === "drift_detection_only")).toBe(
      true
    );

    const forgedStatus = structuredClone(receipt) as Record<string, unknown>;
    forgedStatus.integrityStatus = "verified";
    expectLotError(
      () => rehydratePayableLotOperationReceipt(forgedStatus, receiptDecoderEnvelope),
      "invalid_field"
    );
  });

  it("exposes exact hold evidence without inventing a provider evidence version", () => {
    const hold = transitionCases.find(({ kind }) => kind === "hold_release");
    if (!hold) throw new Error("missing hold fixture");
    const receipt = createPayableLotOperationReceipt(hold.transition);

    expect(receipt.authorityRefs).toEqual([
      expect.objectContaining({ kind: "reserve_allocation", decisionVersion: "1" }),
      expect.objectContaining({
        kind: "hold_release_evidence",
        bookingCompletionEvidenceId: "booking-completion-order-receipt-payout",
        bookingContractVersion: "1",
        providerSettlementEvidenceId: "settlement-order-receipt-payout"
      }),
      expect.objectContaining({ kind: "payment_capture_integrity", authorityVersion: "4" }),
      expect.objectContaining({ kind: "release_blocks", snapshotVersion: "1" })
    ]);
    const holdEvidence = receipt.authorityRefs.find((ref) => ref.kind === "hold_release_evidence");
    expect(holdEvidence && "providerSettlementVersion" in holdEvidence).toBe(false);
  });

  it("projects no monetary effects for legitimate zero-payable history transitions", () => {
    const released = releasedState("order-receipt-zero-refund");
    const approved = approveRefundWithoutPayableLots({
      state: released.state,
      expectedVersion: released.nextVersion,
      authority: createRefundApprovalAuthority({
        kind: "refund_approval",
        authorityId: "receipt-zero-refund-approval-authority",
        version: 1,
        refundId: "receipt-zero-refund",
        orderId: "order-receipt-zero-refund",
        astrologerUserId: "astrologer-1",
        payableAmount: { amountMinor: 0, currency: "RUB" },
        accountingAllocationId: "receipt-zero-refund-allocation",
        accountingAllocationVersion: 1,
        fundingStatus: "fully_funded"
      }),
      operationId: "receipt-zero-refund-approved",
      sourceKey: {
        kind: "refund",
        sourceId: "receipt-zero-refund",
        operation: "approved"
      },
      occurredAt: "2026-08-04T00:00:00Z"
    });
    const confirmed = confirmRefundPayableLots({
      state: approved.state,
      expectedVersion: approved.nextVersion,
      refundId: "receipt-zero-refund",
      authority: createRefundConfirmedAuthority({
        kind: "refund_confirmed",
        authorityId: "receipt-zero-refund-confirmed-authority",
        version: 1,
        refundId: "receipt-zero-refund",
        providerAccountId: "arc-account-live",
        providerPaymentId: "provider-payment-order-receipt-zero-refund",
        providerRefundId: "provider-receipt-zero-refund",
        providerAmountBasis: "incremental",
        providerRefundAmount: { amountMinor: 1_000, currency: "RUB" },
        priorProviderTotalRefunded: { amountMinor: 0, currency: "RUB" },
        nextProviderTotalRefunded: { amountMinor: 1_000, currency: "RUB" },
        payableAmount: { amountMinor: 0, currency: "RUB" },
        accountingAllocationId: "receipt-zero-refund-allocation",
        accountingAllocationVersion: 1,
        canonicalEvidenceId: "receipt-zero-refund-confirmed-evidence",
        confirmedAt: "2026-08-05T00:00:00Z"
      }),
      operationId: "receipt-zero-refund-confirmed",
      sourceKey: {
        kind: "refund",
        sourceId: "receipt-zero-refund",
        operation: "confirmed"
      },
      occurredAt: "2026-08-05T00:00:00Z"
    });

    const principalBase = chargebackRestrictedState();
    const zeroPrincipal = allocateChargebackPrincipalPayableLots({
      state: principalBase.restricted.state,
      expectedVersion: principalBase.restricted.nextVersion,
      authority: createChargebackPrincipalAllocationAuthority({
        kind: "chargeback_principal_allocation",
        authorityId: "receipt-zero-principal-authority",
        version: 1,
        chargebackCaseId: "chargeback-1",
        orderId: "order-chargeback",
        astrologerUserId: "astrologer-1",
        payableAmount: { amountMinor: 0, currency: "RUB" },
        accountingAllocationId: "receipt-zero-principal-allocation",
        accountingAllocationRevisionId: "receipt-zero-principal-revision-1",
        accountingAllocationVersion: 1,
        allocationStatus: "approved",
        confirmedBasis: chargebackPrincipalConfirmedBasis(
          principalBase.restricted.state,
          "chargeback-1"
        )
      }),
      requestedLots: [],
      operationId: "receipt-zero-principal",
      sourceKey: {
        kind: "chargeback",
        sourceId: "receipt-zero-principal-revision-1",
        operation: "principal_allocated"
      },
      occurredAt: "2026-08-04T01:00:00Z",
      outputLotIds: []
    });

    const wonBase = chargebackRestrictedState();
    const zeroWon = restoreChargebackWonReservedPayableLots({
      state: wonBase.restricted.state,
      expectedVersion: wonBase.restricted.nextVersion,
      authority: createChargebackWonAuthority({
        kind: "chargeback_won",
        authorityId: "receipt-zero-won-authority",
        version: 1,
        chargebackCaseId: "chargeback-1",
        restoredPayableAmount: { amountMinor: 0, currency: "RUB" },
        suspenseClearedAmount: { amountMinor: 5_000, currency: "RUB" },
        accountingAllocationId: "receipt-zero-won-allocation",
        accountingAllocationVersion: 1,
        allocationStatus: "approved",
        canonicalEvidenceId: "receipt-zero-won-evidence",
        wonAt: "2026-08-10T00:00:00Z"
      }),
      requestedLots: [],
      operationId: "receipt-zero-won",
      sourceKey: { kind: "chargeback", sourceId: "chargeback-1", operation: "won" },
      occurredAt: "2026-08-10T00:00:00Z",
      outputLotIds: []
    });

    for (const { previousState, transition } of [
      { previousState: released.state, transition: approved },
      { previousState: approved.state, transition: confirmed },
      { previousState: principalBase.restricted.state, transition: zeroPrincipal },
      { previousState: wonBase.restricted.state, transition: zeroWon }
    ]) {
      const receipt = createPayableLotOperationReceipt(transition);
      expect(receipt.effects).toEqual([]);
      expect(receipt.requiredExternalLinkSlots).toEqual([]);
      expect(rebuildPayableLotOperationReceipt({ previousState, transition })).toEqual(receipt);
    }
  });

  it("strict rehydration rejects extra fields, drifted digest, and reordered effects", () => {
    const requested = transitionCases.find(({ kind }) => kind === "payout_requested");
    if (!requested) throw new Error("missing payout fixture");
    const receipt = createPayableLotOperationReceipt(requested.transition);

    expectLotError(
      () =>
        rehydratePayableLotOperationReceipt(
          { ...receipt, componentId: "forged" },
          receiptDecoderEnvelope
        ),
      "invalid_shape"
    );
    const drifted = mutableClone(receipt);
    drifted.canonicalDigest =
      "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    expectLotError(
      () => rehydratePayableLotOperationReceipt(drifted, receiptDecoderEnvelope),
      "state_digest_mismatch"
    );

    const reordered = mutableClone(receipt);
    reordered.effects.reverse();
    expectLotError(
      () => rehydratePayableLotOperationReceipt(reordered, receiptDecoderEnvelope),
      "invalid_field"
    );
  });

  it("requires a trusted decoder envelope and checks bounds before array enumeration", () => {
    const sample = transitionCases.find(({ kind }) => kind === "hold_release");
    if (!sample) throw new Error("missing hold fixture");
    const receipt = createPayableLotOperationReceipt(sample.transition);

    expectLotError(() => rehydratePayableLotOperationReceipt(receipt, undefined), "invalid_shape");

    const arrayBounds = [
      ["authorityRefs", "maxAuthorityRefs"],
      ["effects", "maxEffects"],
      ["lineage", "maxLineage"],
      ["requiredExternalLinkSlots", "maxComponentSlots"]
    ] as const;
    for (const [receiptField, envelopeField] of arrayBounds) {
      let enumerated = false;
      const hostile = mutableClone(receipt) as unknown as Record<string, unknown>;
      hostile[receiptField] = new Proxy(new Array(receiptDecoderEnvelope[envelopeField] + 1), {
        ownKeys() {
          enumerated = true;
          throw new Error("unbounded array was enumerated");
        }
      });
      expectLotError(
        () => rehydratePayableLotOperationReceipt(hostile, receiptDecoderEnvelope),
        "invalid_shape"
      );
      expect(enumerated).toBe(false);
    }

    const oversizedVersion = mutableClone(receipt);
    oversizedVersion.previousLotState.version = "9".repeat(
      receiptDecoderEnvelope.maxDecimalDigits + 1
    );
    expectLotError(
      () => rehydratePayableLotOperationReceipt(oversizedVersion, receiptDecoderEnvelope),
      "invalid_field"
    );
  });

  it("normalizes the trusted decoder envelope independently of receipt count", () => {
    expect(normalizePayableLotReceiptDecoderEnvelope(receiptDecoderEnvelope)).toEqual(
      receiptDecoderEnvelope
    );
    expect(Object.isFrozen(normalizePayableLotReceiptDecoderEnvelope(receiptDecoderEnvelope))).toBe(
      true
    );
    expectLotError(() => normalizePayableLotReceiptDecoderEnvelope(undefined), "invalid_shape");
    expectLotError(
      () =>
        normalizePayableLotReceiptDecoderEnvelope({
          ...receiptDecoderEnvelope,
          callerControlledFallback: 1
        }),
      "invalid_shape"
    );
  });
});

function expectLotError(action: () => unknown, reason: string): void {
  try {
    action();
    throw new Error("expected payable source lot error");
  } catch (error) {
    expect(error).toBeInstanceOf(PayableSourceLotIntegrityError);
    expect((error as PayableSourceLotIntegrityError).reason).toBe(reason);
  }
}

type Mutable<T> = T extends readonly (infer Item)[]
  ? Mutable<Item>[]
  : T extends object
    ? { -readonly [Key in keyof T]: Mutable<T[Key]> }
    : T;

function mutableClone<T>(value: T): Mutable<T> {
  return structuredClone(value) as Mutable<T>;
}
