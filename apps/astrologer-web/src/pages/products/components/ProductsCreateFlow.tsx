import type { ProductCopy, ProductLocale } from "../../../features/products/model/productCopy";
import type { ProductCreateFlow } from "../hooks/useProductCreateFlow";
import { ProductConstructorModal, type ProductConstructorModalCopy } from "./ProductConstructorModal";
import { ProductCreateTypeModal, type ProductCreateTypeModalCopy } from "./ProductCreateTypeModal";

export type ProductsCreateFlowCopy = {
  readonly createTypeModal: ProductCreateTypeModalCopy;
  readonly editor: ProductConstructorModalCopy;
};

export type ProductsCreateFlowProps = {
  readonly copy: ProductsCreateFlowCopy;
  readonly productCopy: ProductCopy;
  readonly locale: ProductLocale;
  readonly flow: ProductCreateFlow;
};

export function ProductsCreateFlow({ copy, productCopy, locale, flow }: ProductsCreateFlowProps) {
  return (
    <>
      {flow.isTypeModalOpen ? (
        <ProductCreateTypeModal
          copy={copy.createTypeModal}
          types={productCopy.types}
          onSelect={flow.selectType}
          onClose={flow.closeTypeSelection}
        />
      ) : null}

      {flow.editorDraft ? (
        <ProductConstructorModal
          copy={copy.editor}
          productCopy={productCopy}
          locale={locale}
          draft={flow.editorDraft}
          isSaving={flow.isSaving}
          error={flow.editorError}
          onDraftChange={flow.updateDraft}
          onSave={flow.saveDraft}
          onClose={flow.closeEditor}
        />
      ) : null}
    </>
  );
}
