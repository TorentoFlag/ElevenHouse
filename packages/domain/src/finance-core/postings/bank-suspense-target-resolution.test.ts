import { describe, expect, it } from "vitest";
import {
  buildUnverifiedBankCreditSuspenseReclassificationRecipe as buildUnverifiedBankCreditSuspenseReclassificationRecipeWithEnvelope,
  buildUnverifiedBankDebitSuspenseReclassificationRecipe as buildUnverifiedBankDebitSuspenseReclassificationRecipeWithEnvelope
} from "./bank-suspense-reclassification";
import { expectPostingError } from "./bank-posting-test-assertions";
import {
  merchantPayoutCreditTarget,
  payoutDebitTarget,
  returnedCreditTarget,
  validCreditMerchantReclassificationInput,
  validDebitReclassificationInput,
  validReturnedCreditReclassificationInput
} from "./bank-suspense-reclassification-test-fixtures";
import { withPostingDecoderEnvelope } from "./posting-test-primitives";

const buildUnverifiedBankCreditSuspenseReclassificationRecipe = withPostingDecoderEnvelope(
  buildUnverifiedBankCreditSuspenseReclassificationRecipeWithEnvelope
);
const buildUnverifiedBankDebitSuspenseReclassificationRecipe = withPostingDecoderEnvelope(
  buildUnverifiedBankDebitSuspenseReclassificationRecipeWithEnvelope
);

describe("bank suspense target resolution", () => {
  it("rejects target kinds outside the direction-specific closed union", () => {
    const credit = validCreditMerchantReclassificationInput();
    const debitTarget = payoutDebitTarget();
    expectPostingError(
      () =>
        buildUnverifiedBankCreditSuspenseReclassificationRecipe({
          ...credit,
          authority: {
            ...credit.authority,
            target: debitTarget,
            approvalBinding: credit.authority.approvalBinding
          }
        } as never),
      "authority_mismatch"
    );

    const debit = validDebitReclassificationInput();
    const merchantCreditTarget = merchantPayoutCreditTarget();
    expectPostingError(
      () =>
        buildUnverifiedBankDebitSuspenseReclassificationRecipe({
          ...debit,
          authority: {
            ...debit.authority,
            target: merchantCreditTarget,
            approvalBinding: debit.authority.approvalBinding
          }
        } as never),
      "authority_mismatch"
    );
  });

  it.each([
    ["sum mismatch", returnedCreditTarget({ secondAmountMinor: 999_999 }), "amount_mismatch"],
    [
      "duplicate payable lot",
      returnedCreditTarget({ duplicatePayableLot: true }),
      "authority_mismatch"
    ],
    [
      "duplicate payout allocation",
      returnedCreditTarget({ duplicatePayoutAllocation: true }),
      "authority_mismatch"
    ],
    ["mixed astrologers", returnedCreditTarget({ mixedAstrologers: true }), "amount_mismatch"]
  ] as const)("rejects returned-payout allocations with %s", (_name, target, reason) => {
    const input = validReturnedCreditReclassificationInput();
    expectPostingError(
      () =>
        buildUnverifiedBankCreditSuspenseReclassificationRecipe({
          ...input,
          authority: { ...input.authority, target }
        } as never),
      reason
    );
  });

  it("canonicalizes returned-payout proposals before checking the approval binding", () => {
    const input = validReturnedCreditReclassificationInput();
    if (input.authority.target.kind !== "returned_payout_credit") {
      throw new Error("expected returned-payout fixture");
    }
    const target = input.authority.target;
    expectPostingError(
      () =>
        buildUnverifiedBankCreditSuspenseReclassificationRecipe({
          ...input,
          authority: {
            ...input.authority,
            target: {
              ...target,
              proposedAllocations: [...target.proposedAllocations].reverse()
            }
          }
        } as never),
      "payable_lot_operation_receipt_required"
    );
  });

  it("rejects a sparse returned-payout allocation array", () => {
    const input = validReturnedCreditReclassificationInput();
    if (input.authority.target.kind !== "returned_payout_credit") {
      throw new Error("expected returned-payout fixture");
    }
    const proposedAllocations = [...input.authority.target.proposedAllocations];
    delete proposedAllocations[0];
    expectPostingError(
      () =>
        buildUnverifiedBankCreditSuspenseReclassificationRecipe({
          ...input,
          authority: {
            ...input.authority,
            target: { ...input.authority.target, proposedAllocations }
          }
        } as never),
      "invalid_shape"
    );
  });

  it("rejects returned-payout allocation proxies before target hashing", () => {
    const input = validReturnedCreditReclassificationInput();
    if (input.authority.target.kind !== "returned_payout_credit") {
      throw new Error("expected returned-payout fixture");
    }
    const firstAllocation = input.authority.target.proposedAllocations[0];
    if (!firstAllocation) throw new Error("missing returned-payout allocation fixture");
    let trapCalls = 0;
    const proposedAllocations = [...input.authority.target.proposedAllocations];
    proposedAllocations[0] = new Proxy(firstAllocation, {
      ownKeys() {
        trapCalls += 1;
        throw new Error("must not execute");
      }
    });

    expectPostingError(
      () =>
        buildUnverifiedBankCreditSuspenseReclassificationRecipe({
          ...input,
          authority: {
            ...input.authority,
            target: { ...input.authority.target, proposedAllocations }
          }
        } as never),
      "invalid_shape"
    );
    expect(trapCalls).toBe(0);
  });
});
