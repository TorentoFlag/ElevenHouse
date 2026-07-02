import { useState } from "react";
import { useI18n } from "@elevenhouse/i18n";
import type { ProductStatusFilter } from "@elevenhouse/contracts";
import { useDocumentTitle } from "../../common/hooks/useDocumentTitle";
import type { AstrologerCopy } from "../../common/i18n/astrologerCopy";
import { useProductListQuery } from "../../features/products/model/useProductListQuery";
import { useProductSummaryQuery } from "../../features/products/model/useProductSummaryQuery";
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

  useDocumentTitle(dictionary.products.documentTitle);

  return (
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
      onCreate={() => undefined}
    />
  );
}
