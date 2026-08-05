import { describe, expect, it } from "vitest";
import {
  FinancePostingIntegrityError,
  readChargebackPrincipalPostingAllocationAuthority
} from "./chargeback-posting-allocation";
import {
  allocationInput,
  platformAllocation,
  recoveryAllocation
} from "./chargeback-posting-allocation-test-fixtures";
import { postingDecoderEnvelope } from "./posting-test-primitives";

function expectPostingError(action: () => unknown, reason: string): void {
  try {
    action();
    throw new Error("expected posting integrity error");
  } catch (error) {
    expect(error).toBeInstanceOf(FinancePostingIntegrityError);
    expect((error as FinancePostingIntegrityError).reason).toBe(reason);
  }
}

describe("chargeback principal posting allocation hardening", () => {
  it("normalizes the out-of-band envelope before touching hostile input", () => {
    let inputTrapCalls = 0;
    const hostileInput = new Proxy(allocationInput(), {
      get(target, property, receiver) {
        inputTrapCalls += 1;
        return Reflect.get(target, property, receiver);
      }
    });
    expectPostingError(
      () =>
        readChargebackPrincipalPostingAllocationAuthority(hostileInput, {
          ...postingDecoderEnvelope,
          maxAllocations: 0
        }),
      "decoder_envelope_required"
    );
    expect(inputTrapCalls).toBe(0);
  });

  it("rejects a hostile envelope without executing its get trap", () => {
    let envelopeTrapCalls = 0;
    const envelope = new Proxy(postingDecoderEnvelope, {
      get(target, property, receiver) {
        envelopeTrapCalls += 1;
        return Reflect.get(target, property, receiver);
      }
    });
    expectPostingError(
      () => readChargebackPrincipalPostingAllocationAuthority(allocationInput(), envelope),
      "decoder_envelope_required"
    );
    expect(envelopeTrapCalls).toBe(0);
  });

  it("rejects sparse allocation arrays", () => {
    const sparse: unknown[] = [];
    sparse.length = 1;
    const sparseInput = Object.freeze({
      ...allocationInput(),
      recoveryAllocations: sparse
    });
    expectPostingError(
      () => readChargebackPrincipalPostingAllocationAuthority(sparseInput, postingDecoderEnvelope),
      "invalid_shape"
    );
  });

  it("rejects accessor rows without executing the accessor", () => {
    let accessorCalls = 0;
    const accessorRow = { ...recoveryAllocation } as Record<string, unknown>;
    Object.defineProperty(accessorRow, "amount", {
      enumerable: true,
      get() {
        accessorCalls += 1;
        return recoveryAllocation.amount;
      }
    });
    const hostileInput = Object.freeze({
      ...allocationInput(),
      recoveryAllocations: Object.freeze([accessorRow])
    });
    expectPostingError(
      () => readChargebackPrincipalPostingAllocationAuthority(hostileInput, postingDecoderEnvelope),
      "invalid_shape"
    );
    expect(accessorCalls).toBe(0);
  });

  it("rejects a hostile prior revision reference without executing its get trap", () => {
    let trapCalls = 0;
    const reference = new Proxy(
      {
        kind: "chargeback_principal_posting_allocation",
        authorityId: "prior-revision",
        accountingAllocationId: "chargeback-allocation-1",
        version: 1,
        nextAllocatedPrincipal: { amountMinor: 3_000, currency: "RUB" },
        canonicalDigest: "a".repeat(64)
      },
      {
        get(target, property, receiver) {
          trapCalls += 1;
          return Reflect.get(target, property, receiver);
        }
      }
    );
    const hostileInput = Object.freeze({
      ...allocationInput(),
      priorAllocationAuthorityRef: reference
    });
    expectPostingError(
      () => readChargebackPrincipalPostingAllocationAuthority(hostileInput, postingDecoderEnvelope),
      "invalid_shape"
    );
    expect(trapCalls).toBe(0);
  });

  it("requires platform rows to retain the chargeback order", () => {
    expectPostingError(
      () =>
        readChargebackPrincipalPostingAllocationAuthority(
          allocationInput({
            platformAllocations: [{ ...platformAllocation, originalSaleId: "foreign-order" }]
          }),
          postingDecoderEnvelope
        ),
      "authority_mismatch"
    );
  });

  it.each([
    {
      ...platformAllocation,
      treatmentAuthorityRef: {
        ...platformAllocation.treatmentAuthorityRef,
        kind: "chargeback_platform_loss_treatment"
      }
    },
    {
      ...platformAllocation,
      accountCode: "platform_chargeback_loss",
      treatmentAuthorityRef: {
        ...platformAllocation.treatmentAuthorityRef,
        kind: "chargeback_component_reversal"
      }
    }
  ])("requires the treatment kind for each platform account", (row) => {
    expectPostingError(
      () =>
        readChargebackPrincipalPostingAllocationAuthority(
          allocationInput({ platformAllocations: [row] }),
          postingDecoderEnvelope
        ),
      "authority_mismatch"
    );
  });

  it("requires an original journal only for commission reversals, never platform loss", () => {
    const loss = {
      ...platformAllocation,
      accountCode: "platform_chargeback_loss",
      originalJournalEntry: null,
      treatmentAuthorityRef: {
        ...platformAllocation.treatmentAuthorityRef,
        kind: "chargeback_platform_loss_treatment"
      }
    };
    expect(
      readChargebackPrincipalPostingAllocationAuthority(
        allocationInput({ platformAllocations: [loss] }),
        postingDecoderEnvelope
      ).platformAllocations[0]
    ).toEqual(loss);
    expectPostingError(
      () =>
        readChargebackPrincipalPostingAllocationAuthority(
          allocationInput({
            platformAllocations: [{ ...platformAllocation, originalJournalEntry: null }]
          }),
          postingDecoderEnvelope
        ),
      "authority_mismatch"
    );
  });
});
