import type { ProductResponse } from "@elevenhouse/contracts";
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
  editingProductId,
  publish,
  createProduct,
  updateProduct,
  publishProduct
}: PersistProductDraftInput): Promise<PersistProductDraftResult> {
  let persistedProduct: ProductResponse | undefined;

  try {
    persistedProduct = editingProductId
      ? await updateProduct({
          productId: editingProductId,
          body: toUpdateProductRequest(draft)
        })
      : await createProduct(toCreateProductRequest(draft));

    if (publish) {
      await publishProduct(persistedProduct.id);
    }

    return { status: "saved" };
  } catch {
    return persistedProduct ? { status: "failed", persistedProduct } : { status: "failed" };
  }
}
