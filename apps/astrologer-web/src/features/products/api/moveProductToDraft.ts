import { productResponseSchema, type ProductResponse } from "@elevenhouse/contracts";
import { application } from "../../../Application";

export async function moveProductToDraft(productId: string): Promise<ProductResponse> {
  return productResponseSchema.parse(
    await application.http.post(`/products/${productId}/move-to-draft`, undefined, {
      csrf: true
    })
  );
}
