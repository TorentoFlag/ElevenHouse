import { describe, expect, it } from "vitest";
import {
  buildApprovedBankCreditSuspenseReclassificationPosting as buildApprovedBankCreditSuspenseReclassificationPostingWithEnvelope,
  buildUnverifiedBankCreditSuspenseReclassificationRecipe as buildUnverifiedBankCreditSuspenseReclassificationRecipeWithEnvelope,
  buildUnverifiedBankDebitSuspenseReclassificationRecipe as buildUnverifiedBankDebitSuspenseReclassificationRecipeWithEnvelope
} from "./bank-suspense-reclassification";
import {
  expectJournalEntries,
  expectPostingError,
  noPostingLinks as noLinks
} from "./bank-posting-test-assertions";
import {
  merchantPayoutCreditTarget,
  payoutDebitTarget,
  suspenseReclassificationAuthority,
  suspenseReclassificationContext,
  validCreditMerchantReclassificationInput
} from "./bank-suspense-reclassification-test-fixtures";
import { withPostingDecoderEnvelope } from "./posting-test-primitives";

const buildApprovedBankCreditSuspenseReclassificationPosting = withPostingDecoderEnvelope(
  buildApprovedBankCreditSuspenseReclassificationPostingWithEnvelope
);
const buildUnverifiedBankCreditSuspenseReclassificationRecipe = withPostingDecoderEnvelope(
  buildUnverifiedBankCreditSuspenseReclassificationRecipeWithEnvelope
);
const buildUnverifiedBankDebitSuspenseReclassificationRecipe = withPostingDecoderEnvelope(
  buildUnverifiedBankDebitSuspenseReclassificationRecipeWithEnvelope
);

describe("bank suspense reclassification", () => {
  it("reclassifies an approved unknown debit to payout clearing without moving bank cash twice", () => {
    const result = buildUnverifiedBankDebitSuspenseReclassificationRecipe({
      context: suspenseReclassificationContext(
        "debit-reclassification-operation-1",
        "unknown-debit-operation-1"
      ),
      authority: suspenseReclassificationAuthority({
        direction: "debit",
        authorityId: "debit-reclassification-authority-1",
        operationId: "debit-reclassification-operation-1",
        amountMinor: 2_500_000,
        originalAuthorityId: "unknown-debit-classification-1",
        originalOperationId: "unknown-debit-operation-1",
        target: payoutDebitTarget()
      })
    });

    expectJournalEntries(result, [
      {
        account: {
          code: "bank_outbound_clearing",
          bankCashPoolId: "bank-pool-rub-1",
          currency: "RUB"
        },
        side: "debit",
        amount: { amountMinor: 2_500_000, currency: "RUB" },
        links: noLinks
      },
      {
        account: {
          code: "bank_unmatched_debit_suspense",
          bankCashPoolId: "bank-pool-rub-1",
          currency: "RUB"
        },
        side: "credit",
        amount: { amountMinor: 2_500_000, currency: "RUB" },
        links: noLinks
      }
    ]);
    expect(result.transaction.entries.some((entry) => entry.account.code === "bank_cash")).toBe(
      false
    );
  });

  it("reclassifies an approved unknown credit to merchant payout clearing without moving cash twice", () => {
    const result = buildUnverifiedBankCreditSuspenseReclassificationRecipe({
      context: suspenseReclassificationContext(
        "credit-reclassification-operation-1",
        "unknown-credit-operation-1"
      ),
      authority: suspenseReclassificationAuthority({
        direction: "credit",
        authorityId: "credit-reclassification-authority-1",
        operationId: "credit-reclassification-operation-1",
        amountMinor: 5_000_000,
        originalAuthorityId: "unknown-credit-classification-1",
        originalOperationId: "unknown-credit-operation-1",
        target: merchantPayoutCreditTarget()
      })
    });

    expectJournalEntries(result, [
      {
        account: {
          code: "bank_unmatched_credit_suspense",
          bankCashPoolId: "bank-pool-rub-1",
          currency: "RUB"
        },
        side: "debit",
        amount: { amountMinor: 5_000_000, currency: "RUB" },
        links: noLinks
      },
      {
        account: {
          code: "arc_to_bank_clearing",
          arcProviderAccountId: "arc-provider-live-1",
          bankCashPoolId: "bank-pool-rub-1",
          currency: "RUB"
        },
        side: "credit",
        amount: { amountMinor: 5_000_000, currency: "RUB" },
        links: noLinks
      }
    ]);
    expect(result.transaction.entries.some((entry) => entry.account.code === "bank_cash")).toBe(
      false
    );
  });

  it("never promotes a fully self-authored and consistently hashed binding graph to posting authority", () => {
    const input = validCreditMerchantReclassificationInput();
    const recipe = buildUnverifiedBankCreditSuspenseReclassificationRecipe(input);

    expect(recipe).toMatchObject({
      kind: "journal",
      authorizationStatus: "unverified",
      atomicityStatus: "unverified"
    });
    expectPostingError(
      () => buildApprovedBankCreditSuspenseReclassificationPosting(input),
      "trusted_reclassification_commit_receipt_required"
    );
  });

  it("fails closed for a returned-payout credit without a source lot operation receipt", () => {
    expectPostingError(
      () =>
        buildUnverifiedBankCreditSuspenseReclassificationRecipe({
          context: suspenseReclassificationContext(
            "return-reclassification-operation-1",
            "unknown-return-operation-1"
          ),
          authority: suspenseReclassificationAuthority({
            direction: "credit",
            authorityId: "return-reclassification-authority-1",
            operationId: "return-reclassification-operation-1",
            amountMinor: 2_500_000,
            originalAuthorityId: "unknown-return-classification-1",
            originalOperationId: "unknown-return-operation-1",
            target: {
              kind: "returned_payout_credit",
              payoutRequestId: "payout-request-returned-1",
              proposedAllocations: [
                {
                  astrologerUserId: "astrologer-1",
                  amount: { amountMinor: 1_500_000, currency: "RUB" },
                  originalSaleId: "order-1",
                  componentId: "component-1",
                  payableLotId: "returned-lot-1",
                  payoutAllocationId: "payout-allocation-1"
                },
                {
                  astrologerUserId: "astrologer-1",
                  amount: { amountMinor: 1_000_000, currency: "RUB" },
                  originalSaleId: "order-2",
                  componentId: "component-2",
                  payableLotId: "returned-lot-2",
                  payoutAllocationId: "payout-allocation-2"
                }
              ]
            }
          })
        }),
      "payable_lot_operation_receipt_required"
    );
  });
});
