import type { ProductDeliveryFormat } from "@elevenhouse/contracts";
import {
  addProductModifier,
  applyProductDraftPatch,
  removeProductIncludedItem,
  removeProductModifier,
  toggleProductDraftArrayValue,
  updateProductIncludedItem,
  updateProductModifier,
  type ProductDraftArrayKey,
  type ProductDraftArrayValue,
  type ProductFormDraft
} from "../../../../../features/products/model/productDraft";
import type {
  ProductCopy,
  ProductLocale
} from "../../../../../features/products/model/productCopy";
import {
  createProductConstructorViewModel,
  getNextIncludedItemOrder
} from "../../../../../features/products/model/productConstructorViewModel";
import { productIconNames } from "../../../../../features/products/model/productConstructorOptions";
import { resolveProductIconName } from "../../../../../features/products/model/productIcons";
import { constructorUiCopyByLocale } from "../helpers/constructorUiCopy";

export type ProductConstructorController = ReturnType<typeof useProductConstructorController>;

export function useProductConstructorController({
  draft,
  productCopy,
  locale,
  onDraftChange
}: {
  readonly draft: ProductFormDraft;
  readonly productCopy: ProductCopy;
  readonly locale: ProductLocale;
  readonly onDraftChange: (draft: ProductFormDraft) => void;
}) {
  const uiCopy = constructorUiCopyByLocale[locale];
  const viewModel = createProductConstructorViewModel({ draft, productCopy, locale, uiCopy });
  const updateDraft = (patch: Partial<ProductFormDraft>) => {
    onDraftChange(applyProductDraftPatch(draft, patch));
  };

  return {
    uiCopy,
    viewModel,
    actions: {
      updateDraft,
      addCustomIncludedItem(text: string) {
        const nextText = text.trim();

        if (!nextText) {
          return;
        }

        onDraftChange({
          ...draft,
          includedItems: [
            ...draft.includedItems,
            {
              text: nextText,
              icon: "check",
              order: getNextIncludedItemOrder(draft)
            }
          ]
        });
      },
      toggleDeliveryFormat(value: ProductDeliveryFormat) {
        if (draft.deliveryFormats.includes(value) && draft.deliveryFormats.length === 1) {
          return;
        }

        onDraftChange(toggleProductDraftArrayValue(draft, "deliveryFormats", value));
      },
      toggleArrayValue<TKey extends Exclude<ProductDraftArrayKey, "deliveryFormats">>(
        key: TKey,
        value: ProductDraftArrayValue<TKey>
      ) {
        onDraftChange(toggleProductDraftArrayValue(draft, key, value));
      },
      updateIncludedItem(index: number, patch: Parameters<typeof updateProductIncludedItem>[2]) {
        onDraftChange(updateProductIncludedItem(draft, index, patch));
      },
      cycleIncludedItemIcon(index: number, icon: string) {
        const selectedIcon = resolveProductIconName(icon);
        const currentIconIndex = productIconNames.indexOf(selectedIcon);
        const nextIcon = productIconNames[(currentIconIndex + 1) % productIconNames.length];

        onDraftChange(updateProductIncludedItem(draft, index, { icon: nextIcon }));
      },
      removeIncludedItem(index: number) {
        onDraftChange(removeProductIncludedItem(draft, index));
      },
      addModifier() {
        onDraftChange(addProductModifier(draft));
      },
      updateModifier(index: number, patch: Parameters<typeof updateProductModifier>[2]) {
        onDraftChange(updateProductModifier(draft, index, patch));
      },
      removeModifier(index: number) {
        onDraftChange(removeProductModifier(draft, index));
      }
    }
  };
}
