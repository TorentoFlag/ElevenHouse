import { describe, expect, it } from "vitest";

import { normalizeAstroDiaryProductDraft } from "./astroDiaryProductDraft";
import {
  createProductPreview,
  getProductConstructorTypeLabel
} from "./productConstructorViewModel";
import { productCopyByLocale } from "./productCopy";
import { createDefaultProductDraft } from "./productDraft";

const previewCopy = {
  bookLabel: "Записаться",
  subscribeLabel: "Подписаться",
  getLabel: "Получить",
  personalConsultationLabel: "Персональная консультация",
  durationSuffix: " мин"
};

describe("createProductPreview", () => {
  it("uses AstroDiary as the preview category for one-time journal access products", () => {
    const draft = normalizeAstroDiaryProductDraft(createDefaultProductDraft("async"));

    expect(
      createProductPreview(draft, productCopyByLocale.ru, "ru", previewCopy, []).categoryLabel
    ).toBe("Астродневник");
  });
});

describe("getProductConstructorTypeLabel", () => {
  it("uses AstroDiary as the constructor breadcrumb label for journal access products", () => {
    const draft = normalizeAstroDiaryProductDraft(createDefaultProductDraft("async"));

    expect(getProductConstructorTypeLabel(draft, productCopyByLocale.ru)).toBe("Астродневник");
  });
});
