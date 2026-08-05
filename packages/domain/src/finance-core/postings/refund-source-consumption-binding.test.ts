import { describe, expect, it } from "vitest";
import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import { FinancePostingIntegrityError } from "./posting-codec";
import { readRefundPostingAllocationAuthority } from "./refund-posting-allocation-codec";
import { readAndAssertUnverifiedRefundSourceConsumptionBinding } from "./refund-source-consumption-binding";
import {
  buildRefundPostingAllocationInput,
  buildSecondRefundPostingAllocationInput,
  refundPostingDecoderEnvelope
} from "./refund-posting-test-fixtures";
import { buildRefundSourceConsumptionBindingFixture } from "./refund-source-consumption-test-fixtures";

describe("refund source consumption binding", () => {
  it("binds exactly one bounded cumulative position transition per current source", () => {
    const allocation = readRefundPostingAllocationAuthority(
      buildRefundPostingAllocationInput(),
      refundPostingDecoderEnvelope
    );
    const input = buildRefundSourceConsumptionBindingFixture(allocation);

    const binding = readAndAssertUnverifiedRefundSourceConsumptionBinding(
      input,
      allocation,
      refundPostingDecoderEnvelope
    );

    expect(binding).toMatchObject({
      kind: "unverified_refund_source_consumption_binding",
      authorizationStatus: "unverified",
      atomicityStatus: "unverified",
      digestPurpose: "drift_detection_only"
    });
    expect(binding.sourceTransitions).toHaveLength(6);
  });

  it("rejects arbitrary cumulative utilization even when the caller re-signs it", () => {
    const allocation = readRefundPostingAllocationAuthority(
      buildRefundPostingAllocationInput(),
      refundPostingDecoderEnvelope
    );
    const input = mutableRecord(
      structuredClone(buildRefundSourceConsumptionBindingFixture(allocation))
    );
    const transitions = input.sourceTransitions as Record<string, unknown>[];
    const paid = transitions.find((row) => record(row.source).kind === "paid_payout_allocation");
    if (!paid) throw new Error("missing paid source position");
    paid.consumedBefore = money(1);
    paid.consumedAfter = money(601);
    paid.remainingAfter = money(399);
    resign(input);

    expectFinanceError(
      () =>
        readAndAssertUnverifiedRefundSourceConsumptionBinding(
          input,
          allocation,
          refundPostingDecoderEnvelope
        ),
      "authority_mismatch"
    );
  });

  it("rejects duplicate source positions and caps rows before touching them", () => {
    const allocation = readRefundPostingAllocationAuthority(
      buildRefundPostingAllocationInput(),
      refundPostingDecoderEnvelope
    );
    const duplicate = mutableRecord(
      structuredClone(buildRefundSourceConsumptionBindingFixture(allocation))
    );
    const rows = duplicate.sourceTransitions as Record<string, unknown>[];
    const first = rows[0];
    if (!first) throw new Error("missing source position fixture");
    rows[1] = structuredClone(first);
    resign(duplicate);
    expectFinanceError(
      () =>
        readAndAssertUnverifiedRefundSourceConsumptionBinding(
          duplicate,
          allocation,
          refundPostingDecoderEnvelope
        ),
      "authority_mismatch"
    );

    let traps = 0;
    const hostileRows = new Proxy(
      buildRefundSourceConsumptionBindingFixture(allocation).sourceTransitions,
      {
        ownKeys() {
          traps += 1;
          throw new Error("must not execute");
        },
        getPrototypeOf() {
          traps += 1;
          throw new Error("must not execute");
        }
      }
    );
    const hostile = {
      ...buildRefundSourceConsumptionBindingFixture(allocation),
      sourceTransitions: hostileRows
    };
    expectFinanceError(
      () =>
        readAndAssertUnverifiedRefundSourceConsumptionBinding(
          hostile,
          allocation,
          refundPostingDecoderEnvelope
        ),
      "invalid_shape"
    );
    expect(traps).toBe(0);

    expectFinanceError(
      () =>
        readAndAssertUnverifiedRefundSourceConsumptionBinding(
          buildRefundSourceConsumptionBindingFixture(allocation),
          allocation,
          { ...refundPostingDecoderEnvelope, maxAllocations: 5 }
        ),
      "decoder_envelope_exceeded"
    );
  });

  it("carries the same stable source position forward instead of resetting utilization", () => {
    const prior = readRefundPostingAllocationAuthority(
      buildRefundPostingAllocationInput(),
      refundPostingDecoderEnvelope
    );
    const current = readRefundPostingAllocationAuthority(
      buildSecondRefundPostingAllocationInput(prior),
      refundPostingDecoderEnvelope
    );
    const priorBinding = buildRefundSourceConsumptionBindingFixture(prior);
    const currentBinding = buildRefundSourceConsumptionBindingFixture(current);
    const priorPaid = priorBinding.sourceTransitions.find(
      (row) => row.source.kind === "paid_payout_allocation"
    );
    const currentPaid = currentBinding.sourceTransitions.find(
      (row) => row.source.kind === "paid_payout_allocation"
    );
    if (!priorPaid || !currentPaid) throw new Error("missing paid source positions");

    expect(currentPaid.positionId).toBe(priorPaid.positionId);
    expect(currentPaid.expectedPositionVersion).toBe(priorPaid.nextPositionVersion);
    expect(currentPaid.consumedBefore).toEqual(priorPaid.consumedAfter);
    expect(() =>
      readAndAssertUnverifiedRefundSourceConsumptionBinding(
        currentBinding,
        current,
        refundPostingDecoderEnvelope
      )
    ).not.toThrow();

    const reset = mutableRecord(structuredClone(currentBinding));
    const rows = reset.sourceTransitions as Record<string, unknown>[];
    const paid = rows.find((row) => record(row.source).kind === "paid_payout_allocation");
    if (!paid) throw new Error("missing paid source position");
    paid.expectedPositionVersion = 0;
    paid.nextPositionVersion = 1;
    paid.consumedBefore = money(0);
    paid.consumedAfter = money(400);
    paid.remainingAfter = money(600);
    resign(reset);
    expectFinanceError(
      () =>
        readAndAssertUnverifiedRefundSourceConsumptionBinding(
          reset,
          current,
          refundPostingDecoderEnvelope
        ),
      "authority_mismatch"
    );
  });
});

function resign(input: Record<string, unknown>): void {
  const core = { ...input };
  delete core.bindingDigest;
  input.bindingDigest = hashFinanceCommandPayload(core);
}

function money(amountMinor: number) {
  return { amountMinor, currency: "RUB" as const };
}

function mutableRecord(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

function record(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

function expectFinanceError(action: () => unknown, reason: string): void {
  try {
    action();
    throw new Error("expected finance error");
  } catch (error) {
    expect(error).toBeInstanceOf(FinancePostingIntegrityError);
    expect((error as FinancePostingIntegrityError).reason).toBe(reason);
  }
}
