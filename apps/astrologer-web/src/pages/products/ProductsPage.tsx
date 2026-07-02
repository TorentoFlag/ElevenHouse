import { useState } from "react";
import { useI18n } from "@elevenhouse/i18n";
import type { ProductStatusFilter } from "@elevenhouse/contracts";
import { useDocumentTitle } from "../../common/hooks/useDocumentTitle";
import type { AstrologerCopy } from "../../common/i18n/astrologerCopy";
import { productCopyByLocale } from "../../features/products/model/productCopy";
import { useProductListQuery } from "../../features/products/model/useProductListQuery";
import { useProductSummaryQuery } from "../../features/products/model/useProductSummaryQuery";
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
  const createFlow = useProductCreateFlow(dictionary.products.editor.genericError);
  const products = productsQuery.data?.products ?? [];
  const counts = productsQuery.data?.counts ?? {
    all: 0,
    active: 0,
    draft: 0,
    archived: 0
  };
  const isLoading = productsQuery.isLoading || summaryQuery.isLoading;
  const isError = productsQuery.isError || summaryQuery.isError;

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
      />
      <ProductsCreateFlow copy={dictionary.products} productCopy={productCopy} flow={createFlow} />
    </>
  );
}
