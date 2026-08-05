import { describe, expect, it } from "vitest";
import {
  FiscalProfileAuthorityError,
  createFiscalProfileDraft,
  publishFiscalProfileDraft,
  retirePublishedFiscalProfileVersion,
  reviseFiscalProfileDraft,
  verifyFiscalProfileVersion
} from "./fiscal-profile-authority";

describe("fiscal profile authority", () => {
  it("seals a published accounting version and keeps revisions optimistic", () => {
    const draft = createFiscalProfileDraft(draftInput());
    const revised = reviseFiscalProfileDraft({
      current: draft,
      expectedDraftRevision: 1,
      next: {
        ...draftInput(),
        lineTemplate: { ...draftInput().lineTemplate, itemCode: "consultation-v2" }
      }
    });
    const published = publishFiscalProfileDraft(revised);

    expect(draft).toMatchObject({ lifecycle: "draft", draftRevision: 1 });
    expect(revised).toMatchObject({ lifecycle: "draft", draftRevision: 2 });
    expect(published).toMatchObject({ lifecycle: "published", draftRevision: 2 });
    expect(verifyFiscalProfileVersion(published)).toEqual(published);
    expect(retirePublishedFiscalProfileVersion(published)).toMatchObject({ lifecycle: "retired" });
    expect(() => reviseFiscalProfileDraft({
      current: revised,
      expectedDraftRevision: 1,
      next: draftInput()
    })).toThrow(FiscalProfileAuthorityError);
  });

  it("rejects a fabricated accounting profile or invalid lifecycle transition", () => {
    const draft = createFiscalProfileDraft(draftInput());
    expect(() => publishFiscalProfileDraft({
      ...draft,
      profile: { ...draft.profile, merchantTaxId: "7701234568" }
    })).toThrow(
      FiscalProfileAuthorityError
    );
    expect(() => retirePublishedFiscalProfileVersion(draft)).toThrow(FiscalProfileAuthorityError);
  });
});

function draftInput() {
  return {
    profileSeriesId: "client-purchase-profile",
    version: 1,
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
