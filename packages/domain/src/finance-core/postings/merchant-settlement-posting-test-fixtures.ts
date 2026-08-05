import { bankStatementEvidence } from "./bank-statement-posting-test-fixtures";
import { merchantPayoutCreditTarget } from "./bank-suspense-reclassification-test-fixtures";
import { postingContext, sha } from "./posting-test-primitives";

export function validDirectMerchantBankMatchInput() {
  return {
    context: postingContext(
      "journal-direct-match-validation",
      "proof-direct-match-validation",
      "direct-match-validation-operation",
      {
        kind: "settlement",
        sourceId: "direct-match-validation-statement-entry",
        operation: "merchant_payout_bank_matched"
      },
      "2026-08-04T08:00:00Z",
      "2026-08-04T08:04:00Z"
    ),
    authority: {
      kind: "merchant_payout_bank_credit_direct_match" as const,
      authorityId: "direct-match-validation-authority",
      version: 1,
      operationId: "direct-match-validation-operation",
      providerAccountId: "arc-provider-live-1",
      bankCashPoolId: "bank-pool-rub-1",
      merchantPayoutId: "arc-merchant-payout-1",
      amount: { amountMinor: 5_000_000, currency: "RUB" as const },
      matchedAt: "2026-08-04T08:03:00Z",
      priorClearingBinding: merchantPayoutCreditTarget().exposureBinding,
      evidence: bankStatementEvidence({
        classificationPath: "direct_match",
        classificationAuthorityId: "direct-match-validation-authority",
        classificationVersion: 1,
        evidenceId: "direct-match-validation-evidence",
        evidenceDigest: sha("9"),
        bankStatementEntryId: "direct-match-validation-statement-entry",
        direction: "credit",
        amountMinor: 5_000_000,
        bookedAt: "2026-08-04T08:00:00Z",
        observedAt: "2026-08-04T08:02:00Z"
      })
    }
  };
}
