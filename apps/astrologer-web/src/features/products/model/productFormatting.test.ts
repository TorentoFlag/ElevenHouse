import type { ProductResponse } from "@elevenhouse/contracts";
import { describe, expect, it } from "vitest";
import { productCopyByLocale } from "./productCopy";
import {
  createProductCardSummary,
  createDuplicateProductTitle,
  formatMoneyMinor,
  formatProductPrice
} from "./productFormatting";

const product = {
  id: "11111111-1111-4111-8111-111111111111",
  ownerUserId: "22222222-2222-4222-8222-222222222222",
  type: "single",
  status: "active",
  revision: 1,
  title: "Натальный разбор",
  subtitle: null,
  priceMinor: 490000,
  currency: "RUB",
  coverMediaId: null,
  coverMedia: null,
  introVideoUrl: null,
  executionMode: "live",
  paymentModel: "once",
  durationMinutes: 60,
  durationLabel: "60 мин",
  slaLabel: null,
  packageSessionCount: null,
  packageDiscountPercent: null,
  subscriptionPeriod: null,
  trialDays: null,
  participantMode: "solo",
  groupSize: null,
  deliveryFormats: ["video"],
  requiredClientData: ["chart1"],
  methods: ["natal"],
  accessGrants: [],
  astroDiaryConfig: null,
  includedItems: [
    {
      id: "33333333-3333-4333-8333-333333333333",
      text: "Полный разбор карты",
      icon: "check",
      order: 10
    }
  ],
  modifiers: [],
  analytics: {
    salesCount: 47,
    grossRevenueMinor: 23030000,
    currency: "RUB",
    averageRating: 4.9,
    reviewsCount: 12
  },
  createdAt: "2026-07-02T00:00:00.000Z",
  updatedAt: "2026-07-02T00:00:00.000Z"
} satisfies ProductResponse;

describe("product formatting helpers", () => {
  it("formats minor-unit money with locale-aware separators and no fractional rubles", () => {
    expect(formatMoneyMinor(490000, "RUB", "ru")).toBe("4 900 ₽");
    expect(formatMoneyMinor(490000, "RUB", "en")).toBe("RUB 4,900");
  });

  it("formats product prices with subscription period suffixes", () => {
    expect(formatProductPrice(product, productCopyByLocale.ru, "ru")).toEqual({
      amount: "4 900 ₽",
      suffix: ""
    });
    expect(
      formatProductPrice(
        {
          ...product,
          paymentModel: "sub",
          subscriptionPeriod: "month",
          priceMinor: 99000
        },
        productCopyByLocale.ru,
        "ru"
      )
    ).toEqual({
      amount: "990 ₽",
      suffix: "/мес"
    });
  });

  it("creates compact card summaries from product responses and localized labels", () => {
    expect(createProductCardSummary(product, productCopyByLocale.ru, "ru")).toEqual({
      typeLabel: "Разовая консультация",
      statusLabel: "Активен",
      statusTone: "active",
      price: {
        amount: "4 900 ₽",
        suffix: ""
      },
      metaLine: "Видео · 60 мин",
      salesLabel: "Продаж",
      salesCount: "47",
      revenueLabel: "230 300 ₽",
      ratingLabel: "4.9"
    });
  });

  it("creates localized duplicate product titles outside the backend domain", () => {
    expect(createDuplicateProductTitle("Натальный разбор", productCopyByLocale.ru)).toBe(
      "Натальный разбор (копия)"
    );
    expect(createDuplicateProductTitle("Natal reading", productCopyByLocale.en)).toBe(
      "Natal reading (copy)"
    );
  });

  it("does not render unavailable analytics as real zero metrics", () => {
    expect(
      createProductCardSummary(
        {
          ...product,
          analytics: {
            ...product.analytics,
            status: "unavailable",
            salesCount: 0,
            grossRevenueMinor: 0,
            averageRating: null
          }
        },
        productCopyByLocale.ru,
        "ru"
      )
    ).toMatchObject({
      salesCount: "—",
      revenueLabel: "—",
      ratingLabel: null
    });
  });
});
