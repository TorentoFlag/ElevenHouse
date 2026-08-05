import { describe, expect, it } from "vitest";
import { createFiscalProfile } from "./fiscal-profile";
import {
  FiscalChargePreparationError,
  prepareFiscalChargeSnapshot
} from "./fiscal-charge-preparation";

describe("fiscal charge preparation", () => {
  it("creates a charge snapshot only from the published profile for its transaction category", async () => {
    const profile = createFiscalProfile({
      profileSeriesId: "client-profile",
      version: 3,
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
    });
    const reader = {
      findPublishedProfile: async ({ transactionCategory }: { transactionCategory: "client_purchase" | "platform_subscription" }) =>
        transactionCategory === "client_purchase" ? profile : null
    };

    await expect(prepareFiscalChargeSnapshot({
      reader,
      transactionCategory: "client_purchase",
      buyerContact: { kind: "email", value: "client@example.com" },
      lines: [{ sourceLineId: "order-1", name: "Consultation", amountMinor: 12_000 }]
    })).resolves.toMatchObject({
      profileSeriesId: "client-profile",
      profileVersion: 3,
      totalAmountMinor: 12_000
    });
  });

  it("fails before provider preparation when a transaction category has no published accounting profile", async () => {
    await expect(prepareFiscalChargeSnapshot({
      reader: { findPublishedProfile: async () => null },
      transactionCategory: "platform_subscription",
      buyerContact: { kind: "email", value: "astrologer@example.com" },
      lines: [{ sourceLineId: "invoice-1", name: "Plan", amountMinor: 2_500 }]
    })).rejects.toEqual(expect.objectContaining<Partial<FiscalChargePreparationError>>({
      code: "FINANCE_FISCAL_CHARGE_PREPARATION_ERROR",
      reason: "published_profile_missing"
    }));
  });
});
