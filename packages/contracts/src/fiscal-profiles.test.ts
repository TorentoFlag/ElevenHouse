import { describe, expect, it } from "vitest";
import {
  adminFiscalProfileDraftRequestSchema,
  adminFiscalProfileResponseSchema,
  adminFiscalProfileUpdateRequestSchema
} from "./fiscal-profiles";

const terms = {
  profileSeriesId: "client-purchase-rub",
  version: 1,
  transactionCategory: "client_purchase",
  currency: "RUB",
  fiscalizationProvider: "arc_pay_embedded",
  merchantTaxId: "7701234567",
  buyerContactRequirement: "email_or_phone",
  lineTemplate: {
    vatRate: "no_vat",
    paymentObject: "service",
    paymentMethod: "full_payment",
    measure: "piece",
    itemCode: "consultation"
  }
};

describe("admin fiscal profile contracts", () => {
  it("requires every accounting term explicitly when creating or revising a profile", () => {
    expect(adminFiscalProfileDraftRequestSchema.parse(terms)).toEqual(terms);
    expect(adminFiscalProfileUpdateRequestSchema.parse({ ...terms, expectedDraftRevision: 2 }))
      .toEqual({ ...terms, expectedDraftRevision: 2 });
    expect(() => adminFiscalProfileDraftRequestSchema.parse({
      ...terms,
      lineTemplate: { ...terms.lineTemplate, vatRate: "guessed" }
    })).toThrow();
    expect(() => adminFiscalProfileDraftRequestSchema.parse({
      ...terms,
      buyerContactRequirement: undefined
    })).toThrow();
  });

  it("returns a versioned digest-bound authority and no mutable receipt default", () => {
    expect(adminFiscalProfileResponseSchema.parse({
      ...terms,
      draftRevision: 2,
      lifecycle: "published",
      canonicalDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    })).toMatchObject({ lifecycle: "published", draftRevision: 2 });
  });
});
