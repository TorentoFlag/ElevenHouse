import type { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import {
  archiveProductMutationOptions,
  createProductMutationOptions,
  duplicateProductMutationOptions,
  moveProductToDraftMutationOptions,
  productDetailQueryOptions,
  productListQueryOptions,
  productSummaryQueryOptions,
  productsQueryKeys,
  publishProductMutationOptions,
  updateProductMutationOptions
} from "./productsQueryOptions";

describe("products query options", () => {
  it("creates stable product query keys for list, summary and detail data", () => {
    const query = { status: "active", limit: 20, offset: 0 } as const;

    expect(productsQueryKeys.all()).toEqual(["products"]);
    expect(productsQueryKeys.list(query)).toEqual(["products", "list", query]);
    expect(productsQueryKeys.summary()).toEqual(["products", "summary"]);
    expect(productsQueryKeys.detail("product_1")).toEqual(["products", "detail", "product_1"]);
    expect(productListQueryOptions(query).queryKey).toEqual(["products", "list", query]);
    expect(productSummaryQueryOptions().queryKey).toEqual(["products", "summary"]);
    expect(productDetailQueryOptions("product_1").queryKey).toEqual([
      "products",
      "detail",
      "product_1"
    ]);
  });

  it("invalidates all product queries after product mutations succeed", async () => {
    const invalidateQueries = vi.fn(async () => undefined);
    const queryClient = { invalidateQueries } satisfies Pick<QueryClient, "invalidateQueries">;

    await createProductMutationOptions(queryClient).onSuccess();
    await updateProductMutationOptions(queryClient).onSuccess();
    await publishProductMutationOptions(queryClient).onSuccess();
    await moveProductToDraftMutationOptions(queryClient).onSuccess();
    await archiveProductMutationOptions(queryClient).onSuccess();
    await duplicateProductMutationOptions(queryClient).onSuccess();

    expect(invalidateQueries).toHaveBeenCalledTimes(6);
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: productsQueryKeys.all() });
  });
});
