import { describe, expect, it } from "vitest";
import {
  buildArcPayMerchantPayoutBankCreditMatchedPosting as buildArcPayMerchantPayoutBankCreditMatchedPostingWithEnvelope,
  buildArcPayMerchantPayoutConfirmedPosting as buildArcPayMerchantPayoutConfirmedPostingWithEnvelope
} from "./merchant-settlement-posting";
import {
  expectJournalEntries,
  expectPostingError,
  noPostingLinks as noLinks,
  rehashExposureBinding
} from "./bank-posting-test-assertions";
import { bankStatementEvidence } from "./bank-statement-posting-test-fixtures";
import { merchantPayoutCreditTarget } from "./bank-suspense-reclassification-test-fixtures";
import { postingContext, sha, withPostingDecoderEnvelope } from "./posting-test-primitives";

const buildArcPayMerchantPayoutBankCreditMatchedPosting = withPostingDecoderEnvelope(
  buildArcPayMerchantPayoutBankCreditMatchedPostingWithEnvelope
);
const buildArcPayMerchantPayoutConfirmedPosting = withPostingDecoderEnvelope(
  buildArcPayMerchantPayoutConfirmedPostingWithEnvelope
);

describe("ArcPay merchant settlement postings", () => {
  it("posts an ArcPay merchant payout confirmation of 50_000 RUB as 5_000_000 minor", () => {
    const result = buildArcPayMerchantPayoutConfirmedPosting({
      context: postingContext(
        "journal-merchant-payout-confirmed-1",
        "proof-merchant-payout-confirmed-1",
        "merchant-payout-confirmation-operation-1",
        {
          kind: "settlement",
          sourceId: "arc-merchant-payout-1",
          operation: "merchant_payout_confirmed"
        },
        "2026-08-03T11:00:00Z",
        "2026-08-03T11:01:00Z"
      ),
      authority: {
        kind: "arc_merchant_payout_confirmed",
        authorityId: "merchant-payout-authority-1",
        version: 2,
        operationId: "merchant-payout-confirmation-operation-1",
        providerAccountId: "arc-provider-live-1",
        bankCashPoolId: "bank-pool-rub-1",
        merchantPayoutId: "arc-merchant-payout-1",
        amount: { amountMinor: 5_000_000, currency: "RUB" },
        confirmedAt: "2026-08-03T11:00:00Z",
        evidence: {
          kind: "arc_merchant_payout_confirmation",
          evidenceId: "arc-settlement-entry-1",
          evidenceDigest: sha("b"),
          providerAccountId: "arc-provider-live-1",
          bankCashPoolId: "bank-pool-rub-1",
          merchantPayoutId: "arc-merchant-payout-1",
          amount: { amountMinor: 5_000_000, currency: "RUB" },
          confirmedAt: "2026-08-03T11:00:00Z",
          observedAt: "2026-08-03T11:00:30Z"
        }
      }
    });

    expectJournalEntries(result, [
      {
        account: {
          code: "arc_to_bank_clearing",
          arcProviderAccountId: "arc-provider-live-1",
          bankCashPoolId: "bank-pool-rub-1",
          currency: "RUB"
        },
        side: "debit",
        amount: { amountMinor: 5_000_000, currency: "RUB" },
        links: noLinks
      },
      {
        account: {
          code: "arc_provider_clearing",
          arcProviderAccountId: "arc-provider-live-1",
          currency: "RUB"
        },
        side: "credit",
        amount: { amountMinor: 5_000_000, currency: "RUB" },
        links: noLinks
      }
    ]);
    expect(result.transaction.sourceKey.sourceId).toBe("arc-merchant-payout-1");
    expect(result.linkProof.sourceEvidenceRef).toEqual({
      kind: "arc_merchant_payout_confirmation",
      evidenceId: "arc-settlement-entry-1",
      canonicalDigest: sha("b")
    });
  });

  it("posts a directly matched merchant-payout bank credit separately from provider confirmation", () => {
    const result = buildArcPayMerchantPayoutBankCreditMatchedPosting({
      context: postingContext(
        "journal-merchant-payout-bank-match-1",
        "proof-merchant-payout-bank-match-1",
        "merchant-payout-bank-match-operation-1",
        {
          kind: "settlement",
          sourceId: "bank-credit-entry-1",
          operation: "merchant_payout_bank_matched"
        },
        "2026-08-04T08:00:00Z",
        "2026-08-04T08:04:00Z"
      ),
      authority: {
        kind: "merchant_payout_bank_credit_direct_match",
        authorityId: "bank-classification-authority-1",
        version: 1,
        operationId: "merchant-payout-bank-match-operation-1",
        providerAccountId: "arc-provider-live-1",
        bankCashPoolId: "bank-pool-rub-1",
        merchantPayoutId: "arc-merchant-payout-1",
        amount: { amountMinor: 5_000_000, currency: "RUB" },
        matchedAt: "2026-08-04T08:03:00Z",
        priorClearingBinding: merchantPayoutCreditTarget().exposureBinding,
        evidence: bankStatementEvidence({
          classificationPath: "direct_match",
          classificationAuthorityId: "bank-classification-authority-1",
          classificationVersion: 1,
          evidenceId: "bank-credit-evidence-1",
          evidenceDigest: sha("c"),
          bankStatementEntryId: "bank-credit-entry-1",
          direction: "credit",
          amountMinor: 5_000_000,
          bookedAt: "2026-08-04T08:00:00Z",
          observedAt: "2026-08-04T08:02:00Z"
        })
      }
    });

    expectJournalEntries(result, [
      {
        account: { code: "bank_cash", bankCashPoolId: "bank-pool-rub-1", currency: "RUB" },
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
    expect(result.transaction.sourceKey.sourceId).toBe("bank-credit-entry-1");
  });

  it("maps repeated direct matches for one statement fact to one source identity", () => {
    const first = directMatchInput("direct-match-operation-1", "journal-direct-match-1");
    const second = directMatchInput("direct-match-operation-2", "journal-direct-match-2");

    const firstPosting = buildArcPayMerchantPayoutBankCreditMatchedPosting(first);
    const secondPosting = buildArcPayMerchantPayoutBankCreditMatchedPosting(second);

    expect(firstPosting.transaction.sourceKey).toEqual(secondPosting.transaction.sourceKey);
    expect(firstPosting.transaction.sourceKey).toEqual({
      kind: "settlement",
      sourceId: "bank-credit-immutable-entry",
      operation: "merchant_payout_bank_matched"
    });
  });

  it.each([
    ["scope", { bankCashPoolId: "another-pool" }, "scope_mismatch"],
    ["merchant payout", { merchantPayoutId: "another-payout" }, "evidence_mismatch"],
    ["amount", { amount: { amountMinor: 4_999_999, currency: "RUB" as const } }, "amount_mismatch"],
    [
      "claimed remainder",
      { claimedRemainingAmount: { amountMinor: 4_999_999, currency: "RUB" as const } },
      "amount_mismatch"
    ],
    ["claimed consumption", { claimedConsumptionStatus: "consumed" }, "evidence_mismatch"]
  ] as const)("checks the unverified prior clearing binding %s", (_name, patch, reason) => {
    const input = directMatchInput("direct-match-binding-check", "journal-binding-check");
    const priorClearingBinding = rehashExposureBinding({
      ...input.authority.priorClearingBinding,
      ...patch
    });

    expectPostingError(
      () =>
        buildArcPayMerchantPayoutBankCreditMatchedPosting({
          ...input,
          authority: { ...input.authority, priorClearingBinding }
        } as never),
      reason
    );
  });

  it("does not mistake a self-consistent changed clearing-journal claim for authority", () => {
    const input = directMatchInput("direct-match-unverified", "journal-direct-match-unverified");
    const priorClearingBinding = rehashExposureBinding({
      ...input.authority.priorClearingBinding,
      clearingJournalTransactionDigest: sha("0")
    });
    const result = buildArcPayMerchantPayoutBankCreditMatchedPosting({
      ...input,
      authority: { ...input.authority, priorClearingBinding }
    });

    expect(result).toMatchObject({
      kind: "journal",
      authorizationStatus: "unverified",
      atomicityStatus: "unverified"
    });
  });
});

function directMatchInput(operationId: string, journalTransactionId: string) {
  return {
    context: postingContext(
      journalTransactionId,
      `proof-${journalTransactionId}`,
      operationId,
      {
        kind: "settlement",
        sourceId: "bank-credit-immutable-entry",
        operation: "merchant_payout_bank_matched"
      },
      "2026-08-04T08:00:00Z",
      "2026-08-04T08:04:00Z"
    ),
    authority: {
      kind: "merchant_payout_bank_credit_direct_match" as const,
      authorityId: "bank-classification-immutable-entry",
      version: 1,
      operationId,
      providerAccountId: "arc-provider-live-1",
      bankCashPoolId: "bank-pool-rub-1",
      merchantPayoutId: "arc-merchant-payout-1",
      amount: { amountMinor: 5_000_000, currency: "RUB" as const },
      matchedAt: "2026-08-04T08:03:00Z",
      priorClearingBinding: merchantPayoutCreditTarget().exposureBinding,
      evidence: bankStatementEvidence({
        classificationPath: "direct_match",
        classificationAuthorityId: "bank-classification-immutable-entry",
        classificationVersion: 1,
        evidenceId: "bank-credit-immutable-evidence",
        evidenceDigest: sha("8"),
        bankStatementEntryId: "bank-credit-immutable-entry",
        direction: "credit",
        amountMinor: 5_000_000,
        bookedAt: "2026-08-04T08:00:00Z",
        observedAt: "2026-08-04T08:02:00Z"
      })
    }
  };
}
