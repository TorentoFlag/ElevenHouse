import { useState } from "react";
import { useI18n } from "@elevenhouse/i18n";
import type { ProductStatusFilter, ProductType } from "@elevenhouse/contracts";
import { useDocumentTitle } from "../../common/hooks/useDocumentTitle";
import type { AstrologerCopy } from "../../common/i18n/astrologerCopy";
import { productCopyByLocale } from "../../features/products/model/productCopy";
import {
  createDefaultProductDraft,
  toCreateProductRequest,
  type ProductFormDraft
} from "../../features/products/model/productDraft";
import { useCreateProductMutation } from "../../features/products/model/useCreateProductMutation";
import { useProductListQuery } from "../../features/products/model/useProductListQuery";
import { useProductSummaryQuery } from "../../features/products/model/useProductSummaryQuery";
import { ProductCreateTypeModal } from "./components/ProductCreateTypeModal";
import { ProductEditorModal } from "./components/ProductEditorModal";
import { ProductsPageView } from "./ProductsPageView";

const productsPageSize = 50;

export function ProductsPage() {
  const { dictionary, locale } = useI18n<AstrologerCopy>();
  const [selectedStatus, setSelectedStatus] = useState<ProductStatusFilter>("all");
  const [isCreateTypeModalOpen, setIsCreateTypeModalOpen] = useState(false);
  const [editorDraft, setEditorDraft] = useState<ProductFormDraft | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const productsQuery = useProductListQuery({
    status: selectedStatus,
    limit: productsPageSize,
    offset: 0
  });
  const summaryQuery = useProductSummaryQuery();
  const createProductMutation = useCreateProductMutation();
  const productCopy = productCopyByLocale[locale];

  useDocumentTitle(dictionary.products.documentTitle);

  return (
    <>
      <ProductsPageView
        copy={dictionary.products}
        locale={locale}
        products={productsQuery.data?.products ?? []}
        summary={summaryQuery.data ?? null}
        counts={
          productsQuery.data?.counts ?? {
            all: 0,
            active: 0,
            draft: 0,
            archived: 0
          }
        }
        selectedStatus={selectedStatus}
        isLoading={productsQuery.isLoading || summaryQuery.isLoading}
        isError={productsQuery.isError || summaryQuery.isError}
        onStatusChange={setSelectedStatus}
        onCreate={() => {
          setEditorError(null);
          setIsCreateTypeModalOpen(true);
        }}
      />

      {isCreateTypeModalOpen ? (
        <ProductCreateTypeModal
          copy={dictionary.products.createTypeModal}
          types={productCopy.types}
          onSelect={(type: ProductType) => {
            setIsCreateTypeModalOpen(false);
            setEditorError(null);
            setEditorDraft(createDefaultProductDraft(type));
          }}
          onClose={() => setIsCreateTypeModalOpen(false)}
        />
      ) : null}

      {editorDraft ? (
        <ProductEditorModal
          copy={dictionary.products.editor}
          productType={productCopy.types[editorDraft.type]}
          draft={editorDraft}
          isSaving={createProductMutation.isPending}
          error={editorError}
          onDraftChange={(nextDraft) => {
            setEditorError(null);
            setEditorDraft(nextDraft);
          }}
          onSave={async () => {
            if (createProductMutation.isPending || !editorDraft.title.trim()) {
              return;
            }

            setEditorError(null);

            try {
              await createProductMutation.mutateAsync(toCreateProductRequest(editorDraft));
              setEditorDraft(null);
            } catch {
              setEditorError(dictionary.products.editor.genericError);
            }
          }}
          onClose={() => {
            if (!createProductMutation.isPending) {
              setEditorDraft(null);
              setEditorError(null);
            }
          }}
        />
      ) : null}
    </>
  );
}
