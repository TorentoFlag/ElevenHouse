import { useState } from "react";
import { useI18n } from "@elevenhouse/i18n";
import type { ProductResponse, ProductStatusFilter } from "@elevenhouse/contracts";
import { useDocumentTitle } from "../../common/hooks/useDocumentTitle";
import type { AstrologerCopy } from "../../common/i18n/astrologerCopy";
import { productCopyByLocale } from "../../features/products/model/productCopy";
import { useArchiveProductMutation } from "../../features/products/model/useArchiveProductMutation";
import { useDuplicateProductMutation } from "../../features/products/model/useDuplicateProductMutation";
import { useMoveProductToDraftMutation } from "../../features/products/model/useMoveProductToDraftMutation";
import { useProductListQuery } from "../../features/products/model/useProductListQuery";
import { useProductSummaryQuery } from "../../features/products/model/useProductSummaryQuery";
import { usePublishProductMutation } from "../../features/products/model/usePublishProductMutation";
import { ProductsCreateFlow } from "./components/ProductsCreateFlow";
import { useProductCreateFlow } from "./hooks/useProductCreateFlow";
import { ProductsPageView } from "./ProductsPageView";

const productsPageSize = 50;

export function ProductsPage() {
  const { dictionary, locale } = useI18n<AstrologerCopy>();
  const [selectedStatus, setSelectedStatus] = useState<ProductStatusFilter>("all");
  const productsQuery = useProductListQuery({
    status: selectedStatus,
    limit: productsPageSize,
    offset: 0
  });
  const summaryQuery = useProductSummaryQuery();
  const productCopy = productCopyByLocale[locale];
  const createFlow = useProductCreateFlow(dictionary.products.saveErrorLabel);
  const publishMutation = usePublishProductMutation();
  const moveToDraftMutation = useMoveProductToDraftMutation();
  const archiveMutation = useArchiveProductMutation();
  const duplicateMutation = useDuplicateProductMutation();
  const products = productsQuery.data?.products ?? [];
  const counts = productsQuery.data?.counts ?? {
    all: 0,
    active: 0,
    draft: 0,
    archived: 0
  };
  const isLoading = productsQuery.isLoading || summaryQuery.isLoading;
  const isError = productsQuery.isError || summaryQuery.isError;
  const handleProductStatusChange = (productId: string, status: ProductResponse["status"]) => {
    const mutation =
      status === "active"
        ? publishMutation
        : status === "draft"
          ? moveToDraftMutation
          : archiveMutation;

    void mutation.mutateAsync(productId);
  };

  useDocumentTitle(dictionary.products.documentTitle);

  return (
    <>
      <ProductsPageView
        copy={dictionary.products}
        locale={locale}
        products={products}
        summary={summaryQuery.data ?? null}
        counts={counts}
        selectedStatus={selectedStatus}
        isLoading={isLoading}
        isError={isError}
        onStatusChange={setSelectedStatus}
        onCreate={createFlow.openTypeSelection}
        onEditProduct={createFlow.editProduct}
        onDuplicateProduct={(productId) => {
          void duplicateMutation.mutateAsync(productId);
        }}
        onProductStatusChange={handleProductStatusChange}
      />
      <ProductsCreateFlow
        copy={dictionary.products}
        productCopy={productCopy}
        locale={locale}
        flow={createFlow}
      />
    </>
  );
}
