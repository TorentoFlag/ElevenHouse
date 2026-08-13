import type { ProductIncludedItemRequest, ProductResponse } from "@elevenhouse/contracts";
import type { ProductStatusTransitionInput } from "../api/publishProduct";
import type { UpdateProductInput } from "../api/updateProduct";
import {
  toCreateProductRequest,
  toUpdateProductRequest,
  type ProductFormDraft
} from "./productDraft";

export type PersistProductDraftResult =
  | { readonly status: "saved" }
  | {
      readonly status: "failed";
      readonly persistedProduct?: ProductResponse;
      readonly error: unknown;
    };

export type PersistProductDraftInput = {
  readonly draft: ProductFormDraft;
  readonly visibleIncludedItems?: readonly ProductIncludedItemRequest[];
  readonly editingProduct: Pick<ProductResponse, "id" | "revision"> | null;
  readonly publish: boolean;
  readonly createProduct: (
    body: ReturnType<typeof toCreateProductRequest>
  ) => Promise<ProductResponse>;
  readonly updateProduct: (input: UpdateProductInput) => Promise<ProductResponse>;
  readonly publishProduct: (input: ProductStatusTransitionInput) => Promise<ProductResponse>;
};

export async function persistProductDraft({
  draft,
  visibleIncludedItems,
  editingProduct,
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
    persistedProduct = editingProduct
      ? await updateProduct({
          productId: editingProduct.id,
          body: toUpdateProductRequest(requestDraft, editingProduct.revision)
        })
      : await createProduct(toCreateProductRequest(requestDraft));

    if (publish) {
      await publishProduct({
        productId: persistedProduct.id,
        expectedRevision: persistedProduct.revision
      });
    }

    return { status: "saved" };
  } catch (error) {
    return persistedProduct
      ? { status: "failed", persistedProduct, error }
      : { status: "failed", error };
  }
}
