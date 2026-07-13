import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { useArchiveProductMutation } from "./useArchiveProductMutation";
import { useCreateProductFromTemplateMutation } from "./useCreateProductFromTemplateMutation";
import { useDuplicateProductMutation } from "./useDuplicateProductMutation";
import { useMoveProductToDraftMutation } from "./useMoveProductToDraftMutation";
import { useProductTemplatesQuery } from "./useProductTemplatesQuery";
import { usePublishProductMutation } from "./usePublishProductMutation";
import { useUpdateProductMutation } from "./useUpdateProductMutation";
import {
  archiveProductMutationOptions,
  createProductFromTemplateMutationOptions,
  createProductMutationOptions,
  duplicateProductMutationOptions,
  moveProductToDraftMutationOptions,
  productDetailQueryOptions,
  productListQueryOptions,
  productSummaryQueryOptions,
  productTemplatesQueryOptions,
  productsQueryKeys,
  publishProductMutationOptions,
  updateProductMutationOptions
} from "./productsQueryOptions";

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useMutation: vi.fn((options: unknown) => options),
    useQuery: vi.fn((options: unknown) => options),
    useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() }))
  };
});

describe("products query options", () => {
  it("creates stable product query keys for list, summary and detail data", () => {
    const query = { status: "active", limit: 20, offset: 0 } as const;

    expect(productsQueryKeys.all()).toEqual(["products"]);
    expect(productsQueryKeys.list(query)).toEqual(["products", "list", query]);
    expect(productsQueryKeys.summary()).toEqual(["products", "summary"]);
    expect(productsQueryKeys.detail("product_1")).toEqual(["products", "detail", "product_1"]);
    expect(productsQueryKeys.templates("ru")).toEqual(["products", "templates", "ru"]);
    expect(productListQueryOptions(query).queryKey).toEqual(["products", "list", query]);
    expect(productSummaryQueryOptions().queryKey).toEqual(["products", "summary"]);
    expect(productDetailQueryOptions("product_1").queryKey).toEqual([
      "products",
      "detail",
      "product_1"
    ]);
    expect(productTemplatesQueryOptions("ru").queryKey).toEqual(["products", "templates", "ru"]);
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
    await createProductFromTemplateMutationOptions(queryClient).onSuccess();

    expect(invalidateQueries).toHaveBeenCalledTimes(7);
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: productsQueryKeys.all() });
  });

  it("creates React Query mutation hooks for all product actions", () => {
    expect(useUpdateProductMutation()).toHaveProperty("mutationFn");
    expect(usePublishProductMutation()).toHaveProperty("mutationFn");
    expect(useMoveProductToDraftMutation()).toHaveProperty("mutationFn");
    expect(useArchiveProductMutation()).toHaveProperty("mutationFn");
    expect(useDuplicateProductMutation()).toHaveProperty("mutationFn");
    expect(useCreateProductFromTemplateMutation()).toHaveProperty("mutationFn");
    expect(useProductTemplatesQuery("ru")).toHaveProperty("queryFn");
    expect(useQueryClient).toHaveBeenCalled();
    expect(useMutation).toHaveBeenCalled();
    expect(useQuery).toHaveBeenCalled();
  });
});
