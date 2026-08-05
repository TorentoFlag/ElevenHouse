import { describe, expect, it } from "vitest";
import {
  hashFinanceCommandPayload,
  type FinanceAuthorizationPayloadHash
} from "../../finance-authorization/canonical-command-payload";
import {
  createPayableLotOperationReceipt,
  type PayableLotOperationReceipt
} from "../source-lot-operation-receipt";
import { buildReceiptTransitionCases } from "../source-lot-operation-receipt-test-fixtures";
import { receiptDecoderEnvelope } from "./payable-lot-posting-link-test-fixtures";
import { expectPostingError } from "./posting-test-assertions";
import { postingDecoderEnvelope } from "./posting-test-primitives";
import { projectUnverifiedReceiptLinkedPostingRows } from "./receipt-linked-posting-projection";
import type { UnverifiedFinanceComponentSlotResolutionBinding } from "./posting-types";

describe("receipt-linked posting projection", () => {
  it.each([
    ["sale_capture", [{ code: "astrologer_pending", side: "credit", amountMinor: 9_600 }]],
    [
      "hold_release",
      [
        { code: "astrologer_pending", side: "debit", amountMinor: 9_600 },
        { code: "astrologer_available", side: "credit", amountMinor: 8_640 },
        { code: "astrologer_reserved", side: "credit", amountMinor: 960 }
      ]
    ],
    [
      "payout_requested",
      [
        { code: "astrologer_available", side: "debit", amountMinor: 8_640 },
        { code: "astrologer_available", side: "debit", amountMinor: 360 },
        { code: "astrologer_payout_pending", side: "credit", amountMinor: 8_640 },
        { code: "astrologer_payout_pending", side: "credit", amountMinor: 360 }
      ]
    ],
    [
      "refund_approved",
      [
        { code: "astrologer_available", side: "debit", amountMinor: 1_500 },
        { code: "astrologer_reserved", side: "debit", amountMinor: 500 },
        { code: "astrologer_refund_pending", side: "credit", amountMinor: 1_500 },
        { code: "astrologer_refund_pending", side: "credit", amountMinor: 500 }
      ]
    ],
    [
      "chargeback_recovery_collected",
      [
        { code: "astrologer_available", side: "debit", amountMinor: 500 },
        {
          code: "astrologer_recovery_receivable",
          side: "credit",
          amountMinor: 500
        }
      ]
    ]
  ] as const)("maps %s effects through one exact scoped bucket resolver", (kind, expected) => {
    const receipt = receiptFor(kind);
    const result = project(receipt, componentBindingsFor(receipt));

    expect(
      result.rows.map((row) => ({
        code: row.entry.account.code,
        side: row.entry.side,
        amountMinor: row.entry.amount.amountMinor
      }))
    ).toEqual(expected);
    expect(
      result.rows.every(
        (row) =>
          "astrologerUserId" in row.entry.account &&
          row.entry.account.astrologerUserId === "astrologer-1" &&
          row.entry.account.currency === "RUB"
      )
    ).toBe(true);
  });

  it("projects exact unverified evidence, links and source links without trust-bearing output", () => {
    const receipt = receiptFor("sale_capture");
    const result = project(receipt, componentBindingsFor(receipt));

    expect(Object.keys(result).sort()).toEqual(["receipt", "rows", "sourceEvidenceRef"]);
    expect(result.receipt).toEqual(receipt);
    expect(result.receipt).not.toBe(receipt);
    expect(result.receipt.integrityStatus).toBe("unverified");
    expect(result.sourceEvidenceRef).toEqual({
      kind: "payable_lot_operation_receipt",
      evidenceId: receipt.receiptId,
      canonicalDigest: receipt.canonicalDigest
    });
    expect(result.rows).toEqual([
      {
        entry: {
          account: {
            code: "astrologer_pending",
            astrologerUserId: "astrologer-1",
            currency: "RUB"
          },
          side: "credit",
          amount: { amountMinor: 9_600, currency: "RUB" },
          links: {
            originalSaleId: "order-receipt-payout",
            componentId: "component-1",
            payableLotId: "lot-order-receipt-payout",
            payoutAllocationId: null
          }
        },
        sourceLink: {
          semanticEdgeId: `${receipt.operationId}:effect:1`,
          lotAllocationId: `${receipt.operationId}:lot-allocation:1`
        }
      }
    ]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.rows)).toBe(true);
    expect(result.rows.every(Object.isFrozen)).toBe(true);
    for (const forbidden of [
      "authorityRef",
      "controlEntries",
      "operationSnapshotRef",
      "authorizationStatus",
      "atomicityStatus",
      "trusted"
    ]) {
      expect(result).not.toHaveProperty(forbidden);
    }
  });

  it("returns an immutable empty row set for a canonical zero-effect receipt", () => {
    const receipt = receiptFor("chargeback_confirmed");
    const result = project(receipt, []);

    expect(receipt.effects).toEqual([]);
    expect(result.rows).toEqual([]);
    expect(result.sourceEvidenceRef).toEqual({
      kind: "payable_lot_operation_receipt",
      evidenceId: receipt.receiptId,
      canonicalDigest: receipt.canonicalDigest
    });
    expect(Object.isFrozen(result.rows)).toBe(true);
  });

  it.each(["missing", "extra", "duplicate", "wrong_effect"] as const)(
    "rejects %s effect-slot-binding correspondence",
    (counterexample) => {
      const receipt = receiptFor("sale_capture");
      const original = componentBindingsFor(receipt)[0];
      if (!original) throw new Error("missing component-binding fixture");
      const additional = rehashBinding({
        ...original,
        bindingId: "additional-binding",
        slotId: "additional-slot",
        effectId: "additional-effect"
      });
      const wrongEffect = rehashBinding({ ...original, effectId: "another-effect" });
      const bindings =
        counterexample === "missing"
          ? []
          : counterexample === "extra"
            ? [original, additional]
            : counterexample === "duplicate"
              ? [original, original]
              : [wrongEffect];

      expectPostingError(
        () =>
          project(receipt, bindings as readonly UnverifiedFinanceComponentSlotResolutionBinding[]),
        "proof_operation_receipt_mismatch"
      );
    }
  );

  it("normalizes both out-of-band envelopes before reading hostile target input", () => {
    const hostile = hostileProxy({});

    expectPostingError(
      () =>
        projectUnverifiedReceiptLinkedPostingRows(
          hostile.value as never,
          undefined as never,
          receiptDecoderEnvelope
        ),
      "decoder_envelope_required"
    );
    expectPostingError(
      () =>
        projectUnverifiedReceiptLinkedPostingRows(
          hostile.value as never,
          postingDecoderEnvelope,
          undefined as never
        ),
      "proof_operation_receipt_mismatch"
    );
    expect(hostile.trapCalls()).toBe(0);
  });

  it("rejects a hostile receipt envelope without executing traps or reading target input", () => {
    const target = hostileProxy({});
    const envelope = hostileProxy(receiptDecoderEnvelope);

    expectPostingError(
      () =>
        projectUnverifiedReceiptLinkedPostingRows(
          target.value as never,
          postingDecoderEnvelope,
          envelope.value as never
        ),
      "proof_operation_receipt_mismatch"
    );
    expect(envelope.trapCalls()).toBe(0);
    expect(target.trapCalls()).toBe(0);
  });

  it.each([
    "operation_receipt",
    "source_key",
    "effects_array",
    "effect",
    "effect_amount",
    "component_bindings_array",
    "component_binding"
  ] as const)("rejects a hostile nested %s without executing traps", (location) => {
    const receipt = structuredClone(receiptFor("sale_capture"));
    const bindings = structuredClone(componentBindingsFor(receipt));
    const firstEffect = receipt.effects[0];
    const firstBinding = bindings[0];
    if (!firstEffect || !firstBinding) throw new Error("missing hostile fixture target");
    const hostile = hostileProxy(
      location === "operation_receipt"
        ? receipt
        : location === "source_key"
          ? receipt.sourceKey
          : location === "effects_array"
            ? receipt.effects
            : location === "effect"
              ? firstEffect
              : location === "effect_amount"
                ? firstEffect.amount
                : location === "component_bindings_array"
                  ? bindings
                  : firstBinding
    );
    let operationReceipt: unknown = receipt;
    let componentBindings: unknown = bindings;
    if (location === "operation_receipt") operationReceipt = hostile.value;
    if (location === "source_key") {
      (receipt as unknown as { sourceKey: unknown }).sourceKey = hostile.value;
    }
    if (location === "effects_array") {
      (receipt as unknown as { effects: unknown }).effects = hostile.value;
    }
    if (location === "effect") {
      (receipt.effects as unknown[])[0] = hostile.value;
    }
    if (location === "effect_amount") {
      (firstEffect as unknown as { amount: unknown }).amount = hostile.value;
    }
    if (location === "component_bindings_array") componentBindings = hostile.value;
    if (location === "component_binding") (bindings as unknown[])[0] = hostile.value;

    expectPostingError(
      () =>
        projectUnverifiedReceiptLinkedPostingRows(
          { operationReceipt, componentBindings } as never,
          postingDecoderEnvelope,
          receiptDecoderEnvelope
        ),
      location === "component_bindings_array" || location === "component_binding"
        ? "invalid_shape"
        : "proof_operation_receipt_mismatch"
    );
    expect(hostile.trapCalls()).toBe(0);
  });

  it("rejects caller-authored policy inside the exact target shape", () => {
    const receipt = receiptFor("sale_capture");
    expectPostingError(
      () =>
        projectUnverifiedReceiptLinkedPostingRows(
          {
            operationReceipt: receipt,
            componentBindings: componentBindingsFor(receipt),
            postingDecoderEnvelope
          } as never,
          postingDecoderEnvelope,
          receiptDecoderEnvelope
        ),
      "invalid_shape"
    );
  });
});

