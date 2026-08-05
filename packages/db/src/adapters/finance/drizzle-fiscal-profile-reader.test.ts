import { describe, expect, it } from "vitest";
import {
  canonicalizeFiscalProfile,
  createFiscalProfile
} from "@elevenhouse/domain/finance-core";
import {
  FiscalProfileReaderPersistenceError,
  mapFiscalProfile
} from "./drizzle-fiscal-profile-reader";

describe("Drizzle fiscal profile reader", () => {
  it("rehydrates only the exact published digest-bound profile", () => {
    const profile = createFiscalProfile(profileInput());
    expect(
      mapFiscalProfile(
        { id: profile.profileSeriesId, transactionCategory: "client_purchase", retiredAt: null } as never,
        { ...versionInput(profile), publishedAt: new Date(), retiredAt: null } as never
      )
    ).toEqual(profile);
  });

  it("fails closed when storage returns a non-published or canonically mismatched fiscal authority", () => {
    const profile = createFiscalProfile(profileInput());
    for (const version of [
      { ...versionInput(profile), lifecycle: "draft", publishedAt: null },
      { ...versionInput(profile), canonicalDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
      { ...versionInput(profile), canonicalPreimage: "{\"tampered\":true}" },
      { ...versionInput(profile), buyerContactRequirement: "not_required" }
    ]) {
      expect(() =>
        mapFiscalProfile(
          { id: profile.profileSeriesId, transactionCategory: "client_purchase", retiredAt: null } as never,
          { ...version, publishedAt: new Date(), retiredAt: null } as never
        )
      ).toThrow(FiscalProfileReaderPersistenceError);
    }
  });
});

function profileInput() {
  return {
    profileSeriesId: "client-profile-1",
    version: 2,
    transactionCategory: "client_purchase" as const,
    currency: "RUB" as const,
    fiscalizationProvider: "arc_pay_embedded" as const,
    merchantTaxId: "7701234567",
    buyerContactRequirement: "email_or_phone" as const,
    lineTemplate: {
      vatRate: "no_vat" as const,
      paymentObject: "service",
      paymentMethod: "full_payment",
      measure: "piece",
      itemCode: "consultation"
    }
  };
}

function versionInput(profile: ReturnType<typeof createFiscalProfile>) {
  return {
    profileSeriesId: profile.profileSeriesId,
    version: profile.version,
    lifecycle: "published",
    currency: "RUB",
    fiscalizationProvider: "arc_pay_embedded",
    merchantTaxId: profile.merchantTaxId,
    buyerContactRequirement: profile.buyerContactRequirement,
    vatRate: profile.lineTemplate.vatRate,
    paymentObject: profile.lineTemplate.paymentObject,
    paymentMethod: profile.lineTemplate.paymentMethod,
    measure: profile.lineTemplate.measure,
    itemCode: profile.lineTemplate.itemCode,
    canonicalPreimage: canonicalizeFiscalProfile(profile),
    canonicalDigest: profile.canonicalDigest
  };
}
