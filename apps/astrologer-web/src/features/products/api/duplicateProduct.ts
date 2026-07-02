import { productResponseSchema, type ProductResponse } from "@elevenhouse/contracts";
import { application } from "../../../Application";

export async function duplicateProduct(productId: string): Promise<ProductResponse> {
  return productResponseSchema.parse(
    await application.http.post(`/products/${productId}/duplicate`, undefined, { csrf: true })
  );
}
