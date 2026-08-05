import { describe, expect, it } from "vitest";
import { buildUnverifiedBankCreditSuspenseReclassificationRecipe as buildUnverifiedBankCreditSuspenseReclassificationRecipeWithEnvelope } from "./bank-suspense-reclassification";
import { expectPostingError, rehashExposureBinding } from "./bank-posting-test-assertions";
import {
  suspenseReclassificationAuthority,
  validCreditMerchantReclassificationInput
} from "./bank-suspense-reclassification-test-fixtures";
import { sha, withPostingDecoderEnvelope } from "./posting-test-primitives";

const buildUnverifiedBankCreditSuspenseReclassificationRecipe = withPostingDecoderEnvelope(
  buildUnverifiedBankCreditSuspenseReclassificationRecipeWithEnvelope
);

describe("bank suspense exposure binding", () => {
  it.each(["scope", "amount", "version", "journal_digest"] as const)(
    "rejects merchant clearing exposure drift outside the approval binding in %s",
    (counterexample) => {
      const input = validCreditMerchantReclassificationInput();
      if (input.authority.target.kind !== "merchant_payout_credit") {
        throw new Error("expected merchant payout fixture");
      }
      const binding = input.authority.target.exposureBinding;
      const bindingCore = {
        ...binding,
        ...(counterexample === "scope" ? { bankCashPoolId: "another-bank-pool" } : {}),
        ...(counterexample === "amount"
          ? { amount: { amountMinor: 4_999_999, currency: "RUB" as const } }
          : {}),
        ...(counterexample === "version" ? { version: "2" } : {}),
        ...(counterexample === "journal_digest"
          ? { clearingJournalTransactionDigest: sha("0") }
          : {})
      };
      const target = {
        ...input.authority.target,
        exposureBinding: rehashExposureBinding(bindingCore)
      };

      expectPostingError(
        () =>
          buildUnverifiedBankCreditSuspenseReclassificationRecipe({
            ...input,
            authority: { ...input.authority, target }
          } as never),
        "authority_mismatch"
      );
    }
  );

  it.each(["version", "journal_digest"] as const)(
    "keeps a self-consistent changed exposure %s explicitly unverified",
    (counterexample) => {
      const input = validCreditMerchantReclassificationInput();
      if (input.authority.target.kind !== "merchant_payout_credit") {
        throw new Error("expected merchant payout fixture");
      }
      const bindingCore = {
        ...input.authority.target.exposureBinding,
        ...(counterexample === "version" ? { version: "2" } : {}),
        ...(counterexample === "journal_digest"
          ? { clearingJournalTransactionDigest: sha("0") }
          : {})
      };
      const target = {
        ...input.authority.target,
        exposureBinding: rehashExposureBinding(bindingCore)
      };
      const authority = suspenseReclassificationAuthority({
        direction: "credit",
        authorityId: input.authority.authorityId,
        operationId: input.authority.operationId,
        amountMinor: input.authority.amount.amountMinor,
        originalAuthorityId: input.authority.originalUnknown.classificationAuthorityId,
        originalOperationId: input.authority.originalUnknown.operationId,
        target
      });

      const recipe = buildUnverifiedBankCreditSuspenseReclassificationRecipe({
        context: input.context,
        authority
      });
      expect(recipe).toMatchObject({
        kind: "journal",
        authorizationStatus: "unverified",
        atomicityStatus: "unverified"
      });
    }
  );
});
