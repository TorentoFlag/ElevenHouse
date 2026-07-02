import { productResponseSchema, type ProductResponse } from "@elevenhouse/contracts";
import { application } from "../../../Application";

export async function archiveProduct(productId: string): Promise<ProductResponse> {
  return productResponseSchema.parse(
    await application.http.post(`/products/${productId}/archive`, undefined, { csrf: true })
  );
}
