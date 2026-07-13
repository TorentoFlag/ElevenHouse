import type { ProductCopy, ProductLocale } from "../../../features/products/model/productCopy";
import type { ProductCreateFlow } from "../hooks/useProductCreateFlow";
import {
  ProductConstructorModal,
  type ProductConstructorModalCopy
} from "./ProductConstructorModal";
import { ProductCreateTypeModal, type ProductCreateTypeModalCopy } from "./ProductCreateTypeModal";
import styles from "../ProductsPage.module.css";

export type ProductsCreateFlowCopy = {
  readonly createTypeModal: ProductCreateTypeModalCopy;
  readonly editor: ProductConstructorModalCopy;
};

export type ProductsCreateFlowProps = {
  readonly copy: ProductsCreateFlowCopy;
  readonly productCopy: ProductCopy;
  readonly locale: ProductLocale;
  readonly flow: ProductCreateFlow;
  readonly modalTarget?: HTMLElement | null;
};

export function ProductsCreateFlow({
  copy,
  productCopy,
  locale,
  flow,
  modalTarget
}: ProductsCreateFlowProps) {
  return (
    <>
      {flow.isTypeModalOpen ? (
        <ProductCreateTypeModal
          copy={copy.createTypeModal}
          types={productCopy.types}
          templates={flow.productTemplates}
          isTemplateLoading={flow.isProductTemplatesLoading}
          isTemplateError={flow.isProductTemplatesError}
          isTemplateActionPending={flow.isTemplateActionPending}
          templateSelectionError={flow.templateSelectionError}
          portalTarget={modalTarget}
          backdropClassName={styles.productScopedModalBackdrop}
          onSelectTemplate={flow.selectTemplate}
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
          isCoverUploading={flow.isCoverUploading}
          coverMediaUrl={flow.coverMediaUrl}
          error={flow.editorError}
          coverUploadError={flow.coverUploadError}
          portalTarget={modalTarget}
          backdropClassName={styles.productScopedModalBackdrop}
          onDraftChange={flow.updateDraft}
          onSave={flow.saveDraft}
          onPublish={flow.publishDraft}
          onCoverFileSelected={flow.uploadProductCover}
          onCoverRemove={flow.removeProductCover}
          onClose={flow.closeEditor}
        />
      ) : null}
    </>
  );
}
