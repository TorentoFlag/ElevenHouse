import type { ProductIncludedItemRequest, ProductResponse } from "@elevenhouse/contracts";
import type { UpdateProductInput } from "../api/updateProduct";
import {
  toCreateProductRequest,
  toUpdateProductRequest,
  type ProductFormDraft
} from "./productDraft";

export type PersistProductDraftResult =
  | { readonly status: "saved" }
  | { readonly status: "failed"; readonly persistedProduct?: ProductResponse };

export type PersistProductDraftInput = {
  readonly draft: ProductFormDraft;
  readonly visibleIncludedItems?: readonly ProductIncludedItemRequest[];
  readonly editingProductId: string | null;
  readonly publish: boolean;
  readonly createProduct: (
    body: ReturnType<typeof toCreateProductRequest>
  ) => Promise<ProductResponse>;
  readonly updateProduct: (input: UpdateProductInput) => Promise<ProductResponse>;
  readonly publishProduct: (productId: string) => Promise<ProductResponse>;
};

export async function persistProductDraft({
  draft,
  visibleIncludedItems,
  editingProductId,
  publish,
  createProduct,
  updateProduct,
  publishProduct
}: PersistProductDraftInput): Promise<PersistProductDraftResult> {
  let persistedProduct: ProductResponse | undefined;
  const requestDraft = visibleIncludedItems
    ? { ...draft, includedItems: visibleIncludedItems }
    : draft;

  try {
    persistedProduct = editingProductId
      ? await updateProduct({
          productId: editingProductId,
          body: toUpdateProductRequest(requestDraft)
        })
      : await createProduct(toCreateProductRequest(requestDraft));

    if (publish) {
      await publishProduct(persistedProduct.id);
    }

    return { status: "saved" };
  } catch {
    return persistedProduct ? { status: "failed", persistedProduct } : { status: "failed" };
  }
}
