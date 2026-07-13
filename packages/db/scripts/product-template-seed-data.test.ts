import { describe, expect, it } from "vitest";
import { createProductRequestSchema } from "@elevenhouse/contracts/products";
import { productTypeValues } from "@elevenhouse/validation/products";
import { productTemplateSeedData } from "./product-template-seed-data";

describe("product template seed data", () => {
  it("contains localized profession-neutral templates for every product type", () => {
    expect(productTemplateSeedData).toHaveLength(14);
    expect(new Set(productTemplateSeedData.map((template) => template.locale))).toEqual(
      new Set(["ru", "en"])
    );
    expect(new Set(productTemplateSeedData.map((template) => template.type))).toEqual(
      new Set(productTypeValues)
    );
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
