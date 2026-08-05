import { describe, expect, it } from "vitest";
import {
  FiscalProfileIntegrityError,
  createFiscalChargeSnapshot,
  createFiscalProfile,
  verifyFiscalChargeSnapshot
} from "./fiscal-profile";

describe("fiscal profile", () => {
  it("requires an approved, versioned ArcPay embedded fiscal profile and snapshots exact lines", () => {
    const profile = createFiscalProfile(profileInput());
    const snapshot = createFiscalChargeSnapshot({
      profile,
      buyerContact: { kind: "email", value: "client@example.com" },
      lines: [
        { sourceLineId: "order-1", name: "Астрологическая консультация", amountMinor: 10_000 },
        { sourceLineId: "order-1-extra", name: "Дополнительный вопрос", amountMinor: 2_000 }
      ]
    });

    expect(profile.canonicalDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(snapshot.profileSeriesId).toBe("client-sale-profile");
    expect(snapshot.profileVersion).toBe(3);
    expect(snapshot.totalAmountMinor).toBe(12_000);
    expect(snapshot.buyerContact).toEqual({ kind: "email", value: "client@example.com" });
    expect(snapshot.lines[0]).toMatchObject({
      quantity: "1",
      unitPriceMinor: 10_000,
      vatRate: "no_vat",
      itemCode: "astrology-consultation"
    });
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.lines)).toBe(true);
    expect(Object.isFrozen(snapshot.lines[0]!)).toBe(true);
    expect(verifyFiscalChargeSnapshot(snapshot)).toEqual(snapshot);
  });

  it("does not invent fiscal values or allow a broken profile to become a charge snapshot", () => {
    for (const patch of [
      { merchantTaxId: "" },
      { lineTemplate: { ...profileInput().lineTemplate, vatRate: "guessed_vat" } },
      { buyerContactRequirement: "not_required" },
      { fiscalizationProvider: "manual_kkt" }
    ]) {
      expect(() => createFiscalProfile({ ...profileInput(), ...patch } as never)).toThrow(
        FiscalProfileIntegrityError
      );
    }

    const profile = createFiscalProfile(profileInput());
    expect(() =>
      createFiscalChargeSnapshot({
        profile: { ...profile, merchantTaxId: "0000000000" },
        buyerContact: { kind: "email", value: "client@example.com" },
        lines: [{ sourceLineId: "order-1", name: "Consultation", amountMinor: 10_000 }]
      })
    ).toThrow(FiscalProfileIntegrityError);
    expect(() =>
      createFiscalChargeSnapshot({
        profile,
        buyerContact: { kind: "email", value: "client@example.com" },
        lines: [
          { sourceLineId: "order-1", name: "Consultation", amountMinor: 10_000 },
          { sourceLineId: "order-1", name: "Duplicate", amountMinor: 1 }
        ]
      })
    ).toThrow(FiscalProfileIntegrityError);
    const snapshot = createFiscalChargeSnapshot({
      profile,
      buyerContact: { kind: "email", value: "client@example.com" },
      lines: [{ sourceLineId: "order-2", name: "Consultation", amountMinor: 10_000 }]
    });
    expect(() =>
      verifyFiscalChargeSnapshot({ ...snapshot, totalAmountMinor: 9_999 })
    ).toThrow(FiscalProfileIntegrityError);
    expect(() =>
      createFiscalChargeSnapshot({
        profile,
        buyerContact: { kind: "phone", value: "not-a-phone" },
        lines: [{ sourceLineId: "order-3", name: "Consultation", amountMinor: 10_000 }]
      })
    ).toThrow(FiscalProfileIntegrityError);
    expect(() =>
      verifyFiscalChargeSnapshot({ ...snapshot, buyerContact: { kind: "email", value: "other@example.com" } })
    ).toThrow(FiscalProfileIntegrityError);
  });
});

function profileInput() {
  return {
    profileSeriesId: "client-sale-profile",
    version: 3,
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
      itemCode: "astrology-consultation"
    }
  };
}
