import {
  productAccessGrantSchema,
  productDeliveryFormatSchema,
  productExecutionModeSchema,
  productMethodSchema,
  productParticipantModeSchema,
  productPaymentModelSchema,
  productRequiredClientDataSchema,
  productStatusFilterSchema,
  productStatusSchema,
  productSubscriptionPeriodSchema,
  productTypeSchema
} from "@elevenhouse/contracts";
import { describe, expect, it } from "vitest";
import { productCopyByLocale } from "./productCopy";

const productStatusFilterValues = ["all", "draft", "active", "archived"] as const;

describe("productCopyByLocale", () => {
  it("defines Russian and English labels for every product enum value used by contracts", () => {
    for (const copy of [productCopyByLocale.ru, productCopyByLocale.en]) {
      expect(Object.keys(copy.statuses).sort()).toEqual(productStatusSchema.options.slice().sort());
      expect(Object.keys(copy.statusFilters).sort()).toEqual(
        productStatusFilterValues.slice().sort()
      );
      for (const statusFilter of productStatusFilterValues) {
        expect(productStatusFilterSchema.parse(statusFilter)).toBe(statusFilter);
      }
      expect(Object.keys(copy.types).sort()).toEqual(productTypeSchema.options.slice().sort());
      expect(Object.keys(copy.deliveryFormats).sort()).toEqual(
        productDeliveryFormatSchema.options.slice().sort()
      );
      expect(Object.keys(copy.executionModes).sort()).toEqual(
        productExecutionModeSchema.options.slice().sort()
      );
      expect(Object.keys(copy.paymentModels).sort()).toEqual(
        productPaymentModelSchema.options.slice().sort()
      );
      expect(Object.keys(copy.subscriptionPeriods).sort()).toEqual(
        productSubscriptionPeriodSchema.options.slice().sort()
      );
      expect(Object.keys(copy.participantModes).sort()).toEqual(
        productParticipantModeSchema.options.slice().sort()
      );
      expect(Object.keys(copy.requiredClientData).sort()).toEqual(
        productRequiredClientDataSchema.options.slice().sort()
      );
      expect(Object.keys(copy.methods).sort()).toEqual(productMethodSchema.options.slice().sort());
      expect(Object.keys(copy.accessGrants).sort()).toEqual(
        productAccessGrantSchema.options.slice().sort()
      );
    }
  });

  it("keeps product labels aligned with the design reference terminology", () => {
    expect(productCopyByLocale.ru.types).toMatchObject({
      single: { label: "Разовая консультация" },
      pack: { label: "Пакет консультаций" },
      async: { label: "Разбор в записи" },
      sub: { label: "Подписка" },
      mini: { label: "Мини-продукт" },
      course: { label: "Курс" },
      custom: { label: "Свой формат" }
    });
    expect(productCopyByLocale.ru.statusFilters).toMatchObject({
      all: "Все",
      active: "Активные",
      draft: "Черновики",
      archived: "Архив"
    });
  });
});
