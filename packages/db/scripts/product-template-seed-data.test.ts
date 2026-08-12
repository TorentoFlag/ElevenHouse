import { describe, expect, it } from "vitest";
import { createProductRequestSchema } from "@elevenhouse/contracts/products";
import { productTypeValues } from "@elevenhouse/validation/products";
import { productTemplateSeedData } from "./product-template-seed-data";

describe("product template seed data", () => {
  it("contains localized profession-neutral templates for every product type", () => {
    expect(productTemplateSeedData).toHaveLength(16);
    expect(new Set(productTemplateSeedData.map((template) => template.locale))).toEqual(
      new Set(["ru", "en"])
    );
    expect(new Set(productTemplateSeedData.map((template) => template.type))).toEqual(
      new Set(productTypeValues)
    );
  });

  it("defines separate RU and EN AstroDiary subscription templates with exact defaults", () => {
    const templates = productTemplateSeedData.filter(
      (template) => template.code === "astro_diary_subscription"
    );

    expect(templates).toHaveLength(2);
    expect(templates.map((template) => template.locale)).toEqual(["ru", "en"]);
    for (const template of templates) {
      expect(template.payload).toMatchObject({
        type: "sub",
        priceMinor: 0,
        currency: "RUB",
        executionMode: "async",
        paymentModel: "sub",
        subscriptionPeriod: "month",
        participantMode: "solo",
        deliveryFormats: ["chat", "audio", "file"],
        requiredClientData: [],
        methods: [],
        accessGrants: ["journal"],
        astroDiaryConfig: {
          reflectionCyclesPerPeriod: 4,
          responseSlaWorkingDays: 2,
          clientResponseWindowCalendarDays: 7,
          workingWeekdays: [1, 2, 3, 4, 5],
          serviceTimezone: "UTC"
        }
      });
      expect(template.payload).not.toHaveProperty("trialDays");
      expect(template.payload).not.toHaveProperty("slaLabel");
    }
  });

  it("keeps template identity unique by code and locale", () => {
    const identities = productTemplateSeedData.map(
      (template) => `${template.code}:${template.locale}`
    );

    expect(new Set(identities).size).toBe(identities.length);
  });

  it("stores create-product-compatible payloads without owner-specific fields", () => {
    for (const template of productTemplateSeedData) {
      expect(template.code).toMatch(/^[a-z0-9_]{3,80}$/);
      expect(template.title.trim().length).toBeGreaterThan(0);
      expect(template.sortOrder).toBeGreaterThanOrEqual(0);

      const payload = createProductRequestSchema.parse(template.payload);

      expect(payload.type).toBe(template.type);
      expect(payload).not.toHaveProperty("ownerUserId");
      expect(payload).not.toHaveProperty("status");
      expect(payload.coverMediaId).toBeUndefined();
    }
  });

  it("keeps every English user-facing payload field fully localized", () => {
    const englishTemplates = productTemplateSeedData.filter((template) => template.locale === "en");

    const userFacingCopy = englishTemplates.flatMap((template) => [
      template.title,
      template.subtitle ?? "",
      template.description ?? "",
      template.payload.title,
      template.payload.subtitle ?? "",
      template.payload.durationLabel ?? "",
      template.payload.slaLabel ?? "",
      ...template.payload.includedItems.map((item) => item.text),
      ...template.payload.modifiers.map((modifier) => modifier.label)
    ]);

    expect(userFacingCopy.join(" ")).not.toMatch(/[А-Яа-яЁё]/);
  });
});
