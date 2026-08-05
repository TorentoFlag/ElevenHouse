import { useState } from "react";
import { useNavigate } from "react-router";
import { useI18n } from "@elevenhouse/i18n";
import type { ProductResponse, ProductStatusFilter } from "@elevenhouse/contracts";
import { useDocumentTitle } from "../../common/hooks/useDocumentTitle";
import type { AstrologerCopy } from "../../common/i18n/astrologerCopy";
import { productCopyByLocale } from "../../features/products/model/productCopy";
import { createDuplicateProductTitle } from "../../features/products/model/productFormatting";
import { useArchiveProductMutation } from "../../features/products/model/useArchiveProductMutation";
import { useDuplicateProductMutation } from "../../features/products/model/useDuplicateProductMutation";
import { useMoveProductToDraftMutation } from "../../features/products/model/useMoveProductToDraftMutation";
import { useProductListQuery } from "../../features/products/model/useProductListQuery";
import { useProductSummaryQuery } from "../../features/products/model/useProductSummaryQuery";
import { useAstrologerTariffEntitlementsQuery } from "../../features/platform-tariffs/model/useAstrologerTariffEntitlementsQuery";
import { usePublishProductMutation } from "../../features/products/model/usePublishProductMutation";
import { ProductsCreateFlow } from "./components/ProductsCreateFlow";
import { useProductCreateFlow } from "./hooks/useProductCreateFlow";
import { ProductsPageView } from "./ProductsPageView";

const productsPageSize = 50;

export function ProductsPage() {
  const { dictionary, locale } = useI18n<AstrologerCopy>();
  const navigate = useNavigate();
  const [selectedStatus, setSelectedStatus] = useState<ProductStatusFilter>("all");
  const [modalTarget, setModalTarget] = useState<HTMLElement | null>(null);
  const productsQuery = useProductListQuery({
    status: selectedStatus,
    limit: productsPageSize,
    offset: 0
  });
  const summaryQuery = useProductSummaryQuery();
  const entitlementsQuery = useAstrologerTariffEntitlementsQuery();
  const productCopy = productCopyByLocale[locale];
  const createFlow = useProductCreateFlow(locale, dictionary.products.saveErrorLabel);
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
  const isTariffLocked =
    entitlementsQuery.data?.products.read !== "allow" &&
    entitlementsQuery.data?.products.read !== "read_only";
  const canManageProducts = entitlementsQuery.data?.products.mutation === "allow";
  const isError = !isTariffLocked && (productsQuery.isError || summaryQuery.isError);
  const isProductActionPending =
    duplicateMutation.isPending ||
    publishMutation.isPending ||
    moveToDraftMutation.isPending ||
    archiveMutation.isPending;
  const handleProductStatusChange = (productId: string, status: ProductResponse["status"]) => {
    const mutation =
      status === "active"
        ? publishMutation
        : status === "draft"
          ? moveToDraftMutation
          : archiveMutation;

    mutation.mutate(productId);
  };

  useDocumentTitle(dictionary.products.documentTitle);

  return (
    <>
      <ProductsPageView
        modalScopeRef={setModalTarget}
        copy={dictionary.products}
        locale={locale}
        products={products}
        summary={summaryQuery.data ?? null}
        counts={counts}
        selectedStatus={selectedStatus}
        isLoading={isLoading}
        isError={isError}
        isTariffLocked={isTariffLocked}
        canManageProducts={canManageProducts}
        isProductActionPending={isProductActionPending}
        onStatusChange={setSelectedStatus}
        onCreate={createFlow.openTypeSelection}
        onManageTariff={() => navigate("/settings")}
        onEditProduct={createFlow.editProduct}
        onDuplicateProduct={(product) => {
          duplicateMutation.mutate({
            productId: product.id,
            body: {
              title: createDuplicateProductTitle(product.title, productCopy)
            }
          });
        }}
        onProductStatusChange={handleProductStatusChange}
      />
      {!isTariffLocked ? (
        <ProductsCreateFlow
          copy={dictionary.products}
          productCopy={productCopy}
          locale={locale}
          flow={createFlow}
          modalTarget={modalTarget}
        />
      ) : null}
    </>
  );
}
