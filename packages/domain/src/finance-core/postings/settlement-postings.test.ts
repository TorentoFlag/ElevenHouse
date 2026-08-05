import { describe, expect, it } from "vitest";
import * as facade from "./settlement-postings";
import * as merchantSettlement from "./merchant-settlement-posting";

describe("settlement postings compatibility facade", () => {
  it("preserves the merchant-settlement public exports", () => {
    expect(facade.buildArcPayMerchantPayoutConfirmedPosting).toBe(
      merchantSettlement.buildArcPayMerchantPayoutConfirmedPosting
    );
    expect(facade.buildArcPayMerchantPayoutBankCreditMatchedPosting).toBe(
      merchantSettlement.buildArcPayMerchantPayoutBankCreditMatchedPosting
    );
  });
});
