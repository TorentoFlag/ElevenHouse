import { describe, expect, it } from "vitest";
import * as facade from "./bank-and-settlement-postings";
import { buildUnknownBankCreditPosting } from "./bank-statement-posting";
import { buildUnverifiedBankCreditSuspenseReclassificationRecipe } from "./bank-suspense-reclassification";
import { buildArcPayMerchantPayoutConfirmedPosting } from "./merchant-settlement-posting";

describe("bank and settlement postings compatibility facade", () => {
  it("preserves the focused bank and merchant-settlement exports", () => {
    expect(facade).not.toHaveProperty("buildAuditedBankOpeningPosting");
    expect(facade.buildUnknownBankCreditPosting).toBe(buildUnknownBankCreditPosting);
    expect(facade.buildUnverifiedBankCreditSuspenseReclassificationRecipe).toBe(
      buildUnverifiedBankCreditSuspenseReclassificationRecipe
    );
    expect(facade.buildArcPayMerchantPayoutConfirmedPosting).toBe(
      buildArcPayMerchantPayoutConfirmedPosting
    );
  });
});
