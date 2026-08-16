import { describe, expect, it } from "vitest";
import { createDefaultProductDraft } from "../../../../../features/products/model/productDraft";
import { productCopyByLocale } from "../../../../../features/products/model/productCopy";
import {
  createAutoIncludedItems,
  createClientCabinetArtifacts,
  createProductPreview,
  createVisibleIncludedItems,
  getNextIncludedItemOrder,
  majorValueToMinor,
  minorToMajorValue
} from "../../../../../features/products/model/productConstructorViewModel";
import { constructorUiCopyByLocale } from "./constructorUiCopy";
import {
  getProductPreviewIconName,
  getProductTypeIconName,
  resolveProductIconName
} from "../../../../../features/products/model/productIcons";

const uiCopy = constructorUiCopyByLocale.ru;

describe("ProductConstructorModal helpers", () => {
  it("keeps constructor UI copy outside the React component", () => {
    expect(constructorUiCopyByLocale.ru.publishLabel).toBe("Опубликовать");
    expect(constructorUiCopyByLocale.en.personalConsultationLabel).toBe("Personal consultation");
  });

  it("normalizes product icon names to supported design-system icons", () => {
    expect(resolveProductIconName("orbit")).toBe("orbit");
    expect(resolveProductIconName("unknown-icon")).toBe("check");
    expect(getProductTypeIconName("pack")).toBe("box");
    expect(getProductTypeIconName("course")).toBe("content");
  });

  it("builds visible included items from product blocks and removes duplicated custom text", () => {
    const draft = {
      ...createDefaultProductDraft("custom"),
      includedItems: [
        { text: "Запись сессии", icon: "video", order: 20 },
        { text: "Свой PDF", icon: "reference", order: 30 },
        { text: "", icon: "check", order: 40 }
      ]
    };

    const autoItems = createAutoIncludedItems(draft, productCopyByLocale.ru, uiCopy);
    const visibleItems = createVisibleIncludedItems(draft, autoItems, []);

    expect(autoItems.map((item) => item.key)).toEqual(
      expect.arrayContaining(["fmt", "rec", "met-natal"])
    );
    expect(visibleItems.map((item) => item.text)).toEqual([
      "Видео · 60 мин",
      "Запись сессии",
      "Разбор натальной карты",
      "Свой PDF"
    ]);
    expect(getNextIncludedItemOrder(draft)).toBe(50);
  });

  it("builds preview and cabinet artifacts without depending on React rendering", () => {
    const draft = {
      ...createDefaultProductDraft("custom"),
      title: "Астрография",
      priceMinor: 790000,
      methods: ["forecast" as const],
      accessGrants: ["records" as const],
      modifiers: [
        {
          label: "PDF-карта",
          priceMinor: 99000,
          kind: "fixed" as const,
          isEnabled: true,
          createsArtifact: true,
          order: 10
        }
      ]
    };
    const includedItems = createVisibleIncludedItems(
      draft,
      createAutoIncludedItems(draft, productCopyByLocale.ru, uiCopy),
      []
    );

    expect(getProductPreviewIconName(draft)).toBe("refresh");
    expect(
      createProductPreview(draft, productCopyByLocale.ru, "ru", uiCopy, includedItems)
    ).toMatchObject({
      categoryLabel: "Личная консультация",
      formatLine: "Видео · 60 мин",
      priceLabel: "7 900 ₽",
      actionLabel: "Записаться"
    });
    expect(
      createClientCabinetArtifacts(draft, productCopyByLocale.ru, uiCopy).map(
        (artifact) => artifact.label
      )
    ).toEqual([
      "Видео",
      "Прогноз (транзиты/соляр)",
      "Записи эфиров",
      "PDF-карта",
      "Заметки астролога"
    ]);
    expect(minorToMajorValue(790000)).toBe("7900");
    expect(majorValueToMinor("7 900 ₽")).toBe(790000);
  });
});
