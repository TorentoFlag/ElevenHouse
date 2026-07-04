import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createDefaultProductDraft } from "../../../../features/products/model/productDraft";
import { productCopyByLocale } from "../../../../features/products/model/productCopy";
import { createProductConstructorViewModel } from "../../../../features/products/model/productConstructorViewModel";
import { ProductConstructorEditor } from "./components/ProductConstructorEditor";
import { ProductConstructorHeader } from "./components/ProductConstructorHeader";
import { ProductConstructorPreviewColumn } from "./components/ProductConstructorPreviewColumn";
import { constructorUiCopyByLocale } from "./helpers/constructorUiCopy";
import { useProductConstructorController } from "./hooks/useProductConstructorController";

describe("ProductConstructorModal architecture", () => {
  it("keeps ProductConstructorModal as a thin shell", () => {
    const source = readFileSync(
      "apps/astrologer-web/src/pages/products/components/ProductConstructorModal/ProductConstructorModal.tsx",
      "utf8"
    );

    expect(source.split("\n").length).toBeLessThanOrEqual(260);
    expect(source).toContain("<ProductConstructorHeader");
    expect(source).toContain("<ProductConstructorEditor");
    expect(source).toContain("<ProductConstructorPreviewColumn");
    expect(source).not.toContain("constructorSectionPlain");
  });

  it("exposes product constructor sections as component boundaries", () => {
    expect(ProductConstructorHeader).toBeTypeOf("function");
    expect(ProductConstructorEditor).toBeTypeOf("function");
    expect(ProductConstructorPreviewColumn).toBeTypeOf("function");
  });

  it("keeps product constructor view-model in the feature model layer", () => {
    const draft = createDefaultProductDraft("custom");
    const viewModel = createProductConstructorViewModel({
      draft,
      productCopy: productCopyByLocale.ru,
      locale: "ru",
      uiCopy: constructorUiCopyByLocale.ru
    });

    expect(viewModel.preview.priceLabel).toBe("7 900 ₽");
    expect(viewModel.autoIncludedItems.map((item) => item.key)).toEqual(
      expect.arrayContaining(["fmt", "rec", "met-natal"])
    );
    expect(viewModel.cabinetArtifacts.map((artifact) => artifact.label)).toContain(
      "Заметки астролога"
    );
  });

  it("keeps draft mutations in a controller boundary", () => {
    const draft = createDefaultProductDraft("custom");
    const onDraftChange = vi.fn();
    const controller = useProductConstructorController({
      draft,
      productCopy: productCopyByLocale.ru,
      locale: "ru",
      onDraftChange
    });

    controller.actions.updateDraft({ title: "Натальный разбор" });
    expect(onDraftChange).toHaveBeenLastCalledWith({ ...draft, title: "Натальный разбор" });

    controller.actions.addCustomIncludedItem(" Новый пункт ");
    expect(onDraftChange).toHaveBeenLastCalledWith({
      ...draft,
      includedItems: [...draft.includedItems, { text: "Новый пункт", icon: "check", order: 30 }]
    });

    controller.actions.toggleDeliveryFormat("video");
    expect(onDraftChange).toHaveBeenCalledTimes(2);
  });
});
