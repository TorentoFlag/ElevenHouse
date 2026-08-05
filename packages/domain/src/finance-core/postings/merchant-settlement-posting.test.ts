import { describe, it } from "vitest";
import { buildUnknownBankCreditPosting as buildUnknownBankCreditPostingWithEnvelope } from "./bank-statement-posting";
import { buildArcPayMerchantPayoutBankCreditMatchedPosting as buildArcPayMerchantPayoutBankCreditMatchedPostingWithEnvelope } from "./merchant-settlement-posting";
import { expectPostingError } from "./bank-posting-test-assertions";
import { validUnknownCreditInput } from "./bank-statement-posting-test-fixtures";
import { validDirectMerchantBankMatchInput } from "./merchant-settlement-posting-test-fixtures";
import { withPostingDecoderEnvelope } from "./posting-test-primitives";

const buildUnknownBankCreditPosting = withPostingDecoderEnvelope(
  buildUnknownBankCreditPostingWithEnvelope
);
const buildArcPayMerchantPayoutBankCreditMatchedPosting = withPostingDecoderEnvelope(
  buildArcPayMerchantPayoutBankCreditMatchedPostingWithEnvelope
);

describe("merchant settlement posting", () => {
  it("keeps direct statement match and unknown-then-reclassification paths exclusive", () => {
    const direct = validDirectMerchantBankMatchInput();
    expectPostingError(
      () =>
        buildArcPayMerchantPayoutBankCreditMatchedPosting({
          ...direct,
          authority: {
            ...direct.authority,
            evidence: {
              ...direct.authority.evidence,
              classificationPath: "unknown_then_reclassification"
            }
          }
        } as never),
      "evidence_mismatch"
    );

    const unknown = validUnknownCreditInput();
    expectPostingError(
      () =>
        buildUnknownBankCreditPosting({
          ...unknown,
          authority: {
            ...unknown.authority,
            evidence: { ...unknown.authority.evidence, classificationPath: "direct_match" }
          }
        } as never),
      "evidence_mismatch"
    );
  });

  it("rejects invalid evidence, scope, amount and event chronology", () => {
    const input = validDirectMerchantBankMatchInput();
    expectPostingError(
      () =>
        buildArcPayMerchantPayoutBankCreditMatchedPosting({
          ...input,
          authority: {
            ...input.authority,
            evidence: { ...input.authority.evidence, evidenceDigest: "sha256:bad" }
          }
        } as never),
      "invalid_digest"
    );
    expectPostingError(
      () =>
        buildArcPayMerchantPayoutBankCreditMatchedPosting({
          ...input,
          authority: {
            ...input.authority,
            evidence: { ...input.authority.evidence, bankCashPoolId: "another-pool" }
          }
        } as never),
      "scope_mismatch"
    );
    expectPostingError(
      () =>
        buildArcPayMerchantPayoutBankCreditMatchedPosting({
          ...input,
          authority: {
            ...input.authority,
            evidence: {
              ...input.authority.evidence,
              amount: { amountMinor: 4_999_999, currency: "RUB" }
            }
          }
        } as never),
      "amount_mismatch"
    );
    expectPostingError(
      () =>
        buildArcPayMerchantPayoutBankCreditMatchedPosting({
          ...input,
          authority: { ...input.authority, matchedAt: "2026-08-04T07:59:59Z" }
        } as never),
      "invalid_chronology"
    );
  });
});