function project(
  receipt: PayableLotOperationReceipt,
  componentBindings: readonly UnverifiedFinanceComponentSlotResolutionBinding[]
) {
  return projectUnverifiedReceiptLinkedPostingRows(
    { operationReceipt: receipt, componentBindings },
    postingDecoderEnvelope,
    receiptDecoderEnvelope
  );
}

function receiptFor(kind: PayableLotOperationReceipt["operationKind"]): PayableLotOperationReceipt {
  const candidate = buildReceiptTransitionCases().find((entry) => entry.kind === kind);
  if (!candidate) throw new Error(`missing ${kind} receipt fixture`);
  return createPayableLotOperationReceipt(candidate.transition);
}

function componentBindingsFor(
  receipt: PayableLotOperationReceipt
): readonly UnverifiedFinanceComponentSlotResolutionBinding[] {
  return receipt.requiredExternalLinkSlots.map((slot, index) => {
    const core = {
      kind: "finance_component_slot_resolution_binding" as const,
      bindingId: `binding-${index + 1}`,
      version: "1",
      authorizationStatus: "unverified" as const,
      digestPurpose: "drift_detection_only" as const,
      operationReceiptId: receipt.receiptId,
      operationReceiptDigest: receipt.canonicalDigest as FinanceAuthorizationPayloadHash,
      slotId: slot.slotId,
      effectId: slot.effectId,
      componentId: `component-${index + 1}`,
      requiredAuthorityDigest: hashFinanceCommandPayload(slot.requiredAuthority)
    };
    return Object.freeze({ ...core, bindingDigest: hashFinanceCommandPayload(core) });
  });
}

function rehashBinding(
  binding: UnverifiedFinanceComponentSlotResolutionBinding
): UnverifiedFinanceComponentSlotResolutionBinding {
  const { bindingDigest: discardedDigest, ...core } = binding;
  void discardedDigest;
  return Object.freeze({ ...core, bindingDigest: hashFinanceCommandPayload(core) });
}

function hostileProxy<T extends object>(
  target: T
): {
  readonly value: T;
  readonly trapCalls: () => number;
} {
  let trapCalls = 0;
  const trap = () => {
    trapCalls += 1;
    throw new Error("must not execute Proxy trap");
  };
  return {
    value: new Proxy(target, {
      get: trap,
      getPrototypeOf: trap,
      ownKeys: trap,
      getOwnPropertyDescriptor: trap
    }),
    trapCalls: () => trapCalls
  };
}
