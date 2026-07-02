import type { ProductCopy } from "../../../features/products/model/productCopy";
import type { ProductCreateFlow } from "../hooks/useProductCreateFlow";
import { ProductCreateTypeModal, type ProductCreateTypeModalCopy } from "./ProductCreateTypeModal";
import { ProductEditorModal, type ProductEditorModalCopy } from "./ProductEditorModal";

export type ProductsCreateFlowCopy = {
  readonly createTypeModal: ProductCreateTypeModalCopy;
  readonly editor: ProductEditorModalCopy;
};

export type ProductsCreateFlowProps = {
  readonly copy: ProductsCreateFlowCopy;
  readonly productCopy: ProductCopy;
  readonly flow: ProductCreateFlow;
};

export function ProductsCreateFlow({ copy, productCopy, flow }: ProductsCreateFlowProps) {
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
        <ProductEditorModal
          copy={copy.editor}
          productType={productCopy.types[flow.editorDraft.type]}
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
