import { describe, expect, it } from "vitest";
import {
  canonicalizeFiscalProfile,
  createFiscalProfile
} from "@elevenhouse/domain/finance-core";
import {
  FiscalProfileAuthorityPersistenceError,
  mapFiscalProfileVersion
} from "./drizzle-fiscal-profile-authority-store";

describe("Drizzle fiscal profile authority store", () => {
  it("rehydrates a digest-bound draft revision for the administration authority", () => {
    const profile = createFiscalProfile(profileInput());
    expect(mapFiscalProfileVersion(
      { id: profile.profileSeriesId, transactionCategory: profile.transactionCategory, createdAt: new Date(), retiredAt: null } as never,
      { ...versionInput(profile), lifecycle: "draft", draftRevision: 4, publishedAt: null, retiredAt: null } as never
    )).toEqual({ profile, draftRevision: 4, lifecycle: "draft" });
  });

  it("rejects lifecycle timestamps and canonical content that cannot be authoritative", () => {
    const profile = createFiscalProfile(profileInput());
    for (const version of [
      { ...versionInput(profile), lifecycle: "published", publishedAt: null, retiredAt: null },
      { ...versionInput(profile), canonicalPreimage: "{\"not\":\"the profile\"}", publishedAt: new Date(), retiredAt: null }
    ]) {
      expect(() => mapFiscalProfileVersion(
        { id: profile.profileSeriesId, transactionCategory: profile.transactionCategory, createdAt: new Date(), retiredAt: null } as never,
        version as never
      )).toThrow(FiscalProfileAuthorityPersistenceError);
    }
  });
});

function profileInput() {
  return {
    profileSeriesId: "subscription-profile",
    version: 7,
    transactionCategory: "platform_subscription" as const,
    currency: "RUB" as const,
    fiscalizationProvider: "arc_pay_embedded" as const,
    merchantTaxId: "7701234567",
    buyerContactRequirement: "email_or_phone" as const,
    lineTemplate: {
      vatRate: "no_vat" as const,
      paymentObject: "service",
      paymentMethod: "full_payment",
      measure: "piece",
      itemCode: "subscription"
    }
  };
}

function versionInput(profile: ReturnType<typeof createFiscalProfile>) {
  return {
    profileSeriesId: profile.profileSeriesId,
    version: profile.version,
    draftRevision: 1,
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
    canonicalDigest: profile.canonicalDigest,
    createdAt: new Date()
  };
}
