import { productResponseSchema, type ProductResponse } from "@elevenhouse/contracts";
import { application } from "../../../Application";

export async function publishProduct(productId: string): Promise<ProductResponse> {
  return productResponseSchema.parse(
    await application.http.post(`/products/${productId}/publish`, undefined, { csrf: true })
  );
}
