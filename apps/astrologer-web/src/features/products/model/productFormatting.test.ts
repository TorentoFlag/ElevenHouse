import type { ProductResponse } from "@elevenhouse/contracts";
import { describe, expect, it } from "vitest";
import { productCopyByLocale } from "./productCopy";
import { createProductCardSummary } from "./productFormatting";

const baseProduct = {
  id: "11111111-1111-4111-8111-111111111111",
  ownerUserId: "22222222-2222-4222-8222-222222222222",
  type: "async",
  title: "Асинхронный продукт",
  subtitle: null,
  priceMinor: 150000,
  currency: "RUB",
  coverMediaId: null,
  coverMedia: null,
  introVideoUrl: null,
  executionMode: "async",
  paymentModel: "once",
  durationMinutes: null,
  durationLabel: null,
  slaLabel: null,
  packageSessionCount: null,
  packageDiscountPercent: null,
  subscriptionPeriod: "month",
  trialDays: null,
  participantMode: "solo",
  groupSize: null,
  deliveryFormats: ["chat", "audio", "file"],
  requiredClientData: [],
  methods: [],
  accessGrants: [],
  astroDiaryConfig: null,
  includedItems: [],
  modifiers: [],
  status: "active",
  revision: 1,
  analytics: {
    status: "ready",
    salesCount: 0,
    grossRevenueMinor: 0,
    currency: "RUB",
    averageRating: null,
    reviewsCount: 0
  },
  createdAt: "2026-08-19T00:00:00.000Z",
  updatedAt: "2026-08-19T00:00:00.000Z"
} satisfies ProductResponse;

describe("createProductCardSummary", () => {
  it("labels AstroDiary paid-period products as journal access, not generic async reading", () => {
    const product = {
      ...baseProduct,
      title: "Астродневник",
      accessGrants: ["journal"],
      astroDiaryConfig: {
        reflectionCyclesPerPeriod: 4,
        responseSlaWorkingDays: 2,
        clientResponseWindowCalendarDays: 7,
        workingWeekdays: [1, 2, 3, 4, 5],
        serviceTimezone: "Europe/Moscow"
      }
    } satisfies ProductResponse;

    expect(createProductCardSummary(product, productCopyByLocale.ru, "ru").typeLabel).toBe(
      "Астродневник"
    );
    expect(createProductCardSummary(product, productCopyByLocale.en, "en").typeLabel).toBe(
      "Astro journal"
    );
  });

  it("keeps ordinary async products labelled as recorded readings", () => {
    expect(createProductCardSummary(baseProduct, productCopyByLocale.ru, "ru").typeLabel).toBe(
      "Разбор в записи"
    );
  });
});
